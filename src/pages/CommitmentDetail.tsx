import React, { useMemo, useState } from "react";
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
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
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
  const [targetCaseType, setTargetCaseType] = useState<string>("order");
  const [targetPriority, setTargetPriority] = useState(false);
  const qc = useQueryClient();

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["commitment", activeTenantId, commitmentId] });
    qc.invalidateQueries({ queryKey: ["commitment_items", activeTenantId, commitmentId] });
    qc.invalidateQueries({ queryKey: ["commitment_deliverables", activeTenantId, commitmentId] });
    qc.invalidateQueries({ queryKey: ["commitment_cases", activeTenantId] });
    showSuccess("Dados atualizados 🔄");
  };

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
          name
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

  const casesQ = useQuery({
    queryKey: ["commitment_cases", activeTenantId, deliverablesQ.data?.map(d => d.id)],
    enabled: Boolean(activeTenantId && deliverablesQ.data && deliverablesQ.data.length > 0),
    queryFn: async () => {
      const delIds = deliverablesQ.data!.map(d => d.id);
      const { data, error } = await supabase
        .from("cases")
        .select("id, state, title, status, deleted_at, deliverable_id")
        .eq("tenant_id", activeTenantId!)
        .in("deliverable_id", delIds)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 5_000,
  });
  const allTenantCasesQ = useQuery({
    queryKey: ["all_tenant_cases", activeTenantId, commitmentId],
    enabled: Boolean(activeTenantId && commitmentId),
    queryFn: async () => {
      // 1. Fetch cases with ANY deliverable_id (possible orphans from other contracts)
      const qOrphans = supabase
        .from("cases")
        .select("id, title, state, deliverable_id, created_at, status, meta_json")
        .eq("tenant_id", activeTenantId!)
        .not("deliverable_id", "is", null)
        .is("deleted_at", null);

      // 2. Fetch cases that MENTION this commitment in metadata but might have NULL deliverable_id
      const qUnlinked = supabase
        .from("cases")
        .select("id, title, state, deliverable_id, created_at, status, meta_json")
        .eq("tenant_id", activeTenantId!)
        .eq("meta_json->>commitment_id", commitmentId)
        .is("deleted_at", null);

      const [res1, res2] = await Promise.all([qOrphans, qUnlinked]);
      if (res1.error) throw res1.error;
      if (res2.error) throw res2.error;

      const map = new Map();
      (res1.data || []).forEach(c => map.set(c.id, c));
      (res2.data || []).forEach(c => map.set(c.id, c));

      return Array.from(map.values()).sort((a,b) => (b.created_at || '').localeCompare(a.created_at || ''));
    },
    staleTime: 3_000,
  });

  const fixLink = async (caseId: string, deliverableId: string) => {
    // Check if slot is already occupied
    const existing = (allTenantCasesQ.data || []).find(c => c.deliverable_id === deliverableId && c.id !== caseId);
    if (existing && !window.confirm(`Este entregável já possui a tarefa "${existing.title}". Deseja vincular assim mesmo e ter DUAS tarefas no mesmo slot?`)) {
      return;
    }

    setSaving(true);
    const curr = (allTenantCasesQ.data || []).find(x => x.id === caseId);
    const newMeta = { ...(curr?.meta_json || {}), commitment_id: commitmentId };

    const { error } = await supabase
      .from("cases")
      .update({ 
        deliverable_id: deliverableId,
        meta_json: newMeta
      })
      .eq("id", caseId);
    if (error) {
      showError("Erro ao corrigir: " + error.message);
    } else {
      showSuccess("Vínculo corrigido!");
      qc.invalidateQueries({ queryKey: ["commitment_cases"] });
      allTenantCasesQ.refetch();
    }
    setSaving(false);
  };

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
    const deliverables = deliverablesQ.data ?? [];
    // We use allTenantCasesQ instead of casesQ for broader visibility
    const cases = allTenantCasesQ.data ?? [];
    
    // Map cases to deliverables
    const deliverableCasesMap = new Map<string, any[]>();
    for (const c of cases) {
      if (!c.deliverable_id) continue;
      if (!deliverableCasesMap.has(c.deliverable_id)) deliverableCasesMap.set(c.deliverable_id, []);
      deliverableCasesMap.get(c.deliverable_id)!.push(c);
      console.log(`[CRM] Mapping case ${c.id} to deliverable ${c.deliverable_id}`);
    }

    const merged = deliverables.map(d => ({
      ...d,
      cases: deliverableCasesMap.get(d.id) || []
    }));

    const m = new Map<string, any[]>();
    for (const d of merged) {
      const k = d.name || 'Sem nome (legado)';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d);
    }
    const res = Array.from(m.entries()).map(([name, delivs]) => {
      const total = delivs.length;
      const started = delivs.filter(d => d.cases.length > 0).length;
      return [name, delivs, { started, total }] as [string, any[], any];
    }).sort((a, b) => a[0].localeCompare(b[0]));
    return res;
  }, [deliverablesQ.data, allTenantCasesQ.data]);

  const orphanCases = useMemo(() => {
    if (!allTenantCasesQ.data || !deliverablesQ.data) return [];
    const currentDelIds = new Set(deliverablesQ.data.map(d => d.id));
    return allTenantCasesQ.data.filter(c => !currentDelIds.has(c.deliverable_id));
  }, [allTenantCasesQ.data, deliverablesQ.data]);

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
          case_type: targetCaseType,
          customer_entity_id: commitmentQ.data?.customer_entity_id,
          deliverable_id: dId,
          title: d?.name || "Tarefa de Contrato",
          status: "open",
          state: initialState,
          meta_json: {
            entity_id: commitmentQ.data?.customer_entity_id,
            customer_entity_name: commitmentQ.data?.customer?.display_name,
            commitment_id: commitmentId,
            priority: targetPriority,
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
      setTargetPriority(false);
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
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px] font-mono opacity-50">T:{activeTenantId?.slice(0,8)}</Badge>
                    <Badge variant="outline" className="text-[9px] font-mono opacity-50">C:{commitmentId?.slice(0,8)}</Badge>
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
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50"
                  onClick={refreshAll}
                >
                  <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
                </Button>
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
                                      {(() => {
                                        const countTotal = group.length;
                                        const started = group.filter(d => (d.cases || []).length > 0).length;
                                        return <span>{started}/{countTotal}</span>;
                                      })()}
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

                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tipo de Caso</Label>
                    <Select value={targetCaseType} onValueChange={setTargetCaseType}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Escolha o tipo..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planejamento">PLANEJAMENTO</SelectItem>
                        <SelectItem value="trafego_pago">TRÁFEGO PAGO</SelectItem>
                        <SelectItem value="arte_estatica">ARTE ESTÁTICA</SelectItem>
                        <SelectItem value="gravacao">GRAVAÇÃO</SelectItem>
                        <SelectItem value="relatorio">RELATÓRIO</SelectItem>
                        <SelectItem value="edicao">EDIÇÃO</SelectItem>
                        <SelectItem value="validacao">VALIDAÇÃO</SelectItem>
                        <SelectItem value="aprovacao">APROVAÇÃO</SelectItem>
                        <SelectItem value="calendario">CALENDÁRIO</SelectItem>
                        <SelectItem value="order">GERAL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between h-11 px-4 rounded-2xl border border-dotted border-slate-300 bg-slate-50/50">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-rose-500" />
                        <Label className="text-xs text-rose-700 font-bold uppercase cursor-pointer" htmlFor="emit-priority">Priorizar Tarefas</Label>
                    </div>
                    <Switch 
                      id="emit-priority"
                      checked={targetPriority}
                      onCheckedChange={setTargetPriority}
                    />
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

            {/* Diagnostic Panel - Orphan Cases */}
            <Card className="mt-8 rounded-2xl border-amber-200 bg-amber-50/30 p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  Modo Diagnóstico: Tarefas Órfãs (Toda a Empresa)
                </div>
                <Badge variant="outline" className="border-amber-200 text-amber-700 bg-white">
                  {orphanCases.length} detectadas
                </Badge>
              </div>
              
              <p className="mb-4 text-xs text-amber-700 leading-relaxed italic">
                Abaixo estão listadas TODAS as tarefas que possuem um entregável vinculado, mas que **não pertencem a este contrato**. 
                Se você criou um card e ele não apareceu acima, use o seletor para corrigi-lo.
              </p>

              <div className="space-y-3">
                {orphanCases.map(c => (
                  <div key={c.id} className="flex items-center justify-between rounded-xl border border-amber-100 bg-white p-3 shadow-sm">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-slate-900">{c.title || "Sem título"}</div>
                      <div className="mt-1 flex items-center gap-3">
                        <Badge variant="outline" className="text-[10px] uppercase h-4 px-1">{c.state}</Badge>
                        <span className="text-[9px] font-mono text-slate-400">UUID: {c.deliverable_id?.substring(0, 8)}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Select disabled={saving} onValueChange={(delId) => fixLink(c.id, delId)}>
                        <SelectTrigger className="h-8 w-[200px] rounded-xl text-[10px] bg-amber-50/50 border-amber-100">
                          <SelectValue placeholder="Vincular a este contrato..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {groupedDeliverables.map(([groupName, items]) => (
                            <React.Fragment key={groupName}>
                              <div className="px-2 py-1 bg-slate-100/50 text-[9px] font-black text-slate-500 uppercase tracking-tighter">
                                {groupName}
                              </div>
                              {items.map(d => (
                                <SelectItem key={d.id} value={d.id} className="text-[10px] pl-4">
                                  Item #{items.indexOf(d) + 1} ({d.id.substring(0, 4)})
                                </SelectItem>
                              ))}
                            </React.Fragment>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        asChild
                        className="h-8 w-8 rounded-xl p-0 hover:bg-amber-100 text-amber-600"
                      >
                        <Link to={`/app/operacao-m30/${c.id}`} target="_blank">
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
                {orphanCases.length === 0 && (
                  <div className="rounded-xl border border-dashed border-amber-200 py-6 text-center text-[10px] text-amber-600 italic">
                    Nenhuma tarefa órfã detectada.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}
