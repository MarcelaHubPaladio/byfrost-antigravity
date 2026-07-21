import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { encryptText } from "../_shared/encryption.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400, extra?: any) {
  return json({ ok: false, error: message, ...extra }, status);
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
    const adAccountIdRaw = String(body?.adAccountId ?? "").trim();
    const name = String(body?.name ?? "Conta de Anúncios").trim();
    const accessToken = String(body?.accessToken ?? "").trim();

    if (!tenantId || !adAccountIdRaw || !accessToken) {
      return err("missing_fields", 400);
    }

    // Ensure adAccountId starts with act_
    const adAccountId = adAccountIdRaw.startsWith("act_") ? adAccountIdRaw : `act_${adAccountIdRaw}`;

    const supabase = createSupabaseAdmin();

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return err("unauthorized", 401);

    const userId = userRes.user.id;

    const { data: membership, error: memErr } = await supabase
      .from("users_profile")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (memErr) return err("forbidden", 403);

    const isSuperAdmin = Boolean(
      (userRes.user.app_metadata as any)?.byfrost_super_admin || (userRes.user.app_metadata as any)?.super_admin
    );

    if (!membership && !isSuperAdmin) return err("forbidden", 403);

    // Validate token with Meta and fetch account details
    const params = new URLSearchParams({
      fields: "id,name,account_id,currency,timezone_name",
      access_token: accessToken,
    });
    const fbRes = await fetch(`https://graph.facebook.com/v19.0/${adAccountId}?${params.toString()}`);
    const fbJson = await fbRes.json().catch(() => null);

    if (!fbRes.ok) {
      const msg = fbJson?.error?.message || "Token ou ID inválido.";
      return err("meta_api_error", 400, { details: msg });
    }

    const currency = fbJson.currency || "BRL";
    const timezone = fbJson.timezone_name || "America/Sao_Paulo";

    const encrypted = await encryptText(accessToken);

    const upsertRow = {
      tenant_id: tenantId,
      ad_account_id: adAccountId,
      name,
      currency,
      timezone,
      access_token_encrypted: encrypted,
      is_active: true,
    };

    const { error: upErr } = await supabase
      .from("meta_ads_accounts")
      .upsert(upsertRow, { onConflict: "tenant_id,ad_account_id" });

    if (upErr) {
      console.error("[meta-ads-manual-connect] db upsert error", upErr);
      return err("db_error", 500, { details: upErr.message });
    }

    return json({ ok: true });
  } catch (e: any) {
    console.error("[meta-ads-manual-connect] unhandled", e);
    return err("internal_error", 500, { details: e.message });
  }
});
