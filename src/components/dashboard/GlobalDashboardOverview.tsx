import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Activity, Sparkles, Database, ShieldAlert, Zap, Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/AppShell";

type TimelineEvent = {
  id: string;
  occurred_at: string;
  event_type: string;
  actor_type: string;
  message: string;
  case_id: string | null;
  cases?: { title: string | null; journeys?: { name: string } } | null;
};

type JourneyRow = {
  id: string;
  name: string;
  key: string;
  sectors?: { name: string } | null;
};

export function GlobalDashboardOverview() {
  const { activeTenantId } = useTenant();

  // 1. Fetch Tokens / Limits (assuming admin_usage_stats or similar, fallback to tenant limits)
  const tenantPlanQ = useQuery({
    queryKey: ["tenant_plan_overview", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_plans")
        .select("overrides_json, plans(limits_json)")
        .eq("tenant_id", activeTenantId!)
        .limit(1)
        .single();
      
      if (error && error.code !== "PGRST116") throw error;

      // Try to get token usage from usage_counters if exists
      const { data: usageData } = await supabase.rpc("admin_usage_stats", { p_tenant_id: activeTenantId! }).select("ai_tokens_count").single();

      const overrides = (data?.overrides_json as any) || {};
      const planLimits = (data?.plans?.limits_json as any) || {};
      
      const maxTokens = overrides.max_ai_tokens !== undefined ? overrides.max_ai_tokens : (planLimits.max_ai_tokens || 10000);
      const usedTokens = usageData?.ai_tokens_count || 0;

      return { maxTokens, usedTokens };
    }
  });

  // 2. Fetch Active Journeys
  const journeysQ = useQuery({
    queryKey: ["global_active_journeys", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("journey_id, enabled, journeys(id, name, key, sectors(name))")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true);
      if (error) throw error;

      return (data ?? []).map((r: any) => r.journeys as JourneyRow).filter(Boolean);
    }
  });

  // 3. Fetch Global Timeline
  const timelineQ = useQuery({
    queryKey: ["global_timeline", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timeline_events")
        .select("id, occurred_at, event_type, actor_type, message, case_id, cases(title, journeys(name))")
        .eq("tenant_id", activeTenantId!)
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as TimelineEvent[];
    }
  });

  const { maxTokens, usedTokens } = tenantPlanQ.data || { maxTokens: 10000, usedTokens: 0 };
  const percentUsed = maxTokens > 0 ? Math.min(100, Math.round((usedTokens / maxTokens) * 100)) : 0;

  return (
    <AppShell title="Dashboard Global (Guardião)">
      <div className="mx-auto max-w-7xl px-4 py-8">
        
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-indigo-600" />
              Guardião do Negócio
            </h1>
            <p className="text-sm text-slate-500 mt-1">Visão macro de insights, eventos e consumo de IA em tempo real.</p>
          </div>
          <div className="flex gap-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm min-w-[200px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tokens de IA</span>
                <Database className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-slate-800">{usedTokens.toLocaleString()}</span>
                <span className="text-xs font-medium text-slate-400">/ {maxTokens === -1 ? "∞" : maxTokens.toLocaleString()}</span>
              </div>
              {maxTokens > 0 && (
                <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${percentUsed > 90 ? 'bg-rose-500' : percentUsed > 75 ? 'bg-amber-400' : 'bg-indigo-500'}`}
                    style={{ width: `${percentUsed}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Coluna 1 & 2: Top 3 Insights por Jornada */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Insights por Jornada (Top 3)
            </h2>
            
            {!journeysQ.data?.length ? (
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 text-center">
                <p className="text-slate-500 text-sm">Nenhuma jornada habilitada neste momento.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {journeysQ.data.map(journey => (
                  <div key={journey.id} className="bg-white border border-slate-200 rounded-[28px] overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <div className="bg-slate-50/50 p-4 border-b border-slate-100 flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-slate-800 text-sm">{journey.name}</h3>
                        {journey.sectors?.name && (
                          <span className="text-[10px] uppercase font-bold text-indigo-600 tracking-wider">
                            {journey.sectors.name}
                          </span>
                        )}
                      </div>
                      <Badge className="bg-white text-slate-600 border border-slate-200 rounded-full px-3 shadow-none">
                        Ativa
                      </Badge>
                    </div>
                    
                    <div className="p-4">
                      {/* Placeholder para os insights gerados pela IA */}
                      <ul className="space-y-4">
                        {[1, 2, 3].map(i => (
                          <li key={i} className="flex items-start gap-3 relative before:absolute before:left-1.5 before:top-6 before:-bottom-4 before:w-px before:bg-slate-100 last:before:hidden">
                            <div className="w-3 h-3 rounded-full bg-indigo-100 border-2 border-white ring-1 ring-indigo-500/20 mt-1 flex-shrink-0 z-10" />
                            <div className="bg-indigo-50/50 rounded-2xl p-3 border border-indigo-50/80 w-full text-xs text-slate-600">
                              <span className="font-semibold text-indigo-900 block mb-1">Tendência detectada</span>
                              Fila de espera aumentou 15% nas últimas 24h devido a picos de chamados no estado de triagem.
                            </div>
                          </li>
                        ))}
                      </ul>
                      
                      <div className="mt-5 text-center">
                        <button className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                          + Gerar Novo Relatório
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Coluna 3: Linha do Tempo Global */}
          <div className="bg-white border border-slate-200 rounded-[32px] p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-6">
              <Activity className="h-4 w-4 text-emerald-500" />
              Linha do Tempo
            </h2>
            
            <div className="space-y-5">
              {timelineQ.isLoading ? (
                <div className="animate-pulse flex flex-col gap-4">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-slate-100 rounded w-3/4" />
                        <div className="h-3 bg-slate-100 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : timelineQ.data?.length === 0 ? (
                <div className="text-center text-sm text-slate-500 py-10">Nenhum evento registrado ainda.</div>
              ) : (
                timelineQ.data?.map(event => (
                  <div key={event.id} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                      {event.actor_type === 'ai' ? <Zap className="h-3.5 w-3.5 text-amber-500" /> :
                       event.actor_type === 'customer' ? <Users className="h-3.5 w-3.5 text-blue-500" /> :
                       <Clock className="h-3.5 w-3.5 text-slate-400" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] text-slate-800 font-medium">
                        {event.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                        <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[10px]">
                          {event.event_type}
                        </span>
                        <span>•</span>
                        <span>{new Date(event.occurred_at).toLocaleTimeString()}</span>
                        {event.cases && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[120px]" title={event.cases.title || "Caso"}>
                              Caso: {event.cases.title || "Sem título"}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
