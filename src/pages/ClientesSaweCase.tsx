import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/SessionProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  ChevronLeft, 
  History, 
  Clock, 
  User, 
  Trash2, 
  MoreVertical,
  Activity,
  CheckCircle2,
  PackageCheck,
  ListTodo,
  Calendar,
  Layers
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { CaseTimeline } from "@/components/case/CaseTimeline";
import { ClientDataEditorCard } from "@/components/clientes_sawe/ClientDataEditorCard";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { showError, showSuccess } from "@/utils/toast";

export default function ClientesSaweCase() {
  const { id: caseId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: sessionUser } = useSession();
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();
  const [deleting, setDeleting] = useState(false);

  const { data: caseData, isLoading: isLoadingCase } = useQuery({
    queryKey: ["case", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(`
          *,
          journey:journeys(*)
        `)
        .eq("id", caseId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: timelineEvents } = useQuery({
    queryKey: ["case_timeline", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timeline_events")
        .select("*")
        .eq("case_id", caseId)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: fieldsData, isLoading: isLoadingFields } = useQuery({
    queryKey: ["case_fields", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_fields")
        .select("*")
        .eq("case_id", caseId);
      if (error) throw error;
      return data;
    },
  });

  const commitmentId = caseData?.meta_json?.commitment_id;

  const { data: deliverables, isLoading: isLoadingDeliverables } = useQuery({
    queryKey: ["case_deliverables", activeTenantId, commitmentId],
    enabled: !!activeTenantId && !!commitmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliverables")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .eq("commitment_id", commitmentId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const updateDeliverableStatus = async (deliverableId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("deliverables")
        .update({ status: newStatus })
        .eq("id", deliverableId);
      if (error) throw error;
      showSuccess("Status do entregável atualizado");
      qc.invalidateQueries({ queryKey: ["case_deliverables", activeTenantId, commitmentId] });
    } catch (err: any) {
      showError(err.message || "Erro ao atualizar status");
    }
  };

  const deleteCase = async () => {
    if (!caseId) return;
    try {
      setDeleting(true);
      const { error } = await supabase.from("cases").delete().eq("id", caseId);
      if (error) throw error;
      showSuccess("Cliente excluído");
      navigate("/app/clientes-sawe");
    } catch (err: any) {
      showError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (isLoadingCase || isLoadingFields) {
    return (
      <RequireAuth>
        <AppShell>
          <div className="p-8 space-y-6 bg-slate-50 min-h-screen">
            <Skeleton className="h-12 w-1/3 rounded-2xl" />
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-8 space-y-4">
                <Skeleton className="h-64 rounded-[32px]" />
              </div>
              <div className="col-span-4 space-y-4">
                <Skeleton className="h-96 rounded-[32px]" />
              </div>
            </div>
          </div>
        </AppShell>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <AppShell>
        <div className="flex flex-col h-full bg-[#F8FAFC]">
          {/* Header */}
          <div className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-xl border-b border-slate-200/60 transition-all duration-300">
            <div className="w-full px-8 h-20 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <Link to="/app/clientes-sawe">
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl hover:bg-slate-100/80">
                    <ChevronLeft className="h-5 w-5 text-slate-600" />
                  </Button>
                </Link>
                <div className="h-8 w-px bg-slate-200/60" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-black text-slate-900 tracking-tight">
                      {caseData?.title?.toUpperCase() || "CLIENTE"}
                    </h1>
                    <Badge className="bg-blue-50 text-blue-600 border-blue-100 rounded-lg text-[10px] font-black tracking-widest px-2 py-0.5 h-auto">
                      JORNADA SAWE
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" /> Criado em {new Date(caseData?.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl hover:bg-slate-100">
                      <MoreVertical className="h-5 w-5 text-slate-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-2xl border-slate-200 w-48 p-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="rounded-xl font-bold text-xs h-10 gap-3 cursor-pointer text-red-600 hover:text-red-700 !bg-red-50/0 hover:!bg-red-50 transition-colors">
                          <Trash2 className="w-4 h-4" /> Excluir Cliente
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-[32px]">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir este cliente?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação removerá permanentemente todos os dados e histórico deste cliente na jornada SAWE.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={deleteCase} className="rounded-2xl bg-red-600 hover:bg-red-700">
                            Excluir Definitivamente
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          <main className="flex-grow overflow-auto">
            <div className="w-full px-8 py-8 flex flex-col gap-8">
              <div className="grid grid-cols-12 gap-8">
                {/* Central Section */}
                <div className="col-span-12 lg:col-span-8 space-y-8">
                  <ClientDataEditorCard caseId={caseId!} fields={fieldsData} />

                  {/* Entregáveis do Cliente */}
                  <Card className="rounded-[32px] border-none bg-white p-8 shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                          <PackageCheck className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-slate-900 tracking-tight">Entregáveis do Plano</h3>
                          <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Acompanhamento e Entrega de Serviços</p>
                        </div>
                      </div>
                      <Badge className="bg-slate-50 text-slate-500 border border-slate-100 rounded-lg text-[10px] font-black px-3 py-1">
                        {deliverables?.length || 0} TOTAL
                      </Badge>
                    </div>

                    {deliverables && deliverables.length > 0 ? (
                      <div className="space-y-6">
                        {/* Progress */}
                        {(() => {
                          const completed = deliverables.filter(d => d.status === "completed" || d.status === "done" || d.status === "entregue").length;
                          const pct = Math.round((completed / deliverables.length) * 100);
                          return (
                            <div className="space-y-2 bg-slate-50/50 border border-slate-100 rounded-2xl p-4">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                                <span>PROGRESSO DE EXECUÇÃO</span>
                                <span className="text-blue-600 font-black">{pct}%</span>
                              </div>
                              <Progress value={pct} className="h-2 bg-slate-100 [&>div]:bg-blue-600" />
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                {completed} de {deliverables.length} entregáveis finalizados
                              </p>
                            </div>
                          );
                        })()}

                        {/* List */}
                        <div className="divide-y divide-slate-100">
                          {deliverables.map((del) => {
                            const isDone = del.status === "completed" || del.status === "done" || del.status === "entregue";
                            return (
                              <div key={del.id} className="py-4 flex items-center justify-between first:pt-0 last:pb-0 gap-4">
                                <div className="flex items-center gap-3">
                                  <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${isDone ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                                    {isDone ? <CheckCircle2 className="h-4 w-4" /> : <ListTodo className="h-4 w-4" />}
                                  </div>
                                  <div>
                                    <h4 className={`text-sm font-bold ${isDone ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                                      {del.name}
                                    </h4>
                                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-medium">
                                      <Calendar className="h-3 w-3" />
                                      <span>
                                        {del.due_date ? `Vence em ${new Date(del.due_date).toLocaleDateString("pt-BR")}` : "Sem prazo definido"}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3">
                                  <Select
                                    value={del.status || "pending"}
                                    onValueChange={(val) => updateDeliverableStatus(del.id, val)}
                                  >
                                    <SelectTrigger className={`h-9 w-32 rounded-xl text-[10px] font-bold uppercase transition-all ${
                                      isDone ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                      del.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                      del.status === 'canceled' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                      'bg-slate-50 text-slate-600 border-slate-200'
                                    }`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                      <SelectItem value="pending" className="text-[10px] font-bold uppercase">Pendente</SelectItem>
                                      <SelectItem value="in_progress" className="text-[10px] font-bold uppercase">Em Andamento</SelectItem>
                                      <SelectItem value="completed" className="text-[10px] font-bold uppercase">Concluído</SelectItem>
                                      <SelectItem value="canceled" className="text-[10px] font-bold uppercase">Cancelado</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : isLoadingDeliverables ? (
                      <div className="py-8 text-center text-slate-400 text-xs font-semibold animate-pulse">
                        Carregando entregáveis vinculados...
                      </div>
                    ) : (
                      <div className="rounded-2xl border-2 border-dashed border-slate-100 bg-slate-50/50 p-8 text-center">
                        <Layers className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nenhum entregável ativo</h4>
                        <p className="text-[11px] text-slate-500 font-medium mt-1">Este cliente não possui um plano configurado ou os entregáveis ainda não foram gerados.</p>
                      </div>
                    )}
                  </Card>
                </div>

                {/* Sidebar */}
                <div className="col-span-12 lg:col-span-4 space-y-8">
                  {/* Quick Info */}
                  <Card className="rounded-[32px] p-8 border-none bg-slate-900 text-white shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                      <Activity className="h-24 w-24" />
                    </div>
                    <div className="space-y-6 relative z-10">
                      <div className="flex items-center gap-3 text-slate-400">
                        <History className="h-4 w-4" />
                        <h4 className="text-[10px] font-black uppercase tracking-widest">Resumo da Jornada</h4>
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-2xl font-black tracking-tight">STATUS ATIVO</h2>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cliente monitorado pela linha do tempo</p>
                      </div>
                    </div>
                  </Card>

                  {/* Activity Feed */}
                  <Card className="rounded-[32px] border-slate-200/60 shadow-sm overflow-hidden bg-white">
                    <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-blue-500" />
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Linha do Tempo</h4>
                      </div>
                    </div>
                    <ScrollArea className="h-[600px]">
                      <div className="p-8">
                        <CaseTimeline events={timelineEvents || []} />
                      </div>
                    </ScrollArea>
                  </Card>
                </div>
              </div>
            </div>
          </main>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
