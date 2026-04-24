import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Play,
  LayoutGrid,
  List,
  Columns as KanbanIcon,
  User,
  GripVertical
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { showError, showSuccess } from "@/utils/toast";
import { 
  DndContext, 
  DragOverlay, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects
} from "@dnd-kit/core";
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type ContractWithProgress = {
  id: string;
  status: string | null;
  created_at: string;
  customer: { id: string; display_name: string } | null;
  items: { quantity: number | null }[];
  deliverables: { id: string; status: string | null; deleted_at: string | null }[];
};

type ViewMode = "grid" | "list" | "kanban";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  completed: "Concluído",
  canceled: "Cancelado"
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  active: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  canceled: "bg-red-500/10 text-red-600 border-red-500/20"
};

export default function Contracts() {
  const { activeTenantId } = useTenant();
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

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
          customer:core_entities!commercial_commitments_customer_fk(id, display_name),
          items:commitment_items(quantity),
          deliverables(id, status, deleted_at)
        `)
        .eq("commitment_type", "contract")
        .eq("tenant_id", activeTenantId!)
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

  const groupedContracts = useMemo(() => {
    const groups: Record<string, typeof processedContracts> = {};
    const ungrouped: typeof processedContracts = [];

    processedContracts.forEach(c => {
      const customerId = c.customer?.id;
      if (customerId) {
        if (!groups[customerId]) groups[customerId] = [];
        groups[customerId].push(c);
      } else {
        ungrouped.push(c);
      }
    });

    return { groups, ungrouped };
  }, [processedContracts]);

  const qc = useQueryClient();
  const [isOrchestrating, setIsOrchestrating] = useState<string | null>(null);

  const handleOrchestrate = async (id: string) => {
    setIsOrchestrating(id);
    try {
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

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("commercial_commitments")
        .update({ status: newStatus })
        .eq("id", id);
      
      if (error) throw error;
      showSuccess(`Status atualizado para ${STATUS_LABELS[newStatus] || newStatus}`);
      await contractsQ.refetch();
    } catch (err: any) {
      console.error("Error updating status:", err);
      showError("Erro ao atualizar status");
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
            <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
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
              
              <div className="flex flex-col sm:flex-row items-center gap-4">
                {/* View Switcher */}
                <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "rounded-lg px-3 h-9 gap-2 transition-all",
                      viewMode === "grid" ? "bg-white shadow-sm dark:bg-slate-800 text-blue-600" : "text-slate-500"
                    )}
                    onClick={() => setViewMode("grid")}
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span className="hidden sm:inline">Grid</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "rounded-lg px-3 h-9 gap-2 transition-all",
                      viewMode === "list" ? "bg-white shadow-sm dark:bg-slate-800 text-blue-600" : "text-slate-500"
                    )}
                    onClick={() => setViewMode("list")}
                  >
                    <List className="w-4 h-4" />
                    <span className="hidden sm:inline">Lista</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "rounded-lg px-3 h-9 gap-2 transition-all",
                      viewMode === "kanban" ? "bg-white shadow-sm dark:bg-slate-800 text-blue-600" : "text-slate-500"
                    )}
                    onClick={() => setViewMode("kanban")}
                  >
                    <KanbanIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Kanban</span>
                  </Button>
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
            <div className="mt-8">
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
                <>
                  {viewMode === "grid" && (
                    <div className="flex flex-col gap-8">
                      {Object.entries(groupedContracts.groups).map(([customerId, contracts]) => (
                        <div key={customerId} className="space-y-4">
                          <div className="flex items-center gap-2 px-1">
                            <User className="w-5 h-5 text-slate-400" />
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                              {contracts[0].customer?.display_name || "Cliente sem Nome"}
                              <span className="ml-3 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                {contracts.length}
                              </span>
                            </h3>
                          </div>
                          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            {contracts.map(c => (
                              <ContractCard key={c.id} c={c} handleOrchestrate={handleOrchestrate} isOrchestrating={isOrchestrating} />
                            ))}
                          </div>
                        </div>
                      ))}
                      {groupedContracts.ungrouped.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 px-1">
                            <FileText className="w-5 h-5 text-slate-400" />
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Outros Contratos</h3>
                          </div>
                          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            {groupedContracts.ungrouped.map(c => (
                              <ContractCard key={c.id} c={c} handleOrchestrate={handleOrchestrate} isOrchestrating={isOrchestrating} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {viewMode === "list" && (
                    <div className="flex flex-col gap-6">
                      {Object.entries(groupedContracts.groups).map(([customerId, contracts]) => (
                        <div key={customerId} className="rounded-2xl border border-slate-200 bg-white/50 dark:border-slate-800 dark:bg-slate-950/50 overflow-hidden">
                          <div className="bg-slate-50/50 dark:bg-slate-900/50 px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-slate-400" />
                              <h3 className="font-bold text-slate-900 dark:text-white">
                                {contracts[0].customer?.display_name || "Cliente sem Nome"}
                              </h3>
                            </div>
                            <span className="text-xs font-semibold text-slate-500">
                              {contracts.length} contrato(s)
                            </span>
                          </div>
                          <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {contracts.map(c => (
                              <ContractListItem key={c.id} c={c} />
                            ))}
                          </div>
                        </div>
                      ))}
                      <div className="rounded-2xl border border-slate-200 bg-white/50 dark:border-slate-800 dark:bg-slate-950/50 overflow-hidden">
                        <div className="bg-slate-50/50 dark:bg-slate-900/50 px-6 py-3 border-b border-slate-200 dark:border-slate-800">
                          <h3 className="font-bold text-slate-900 dark:text-white">Outros</h3>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {groupedContracts.ungrouped.map(c => (
                            <ContractListItem key={c.id} c={c} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {viewMode === "kanban" && (
                    <KanbanBoard 
                      contracts={processedContracts} 
                      onStatusChange={handleStatusChange}
                      isOrchestrating={isOrchestrating}
                      handleOrchestrate={handleOrchestrate}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}

function ContractCard({ c, handleOrchestrate, isOrchestrating }: { c: any, handleOrchestrate: (id: string) => void, isOrchestrating: string | null }) {
  return (
    <Link to={`/app/commitments/${c.id}`} className="group block h-full">
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
            
            <Badge className={cn(
              "rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              STATUS_COLORS[c.status as string || 'draft']
            )}>
              {STATUS_LABELS[c.status as string || 'draft'] || 'Rascunho'}
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
  );
}

function ContractListItem({ c }: { c: any }) {
  return (
    <Link to={`/app/commitments/${c.id}`} className="group block hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
      <div className="px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <FileText className="w-5 h-5 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <h4 className="font-semibold text-slate-900 dark:text-white truncate">
              {c.customer?.display_name || "Cliente sem Nome"}
            </h4>
            <p className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-2">
              <span>#{c.id.slice(0, 8)}</span>
              <span>•</span>
              <span>{new Date(c.created_at).toLocaleDateString()}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="hidden sm:flex items-center gap-3 w-32">
            <Progress value={c.metrics.percentage} className="h-1.5 flex-1" />
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{c.metrics.percentage}%</span>
          </div>

          <Badge className={cn(
            "rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider w-24 justify-center shrink-0",
            STATUS_COLORS[c.status as string || 'draft']
          )}>
            {STATUS_LABELS[c.status as string || 'draft'] || 'Rascunho'}
          </Badge>

          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition-colors" />
        </div>
      </div>
    </Link>
  );
}

function KanbanBoard({ contracts, onStatusChange, isOrchestrating, handleOrchestrate }: { 
  contracts: any[], 
  onStatusChange: (id: string, status: string) => void,
  isOrchestrating: string | null,
  handleOrchestrate: (id: string) => void
}) {
  const statuses = ['draft', 'active', 'completed', 'canceled'];
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const newStatus = over.id as string;
    const contractId = active.id as string;
    const contract = contracts.find(c => c.id === contractId);

    if (contract && contract.status !== newStatus && statuses.includes(newStatus)) {
      onStatusChange(contractId, newStatus);
    }
    
    setActiveId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-6 overflow-x-auto pb-4 min-h-[600px] snap-x">
        {statuses.map(status => (
          <KanbanColumn 
            key={status} 
            status={status} 
            contracts={contracts.filter(c => (c.status || 'draft') === status)}
            handleOrchestrate={handleOrchestrate}
            isOrchestrating={isOrchestrating}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{
        sideEffects: defaultDropAnimationSideEffects({
          styles: {
            active: {
              opacity: '0.4',
            },
          },
        }),
      }}>
        {activeId ? (
          <div className="w-[300px] scale-105 rotate-3 transition-transform">
             <ContractKanbanCard 
              c={contracts.find(c => c.id === activeId)} 
              isOverlay 
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({ status, contracts, handleOrchestrate, isOrchestrating }: { 
  status: string, 
  contracts: any[],
  handleOrchestrate: (id: string) => void,
  isOrchestrating: string | null
}) {
  const { setNodeRef } = useSortable({
    id: status,
  });

  return (
    <div className="flex flex-col gap-4 min-w-[300px] w-[300px] snap-start">
      <div className="flex items-center justify-between px-2">
        <h3 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
          {STATUS_LABELS[status]}
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] dark:bg-slate-800">
            {contracts.length}
          </span>
        </h3>
      </div>
      
      <div 
        ref={setNodeRef}
        className="flex-1 rounded-2xl bg-slate-50/50 p-3 dark:bg-slate-900/50 border-2 border-dashed border-slate-200 dark:border-slate-800 min-h-[500px] space-y-3"
      >
        <SortableContext 
          items={contracts.map(c => c.id)} 
          strategy={verticalListSortingStrategy}
        >
          {contracts.map(c => (
            <ContractKanbanCard 
              key={c.id} 
              c={c} 
              handleOrchestrate={handleOrchestrate} 
              isOrchestrating={isOrchestrating}
            />
          ))}
        </SortableContext>
        {contracts.length === 0 && (
          <div className="h-20 flex items-center justify-center text-slate-300 text-xs">
            Arraste aqui
          </div>
        )}
      </div>
    </div>
  );
}

function ContractKanbanCard({ c, handleOrchestrate, isOrchestrating, isOverlay }: { 
  c: any, 
  handleOrchestrate?: (id: string) => void, 
  isOrchestrating?: string | null,
  isOverlay?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: c?.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  if (!c) return null;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card className={cn(
        "bg-white shadow-sm border-slate-200 dark:bg-slate-950 dark:border-slate-800 overflow-hidden group cursor-default",
        isOverlay && "shadow-xl border-blue-500/50 ring-1 ring-blue-500"
      )}>
        <div className="p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate pr-6">
                {c.customer?.display_name || "Cliente sem Nome"}
              </h4>
              <p className="text-[10px] font-mono text-slate-500">#{c.id.slice(0, 8)}</p>
            </div>
            <div {...listeners} className="cursor-grab active:cursor-grabbing p-1 -mr-1 text-slate-300 hover:text-slate-500 transition-colors">
              <GripVertical className="w-4 h-4" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold text-slate-500">
              <span>PROGRESSO</span>
              <span>{c.metrics.percentage}%</span>
            </div>
            <Progress value={c.metrics.percentage} className="h-1.5" />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
               <div className="text-[10px]">
                <span className="font-bold text-slate-700 dark:text-slate-300">{c.metrics.completed}</span>
                <span className="text-slate-400">/{c.metrics.total}</span>
              </div>
            </div>
            <Link to={`/app/commitments/${c.id}`} className="text-[10px] font-bold text-blue-600 hover:underline">
              DETALHES
            </Link>
          </div>
          
          {c.status === 'active' && c.metrics.total_deliverables === 0 && handleOrchestrate && (
            <Button 
              size="sm" 
              variant="outline"
              className="w-full text-[10px] h-7 gap-1.5 border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-900/50 dark:text-blue-400"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOrchestrate(c.id); }}
              disabled={isOrchestrating === c.id}
            >
              {isOrchestrating === c.id ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              Gerar Entregáveis
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}


