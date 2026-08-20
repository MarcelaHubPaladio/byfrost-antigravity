import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

type RoleKey = string;

type GenerateLinkType = "invite" | "magiclink" | "recovery";

function normalizePhone(v: any): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.startsWith("+")) return s;
  const digits = s.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

function isAlreadyRegisteredError(message: string) {
  const msg = (message ?? "").toLowerCase();
  return msg.includes("already") && (msg.includes("registered") || msg.includes("exists"));
}

function deriveResetRedirectTo(redirectTo: string | null) {
  if (!redirectTo) return null;
  try {
    const u = new URL(redirectTo);
    return `${u.origin}/auth/reset`;
  } catch {
    return null;
  }
}

function randomTempPassword() {
  // Simple, copyable, strong enough for a temporary password.
  // User will be encouraged to change it on first access.
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const raw = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "A")
    .replace(/\//g, "b")
    .replace(/=/g, "");
  return `Byfrost-${raw.slice(0, 18)}`;
}

async function findUserIdByEmail(supabase: any, email: string) {
  const target = email.trim().toLowerCase();
  // Avoid heavy scans: iterate a few pages (enough for typical MVP user counts).
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = (data?.users ?? []).find((u: any) => String(u.email ?? "").toLowerCase() === target);
    if (found?.id) return String(found.id);
    if ((data?.users ?? []).length < 200) break;
  }
  return null;
}

serve(async (req) => {
  const fn = "admin-invite-user";

  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    // Manual auth handling (verify_jwt is false)
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createSupabaseAdmin();

    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      console.error(`[${fn}] auth.getUser failed`, { authErr });
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const caller = authData.user;
    const isSuperAdmin = Boolean(
      (caller.app_metadata as any)?.byfrost_super_admin || (caller.app_metadata as any)?.super_admin
    );

    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = String(body.tenantId ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "").trim() as RoleKey;
    const displayName = String(body.displayName ?? "").trim() || null;
    const phoneE164 = normalizePhone(body.phoneE164);
    const redirectTo = typeof body.redirectTo === "string" ? body.redirectTo.trim() : "";

    if (!tenantId || !email || !role) {
      return new Response(JSON.stringify({ ok: false, error: "Missing tenantId/email/role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate that the role exists and is enabled for the tenant
    const { data: roleRow, error: roleErr } = await supabase
      .from("tenant_roles")
      .select("role_id, enabled, roles(key)")
      .eq("tenant_id", tenantId)
      .eq("enabled", true)
      .eq("roles.key", role)
      .limit(1)
      .maybeSingle();

    if (roleErr) {
      console.error(`[${fn}] role validation failed`, { roleErr });
      return new Response(JSON.stringify({ ok: false, error: roleErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!roleRow?.role_id) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid role for tenant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- NEW flow for email/password ---
    // Create user with a temporary random password when it doesn't exist.
    // If user already exists, we keep it and provide a password reset link.
    let userId: string | null = null;
    let tempPassword: string | null = null;
    let createdNewUser = false;

    const tmp = randomTempPassword();
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: tmp,
      email_confirm: true,
      user_metadata: displayName ? { full_name: displayName } : undefined,
    } as any);

    if (createErr || !created?.user) {
      const msg = String(createErr?.message ?? "");
      if (!isAlreadyRegisteredError(msg)) {
        console.error(`[${fn}] createUser failed`, { createErr });
        return new Response(JSON.stringify({ ok: false, error: msg || "Create user failed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Existing user: find by email
      userId = await findUserIdByEmail(supabase, email);
      if (!userId) {
        return new Response(
          JSON.stringify({ ok: false, error: "User exists but could not be resolved by email" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      userId = created.user.id;
      tempPassword = tmp;
      createdNewUser = true;
    }

    // Ensure membership in tenant
    const { error: profErr } = await supabase
      .from("users_profile")
      .upsert(
        {
          user_id: userId,
          tenant_id: tenantId,
          role,
          display_name: displayName,
          phone_e164: phoneE164,
          email,
          deleted_at: null,
        } as any,
        { onConflict: "user_id,tenant_id" }
      );

    if (profErr) {
      console.error(`[${fn}] users_profile upsert failed`, { profErr });
      return new Response(JSON.stringify({ ok: false, error: profErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Provide a password reset link for first access (preferred over sharing temp password).
    const resetRedirectTo = deriveResetRedirectTo(redirectTo) || redirectTo || undefined;
    let passwordResetLink: string | null = null;

    const { data: recData, error: recErr } = await supabase.auth.admin.generateLink({
      type: "recovery" as GenerateLinkType,
      email,
      options: resetRedirectTo ? { redirectTo: resetRedirectTo } : undefined,
    } as any);

    if (recErr || !(recData as any)?.properties?.action_link) {
      console.warn(`[${fn}] generateLink(recovery) failed (ignored)`, { recErr: recErr?.message ?? null });
    } else {
      passwordResetLink = (recData as any).properties.action_link as string;
    }

    // Store for later retrieval in the admin panel (use invite_link field to keep schema simple)
    const { error: invErr } = await supabase.from("user_invites").insert({
      tenant_id: tenantId,
      user_id: userId,
      email,
      sent_email: false,
      invite_link: passwordResetLink,
      created_by_user_id: caller.id,
    } as any);

    if (invErr) {
      console.warn(`[${fn}] user_invites insert failed (ignored)`, { invErr });
    }

    // Back-compat: keep vendors/leaders tables in sync when role is vendor/leader.
    if (phoneE164 && (role === "vendor" || role === "leader")) {
      const table = role === "vendor" ? "vendors" : "leaders";
      
      // Prevent generic phone numbers (like +55 or +1) from causing massive collisions in the upsert.
      // If the normalized phone is suspiciously short, we append a random UUID so it becomes unique,
      // forcing the upsert to behave like a clean insert instead of overwriting a valid old record.
      let safePhoneE164 = phoneE164;
      if (safePhoneE164.length <= 4) {
        safePhoneE164 = `${safePhoneE164}_fake_${crypto.randomUUID().slice(0, 8)}`;
      }

      const payload = {
        tenant_id: tenantId,
        phone_e164: safePhoneE164,
        display_name: displayName,
        active: true,
        deleted_at: null,
      };

      const { error: upErr } = await supabase.from(table).upsert(payload as any, { onConflict: "tenant_id,phone_e164" });

      if (upErr) {
        console.warn(`[${fn}] ${table} upsert failed (ignored)`, { upErr });
      }
    }

    console.log(`[${fn}] provisioned user`, {
      tenantId,
      userId,
      role,
      email,
      createdNewUser,
      hasResetLink: Boolean(passwordResetLink),
    });

    return new Response(
      JSON.stringify({
        ok: true,
        userId,
        createdNewUser,
        tempPassword,
        passwordResetLink,
        // Back-compat fields used by the UI
        sentEmail: false,
        inviteLink: passwordResetLink,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error(`[admin-invite-user] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});