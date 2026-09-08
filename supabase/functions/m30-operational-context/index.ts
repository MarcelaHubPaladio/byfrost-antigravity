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
  return json({ ok: false, error: message, ...extra }, status);
}

serve(async (req) => {
  const fn = "m30-operational-context";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return err("unauthorized", 401);
    const token = auth.slice("Bearer ".length).trim();

    const body = await req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const commitmentId = String(body?.commitmentId ?? "").trim();

    if (!tenantId || !commitmentId) return err("missing_parameters", 400);

    const supabase = createSupabaseAdmin();

    // Verify auth
    const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!isServiceRole) {
      const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userRes?.user) {
        console.error(`[${fn}] auth.getUser failed`, { error: userErr?.message });
        return err("unauthorized", 401);
      }
    }

    // 1. Fetch Commitment & Deliverables
    const { data: contract, error: contractErr } = await supabase
      .from('commercial_commitments')
      .select('*, customer:core_entities!commercial_commitments_customer_fk(display_name)')
      .eq('id', commitmentId)
      .eq('tenant_id', tenantId)
      .single();

    if (contractErr || !contract) {
       return err("commitment_not_found", 404);
    }

    const { data: deliverables } = await supabase
      .from('deliverables')
      .select('*')
      .eq('commitment_id', commitmentId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    // 2. Fetch Active Cases for this commitment
    const { data: casesData } = await supabase
      .from('cases')
      .select('*')
      .eq('tenant_id', tenantId)
      .contains('meta_json', { commitment_id: commitmentId })
      .is('deleted_at', null);

    const cases = casesData || [];
    const delivs = deliverables || [];

    // 3. Build Scope (Contracted, Allocated, Completed, Available)
    const allocatedIds = new Set(cases.map((c: any) => c.deliverable_id).filter(Boolean));
    const scopeMap = new Map<string, { contracted: number; completed: number; allocated: number; available: number }>();
    
    for (const d of delivs) {
      const type = d.name || 'Outros';
      if (!scopeMap.has(type)) {
        scopeMap.set(type, { contracted: 0, completed: 0, allocated: 0, available: 0 });
      }
      const entry = scopeMap.get(type)!;
      entry.contracted += 1;
      
      if (d.status === 'completed') {
        entry.completed += 1;
      } else if (allocatedIds.has(d.id)) {
        entry.allocated += 1;
      } else {
        entry.available += 1;
      }
    }

    const scope = Array.from(scopeMap.entries()).map(([type, counts]) => ({
      type,
      ...counts
    }));

    // 4. Identify Current Cycle
    const strategyCases = cases.filter((c: any) => c.case_type === 'strategy');
    let latestCycleId: string | null = null;
    let cycleCases: any[] = [];
    
    const sortedStrats = [...strategyCases].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sortedStrats.length > 0) {
      const meta = sortedStrats[0].meta_json as any;
      latestCycleId = meta?.cycle_id || null;
    }

    let current_cycle = null;
    let next_events: { name: string; date: string }[] = [];

    if (latestCycleId) {
      cycleCases = strategyCases.filter((c: any) => (c.meta_json as any)?.cycle_id === latestCycleId);
      if (cycleCases.length > 0) {
        const reprMeta = cycleCases[0].meta_json as any;
        
        let totalSubtasks = 0;
        let doneSubtasks = 0;
        let activeCount = 0;
        let pendingApprovalsCount = 0;

        for (const sc of cycleCases) {
          const subs = (sc.meta_json as any)?.pending_subtasks || [];
          totalSubtasks += subs.length;
          doneSubtasks += subs.filter((s: any) => s.status === 'done').length;
          
          if (sc.state !== 'concluido') activeCount++;
          if (sc.state === 'aprovacao') pendingApprovalsCount++;
        }

        current_cycle = {
          id: latestCycleId,
          name: reprMeta.cycle_name || 'Ciclo sem nome',
          start: reprMeta.cycle_start || null,
          end: reprMeta.cycle_end || null,
          objective: reprMeta.cycle_objective || null,
          progress: totalSubtasks > 0 ? Math.round((doneSubtasks / totalSubtasks) * 100) : 0,
          activeCasesCount: activeCount,
          pendingApprovalsCount,
          date_planning: reprMeta.date_planning || null,
          date_recording: reprMeta.date_recording || null,
          date_approval: reprMeta.date_approval || null,
          date_posting: reprMeta.date_posting || null,
          date_report: reprMeta.date_report || null,
        };

        if (reprMeta.date_planning) next_events.push({ name: 'Planejamento', date: reprMeta.date_planning });
        if (reprMeta.date_recording) next_events.push({ name: 'Gravação', date: reprMeta.date_recording });
        if (reprMeta.date_approval) next_events.push({ name: 'Aprovação', date: reprMeta.date_approval });
        if (reprMeta.date_posting) next_events.push({ name: 'Postagem', date: reprMeta.date_posting });
        if (reprMeta.date_report) next_events.push({ name: 'Relatório', date: reprMeta.date_report });

        next_events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }
    }

    const meta = contract.metadata as any || {};

    const contextData = {
      client: {
        id: contract.customer_entity_id,
        name: contract.customer?.display_name || 'Cliente'
      },
      contract: {
        id: contract.id,
        status: contract.status,
        start: contract.created_at,
        end: contract.estimated_end_date || null
      },
      scope,
      current_cycle,
      next_events,
      cases,
      operational_notes: meta.notes || '',
      account_context: meta.account_context || {}
    };

    return json({ ok: true, context: contextData });
  } catch (e: any) {
    console.error(`[${fn}] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
