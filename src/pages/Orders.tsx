import { useMemo, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { supabase } from "@/lib/supabase";
import { titleizeState } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Clock,
  MapPin,
  RefreshCw,
  Search,
  Plus,
  LayoutList,
  Columns2,
  Download,
  Package,
} from "lucide-react";
import { NewSalesOrderDialog } from "@/components/case/NewSalesOrderDialog";
import { getStateLabel } from "@/lib/journeyLabels";
import { useJourneyTransition } from "@/hooks/useJourneyTransition";
import { StateMachine } from "@/lib/journeys/types"
import { GlobalJourneyLogsDialog } from "@/components/case/GlobalJourneyLogsDialog";
import { checkTransitionBlocks } from "@/lib/journeys/validation";
import { TransitionBlockDialog } from "@/components/case/TransitionBlockDialog";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";

const ORDERS_VIEW_MODE_KEY = "orders_view_mode_v1";
const SALES_ORDER_KEY = "sales_order";

type CaseRow = {
  id: string;
  journey_id: string | null;
  customer_id?: string | null;
  title: string | null;
  status: string;
  state: string;
  created_at: string;
  updated_at: string;
  assigned_user_id: string | null;
  is_chat?: boolean;
  users_profile?: { display_name: string | null; email: string | null } | null;
  journeys?: { key: string | null; name: string | null; is_crm?: boolean } | null;
  meta_json?: any;
};

type JourneyOpt = {
  id: string;
  key: string;
  name: string;
  is_crm?: boolean;
  default_state_machine_json?: any;
};

function csvCell(v: any) {
  const s = String(v ?? "");
  const escaped = s.replace(/\"/g, '""');
  if (/[\n\r",]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function minutesAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(diff / 60000));
}

function getMetaPhone(meta: any): string | null {
  if (!meta || typeof meta !== "object") return null;
  const direct =
    meta.customer_phone ??
    meta.customerPhone ??
    meta.phone ??
    meta.whatsapp ??
    meta.to_phone ??
    meta.toPhone ??
    null;
  return typeof direct === "string" && direct.trim() ? direct.trim() : null;
}

export default function Orders() {
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const nav = useNavigate();
  const { prefs } = useTheme();

  const [q, setQ] = useState("");
  const [movingCaseId, setMovingCaseId] = useState<string | null>(null);
  const [transitionBlock, setTransitionBlock] = useState<{
    open: boolean;
    nextStateName: string;
    reasons: any[];
  }>({ open: false, nextStateName: "", reasons: [] });
  const [newSalesOrderOpen, setNewSalesOrderOpen] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  useEffect(() => {
    const saved = localStorage.getItem(ORDERS_VIEW_MODE_KEY);
    if (saved === "kanban" || saved === "list") setViewMode(saved);
  }, []);

  const setAndPersistViewMode = (next: "kanban" | "list") => {
    setViewMode(next);
    localStorage.setItem(ORDERS_VIEW_MODE_KEY, next);
  };

  const journeyQ = useQuery({
    queryKey: ["tenant_orders_journey", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("journey_id, journeys(id,key,name,is_crm,default_state_machine_json)")
        .eq("tenant_id", activeTenantId!)
        .eq("journeys.key", SALES_ORDER_KEY)
        .eq("enabled", true)
        .single();
      
      if (error) throw error;
      const j = (data as any).journeys;
      return {
        id: j.id,
        key: j.key,
        name: j.name,
        is_crm: Boolean(j.is_crm),
        default_state_machine_json: j.default_state_machine_json ?? {},
      } as JourneyOpt;
    },
  });

  const selectedJourney = journeyQ.data;

  const casesQ = useQuery({
    queryKey: ["cases_orders", activeTenantId],
    enabled: Boolean(activeTenantId && selectedJourney),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,journey_id,customer_id,title,status,state,created_at,updated_at,assigned_user_id,is_chat,users_profile:users_profile!fk_cases_users_profile(display_name,email),journeys:journeys!cases_journey_id_fkey(key,name,is_crm),meta_json"
        )
        .eq("tenant_id", activeTenantId!)
        .eq("journey_id", selectedJourney!.id)
        .is("deleted_at", null)
        .eq("is_chat", false)
        .order("updated_at", { ascending: false })
        .limit(300);

      if (error) throw error;
      return (data ?? []) as any as CaseRow[];
    },
  });

  const journeyRows = casesQ.data ?? [];

  const customerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of journeyRows) {
      const cid = String((r as any).customer_id ?? "");
      if (cid && cid.length > 10) ids.add(cid);
    }
    return Array.from(ids);
  }, [journeyRows]);

  const customersQ = useQuery({
    queryKey: ["customers_orders", activeTenantId, customerIds.join(",")],
    enabled: Boolean(activeTenantId && customerIds.length),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_accounts")
        .select("id,phone_e164,name,email")
        .eq("tenant_id", activeTenantId!)
        .in("id", customerIds)
        .is("deleted_at", null)
        .limit(500);
      if (error) throw error;
      const m = new Map<string, any>();
      for (const c of data ?? []) m.set((c as any).id, c);
      return m;
    },
  });

  const caseIdsForLookup = useMemo(() => journeyRows.map((r) => r.id), [journeyRows]);

  const casePhoneQ = useQuery({
    queryKey: ["orders_case_phone_fallback", activeTenantId, caseIdsForLookup.join(",")],
    enabled: Boolean(activeTenantId && caseIdsForLookup.length),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_fields")
        .select("case_id,key,value_text")
        .in("case_id", caseIdsForLookup)
        .in("key", ["whatsapp", "phone", "customer_phone"])
        .limit(2000);
      if (error) throw error;

      const priority = new Map<string, number>([["whatsapp", 1], ["customer_phone", 2], ["phone", 3]]);
      const best = new Map<string, { p: number; v: string }>();
      for (const r of data ?? []) {
        const cid = (r as any).case_id;
        const p = priority.get((r as any).key) ?? 999;
        const v = String((r as any).value_text ?? "").trim();
        if (!v) continue;
        if (!best.has(cid) || p < best.get(cid)!.p) best.set(cid, { p, v });
      }
      return new Map(Array.from(best.entries()).map(([cid, b]) => [cid, b.v]));
    },
  });

  const filteredRows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return journeyRows;
    return journeyRows.filter((r) => {
      const cust = customersQ.data?.get(r.customer_id!);
      const metaPhone = getMetaPhone(r.meta_json);
      const fieldPhone = casePhoneQ.data?.get(r.id);
      const text = `${r.title} ${r.users_profile?.display_name} ${cust?.name} ${cust?.phone_e164} ${metaPhone} ${fieldPhone}`.toLowerCase();
      return text.includes(qq);
    });
  }, [journeyRows, q, customersQ.data, casePhoneQ.data]);

  const pendQ = useQuery({
    queryKey: ["orders_pendencies", activeTenantId, filteredRows.map(c => c.id).join(",")],
    enabled: Boolean(activeTenantId && filteredRows.length),
    queryFn: async () => {
      const ids = filteredRows.map((c) => c.id);
      const { data, error } = await supabase
        .from("pendencies")
        .select("case_id,type,status")
        .in("case_id", ids)
        .eq("status", "open");
      if (error) throw error;

      const byCase = new Map<string, { open: number; need_location: boolean }>();
      for (const p of data ?? []) {
        const cid = (p as any).case_id;
        const cur = byCase.get(cid) ?? { open: 0, need_location: false };
        cur.open++;
        if ((p as any).type === "need_location") cur.need_location = true;
        byCase.set(cid, cur);
      }
      return byCase;
    },
  });

  const states = useMemo(() => {
    const st = (selectedJourney?.default_state_machine_json?.states ?? []) as string[];
    return Array.from(new Set(st.map(s => String(s)).filter(Boolean)));
  }, [selectedJourney]);

  const columns = useMemo(() => {
    const baseStates = states.length ? states : Array.from(new Set(filteredRows.map((r) => r.state)));
    const known = new Set(baseStates);
    const extras = Array.from(new Set(filteredRows.map((r) => r.state))).filter((s) => !known.has(s));
    const all = [...baseStates, ...(extras.length ? ["__other__"] : [])];

    return all.map((st) => {
      const items = filteredRows.filter(r => st === "__other__" ? !known.has(r.state) : r.state === st)
        .sort((a,b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      return {
        key: st,
        label: st === "__other__" ? "Outros" : getStateLabel(selectedJourney as any, st),
        items,
      };
    });
  }, [filteredRows, states, selectedJourney]);

  const { transitionState, updating: updatingCaseState } = useJourneyTransition();

  const updateCaseState = async (caseId: string, nextState: string) => {
    if (!activeTenantId || movingCaseId || updatingCaseState) return;
    const currentCase = filteredRows.find(c => c.id === caseId);
    if (!currentCase || currentCase.state === nextState) return;

    setMovingCaseId(caseId);
    try {
      const journeyConfig = selectedJourney?.default_state_machine_json as unknown as StateMachine;
      const blocks = await checkTransitionBlocks(supabase, activeTenantId, caseId, currentCase.state, nextState, journeyConfig);
      if (blocks.length > 0) {
        setTransitionBlock({ open: true, nextStateName: nextState, reasons: blocks });
        return;
      }
      await transitionState(caseId, currentCase.state, nextState, journeyConfig);
    } finally {
      setMovingCaseId(null);
    }
  };

  const exportConversationsCsv = async () => {
    if (!activeTenantId || exportingCsv || journeyRows.length === 0) return;
    setExportingCsv(true);
    try {
      const caseIds = journeyRows.map(r => r.id);
      const { data: msgs, error } = await supabase
        .from("wa_messages")
        .select("case_id,occurred_at,direction,body_text")
        .eq("tenant_id", activeTenantId)
        .in("case_id", caseIds.slice(0, 50)) // simple limit for now
        .order("occurred_at", { ascending: true });
      if (error) throw error;

      const csv = ["case_id,timestamp,direction,message"];
      (msgs ?? []).forEach(m => {
        csv.push(`${m.case_id},${m.occurred_at},${m.direction},${csvCell(m.body_text)}`);
      });
      downloadTextFile(`pedidos_${new Date().toISOString().slice(0,10)}.csv`, csv.join("\n"), "text/csv");
      showSuccess("CSV exportado.");
    } finally {
      setExportingCsv(false);
    }
  };

  if (journeyQ.isError) {
    return (
      <AppShell>
        <div className="p-8 text-center">
          <h2 className="text-xl font-semibold">Jornada de Pedidos não encontrada</h2>
          <p className="text-slate-500 mt-2">Certifique-se de que a jornada 'sales_order' está habilitada no Admin.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-100 text-blue-600">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">Pedidos</h2>
                <p className="text-sm text-slate-600">Gestão dedicada de pedidos e processos internos.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                className="h-10 rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => setNewSalesOrderOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" /> Novo pedido
              </Button>

              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 p-1">
                <Button
                  variant={viewMode === "list" ? "default" : "secondary"}
                  className="h-8 rounded-xl px-3"
                  onClick={() => setAndPersistViewMode("list")}
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "kanban" ? "default" : "secondary"}
                  className="h-8 rounded-xl px-3"
                  onClick={() => setAndPersistViewMode("kanban")}
                >
                  <Columns2 className="h-4 w-4" />
                </Button>
              </div>

              <Button variant="secondary" className="h-10 rounded-2xl" onClick={exportConversationsCsv} disabled={exportingCsv}>
                <Download className="mr-2 h-4 w-4" /> Exportar
              </Button>

              <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => casesQ.refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por cliente, vendedor ou telefone..."
                className="h-11 rounded-2xl pl-10"
              />
            </div>
          </div>

          <div className="mt-6 overflow-x-auto pb-4">
            {viewMode === "kanban" ? (
              <div className="flex gap-4 min-w-max">
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className="w-[300px] flex-shrink-0"
                    onDragOver={(e) => col.key !== "__other__" && e.preventDefault()}
                    onDrop={(e) => {
                      const cid = e.dataTransfer.getData("text/caseId");
                      if (cid) updateCaseState(cid, col.key);
                    }}
                  >
                    <div className="mb-3 flex items-center justify-between px-2">
                      <span className="text-sm font-bold text-slate-700">{col.label}</span>
                      <Badge variant="secondary" className="rounded-full">{col.items.length}</Badge>
                    </div>
                    <div className="min-h-[500px] rounded-[24px] bg-slate-50/50 p-2 border border-dashed border-slate-200">
                      {col.items.map((c) => {
                        const cust = customersQ.data?.get(c.customer_id!);
                        const title = cust?.name || c.title || "Pedido";
                        return (
                          <Link
                            key={c.id}
                            to={`/cases/${c.id}`}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("text/caseId", c.id)}
                            className="mb-3 block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition"
                          >
                            <div className="font-semibold text-slate-900 truncate">{title}</div>
                            <div className="mt-1 text-xs text-slate-500">{c.users_profile?.display_name || "Sem dono"}</div>
                            <div className="mt-3 flex items-center justify-between">
                              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                <Clock className="h-3 w-3" /> {minutesAgo(c.updated_at)}m
                              </div>
                              {pendQ.data?.get(c.id)?.open ? (
                                <Badge className="bg-amber-100 text-amber-700 border-0">{pendQ.data.get(c.id)!.open} pend.</Badge>
                              ) : (
                                <Badge className="bg-emerald-100 text-emerald-700 border-0">OK</Badge>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Etapa</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Atualizado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link to={`/cases/${c.id}`} className="font-semibold hover:underline">
                            {customersQ.data?.get(c.customer_id!)?.name || c.title || "Pedido"}
                          </Link>
                          <div className="text-[10px] text-slate-400">{c.id.slice(0, 8)}</div>
                        </TableCell>
                        <TableCell className="text-sm">{c.users_profile?.display_name || "—"}</TableCell>
                        <TableCell>
                          <select
                            value={c.state}
                            onChange={(e) => updateCaseState(c.id, e.target.value)}
                            className="text-xs border rounded-lg p-1"
                          >
                            {states.map(s => <option key={s} value={s}>{getStateLabel(selectedJourney as any, s)}</option>)}
                          </select>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] font-normal uppercase">{c.status}</Badge></TableCell>
                        <TableCell className="text-xs text-slate-500">{minutesAgo(c.updated_at)} min atrás</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <NewSalesOrderDialog
            open={newSalesOrderOpen}
            onOpenChange={setNewSalesOrderOpen}
            tenantId={activeTenantId!}
            journeyId={selectedJourney?.id!}
          />

          <TransitionBlockDialog
            open={transitionBlock.open}
            onOpenChange={(v) => setTransitionBlock({ ...transitionBlock, open: v })}
            nextStateName={transitionBlock.nextStateName}
            blocks={transitionBlock.reasons}
          />
        </div>
      </AppShell>
    </RequireAuth>
  );
}
