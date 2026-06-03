import React, { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Calendar as CalendarIcon, DollarSign, FileText, Download, ChevronDown, ChevronRight, AlertCircle, Plus, Edit2, Trash2, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { Loader2 } from "lucide-react";
import { generatePDF, calculateCommissionForSingleOrder } from "@/utils/commissionUtils";
import { useQueryClient } from "@tanstack/react-query";
import { showError, showSuccess } from "@/utils/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export default function CommissionReportDetail() {
  const { id } = useParams<{ id: string }>();
  const { activeTenantId } = useTenant();
  const navigate = useNavigate();
  
  const queryClient = useQueryClient();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  // States for CRUD
  const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);
  const [searchDateRange, setSearchDateRange] = useState<{ from: Date; to: Date | undefined }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [availableOrders, setAvailableOrders] = useState<any[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [newCommissionValue, setNewCommissionValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const toggleRow = (caseId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  };

  const invalidateReport = () => {
    queryClient.invalidateQueries({ queryKey: ["commission_report", activeTenantId, id] });
    queryClient.invalidateQueries({ queryKey: ["commission_reports", activeTenantId] });
  };

  const handleSearchOrders = async () => {
    if (!searchDateRange.from) return;
    setIsSearching(true);
    setAvailableOrders([]);
    setSelectedOrderIds(new Set());
    
    try {
      const report = reportQ.data;
      const meta = report.metadata;
      
      const start = startOfDay(searchDateRange.from).toISOString();
      const end = endOfDay(searchDateRange.to || searchDateRange.from).toISOString();
      
      // Fetch cases in the date range for this seller
      const { data, error } = await supabase
        .from("cases")
        .select("id, title, created_at, assigned_vendor_id, assigned_user_id, customer_accounts(name), case_items(description, code, qty, total)")
        .eq("tenant_id", activeTenantId!)
        .gte("created_at", start)
        .lte("created_at", end)
        .is("deleted_at", null);
        
      if (error) throw error;
      
      // Filter by seller id
      const sellerId = meta.seller_id;
      const filtered = data.filter(c => c.assigned_vendor_id === sellerId || c.assigned_user_id === sellerId);
      
      // Exclude orders already in the report
      const existingIds = new Set(meta.orders?.map((o: any) => o.case_id) || []);
      const newOrders = filtered.filter(c => !existingIds.has(c.id));
      
      setAvailableOrders(newOrders);
      
      if (newOrders.length === 0) {
        showSuccess("Nenhum novo pedido encontrado para este período.");
      }
    } catch (e: any) {
      showError(e.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddOrder = async () => {
    if (selectedOrderIds.size === 0) return;
    setIsAdding(true);
    try {
      const report = reportQ.data;
      const meta = report.metadata;
      
      let updatedTotalSales = meta.total_sales || 0;
      let updatedTotalCommission = meta.total_commission || 0;
      const newOrdersList = [];

      // Calculate commission for each selected order
      for (const orderId of selectedOrderIds) {
        const newOrderData = await calculateCommissionForSingleOrder(orderId, meta.rules_applied);
        newOrdersList.push(newOrderData);
        updatedTotalSales += newOrderData.total_value;
        updatedTotalCommission += newOrderData.commission_value;
      }
      
      const updatedOrders = [...(meta.orders || []), ...newOrdersList];

      const updatedMeta = {
        ...meta,
        orders: updatedOrders,
        total_sales: updatedTotalSales,
        total_commission: updatedTotalCommission
      };

      const { error } = await supabase
        .from("core_entities")
        .update({ metadata: updatedMeta })
        .eq("id", id!);

      if (error) throw error;
      
      showSuccess(`${selectedOrderIds.size} pedido(s) adicionado(s) com sucesso.`);
      setIsAddOrderOpen(false);
      setAvailableOrders([]);
      setSelectedOrderIds(new Set());
      invalidateReport();
    } catch (e: any) {
      showError(e.message || "Erro ao adicionar pedidos.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditCommission = async () => {
    if (!editingOrder) return;
    setIsEditing(true);
    try {
      const report = reportQ.data;
      const meta = report.metadata;
      
      const numValue = parseFloat(newCommissionValue.replace(",", "."));
      if (isNaN(numValue)) throw new Error("Valor inválido.");

      let commissionDiff = 0;

      const updatedOrders = meta.orders.map((o: any) => {
        if (o.case_id === editingOrder.case_id) {
          commissionDiff = numValue - o.commission_value;
          return { ...o, commission_value: numValue };
        }
        return o;
      });

      const updatedTotalCommission = (meta.total_commission || 0) + commissionDiff;

      const updatedMeta = {
        ...meta,
        orders: updatedOrders,
        total_commission: updatedTotalCommission
      };

      const { error } = await supabase
        .from("core_entities")
        .update({ metadata: updatedMeta })
        .eq("id", id!);

      if (error) throw error;
      
      showSuccess("Comissão atualizada.");
      setEditingOrder(null);
      invalidateReport();
    } catch (e: any) {
      showError(e.message);
    } finally {
      setIsEditing(false);
    }
  };

  const handleRemoveOrder = async (orderIdToRemove: string) => {
    if (!confirm("Tem certeza que deseja remover este pedido do extrato?")) return;
    
    try {
      const report = reportQ.data;
      const meta = report.metadata;
      
      const orderToRemove = meta.orders.find((o: any) => o.case_id === orderIdToRemove);
      if (!orderToRemove) return;

      const updatedOrders = meta.orders.filter((o: any) => o.case_id !== orderIdToRemove);
      const updatedTotalSales = (meta.total_sales || 0) - orderToRemove.total_value;
      const updatedTotalCommission = (meta.total_commission || 0) - orderToRemove.commission_value;

      const updatedMeta = {
        ...meta,
        orders: updatedOrders,
        total_sales: Math.max(0, updatedTotalSales),
        total_commission: Math.max(0, updatedTotalCommission)
      };

      const { error } = await supabase
        .from("core_entities")
        .update({ metadata: updatedMeta })
        .eq("id", id!);

      if (error) throw error;
      
      showSuccess("Pedido removido.");
      invalidateReport();
    } catch (e: any) {
      showError("Erro ao remover: " + e.message);
    }
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
            
            <div className="flex gap-2">
              <Button 
                onClick={() => setIsAddOrderOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Pedido
              </Button>
              <Button 
                onClick={() => generatePDF(meta)}
                variant="outline" 
                className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-indigo-600 rounded-xl"
              >
                <Download className="w-4 h-4 mr-2" />
                Baixar PDF
              </Button>
            </div>
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
                  <CalendarIcon className="w-5 h-5 text-slate-400" />
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
                    <th className="px-6 py-4 font-bold text-slate-600 text-right w-20">Ações</th>
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
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:text-indigo-600"
                                onClick={() => {
                                  setEditingOrder(o);
                                  setNewCommissionValue((o.commission_value || 0).toString());
                                }}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:text-rose-600"
                                onClick={() => handleRemoveOrder(o.case_id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50/50">
                            <td colSpan={8} className="px-6 py-4 p-0">
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
                      <td colSpan={8} className="px-6 py-8 text-center text-slate-500 italic">
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

      <Dialog open={isAddOrderOpen} onOpenChange={(v) => { setIsAddOrderOpen(v); if(!v) { setAvailableOrders([]); setSelectedOrderIds(new Set()); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Adicionar Pedido ao Extrato</DialogTitle>
            <DialogDescription>
              Busque por pedidos do vendedor no período desejado para adicioná-los. O sistema irá calcular a comissão baseada nas regras vigentes no momento do fechamento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label>Período (Data de Criação do Pedido)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="date"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-10 rounded-xl",
                        !searchDateRange.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {searchDateRange.from ? (
                        searchDateRange.to ? (
                          <>
                            {format(searchDateRange.from, "dd/MM/yyyy")} -{" "}
                            {format(searchDateRange.to, "dd/MM/yyyy")}
                          </>
                        ) : (
                          format(searchDateRange.from, "dd/MM/yyyy")
                        )
                      ) : (
                        <span>Selecione o período</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={searchDateRange.from}
                      selected={{ from: searchDateRange.from, to: searchDateRange.to }}
                      onSelect={(v: any) => setSearchDateRange(v || { from: undefined, to: undefined })}
                      numberOfMonths={2}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button onClick={handleSearchOrders} disabled={isSearching} className="bg-slate-900 hover:bg-slate-800 h-10 rounded-xl">
                {isSearching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Buscar
              </Button>
            </div>

            {availableOrders.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Pedidos Encontrados ({availableOrders.length})</Label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 text-xs underline"
                    onClick={() => {
                      if (selectedOrderIds.size === availableOrders.length) setSelectedOrderIds(new Set());
                      else setSelectedOrderIds(new Set(availableOrders.map(o => o.id)));
                    }}
                  >
                    {selectedOrderIds.size === availableOrders.length ? "Desmarcar todos" : "Selecionar todos"}
                  </Button>
                </div>
                <div className="rounded-xl border shadow-sm flex-1 min-h-[250px] overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-2 w-10"></th>
                        <th className="px-4 py-2 font-semibold text-slate-600">Pedido</th>
                        <th className="px-4 py-2 font-semibold text-slate-600">Cliente</th>
                        <th className="px-4 py-2 font-semibold text-slate-600 text-right">Valor Total</th>
                        <th className="px-4 py-2 font-semibold text-slate-600">Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {availableOrders.map((o) => {
                        const totalOrder = (o.case_items || []).reduce((acc: number, item: any) => acc + (Number(item.total) || 0), 0);
                        return (
                          <React.Fragment key={o.id}>
                            <tr className="hover:bg-slate-50">
                              <td className="px-4 py-2">
                                <Checkbox 
                                  checked={selectedOrderIds.has(o.id)}
                                  onCheckedChange={(checked) => {
                                    const newSet = new Set(selectedOrderIds);
                                    if (checked) newSet.add(o.id);
                                    else newSet.delete(o.id);
                                    setSelectedOrderIds(newSet);
                                  }}
                                />
                              </td>
                              <td className="px-4 py-2 font-medium text-slate-900">{o.title || o.id.slice(0,8)}</td>
                              <td className="px-4 py-2 text-slate-600">{o.customer_accounts?.name || "—"}</td>
                              <td className="px-4 py-2 text-slate-900 font-semibold text-right">
                                {totalOrder.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                              </td>
                              <td className="px-4 py-2 text-slate-600">{format(new Date(o.created_at), "dd/MM/yyyy")}</td>
                            </tr>
                            {o.case_items && o.case_items.length > 0 && (
                              <tr className="bg-slate-50/30">
                                <td colSpan={5} className="px-4 py-2 text-xs text-slate-500">
                                  <div className="pl-8 flex flex-wrap gap-2">
                                    {o.case_items.map((item: any, idx: number) => (
                                      <span key={idx} className="bg-white border border-slate-200 rounded px-2 py-1 shadow-sm font-medium text-slate-600">
                                        {item.qty}x {item.description || item.code || "Item"}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="mt-auto pt-4">
            <Button variant="outline" onClick={() => setIsAddOrderOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddOrder} disabled={isAdding || selectedOrderIds.size === 0} className="bg-indigo-600 hover:bg-indigo-700">
              {isAdding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Adicionar {selectedOrderIds.size > 0 ? `(${selectedOrderIds.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Comissão</DialogTitle>
            <DialogDescription>
              Ajuste manualmente o valor da comissão deste pedido no extrato atual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Pedido</Label>
              <div className="p-3 bg-slate-50 border rounded-lg text-sm font-medium text-slate-700">
                {editingOrder?.title || editingOrder?.case_id}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Valor da Comissão (R$)</Label>
              <Input 
                type="number"
                step="0.01"
                placeholder="0.00" 
                value={newCommissionValue}
                onChange={(e) => setNewCommissionValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOrder(null)}>Cancelar</Button>
            <Button onClick={handleEditCommission} disabled={isEditing} className="bg-indigo-600 hover:bg-indigo-700">
              {isEditing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar Alteração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
