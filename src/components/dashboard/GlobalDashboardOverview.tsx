import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Activity, Sparkles, Database, ShieldAlert, Zap, Clock, Users, Loader2, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GlobalTimeline from "@/pages/GlobalTimeline";
import { useToast } from "@/hooks/use-toast";
import { OracleChat } from "./OracleChat";

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

type GuardiaoInsight = {
  title: string;
  description: string;
  severity: "info" | "warn" | "error";
};

type JourneyInsightData = {
  journey_id: string;
  insights_json: GuardiaoInsight[];
  created_at: string;
};

export function GlobalDashboardOverview() {
  const { activeTenantId, activeTenant, isSuperAdmin } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [generatingJourneyId, setGeneratingJourneyId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<"openai" | "gemini">("openai");
  const [lookbackDays, setLookbackDays] = useState<number>(7);
  const [loadingJourneys, setLoadingJourneys] = useState<Record<string, string>>({});

  const generateInsightMut = useMutation({
    mutationFn: async ({ journeyId, model, days }: { journeyId: string; model: string; days: number }) => {
      const idempotencyKey = `MANUAL_GUARDIAO_INSIGHTS:${activeTenantId}:${journeyId}:${Date.now()}`;
      console.log(`[Gerar Relatório] Iniciando requisição para journeyId: ${journeyId}, model: ${model}, days: ${days}`);
      
      const res = await supabase.from("job_queue").insert({
        tenant_id: activeTenantId!,
        type: "GUARDIAO_INSIGHTS_GENERATE",
        idempotency_key: idempotencyKey,
        payload_json: { journey_id: journeyId, model, lookback_days: days },
        status: "pending",
        // Avoid client clock skew issues: let the DB default or force a safe past date
        run_after: new Date(Date.now() - 60000).toISOString(),
      }).select();
      
      console.log("[Gerar Relatório] Retorno do insert no job_queue:", res);
      if (res.error) throw res.error;
      
      console.log("[Gerar Relatório] Chamando Edge Function 'jobs-processor' para processar a fila...");
      
      // Await para sabermos exatamente o resultado do processamento da IA
      // Passamos o job_id exato que acabamos de criar para bypassar buscas complexas
      const invokeRes = await supabase.functions.invoke("jobs-processor", {
        body: { job_id: res.data[0].id }
      });
      
      console.log("[Gerar Relatório] Retorno da IA (Edge Function):", JSON.stringify(invokeRes.data, null, 2));
      
      if (invokeRes.error) {
        throw new Error(`Falha na comunicação com a Edge Function: ${invokeRes.error.message}`);
      }

      // Se a Edge Function processou, o job não deve estar mais pendente
      const jobResult = invokeRes.data?.results?.find((r: any) => r.id === res.data[0].id);
      if (jobResult && !jobResult.ok) {
         throw new Error(`Erro dentro da Edge Function: ${jobResult.error}`);
      }

      return res.data;
    },
    onSuccess: () => {
      // toast de finalização será dado no useEffect quando os dados chegarem,
      // mas podemos dar um feedback prévio aqui
      console.log("✅ Edge Function terminou de processar com sucesso.");
      setGeneratingJourneyId(null);
      // Força o refetch dos insights imediatamente
      queryClient.invalidateQueries({ queryKey: ["guardiao_insights", activeTenantId] });
      queryClient.invalidateQueries({ queryKey: ["usage_events_ai", activeTenantId] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Erro ao gerar", description: err.message });
      setGeneratingJourneyId(null);
    }
  });

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
        .maybeSingle();
      
      if (error) throw error;

      // Try to get token usage from usage_counters
      const { data: counters } = await supabase
        .from("usage_counters")
        .select("metrics_json")
        .eq("tenant_id", activeTenantId!);

      let usedTokens = 0;
      if (counters) {
        usedTokens = counters.reduce((acc, curr) => {
          const metrics = curr.metrics_json as any;
          return acc + (Number(metrics?.ai_tokens) || 0);
        }, 0);
      }

      const overrides = (data?.overrides_json as any) || {};
      const planLimits = (data?.plans?.limits_json as any) || {};
      
      const maxTokens = overrides.max_ai_tokens !== undefined ? overrides.max_ai_tokens : (planLimits.max_ai_tokens || 10000);

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


  // 4. Fetch Insights
  const insightsQ = useQuery({
    queryKey: ["guardiao_insights", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: Object.keys(loadingJourneys).length > 0 ? 5000 : false,
    queryFn: async () => {
      // Get the latest insight array for each active journey
      const { data, error } = await supabase
        .from("guardiao_insights")
        .select("journey_id, insights_json, created_at")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      
      // Group by journey_id
      const latestByJourney = new Map<string, JourneyInsightData>();
      const allByJourney = new Map<string, JourneyInsightData[]>();
      for (const row of data ?? []) {
        const key = row.journey_id === null ? "GLOBAL" : row.journey_id;
        if (!allByJourney.has(key)) {
          allByJourney.set(key, []);
        }
        allByJourney.get(key)!.push({ ...row, journey_id: key } as JourneyInsightData);

        if (!latestByJourney.has(key)) {
          latestByJourney.set(key, { ...row, journey_id: key } as JourneyInsightData);
        }
      }
      return { latestByJourney, allByJourney };
    }
  });

  const usageEventsQ = useQuery({
    queryKey: ["usage_events_ai", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usage_events")
        .select("id, type, qty, ref_type, meta_json, occurred_at")
        .eq("tenant_id", activeTenantId!)
        .eq("type", "ai_token")
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    }
  });

  useEffect(() => {
    if (insightsQ.data && Object.keys(loadingJourneys).length > 0) {
      setLoadingJourneys(prev => {
        const next = { ...prev };
        let changed = false;
        for (const journeyId in next) {
          const newInsight = insightsQ.data.latestByJourney.get(journeyId);
          if (newInsight && newInsight.created_at !== next[journeyId]) {
            delete next[journeyId];
            changed = true;
            console.log("✅ Relatório retornado pela IA para a jornada:", journeyId, newInsight);
            toast({ title: "Relatório gerado!", description: "Os insights da jornada foram atualizados.", variant: "default" });
          }
        }
        return changed ? next : prev;
      });
    }
  }, [insightsQ.data]);

  // Polling para debug: verifica a cada 10s o status da fila de jobs
  useQuery({
    queryKey: ["debug_job_queue_status", activeTenantId, Object.keys(loadingJourneys)],
    enabled: Object.keys(loadingJourneys).length > 0,
    refetchInterval: 10000,
    queryFn: async () => {
      const keys = Object.keys(loadingJourneys);
      if (keys.length === 0) return null;
      
      console.log(`[Status Poll 10s] Checando status na job_queue para as jornadas que estão carregando...`);
      
      const { data, error } = await supabase
        .from("job_queue")
        .select("id, status, created_at, run_after, locked_at, payload_json")
        .eq("tenant_id", activeTenantId!)
        .eq("type", "GUARDIAO_INSIGHTS_GENERATE")
        .order("created_at", { ascending: false })
        .limit(10);
        
      if (error) {
        console.error("[Status Poll 10s] Erro ao consultar job_queue:", error);
        return null;
      }
      
      console.log(`[Status Poll 10s] Status da fila:`, data.map(j => `${j.id.split('-')[0]}... => ${j.status} (run_after: ${j.run_after}, locked_at: ${j.locked_at})`).join(" | "));
      console.log("[Status Poll 10s] Últimos 10 jobs de geração de insights (completo):", data);
      return data;
    }
  });

  const { maxTokens, usedTokens } = tenantPlanQ.data || { maxTokens: 10000, usedTokens: 0 };
  const percentUsed = maxTokens > 0 ? Math.min(100, Math.round((usedTokens / maxTokens) * 100)) : 0;

  const isFinanceEnabled = activeTenant?.modules_json?.finance_enabled === true;
  const isTasksEnabled = activeTenant?.modules_json?.tasks_enabled === true;
  const isGlobalEnabled = isFinanceEnabled || isTasksEnabled;
  const hasItems = Boolean((journeysQ.data && journeysQ.data.length > 0) || isGlobalEnabled);

  return (
    <AppShell title="Dashboard Global (Guardião)">
      <div className="w-full h-full px-4 py-8">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-indigo-100 p-2 rounded-xl">
                <ShieldAlert className="h-6 w-6 text-indigo-600" />
              </div>
              Guardião do Negócio
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Visão macro de insights, eventos e consumo de IA em tempo real.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
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

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className={`mb-6 grid w-full max-w-3xl ${isSuperAdmin ? "grid-cols-5" : "grid-cols-4"} bg-slate-100/80 p-1 rounded-xl`}>
            <TabsTrigger value="overview" className="rounded-lg">Visão Geral</TabsTrigger>
            <TabsTrigger value="timeline" className="rounded-lg">Linha do Tempo Global</TabsTrigger>
            <TabsTrigger value="oracle" className="rounded-lg">Oráculo (IA)</TabsTrigger>
            <TabsTrigger value="invoice" className="rounded-lg">Fatura</TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="token_usage" className="rounded-lg">Extrato de Tokens</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Coluna 1 & 2: Top 3 Insights por Jornada */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Insights por Jornada (Top 3)
            </h2>
            
            {!hasItems ? (
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 text-center">
                <p className="text-slate-500 text-sm">Nenhuma jornada ou módulo global habilitado neste momento.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Global Card */}
                {isGlobalEnabled && (() => {
                  const insightData = insightsQ.data?.latestByJourney?.get("GLOBAL");
                  const historyData = insightsQ.data?.allByJourney?.get("GLOBAL") || [];
                  const rawJson = insightData?.insights_json;
                  
                  let insights: GuardiaoInsight[] = [];
                  let eventsCount: number | null = null;
                  let summaryText: string | null = null;
                  let comparisonText: string | null = null;
                  
                  if (Array.isArray(rawJson)) {
                    insights = rawJson;
                  } else if (rawJson && typeof rawJson === 'object') {
                    insights = Array.isArray((rawJson as any).insights) ? (rawJson as any).insights : [];
                    eventsCount = (rawJson as any).events_count ?? null;
                    summaryText = (rawJson as any).summary ?? null;
                    comparisonText = (rawJson as any).comparison ?? null;
                  }

                  return (
                    <div className="bg-white border-2 border-indigo-500/20 rounded-[28px] overflow-hidden shadow-md hover:shadow-lg transition-all duration-300 md:col-span-2">
                      <div className="bg-indigo-50/40 p-4 border-b border-indigo-100/50 flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <Landmark className="h-5 w-5 text-indigo-600" />
                          <div>
                            <h3 className="font-bold text-slate-800 text-sm">Visão Global do Negócio</h3>
                            <span className="text-[9px] uppercase font-bold text-indigo-600 tracking-wider">
                              Análise Geral (Financeiro & Tarefas)
                            </span>
                          </div>
                        </div>
                        <Badge className="bg-indigo-600 text-white rounded-full px-3 shadow-none">
                          Global
                        </Badge>
                      </div>
                      
                      <div className="p-5 relative">
                        {loadingJourneys["GLOBAL"] ? (
                          <div className="py-12 flex flex-col items-center justify-center space-y-4">
                            <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                            <p className="text-sm text-slate-500 font-medium animate-pulse">Analisando Financeiro e Tarefas com IA...</p>
                          </div>
                        ) : insights.length > 0 || summaryText ? (
                          <div className="space-y-6">
                            {(summaryText || comparisonText || eventsCount !== null) && (
                              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-sm space-y-3">
                                {eventsCount !== null && (
                                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-2 bg-white w-max px-2 py-1 rounded-full border border-slate-200">
                                    <Database className="w-3 h-3" />
                                    <span>{eventsCount} registros analisados</span>
                                  </div>
                                )}
                                {summaryText && (
                                  <div>
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Padrão de Comportamento</h4>
                                    <p className="text-sm text-slate-700 leading-relaxed">{summaryText}</p>
                                  </div>
                                )}
                                {comparisonText && (
                                  <div>
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 mt-3">Comparativo com Relatório Anterior</h4>
                                    <p className="text-sm text-slate-700 leading-relaxed">{comparisonText}</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {insights.length > 0 && (
                              <div>
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Pontos de Atenção Estratégicos</h4>
                                <ul className="space-y-4">
                                  {insights.map((insight, i) => (
                                    <li key={i} className="flex items-start gap-3 relative before:absolute before:left-1.5 before:top-6 before:-bottom-4 before:w-px before:bg-slate-100 last:before:hidden">
                                      <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 z-10 border-2 border-white ring-1 ${
                                        insight.severity === 'error' ? 'bg-rose-100 ring-rose-500/20' :
                                        insight.severity === 'warn' ? 'bg-amber-100 ring-amber-500/20' :
                                        'bg-indigo-100 ring-indigo-500/20'
                                      }`} />
                                      <div className={`rounded-2xl p-3 border w-full text-xs text-slate-600 ${
                                        insight.severity === 'error' ? 'bg-rose-50/50 border-rose-50/80 text-rose-900' :
                                        insight.severity === 'warn' ? 'bg-amber-50/50 border-amber-50/80 text-amber-900' :
                                        'bg-indigo-50/50 border-indigo-50/80'
                                      }`}>
                                        <span className="font-semibold block mb-1">{insight.title}</span>
                                        {insight.description}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {historyData.length > 1 && (
                              <details className="mt-4 group">
                                <summary className="text-xs font-semibold text-slate-500 cursor-pointer list-none flex items-center gap-2 hover:text-slate-800 transition-colors">
                                  <span>Histórico de Relatórios ({historyData.length - 1})</span>
                                  <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </summary>
                                <div className="mt-3 space-y-2 border-l-2 border-slate-100 pl-4">
                                  {historyData.slice(1).map((hist, idx) => (
                                    <div key={idx} className="text-xs text-slate-500 bg-slate-50 p-2 rounded-md">
                                      <span className="font-medium block mb-1">{new Date(hist.created_at).toLocaleString()}</span>
                                      {Array.isArray(hist.insights_json) 
                                        ? `${hist.insights_json.length} insights gerados.` 
                                        : (hist.insights_json as any)?.summary || "Relatório gerado."}
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-sm text-slate-400">
                            Nenhum insight gerado recentemente.
                          </div>
                        )}
                        
                        <div className="mt-5 flex justify-between items-center">
                          <span className="text-[10px] text-slate-400">
                            {insightData ? `Atualizado ${new Date(insightData.created_at).toLocaleDateString()}` : 'Aguardando agendamento'}
                          </span>
                          <button 
                            onClick={() => setGeneratingJourneyId("GLOBAL")}
                            disabled={!!loadingJourneys["GLOBAL"]}
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            + Gerar Novo Relatório
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Journeys Cards */}
                {journeysQ.data?.map(journey => {
                  const insightData = insightsQ.data?.latestByJourney?.get(journey.id);
                  const historyData = insightsQ.data?.allByJourney?.get(journey.id) || [];
                  const rawJson = insightData?.insights_json;
                  
                  let insights: GuardiaoInsight[] = [];
                  let eventsCount: number | null = null;
                  let summaryText: string | null = null;
                  let comparisonText: string | null = null;
                  
                  if (Array.isArray(rawJson)) {
                    insights = rawJson;
                  } else if (rawJson && typeof rawJson === 'object') {
                    insights = Array.isArray((rawJson as any).insights) ? (rawJson as any).insights : [];
                    eventsCount = (rawJson as any).events_count ?? null;
                    summaryText = (rawJson as any).summary ?? null;
                    comparisonText = (rawJson as any).comparison ?? null;
                  }

                  return (
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
                      
                      <div className="p-4 relative">
                        {loadingJourneys[journey.id] ? (
                          <div className="py-12 flex flex-col items-center justify-center space-y-4">
                            <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                            <p className="text-sm text-slate-500 font-medium animate-pulse">Gerando relatório com IA...</p>
                          </div>
                        ) : insights.length > 0 || summaryText ? (
                          <div className="space-y-6">
                            {(summaryText || comparisonText || eventsCount !== null) && (
                              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-sm space-y-3">
                                {eventsCount !== null && (
                                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-2 bg-white w-max px-2 py-1 rounded-full border border-slate-200">
                                    <Database className="w-3 h-3" />
                                    <span>{eventsCount} eventos analisados</span>
                                  </div>
                                )}
                                {summaryText && (
                                  <div>
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Padrão de Comportamento</h4>
                                    <p className="text-sm text-slate-700 leading-relaxed">{summaryText}</p>
                                  </div>
                                )}
                                {comparisonText && (
                                  <div>
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 mt-3">Comparativo</h4>
                                    <p className="text-sm text-slate-700 leading-relaxed">{comparisonText}</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {insights.length > 0 && (
                              <div>
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Pontos de Atenção</h4>
                                <ul className="space-y-4">
                                  {insights.map((insight, i) => (
                                    <li key={i} className="flex items-start gap-3 relative before:absolute before:left-1.5 before:top-6 before:-bottom-4 before:w-px before:bg-slate-100 last:before:hidden">
                                      <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 z-10 border-2 border-white ring-1 ${
                                        insight.severity === 'error' ? 'bg-rose-100 ring-rose-500/20' :
                                        insight.severity === 'warn' ? 'bg-amber-100 ring-amber-500/20' :
                                        'bg-indigo-100 ring-indigo-500/20'
                                      }`} />
                                      <div className={`rounded-2xl p-3 border w-full text-xs text-slate-600 ${
                                        insight.severity === 'error' ? 'bg-rose-50/50 border-rose-50/80 text-rose-900' :
                                        insight.severity === 'warn' ? 'bg-amber-50/50 border-amber-50/80 text-amber-900' :
                                        'bg-indigo-50/50 border-indigo-50/80'
                                      }`}>
                                        <span className="font-semibold block mb-1">{insight.title}</span>
                                        {insight.description}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {historyData.length > 1 && (
                              <details className="mt-4 group">
                                <summary className="text-xs font-semibold text-slate-500 cursor-pointer list-none flex items-center gap-2 hover:text-slate-800 transition-colors">
                                  <span>Histórico de Relatórios ({historyData.length - 1})</span>
                                  <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </summary>
                                <div className="mt-3 space-y-2 border-l-2 border-slate-100 pl-4">
                                  {historyData.slice(1).map((hist, idx) => (
                                    <div key={idx} className="text-xs text-slate-500 bg-slate-50 p-2 rounded-md">
                                      <span className="font-medium block mb-1">{new Date(hist.created_at).toLocaleString()}</span>
                                      {Array.isArray(hist.insights_json) 
                                        ? `${hist.insights_json.length} insights gerados.` 
                                        : (hist.insights_json as any)?.summary || "Relatório gerado."}
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-sm text-slate-400">
                            Nenhum insight gerado recentemente.
                          </div>
                        )}
                        
                        <div className="mt-5 flex justify-between items-center">
                          <span className="text-[10px] text-slate-400">
                            {insightData ? `Atualizado ${new Date(insightData.created_at).toLocaleDateString()}` : 'Aguardando agendamento'}
                          </span>
                          <button 
                            onClick={() => setGeneratingJourneyId(journey.id)}
                            disabled={!!loadingJourneys[journey.id]}
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            + Gerar Novo Relatório
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <Dialog open={!!generatingJourneyId} onOpenChange={(open) => !open && setGeneratingJourneyId(null)}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Gerar Novo Relatório</DialogTitle>
                <DialogDescription>
                  Selecione qual motor de inteligência artificial você quer usar para analisar os eventos recentes desta jornada.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 py-4">
                <label className="flex items-center justify-between p-4 border rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm text-slate-800">OpenAI</span>
                    <span className="text-xs text-slate-500">gpt-4o-mini</span>
                  </div>
                  <input 
                    type="radio" 
                    name="model" 
                    value="openai" 
                    checked={selectedModel === "openai"} 
                    onChange={() => setSelectedModel("openai")}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" 
                  />
                </label>
                <label className="flex items-center justify-between p-4 border rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm text-slate-800">Google Gemini</span>
                    <span className="text-xs text-slate-500">gemini-2.5-flash</span>
                  </div>
                  <input 
                    type="radio" 
                    name="model" 
                    value="gemini" 
                    checked={selectedModel === "gemini"} 
                    onChange={() => setSelectedModel("gemini")}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" 
                  />
                </label>

                <div className="mt-2 space-y-2">
                  <span className="font-semibold text-sm text-slate-800">Período de Análise</span>
                  <div className="flex flex-wrap gap-2">
                    {[1, 3, 7, 15, 30].map(days => (
                      <button
                        key={days}
                        onClick={() => setLookbackDays(days)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors border ${
                          lookbackDays === days 
                            ? 'bg-indigo-600 text-white border-indigo-600' 
                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        {days === 1 ? 'Últimas 24h' : `Últimos ${days} dias`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGeneratingJourneyId(null)} disabled={generateInsightMut.isPending}>
                  Cancelar
                </Button>
                <Button 
                  onClick={() => {
                    if (generatingJourneyId) {
                      const oldInsight = insightsQ.data?.latestByJourney?.get(generatingJourneyId);
                      setLoadingJourneys(prev => ({ ...prev, [generatingJourneyId]: oldInsight?.created_at || 'none' }));
                      generateInsightMut.mutate({ journeyId: generatingJourneyId, model: selectedModel, days: lookbackDays });
                    }
                  }} 
                  disabled={generateInsightMut.isPending}
                >
                  {generateInsightMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Confirmar Geração
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </TabsContent>

        <TabsContent value="timeline" className="mt-0">
          <GlobalTimeline />
        </TabsContent>

        <TabsContent value="oracle" className="mt-0">
          <OracleChat />
        </TabsContent>

        <TabsContent value="invoice" className="mt-0">
          <div className="bg-white border border-slate-200 rounded-[28px] p-6 shadow-sm">
            <div className="mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Fatura de Consumo de IA</h3>
                <p className="text-xs text-slate-500 mt-1">Detalhamento operacional de requisições de Inteligência Artificial para este Tenant.</p>
              </div>

              {/* Total final do Tenant (soma do custo de uso de tokens * 3 em Reais) */}
              {!usageEventsQ.isLoading && usageEventsQ.data && (
                (() => {
                  const totalCostUsd = usageEventsQ.data.reduce((acc: number, event: any) => acc + Number(event.meta_json?.cost_usd || 0), 0);
                  const totalCostBrl = totalCostUsd * 3 * 5.00; // Multiplicado por 3x e convertido em Reais (Câmbio comercial de R$ 5.00)
                  return (
                    <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl px-5 py-3 text-right">
                      <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400 block leading-none mb-1">Valor Final Faturado</span>
                      <span className="text-lg font-black text-indigo-700">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCostBrl)}
                      </span>
                    </div>
                  );
                })()
              )}
            </div>

            {usageEventsQ.isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                <p className="text-sm text-slate-500 font-medium">Buscando fatura de consumo...</p>
              </div>
            ) : !usageEventsQ.data?.length ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                Nenhum uso de tokens registrado para este Tenant ainda.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Data / Hora</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Serviço / Descrição</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Modelo</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Tokens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {usageEventsQ.data.map((event: any) => {
                      const meta = event.meta_json || {};
                      const desc = meta.description || "Uso do sistema de IA";
                      const model = meta.model || "gpt-4o-mini";
                      
                      return (
                        <tr key={event.id} className="hover:bg-slate-50/50 transition-colors text-xs text-slate-600 font-medium">
                          <td className="p-4 whitespace-nowrap">
                            {new Date(event.occurred_at).toLocaleString('pt-BR')}
                          </td>
                          <td className="p-4">
                            <span className="font-semibold text-slate-800 block">{desc}</span>
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <Badge className="bg-slate-100 text-slate-600 shadow-none border-none hover:bg-slate-100 rounded-md">
                              {model}
                            </Badge>
                          </td>
                          <td className="p-4 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                            {event.qty.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="token_usage" className="mt-0">
            <div className="bg-white border border-slate-200 rounded-[28px] p-6 shadow-sm">
              <div className="mb-6 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Extrato de Consumo de Tokens</h3>
                  <p className="text-xs text-slate-500 mt-1">Histórico detalhado de requisições de Inteligência Artificial para este Tenant.</p>
                </div>
                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200/50 rounded-full px-3 py-1 text-[11px] font-semibold hover:bg-emerald-50">
                  Ativo
                </Badge>
              </div>

              {usageEventsQ.isLoading ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                  <p className="text-sm text-slate-500 font-medium">Buscando extrato de consumo...</p>
                </div>
              ) : !usageEventsQ.data?.length ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  Nenhum uso de tokens registrado para este Tenant ainda.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Data / Hora</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Serviço / Descrição</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Modelo</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Tokens</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Custo Est. ($)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {usageEventsQ.data.map((event: any) => {
                        const meta = event.meta_json || {};
                        const cost = Number(meta.cost_usd || 0);
                        const desc = meta.description || "Uso do sistema de IA";
                        const model = meta.model || "gpt-4o-mini";
                        
                        return (
                          <tr key={event.id} className="hover:bg-slate-50/50 transition-colors text-xs text-slate-600 font-medium">
                            <td className="p-4 whitespace-nowrap">
                              {new Date(event.occurred_at).toLocaleString('pt-BR')}
                            </td>
                            <td className="p-4">
                              <span className="font-semibold text-slate-800 block">{desc}</span>
                            </td>
                            <td className="p-4 whitespace-nowrap">
                              <Badge className="bg-slate-100 text-slate-600 shadow-none border-none hover:bg-slate-100 rounded-md">
                                {model}
                              </Badge>
                            </td>
                            <td className="p-4 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                              {event.qty.toLocaleString()}
                            </td>
                            <td className="p-4 text-right font-mono font-bold text-indigo-600 whitespace-nowrap">
                              ${cost.toFixed(5)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>
        )}

      </Tabs>
      </div>
    </AppShell>
  );
}
