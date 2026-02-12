import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const BUCKET = "tenant-assets";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ ok: false, error: message }, status);
}

function getInput(req: Request) {
  const url = new URL(req.url);
  const fromQuery = {
    tenant_slug: url.searchParams.get("tenant_slug") ?? undefined,
    campaign_id: url.searchParams.get("campaign_id") ?? undefined,
  };
  return fromQuery;
}

serve(async (req) => {
  const fn = "public-campaign-ranking";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "GET") return err("method_not_allowed", 405);

    const { tenant_slug, campaign_id } = getInput(req);

    const tenantSlug = String(tenant_slug ?? "").trim();
    const campaignId = String(campaign_id ?? "").trim();

    if (!tenantSlug || !campaignId) return err("missing_params", 400);

    const supabase = createSupabaseAdmin();

    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select("id, slug")
      .eq("slug", tenantSlug)
      .maybeSingle();

    if (tErr || !tenant) {
      return err("tenant_not_found", 404);
    }

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("id, tenant_id, visibility")
      .eq("id", campaignId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (cErr || !campaign) return err("campaign_not_found", 404);
    if (campaign.visibility !== "public") return err("forbidden", 403);

    const { data: rankingRows, error: rErr } = await supabase
      .from("campaign_ranking")
      .select("participant_id, score, rank, tenant_id, campaign_id")
      .eq("tenant_id", tenant.id)
      .eq("campaign_id", campaignId)
      .order("rank", { ascending: true })
      .limit(10);

    if (rErr) {
      console.error(`[${fn}] ranking query failed`, { error: rErr.message, tenantSlug, campaignId });
      return err("ranking_query_failed", 500);
    }

    const participantIds = (rankingRows ?? []).map((r: any) => r.participant_id).filter(Boolean);

    const participantsById = new Map<
      string,
      { display_name: string | null; photo_path: string | null }
    >();

    if (participantIds.length) {
      const { data: participants, error: pErr } = await supabase
        .from("incentive_participants")
        .select("id, name, display_name, photo_url")
        .in("id", participantIds);

      if (pErr) {
        console.error(`[${fn}] participants query failed`, { error: pErr.message, tenantSlug, campaignId });
        return err("participants_query_failed", 500);
      }

      for (const p of participants ?? []) {
        const displayName = (p.display_name ?? p.name ?? null) as string | null;
        participantsById.set(String(p.id), {
          display_name: displayName,
          photo_path: (p.photo_url ?? null) as string | null,
        });
      }
    }

    const signedUrlByPath = new Map<string, string>();
    const uniquePaths = Array.from(
      new Set(
        (rankingRows ?? [])
          .map((r: any) => participantsById.get(String(r.participant_id))?.photo_path)
          .filter((p): p is string => Boolean(p))
      )
    );

    await Promise.all(
      uniquePaths.map(async (path) => {
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
        if (!error && data?.signedUrl) signedUrlByPath.set(path, data.signedUrl);
      })
    );

    const items = (rankingRows ?? []).map((r: any) => {
      const pid = String(r.participant_id);
      const p = participantsById.get(pid);
      const photoPath = p?.photo_path ?? null;

      return {
        display_name: p?.display_name ?? "Participante",
        photo_url: photoPath ? signedUrlByPath.get(photoPath) ?? null : null,
        score: Number(r.score ?? 0),
        position: Number(r.rank ?? 0),
      };
    });

    return json({ ok: true, items, updated_at: new Date().toISOString() });
  } catch (e: any) {
    console.error(`[${fn}] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
