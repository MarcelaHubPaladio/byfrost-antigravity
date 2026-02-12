import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

function isValidHex(hex: string) {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

function decodePalette(input: any) {
  const p = input ?? {};
  const keys = ["primary", "secondary", "tertiary", "quaternary"] as const;

  for (const k of keys) {
    const hex = String(p?.[k]?.hex ?? "");
    const text = String(p?.[k]?.text ?? "");
    if (!isValidHex(hex) || !isValidHex(text)) {
      throw new Error(`Invalid palette.${k} (expected hex + text as #RRGGBB)`);
    }
  }

  return {
    primary: { hex: String(p.primary.hex), text: String(p.primary.text) },
    secondary: { hex: String(p.secondary.hex), text: String(p.secondary.text) },
    tertiary: { hex: String(p.tertiary.hex), text: String(p.tertiary.text) },
    quaternary: { hex: String(p.quaternary.hex), text: String(p.quaternary.text) },
    source: String(p.source ?? "manual"),
  };
}

async function isTenantAdmin(userClient: ReturnType<typeof createClient>, tenantId: string) {
  const { data, error } = await userClient
    .from("users_profile")
    .select("role")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return String((data as any)?.role ?? "").toLowerCase() === "admin";
}

serve(async (req) => {
  const fn = "branding-set-palette";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !anonKey) {
      console.error(`[${fn}] Missing SUPABASE_URL or SUPABASE_ANON_KEY`);
      return new Response(JSON.stringify({ ok: false, error: "Missing env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.slice("bearer ".length).trim();

    // Verify caller using anon client (RLS-aware)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      console.warn(`[${fn}] auth.getUser failed`, { userErr });
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const caller = userData.user;
    const callerEmail = String(caller.email ?? "").toLowerCase();
    const isSuperAdmin = Boolean((caller.app_metadata as any)?.byfrost_super_admin);

    const body = await req.json().catch(() => null);
    if (!body) return new Response("Invalid JSON", { status: 400, headers: corsHeaders });

    const tenantId = String(body.tenantId ?? "").trim();
    if (!tenantId) {
      return new Response(JSON.stringify({ ok: false, error: "Missing tenantId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const palette = decodePalette(body.palette);

    // Authorization: super-admin OR tenant admin of that tenant
    if (!isSuperAdmin) {
      const ok = await isTenantAdmin(userClient, tenantId);
      if (!ok) {
        console.warn(`[${fn}] forbidden`, { callerEmail, tenantId });
        return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createSupabaseAdmin();

    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select("id, branding_json")
      .eq("id", tenantId)
      .maybeSingle();

    if (tErr || !tenant) {
      console.error(`[${fn}] tenant not found`, { tErr });
      return new Response(JSON.stringify({ ok: false, error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nextBranding = {
      ...(tenant.branding_json ?? {}),
      palette,
    };

    const { error: uErr } = await supabase
      .from("tenants")
      .update({ branding_json: nextBranding })
      .eq("id", tenantId);

    if (uErr) {
      console.error(`[${fn}] tenant update failed`, { uErr });
      return new Response(JSON.stringify({ ok: false, error: "Failed to update tenant" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.rpc("append_audit_ledger", {
      p_tenant_id: tenantId,
      p_payload: { kind: "tenant_palette_set", palette, by: callerEmail },
    });

    console.log(`[${fn}] palette updated`, { tenantId, by: callerEmail });

    return new Response(JSON.stringify({ ok: true, tenantId, palette }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[branding-set-palette] Unhandled error`, { e: String(e) });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
