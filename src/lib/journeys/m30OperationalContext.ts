import { SupabaseClient } from '@supabase/supabase-js';
import { calculateStrategyProgress } from '@/lib/journeys/m30MacroStates';

export interface M30OperationalContext {
  client: { id: string; name: string };
  contract: { id: string; status: string; start: string | null; end: string | null };
  scope: { type: string; contracted: number; allocated: number; completed: number; available: number }[];
  current_cycle: {
    id: string;
    name: string;
    start: string | null;
    end: string | null;
    objective: string | null;
    progress: number;
    activeCasesCount: number;
    pendingApprovalsCount: number;
    date_planning: string | null;
    date_recording: string | null;
    date_approval: string | null;
    date_posting: string | null;
    date_report: string | null;
  } | null;
  next_events: { name: string; date: string }[];
  cases: any[];
  operational_notes: string;
  account_context: {
    objective?: string;
    positioning?: string;
    products?: string;
    audience?: string;
    tone?: string;
    included?: string;
    not_included?: string;
    rules?: string;
    client_responsibles?: string;
    commercial_notes?: string;
    production_notes?: string;
  };
}

export async function getClientOperationalContext(
  supabase: SupabaseClient,
  tenantId: string,
  commitmentId: string
): Promise<M30OperationalContext | null> {
  if (!tenantId || !commitmentId) return null;

  try {
    // 1. Fetch Commitment & Deliverables
    const { data: contract, error: contractErr } = await supabase
      .from('commercial_commitments')
      .select('*, customer:customer_entity_id(display_name)')
      .eq('id', commitmentId)
      .eq('tenant_id', tenantId)
      .single();

    if (contractErr || !contract) return null;

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
    const allocatedIds = new Set(cases.map(c => c.deliverable_id).filter(Boolean));
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
    // We assume the most recent strategy case defines the cycle, or we group by cycle_id.
    const strategyCases = cases.filter(c => c.case_type === 'strategy');
    // Group by cycle_id
    let latestCycleId: string | null = null;
    let cycleCases: any[] = [];
    
    // Sort strategy cases by created_at desc to find latest cycle
    const sortedStrats = [...strategyCases].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sortedStrats.length > 0) {
      const meta = sortedStrats[0].meta_json as any;
      latestCycleId = meta?.cycle_id || null;
    }

    let current_cycle: M30OperationalContext['current_cycle'] = null;
    let next_events: { name: string; date: string }[] = [];

    if (latestCycleId) {
      cycleCases = strategyCases.filter(c => (c.meta_json as any)?.cycle_id === latestCycleId);
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

        // Populate next events from cycle dates
        if (reprMeta.date_planning) next_events.push({ name: 'Planejamento', date: reprMeta.date_planning });
        if (reprMeta.date_recording) next_events.push({ name: 'Gravação', date: reprMeta.date_recording });
        if (reprMeta.date_approval) next_events.push({ name: 'Aprovação', date: reprMeta.date_approval });
        if (reprMeta.date_posting) next_events.push({ name: 'Postagem', date: reprMeta.date_posting });
        if (reprMeta.date_report) next_events.push({ name: 'Relatório', date: reprMeta.date_report });

        // Sort events by date
        next_events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        // Filter out past events if desired, but for now we return all sorted
      }
    }

    const meta = contract.meta_json as any || {};

    return {
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

  } catch (err) {
    console.error("[getClientOperationalContext] Error:", err);
    return null;
  }
}
