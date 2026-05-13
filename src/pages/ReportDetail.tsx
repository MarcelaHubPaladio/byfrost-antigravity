import { useState, useMemo, useRef, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  LabelList
} from "recharts";
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Printer, 
  ArrowLeft, 
  FileText, 
  TrendingUp,
  BarChart3,
  Calendar,
  Eye,
  User,
  MessageCircle,
  ShoppingCart,
  Percent,
  Download
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";

type EntityReport = {
  id: string;
  unit_name: string;
  period_name: string;
  start_date: string;
  end_date: string;
  visualizations: number;
  profile_visits: number;
  initiated_conversations: number;
  tracked_sales: number;
  sales_percentage: number;
  ad_spend: number;
  advertised_products: string;
  production_notes: string;
  created_at: string;
};

export default function ReportDetail() {
  const { contractId } = useParams();
  const { activeTenantId } = useTenant();
  const queryClient = useQueryClient();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const contractQ = useQuery({
    queryKey: ["contract_for_report", contractId],
    enabled: Boolean(contractId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_commitments")
        .select(`
          id,
          status,
          customer:core_entities!commercial_commitments_customer_fk(id, display_name, metadata)
        `)
        .eq("id", contractId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const reportsQ = useQuery({
    queryKey: ["entity_reports", contractId],
    enabled: Boolean(contractId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_reports")
        .select("*")
        .eq("contract_id", contractId!)
        .is("deleted_at", null)
        .order("start_date", { ascending: true });
      if (error) {
        console.error("Error fetching reports:", error);
        throw error;
      }
      return data as EntityReport[];
    },
  });

  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);

  const units = useMemo(() => {
    const rawReports = reportsQ.data || [];
    const uniqueUnits = Array.from(new Set(rawReports.map(r => r.unit_name || "Geral")));
    return uniqueUnits.sort();
  }, [reportsQ.data]);

  useEffect(() => {
    if (units.length > 0 && !selectedUnit) {
      setSelectedUnit(units[0]);
    }
  }, [units, selectedUnit]);

  const unitReports = useMemo(() => {
    return (reportsQ.data || []).filter(r => (r.unit_name || "Geral") === selectedUnit);
  }, [reportsQ.data, selectedUnit]);

  const selectedReport = useMemo(() => {
    if (!selectedPeriodId) return unitReports?.[unitReports.length - 1];
    return unitReports?.find(r => r.id === selectedPeriodId);
  }, [unitReports, selectedPeriodId]);

  const funnelData = useMemo(() => {
    if (!selectedReport) return [];
    
    const v = Number(selectedReport.visualizations) || 0;
    const pv = Number(selectedReport.profile_visits) || 0;
    const ic = Number(selectedReport.initiated_conversations) || 0;
    const ts = Number(selectedReport.tracked_sales) || 0;

    const pvRatio = v > 0 ? (pv / v) * 100 : 0;
    const icRatio = pv > 0 ? (ic / pv) * 100 : 0;
    const tsRatio = ic > 0 ? (ts / ic) * 100 : 0;

    return [
      { name: "Visualizações", value: v, ratio: 100, color: "#6366f1" },
      { name: "Visitas Perfil", value: pv, ratio: pvRatio, color: "#8b5cf6" },
      { name: "Conversas", value: ic, ratio: icRatio, color: "#ec4899" },
      { name: "Vendas", value: ts, ratio: tsRatio, color: "#f59e0b" },
    ];
  }, [selectedReport]);

  const historyData = useMemo(() => {
    return unitReports.map(r => ({
      name: r.period_name,
      visualizations: Number(r.visualizations) || 0,
      sales: Number(r.tracked_sales) || 0,
      conversations: Number(r.initiated_conversations) || 0
    }));
  }, [unitReports]);

  const metrics = useMemo(() => {
    if (!selectedReport) return { cpv: 0, cpl: 0, cac: 0 };
    const spend = Number(selectedReport.ad_spend) || 0;
    const visits = Number(selectedReport.profile_visits) || 0;
    const convs = Number(selectedReport.initiated_conversations) || 0;
    const sales = Number(selectedReport.tracked_sales) || 0;

    return {
        cpv: visits > 0 ? (spend / visits) : 0,
        cpl: convs > 0 ? (spend / convs) : 0,
        cac: sales > 0 ? (spend / sales) : 0
    };
  }, [selectedReport]);

  const upsertReportM = useMutation({
    mutationFn: async (report: Partial<EntityReport>) => {
      const payload = {
        ...report,
        tenant_id: activeTenantId,
        entity_id: contractQ.data?.customer?.id,
        contract_id: contractId,
      };

      if (report.id) {
        const { error } = await supabase
          .from("entity_reports")
          .update(payload)
          .eq("id", report.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("entity_reports")
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity_reports", contractId] });
      showSuccess("Relatório salvo com sucesso!");
      setIsDialogOpen(false);
    },
    onError: (err) => {
      showError("Erro ao salvar relatório: " + err.message);
    }
  });

  const deleteReportM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("entity_reports")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entity_reports", contractId] });
      showSuccess("Relatório removido.");
    }
  });

  const handlePrint = () => {
    window.print();
  };

  if (contractQ.isLoading || reportsQ.isLoading) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-500" />
        </div>
      </AppShell>
    );
  }

  if (contractQ.isError || reportsQ.isError) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg mt-20 text-center p-8 rounded-[32px] bg-rose-50 border border-rose-100">
          <h2 className="text-xl font-bold text-rose-900 mb-2">Erro ao carregar dados</h2>
          <p className="text-rose-700 text-sm mb-6">
            Não foi possível carregar as informações do relatório. 
            Isso pode acontecer se a tabela ainda não foi criada no banco de dados ou se houve um erro de conexão.
          </p>
          <Button 
            onClick={() => {
              contractQ.refetch();
              reportsQ.refetch();
            }}
            className="bg-rose-600 hover:bg-rose-700 rounded-xl"
          >
            Tentar Novamente
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.commitments">
        <AppShell>
          <style>{`
            @media print {
              @page { 
                size: landscape; 
                margin: 0.3cm !important; 
              }
              body { 
                background: white !important; 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact;
                zoom: 0.75;
                overflow: hidden !important;
              }
              .no-print { display: none !important; }
              .print-only { display: block !important; }
              
              /* Force Side-by-Side Layout */
              .grid {
                display: flex !important;
                flex-direction: row !important;
                gap: 1rem !important;
                align-items: flex-start !important;
                width: 100% !important;
              }
              
              .lg\:col-span-7 { width: 65% !important; flex: 0 0 65% !important; }
              .lg\:col-span-5 { width: 33% !important; flex: 0 0 33% !important; }
              
              /* Compact Content */
              .card { 
                border: 1px solid #e2e8f0 !important; 
                box-shadow: none !important; 
                break-inside: avoid !important;
                page-break-inside: avoid !important;
                padding: 1rem !important;
                border-radius: 24px !important;
                background: white !important;
              }
              
              /* Scale headers */
              h1.text-5xl { font-size: 2.8rem !important; line-height: 1 !important; margin-bottom: 0.5rem !important; }
              
              /* Reduce Funnel Height */
              .py-6.min-h-\[500px\] { 
                min-height: 350px !important; 
                padding: 0 !important; 
                margin: 0 !important;
              }
              
              .recharts-responsive-container { height: 180px !important; }
              
              .mx-auto { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
              
              /* Force footer to jump up */
              .mt-20 { margin-top: 1rem !important; }
              .pt-10 { padding-top: 0.5rem !important; }
            }
          `}</style>
          <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 print:pb-0">
            {/* Header / Nav */}
            <div className="mb-8 flex items-center justify-between no-print">
              <div className="flex items-center gap-4">
                <Link to="/app/reports">
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </Link>
                <div>
                  <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart3 className="h-6 w-6 text-indigo-500" />
                    Relatórios: {contractQ.data?.customer?.display_name}
                  </h1>
                  <p className="text-sm text-slate-500">Contrato #{contractId?.slice(0, 8)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={handlePrint} className="gap-2 rounded-xl">
                  <Printer className="h-4 w-4" />
                  Imprimir / Exportar
                </Button>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700">
                      <Plus className="h-4 w-4" />
                      Novo Período
                    </Button>
                  </DialogTrigger>
                  <ReportFormDialog 
                    onSave={(data) => upsertReportM.mutate(data)} 
                    isLoading={upsertReportM.isPending}
                    existingUnits={units}
                  />
                </Dialog>
              </div>
            </div>

            {/* Units Tabs */}
            {units.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6 no-print">
                    {units.map(unit => (
                        <Button
                            key={unit}
                            variant={selectedUnit === unit ? "default" : "outline"}
                            size="sm"
                            className={cn(
                                "rounded-full px-6 transition-all",
                                selectedUnit === unit ? "bg-indigo-600 shadow-lg shadow-indigo-500/20" : "bg-white dark:bg-slate-950"
                            )}
                            onClick={() => {
                                setSelectedUnit(unit);
                                setSelectedPeriodId(null);
                            }}
                        >
                            {unit}
                        </Button>
                    ))}
                </div>
            )}

            {!reportsQ.data || reportsQ.data.length === 0 ? (
              <Card className="flex h-64 flex-col items-center justify-center border-dashed text-center p-12 no-print">
                <FileText className="mb-4 h-12 w-12 text-slate-300" />
                <h3 className="text-lg font-semibold">Nenhum período cadastrado</h3>
                <p className="text-sm text-slate-500 mb-6">Comece adicionando os dados do primeiro mês de contrato.</p>
                <Button onClick={() => setIsDialogOpen(true)} variant="outline" className="rounded-xl border-indigo-200 text-indigo-600">
                  Cadastrar Primeiro Período
                </Button>
              </Card>
            ) : (
              <div className="space-y-8" ref={printRef}>
                {/* Print Only Header */}
                <div className="hidden print:block mb-12 border-b-2 border-slate-900 pb-10">
                   <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-600 mb-2">Relatório Executivo de Performance</p>
                        <h1 className="text-5xl font-black uppercase tracking-tighter text-slate-900">{contractQ.data?.customer?.display_name}</h1>
                        <p className="text-xl font-bold text-slate-500 mt-2">{selectedUnit}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Contrato #{contractId?.slice(0, 8)}</p>
                        <p className="text-2xl font-black text-slate-900 mt-1">{selectedReport?.period_name}</p>
                      </div>
                   </div>
                </div>

                {/* Period Selector (Tabs-like) */}
                <div className="flex gap-2 overflow-x-auto pb-2 no-print">
                  {unitReports.map(r => (
                    <Button
                      key={r.id}
                      variant={selectedReport?.id === r.id ? "default" : "outline"}
                      className={cn(
                        "rounded-full px-6 h-10 transition-all",
                        selectedReport?.id === r.id ? "bg-indigo-600" : "hover:border-indigo-200"
                      )}
                      onClick={() => setSelectedPeriodId(r.id)}
                    >
                      {r.period_name}
                    </Button>
                  ))}
                </div>

                {/* Funnel & Main Stats */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 print:grid-cols-1">
                  {/* Left: Stats & Funnel */}
                  <Card className="lg:col-span-7 p-8 rounded-[32px] border-none bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-950/50 dark:shadow-none print:shadow-none print:p-0">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-lg font-bold flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-indigo-500" />
                        Funil de Conversão
                      </h3>
                      <div className="flex gap-2 no-print">
                         <Dialog>
                            <DialogTrigger asChild>
                               <Button variant="ghost" size="icon" className="rounded-full text-slate-400 hover:text-indigo-600">
                                 <Edit3 className="h-4 w-4" />
                               </Button>
                            </DialogTrigger>
                            <ReportFormDialog 
                               initialData={selectedReport}
                               onSave={(data) => upsertReportM.mutate({ ...data, id: selectedReport?.id })} 
                               isLoading={upsertReportM.isPending}
                               existingUnits={units}
                            />
                         </Dialog>
                         <Button 
                            variant="ghost" 
                            size="icon" 
                            className="rounded-full text-slate-400 hover:text-rose-600"
                            onClick={() => {
                                if (confirm("Deseja realmente remover este período?")) {
                                    deleteReportM.mutate(selectedReport!.id);
                                }
                            }}
                        >
                           <Trash2 className="h-4 w-4" />
                         </Button>
                      </div>
                    </div>

                    <div className="py-6 min-h-[500px]">
                        <FunnelChart data={funnelData} />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 mt-8 border-t pt-8">
                           <div className="text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">CPV</p>
                                <p className="text-xl font-black text-emerald-600">
                                    {metrics.cpv > 0 ? `R$ ${metrics.cpv.toFixed(2)}` : "R$ 0,00"}
                                </p>
                                <div className="h-1 w-8 bg-emerald-500 mx-auto mt-2 rounded-full" />
                           </div>
                           <div className="text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">CPL</p>
                                <p className="text-xl font-black text-blue-600">
                                    {metrics.cpl > 0 ? `R$ ${metrics.cpl.toFixed(2)}` : "R$ 0,00"}
                                </p>
                                <div className="h-1 w-8 bg-blue-500 mx-auto mt-2 rounded-full" />
                           </div>
                           <div className="text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">CAC</p>
                                <p className="text-xl font-black text-violet-600">
                                    {metrics.cac > 0 ? `R$ ${metrics.cac.toFixed(2)}` : "R$ 0,00"}
                                </p>
                                <div className="h-1 w-8 bg-violet-500 mx-auto mt-2 rounded-full" />
                           </div>
                           <div className="text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ROI (1%)</p>
                                <p className="text-xl font-black text-slate-900 dark:text-white">{Number(selectedReport?.sales_percentage || 0).toFixed(1)}%</p>
                                <div className="h-1 w-8 bg-slate-300 mx-auto mt-2 rounded-full" />
                           </div>
                           {funnelData.slice(1).map((item, i) => (
                             <div key={i} className="text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.name} / Ant.</p>
                                <p className="text-xl font-black text-slate-700 dark:text-slate-200">{item.ratio.toFixed(1)}%</p>
                                <div className="h-1 w-8 mx-auto mt-2 rounded-full" style={{ backgroundColor: item.color }} />
                             </div>
                           ))}
                    </div>
                  </Card>

                  {/* Right: Info Panels */}
                  <div className="lg:col-span-5 space-y-6">
                    <Card className="p-8 rounded-[32px] border-none bg-slate-900 text-white shadow-xl">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <ShoppingCart className="h-5 w-5 text-indigo-400" />
                            Produtos Anunciados
                        </h3>
                        <p className="text-sm opacity-90 leading-relaxed italic">
                            {selectedReport?.advertised_products || "Nenhum produto listado."}
                        </p>
                    </Card>

                    <Card className="p-8 rounded-[32px] border-none bg-gradient-to-br from-indigo-600 to-indigo-800 text-white shadow-xl shadow-indigo-500/30">
                        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            Produção do Período
                        </h3>
                        <div className="prose prose-invert max-w-none">
                            <p className="text-sm opacity-90 leading-relaxed whitespace-pre-wrap">
                                {selectedReport?.production_notes || "Nenhuma nota de produção cadastrada para este período."}
                            </p>
                        </div>
                    </Card>

                    <Card className="p-8 rounded-[32px] border-none bg-white shadow-lg shadow-slate-200/50 dark:bg-slate-950/50">
                        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-indigo-500" />
                            Performance do Período
                        </h3>
                        
                        {/* Summary Grid for PDF/Dashboard */}
                        <div className="grid grid-cols-3 gap-y-8 gap-x-4">
                            <div className="text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Visualizações</p>
                                <p className="text-xl font-black text-slate-900 dark:text-white">{selectedReport?.visualizations?.toLocaleString()}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Visitas</p>
                                <p className="text-xl font-black text-slate-900 dark:text-white">{selectedReport?.profile_visits?.toLocaleString()}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Conversas</p>
                                <p className="text-xl font-black text-slate-900 dark:text-white">{selectedReport?.initiated_conversations?.toLocaleString()}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Vendas</p>
                                <p className="text-xl font-black text-emerald-600">{selectedReport?.tracked_sales?.toLocaleString()}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Investimento</p>
                                <p className="text-xl font-black text-indigo-600">R$ {selectedReport?.ad_spend?.toLocaleString()}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">ROI (1%)</p>
                                <p className="text-xl font-black text-slate-900 dark:text-white">{Number(selectedReport?.sales_percentage || 0).toFixed(1)}%</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">CPV</p>
                                <p className="text-lg font-bold text-slate-600 dark:text-slate-300">R$ {metrics.cpv.toFixed(2)}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">CPL</p>
                                <p className="text-lg font-bold text-slate-600 dark:text-slate-300">R$ {metrics.cpl.toFixed(2)}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">CAC</p>
                                <p className="text-lg font-bold text-slate-600 dark:text-slate-300">R$ {metrics.cac.toFixed(2)}</p>
                            </div>
                        </div>

                        {/* Line Chart only on screen, hidden in print here */}
                        <div className="h-[200px] w-full mt-8 no-print pt-6 border-t">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-4">Tendência do Período</p>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={historyData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" hide />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="visualizations" stroke="#6366f1" strokeWidth={3} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                  </div>
                </div>

                {/* Print Only Footer (Page 1) */}
                <div className="hidden print:block mt-10 pt-6 border-t text-center text-slate-400 text-[10px]">
                    <p>Relatório gerado em {format(new Date(), "dd/MM/yyyy HH:mm")} • Página 1/2</p>
                    <p className="mt-1 font-bold uppercase tracking-widest">Confidencial • Uso Interno</p>
                </div>

                {/* Page 2: Full Page Historical Evolution (Print Only) */}
                <div className="hidden print:block break-before-page pt-20">
                    <div className="mb-10">
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-600 mb-2">Análise Evolutiva de Performance</p>
                        <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-900">{contractQ.data?.customer?.display_name}</h1>
                        <p className="text-lg font-bold text-slate-500 mt-1">Evolução Histórica - {selectedUnit}</p>
                    </div>

                    <Card className="p-12 rounded-[40px] border-none bg-white">
                        <div className="h-[500px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={historyData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" style={{ fontSize: '12px', fontWeight: 'bold' }} />
                                    <YAxis style={{ fontSize: '12px' }} />
                                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                    <Line name="Visualizações" type="monotone" dataKey="visualizations" stroke="#6366f1" strokeWidth={5} dot={{ r: 6, fill: '#6366f1' }} />
                                    <Line name="Vendas" type="monotone" dataKey="sales" stroke="#f59e0b" strokeWidth={5} dot={{ r: 6, fill: '#f59e0b' }} />
                                    <Line name="Conversas" type="monotone" dataKey="conversations" stroke="#ec4899" strokeWidth={5} dot={{ r: 6, fill: '#ec4899' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-3 gap-8 mt-12 pt-8 border-t">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Melhor Período</p>
                                <p className="text-2xl font-black text-slate-900">
                                    {historyData.reduce((prev, current) => (prev.visualizations > current.visualizations) ? prev : current).name}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Visualizações</p>
                                <p className="text-2xl font-black text-slate-900">
                                    {historyData.reduce((sum, item) => sum + item.visualizations, 0).toLocaleString()}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Conversão Média</p>
                                <p className="text-2xl font-black text-slate-900">
                                    {(historyData.reduce((sum, item) => sum + item.sales, 0) / (historyData.length || 1)).toFixed(1)} / mês
                                </p>
                            </div>
                        </div>
                    </Card>

                    <div className="mt-20 pt-10 border-t text-center text-slate-400 text-[10px]">
                        <p>Relatório gerado em {format(new Date(), "dd/MM/yyyy HH:mm")} • Página 2/2</p>
                        <p className="mt-1 font-bold uppercase tracking-widest">Confidencial • Uso Interno</p>
                    </div>
                </div>
              </div>
            )}
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}

function ReportFormDialog({ onSave, isLoading, initialData, existingUnits = [] }: { onSave: (data: any) => void, isLoading: boolean, initialData?: EntityReport, existingUnits?: string[] }) {
    const [formData, setFormData] = useState({
        unit_name: initialData?.unit_name || "Geral",
        period_name: initialData?.period_name || "",
        start_date: initialData?.start_date || format(new Date(), "yyyy-MM-01"),
        end_date: initialData?.end_date || format(new Date(), "yyyy-MM-28"),
        visualizations: initialData?.visualizations || 0,
        profile_visits: initialData?.profile_visits || 0,
        initiated_conversations: initialData?.initiated_conversations || 0,
        tracked_sales: initialData?.tracked_sales || 0,
        sales_percentage: initialData?.sales_percentage || 0,
        ad_spend: initialData?.ad_spend || 0,
        advertised_products: initialData?.advertised_products || "",
        production_notes: initialData?.production_notes || ""
    });

    return (
        <DialogContent className="max-w-2xl rounded-[32px]">
            <DialogHeader>
                <DialogTitle className="text-2xl font-black">
                    {initialData ? "Editar Período" : "Novo Período de Relatório"}
                </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Unidade / Loja</Label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {existingUnits.map(unit => (
                                <button
                                    key={unit}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, unit_name: unit })}
                                    className={cn(
                                        "text-[10px] px-2 py-1 rounded-md border transition-all",
                                        formData.unit_name === unit 
                                            ? "bg-indigo-600 text-white border-indigo-600" 
                                            : "bg-slate-100 text-slate-600 border-slate-200 hover:border-indigo-300"
                                    )}
                                >
                                    {unit}
                                </button>
                            ))}
                        </div>
                        <Input 
                            value={formData.unit_name} 
                            onChange={e => setFormData({ ...formData, unit_name: e.target.value })}
                            placeholder="Ex: Loja SMS, Matriz..."
                            className="rounded-xl font-bold text-indigo-600"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Nome do Período (Ex: Janeiro 2024)</Label>
                        <Input 
                            value={formData.period_name} 
                            onChange={e => setFormData({ ...formData, period_name: e.target.value })}
                            placeholder="Mês/Ano"
                            className="rounded-xl"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Início</Label>
                            <Input 
                                type="date" 
                                value={formData.start_date} 
                                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                                className="rounded-xl"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Fim</Label>
                            <Input 
                                type="date" 
                                value={formData.end_date} 
                                onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                                className="rounded-xl"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Produtos Anunciados no Período</Label>
                        <Input 
                            value={formData.advertised_products} 
                            onChange={e => setFormData({ ...formData, advertised_products: e.target.value })}
                            placeholder="Ex: Tênis Nike, Camisa Polo..."
                            className="rounded-xl"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Notas de Produção (Produzidos no período)</Label>
                        <Textarea 
                            value={formData.production_notes} 
                            onChange={e => setFormData({ ...formData, production_notes: e.target.value })}
                            placeholder="Planejamento, gravações, edições..."
                            className="h-32 rounded-xl"
                        />
                    </div>
                </div>

                <div className="space-y-4 bg-slate-50 p-6 rounded-3xl dark:bg-slate-900/50">
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Métricas do Funil</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-1.5"><Eye className="h-3 w-3" /> Visualizações</Label>
                            <Input 
                                value={formData.visualizations} 
                                onChange={e => {
                                    // Remove tudo que não for dígito para permitir colar números com separadores
                                    const val = e.target.value.replace(/\D/g, "");
                                    setFormData({ ...formData, visualizations: parseInt(val) || 0 });
                                }}
                                className="rounded-xl bg-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-1.5"><User className="h-3 w-3" /> Visitas Perfil</Label>
                            <Input 
                                value={formData.profile_visits} 
                                onChange={e => {
                                    const val = e.target.value.replace(/\D/g, "");
                                    setFormData({ ...formData, profile_visits: parseInt(val) || 0 });
                                }}
                                className="rounded-xl bg-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-1.5"><MessageCircle className="h-3 w-3" /> Conversas</Label>
                            <Input 
                                value={formData.initiated_conversations} 
                                onChange={e => {
                                    const val = e.target.value.replace(/\D/g, "");
                                    setFormData({ ...formData, initiated_conversations: parseInt(val) || 0 });
                                }}
                                className="rounded-xl bg-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-1.5"><ShoppingCart className="h-3 w-3" /> Vendas</Label>
                            <Input 
                                value={formData.tracked_sales} 
                                onChange={e => {
                                    const val = e.target.value.replace(/\D/g, "");
                                    setFormData({ ...formData, tracked_sales: parseInt(val) || 0 });
                                }}
                                className="rounded-xl bg-white"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-1.5"><Percent className="h-3 w-3" /> % ROI</Label>
                            <Input 
                                type="number" 
                                step="0.01"
                                value={formData.sales_percentage} 
                                onChange={e => setFormData({ ...formData, sales_percentage: parseFloat(e.target.value) || 0 })}
                                className="rounded-xl bg-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-1.5"><Download className="h-3 w-3 rotate-180" /> Gasto (R$)</Label>
                            <Input 
                                type="number"
                                step="0.01"
                                value={formData.ad_spend} 
                                onChange={e => setFormData({ ...formData, ad_spend: parseFloat(e.target.value) || 0 })}
                                className="rounded-xl bg-white"
                            />
                        </div>
                    </div>
                </div>
            </div>
            <DialogFooter>
                <Button 
                    className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => onSave(formData)}
                    disabled={isLoading}
                >
                    {isLoading ? "Salvando..." : "Salvar Período"}
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}

function FunnelChart({ data }: { data: any[] }) {
    const actions = ["ATRAIR", "CONVERTER", "RELACIONAR", "VENDER"];
    const labels = ["VISUALIZAÇÕES", "VISITANTES", "LEADS", "CLIENTES"];
    const colors = ["#FF4B6C", "#3B4148", "#FFB020", "#00A3FF"];

    return (
        <div className="w-full flex flex-col items-center gap-1">
            {data.map((item, index) => {
                const action = actions[index] || "PRODUZIR";
                const label = labels[index] || item.name.toUpperCase();
                const color = colors[index] || item.color;
                
                // Dynamic width based on funnel position
                const maxWidth = 550;
                const width = maxWidth - (index * 60);
                const translateX = (700 - width) * 0.5;

                return (
                    <div key={index} className="relative flex flex-col items-center w-full group">
                        {/* Ribbon Container */}
                        <div className="flex items-center w-full max-w-[700px] h-28">
                            
                            {/* Action Tag (Left) */}
                            <div className="relative z-30 flex items-center -mr-4">
                                <div 
                                    className="h-10 px-5 flex items-center justify-center text-[10px] font-black text-white rounded-l-xl shadow-lg"
                                    style={{ backgroundColor: color }}
                                >
                                    {action}
                                </div>
                                <div 
                                    className="w-0 h-0 border-y-[20px] border-y-transparent border-l-[15px]" 
                                    style={{ borderLeftColor: color }}
                                />
                            </div>

                            {/* Main Body */}
                            <div className="flex-1 relative h-full flex items-center justify-center">
                                {/* SVG Ribbon Shape */}
                                <svg className="absolute inset-0 w-full h-full drop-shadow-2xl" preserveAspectRatio="none" viewBox="0 0 700 112">
                                    <defs>
                                        <linearGradient id={`grad-${index}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor={color} />
                                            <stop offset="100%" stopColor={color} stopOpacity="0.85" />
                                        </linearGradient>
                                    </defs>
                                    <g transform={`translate(${translateX}, 20)`}>
                                        <path 
                                            d={`M 0,0 L ${width},0 L ${width - 40},70 L -40,70 Z`}
                                            fill={`url(#grad-${index})`}
                                            className="transition-all duration-1000"
                                        />
                                        {/* Shine Effect */}
                                        <path 
                                            d={`M 5,5 L ${width - 5},5 L ${width - 40},30 L 0,30 Z`}
                                            fill="white"
                                            fillOpacity="0.15"
                                        />
                                        {/* Darker Bottom Edge for 3D depth */}
                                        <path 
                                            d={`M -40,70 L ${width - 40},70 L ${width - 35},75 L -35,75 Z`}
                                            fill="black"
                                            fillOpacity="0.2"
                                        />
                                    </g>
                                </svg>

                                {/* Text Over SVG - Centered in the 70px ribbon height (which starts at y=20) */}
                                <div className="relative z-10 flex flex-col items-center text-white mt-1">
                                    <span className="text-[10px] font-black tracking-[0.3em] opacity-80 mb-1">{label}</span>
                                    <span className="text-3xl font-black drop-shadow-md">{item.value.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Connector Percentage */}
                        {index < data.length - 1 && (
                             <div className="z-40 -my-6 bg-white dark:bg-slate-900 border-2 border-slate-50 px-4 py-1.5 rounded-full shadow-xl">
                                <span className="text-xs font-black text-slate-600">
                                    {data[index + 1].ratio.toFixed(1)}%
                                </span>
                             </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
