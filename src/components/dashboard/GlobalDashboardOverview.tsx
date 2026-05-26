import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Activity, Sparkles, Database, ShieldAlert, Zap, Clock, Users, Loader2 } from "lucide-react";
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
  const { activeTenantId } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [generatingJourneyId, setGeneratingJourneyId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<"openai" | "gemini">("openai");
  const [loadingJourneys, setLoadingJourneys] = useState<Record<string, string>>({});

  const generateInsightMut = useMutation({
    mutationFn: async ({ journeyId, model }: { journeyId: string; model: string }) => {
      const idempotencyKey = `MANUAL_GUARDIAO_INSIGHTS:${activeTenantId}:${journeyId}:${Date.now()}`;
      const { error } = await supabase.from("job_queue").insert({
        tenant_id: activeTenantId!,
        type: "GUARDIAO_INSIGHTS_GENERATE",
        idempotency_key: idempotencyKey,
        payload_json: { journey_id: journeyId, model },
        status: "pending",
        run_after: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Geração iniciada", description: "O motor IA está analisando os dados em background. Isso pode levar alguns segundos." });
      setGeneratingJourneyId(null);
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
      
      // Group by journey_id (take the latest one only)
      const latestByJourney = new Map<string, JourneyInsightData>();
      for (const row of data ?? []) {
        if (!latestByJourney.has(row.journey_id)) {
          latestByJourney.set(row.journey_id, row as JourneyInsightData);
        }
      }
      return latestByJourney;
    }
  });

  useEffect(() => {
    if (insightsQ.data && Object.keys(loadingJourneys).length > 0) {
      setLoadingJourneys(prev => {
        const next = { ...prev };
        let changed = false;
        for (const journeyId in next) {
          const newInsight = insightsQ.data.get(journeyId);
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

  const { maxTokens, usedTokens } = tenantPlanQ.data || { maxTokens: 10000, usedTokens: 0 };
  const percentUsed = maxTokens > 0 ? Math.min(100, Math.round((usedTokens / maxTokens) * 100)) : 0;

  return (
    <AppShell title="Dashboard Global (Guardião)">
      <div className="mx-auto max-w-7xl px-4 py-8">
        
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
          <TabsList className="mb-6 grid w-full max-w-md grid-cols-2 bg-slate-100/80 p-1 rounded-xl">
            <TabsTrigger value="overview" className="rounded-lg">Visão Geral</TabsTrigger>
            <TabsTrigger value="timeline" className="rounded-lg">Linha do Tempo Global</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
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
                {journeysQ.data.map(journey => {
                  const insightData = insightsQ.data?.get(journey.id);
                  const insights = insightData?.insights_json ?? [];

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
                        ) : insights.length > 0 ? (
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
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGeneratingJourneyId(null)} disabled={generateInsightMut.isPending}>
                  Cancelar
                </Button>
                <Button 
                  onClick={() => {
                    if (generatingJourneyId) {
                      const oldInsight = insightsQ.data?.get(generatingJourneyId);
                      setLoadingJourneys(prev => ({ ...prev, [generatingJourneyId]: oldInsight?.created_at || 'none' }));
                      generateInsightMut.mutate({ journeyId: generatingJourneyId, model: selectedModel });
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

      </Tabs>
      </div>
    </AppShell>
  );
}
