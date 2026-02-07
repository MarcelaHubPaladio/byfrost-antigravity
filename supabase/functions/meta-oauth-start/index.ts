import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400, extra?: any) {
  return json({ ok: false, error: message, ...(extra ?? {}) }, status);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return err("unauthorized", 401);
    const token = auth.slice("Bearer ".length).trim();

    const body = await req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    if (!tenantId) return err("missing_tenantId", 400);

    const appId = Deno.env.get("META_APP_ID") ?? "";
    const callbackUrl = Deno.env.get("META_OAUTH_CALLBACK_URL") ?? "";
    if (!appId || !callbackUrl) {
      console.error("[meta-oauth-start] missing Meta env", {
        hasAppId: Boolean(appId),
        hasCallbackUrl: Boolean(callbackUrl),
      });
      return err("missing_meta_oauth_env", 500);
    }

    const supabase = createSupabaseAdmin();

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      console.error("[meta-oauth-start] auth.getUser failed", { error: userErr?.message });
      return err("unauthorized", 401);
    }

    const userId = userRes.user.id;

    // Tenant membership check (multi-tenant boundary)
    const { data: membership, error: memErr } = await supabase
      .from("users_profile")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (memErr) {
      console.error("[meta-oauth-start] membership query failed", { error: memErr.message });
      return err("forbidden", 403);
    }

    // Super-admin bypass: membership might not exist.
    const isSuperAdmin = Boolean(
      (userRes.user.app_metadata as any)?.byfrost_super_admin ||
        (userRes.user.app_metadata as any)?.super_admin
    );

    if (!membership && !isSuperAdmin) return err("forbidden", 403);

    const state = crypto.randomUUID() + "." + crypto.getRandomValues(new Uint32Array(2)).join("-");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insErr } = await supabase.from("meta_oauth_states").insert({
      tenant_id: tenantId,
      state,
      created_by_user_id: userId,
      status: "PENDING_CODE",
      expires_at: expiresAt,
    });

    if (insErr) {
      console.error("[meta-oauth-start] failed to insert oauth state", {
        error: insErr.message,
      });
      // NOTE: returning details here is safe; it helps diagnose missing migrations/table.
      return err("failed_to_create_state", 500, { details: insErr.message });
    }

    // Permissions (Phase 3/4 ready)
    const scope = [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_metadata",
      "instagram_basic",
      "instagram_manage_insights",
      "instagram_content_publish",
    ].join(",");

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: callbackUrl,
      state,
      response_type: "code",
      scope,
    });

    const url = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;

    console.log("[meta-oauth-start] created oauth start", { tenantId, userId });

    return json({ ok: true, url });
  } catch (e: any) {
    console.error("[meta-oauth-start] unhandled", { error: e?.message ?? String(e) });
    return err("internal_error", 500, { details: e?.message ?? String(e) });
  }
});