import React, { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { format } from "date-fns";
import { ArrowLeft, Calendar, DollarSign, FileText, Download, ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { Loader2 } from "lucide-react";
import { generatePDF } from "@/utils/commissionUtils";

export default function CommissionReportDetail() {
  const { id } = useParams<{ id: string }>();
  const { activeTenantId } = useTenant();
  const navigate = useNavigate();
  
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (caseId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  };

  const reportQ = useQuery({
    queryKey: ["commission_report", activeTenantId, id],
    enabled: Boolean(activeTenantId && id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .eq("id", id!)
        .single();
      
      if (error) throw error;
      return data;
    }
  });

  if (reportQ.isLoading) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      </AppShell>
    );
  }

  if (reportQ.isError || !reportQ.data) {
    return (
      <AppShell>
        <div className="flex h-full flex-col items-center justify-center space-y-4">
          <p className="text-slate-500">Relatório não encontrado ou erro ao carregar.</p>
          <Button onClick={() => navigate("/app/orders/commissions")}>Voltar</Button>
        </div>
      </AppShell>
    );
  }

  const report = reportQ.data;
  const meta = report.metadata;

  return (
    <AppShell>
      <div className="flex-1 overflow-auto bg-slate-50/50">
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" asChild className="h-10 w-10 text-slate-500 rounded-full bg-white shadow-sm hover:shadow-md transition-shadow">
                <Link to="/app/orders/commissions">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <FileText className="w-6 h-6 text-indigo-500 hidden sm:block" />
                  {report.display_name}
                </h1>
                <p className="text-slate-500 text-sm mt-1">
                  Gerado em {format(new Date(report.created_at), "dd/MM/yyyy 'às' HH:mm")}
                </p>
              </div>
            </div>
            
            <Button 
              onClick={() => generatePDF(meta)}
              variant="outline" 
              className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-indigo-600 rounded-xl"
            >
              <Download className="w-4 h-4 mr-2" />
              Baixar PDF
            </Button>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60">
            
            <div className="flex flex-col md:flex-row gap-6 mb-8">
              <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100 flex-1">
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-1 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> Total de Vendas
                </p>
                <p className="text-3xl md:text-4xl font-black text-emerald-900">
                  {meta.total_sales?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "R$ 0,00"}
                </p>
              </div>
              <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100 flex-1">
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-1 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> Total de Comissões
                </p>
                <p className="text-3xl md:text-4xl font-black text-indigo-900">
                  {meta.total_commission?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "R$ 0,00"}
                </p>
              </div>
              
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex-1 flex flex-col justify-center space-y-3">
                <div className="flex items-center gap-3 text-slate-700">
                  <Calendar className="w-5 h-5 text-slate-400" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Período de Faturamento</p>
                    <p className="font-semibold text-sm">
                      {format(new Date(meta.period.from), "dd/MM/yyyy")} até {format(new Date(meta.period.to), "dd/MM/yyyy")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-slate-700">
                  <FileText className="w-5 h-5 text-slate-400" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Volume</p>
                    <p className="font-semibold text-sm">{meta.orders?.length || 0} pedidos</p>
                  </div>
                </div>
              </div>
            </div>

            <h3 className="font-bold text-lg mb-4 text-slate-800">Detalhamento dos Pedidos</h3>
            <div className="rounded-2xl border overflow-x-auto shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-6 py-4 font-bold text-slate-600 w-10"></th>
                    <th className="px-6 py-4 font-bold text-slate-600">Pedido</th>
                    <th className="px-6 py-4 font-bold text-slate-600">Cliente</th>
                    <th className="px-6 py-4 font-bold text-slate-600">Data da Venda</th>
                    <th className="px-6 py-4 font-bold text-slate-600">Faturado em</th>
                    <th className="px-6 py-4 font-bold text-slate-600 text-right">Valor Total</th>
                    <th className="px-6 py-4 font-bold text-slate-600 text-right">Comissão</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {meta.orders?.map((o: any, idx: number) => {
                    const isExpanded = expandedRows.has(o.case_id);
                    return (
                      <React.Fragment key={idx}>
                        <tr className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4 cursor-pointer" onClick={() => toggleRow(o.case_id)}>
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />
                            )}
                          </td>
                          <td className="px-6 py-4 font-bold text-indigo-600 hover:underline">
                            <Link to={`/app/orders/${o.case_id}`}>
                              {o.title || o.case_id.slice(0, 8)}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-slate-700 font-medium">{o.customer_name || "—"}</td>
                          <td className="px-6 py-4 text-slate-600">
                            {o.sale_date ? format(new Date(o.sale_date), "dd/MM/yyyy") : format(new Date(o.date || new Date()), "dd/MM/yyyy")}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {o.billing_date ? format(new Date(o.billing_date), "dd/MM/yyyy") : <span className="text-slate-400 italic">N/D</span>}
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-900 text-right">
                            {(o.total_value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </td>
                          <td className="px-6 py-4 font-bold text-indigo-600 text-right bg-indigo-50/20">
                            {(o.commission_value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50/50">
                            <td colSpan={7} className="px-6 py-4 p-0">
                              <div className="pl-16 pr-6 py-4">
                                {o.items && o.items.length > 0 ? (
                                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                                    <table className="w-full text-xs">
                                      <thead className="bg-slate-100/50 text-slate-500 border-b">
                                        <tr>
                                          <th className="px-4 py-2 text-left font-semibold">Produto/Serviço</th>
                                          <th className="px-4 py-2 text-center font-semibold">Qtd</th>
                                          <th className="px-4 py-2 text-right font-semibold">Preço Unit.</th>
                                          <th className="px-4 py-2 text-right font-semibold">Desconto</th>
                                          <th className="px-4 py-2 text-right font-semibold">Total Item</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y border-slate-100">
                                        {o.items.map((it: any, i: number) => (
                                          <tr key={i} className="hover:bg-slate-50">
                                            <td className="px-4 py-2 font-medium text-slate-700">{it.name}</td>
                                            <td className="px-4 py-2 text-center text-slate-500">{it.qty}</td>
                                            <td className="px-4 py-2 text-right text-slate-600">
                                              {(it.price || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                            </td>
                                            <td className="px-4 py-2 text-right text-rose-600 font-medium">
                                              {it.discount_percent > 0 ? `${it.discount_percent}%` : "—"}
                                            </td>
                                            <td className="px-4 py-2 text-right font-bold text-slate-900">
                                              {(it.total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-slate-400 text-sm italic py-2">
                                    <AlertCircle className="w-4 h-4" />
                                    Relatório antigo sem detalhamento de itens.
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {(!meta.orders || meta.orders.length === 0) && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-500 italic">
                        Nenhum pedido faturado para listar neste fechamento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      </div>
    </AppShell>
  );
}
