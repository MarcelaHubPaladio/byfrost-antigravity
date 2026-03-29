import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { RequireTenantRole } from "@/components/RequireTenantRole";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CapacitySemaphore } from "@/components/core/CapacitySemaphore";
import { showError, showSuccess } from "@/utils/toast";
import {
  Activity,
  CheckCircle2,
  Clock,
  ExternalLink,
  Plus,
  KanbanSquare,
  PackageCheck,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { QueryClient, useQueryClient } from "@tanstack/react-query";

type CommitmentRow = {
  id: string;
  tenant_id: string;
  commitment_type: string;
  status: string | null;
  total_value: number | null;
  customer_entity_id: string;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  offering_entity_id: string;
  quantity: number;
  price: number | null;
  requires_fulfillment: boolean;
  metadata: any;
};

type DeliverableRow = {
  id: string;
  status: string | null;
  owner_user_id: string | null;
  due_date: string | null;
  entity_id: string;
  updated_at: string;
};

type CommitmentEventRow = {
  id: string;
  event_type: string;
  payload_json: any;
  actor_user_id: string | null;
  created_at: string;
};

function formatTs(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export default function CommitmentDetail() {
  const { id } = useParams();
  const commitmentId = String(id ?? "");
  const { activeTenantId, activeTenant, isSuperAdmin } = useTenant();

  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<any>(null);

  const [saving, setSaving] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [targetJourneyId, setTargetJourneyId] = useState<string>("");
  const qc = useQueryClient();

  const commitmentQ = useQuery({
    queryKey: ["commitment", activeTenantId, commitmentId],
    enabled: Boolean(activeTenantId && commitmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_commitments")
        .select(`
          id,
          tenant_id,
          commitment_type,
          status,
          total_value,
          customer_entity_id,
          created_at,
          updated_at,
          customer:core_entities!commercial_commitments_customer_fk(display_name)
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("id", commitmentId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("not_found");
      return data as any;
    },
    staleTime: 5_000,
  });

  const itemsQ = useQuery({
    queryKey: ["commitment_items", activeTenantId, commitmentId],
    enabled: Boolean(activeTenantId && commitmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commitment_items")
        .select(`
          id,
          offering_entity_id,
          quantity,
          price,
          requires_fulfillment,
          metadata,
          offering:core_entities(display_name)
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("commitment_id", commitmentId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 5_000,
  });

  const deliverablesQ = useQuery({
    queryKey: ["commitment_deliverables", activeTenantId, commitmentId],
    enabled: Boolean(activeTenantId && commitmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliverables")
        .select(`
          id,
          status,
          owner_user_id,
          due_date,
          entity_id,
          updated_at,
          name,
          cases:cases(id, state, title, status, deleted_at)
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("commitment_id", commitmentId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 5_000,
  });

  const eventsQ = useQuery({
    queryKey: ["commitment_events", activeTenantId, commitmentId],
    enabled: Boolean(activeTenantId && commitmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_commitment_events")
        .select("id,event_type,payload_json,actor_user_id,created_at")
        .eq("tenant_id", activeTenantId!)
        .eq("commitment_id", commitmentId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 5_000,
  });

  const journeysQ = useQuery({
    queryKey: ["active_journeys", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      // Buscamos apenas jornadas HABILITADAS para este TENANT que não são CRM
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select(`
          enabled,
          journeys!inner(id, name, key, default_state_machine_json, is_crm)
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true)
        .eq("journeys.is_crm", false)
        .order("journeys(name)", { ascending: true });
        
      if (error) throw error;
      // Mapeamos para retornar a estrutura da jornada diretamente
      return (data || []).map(row => row.journeys) as any[];
    },
    staleTime: 30_000,
  });

  const groupedDeliverables = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const d of (deliverablesQ.data ?? [])) {
      const k = d.name || 'Sem nome (legado)';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [deliverablesQ.data]);

  const updateStatus = async (newStatus: string) => {
    if (!activeTenantId || !commitmentId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("commercial_commitments")
        .update({ status: newStatus })
        .eq("tenant_id", activeTenantId)
        .eq("id", commitmentId);
      if (error) throw error;
      showSuccess(`Status atualizado para ${newStatus}`);
      await commitmentQ.refetch();
    } catch (err: any) {
      showError(err.message ?? "Erro ao atualizar status");
    } finally {
      setSaving(false);
    }
  };

  const deleteCommitment = async () => {
    if (!window.confirm("Deseja realmente excluir este compromisso?")) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("commercial_commitments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("tenant_id", activeTenantId!)
        .eq("id", commitmentId);
      if (error) throw error;
      showSuccess("Compromisso excluído.");
      window.location.href = "/app/commitments";
    } catch (err: any) {
      showError(err.message ?? "Erro ao excluir");
      setSaving(false);
    }
  };

  const handleEmitCases = async () => {
    if (!activeTenantId || !targetJourneyId || selectedIds.length === 0) return;
    setSaving(true);
    try {
      const journey = journeysQ.data?.find(j => j.id === targetJourneyId);
      const initialState = (journey?.default_state_machine_json as any)?.initial_state || "FILA";

      const casesToInsert = selectedIds.map(dId => {
        const d = deliverablesQ.data?.find(item => item.id === dId);
        return {
          tenant_id: activeTenantId,
          journey_id: targetJourneyId,
          customer_entity_id: commitmentQ.data?.customer_entity_id,
          deliverable_id: dId,
          title: d?.name || "Tarefa de Contrato",
          status: "open",
          state: initialState,
          meta_json: {
            entity_id: commitmentQ.data?.customer_entity_id,
          }
        };
      });

      const { error } = await supabase
        .from("cases")
        .insert(casesToInsert);

      if (error) throw error;

      showSuccess(`${selectedIds.length} tarefas criadas com sucesso.`);
      setSelectedIds([]);
      setJourneyOpen(false);
      await deliverablesQ.refetch();
    } catch (err: any) {
      showError(err.message ?? "Erro ao criar tarefas");
    } finally {
      setSaving(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const title = useMemo(() => {
    const c = commitmentQ.data;
    if (!c) return "Compromisso";
    return `${c.commitment_type} • ${c.id.slice(0, 8)}`;
  }, [commitmentQ.data]);

  const customerName = commitmentQ.data?.customer?.display_name ?? "Cliente s/ nome";
  const canSeeCapacity = isSuperAdmin || ["admin", "leader", "supervisor", "manager"].includes(activeTenant?.role ?? "");

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.commitments">
        <AppShell>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xl font-bold text-slate-900">{title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <div className="text-sm font-medium text-slate-700">
                    Cliente: <span className="font-bold">{customerName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Select
                      disabled={saving}
                      value={commitmentQ.data?.status ?? "draft"}
                      onValueChange={(v) => updateStatus(v)}
                    >
                      <SelectTrigger className="h-7 w-[110px] rounded-lg text-[11px] font-bold uppercase">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">draft</SelectItem>
                        <SelectItem value="active">active</SelectItem>
                        <SelectItem value="completed">completed</SelectItem>
                        <SelectItem value="cancelled">cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50" onClick={deleteCommitment} disabled={saving}>
                  Excluir
                </Button>
                <Link
                  to="/app/commitments"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Voltar
                </Link>
              </div>
            </div>

            {activeTenantId && canSeeCapacity && (
              <Card className="rounded-2xl border-slate-200 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-900">Capacidade (previsão)</div>
                <CapacitySemaphore tenantId={activeTenantId} />
              </Card>
            )}

            {/* Execution Stats Summary */}
            {commitmentQ.data?.commitment_type === 'contract' && (
              <Card className="overflow-hidden border-none bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shadow-xl dark:from-slate-950 dark:to-slate-900">
                <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-widest opacity-60">Status de Execução</p>
                    <h3 className="text-2xl font-black">Progresso do Contrato</h3>
                  </div>
                  
                  <div className="flex flex-1 max-w-sm flex-col gap-2">
                    <div className="flex items-center justify-between text-xs font-bold uppercase">
                      <span>{Math.round(((deliverablesQ.data ?? []).filter(d => d.status === 'completed').length / Math.max((deliverablesQ.data ?? []).length, 1)) * 100)}% concluído</span>
                      <span className="opacity-60">
                        {(deliverablesQ.data ?? []).filter(d => d.status === 'completed').length} / {(deliverablesQ.data ?? []).length} entregáveis
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-700/50">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-1000" 
                        style={{ width: `${Math.round(((deliverablesQ.data ?? []).filter(d => d.status === 'completed').length / Math.max((deliverablesQ.data ?? []).length, 1)) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase opacity-50">Restantes</p>
                      <p className="text-xl font-black text-amber-400">
                        {(deliverablesQ.data ?? []).length - (deliverablesQ.data ?? []).filter(d => d.status === 'completed').length}
                      </p>
                    </div>
                    <div className="w-[1px] bg-white/10" />
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase opacity-50">Finalizados</p>
                      <p className="text-xl font-black text-emerald-400">
                        {(deliverablesQ.data ?? []).filter(d => d.status === 'completed').length}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="rounded-2xl border-slate-200 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-900">Itens</div>
                <div className="space-y-2">
                  {(itemsQ.data ?? []).map((it) => (
                    <div key={it.id} className="flex items-center justify-between rounded-xl border bg-white px-3 py-2 shadow-sm transition hover:border-slate-300">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {it.offering?.display_name ?? it.offering_entity_id}
                        </div>
                        {it.price && <div className="text-[10px] text-slate-500">Preço: {Number(it.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>}
                      </div>
                      <div className="shrink-0 text-sm font-bold text-slate-700">x{it.quantity}</div>
                    </div>
                  ))}
                  {(itemsQ.data ?? []).length === 0 ? <div className="text-sm text-slate-600">Sem itens.</div> : null}
                </div>
              </Card>

              <Card className="rounded-2xl border-slate-200 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" />
                    Deliverables & Operação
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedIds.length > 0 && (
                      <Button 
                        size="sm" 
                        className="h-6 px-2 gap-1.5 bg-blue-600 text-[9px] font-bold uppercase hover:bg-blue-700"
                        onClick={() => setJourneyOpen(true)}
                      >
                        < KanbanSquare className="w-3 h-3" />
                        Girar {selectedIds.length} Tarefas
                      </Button>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {(deliverablesQ.data ?? []).length} total
                    </Badge>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {groupedDeliverables.length > 0 ? (
                    <Accordion type="multiple" className="space-y-3">
                      {groupedDeliverables.map(([name, group]) => {
                        const completed = group.filter(d => d.status === 'completed').length;
                        const total = group.length;
                        const isFullyDone = completed === total && total > 0;

                        return (
                          <AccordionItem 
                            key={name} 
                            value={name}
                            className="overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:border-blue-200/50"
                          >
                            <AccordionTrigger className="px-4 py-3 hover:no-underline [&[data-state=open]]:bg-slate-50/50">
                              <div className="flex flex-1 items-center justify-between gap-4 text-left">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "grid h-8 w-8 place-items-center rounded-xl transition-colors",
                                    isFullyDone ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"
                                  )}>
                                    <PackageCheck className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">{name}</p>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                      {total} {total === 1 ? 'Instância' : 'Instâncias'}
                                    </p>
                                  </div>
                                </div>
                                <div className="mr-2 flex items-center gap-3">
                                  <div className="text-right">
                                    <p className={cn(
                                      "text-xs font-black",
                                      isFullyDone ? "text-emerald-600" : "text-slate-600"
                                    )}>
                                      {completed}/{total}
                                    </p>
                                    <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-slate-100">
                                      <div 
                                        className={cn("h-full transition-all duration-500", isFullyDone ? "bg-emerald-500" : "bg-blue-500")}
                                        style={{ width: `${(completed / total) * 100}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4 pt-2">
                              <div className="space-y-3 pl-4 border-l-2 border-slate-100 ml-4">
                                {group.map((d, idx) => (
                                  <div key={d.id} className="rounded-xl border bg-slate-50/30 p-3 transition-colors hover:bg-white hover:shadow-sm">
                                    <div className="flex items-start justify-between">
                                      <div className="flex items-start gap-3">
                                        <div className="pt-0.5">
                                          <Checkbox 
                                            checked={selectedIds.includes(d.id)}
                                            onCheckedChange={() => toggleSelect(d.id)}
                                            id={`check-${d.id}`}
                                            className="h-4 w-4 rounded border-slate-300"
                                            disabled={d.cases && d.cases.filter((c:any) => !c.deleted_at).length > 0} // Disable if already has case
                                          />
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-800">
                                            #{idx + 1} — ID: {d.id.slice(0, 8)}
                                            {d.status === 'completed' && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                                          </div>
                                          <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                                            <Clock className="h-3 w-3" />
                                            Vencimento: {d.due_date || "—"}
                                          </div>
                                        </div>
                                      </div>
                                      <Badge variant={d.status === 'completed' ? 'default' : 'secondary'} className="text-[9px] h-4">
                                        {d.status || 'pending'}
                                      </Badge>
                                    </div>

                                    {/* Linked Cases per occurrence */}
                                    <div className="mt-3 space-y-1.5">
                                      {d.cases && d.cases.filter((c:any) => !c.deleted_at).length > 0 ? (
                                        d.cases.filter((c:any) => !c.deleted_at).map((c: any) => (
                                          <Link 
                                            key={c.id} 
                                            to={`/app/operacao-m30/${c.id}`}
                                            className="flex items-center justify-between rounded-lg bg-white p-2 text-xs shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-300"
                                          >
                                            <div className="flex items-center gap-2 truncate">
                                              <KanbanSquare className="h-3 w-3 text-blue-500/70" />
                                              <span className="truncate font-medium text-slate-700">{c.title || "Tarefa sem nome"}</span>
                                            </div>
                                            <Badge variant="outline" className="h-4 px-1 text-[9px] bg-slate-50">
                                              {c.state}
                                            </Badge>
                                          </Link>
                                        ))
                                      ) : (
                                        <div className="text-[10px] text-slate-400 italic bg-white/50 rounded-lg p-2 border border-dashed">
                                          Nenhuma tarefa operacional iniciada.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-10 text-center">
                      <Activity className="h-10 w-10 text-slate-200 mb-2" />
                      <p className="text-sm text-slate-600 font-medium">Aguardando orquestrador para gerar entregáveis...</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            <Card className="rounded-2xl border-slate-200 p-0">
              <div className="border-b px-4 py-3 text-sm font-semibold text-slate-900">Eventos do compromisso</div>
              <div className="divide-y">
                {(eventsQ.data ?? []).map((ev) => (
                  <div key={ev.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{ev.event_type}</Badge>
                        <span className="text-xs text-slate-500">{formatTs(ev.created_at)}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">actor: {ev.actor_user_id ?? "system"}</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPayload(ev.payload_json);
                        setOpen(true);
                      }}
                    >
                      Ver
                    </Button>
                  </div>
                ))}
                {(eventsQ.data ?? []).length === 0 ? (
                  <div className="p-4 text-sm text-slate-600">Sem eventos.</div>
                ) : null}
              </div>
            </Card>

            <Dialog open={journeyOpen} onOpenChange={setJourneyOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Gerar Tarefas Operacionais</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <p className="text-sm text-slate-600">
                    Você selecionou <span className="font-bold text-slate-900">{selectedIds.length}</span> entregáveis. 
                    Escolha para qual Jornada (Pipeline) deseja enviar as tarefas.
                  </p>
                  
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Selecione a Jornada</Label>
                    <Select value={targetJourneyId} onValueChange={setTargetJourneyId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Escolha uma jornada..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(journeysQ.data ?? []).map(j => (
                          <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="ghost" onClick={() => setJourneyOpen(false)}>Cancelar</Button>
                    <Button 
                      className="bg-blue-600 hover:bg-blue-700" 
                      onClick={handleEmitCases}
                      disabled={saving || !targetJourneyId}
                    >
                      {saving ? "Gerando..." : "Confirmar e Gerar"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Payload</DialogTitle>
                </DialogHeader>
                <pre className="max-h-[70vh] overflow-auto rounded-xl border bg-slate-50 p-3 text-xs text-slate-800">
                  {JSON.stringify(payload, null, 2)}
                </pre>
              </DialogContent>
            </Dialog>
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}
