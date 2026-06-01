import { supabase } from "./supabase";
import { currentMonthRangeIso } from "./financial-utils";

export async function runTensionEngine(tenantId: string) {
  if (!tenantId) return 0;

  const { start, end } = currentMonthRangeIso();

  // 1. Fetch real transactions
  const { data: txs } = await supabase
    .from("financial_transactions")
    .select("id, amount, type, category_id, transaction_date")
    .eq("tenant_id", tenantId)
    .gte("transaction_date", start)
    .lte("transaction_date", end);

  // 2. Fetch categories
  const { data: cats } = await supabase
    .from("financial_categories")
    .select("id, name, type")
    .eq("tenant_id", tenantId);

  const catMap = new Map((cats || []).map(c => [c.id, c]));

  // 3. Summarize realized by category
  const realizedByCat = new Map<string, number>();
  let totalDebit = 0;
  let totalCredit = 0;

  for (const t of (txs || [])) {
    const amt = Number(t.amount);
    if (t.type === "debit") totalDebit += amt;
    else if (t.type === "credit") totalCredit += amt;

    if (t.category_id) {
      const current = realizedByCat.get(t.category_id) || 0;
      realizedByCat.set(t.category_id, current + amt);
    }
  }

  // 4. Fetch projections (budget)
  const { data: projections } = await supabase
    .from("financial_cash_projection")
    .select("category_id, amount, is_realized")
    .eq("tenant_id", tenantId)
    .gte("reference_date", start)
    .lte("reference_date", end)
    .eq("is_realized", false);

  const budgetByCat = new Map<string, number>();
  for (const p of (projections || [])) {
    if (p.category_id) {
      const current = budgetByCat.get(p.category_id) || 0;
      budgetByCat.set(p.category_id, current + Number(p.amount));
    }
  }

  const generatedEvents: any[] = [];

  // Logic 1: Cashflow alert
  if (totalDebit > totalCredit && totalCredit > 0) {
    const diff = totalDebit - totalCredit;
    if (diff > totalCredit * 0.2) {
      generatedEvents.push({
        tenant_id: tenantId,
        tension_type: "deficit_risc",
        reference_id: `cashflow_${start}`,
        description: `Alerta de Fluxo de Caixa: As saídas (R$ ${totalDebit.toFixed(2)}) estão superando as entradas (R$ ${totalCredit.toFixed(2)}) em mais de 20%.`,
        detected_at: new Date().toISOString()
      });
    }
  }

  // Logic 2: Category budget overrun
  for (const [catId, budgetAmt] of Array.from(budgetByCat.entries())) {
    const realAmt = realizedByCat.get(catId) || 0;
    const catName = catMap.get(catId)?.name || "Desconhecida";
    const catType = catMap.get(catId)?.type || "";
    
    // Only care about expenses
    if (catType !== "expense" && catType !== "variable_cost" && catType !== "fixed_cost") continue;

    if (budgetAmt > 0 && realAmt > budgetAmt * 1.1) {
      generatedEvents.push({
        tenant_id: tenantId,
        tension_type: "budget_overrun",
        reference_id: `budget_${catId}_${start}`,
        description: `Estouro de Orçamento: A categoria "${catName}" ultrapassou 10% do orçado (Realizado: R$ ${realAmt.toFixed(2)} / Orçado: R$ ${budgetAmt.toFixed(2)}).`,
        detected_at: new Date().toISOString()
      });
    }
  }

  // Logic 3: Uncategorized transactions risk
  const uncategorizedCount = (txs || []).filter(t => !t.category_id).length;
  if (uncategorizedCount > 10) {
    generatedEvents.push({
      tenant_id: tenantId,
      tension_type: "data_quality",
      reference_id: `uncategorized_${start}`,
      description: `Risco de Qualidade de Dados: Existem ${uncategorizedCount} transações sem categoria no mês, o que afeta a precisão do DRE.`,
      detected_at: new Date().toISOString()
    });
  }

  if (generatedEvents.length === 0) return 0;

  // Insert tensions
  const { error } = await supabase
    .from("tension_events")
    .upsert(generatedEvents, { onConflict: "tenant_id,reference_id", ignoreDuplicates: false });

  if (error) {
    console.error("Error generating tensions", error);
    return 0;
  }

  // Also insert scores
  // First fetch the ids of the upserted events
  const refs = generatedEvents.map(g => g.reference_id);
  const { data: upserted } = await supabase
    .from("tension_events")
    .select("id, tension_type")
    .eq("tenant_id", tenantId)
    .in("reference_id", refs);

  if (upserted && upserted.length > 0) {
    const scores = upserted.map(u => {
      let impact = 5; let urgency = 5; let cascade = 5;
      if (u.tension_type === "deficit_risc") { impact = 8; urgency = 9; cascade = 7; }
      else if (u.tension_type === "budget_overrun") { impact = 6; urgency = 6; cascade = 5; }
      else if (u.tension_type === "data_quality") { impact = 4; urgency = 3; cascade = 8; }
      const final = (impact + urgency + cascade) / 3;

      return {
        tension_event_id: u.id,
        impact_score: impact,
        urgency_score: urgency,
        cascade_score: cascade,
        final_score: final,
        tenant_id: tenantId,
      };
    });

    await supabase.from("tension_scores").upsert(scores, { onConflict: "tension_event_id" });
  }

  return generatedEvents.length;
}
