import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
  Rocket,
  FileText,
  Package,
  Link2,
  Zap,
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
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
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

  const m30JourneyQ = useQuery({
    queryKey: ["m30_journey_meta", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journeys")
        .select("id, name, default_state_machine_json")
        .eq("key", "operacao_m30")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const m30CasesQ = useQuery({
    queryKey: ["m30_cases_for_commitment_comprehensive", activeTenantId, commitmentId, commitmentQ.data?.customer_entity_id, m30JourneyQ.data?.id, deliverablesQ.data?.length],
    enabled: Boolean(activeTenantId && m30JourneyQ.data?.id && commitmentQ.data),
    queryFn: async () => {
      const delIds = deliverablesQ.data?.map(d => d.id) || [];
      const entityId = commitmentQ.data!.customer_entity_id;
      
      let query = supabase
        .from("cases")
        .select("id, title, state, status, created_at, updated_at, meta_json, deliverable_id")
        .eq("tenant_id", activeTenantId!)
        .eq("journey_id", m30JourneyQ.data!.id)
        .is("deleted_at", null);

      // Build OR filter
      const filters = [];
      if (delIds.length > 0) filters.push(`deliverable_id.in.(${delIds.join(",")})`);
      if (entityId) filters.push(`customer_entity_id.eq.${entityId}`);
      filters.push(`meta_json->>commitment_id.eq.${commitmentId}`);
      
      const { data, error } = await query
        .or(filters.join(","))
        .order("state", { ascending: true });

      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 10_000,
  });

  const m30KanbanData = useMemo(() => {
    const states = (m30JourneyQ.data?.default_state_machine_json?.states ?? []) as string[];
    const cases = m30CasesQ.data ?? [];
    
    return states.map(s => ({
      state: s,
      items: cases.filter(c => c.state === s)
    }));
  }, [m30JourneyQ.data, m30CasesQ.data]);

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

  const contractQ = useQuery({
    queryKey: ["customer_contract", activeTenantId, commitmentQ.data?.customer_entity_id],
    enabled: Boolean(activeTenantId && commitmentQ.data?.customer_entity_id && commitmentQ.data?.commitment_type !== 'contract'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_commitments")
        .select("id")
        .eq("tenant_id", activeTenantId!)
        .eq("customer_entity_id", commitmentQ.data!.customer_entity_id)
        .eq("commitment_type", "contract")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });

  const proposalsQ = useQuery({
    queryKey: ["commitment_proposals", activeTenantId, commitmentId],
    enabled: Boolean(activeTenantId && commitmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("party_proposals")
        .select("id, token, status, created_at")
        .filter("selected_commitment_ids", "cs", `{${commitmentId}}`)
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null);
      if (error) throw error;
      return data || [];
    },
    staleTime: 10_000,
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
      nav("/app/commitments");
    } catch (err: any) {
      showError(err.message ?? "Erro ao excluir");
      setSaving(false);
    }
  };

  const manualSync = async () => {
    if (!activeTenantId || !commitmentId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("job_queue")
        .insert({
          tenant_id: activeTenantId,
          type: 'COMMITMENT_ORCHESTRATE',
          idempotency_key: `RETRY_${commitmentId}_${Date.now()}`,
          payload_json: { commitment_id: commitmentId },
          status: 'pending',
          run_after: new Date().toISOString()
        });
      if (error) throw error;

      // Kick the jobs-processor immediately so the user doesn't have to wait for the cron
      supabase.functions.invoke('jobs-processor', {
        body: { commitment_id: commitmentId }
      }).catch(err => console.warn("Failed to kick jobs-processor", err));

      showSuccess("Solicitação de re-processamento enviada. Aguarde alguns segundos.");
      
      // Auto-refresh deliverables after 5s
      setTimeout(() => {
        deliverablesQ.refetch();
      }, 5000);
    } catch (err: any) {
      showError(err.message ?? "Erro ao solicitar sincronização");
    } finally {
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
    const type = c.commitment_type === 'contract' ? 'Contrato' : 'Pedido';
    return `${type} • ${c.id.slice(0, 8)}`;
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
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "p-1.5 rounded-lg",
                    commitmentQ.data?.commitment_type === 'contract' ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-600"
                  )}>
                    {commitmentQ.data?.commitment_type === 'contract' ? <FileText className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                  </div>
                  <div className="text-xl font-bold text-slate-900">{title}</div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <div className="text-sm font-medium text-slate-700">
                    Cliente:{" "}
                    <Link
                      to={`/app/entities/${commitmentQ.data?.customer_entity_id}`}
                      className="font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      {customerName}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
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
                {commitmentQ.data?.commitment_type !== 'contract' && contractQ.data && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="rounded-xl border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    onClick={() => nav(`/app/commitments/${contractQ.data!.id}`)}
                  >
                    <FileText className="h-4 w-4 mr-2" /> Ver Contrato Principal
                  </Button>
                )}
                {commitmentQ.data?.commitment_type === 'contract' && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="rounded-xl border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    onClick={() => nav(`/app/entities/${commitmentQ.data?.customer_entity_id}?tab=proposal`)}
                  >
                    <Rocket className="h-4 w-4 mr-2" /> Ver Proposta Comercial
                  </Button>
                )}
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

            {/* Se não existem entregáveis (ou no-items), mostramos o card de sincronização e o relacionamento. Se já existem, limpamos a UI. */}
            {(deliverablesQ.data ?? []).length === 0 ? (
              <div className="grid gap-4 lg:grid-cols-4">
                {activeTenantId && canSeeCapacity && (
                  <Card className="rounded-2xl border-slate-200 p-4 lg:col-span-1">
                    <div className="text-sm font-semibold text-slate-900">Capacidade (previsão)</div>
                    <div className="mt-4">
                      <CapacitySemaphore tenantId={activeTenantId} />
                    </div>
                  </Card>
                )}

                <Card className="rounded-2xl border-slate-200 p-4 lg:col-span-2">
                  <div className="text-sm font-semibold text-slate-900">Relacionamento com Propostas</div>
                  <div className="mt-3 space-y-2">
                    {proposalsQ.isLoading ? (
                      <div className="text-xs text-slate-400">Carregando propostas...</div>
                    ) : (proposalsQ.data ?? []).length === 0 ? (
                      <div className="text-xs text-slate-500 italic">Este compromisso não está vinculado a nenhuma proposta pública ainda.</div>
                    ) : (
                      (proposalsQ.data ?? []).map(p => (
                        <div key={p.id} className="flex items-center justify-between rounded-xl border bg-slate-50 p-2 px-3">
                          <div className="flex items-center gap-2">
                            <Link2 className="h-3 w-3 text-slate-400" />
                            <div className="text-xs font-semibold text-slate-700">Proposta {p.token.slice(0,6)}…</div>
                            <Badge variant="outline" className="text-[10px] uppercase font-mono">{p.status}</Badge>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => nav(`/app/entities/${commitmentQ.data?.customer_entity_id}?tab=proposal`)}
                          >
                            GERENCIAR
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                <Card className="rounded-2xl border-slate-200 p-4 lg:col-span-1">
                  <div className="text-sm font-semibold text-slate-900">Sincronização</div>
                  <div className="mt-3 space-y-3">
                    <div className="text-[11px] text-slate-600 leading-relaxed">
                      Se os entregáveis não apareceram ou precisam ser atualizados conforme o contrato.
                    </div>
                    <Button 
                      variant="outline" 
                      className="w-full rounded-xl border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 h-9 text-xs"
                      onClick={manualSync}
                      disabled={saving}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5 mr-2", saving && "animate-spin")} /> 
                      Solicitar Re-processamento
                    </Button>
                  </div>
                </Card>
              </div>
            ) : null}

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

            {/* M30 Journey Kanban Section */}
            {m30JourneyQ.data && (
              <Card className="rounded-[32px] border-none bg-slate-50/50 p-6 shadow-inner">
                <div className="mb-6 flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <KanbanSquare className="h-5 w-5 text-indigo-600" />
                      Jornada Operação M30
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">Acompanhamento operacional das pautas deste cliente.</p>
                  </div>
                  <Badge variant="outline" className="bg-white border-indigo-100 text-indigo-600 font-bold">
                    {m30CasesQ.data?.length ?? 0} Cards Ativos
                  </Badge>
                </div>

                <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                  {m30KanbanData.map((col) => (
                    <div key={col.state} className="min-w-[280px] flex-1">
                      <div className="flex items-center justify-between mb-3 px-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {col.state}
                        </span>
                        <Badge variant="secondary" className="h-4 px-1.5 text-[9px] bg-slate-200/50 text-slate-500">
                          {col.items.length}
                        </Badge>
                      </div>
                      <div className={cn(
                        "space-y-3 rounded-2xl p-2 min-h-[100px]",
                        col.items.length > 0 ? "bg-white/40 border border-slate-200/50" : "bg-slate-100/30 border border-dashed border-slate-200"
                      )}>
                        {col.items.map((c) => (
                          <Link
                            key={c.id}
                            to={`/app/operacao-m30/${c.id}`}
                            className={cn(
                              "block rounded-xl border bg-white p-3 shadow-sm transition-all hover:shadow-md hover:border-indigo-300 group",
                              (c.meta_json as any)?.commitment_id === commitmentId ? "ring-2 ring-indigo-500/10 border-indigo-200" : "border-slate-200"
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight group-hover:text-indigo-600 transition-colors">
                                {c.title || "Sem título"}
                              </p>
                              {(c.meta_json as any)?.priority && (
                                <AlertCircle className="h-3 w-3 text-rose-500 shrink-0" />
                              )}
                            </div>
                            <div className="mt-2 flex items-center justify-between text-[9px] font-medium text-slate-400">
                              <span className="truncate">{new Date(c.updated_at).toLocaleDateString()}</span>
                              {(c.meta_json as any)?.commitment_id === commitmentId && (
                                <Badge variant="outline" className="h-3.5 px-1 py-0 text-[8px] border-indigo-200 text-indigo-500 bg-indigo-50">ESTE CONTRATO</Badge>
                              )}
                            </div>
                          </Link>
                        ))}
                        {col.items.length === 0 && (
                          <div className="text-[9px] text-slate-400 text-center py-4 italic">Sem cards nesta etapa</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {m30CasesQ.data?.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
                    <Rocket className="h-10 w-10 text-slate-200 mb-2" />
                    <p className="text-sm text-slate-400 font-medium">Nenhum card operacional para este cliente ainda.</p>
                  </div>
                )}
              </Card>
            )}

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

          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}
