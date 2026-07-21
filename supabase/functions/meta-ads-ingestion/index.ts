import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { decryptText } from "../_shared/encryption.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  // Can be called via pg_cron or manually by a super admin
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createSupabaseAdmin();
  const body = await req.json().catch(() => null);
  
  // Basic security: only run if it has a secret key or is called by pg_cron
  const auth = req.headers.get("Authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");
  // Assuming a cron secret is used. If not, this is just for internal service role calls.

  try {
    const { data: accounts, error: accErr } = await supabase
      .from("meta_ads_accounts")
      .select("id, tenant_id, ad_account_id, access_token_encrypted, is_active")
      .eq("is_active", true);

    if (accErr) throw accErr;
    if (!accounts || accounts.length === 0) {
      return json({ ok: true, message: "No active accounts" });
    }

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const results = [];

    for (const acc of accounts) {
      try {
        const token = await decryptText(acc.access_token_encrypted);
        
        // 1. Fetch active campaigns (or all campaigns to sync status)
        // using date_preset=last_7d to fetch campaigns that had delivery in the last 7 days
        const params = new URLSearchParams({
          fields: "campaign_id,campaign_name,ad_id,ad_name,spend,impressions,clicks,actions",
          level: "ad",
          time_increment: "1",
          date_preset: "last_90d",
          access_token: token,
        });

        // Use Insights API which gives us metrics AND campaign names for active ones
        const url = `https://graph.facebook.com/v19.0/${acc.ad_account_id}/insights?${params.toString()}`;
        const fbRes = await fetch(url);
        const fbJson = await fbRes.json();

        if (!fbRes.ok) {
          console.error(`[meta-ads-ingestion] Failed for account ${acc.ad_account_id}`, fbJson);
          results.push({ account: acc.ad_account_id, ok: false, error: fbJson?.error?.message });
          continue;
        }

        const data = fbJson.data || [];
        let campaignsProcessed = 0;
        let metricsProcessed = 0;

        for (const row of data) {
          const campId = row.campaign_id;
          const campName = row.campaign_name || "Campanha Desconhecida";
          const dateStart = row.date_start; // YYYY-MM-DD
          
          // Basic metrics
          const spend = parseFloat(row.spend || "0");
          const impressions = parseInt(row.impressions || "0", 10);
          const clicks = parseInt(row.clicks || "0", 10);
          
          // Parse actions for leads and purchases
          let leads = 0;
          let purchases = 0;
          if (Array.isArray(row.actions)) {
            for (const act of row.actions) {
              if (act.action_type === "lead") leads += parseInt(act.value || "0", 10);
              if (act.action_type === "purchase") purchases += parseInt(act.value || "0", 10);
            }
          }

          const adIdStr = row.ad_id;
          const adNameStr = row.ad_name || "Anúncio Desconhecido";

          // 1. Upsert Campaign
          const { data: campRow, error: campErr } = await supabase
            .from("meta_ads_campaigns")
            .upsert({
              meta_ads_account_id: acc.id,
              campaign_id: campId,
              name: campName,
              status: "ACTIVE", // From insights, it has delivery. We can sync real status later if needed.
              updated_at: new Date().toISOString()
            }, { onConflict: "meta_ads_account_id,campaign_id" })
            .select("id")
            .single();

          if (campErr) {
            console.error(`[meta-ads-ingestion] Failed to upsert campaign ${campId}`, campErr);
            continue;
          }
          campaignsProcessed++;

          // 1.5. Upsert Ad
          let adDbId = null;
          if (adIdStr) {
            const { data: adRow, error: adErr } = await supabase
              .from("meta_ads_ads")
              .upsert({
                meta_ads_campaign_id: campRow.id,
                ad_id: adIdStr,
                name: adNameStr,
                status: "ACTIVE",
                updated_at: new Date().toISOString()
              }, { onConflict: "meta_ads_campaign_id,ad_id" })
              .select("id")
              .single();
              
            if (!adErr && adRow) {
              adDbId = adRow.id;
            } else {
              console.error(`[meta-ads-ingestion] Failed to upsert ad ${adIdStr}`, adErr);
            }
          }

          // 2. Upsert Daily Metrics
          const { error: metricErr } = await supabase
            .from("meta_ads_metrics_daily")
            .upsert({
              campaign_id: campRow.id,
              meta_ads_ad_id: adDbId,
              date: dateStart,
              spend,
              impressions,
              clicks,
              leads,
              purchases,
              updated_at: new Date().toISOString()
            }, { onConflict: "campaign_id,meta_ads_ad_id,date" });

          if (metricErr) {
            console.error(`[meta-ads-ingestion] Failed to upsert metric for ${campId} on ${dateStart}`, metricErr);
          } else {
            metricsProcessed++;
          }
        }
        
        results.push({ account: acc.ad_account_id, ok: true, campaigns: campaignsProcessed, metrics: metricsProcessed });

      } catch (e: any) {
        console.error(`[meta-ads-ingestion] Unhandled error for account ${acc.ad_account_id}`, e);
        results.push({ account: acc.ad_account_id, ok: false, error: e.message });
      }
    }

    return json({ ok: true, results });
  } catch (e: any) {
    console.error("[meta-ads-ingestion] global error", e);
    return json({ ok: false, error: e.message }, 500);
  }
});
