import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { RequireTenantRole } from "@/components/RequireTenantRole";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommitmentDeliverablesPreview, type CommitmentItemDraft } from "@/components/core/CommitmentDeliverablesPreview";
import { CapacitySemaphore } from "@/components/core/CapacitySemaphore";
import { showError, showSuccess } from "@/utils/toast";

type EntityOpt = { id: string; display_name: string; entity_type: string };

type CommitmentRow = {
  id: string;
  commitment_type: string;
  status: string | null;
  total_value: number | null;
  customer_entity_id: string;
  created_at: string;
};

function isoDatePlusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function Commitments() {
  const qc = useQueryClient();
  const { activeTenantId, isSuperAdmin } = useTenant();
  const [sp] = useSearchParams();

  const customerPreset = String(sp.get("customer") ?? "").trim();

  const [customerQ, setCustomerQ] = useState("");
  const [offeringQ, setOfferingQ] = useState("");
  const [commitmentType, setCommitmentType] = useState<"contract" | "order" | "subscription">("order");
  const [activateNow, setActivateNow] = useState(true);

  const [customerId, setCustomerId] = useState(customerPreset);

  const [items, setItems] = useState<
    Array<{ offering_entity_id: string; quantity: number; price: string; requires_fulfillment: boolean }>
  >([{ offering_entity_id: "", quantity: 1, price: "", requires_fulfillment: true }]);

  const [saving, setSaving] = useState(false);

  const customersQ = useQuery({
    queryKey: ["commitment_customers", activeTenantId, customerQ],
    enabled: Boolean(activeTenantId && customerQ.trim().length >= 2),
    queryFn: async () => {
      const term = customerQ.trim();
      const { data, error } = await supabase
        .from("core_entities")
        .select("id,display_name,entity_type")
        .eq("tenant_id", activeTenantId!)
        .eq("entity_type", "party")
        .is("deleted_at", null)
        .ilike("display_name", `%${term}%`)
        .order("updated_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as EntityOpt[];
    },
    staleTime: 5_000,
  });

  const offeringsQ = useQuery({
    queryKey: ["commitment_offerings", activeTenantId, offeringQ],
    enabled: Boolean(activeTenantId && offeringQ.trim().length >= 2),
    queryFn: async () => {
      const term = offeringQ.trim();
      const { data, error } = await supabase
        .from("core_entities")
        .select("id,display_name,entity_type")
        .eq("tenant_id", activeTenantId!)
        .eq("entity_type", "offering")
        .is("deleted_at", null)
        .ilike("display_name", `%${term}%`)
        .order("updated_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as EntityOpt[];
    },
    staleTime: 5_000,
  });

  const listQ = useQuery({
    queryKey: ["commitments", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_commitments")
        .select("id,commitment_type,status,total_value,customer_entity_id,created_at")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as CommitmentRow[];
    },
    staleTime: 5_000,
  });

  const previewItems: CommitmentItemDraft[] = useMemo(() => {
    return items
      .filter((it) => Boolean(it.offering_entity_id))
      .map((it) => ({ offering_entity_id: it.offering_entity_id, quantity: Number(it.quantity ?? 1) }));
  }, [items]);

  const extraDemandMinutes = 0; // preview minutes could be summed later; keep simple.
  const extraDemandOnDate = isoDatePlusDays(7);

  // Visibility of the semaphore is enforced by <RequireTenantRole> below.

  const createCommitment = async () => {
    if (!activeTenantId) return;
    if (!customerId) {
      showError("Selecione o cliente (party). ");
      return;
    }

    const cleanItems = items
      .filter((it) => it.offering_entity_id)
      .map((it) => ({
        offering_entity_id: it.offering_entity_id,
        quantity: Number(it.quantity ?? 1),
        price: it.price ? Number(it.price) : null,
        requires_fulfillment: Boolean(it.requires_fulfillment),
        metadata: {},
      }));

    if (cleanItems.length === 0) {
      showError("Adicione ao menos 1 item (offering). ");
      return;
    }

    setSaving(true);
    try {
      const { data: created, error: cErr } = await supabase
        .from("commercial_commitments")
        .insert({
          tenant_id: activeTenantId,
          commitment_type: commitmentType,
          customer_entity_id: customerId,
          status: activateNow ? "active" : "draft",
          total_value: null,
        })
        .select("id")
        .single();

      if (cErr) throw cErr;

      const commitmentId = String((created as any).id);

      const { error: iErr } = await supabase.from("commitment_items").insert(
        cleanItems.map((it) => ({
          tenant_id: activeTenantId,
          commitment_id: commitmentId,
          ...it,
        }))
      );
      if (iErr) throw iErr;

      showSuccess("Compromisso criado.");
      await qc.invalidateQueries({ queryKey: ["commitments", activeTenantId] });

      // Navigate to detail
      window.location.href = `/app/commitments/${commitmentId}`;
    } catch (e: any) {
      showError(e?.message ?? "Falha ao criar compromisso");
    } finally {
      setSaving(false);
    }
  };

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.commitments">
        <AppShell>
          <div className="space-y-6">
            <div>
              <div className="text-xl font-bold text-slate-900">Compromissos</div>
              <div className="text-sm text-slate-600">Crie um compromisso e o sistema gera trabalho automaticamente.</div>
            </div>

            <Card className="rounded-2xl border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">Novo compromisso</div>
                <Badge variant="secondary">{activateNow ? "ativará" : "rascunho"}</Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate-700">Tipo</div>
                  <Select value={commitmentType} onValueChange={(v) => setCommitmentType(v as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="order">order</SelectItem>
                      <SelectItem value="contract">contract</SelectItem>
                      <SelectItem value="subscription">subscription</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-xs font-semibold text-slate-700">Cliente (party)</div>
                  <Input
                    placeholder="Buscar cliente… (min 2)"
                    value={customerQ}
                    onChange={(e) => setCustomerQ(e.target.value)}
                  />
                  {customersQ.data?.length ? (
                    <div className="mt-2 max-h-44 overflow-auto rounded-xl border bg-white">
                      {customersQ.data.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => {
                            setCustomerId(c.id);
                            setCustomerQ(c.display_name);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          {c.display_name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {customerId ? <div className="mt-1 text-xs text-slate-600">selecionado: {customerId}</div> : null}
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold text-slate-700">Itens</div>
                <div className="space-y-3">
                  {items.map((it, idx) => (
                    <div key={idx} className="grid gap-2 rounded-2xl border bg-white p-3 md:grid-cols-6">
                      <div className="md:col-span-3">
                        <div className="mb-1 text-xs font-semibold text-slate-700">Offering</div>
                        <Input
                          placeholder="Buscar offering… (min 2)"
                          value={idx === 0 ? offeringQ : it.offering_entity_id}
                          onChange={(e) => {
                            if (idx === 0) setOfferingQ(e.target.value);
                            setItems((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], offering_entity_id: e.target.value };
                              return next;
                            });
                          }}
                        />
                        {offeringsQ.data?.length && idx === 0 ? (
                          <div className="mt-2 max-h-44 overflow-auto rounded-xl border bg-white">
                            {offeringsQ.data.map((o) => (
                              <button
                                type="button"
                                key={o.id}
                                onClick={() => {
                                  setItems((prev) => {
                                    const next = [...prev];
                                    next[idx] = { ...next[idx], offering_entity_id: o.id };
                                    return next;
                                  });
                                  setOfferingQ(o.display_name);
                                }}
                                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                              >
                                {o.display_name}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-semibold text-slate-700">Qtd</div>
                        <Input
                          type="number"
                          value={it.quantity}
                          onChange={(e) =>
                            setItems((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], quantity: Number(e.target.value || 1) };
                              return next;
                            })
                          }
                        />
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-semibold text-slate-700">Preço</div>
                        <Input
                          type="number"
                          value={it.price}
                          onChange={(e) =>
                            setItems((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], price: e.target.value };
                              return next;
                            })
                          }
                        />
                      </div>
                      <div className="flex items-end justify-end">
                        <Button
                          variant="outline"
                          onClick={() => setItems((prev) => [...prev, { offering_entity_id: "", quantity: 1, price: "", requires_fulfillment: true }])}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Button variant={activateNow ? "default" : "outline"} onClick={() => setActivateNow((v) => !v)}>
                    {activateNow ? "Ativar ao criar" : "Criar como rascunho"}
                  </Button>
                  <Button onClick={createCommitment} disabled={saving}>
                    {saving ? "Salvando…" : "Criar"}
                  </Button>
                </div>
              </div>
            </Card>

            {activeTenantId ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <CommitmentDeliverablesPreview tenantId={activeTenantId} items={previewItems} />

                <RequireTenantRole roles={["admin", "leader", "supervisor", "manager"]}>
                  <Card className="rounded-2xl border-slate-200 p-4">
                    <div className="mb-2 text-sm font-semibold text-slate-900">Capacidade (previsão)</div>
                    <div className="text-sm text-slate-600">
                      Semáforo é um alerta. Não bloqueia a venda.
                    </div>
                    <div className="mt-3">
                      <CapacitySemaphore tenantId={activeTenantId} extraDemandMinutes={extraDemandMinutes} extraDemandOnDate={extraDemandOnDate} />
                    </div>
                  </Card>
                </RequireTenantRole>
              </div>
            ) : null}

            <Card className="rounded-2xl border-slate-200 p-0">
              <div className="border-b px-4 py-3 text-sm font-semibold text-slate-900">Recentes</div>
              <div className="divide-y">
                {listQ.isLoading ? (
                  <div className="p-4 text-sm text-slate-600">Carregando…</div>
                ) : (listQ.data ?? []).length === 0 ? (
                  <div className="p-4 text-sm text-slate-600">Nenhum compromisso.</div>
                ) : (
                  (listQ.data ?? []).map((c) => (
                    <Link key={c.id} to={`/app/commitments/${c.id}`} className="block px-4 py-3 hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{c.commitment_type}</div>
                          <div className="text-xs text-slate-600">
                            status: {c.status ?? "—"} • customer: {c.customer_entity_id}
                          </div>
                        </div>
                        <Badge variant="secondary">{c.id.slice(0, 8)}</Badge>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </Card>
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}
