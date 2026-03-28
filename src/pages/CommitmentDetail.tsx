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
import { Activity, CheckCircle2, Clock, KanbanSquare } from "lucide-react";
import { cn } from "@/lib/utils";

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
          cases:cases(id, state, name, status)
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
                  <Badge variant="outline" className="text-[10px]">
                    {(deliverablesQ.data ?? []).length} total
                  </Badge>
                </div>
                
                <div className="space-y-3">
                  {(deliverablesQ.data ?? []).map((d) => (
                    <div key={d.id} className="group relative rounded-2xl border bg-white p-4 transition-all hover:bg-slate-50/50">
                      <div className="flex items-start justify-between">
                        <div className="flex gap-3">
                          <div className={cn(
                            "mt-1 flex h-2 w-2 shrink-0 rounded-full",
                            d.status === 'completed' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-300 dark:bg-slate-700"
                          )} />
                          <div>
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                              Entregável #{d.id.slice(0, 8)}
                              {d.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Due: {d.due_date ?? "—"}</span>
                              <span className="flex items-center gap-1 font-mono uppercase text-[10px]">ID: {d.entity_id.slice(0, 8)}</span>
                            </div>
                          </div>
                        </div>
                        <Badge variant={d.status === 'completed' ? 'default' : 'secondary'} className={cn(
                          "uppercase text-[10px] font-bold px-1.5 py-0",
                          d.status === 'completed' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : ""
                        )}>
                          {d.status ?? "pending"}
                        </Badge>
                      </div>

                      {/* Linked Cases (Operational Status) */}
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Operação (Jornada)</p>
                        {d.cases && d.cases.length > 0 ? (
                          <div className="space-y-1.5">
                            {d.cases.map((c: any) => (
                              <Link 
                                key={c.id} 
                                to={`/cases/${c.id}`}
                                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs transition hover:bg-slate-100"
                              >
                                <div className="flex items-center gap-2">
                                  <KanbanSquare className="h-3 w-3 text-slate-400" />
                                  <span className="font-medium text-slate-700">{c.name || "Tarefa sem nome"}</span>
                                </div>
                                <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-white">
                                  {c.state}
                                </Badge>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 p-2 text-[10px] text-slate-400 italic">
                            Sem tarefas operacionais vinculadas.
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {(deliverablesQ.data ?? []).length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-10 text-center">
                      <Activity className="h-10 w-10 text-slate-200 mb-2" />
                      <p className="text-sm text-slate-600 font-medium">Aguardando orquestrador para gerar entregáveis...</p>
                    </div>
                  ) : null}
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
