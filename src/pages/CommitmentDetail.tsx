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
import { CapacitySemaphore } from "@/components/core/CapacitySemaphore";

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
  const { activeTenantId } = useTenant();

  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<any>(null);

  const commitmentQ = useQuery({
    queryKey: ["commitment", activeTenantId, commitmentId],
    enabled: Boolean(activeTenantId && commitmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_commitments")
        .select("id,tenant_id,commitment_type,status,total_value,customer_entity_id,created_at,updated_at")
        .eq("tenant_id", activeTenantId!)
        .eq("id", commitmentId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("not_found");
      return data as CommitmentRow;
    },
    staleTime: 5_000,
  });

  const itemsQ = useQuery({
    queryKey: ["commitment_items", activeTenantId, commitmentId],
    enabled: Boolean(activeTenantId && commitmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commitment_items")
        .select("id,offering_entity_id,quantity,price,requires_fulfillment,metadata")
        .eq("tenant_id", activeTenantId!)
        .eq("commitment_id", commitmentId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
    staleTime: 5_000,
  });

  const deliverablesQ = useQuery({
    queryKey: ["commitment_deliverables", activeTenantId, commitmentId],
    enabled: Boolean(activeTenantId && commitmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliverables")
        .select("id,status,owner_user_id,due_date,entity_id,updated_at")
        .eq("tenant_id", activeTenantId!)
        .eq("commitment_id", commitmentId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as DeliverableRow[];
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
      return (data ?? []) as CommitmentEventRow[];
    },
    staleTime: 5_000,
  });

  const title = useMemo(() => {
    const c = commitmentQ.data;
    if (!c) return "Compromisso";
    return `${c.commitment_type} • ${c.id.slice(0, 8)}`;
  }, [commitmentQ.data]);

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.commitments">
        <AppShell>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-bold text-slate-900">{title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <Badge variant="secondary">status: {commitmentQ.data?.status ?? "—"}</Badge>
                  <span className="text-xs text-slate-500">id: {commitmentId}</span>
                </div>
              </div>
              <Link
                to="/app/commitments"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Voltar
              </Link>
            </div>

            {activeTenantId ? (
              <RequireTenantRole roles={["admin", "leader", "supervisor", "manager"]}>
                <Card className="rounded-2xl border-slate-200 p-4">
                  <div className="mb-2 text-sm font-semibold text-slate-900">Capacidade (previsão)</div>
                  <CapacitySemaphore tenantId={activeTenantId} />
                </Card>
              </RequireTenantRole>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="rounded-2xl border-slate-200 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-900">Itens</div>
                <div className="space-y-2">
                  {(itemsQ.data ?? []).map((it) => (
                    <div key={it.id} className="flex items-center justify-between rounded-xl border bg-white px-3 py-2">
                      <div className="text-sm text-slate-800">{it.offering_entity_id}</div>
                      <div className="text-sm text-slate-700">qtd: {it.quantity}</div>
                    </div>
                  ))}
                  {(itemsQ.data ?? []).length === 0 ? <div className="text-sm text-slate-600">Sem itens.</div> : null}
                </div>
              </Card>

              <Card className="rounded-2xl border-slate-200 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-900">Deliverables</div>
                <div className="space-y-2">
                  {(deliverablesQ.data ?? []).map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-xl border bg-white px-3 py-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{d.id.slice(0, 8)}</div>
                        <div className="text-xs text-slate-600">
                          status: {d.status ?? "—"} • due: {d.due_date ?? "—"}
                        </div>
                      </div>
                      <Badge variant="secondary">{d.entity_id.slice(0, 8)}</Badge>
                    </div>
                  ))}
                  {(deliverablesQ.data ?? []).length === 0 ? (
                    <div className="text-sm text-slate-600">Ainda não gerados (aguarde orquestrador).</div>
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
