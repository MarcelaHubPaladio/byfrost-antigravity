import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

type RoleKey = string;

function normalizePhone(v: any): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.startsWith("+")) return s;
  const digits = s.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
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

    // Primary path: send the invite email.
    const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email);

    // Fallback path: if email sending is failing (common when SMTP isn't configured),
    // generate an invite link and return it so the admin can share manually.
    if (inviteErr || !invited?.user) {
      console.error(`[${fn}] inviteUserByEmail failed`, { inviteErr });

      const shouldFallbackToLink = Boolean(inviteErr?.message?.toLowerCase().includes("error sending invite email"));

      if (!shouldFallbackToLink) {
        return new Response(
          JSON.stringify({ ok: false, error: inviteErr?.message ?? "Invite failed", code: (inviteErr as any)?.code ?? null }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      console.warn(`[${fn}] falling back to admin.generateLink(type=invite)`, {
        email,
        redirectTo: redirectTo || null,
      });

      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: "invite",
        email,
        options: redirectTo ? { redirectTo } : undefined,
      } as any);

      if (linkErr || !linkData?.user || !(linkData as any)?.properties?.action_link) {
        console.error(`[${fn}] generateLink failed`, { linkErr });
        return new Response(
          JSON.stringify({
            ok: false,
            error: linkErr?.message ?? "Invite failed (SMTP + link generation)",
            code: (linkErr as any)?.code ?? null,
            hint:
              "Parece que o SMTP do Supabase não está configurado. Configure um provedor SMTP (Auth → Email) ou use o link manual.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const userId = linkData.user.id;
      const inviteLink = (linkData as any).properties.action_link as string;

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

      // Back-compat: keep vendors/leaders tables in sync when role is vendor/leader.
      if (phoneE164 && (role === "vendor" || role === "leader")) {
        const table = role === "vendor" ? "vendors" : "leaders";
        const payload = {
          tenant_id: tenantId,
          phone_e164: phoneE164,
          display_name: displayName,
          active: true,
          deleted_at: null,
        };

        const { error: upErr } = await supabase.from(table).upsert(payload as any, { onConflict: "tenant_id,phone_e164" });

        if (upErr) {
          console.warn(`[${fn}] ${table} upsert failed (ignored)`, { upErr });
        }
      }

      console.log(`[${fn}] invited user (manual link)`, { tenantId, userId, role, email });

      return new Response(JSON.stringify({ ok: true, userId, sentEmail: false, inviteLink }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = invited.user.id;

    const { error: profErr } = await supabase
      .from("users_profile")
      .upsert(
        {
          user_id: userId,
          tenant_id: tenantId,
          role, // users_profile.role guarda a key do cargo
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

    // Back-compat: keep vendors/leaders tables in sync when role is vendor/leader.
    if (phoneE164 && (role === "vendor" || role === "leader")) {
      const table = role === "vendor" ? "vendors" : "leaders";
      const payload = {
        tenant_id: tenantId,
        phone_e164: phoneE164,
        display_name: displayName,
        active: true,
        deleted_at: null,
      };

      const { error: upErr } = await supabase.from(table).upsert(payload as any, { onConflict: "tenant_id,phone_e164" });

      if (upErr) {
        console.warn(`[${fn}] ${table} upsert failed (ignored)`, { upErr });
      }
    }

    console.log(`[${fn}] invited user`, { tenantId, userId, role, email });

    return new Response(JSON.stringify({ ok: true, userId, sentEmail: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[admin-invite-user] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});