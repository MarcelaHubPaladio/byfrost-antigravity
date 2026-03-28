import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { 
  Briefcase, 
  CheckCircle2, 
  Clock, 
  FileText, 
  Search, 
  TrendingUp,
  LayoutDashboard,
  MoreVertical,
  Activity,
  ChevronRight,
  Loader2,
  Play
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { showError, showSuccess } from "@/utils/toast";
import { useQueryClient } from "@tanstack/react-query";

type ContractWithProgress = {
  id: string;
  status: string | null;
  created_at: string;
  customer: { display_name: string } | null;
  items: { quantity: number | null }[];
  deliverables: { id: string; status: string | null; deleted_at: string | null }[];
};

export default function Contracts() {
  const { activeTenantId } = useTenant();
  const [searchTerm, setSearchTerm] = useState("");

  const contractsQ = useQuery({
    queryKey: ["contracts_dashboard", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_commitments")
        .select(`
          id,
          status,
          commitment_type,
          created_at,
          customer:core_entities!commercial_commitments_customer_fk(display_name),
          items:commitment_items(quantity),
          deliverables(id, status, deleted_at)
        `)
        .eq("commitment_type", "contract")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 10_000,
  });

  const processedContracts = useMemo(() => {
    const list = (contractsQ.data ?? []) as ContractWithProgress[];
    return list.map(c => {
      const items = c.items || [];
      const totalUnits = items.reduce((acc, it) => acc + Number(it.quantity || 0), 0);
      
      const deliverables = (c.deliverables || []).filter(d => d.deleted_at === null);
      const totalDeliverables = deliverables.length;
      
      // Count 'completed' OR 'done' as delivered to be safe
      const completedDeliverablescount = deliverables.filter(d => 
        String(d.status || '').toLowerCase() === 'completed' || 
        String(d.status || '').toLowerCase() === 'done' ||
        String(d.status || '').toLowerCase() === 'entregue'
      ).length;
      
      const progressRatio = totalDeliverables > 0 ? (completedDeliverablescount / totalDeliverables) : 0;
      const percentage = Math.round(progressRatio * 100);
      
      return {
        ...c,
        metrics: {
          total: totalDeliverables,
          completed: completedDeliverablescount,
          percentage,
          total_units: totalUnits,
          total_deliverables: totalDeliverables
        }
      };
    }).filter(c => 
      c.customer?.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [contractsQ.data, searchTerm]);

  const qc = useQueryClient();
  const [isOrchestrating, setIsOrchestrating] = useState<string | null>(null);

  const handleOrchestrate = async (id: string) => {
    setIsOrchestrating(id);
    try {
      // Direct call to edge function to force re-orchestration
      const response = await supabase.functions.invoke("commitment-orchestrator", {
        body: { commitment_id: id },
      });

      if (response.error) {
        console.error("Orchestration error:", response.error);
        showError(`Erro na orquestração: ${response.error.message || "Tente novamente"}`);
        return;
      }

      const result = response.data;
      if (result?.skipped) {
        showSuccess(`Orquestração ignorada: ${result.reason || "Já processado"}`);
      } else {
        showSuccess("Orquestração concluída com sucesso!");
      }

      await contractsQ.refetch();
    } catch (error: any) {
      console.error("Error orchestrating:", error);
      showError("Falha ao iniciar orquestração");
    } finally {
      setIsOrchestrating(null);
    }
  };

  const globalStats = useMemo(() => {
    const list = processedContracts;
    const activeCount = list.filter(c => c.status === 'active').length;
    const completedCount = list.filter(c => c.status === 'completed' || c.metrics.percentage === 100).length;
    const avgProgress = list.length > 0 
      ? Math.round(list.reduce((acc, c) => acc + c.metrics.percentage, 0) / list.length) 
      : 0;
    
    return { activeCount, completedCount, avgProgress };
  }, [processedContracts]);

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.commitments">
        <AppShell>
          <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Section */}
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                  <div className="rounded-2xl bg-blue-600/10 p-2 dark:bg-blue-500/20">
                    <Briefcase className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  Gestor de Contratos
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  Acompanhe a execução e entrega dos seus contratos ativos em tempo real.
                </p>
              </div>
              
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Buscar contrato ou cliente..."
                  className="pl-10 h-11 rounded-2xl border-slate-200 bg-white shadow-sm focus-visible:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Stats Grid */}
            <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
              <Card className="relative overflow-hidden border-none bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white shadow-xl shadow-blue-500/20">
                <div className="relative z-10">
                  <p className="text-sm font-medium opacity-80">Contratos Ativos</p>
                  <h3 className="mt-1 text-4xl font-bold">{globalStats.activeCount}</h3>
                  <div className="mt-4 flex items-center gap-2 text-xs font-semibold">
                    <Activity className="h-3 w-3" />
                    <span>Execução operacional em progresso</span>
                  </div>
                </div>
                <TrendingUp className="absolute -right-4 -top-4 h-32 w-32 opacity-10" />
              </Card>

              <Card className="border-slate-200/60 bg-white/50 p-6 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/50 shadow-sm">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Progresso Médio</p>
                <div className="mt-2 flex items-end justify-between">
                  <h3 className="text-4xl font-bold text-slate-900 dark:text-white">{globalStats.avgProgress}%</h3>
                  <div className="h-12 w-12 rounded-full border-4 border-blue-100 flex items-center justify-center dark:border-blue-900/30">
                     <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  </div>
                </div>
                <Progress value={globalStats.avgProgress} className="mt-4 h-2 bg-slate-100 dark:bg-slate-800 [&>div]:bg-blue-500" />
              </Card>

              <Card className="border-slate-200/60 bg-white/50 p-6 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/50 shadow-sm">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Entregues / Concluídos</p>
                <div className="mt-2 flex items-center gap-3">
                  <h3 className="text-4xl font-bold text-slate-900 dark:text-white">{globalStats.completedCount}</h3>
                  <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                </div>
                <p className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Total de contratos com entrega 100% finalizada
                </p>
              </Card>
            </div>

            {/* Contracts Board */}
            <div className="grid grid-cols-1 gap-6">
              {contractsQ.isLoading ? (
                <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed text-slate-400">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
                    <span>Carregando contratos...</span>
                  </div>
                </div>
              ) : processedContracts.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center dark:border-slate-800 dark:bg-slate-950/50">
                  <FileText className="mb-4 h-12 w-12 text-slate-300" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Nenhum contrato encontrado</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {searchTerm ? "Tente ajustar seus filtros de busca." : "Crie um novo contrato para começar a acompanhar."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {processedContracts.map((c) => (
                    <Link key={c.id} to={`/app/commitments/${c.id}`} className="group block h-full">
                      <Card className="h-full overflow-hidden border-slate-200/60 bg-white transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/5 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-blue-900/50">
                        <div className="p-6">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "flex h-12 w-12 items-center justify-center rounded-2xl shadow-inner transition-colors",
                                c.status === 'active' 
                                  ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" 
                                  : "bg-slate-50 text-slate-400 dark:bg-slate-800/50"
                              )}>
                                <FileText className="h-6 w-6" />
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                  {c.customer?.display_name || "Cliente sem Nome"}
                                </h4>
                                <div className="flex items-center gap-2 text-xs font-mono text-slate-500 uppercase">
                                  <span>#{c.id.slice(0, 8)}</span>
                                  <span>•</span>
                                  <span>{new Date(c.created_at).toLocaleDateString()}</span>
                                  {c.metrics.total_units > 0 && (
                                    <>
                                      <span>•</span>
                                      <span className="text-blue-600 dark:text-blue-400 font-bold">{c.metrics.total_units} itens</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className={cn(
                              "rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                              c.status === 'active' ? "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-blue-500/20" : ""
                            )}>
                              {c.status || 'draft'}
                            </Badge>
                          </div>

                          <div className="mt-8">
                            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-tight text-slate-500 dark:text-slate-400">
                              <span>Execução</span>
                              <span className="text-blue-600 dark:text-blue-400">{c.metrics.percentage}%</span>
                            </div>
                            <Progress value={c.metrics.percentage} className="mt-2 h-2.5 bg-slate-100 dark:bg-slate-900 [&>div]:bg-blue-500" />
                          </div>

                          <div className="mt-6 flex items-center justify-between rounded-xl bg-slate-50/50 p-3 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/50">
                            <div className="flex items-center gap-4">
                              {c.metrics.total > 0 && (
                                <>
                                  <div className="text-center">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Total</p>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{c.metrics.total}</p>
                                  </div>
                                  <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800" />
                                  <div className="text-center">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Entregues</p>
                                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{c.metrics.completed}</p>
                                  </div>
                                  <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800" />
                                  <div className="text-center">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Restantes</p>
                                    <p className="text-sm font-bold text-amber-600 dark:text-amber-500">{c.metrics.total - c.metrics.completed}</p>
                                  </div>
                                </>
                              )}
                              {c.metrics.total_deliverables === 0 && (
                                <div className="flex items-center gap-4 py-1">
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Status da Operação</p>
                                    <p className="text-xs font-semibold text-blue-600">
                                      Nenhum entregável ativo
                                    </p>
                                  </div>
                                  {c.status === 'active' && (
                                    <Button 
                                      size="sm" 
                                      className="h-9 px-4 gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all active:scale-95"
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOrchestrate(c.id); }}
                                      disabled={isOrchestrating === c.id}
                                    >
                                      {isOrchestrating === c.id ? (
                                        <>
                                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                          Gerando...
                                        </>
                                      ) : (
                                        <>
                                          <Play className="w-4 h-4 fill-current" />
                                          Gerar Entregáveis
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-300 dark:bg-slate-800 transition-colors group-hover:bg-blue-500 group-hover:text-white">
                               <ChevronRight className="h-4 w-4" />
                            </div>
                          </div>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}


