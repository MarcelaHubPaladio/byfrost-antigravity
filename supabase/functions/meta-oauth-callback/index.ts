import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { encryptText, decryptText } from "../_shared/encryption.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400, extra?: any) {
  return json({ ok: false, error: message, ...extra }, status);
}

function redirect(url: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
}

type Candidate = {
  fb_page_id: string;
  fb_page_name: string;
  ig_business_account_id: string;
  ig_username: string | null;
  access_token_encrypted: string;
  token_expires_at: string | null;
  scopes: string[] | null;
};

type CandidateAds = {
  ad_account_id: string;
  name: string;
  currency: string;
  timezone: string;
  access_token_encrypted: string;
  token_expires_at: string | null;
  scopes: string[] | null;
};

async function metaFetchJson(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  let jsonBody: any = null;
  try {
    jsonBody = text ? JSON.parse(text) : null;
  } catch {
    jsonBody = null;
  }

  if (!res.ok) {
    const msg = jsonBody?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return jsonBody;
}

async function exchangeCodeForUserToken({
  appId,
  appSecret,
  callbackUrl,
  code,
}: {
  appId: string;
  appSecret: string;
  callbackUrl: string;
  code: string;
}) {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: callbackUrl,
    client_secret: appSecret,
    code,
  });

  const url = `https://graph.facebook.com/v19.0/oauth/access_token?${params.toString()}`;
  return await metaFetchJson(url);
}

async function debugToken({
  appId,
  appSecret,
  inputToken,
}: {
  appId: string;
  appSecret: string;
  inputToken: string;
}) {
  const appAccessToken = `${appId}|${appSecret}`;
  const params = new URLSearchParams({
    input_token: inputToken,
    access_token: appAccessToken,
  });
  const url = `https://graph.facebook.com/v19.0/debug_token?${params.toString()}`;
  return await metaFetchJson(url);
}

async function listPages(userAccessToken: string) {
  const params = new URLSearchParams({
    fields: "id,name,access_token",
    access_token: userAccessToken,
  });
  const url = `https://graph.facebook.com/v19.0/me/accounts?${params.toString()}`;
  const jsonBody = await metaFetchJson(url);
  return (jsonBody?.data ?? []) as Array<{ id: string; name: string; access_token: string }>;
}

async function listAdAccounts(userAccessToken: string) {
  const params = new URLSearchParams({
    fields: "id,name,account_id,currency,timezone_name",
    access_token: userAccessToken,
  });
  const url = `https://graph.facebook.com/v19.0/me/adaccounts?${params.toString()}`;
  const jsonBody = await metaFetchJson(url);
  return (jsonBody?.data ?? []) as Array<{ id: string; name?: string; account_id: string; currency?: string; timezone_name?: string }>;
}

async function pageIgInfo(pageId: string, pageAccessToken: string) {
  const params = new URLSearchParams({
    fields: "name,instagram_business_account{id,username},connected_instagram_account{id,username}",
    access_token: pageAccessToken,
  });
  const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}?${params.toString()}`;
  return await metaFetchJson(url);
}

async function ensureMembership({
  supabase,
  userToken,
  tenantId,
}: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  userToken: string;
  tenantId: string;
}) {
  const { data: userRes, error: userErr } = await supabase.auth.getUser(userToken);
  if (userErr || !userRes?.user) return { ok: false as const, error: "unauthorized" };

  const userId = userRes.user.id;

  const { data: membership, error: memErr } = await supabase
    .from("users_profile")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (memErr) return { ok: false as const, error: "forbidden" };

  const isSuperAdmin = Boolean(
    (userRes.user.app_metadata as any)?.byfrost_super_admin || (userRes.user.app_metadata as any)?.super_admin
  );

  if (!membership && !isSuperAdmin) return { ok: false as const, error: "forbidden" };

  return { ok: true as const, userId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createSupabaseAdmin();

  try {
    // --------------------------------------
    // POST (called from app UI)
    // --------------------------------------
    if (req.method === "POST") {
      const auth = req.headers.get("Authorization") ?? "";
      if (!auth.startsWith("Bearer ")) return err("unauthorized", 401);
      const userToken = auth.slice("Bearer ".length).trim();

      const body = await req.json().catch(() => null);
      const action = String(body?.action ?? "").trim();
      const state = String(body?.state ?? "").trim();
      if (!action || !state) return err("missing_params", 400);
      
      const isAds = state.startsWith("ads.");

      const { data: stRow, error: stErr } = await supabase
        .from("meta_oauth_states")
        .select("id,tenant_id,state,status,candidates_json,expires_at")
        .eq("state", state)
        .maybeSingle();

      if (stErr || !stRow) return err("invalid_state", 400);

      if (new Date(stRow.expires_at).getTime() < Date.now()) {
        await supabase.from("meta_oauth_states").update({ status: "EXPIRED" }).eq("id", stRow.id);
        return err("state_expired", 400);
      }

      const membership = await ensureMembership({ supabase, userToken, tenantId: stRow.tenant_id });
      if (!membership.ok) return err(membership.error, membership.error === "unauthorized" ? 401 : 403);

      if (action === "list") {
        const candidates = Array.isArray(stRow.candidates_json) ? stRow.candidates_json : [];
        if (isAds) {
          const safe = candidates.map((c: any) => ({
            ad_account_id: c.ad_account_id,
            name: c.name,
            currency: c.currency,
            timezone: c.timezone,
          }));
          return json({ ok: true, candidates: safe, status: stRow.status });
        } else {
          const safe = candidates.map((c: any) => ({
            fb_page_id: c.fb_page_id,
            fb_page_name: c.fb_page_name,
            ig_business_account_id: c.ig_business_account_id,
            ig_username: c.ig_username ?? null,
          }));
          return json({ ok: true, candidates: safe, status: stRow.status });
        }
      }

      if (action === "select") {
        const candidates = Array.isArray(stRow.candidates_json) ? (stRow.candidates_json as any[]) : [];
        
        if (isAds) {
          const adAccountId = String(body?.ad_account_id ?? "").trim();
          if (!adAccountId) return err("missing_ad_account_id", 400);
          
          const chosen = candidates.find((c) => String(c?.ad_account_id ?? "") === adAccountId);
          if (!chosen) return err("candidate_not_found", 404);
          if (!chosen.access_token_encrypted) return err("candidate_missing_token", 400);

          const upsertRow = {
            tenant_id: stRow.tenant_id,
            ad_account_id: String(chosen.ad_account_id),
            name: String(chosen.name || "Ad Account"),
            currency: chosen.currency ? String(chosen.currency) : null,
            timezone: chosen.timezone ? String(chosen.timezone) : null,
            access_token_encrypted: String(chosen.access_token_encrypted),
            token_expires_at: chosen.token_expires_at ? String(chosen.token_expires_at) : null,
            is_active: true,
          };

          const { error: upErr } = await supabase
            .from("meta_ads_accounts")
            .upsert(upsertRow as any, { onConflict: "tenant_id,ad_account_id" });

          if (upErr) {
            console.error("[meta-oauth-callback] upsert meta_ads_accounts failed", { error: upErr.message });
            return err("failed_to_save_account", 500);
          }
        } else {
          const fbPageId = String(body?.fb_page_id ?? "").trim();
          if (!fbPageId) return err("missing_fb_page_id", 400);
          
          const chosen = candidates.find((c) => String(c?.fb_page_id ?? "") === fbPageId);
          if (!chosen) return err("candidate_not_found", 404);
          if (!chosen.access_token_encrypted) return err("candidate_missing_token", 400);

          const upsertRow = {
            tenant_id: stRow.tenant_id,
            fb_page_id: String(chosen.fb_page_id),
            fb_page_name: String(chosen.fb_page_name),
            ig_business_account_id: String(chosen.ig_business_account_id),
            ig_username: chosen.ig_username ? String(chosen.ig_username) : null,
            access_token_encrypted: String(chosen.access_token_encrypted),
            token_expires_at: chosen.token_expires_at ? String(chosen.token_expires_at) : null,
            scopes: chosen.scopes ?? null,
            is_active: true,
          };

          const { error: upErr } = await supabase
            .from("meta_accounts")
            .upsert(upsertRow as any, { onConflict: "tenant_id,fb_page_id" });

          if (upErr) {
            console.error("[meta-oauth-callback] upsert meta_accounts failed", { error: upErr.message });
            return err("failed_to_save_account", 500);
          }
        }

        await supabase.from("meta_oauth_states").update({ status: "COMPLETED" }).eq("id", stRow.id);

        return json({ ok: true });
      }

      return err("unknown_action", 400);
    }

    // --------------------------------------
    // GET (OAuth callback from Meta)
    // --------------------------------------
    if (req.method === "GET") {
      const url = new URL(req.url);
      const code = url.searchParams.get("code") ?? "";
      const state = url.searchParams.get("state") ?? "";
      const isAds = state.startsWith("ads.");
      const redirectPath = isAds ? "/app/integrations/meta-ads" : "/app/integrations/meta";

      const appId = Deno.env.get("META_APP_ID") ?? "";
      const appSecret = Deno.env.get("META_APP_SECRET") ?? "";
      const callbackUrl = Deno.env.get("META_OAUTH_CALLBACK_URL") ?? "";
      const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";

      if (!appId || !appSecret || !callbackUrl || !appBaseUrl) {
        return err("missing_meta_oauth_env", 500);
      }

      if (!code || !state) {
        return redirect(`${appBaseUrl}${redirectPath}?error=missing_code_or_state`);
      }

      const { data: stRow, error: stErr } = await supabase
        .from("meta_oauth_states")
        .select("id,tenant_id,state,status,expires_at")
        .eq("state", state)
        .maybeSingle();

      if (stErr || !stRow) {
        return redirect(`${appBaseUrl}${redirectPath}?error=invalid_state`);
      }

      if (new Date(stRow.expires_at).getTime() < Date.now()) {
        await supabase.from("meta_oauth_states").update({ status: "EXPIRED" }).eq("id", stRow.id);
        return redirect(`${appBaseUrl}${redirectPath}?error=state_expired`);
      }

      // Exchange OAuth code
      const tok = await exchangeCodeForUserToken({ appId, appSecret, callbackUrl, code });
      const userAccessToken = String(tok?.access_token ?? "");
      if (!userAccessToken) {
        return redirect(`${appBaseUrl}${redirectPath}?error=token_exchange_failed`);
      }

      // We need token details for expiry
      const dbg = await debugToken({ appId, appSecret, inputToken: userAccessToken }).catch(() => null);
      const scopes = Array.isArray(dbg?.data?.scopes) ? (dbg.data.scopes as string[]) : null;
      const expiresAtUnix = typeof dbg?.data?.expires_at === "number" ? (dbg.data.expires_at as number) : null;
      const tokenExpiresAt = expiresAtUnix ? new Date(expiresAtUnix * 1000).toISOString() : null;
      const encryptedUserToken = await encryptText(userAccessToken);

      if (isAds) {
        // Ads Flow
        const adAccounts = await listAdAccounts(userAccessToken);
        const candidates: CandidateAds[] = adAccounts.map(a => ({
          ad_account_id: a.id,
          name: a.name || a.account_id,
          currency: a.currency || "BRL",
          timezone: a.timezone_name || "America/Sao_Paulo",
          access_token_encrypted: encryptedUserToken,
          token_expires_at: tokenExpiresAt,
          scopes,
        }));

        if (candidates.length === 0) {
          return redirect(`${appBaseUrl}${redirectPath}?error=no_ad_accounts_found`);
        }

        if (candidates.length === 1) {
          const c = candidates[0];
          const { error: upErr } = await supabase
            .from("meta_ads_accounts")
            .upsert(
              {
                tenant_id: stRow.tenant_id,
                ad_account_id: c.ad_account_id,
                name: c.name,
                currency: c.currency,
                timezone: c.timezone,
                access_token_encrypted: c.access_token_encrypted,
                token_expires_at: c.token_expires_at,
                is_active: true,
              } as any,
              { onConflict: "tenant_id,ad_account_id" }
            );

          if (upErr) return redirect(`${appBaseUrl}${redirectPath}?error=failed_to_save_account`);
          await supabase.from("meta_oauth_states").update({ status: "COMPLETED" }).eq("id", stRow.id);
          return redirect(`${appBaseUrl}${redirectPath}?connected=1`);
        }

        await supabase
          .from("meta_oauth_states")
          .update({ status: "PENDING_SELECTION", candidates_json: candidates as any })
          .eq("id", stRow.id);

        return redirect(`${appBaseUrl}${redirectPath}?state=${encodeURIComponent(state)}`);
      } else {
        // Pages/Instagram Flow
        const pages = await listPages(userAccessToken);
        const candidates: Candidate[] = [];

        for (const p of pages) {
          if (!p?.id || !p?.access_token) continue;

          const info = await pageIgInfo(p.id, p.access_token).catch(() => null);
          if (!info) continue;

          const ig = info.instagram_business_account ?? info.connected_instagram_account ?? null;
          const igId = String(ig?.id ?? "").trim();
          if (!igId) continue;

          const pageDbg = await debugToken({ appId, appSecret, inputToken: p.access_token }).catch(() => null);
          const pageScopes = Array.isArray(pageDbg?.data?.scopes) ? (pageDbg.data.scopes as string[]) : null;
          const pageExpiresAtUnix = typeof pageDbg?.data?.expires_at === "number" ? (pageDbg.data.expires_at as number) : null;
          const pageTokenExpiresAt = pageExpiresAtUnix ? new Date(pageExpiresAtUnix * 1000).toISOString() : null;

          candidates.push({
            fb_page_id: String(p.id),
            fb_page_name: String(p.name ?? info.name ?? "Página"),
            ig_business_account_id: igId,
            ig_username: ig?.username ? String(ig.username) : null,
            access_token_encrypted: await encryptText(String(p.access_token)),
            token_expires_at: pageTokenExpiresAt,
            scopes: pageScopes,
          });
        }

        if (candidates.length === 0) {
          return redirect(`${appBaseUrl}${redirectPath}?error=no_ig_connected`);
        }

        if (candidates.length === 1) {
          const c = candidates[0];
          const { error: upErr } = await supabase
            .from("meta_accounts")
            .upsert(
              {
                tenant_id: stRow.tenant_id,
                fb_page_id: c.fb_page_id,
                fb_page_name: c.fb_page_name,
                ig_business_account_id: c.ig_business_account_id,
                ig_username: c.ig_username,
                access_token_encrypted: c.access_token_encrypted,
                token_expires_at: c.token_expires_at,
                scopes: c.scopes,
                is_active: true,
              } as any,
              { onConflict: "tenant_id,fb_page_id" }
            );

          if (upErr) return redirect(`${appBaseUrl}${redirectPath}?error=failed_to_save_account`);
          await supabase.from("meta_oauth_states").update({ status: "COMPLETED" }).eq("id", stRow.id);
          return redirect(`${appBaseUrl}${redirectPath}?connected=1`);
        }

        await supabase
          .from("meta_oauth_states")
          .update({ status: "PENDING_SELECTION", candidates_json: candidates as any })
          .eq("id", stRow.id);

        return redirect(`${appBaseUrl}${redirectPath}?state=${encodeURIComponent(state)}`);
      }
    }

    return err("method_not_allowed", 405);
  } catch (e: any) {
    console.error("[meta-oauth-callback] unhandled", { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
