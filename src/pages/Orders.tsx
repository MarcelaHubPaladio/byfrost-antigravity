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
  ChevronLeft as ChevronLeftIcon,
  ChevronRight,
  TrendingUp,
  CreditCard,
  DollarSign,
  Briefcase,
  Users2,
  Calendar as CalendarIcon,
  Check
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, parse, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { NewSalesOrderDialog } from "@/components/case/NewSalesOrderDialog";
import { getStateLabel } from "@/lib/journeyLabels";
import { useJourneyTransition } from "@/hooks/useJourneyTransition";
import { StateMachine } from "@/lib/journeys/types"
import { GlobalJourneyLogsDialog } from "@/components/case/GlobalJourneyLogsDialog";
import { checkTransitionBlocks } from "@/lib/journeys/validation";
import { TransitionBlockDialog } from "@/components/case/TransitionBlockDialog";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import { ImportOrdersDialog } from "@/components/case/ImportOrdersDialog";

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
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedSellerId, setSelectedSellerId] = useState<string>("all");
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
        .select(`
          journey_id, 
          journeys!inner(id,key,name,is_crm,default_state_machine_json)
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("journeys.key", SALES_ORDER_KEY)
        .eq("enabled", true)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;

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
      const CHUNK_SIZE = 50;
      const chunks: string[][] = [];
      for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
        chunks.push(customerIds.slice(i, i + CHUNK_SIZE));
      }

      const allCustomers: any[] = [];
      await Promise.all(chunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from("customer_accounts")
          .select("id,phone_e164,name,email")
          .eq("tenant_id", activeTenantId!)
          .in("id", chunk)
          .is("deleted_at", null);
        if (error) throw error;
        if (data) allCustomers.push(...data);
      }));

      const m = new Map<string, any>();
      for (const c of allCustomers) m.set((c as any).id, c);
      return m;
    },
  });
  
  const usersQ = useQuery({
    queryKey: ["tenant_users_profiles", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id, display_name, email")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    }
  });

  const parseSafeDate = (input: string | null | undefined, fallback: string | Date): Date => {
    if (!input) return new Date(fallback);
    const s = String(input).trim();
    if (!s) return new Date(fallback);

    // Try dd/MM/yyyy
    try {
      const d = parse(s, "dd/MM/yyyy", new Date());
      if (!isNaN(d.getTime())) return d;
    } catch {}

    // Try yyyy-MM-dd
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d;
    } catch {}

    return new Date(fallback);
  };

  const caseIdsForLookup = useMemo(() => journeyRows.map((r) => r.id), [journeyRows]);

  const caseDataQ = useQuery({
    queryKey: ["orders_case_fields_extended", activeTenantId, caseIdsForLookup.join(",")],
    enabled: Boolean(activeTenantId && caseIdsForLookup.length),
    queryFn: async () => {
      const CHUNK_SIZE = 50;
      const chunks: string[][] = [];
      for (let i = 0; i < caseIdsForLookup.length; i += CHUNK_SIZE) {
        chunks.push(caseIdsForLookup.slice(i, i + CHUNK_SIZE));
      }

      const allFields: any[] = [];
      const allItems: any[] = [];

      await Promise.all(chunks.map(async (chunk) => {
        const [fRes, iRes] = await Promise.all([
          supabase
            .from("case_fields")
            .select("case_id,key,value_text")
            .eq("tenant_id", activeTenantId!)
            .in("case_id", chunk)
            .in("key", ["whatsapp", "phone", "customer_phone", "sale_date_text", "billing_status", "total_value_raw"])
            .limit(1000),
          supabase
            .from("case_items")
            .select("case_id,total")
            .eq("tenant_id", activeTenantId!)
            .in("case_id", chunk)
            .is("deleted_at", null)
        ]);

        if (fRes.error) throw fRes.error;
        if (iRes.error) throw iRes.error;

        if (fRes.data) allFields.push(...fRes.data);
        if (iRes.data) allItems.push(...iRes.data);
      }));

      const fieldMap = new Map<string, any>();
      for (const r of allFields) {
        const cid = r.case_id;
        if (!fieldMap.has(cid)) fieldMap.set(cid, {});
        fieldMap.get(cid)[r.key] = r.value_text;
      }

      const totalsMap = new Map<string, number>();
      for (const itm of allItems) {
        const cid = itm.case_id;
        const val = Number(itm.total ?? 0);
        totalsMap.set(cid, (totalsMap.get(cid) ?? 0) + val);
      }

      return { fields: fieldMap, totals: totalsMap };
    },
  });

  const filteredRows = useMemo(() => {
    let rows = journeyRows;

    // Filter by seller
    if (selectedSellerId !== "all") {
      rows = rows.filter(r => r.assigned_user_id === selectedSellerId);
    }

    // Filter by Month
    rows = rows.filter(r => {
      const f = caseDataQ.data?.fields.get(r.id);
      const saleDateText = f?.sale_date_text;
      const d = parseSafeDate(saleDateText, r.created_at);
      return isSameMonth(d, selectedMonth);
    });

    const qq = q.trim().toLowerCase();
    if (qq) {
      rows = rows.filter((r) => {
        const cust = customersQ.data?.get(r.customer_id!);
        const extId = r.meta_json?.external_id || "";
        const f = caseDataQ.data?.fields.get(r.id);
        const phones = `${f?.whatsapp ?? ""} ${f?.phone ?? ""} ${f?.customer_phone ?? ""}`;
        const text = `${r.title} ${r.users_profile?.display_name} ${cust?.name} ${cust?.phone_e164} ${phones} ${extId}`.toLowerCase();
        return text.includes(qq);
      });
    }

    return rows;
  }, [journeyRows, q, selectedMonth, selectedSellerId, customersQ.data, caseDataQ.data]);

  const stats = useMemo(() => {
    let totalValue = 0;
    let pendingValue = 0;
    let invoicedValue = 0;
    let invoicedCount = 0;

    filteredRows.forEach(r => {
      const val = caseDataQ.data?.totals.get(r.id) ?? 0;
      const f = caseDataQ.data?.fields.get(r.id);
      const billingStatus = (f?.billing_status ?? "Pendente").toLowerCase();

      totalValue += val;
      if (billingStatus.includes("pago") || billingStatus.includes("faturado")) {
        invoicedValue += val;
        invoicedCount++;
      } else if (!billingStatus.includes("canc")) {
        pendingValue += val;
      }
    });

    const avgTicket = invoicedCount > 0 ? invoicedValue / invoicedCount : 0;

    return { totalValue, pendingValue, invoicedValue, avgTicket };
  }, [filteredRows, caseDataQ.data]);

  const chartData = useMemo(() => {
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(selectedMonth);
    const days = eachDayOfInterval({ start, end });

    return days.map(d => {
      let dailyTotal = 0;
      filteredRows.forEach(r => {
        const f = caseDataQ.data?.fields.get(r.id);
        const saleDateText = f?.sale_date_text;
        const saleDate = parseSafeDate(saleDateText, r.created_at);

        if (isSameDay(saleDate, d)) {
          dailyTotal += caseDataQ.data?.totals.get(r.id) ?? 0;
        }
      });

      return {
        day: format(d, "dd"),
        total: dailyTotal,
      };
    });
  }, [filteredRows, selectedMonth, caseDataQ.data]);

  const pendQ = useQuery({
    queryKey: ["orders_pendencies", activeTenantId, filteredRows.map(c => c.id).join(",")],
    enabled: Boolean(activeTenantId && filteredRows.length),
    queryFn: async () => {
      const ids = filteredRows.map((c) => c.id);
      const CHUNK_SIZE = 50;
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        chunks.push(ids.slice(i, i + CHUNK_SIZE));
      }

      const allPendencies: any[] = [];
      await Promise.all(chunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from("pendencies")
          .select("case_id,type,status")
          .in("case_id", chunk)
          .eq("status", "open");
        if (error) throw error;
        if (data) allPendencies.push(...data);
      }));

      const byCase = new Map<string, { open: number; need_location: boolean }>();
      for (const p of allPendencies) {
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

  if (journeyQ.isError || (!journeyQ.isLoading && !journeyQ.data)) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-white/40 rounded-[32px] border border-slate-200 backdrop-blur m-4">
          <div className="h-16 w-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
            <Package className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800">Módulo de Pedidos não habilitado</h2>
          <p className="text-slate-500 mt-2 max-w-sm">
            A jornada de <span className="font-semibold">Venda (sales_order)</span> não foi encontrada ou não está habilitada para este tenant.
          </p>
          <Button asChild variant="outline" className="mt-6 rounded-2xl">
            <Link to="/app">Voltar ao Dashboard</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-100 text-blue-600">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">Pedidos</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-sm text-slate-600">Gestão dedicada de pedidos e processos internos.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Vendedor Filter */}
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 p-1.5 h-10 min-w-[180px]">
                <Users2 className="ml-2 h-4 w-4 text-slate-400" />
                <select
                  className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none flex-1 pr-2"
                  value={selectedSellerId}
                  onChange={(e) => setSelectedSellerId(e.target.value)}
                >
                  <option value="all">Vendedor: Todos</option>
                  {(usersQ.data ?? []).map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                      {u.display_name || u.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Month Selector */}
              <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/70 p-1 h-10">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl hover:bg-slate-100"
                  onClick={() => setSelectedMonth(prev => {
                    const d = new Date(prev);
                    d.setMonth(d.getMonth() - 1);
                    return d;
                  })}
                >
                  <ChevronLeftIcon className="h-4 w-4 text-slate-600" />
                </Button>
                
                <div className="flex items-center gap-2 px-2 min-w-[120px] justify-center">
                  <CalendarIcon className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">
                    {format(selectedMonth, "MMMM yyyy", { locale: ptBR })}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl hover:bg-slate-100"
                  onClick={() => setSelectedMonth(prev => {
                    const d = new Date(prev);
                    d.setMonth(d.getMonth() + 1);
                    return d;
                  })}
                >
                  <ChevronRight className="h-4 w-4 text-slate-600" />
                </Button>
              </div>

              <div className="h-8 w-px bg-slate-200 mx-1 hidden lg:block" />

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

                <ImportOrdersDialog
                  tenantId={activeTenantId!}
                  journey={selectedJourney!}
                  actorUserId={user?.id || null}
                />

                <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => casesQ.refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[22px] border border-slate-100 bg-slate-50/50 p-5 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center gap-3 text-slate-500 mb-3">
                <div className="p-2 rounded-xl bg-blue-100 text-blue-600">
                  <Package className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">Total Pedidos</span>
              </div>
              <div className="text-xl font-black text-slate-900">
                {caseDataQ.isLoading ? (
                  <div className="h-7 w-24 bg-slate-200 animate-pulse rounded-lg" />
                ) : (
                  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.totalValue)
                )}
              </div>
              <div className="mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-tight">Referente ao mês selecionado</div>
            </div>

            <div className="rounded-[22px] border border-slate-100 bg-slate-50/50 p-5 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center gap-3 text-slate-500 mb-3">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-600">
                  <Clock className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">Pendente</span>
              </div>
              <div className="text-xl font-black text-amber-600">
                {caseDataQ.isLoading ? (
                  <div className="h-7 w-24 bg-amber-100/50 animate-pulse rounded-lg" />
                ) : (
                  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.pendingValue)
                )}
              </div>
              <div className="mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-tight">Pagamento não confirmado</div>
            </div>

            <div className="rounded-[22px] border border-slate-100 bg-slate-50/50 p-5 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center gap-3 text-slate-500 mb-3">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600">
                  <Check className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">Faturado</span>
              </div>
              <div className="text-xl font-black text-emerald-600">
                {caseDataQ.isLoading ? (
                  <div className="h-7 w-24 bg-emerald-100/50 animate-pulse rounded-lg" />
                ) : (
                  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.invoicedValue)
                )}
              </div>
              <div className="mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-tight">Valor efetivamente recebido</div>
            </div>

            <div className="rounded-[22px] border border-slate-100 bg-slate-50/50 p-5 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center gap-3 text-slate-500 mb-3">
                <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">Ticket Médio</span>
              </div>
              <div className="text-xl font-black text-slate-900">
                {caseDataQ.isLoading ? (
                  <div className="h-7 w-24 bg-indigo-100/50 animate-pulse rounded-lg" />
                ) : (
                  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.avgTicket)
                )}
              </div>
              <div className="mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-tight">Valor por venda faturada</div>
            </div>
          </div>

          <div className="mt-6 rounded-[28px] border border-slate-100 bg-white/40 p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Desempenho Diário</h4>
                  <h3 className="text-sm font-bold text-slate-800">Vendas no Mês</h3>
                </div>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Total Faturado: <span className="text-emerald-600 ml-1">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.invoicedValue)}</span>
              </div>
            </div>
            
            <div className="h-[200px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="day" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 700 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis hide />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                    labelStyle={{ display: 'none' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
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
                            to={`/app/orders/${c.id}`}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("text/caseId", c.id)}
                            className="mb-3 block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-semibold text-slate-900 truncate flex-1">{title}</div>
                              <Badge variant="outline" className="text-[9px] h-4 px-1 font-bold text-blue-600 border-blue-100 flex-shrink-0">
                                #{c.meta_json?.external_id || c.id.slice(0, 8)}
                              </Badge>
                            </div>
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
                          <div className="flex items-center gap-2">
                            <Link to={`/app/orders/${c.id}`} className="font-semibold hover:underline">
                              {customersQ.data?.get(c.customer_id!)?.name || c.title || "Pedido"}
                            </Link>
                            <Badge variant="outline" className="text-[9px] h-4 px-1 font-bold text-blue-600 border-blue-100">
                                #{c.meta_json?.external_id || c.id.slice(0, 8)}
                            </Badge>
                          </div>
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
