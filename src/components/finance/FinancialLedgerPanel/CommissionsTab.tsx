import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, Download, Calendar, DollarSign, Search, Loader2, MoreVertical, Edit2, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";

// Simulating pdf generation to avoid adding extra heavy libraries directly
function generatePDF(report: any) {
  const newWin = window.open("", "_blank");
  if (!newWin) return;

  const html = `
    <html>
      <head>
        <title>Relatório de Comissões - ${report.seller_name}</title>
        <style>
          body { font-family: sans-serif; color: #333; margin: 40px; }
          h1 { color: #4338ca; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f8fafc; font-weight: bold; }
          .summary { display: flex; gap: 40px; margin-top: 20px; background: #f8fafc; padding: 20px; border-radius: 8px; }
          .summary div { display: flex; flex-direction: column; }
          .summary span.label { font-size: 12px; font-weight: bold; color: #64748b; text-transform: uppercase; }
          .summary span.value { font-size: 24px; font-weight: bold; color: #0f172a; }
          .right { text-align: right; }
        </style>
      </head>
      <body>
        <h1>Relatório de Comissões</h1>
        <div><strong>Vendedor:</strong> ${report.seller_name}</div>
        <div><strong>Período:</strong> ${format(new Date(report.period.from), "dd/MM/yyyy")} a ${format(new Date(report.period.to), "dd/MM/yyyy")}</div>
        
        <div class="summary">
          <div>
            <span class="label">Total de Vendas Faturadas</span>
            <span class="value">${report.total_sales.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          </div>
          <div>
            <span class="label">Total de Comissões</span>
            <span class="value">${report.total_commission.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          </div>
        </div>

        <h2>Pedidos</h2>
        <table>
          <thead>
            <tr>
              <th>ID Pedido</th>
              <th>Data</th>
              <th>Cliente</th>
              <th class="right">Valor Total</th>
              <th class="right">Comissão Calculada</th>
            </tr>
          </thead>
          <tbody>
            ${report.orders.map((o: any) => `
              <tr>
                <td>${o.case_id.slice(0, 8)}...</td>
                <td>${format(new Date(o.date), "dd/MM/yyyy")}</td>
                <td>${o.customer_name || o.title}</td>
                <td class="right">${o.total_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                <td class="right">${o.commission_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        
        <p style="margin-top: 40px; font-size: 12px; color: #94a3b8; text-align: center;">Gerado pelo Byfrost</p>
      </body>
    </html>
  `;

  newWin.document.write(html);
  newWin.document.close();
  setTimeout(() => {
    newWin.print();
  }, 500);
}

export function CommissionsTab({
  allowEdit = false,
  allowDelete = false
}: {
  allowEdit?: boolean;
  allowDelete?: boolean;
}) {
  const { activeTenantId } = useTenant();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [selectedReport, setSelectedReport] = useState<any>(null);

  // Edit State
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const reportsQ = useQuery({
    queryKey: ["commission_reports", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .eq("entity_type", "commission_report")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("core_entities")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", activeTenantId!);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Fechamento removido com sucesso.");
      if (selectedReport) setSelectedReport(null);
      queryClient.invalidateQueries({ queryKey: ["commission_reports", activeTenantId] });
    },
    onError: (err: any) => showError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string, name: string }) => {
      const { error } = await supabase
        .from("core_entities")
        .update({ display_name: name, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", activeTenantId!);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      showSuccess("Fechamento atualizado com sucesso.");
      setEditDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["commission_reports", activeTenantId] });
      if (selectedReport && selectedReport.id === variables.id) {
        setSelectedReport({ ...selectedReport, display_name: variables.name });
      }
    },
    onError: (err: any) => showError(err.message),
  });

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Tem certeza que deseja excluir este fechamento permanentemente?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleEditClick = (e: React.MouseEvent, report: any) => {
    e.stopPropagation();
    setEditName(report.display_name);
    setEditingId(report.id);
    setEditDialogOpen(true);
  };

  const saveEdit = () => {
    if (!editName.trim()) {
      showError("Nome não pode ser vazio.");
      return;
    }
    updateMutation.mutate({ id: editingId!, name: editName });
  };

  const filteredReports = React.useMemo(() => {
    let list = reportsQ.data || [];
    if (q) {
      const lower = q.toLowerCase();
      list = list.filter((r) => 
        r.display_name?.toLowerCase().includes(lower) || 
        r.metadata?.seller_name?.toLowerCase().includes(lower)
      );
    }
    return list;
  }, [reportsQ.data, q]);

  if (selectedReport) {
    const meta = selectedReport.metadata;
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setSelectedReport(null)}>
            Voltar para lista
          </Button>
          <div className="flex gap-2">
            {(allowEdit || allowDelete) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {allowEdit && (
                    <DropdownMenuItem onClick={(e) => handleEditClick(e, selectedReport)}>
                      <Edit2 className="w-4 h-4 mr-2" /> Editar Nome
                    </DropdownMenuItem>
                  )}
                  {allowDelete && (
                    <DropdownMenuItem onClick={(e) => handleDelete(e, selectedReport.id)} className="text-rose-600 focus:text-rose-600">
                      <Trash2 className="w-4 h-4 mr-2" /> Excluir
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button 
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => generatePDF(meta)}
            >
              <Download className="w-4 h-4 mr-2" />
              Gerar PDF
            </Button>
          </div>
        </div>

        <Card className="border-0 shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="bg-slate-50 border-b pb-8 pt-8">
            <CardTitle className="text-2xl flex items-center gap-2">
              <FileText className="w-6 h-6 text-indigo-500" />
              {selectedReport.display_name}
            </CardTitle>
            <div className="flex gap-6 mt-4">
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {format(new Date(meta.period.from), "dd/MM/yyyy")} até {format(new Date(meta.period.to), "dd/MM/yyyy")}
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <DollarSign className="w-4 h-4" />
                <span className="text-sm font-medium">{meta.orders.length} pedidos faturados</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100">
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-1">Total de Vendas</p>
                <p className="text-3xl font-black text-emerald-900">
                  {meta.total_sales.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              </div>
              <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100">
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-1">Total de Comissões</p>
                <p className="text-3xl font-black text-indigo-900">
                  {meta.total_commission.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              </div>
            </div>

            <h3 className="font-bold text-lg mb-4">Pedidos do Fechamento</h3>
            <div className="rounded-2xl border overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-6 py-4 font-bold text-slate-600">Pedido</th>
                    <th className="px-6 py-4 font-bold text-slate-600">Data</th>
                    <th className="px-6 py-4 font-bold text-slate-600">Cliente</th>
                    <th className="px-6 py-4 font-bold text-slate-600 text-right">Valor Venda</th>
                    <th className="px-6 py-4 font-bold text-slate-600 text-right">Comissão</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {meta.orders.map((o: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {o.title || o.case_id.slice(0, 8)}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {format(new Date(o.date), "dd/MM/yyyy")}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{o.customer_name || "—"}</td>
                      <td className="px-6 py-4 font-medium text-slate-900 text-right">
                        {o.total_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>
                      <td className="px-6 py-4 font-medium text-indigo-600 text-right bg-indigo-50/30">
                        {o.commission_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>
                    </tr>
                  ))}
                  {meta.orders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic">
                        Nenhum pedido atrelado a este fechamento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Edit Dialog for Single View */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Nome do Fechamento</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Label>Nome</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="mt-2" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
              <Button onClick={saveEdit} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            className="pl-9 h-11 rounded-xl"
            placeholder="Buscar fechamento..." 
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
      </div>

      {reportsQ.isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredReports.map((report) => (
            <Card 
              key={report.id} 
              className="border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer rounded-2xl group overflow-hidden relative"
              onClick={() => setSelectedReport(report)}
            >
              <CardHeader className="bg-slate-50 border-b group-hover:bg-indigo-50/50 transition-colors pb-4 pr-12">
                <CardTitle className="text-base font-bold text-slate-900 flex items-start gap-2">
                  <FileText className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{report.display_name}</span>
                </CardTitle>
                <div className="text-xs text-slate-500 mt-1">
                  Gerado em {format(new Date(report.created_at), "dd/MM/yyyy 'às' HH:mm")}
                </div>
              </CardHeader>
              <CardContent className="p-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Total Vendas</p>
                  <p className="font-semibold text-slate-900">
                    {report.metadata?.total_sales?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "R$ 0,00"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-1">Comissão</p>
                  <p className="font-bold text-indigo-600">
                    {report.metadata?.total_commission?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "R$ 0,00"}
                  </p>
                </div>
              </CardContent>

              {/* Actions Dropdown on Hover */}
              {(allowEdit || allowDelete) && (
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-200/50" onClick={e => e.stopPropagation()}>
                        <MoreVertical className="w-4 h-4 text-slate-500" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {allowEdit && (
                        <DropdownMenuItem onClick={(e) => handleEditClick(e, report)}>
                          <Edit2 className="w-4 h-4 mr-2" /> Editar Nome
                        </DropdownMenuItem>
                      )}
                      {allowDelete && (
                        <DropdownMenuItem onClick={(e) => handleDelete(e, report.id)} className="text-rose-600 focus:text-rose-600">
                          <Trash2 className="w-4 h-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </Card>
          ))}
          {filteredReports.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-dashed">
              Nenhum relatório de comissão encontrado.
            </div>
          )}
        </div>
      )}

      {/* Edit Dialog for List View */}
      {!selectedReport && (
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Nome do Fechamento</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Label>Nome</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="mt-2" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
              <Button onClick={saveEdit} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
