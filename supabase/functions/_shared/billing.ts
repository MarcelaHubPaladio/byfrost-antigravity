import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export async function checkTenantAILimits(tenantId: string, supabaseAdmin: SupabaseClient): Promise<void> {
  // 1. Fetch current plan limit
  const { data: tp, error: tpErr } = await supabaseAdmin
    .from("tenant_plans")
    .select("plans ( limits_json )")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tpErr) {
    console.error(`[checkTenantAILimits] Error fetching tenant plans: ${tpErr.message}`);
    // Non-blocking if there's a DB issue just to not break production unexpectedly,
    // but ideally we should throw. Let's just log and allow for now.
    return;
  }

  // Get the limit. If not found or null, we treat as unlimited.
  const limitStr = (tp?.plans as any)?.limits_json?.ai_tokens;
  if (limitStr === undefined || limitStr === null) {
    return; // Unlimited
  }

  const limitTokens = Number(limitStr);
  if (isNaN(limitTokens) || limitTokens <= 0) {
    return; // Unlimited or invalid limit
  }

  // 2. Fetch current month's usage
  const periodStart = new Date();
  periodStart.setDate(1);
  const periodStartDate = periodStart.toISOString().slice(0, 10);

  const { data: counter, error: counterErr } = await supabaseAdmin
    .from("usage_counters")
    .select("metrics_json")
    .eq("tenant_id", tenantId)
    .eq("period_start", periodStartDate)
    .maybeSingle();

  if (counterErr) {
    console.error(`[checkTenantAILimits] Error fetching usage_counters: ${counterErr.message}`);
    return; // Allow on error
  }

  const currentUsage = Number((counter?.metrics_json as any)?.ai_tokens || 0);

  // 3. Compare and throw if exceeded
  if (currentUsage >= limitTokens) {
    throw new Error("Plan limits exceeded");
  }
}

export async function logAITokenUsage(
  tenantId: string,
  tokensUsed: number,
  description: string,
  model: string,
  supabaseAdmin: SupabaseClient,
  refType: string = "guardiao_insight",
  refId: string | null = null
) {
  if (tokensUsed <= 0) return;

  const costUsd = tokensUsed * 0.0000003;
  const { error: usageErr } = await supabaseAdmin.from("usage_events").insert({
    tenant_id: tenantId,
    type: "ai_token",
    qty: tokensUsed,
    ref_type: refType,
    ref_id: refId,
    occurred_at: new Date().toISOString(),
    meta_json: {
      description,
      cost_usd: costUsd,
      model: model,
    },
  });

  if (usageErr) {
    console.error("[logAITokenUsage] Failed to insert usage_event:", usageErr);
  }

  const periodStart = new Date();
  periodStart.setDate(1);
  const periodStartDate = periodStart.toISOString().slice(0, 10);

  const { data: counter } = await supabaseAdmin
    .from("usage_counters")
    .select("id, metrics_json")
    .eq("tenant_id", tenantId)
    .eq("period_start", periodStartDate)
    .maybeSingle();

  if (counter) {
    const currentTokens = Number((counter.metrics_json as any)?.ai_tokens || 0);
    await supabaseAdmin
      .from("usage_counters")
      .update({
        metrics_json: { ...counter.metrics_json, ai_tokens: currentTokens + tokensUsed },
      })
      .eq("id", counter.id);
  } else {
    // Calculate last day of the month
    const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);
    const periodEndDate = periodEnd.toISOString().slice(0, 10);
    
    await supabaseAdmin.from("usage_counters").insert({
      tenant_id: tenantId,
      period_start: periodStartDate,
      period_end: periodEndDate,
      metrics_json: { ai_tokens: tokensUsed },
    });
  }
}

