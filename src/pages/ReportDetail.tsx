import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  BarChart3, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Edit3, 
  Download, 
  Printer, 
  FileText,
  Calendar,
  TrendingUp,
  ShoppingCart,
  MessageCircle,
  Eye,
  User,
  Percent,
  Camera,
  Check
} from "lucide-react";
import { format } from "date-fns";
import { toPng } from 'html-to-image';
import { ptBR } from "date-fns/locale";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogTrigger,
    DialogFooter 
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type EntityReport = {
    id: string;
    tenant_id: string;
    entity_id: string;
    period_name: string;
    start_date: string;
    end_date: string;
    visualizations: number;
    profile_visits: number;
    initiated_conversations: number;
    tracked_sales: number;
    sales_percentage: number;
    ad_spend: number;
    advertised_products: string | null;
    production_notes: string | null;
    unit_name: string;
    created_at: string;
};

export default function ReportDetail() {
  const { contractId } = useParams();
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const [selectedUnit, setSelectedUnit] = useState<string>("Geral");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [reportsToPrintIds, setReportsToPrintIds] = useState<string[]>([]);

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

  const units = useMemo(() => {
    const u = new Set<string>(["Geral"]);
    (reportsQ.data || []).forEach(r => {
        if (r.unit_name) u.add(r.unit_name);
    });
    return Array.from(u).sort();
  }, [reportsQ.data]);

  const unitReports = useMemo(() => {
    return (reportsQ.data || []).filter(r => r.unit_name === selectedUnit);
  }, [reportsQ.data, selectedUnit]);

  const selectedReport = useMemo(() => {
    if (selectedPeriodId) {
        return unitReports.find(r => r.id === selectedPeriodId) || unitReports[0];
    }
    return unitReports[0];
  }, [unitReports, selectedPeriodId]);

  const metrics = useMemo(() => {
    if (!selectedReport) return { cpv: 0, cpl: 0, cac: 0 };
    const adSpend = Number(selectedReport.ad_spend) || 0;
    return {
        cpv: adSpend / (selectedReport.profile_visits || 1),
        cpl: adSpend / (selectedReport.initiated_conversations || 1),
        cac: adSpend / (selectedReport.tracked_sales || 1)
    };
  }, [selectedReport]);

  const funnelData = useMemo(() => {
    if (!selectedReport) return [];
    const v = Number(selectedReport.visualizations) || 0;
    const pv = Number(selectedReport.profile_visits) || 0;
    const ic = Number(selectedReport.initiated_conversations) || 0;
    const ts = Number(selectedReport.tracked_sales) || 0;
    
    return [
        { name: "Visualizações", value: v, ratio: 100, color: "#6366f1" },
        { name: "Visitas Perfil", value: pv, ratio: v > 0 ? (pv/v)*100 : 0, color: "#8b5cf6" },
        { name: "Conversas", value: ic, ratio: pv > 0 ? (ic/pv)*100 : 0, color: "#ec4899" },
        { name: "Vendas", value: ts, ratio: ic > 0 ? (ts/ic)*100 : 0, color: "#f59e0b" },
    ];
  }, [selectedReport]);

  const historyData = useMemo(() => {
    return unitReports.slice().reverse().map(r => ({
        name: r.period_name,
        visualizations: r.visualizations,
        visits: r.profile_visits,
        conversations: r.initiated_conversations,
        sales: r.tracked_sales
    }));
  }, [unitReports]);

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
      setIsEditDialogOpen(false);
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
    setIsPrintModalOpen(true);
  };

  const confirmPrint = (selectedIds: string[]) => {
    setReportsToPrintIds(selectedIds);
    setIsPrintModalOpen(false);
    setTimeout(() => {
        window.print();
    }, 500);
  };

  const downloadBatchAsImage = async (selectedIds: string[]) => {
    setIsPrintModalOpen(false);
    
    // Process each report sequentially to avoid browser blocks or high memory usage
    for (const id of selectedIds) {
      const element = document.getElementById(`report-slide-capture-${id}`);
      if (!element) continue;
      
      const report = unitReports.find(r => r.id === id);
      if (!report) continue;

      try {
        const dataUrl = await toPng(element, {
          quality: 1,
          pixelRatio: 2,
          backgroundColor: '#fff',
          width: 1200,
          height: 800
        });
        const link = document.createElement('a');
        link.download = `Relatorio-${contractQ.data?.customer?.display_name}-${report.period_name}.png`;
        link.href = dataUrl;
        link.click();
        
        // Small delay between downloads to help browser handle multiple files
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`Error exporting image for report ${id}:`, err);
      }
    }
  };

  const downloadAsImage = async () => {
    if (!selectedReport) return;
    downloadBatchAsImage([selectedReport.id]);
  };

  if (!contractId) return null;

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.commitments">
        <AppShell>
          <style>{`
            @media print {
              @page { 
                size: landscape; 
                margin: 0 !important; 
              }
              body { 
                background: white !important; 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact;
                margin: 0 !important;
                padding: 0 !important;
              }
              .no-print { display: none !important; }
              
              .report-page {
                height: 98vh !important;
                width: 100vw !important;
                margin: 0 !important;
                padding: 1.5rem 2rem !important;
                box-sizing: border-box !important;
                display: flex !important;
                flex-direction: column !important;
                page-break-after: always !important;
                page-break-inside: avoid !important;
                background: white !important;
                overflow: hidden !important;
              }

              .text-slate-900 { color: #0f172a !important; }
              .text-slate-500 { color: #64748b !important; }
              .text-indigo-600 { color: #4f46e5 !important; }
              .bg-slate-100 { background-color: #f1f5f9 !important; }
              .bg-slate-900 { background-color: #0f172a !important; }
              .bg-indigo-600 { background-color: #4f46e5 !important; }
            }
          `}</style>
          <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 print:pb-0">
              <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between no-print">
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
                  <Button variant="outline" onClick={downloadAsImage} className="gap-2 rounded-xl border-indigo-200 text-indigo-600 hover:bg-indigo-50">
                    <Camera className="h-4 w-4" />
                    Exportar PNG
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
                  <div className="no-print space-y-8">

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
                  <div className="report-main-grid grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left: Stats & Funnel */}
                    <Card className="lg:col-span-7 p-8 rounded-[32px] border-none bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-950/50 dark:shadow-none">
                      <div className="flex items-center justify-between mb-8">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-indigo-500" />
                          Funil de Conversão
                        </h3>
                        <div className="flex gap-2 no-print">
                           <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
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

                      <div className="flex flex-col gap-6">
                        <div className="grid grid-cols-1 gap-6">
                          <Card className="p-8 rounded-[40px] border-none bg-slate-900 text-white shadow-2xl shadow-slate-200">
                            <div className="flex items-center gap-4 mb-6">
                              <div className="h-12 w-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
                                <ShoppingCart className="h-6 w-6 text-indigo-400" />
                              </div>
                              <h3 className="text-xl font-black uppercase tracking-tight">Produtos Anunciados</h3>
                            </div>
                            <p className="text-slate-400 leading-relaxed italic text-lg">
                              {selectedReport.advertised_products || "Nenhum produto listado para este período."}
                            </p>
                          </Card>

                          <Card className="p-8 rounded-[40px] border-none bg-indigo-600 text-white shadow-2xl shadow-indigo-100">
                            <div className="flex items-center gap-4 mb-6">
                              <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center">
                                <Calendar className="h-6 w-6 text-indigo-100" />
                              </div>
                              <h3 className="text-xl font-black uppercase tracking-tight">Produção do Período</h3>
                            </div>
                            <p className="text-indigo-100/80 leading-relaxed italic text-lg">
                              {selectedReport.production_notes || "Nenhuma nota de produção cadastrada para este período."}
                            </p>
                          </Card>
                        </div>

                        <Card className="p-8 rounded-[40px] border-none bg-white shadow-xl shadow-slate-100">
                          <div className="flex items-center gap-4 mb-6">
                            <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                              <BarChart3 className="h-6 w-6 text-indigo-600" />
                            </div>
                            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Evolução Histórica</h3>
                          </div>
                          
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
                </div>

                {/* Print Only Content (Multi-page) */}
                  <div className="hidden print:block">
                    {unitReports.filter(r => reportsToPrintIds.includes(r.id)).map((report, idx) => {
                      const v = Number(report.visualizations) || 0;
                      const pv = Number(report.profile_visits) || 0;
                      const ic = Number(report.initiated_conversations) || 0;
                      const ts = Number(report.tracked_sales) || 0;
                      
                      const printFunnelData = [
                        { name: "Visualizações", value: v, ratio: 100, color: "#6366f1" },
                        { name: "Visitas Perfil", value: pv, ratio: v > 0 ? (pv/v)*100 : 0, color: "#8b5cf6" },
                        { name: "Conversas", value: ic, ratio: pv > 0 ? (ic/pv)*100 : 0, color: "#ec4899" },
                        { name: "Vendas", value: ts, ratio: ic > 0 ? (ts/ic)*100 : 0, color: "#f59e0b" },
                      ];

                      return (
                        <div key={report.id} className="report-page">
                          {/* High Impact Header */}
                          <div className="mb-6 border-b-2 border-slate-900 pb-6 flex justify-between items-end">
                            <div className="flex-1">
                              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-600 mb-2">Relatório Executivo de Performance</p>
                              <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-900 leading-none mb-3">{contractQ.data?.customer?.display_name}</h1>
                              <div className="flex items-center gap-6">
                                <p className="text-lg font-bold text-slate-500 uppercase tracking-widest">{report.unit_name}</p>
                                <div className="h-4 w-px bg-slate-200" />
                                <div className="flex items-center gap-3">
                                  <Calendar className="h-4 w-4 text-indigo-600" />
                                  <p className="text-lg font-black text-slate-900">
                                    {format(new Date(report.start_date), "dd/MM/yyyy")} — {format(new Date(report.end_date), "dd/MM/yyyy")}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Contrato #{contractId?.slice(0, 8)}</p>
                              <div className="bg-slate-100 px-6 py-3 rounded-2xl inline-block border border-slate-200">
                                <p className="text-xl font-black text-slate-900 uppercase">{report.period_name}</p>
                              </div>
                            </div>
                          </div>

                          {/* Main Grid: Funnel & Metrics */}
                          {/* Main Content Area: Funnel & Indicators Side-by-Side */}
                          <div className="flex gap-10 flex-1 min-h-0 overflow-hidden items-stretch">
                            {/* Left: Funnel */}
                            <div className="flex-[1.8] flex flex-col">
                              <h3 className="text-xl font-black uppercase tracking-tighter mb-4 flex items-center gap-3 text-slate-800">
                                <TrendingUp className="h-6 w-6 text-indigo-600" />
                                Funil de Conversão
                              </h3>
                              <div className="flex-1 bg-slate-50/50 rounded-[40px] p-6 border border-slate-100 flex items-center justify-center">
                                <div className="w-full h-full max-h-[480px]">
                                  <FunnelChart data={printFunnelData} isCompact={true} />
                                </div>
                              </div>
                            </div>

                            {/* Right: Performance Grid */}
                            <div className="flex-1 flex flex-col">
                              <h3 className="text-xl font-black uppercase tracking-tighter mb-4 flex items-center gap-3 text-slate-800">
                                <BarChart3 className="h-6 w-6 text-indigo-600" />
                                Indicadores
                              </h3>
                              <div className="grid grid-cols-2 gap-3 flex-1">
                                 <div className="p-5 rounded-[32px] bg-white border-2 border-slate-100 flex flex-col justify-center items-center text-center shadow-sm">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Investimento</p>
                                    <p className="text-xl font-black text-indigo-600">R$ {report.ad_spend.toLocaleString()}</p>
                                 </div>
                                 <div className="p-5 rounded-[32px] bg-slate-900 text-white flex flex-col justify-center items-center text-center">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">ROI (1%)</p>
                                    <p className="text-xl font-black">{(Number(report.sales_percentage || 0)).toFixed(1)}%</p>
                                 </div>
                                 <div className="p-5 rounded-[32px] bg-white border-2 border-slate-100 flex flex-col justify-center items-center text-center">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">CPV</p>
                                    <p className="text-lg font-black text-emerald-600">R$ {(report.ad_spend / (report.profile_visits || 1)).toFixed(2)}</p>
                                 </div>
                                 <div className="p-5 rounded-[32px] bg-white border-2 border-slate-100 flex flex-col justify-center items-center text-center">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">CPL</p>
                                    <p className="text-lg font-black text-blue-600">R$ {(report.ad_spend / (report.initiated_conversations || 1)).toFixed(2)}</p>
                                 </div>
                                 <div className="p-5 rounded-[32px] bg-white border-2 border-slate-100 flex flex-col justify-center items-center text-center">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">CAC</p>
                                    <p className="text-lg font-black text-violet-600">R$ {(report.ad_spend / (report.tracked_sales || 1)).toFixed(2)}</p>
                                 </div>
                                 <div className="p-4 rounded-[32px] bg-indigo-50 border-2 border-indigo-100 flex flex-col justify-center items-center text-center">
                                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Conversão</p>
                                    <p className="text-lg font-black text-indigo-700">{((ts / (ic || 1)) * 100).toFixed(1)}%</p>
                                 </div>
                              </div>
                            </div>
                          </div>

                          {/* Bottom Row: Products & Production */}
                          <div className="grid grid-cols-2 gap-4 mt-6">
                            <div className="p-4 rounded-[30px] bg-slate-900 text-white flex flex-col gap-2">
                              <div className="flex items-center gap-3">
                                <ShoppingCart className="h-4 w-4 text-indigo-400" />
                                <h4 className="text-[10px] font-black uppercase tracking-widest">Produtos Anunciados</h4>
                              </div>
                              <p className="text-[10px] opacity-70 leading-relaxed italic line-clamp-2">
                                {report.advertised_products || "Nenhum produto listado."}
                              </p>
                            </div>

                            <div className="p-4 rounded-[30px] bg-indigo-600 text-white flex flex-col gap-2 shadow-lg shadow-indigo-200">
                              <div className="flex items-center gap-3">
                                <Calendar className="h-4 w-4 text-indigo-200" />
                                <h4 className="text-[10px] font-black uppercase tracking-widest">Produção do Período</h4>
                              </div>
                              <p className="text-[10px] opacity-90 leading-relaxed italic line-clamp-2">
                                {report.production_notes || "Nenhuma nota de produção cadastrada."}
                              </p>
                            </div>
                          </div>

                          {/* Footer Info */}
                          <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center text-slate-400 text-[9px]">
                            <p className="font-bold uppercase tracking-[0.2em]">Confidencial • Gerado via AgenteHub</p>
                            <p>Página {idx + 1} de {reportsToPrintIds.length} • {format(new Date(), "dd/MM/yyyy HH:mm")}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          
          <PrintSelectionDialog 
            reports={unitReports}
            isOpen={isPrintModalOpen}
            onClose={() => setIsPrintModalOpen(false)}
            onConfirm={confirmPrint}
            onExportPng={downloadBatchAsImage}
          />

          {/* Hidden Capture Area for PNG Export */}
          <div className="fixed -left-[4000px] top-0 pointer-events-none">
             {unitReports.map((report) => {
                const v = Number(report.visualizations) || 0;
                const pv = Number(report.profile_visits) || 0;
                const ic = Number(report.initiated_conversations) || 0;
                const ts = Number(report.tracked_sales) || 0;
                const funnelData = [
                  { name: "Visualizações", value: v, ratio: 100, color: "#6366f1" },
                  { name: "Visitas Perfil", value: pv, ratio: v > 0 ? (pv/v)*100 : 0, color: "#8b5cf6" },
                  { name: "Conversas", value: ic, ratio: pv > 0 ? (ic/pv)*100 : 0, color: "#ec4899" },
                  { name: "Vendas", value: ts, ratio: ic > 0 ? (ts/ic)*100 : 0, color: "#f59e0b" },
                ];

                return (
                  <div key={report.id} id={`report-slide-capture-${report.id}`} style={{ width: '1200px', height: '800px' }} className="bg-white p-10 flex flex-col">
                      {/* High Impact Header */}
                      <div className="mb-6 border-b-2 border-slate-900 pb-6 flex justify-between items-end">
                        <div className="flex-1">
                          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-600 mb-2">Relatório Executivo de Performance</p>
                          <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-900 leading-none mb-3">{contractQ.data?.customer?.display_name}</h1>
                          <div className="flex items-center gap-6">
                            <p className="text-lg font-bold text-slate-500 uppercase tracking-widest">{report.unit_name}</p>
                            <div className="h-4 w-px bg-slate-200" />
                            <div className="flex items-center gap-3">
                              <Calendar className="h-4 w-4 text-indigo-600" />
                              <p className="text-lg font-black text-slate-900">
                                {format(new Date(report.start_date), "dd/MM/yyyy")} — {format(new Date(report.end_date), "dd/MM/yyyy")}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Contrato #{contractId?.slice(0, 8)}</p>
                          <div className="bg-slate-100 px-6 py-3 rounded-2xl inline-block border border-slate-200">
                            <p className="text-xl font-black text-slate-900 uppercase">{report.period_name}</p>
                          </div>
                        </div>
                      </div>

                      {/* Main Content Area */}
                      <div className="flex gap-10 flex-1 min-h-0 overflow-hidden items-stretch">
                        <div className="flex-[1.8] flex flex-col">
                          <h3 className="text-xl font-black uppercase tracking-tighter mb-4 flex items-center gap-3 text-slate-800">
                            <TrendingUp className="h-6 w-6 text-indigo-600" />
                            Funil de Conversão
                          </h3>
                          <div className="flex-1 bg-slate-50/50 rounded-[40px] p-6 border border-slate-100 flex items-center justify-center">
                            <div className="w-full h-full max-h-[480px]">
                              <FunnelChart data={funnelData} isCompact={true} />
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 flex flex-col">
                          <h3 className="text-xl font-black uppercase tracking-tighter mb-4 flex items-center gap-3 text-slate-800">
                            <BarChart3 className="h-6 w-6 text-indigo-600" />
                            Indicadores
                          </h3>
                          <div className="grid grid-cols-2 gap-3 flex-1">
                             <div className="p-5 rounded-[32px] bg-white border-2 border-slate-100 flex flex-col justify-center items-center text-center shadow-sm">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Investimento</p>
                                <p className="text-xl font-black text-indigo-600">R$ {report.ad_spend.toLocaleString()}</p>
                             </div>
                             <div className="p-5 rounded-[32px] bg-slate-900 text-white flex flex-col justify-center items-center text-center">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">ROI (1%)</p>
                                <p className="text-xl font-black">{(Number(report.sales_percentage || 0)).toFixed(1)}%</p>
                             </div>
                             <div className="p-5 rounded-[32px] bg-white border-2 border-slate-100 flex flex-col justify-center items-center text-center">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">CPV</p>
                                <p className="text-lg font-black text-emerald-600">R$ {(report.ad_spend / (report.profile_visits || 1)).toFixed(2)}</p>
                             </div>
                             <div className="p-5 rounded-[32px] bg-white border-2 border-slate-100 flex flex-col justify-center items-center text-center">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">CPL</p>
                                <p className="text-lg font-black text-blue-600">R$ {(report.ad_spend / (report.initiated_conversations || 1)).toFixed(2)}</p>
                             </div>
                             <div className="p-5 rounded-[32px] bg-white border-2 border-slate-100 flex flex-col justify-center items-center text-center">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">CAC</p>
                                <p className="text-lg font-black text-violet-600">R$ {(report.ad_spend / (report.tracked_sales || 1)).toFixed(2)}</p>
                             </div>
                             <div className="p-4 rounded-[32px] bg-indigo-50 border-2 border-indigo-100 flex flex-col justify-center items-center text-center">
                                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Conversão</p>
                                <p className="text-lg font-black text-indigo-700">{((ts / (ic || 1)) * 100).toFixed(1)}%</p>
                             </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-6">
                        <div className="p-4 rounded-[30px] bg-slate-900 text-white flex flex-col gap-2">
                          <div className="flex items-center gap-3">
                            <ShoppingCart className="h-4 w-4 text-indigo-400" />
                            <h4 className="text-[10px] font-black uppercase tracking-widest">Produtos Anunciados</h4>
                          </div>
                          <p className="text-[10px] opacity-70 leading-relaxed italic line-clamp-2">
                            {report.advertised_products || "Nenhum produto listado."}
                          </p>
                        </div>
                        <div className="p-4 rounded-[30px] bg-indigo-600 text-white flex flex-col gap-2 shadow-lg shadow-indigo-200">
                          <div className="flex items-center gap-3">
                            <Calendar className="h-4 w-4 text-indigo-200" />
                            <h4 className="text-[10px] font-black uppercase tracking-widest">Produção do Período</h4>
                          </div>
                          <p className="text-[10px] opacity-90 leading-relaxed italic line-clamp-2">
                            {report.production_notes || "Nenhuma nota de produção cadastrada."}
                          </p>
                        </div>
                      </div>
                  </div>
                );
             })}
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}

function PrintSelectionDialog({ 
  reports, 
  isOpen, 
  onClose, 
  onConfirm,
  onExportPng
}: { 
  reports: EntityReport[], 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: (selectedIds: string[]) => void,
  onExportPng: (selectedIds: string[]) => void 
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(reports.map(r => r.id)); // Default select all
    }
  }, [isOpen, reports]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-[32px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black">Exportar Relatórios</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <p className="text-sm text-slate-500 font-medium">Selecione os períodos para incluir no PDF:</p>
          <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {reports.map(r => (
              <div 
                key={r.id} 
                className={cn(
                  "flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer group",
                  selectedIds.includes(r.id) 
                    ? "border-indigo-600 bg-indigo-50/50 shadow-md" 
                    : "border-slate-100 hover:border-slate-200 bg-slate-50/30"
                )}
                onClick={() => {
                  if (selectedIds.includes(r.id)) {
                    setSelectedIds(selectedIds.filter(id => id !== r.id));
                  } else {
                    setSelectedIds([...selectedIds, r.id]);
                  }
                }}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all",
                    selectedIds.includes(r.id) ? "bg-indigo-600 border-indigo-600" : "border-slate-300 bg-white"
                  )}>
                    {selectedIds.includes(r.id) && <Check className="h-4 w-4 text-white" />}
                  </div>
                  <div>
                    <p className="font-black text-slate-900 group-hover:text-indigo-600 transition-colors uppercase text-sm tracking-tight">{r.period_name}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                      {format(new Date(r.start_date), "dd/MM/yy")} — {format(new Date(r.end_date), "dd/MM/yy")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between items-center border-t pt-4">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
            {selectedIds.length} selecionado{selectedIds.length !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} className="rounded-xl font-bold">Cancelar</Button>
            <Button 
              variant="outline"
              onClick={() => onExportPng(selectedIds)} 
              className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-xl font-bold px-6"
              disabled={selectedIds.length === 0}
            >
              Baixar PNGs
            </Button>
            <Button 
              onClick={() => onConfirm(selectedIds)} 
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold px-8 shadow-lg shadow-indigo-200"
              disabled={selectedIds.length === 0}
            >
              Gerar PDF
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportFormDialog({ onSave, isLoading, initialData, existingUnits = [] }: { onSave: (data: any) => void, isLoading: boolean, initialData?: EntityReport, existingUnits?: string[] }) {
    const [formData, setFormData] = useState({
        unit_name: "Geral",
        period_name: "",
        start_date: format(new Date(), "yyyy-MM-01"),
        end_date: format(new Date(), "yyyy-MM-28"),
        visualizations: 0,
        profile_visits: 0,
        initiated_conversations: 0,
        tracked_sales: 0,
        sales_percentage: 0,
        ad_spend: 0,
        advertised_products: "",
        production_notes: ""
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                unit_name: initialData.unit_name || "Geral",
                period_name: initialData.period_name || "",
                start_date: initialData.start_date || format(new Date(), "yyyy-MM-01"),
                end_date: initialData.end_date || format(new Date(), "yyyy-MM-28"),
                visualizations: initialData.visualizations || 0,
                profile_visits: initialData.profile_visits || 0,
                initiated_conversations: initialData.initiated_conversations || 0,
                tracked_sales: initialData.tracked_sales || 0,
                sales_percentage: initialData.sales_percentage || 0,
                ad_spend: initialData.ad_spend || 0,
                advertised_products: initialData.advertised_products || "",
                production_notes: initialData.production_notes || ""
            });
        }
    }, [initialData]);

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

function FunnelChart({ data, isCompact = false }: { data: any[], isCompact?: boolean }) {
    const chartId = useMemo(() => Math.random().toString(36).substr(2, 9), []);
    const actions = ["ATRAIR", "CONVERTER", "RELACIONAR", "VENDER"];
    const labels = ["VISUALIZAÇÕES", "VISITANTES", "LEADS", "CLIENTES"];
    const colors = ["#FF4B6C", "#3B4148", "#FFB020", "#00A3FF"];

    return (
        <div className="w-full flex flex-col items-center gap-1">
            {data.map((item, index) => {
                const action = actions[index] || "PRODUZIR";
                const label = labels[index] || item.name.toUpperCase();
                const color = colors[index] || item.color;
                
                const maxWidth = 550;
                const width = maxWidth - (index * 60);
                const translateX = (700 - width) * 0.5;

                return (
                    <div key={index} className="relative flex flex-col items-center w-full group">
                        <div className={cn(
                            "flex items-center w-full max-w-[700px]",
                            isCompact ? "h-20" : "h-28"
                        )}>
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

                            <div className="flex-1 relative h-full flex items-center justify-center">
                                <svg className="absolute inset-0 w-full h-full drop-shadow-md" preserveAspectRatio="none" viewBox="0 0 700 112">
                                    <defs>
                                        <linearGradient id={`grad-${chartId}-${index}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor={color} />
                                            <stop offset="100%" stopColor={color} stopOpacity="0.9" />
                                        </linearGradient>
                                    </defs>
                                    <g transform={`translate(${translateX}, 20)`}>
                                        <path 
                                            d={isCompact 
                                                ? `M 0,0 L ${width},0 L ${width - 25},50 L -25,50 Z`
                                                : `M 0,0 L ${width},0 L ${width - 40},70 L -40,70 Z`
                                            }
                                            fill={`url(#grad-${chartId}-${index})`}
                                            className="transition-all duration-1000"
                                        />
                                        <path 
                                            d={isCompact
                                                ? `M 5,5 L ${width - 5},5 L ${width - 25},25 L 0,25 Z`
                                                : `M 5,5 L ${width - 5},5 L ${width - 40},30 L 0,30 Z`
                                            }
                                            fill="white"
                                            fillOpacity="0.15"
                                        />
                                        <path 
                                            d={isCompact
                                                ? `M -25,50 L ${width - 25},50 L ${width - 20},55 L -20,55 Z`
                                                : `M -40,70 L ${width - 40},70 L ${width - 35},75 L -35,75 Z`
                                            }
                                            fill="black"
                                            fillOpacity="0.2"
                                        />
                                    </g>
                                </svg>

                                <div className="relative z-10 flex flex-col items-center text-white mt-1">
                                    <span className="text-[10px] font-black tracking-[0.3em] opacity-90 mb-1 drop-shadow-sm">{label}</span>
                                    <span className={cn(
                                        "font-black drop-shadow-lg",
                                        isCompact ? "text-2xl" : "text-3xl"
                                    )}>{item.value.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

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
