import { useMemo, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useM30CasePresence } from "@/hooks/useM30CasePresence";
import { Lock } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { supabase } from "@/lib/supabase";
import { cn, titleizeState } from "@/lib/utils";
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
import { showError, showSuccess } from "@/utils/toast";
import {
  Clock,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  ShieldAlert,
  Plus,
  LayoutList,
  Columns2,
  Download,
  FileText,
  User,
  ExternalLink,
} from "lucide-react";
import { NewSalesOrderDialog } from "@/components/case/NewSalesOrderDialog";
import { getStateLabel } from "@/lib/journeyLabels";
import { useJourneyTransition } from "@/hooks/useJourneyTransition";
import { StateMachine } from "@/lib/journeys/types"
import { GlobalJourneyLogsDialog } from "@/components/case/GlobalJourneyLogsDialog";
import { checkTransitionBlocks, TransitionBlockReason } from "@/lib/journeys/validation";
import { TransitionBlockDialog } from "@/components/case/TransitionBlockDialog";

import { NewOperacaoM30CardDialog } from "@/components/operacao_m30/NewOperacaoM30CardDialog";
import { DateRangePickerCustom } from "@/components/ui/date-range-picker-custom";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isToday, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ClipboardList, MessageSquareWarning, CheckCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatePostingCalendarDialog } from "@/components/operacao_m30/CreatePostingCalendarDialog";

const DASHBOARD_VIEW_MODE_KEY_PREFIX = "dashboard_view_mode_v1:";

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

type CaseRow = {
  id: string;
  journey_id: string | null;
  customer_id?: string | null;
  customer_entity_id: string | null;
  deliverable_id: string | null;
  title: string | null;
  status: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  assigned_user_id: string | null;
  is_chat?: boolean;
  users_profile?: { display_name: string | null; email: string | null } | null;
  // Nem sempre existe FK/relacionamento exposto; então mantemos também meta_json.
  journeys?: { key: string | null; name: string | null; is_crm?: boolean } | null;
  meta_json?: any;
  customer_entity?: { display_name: string | null } | null;
};

type JourneyOpt = {
  id: string;
  key: string;
  name: string;
  is_crm?: boolean;
  default_state_machine_json?: any;
};

type DebugRpc = {
  tenant_id: string;
  journey_key: string;
  journey_ids: string[];
  cases_total: number;
  by_status: Array<{ status: string; qty: number }>;
  latest: Array<{
    id: string;
    status: string;
    state: string;
    journey_id: string | null;
    meta_journey_key: string | null;
    created_at: string;
    updated_at: string;
  }>;
};

type ReadRow = { case_id: string; last_seen_at: string };

type WaMsgLite = { case_id: string | null; occurred_at: string; from_phone: string | null };

type WaInstanceRow = { id: string; phone_number: string | null };

function formatCaseDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d)) {
    return `Hoje às ${format(d, 'HH:mm')}`;
  }
  return format(d, "dd/MM/yyyy 'às' HH:mm");
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

function digitsTail(s: string | null | undefined, tail = 11) {
  const d = String(s ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length > tail ? d.slice(-tail) : d;
}

function samePhoneLoose(a: string | null | undefined, b: string | null | undefined) {
  const da = digitsTail(a);
  const db = digitsTail(b);
  if (!da || !db) return false;
  if (Math.min(da.length, db.length) < 10) return false;
  return da === db;
}

function M30CalendarView({ cases, date, onChangeDate, locks }: { cases: CaseRow[], date: Date, onChangeDate: (d: Date) => void, locks: Record<string, any> }) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(monthStart);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  // blanks before 1st day (0 = sunday)
  const blanks = Array.from({ length: startDayOfWeek }).map((_, i) => <div key={`blank-${i}`} className="bg-slate-50/50 rounded-[24px] border border-transparent min-h-[140px]" />);

  const nextMonth = () => onChangeDate(addMonths(date, 1));
  const prevMonth = () => onChangeDate(subMonths(date, 1));

  // group cases by day
  const casesByDay = new Map<string, CaseRow[]>();
  for (const c of cases) {
    const rawDate = (c.meta_json as any)?.due_at;
    if (!rawDate) continue;
    
    // ignore bad dates
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) continue;

    const dayKey = format(d, 'yyyy-MM-dd');
    const arr = casesByDay.get(dayKey) ?? [];
    arr.push(c);
    casesByDay.set(dayKey, arr);
  }

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4 bg-white/70 p-3 rounded-[24px] border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 capitalize ml-2">
          {format(date, 'MMMM yyyy', { locale: ptBR })}
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-xl h-8 text-xs font-semibold" onClick={() => onChangeDate(new Date())}>
            Hoje
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-7 gap-3 mb-2 px-1">
        {weekDays.map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-3">
        {blanks}
        {daysInMonth.map((day) => {
          const dayKey = format(day, 'yyyy-MM-dd');
          const dayCases = casesByDay.get(dayKey) ?? [];
          const isTodayDate = isToday(day);

          return (
            <div key={dayKey} className={cn(
              "bg-white/80 rounded-[24px] border p-2 min-h-[140px] shadow-sm transition-all flex flex-col",
              isTodayDate ? "border-[hsl(var(--byfrost-accent)/0.4)] bg-[hsl(var(--byfrost-accent)/0.02)] ring-1 ring-[hsl(var(--byfrost-accent)/0.2)]" : "border-slate-200"
            )}>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className={cn(
                  "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full tracking-tighter",
                  isTodayDate ? "bg-[hsl(var(--byfrost-accent))] text-white" : "text-slate-700"
                )}>{format(day, 'd')}</span>
                {dayCases.length > 0 && (
                  <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                    {dayCases.length} caso{dayCases.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5 mt-1 max-h-[140px] overflow-y-auto no-scrollbar scroll-smooth">
                {dayCases.map(c => {
                  const commitmentId = (c.meta_json as any)?.commitment_id;
                  const linkTo = commitmentId ? `/app/commitments/${commitmentId}` : `/app/operacao-m30/${c.id}`;
                  return (
                    <Link
                      key={c.id}
                      to={linkTo}
                      className="block p-2 rounded-[16px] border border-slate-100 bg-white hover:bg-slate-50 hover:border-slate-200 transition-colors cursor-pointer shadow-sm"
                      title={commitmentId ? `Ir para Contrato ${commitmentId.slice(0,8)}` : (c.title ?? "Caso sem título")}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="text-[11px] font-semibold text-slate-800 line-clamp-2 leading-tight">
                          {c.title || "Caso sem título"}
                        </div>
                        {locks[c.id] && (
                          <div className="text-rose-600 shrink-0" title={`Editado por ${locks[c.id].userName}`}>
                            <Lock className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                      {Boolean(c.users_profile?.display_name || c.users_profile?.email) && (
                        <div className="text-[10px] text-slate-500 truncate mt-1 font-medium">
                          {c.users_profile?.display_name || c.users_profile?.email}
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OperacaoM30() {
  const { activeTenantId, activeTenant, isSuperAdmin } = useTenant();
  const { user } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const { prefs } = useTheme();
  const qc = useQueryClient();
  const locks = useM30CasePresence(activeTenantId);

  const [refreshingToken, setRefreshingToken] = useState(false);
  const [q, setQ] = useState("");
  const [movingCaseId, setMovingCaseId] = useState<string | null>(null);
  const [transitionBlock, setTransitionBlock] = useState<{
    open: boolean;
    nextStateName: string;
    reasons: TransitionBlockReason[];
  }>({ open: false, nextStateName: "", reasons: [] });
  const [newSalesOrderOpen, setNewSalesOrderOpen] = useState(false);
  // Tab e visualização
  const [tab, setTab] = useState<"kanban" | "calendar" | "contracts">("kanban");
  const [viewMode, setViewMode] = useState<"kanban" | "list">(() => {
    try {
      return (localStorage.getItem("operacao_m30_view_mode") as any) || "kanban";
    } catch {
      return "kanban";
    }
  });
  const [calendarDate, setCalendarDate] = useState(new Date());

  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [massUpdating, setMassUpdating] = useState(false);

  useEffect(() => {
    localStorage.setItem("operacao_m30_view_mode", viewMode);
  }, [viewMode]);

  const toggleCaseSelection = (id: string) => {
    setSelectedCaseIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const clearSelection = () => setSelectedCaseIds([]);

  const handleSingleAssign = async (caseId: string, userId: string) => {
    try {
      await supabase.from("cases").update({ assigned_user_id: userId === "__unassigned__" ? null : userId }).eq("id", caseId);
      casesQ.refetch();
      showSuccess("Responsável atualizado com sucesso!");
    } catch (e: any) {
      showError("Erro ao atribuir responsável", e);
    }
  };

  const handleSingleUpdateMeta = async (caseId: string, key: string, value: any, currentMeta: any) => {
    try {
      await supabase.from("cases").update({ meta_json: { ...(currentMeta || {}), [key]: value } }).eq("id", caseId);
      casesQ.refetch();
      showSuccess("Estilo atualizado com sucesso!");
    } catch (e: any) {
      showError("Erro ao atualizar estilo", e);
    }
  };

  const handleSingleUpdateCaseType = async (caseId: string, value: string) => {
    try {
      await supabase.from("cases").update({ case_type: value }).eq("id", caseId);
      casesQ.refetch();
      showSuccess("Tipo de caso atualizado com sucesso!");
    } catch (e: any) {
      showError("Erro ao atualizar tipo de caso", e);
    }
  };

  const handleSingleClose = async (caseId: string) => {
    try {
      await supabase.from("cases").update({ status: "closed" }).eq("id", caseId);
      casesQ.refetch();
      showSuccess("Caso concluído com sucesso!");
    } catch (e: any) {
      showError("Erro ao concluir", e);
    }
  };

  const handleMassAssign = async (userId: string) => {
    if (!selectedCaseIds.length) return;
    setMassUpdating(true);
    try {
      await supabase.from("cases").update({ assigned_user_id: userId === "__unassigned__" ? null : userId }).in("id", selectedCaseIds);
      casesQ.refetch();
      clearSelection();
      showSuccess("Responsável atualizado com sucesso!");
    } catch (e: any) {
      showError("Erro ao atribuir responsável", e);
    } finally {
      setMassUpdating(false);
    }
  };

  const handleMassMoveState = async (nextState: string) => {
    if (!selectedCaseIds.length) return;
    setMassUpdating(true);
    try {
      const journeyConfig = selectedJourney?.default_state_machine_json as unknown as StateMachine;
      const promises = selectedCaseIds.map(cid => {
         const oldState = filteredRows.find(c => c.id === cid)?.state || "";
         if (oldState === nextState) return Promise.resolve();
         return transitionState(cid, oldState, nextState, journeyConfig);
      });
      await Promise.allSettled(promises);
      clearSelection();
      showSuccess("Estágio atualizado em lote!");
    } catch (e: any) {
      showError("Alguns casos podem não ter sido movidos.", e);
    } finally {
      setMassUpdating(false);
    }
  };

  // Filtros jornada Auditoria e Responsável
  const [instanceFilterId, setInstanceFilterId] = useState<string>(() => { try { return JSON.parse(localStorage.getItem("operacao_m30_filters") || "{}").instanceFilterId || "all"; } catch { return "all"; } });
  const [assigneeFilterId, setAssigneeFilterId] = useState<string>(() => { try { return JSON.parse(localStorage.getItem("operacao_m30_filters") || "{}").assigneeFilterId || "all"; } catch { return "all"; } });
  const [entityFilterId, setEntityFilterId] = useState(() => { try { return JSON.parse(localStorage.getItem("operacao_m30_filters") || "{}").entityFilterId || "all"; } catch { return "all"; } });
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date } | undefined>(() => {
    try {
      const f = JSON.parse(localStorage.getItem("operacao_m30_filters") || "{}");
      if (f.startDate || f.endDate) {
        return {
          from: f.startDate ? new Date(f.startDate) : undefined,
          to: f.endDate ? new Date(f.endDate) : undefined,
        };
      }
    } catch {}
    return undefined;
  });

  const startDate = dateRange?.from ? dateRange.from.toISOString() : "";
  const endDate = dateRange?.to ? dateRange.to.toISOString() : "";

  useEffect(() => {
    localStorage.setItem("operacao_m30_filters", JSON.stringify({
      instanceFilterId,
      assigneeFilterId,
      entityFilterId,
      startDate,
      endDate
    }));
  }, [instanceFilterId, assigneeFilterId, entityFilterId, startDate, endDate]);

  const entitiesQ = useQuery({
    queryKey: ["active_client_entities", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data: commitments } = await supabase
        .from("commercial_commitments")
        .select("customer_entity_id")
        .eq("tenant_id", activeTenantId!)
        .eq("commitment_type", "contract")
        .eq("status", "active")
        .is("deleted_at", null);
      
      const activeIds = Array.from(new Set(commitments?.map(c => c.customer_entity_id) || []));
      if (!activeIds.length) return [];

      const { data, error } = await supabase
        .from("core_entities")
        .select("id,display_name")
        .eq("tenant_id", activeTenantId!)
        .in("id", activeIds)
        .is("deleted_at", null)
        .order("display_name");
        
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
  });

  const tenantUsersQ = useQuery({
    queryKey: ["tenant_users_hierarchy", activeTenantId, user?.id],
    enabled: Boolean(activeTenantId && user?.id),
    staleTime: 60_000,
    queryFn: async () => {
      let isAdmin = isSuperAdmin;
      
      if (!isAdmin) {
        const { data: meProfile } = await supabase
          .from("users_profile")
          .select("role")
          .eq("tenant_id", activeTenantId!)
          .eq("user_id", user!.id)
          .maybeSingle();

        isAdmin = meProfile?.role === "admin";
      }

      const { data: allUsers, error: usersErr } = await supabase
        .from("users_profile")
        .select("user_id, display_name, email")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("display_name", { ascending: true });

      if (usersErr) throw usersErr;
      const list = (allUsers ?? []) as Array<{ user_id: string; display_name: string | null; email: string | null }>;

      if (isAdmin) return list;

      const { data: subordinateIds, error: rpcErr } = await supabase
        .rpc("get_subordinates", { p_tenant_id: activeTenantId!, p_user_id: user!.id });

      if (rpcErr) {
        return list.filter(u => u.user_id === user!.id);
      }

      const subSet = new Set(subordinateIds as string[]);
      return list.filter(u => u.user_id === user!.id || subSet.has(u.user_id));
    },
  });

  const allInstancesQ = useQuery({
    queryKey: ["wa_instances_all", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_instances")
        .select("id,name,phone_number")
        .eq("tenant_id", activeTenantId!)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; phone_number: string | null }>;
    },
  });



  const instanceQ = useQuery({
    queryKey: ["wa_instance_active_first", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const data = allInstancesQ.data?.[0] ?? null;
      return data as WaInstanceRow | null;
    },
  });

  const contractsQ = useQuery({
    queryKey: ["m30_active_contracts", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_commitments")
        .select(`
          id,
          status,
          created_at,
          customer_entity_id,
          metadata,
          customer:core_entities!commercial_commitments_customer_fk(id, display_name, metadata)
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("commitment_type", "contract")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
  });

  const filteredContracts = useMemo(() => {
    let base = contractsQ.data || [];

    // Filter by Entity (Cliente)
    if (entityFilterId !== "all") {
      base = base.filter(c => {
        const eid = c.customer_entity_id;
        if (entityFilterId === "__unassigned__") return !eid;
        return eid === entityFilterId;
      });
    }

    // Filter by Dates
    if (startDate) {
      const start = new Date(startDate).getTime();
      base = base.filter(c => new Date(c.created_at).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const endMs = end.getTime();
      base = base.filter(c => new Date(c.created_at).getTime() <= endMs);
    }

    // Filter by Search Query
    const qq = q.trim().toLowerCase();
    if (qq) {
      base = base.filter(c => {
        const name = (c.customer?.display_name || "").toLowerCase();
        const label = (c.customer?.metadata?.internal_label || "").toLowerCase();
        const id = c.id.toLowerCase();
        return name.includes(qq) || label.includes(qq) || id.includes(qq);
      });
    }

    return base;
  }, [contractsQ.data, entityFilterId, startDate, endDate, q]);

  const globalLabelsMap = useMemo(() => {
    const map = new Map<string, {id: string, name: string, color: string}>();
    if (!contractsQ.data) return map;
    for (const c of contractsQ.data) {
      if (c.metadata?.labels && Array.isArray(c.metadata.labels)) {
        for (const l of c.metadata.labels) {
          map.set(l.id, l);
        }
      }
    }
    return map;
  }, [contractsQ.data]);

  const groupedM30Contracts = useMemo(() => {
    const list = filteredContracts;
    const groups: Record<string, any[]> = {};
    for (const c of list) {
      const eid = c.customer_entity_id;
      if (!groups[eid]) groups[eid] = [];
      groups[eid].push(c);
    }
    return groups;
  }, [filteredContracts]);

  // Back-compat: /app?journey=<uuid> -> /app/j/<journeys.key>
  const legacyJourneyId = useMemo(() => {
    const sp = new URLSearchParams(loc.search);
    const id = sp.get("journey");
    return id && id.length > 10 ? id : null;
  }, [loc.search]);

  const journeyQ = useQuery({
    queryKey: ["tenant_journeys_enabled", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("journey_id, journeys(id,key,name,is_crm,default_state_machine_json)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true)
        .limit(300);
      if (error) throw error;

      // IMPORTANT: /app não deve listar jornadas CRM.
      const opts: JourneyOpt[] = (data ?? [])
        .map((r: any) => r.journeys)
        .filter(Boolean)
        .filter((j: any) => !j.is_crm && j.key !== "trello")
        .map((j: any) => ({
          id: j.id,
          key: j.key,
          name: j.name,
          is_crm: false,
          default_state_machine_json: j.default_state_machine_json ?? {},
        }));

      opts.sort((a, b) => a.name.localeCompare(b.name));
      return opts;
    },
  });

  const selectedKey = "operacao_m30";

  const selectedJourney = useMemo(() => {
    if (!selectedKey) return null;
    return (journeyQ.data ?? []).find((j) => j.key === selectedKey) ?? null;
  }, [journeyQ.data, selectedKey]);

  const isSalesOrderJourney = false;

  const isCrm = Boolean(selectedJourney?.is_crm);

  // List view (only implemented for this journey right now)
  // A visualização Trello/Calendar não usa listMode
  // Journey logic specific

  const states = useMemo(() => {
    const st = (selectedJourney?.default_state_machine_json?.states ?? []) as string[];
    const normalized = (st ?? []).map((s) => String(s)).filter(Boolean);
    return Array.from(new Set(normalized));
  }, [selectedJourney]);

  // Para debug e confiabilidade pós-reset:
  // - buscamos os casos do tenant (respeita RLS)
  // - filtramos por key (preferência: journeys.key; fallback: meta_json.journey_key)
  const togglePriority = async (c: CaseRow) => {
    const isPriority = Boolean((c.meta_json as any)?.priority);
    await supabase.from("cases").update({
      meta_json: { ...c.meta_json, priority: !isPriority }
    }).eq("id", c.id);

    if (activeTenantId && user) {
      await supabase.from("timeline_events").insert({
        tenant_id: activeTenantId,
        case_id: c.id,
        event_type: "case_updated",
        actor_type: "admin",
        actor_id: user.id,
        message: !isPriority ? "Card marcado como Prioridade." : "Card desmarcado como Prioridade.",
        meta_json: { priority: !isPriority },
        occurred_at: new Date().toISOString(),
      });
    }

    qc.invalidateQueries({ queryKey: ["cases_by_tenant_journey", activeTenantId, selectedJourney?.id] });
  };
  const casesQ = useQuery({
    queryKey: ["cases_by_tenant_journey", activeTenantId, selectedJourney?.id],
    enabled: Boolean(activeTenantId && selectedJourney?.id),
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,journey_id,customer_id,customer_entity_id,title,status,state,created_at,updated_at,assigned_user_id,is_chat,users_profile:users_profile(display_name,email),meta_json"
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

  const lastInboundByCase = useMemo(() => {
    const m = new Map<string, any>();
    return m;
  }, []);

  const profileQ = useQuery({
    queryKey: ["current_user_profile", activeTenantId, user?.id],
    enabled: Boolean(activeTenantId && user?.id),
    queryFn: async () => {
      if (isSuperAdmin) return { role: "admin" };
      const { data, error } = await supabase
        .from("users_profile")
        .select("role")
        .eq("tenant_id", activeTenantId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data ?? { role: "user" };
    },
  });

  // 1) Base: casos desta jornada (sem busca)
  const journeyRows = useMemo(() => {
    const rows = casesQ.data ?? [];
    if (!selectedKey) return [] as CaseRow[];

    return rows.filter((r) => {
      const keyFromJoin = r.journeys?.key ?? null;
      const keyFromMeta = (r.meta_json as any)?.journey_key ?? null;

      if (keyFromJoin && keyFromJoin === selectedKey) return true;
      if (keyFromMeta && keyFromMeta === selectedKey) return true;

      // fallback adicional por journey_id quando a jornada selecionada foi encontrada
      if (selectedJourney?.id && r.journey_id && r.journey_id === selectedJourney.id) return true;

      return false;
    });
  }, [casesQ.data, selectedKey, selectedJourney?.id]);

  // 2) Clientes (somente CRM)
  const customerIds = useMemo(() => {
    if (!isCrm) return [] as string[];
    const ids = new Set<string>();
    for (const r of journeyRows) {
      const cid = String((r as any).customer_id ?? "");
      if (cid && cid.length > 10) ids.add(cid);
    }
    return Array.from(ids);
  }, [journeyRows, isCrm]);

  const customersQ = useQuery({
    queryKey: ["customers_by_ids", activeTenantId, customerIds.join(",")],
    enabled: Boolean(activeTenantId && isCrm && customerIds.length),
    staleTime: 20_000,
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

  const caseIdsForLookup = useMemo(() => {
    if (!isCrm) return [] as string[];
    return journeyRows.map((r) => r.id);
  }, [journeyRows, isCrm]);

  const casePhoneQ = useQuery({
    queryKey: ["crm_case_phone_fallback", activeTenantId, caseIdsForLookup.join(",")],
    enabled: Boolean(activeTenantId && isCrm && caseIdsForLookup.length),
    staleTime: 20_000,
    queryFn: async () => {
      // Best-effort: tenta pegar um número relacionado ao case na criação (ex: case_fields.phone)
      const { data, error } = await supabase
        .from("case_fields")
        .select("case_id,key,value_text")
        // NOTE: case_fields não tem tenant_id; o RLS já valida via cases
        .in("case_id", caseIdsForLookup)
        .in("key", ["whatsapp", "phone", "customer_phone"])
        .limit(2000);
      if (error) throw error;

      const priority = new Map<string, number>([
        ["whatsapp", 1],
        ["customer_phone", 2],
        ["phone", 3],
      ]);

      const best = new Map<string, { p: number; v: string }>();
      for (const r of data ?? []) {
        const cid = String((r as any).case_id ?? "");
        const k = String((r as any).key ?? "");
        const v = String((r as any).value_text ?? "").trim();
        if (!cid || !v) continue;
        const p = priority.get(k) ?? 999;
        const cur = best.get(cid);
        if (!cur || p < cur.p) best.set(cid, { p, v });
      }

      const out = new Map<string, string>();
      for (const [cid, { v }] of best.entries()) out.set(cid, v);
      return out;
    },
  });

  const caseEntityIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of journeyRows) {
      const eid = (r as any).customer_entity_id || (r as any).customer_id || (r.meta_json as any)?.entity_id;
      if (eid && typeof eid === 'string') s.add(eid);
    }
    return Array.from(s);
  }, [journeyRows]);

  const caseEntitiesQ = useQuery({
    queryKey: ["m30_case_entities", activeTenantId, caseEntityIds.join(",")],
    enabled: Boolean(activeTenantId && caseEntityIds.length > 0),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id, display_name")
        .eq("tenant_id", activeTenantId!)
        .in("id", caseEntityIds)
        .is("deleted_at", null);
      if (error) throw error;
      const m = new Map<string, string>();
      for (const d of data ?? []) m.set(d.id, d.display_name);
      return m;
    }
  });

  // 3) Busca + Filtros Extras (Instância e Data)
  const filteredRows = useMemo(() => {
    let base = journeyRows;

    // Filtro de Instância
    if (instanceFilterId !== "all") {
      base = base.filter((r) => {
        const meta = r.meta_json as any;
        const instId = meta?.instance_id || meta?.wa_instance_id || meta?.monitoring?.wa_instance_id || meta?.monitoring?.instance_id;
        return instId === instanceFilterId;
      });
    }


    // Filtro de Datas
    if (startDate) {
      const start = new Date(startDate).getTime();
      base = base.filter((r) => new Date(r.created_at).getTime() >= start);
    }
    if (endDate) {
      // End date normally inclusive of the day
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const endMs = end.getTime();
      base = base.filter((r) => new Date(r.created_at).getTime() <= endMs);
    }

    // Filtro de Responsável
    if (assigneeFilterId !== "all") {
      base = base.filter((r) => {
        if (assigneeFilterId === "__unassigned__") return !r.assigned_user_id;
        return r.assigned_user_id === assigneeFilterId;
      });
    }



    // Filtro de Entidade (Cliente)
    if (entityFilterId !== "all") {
      base = base.filter((r) => {
        const eid = String((r as any).customer_entity_id || (r.meta_json as any)?.entity_id || r.customer_id || "");
        if (entityFilterId === "__unassigned__") return !eid;
        return eid === entityFilterId;
      });
    }

    const qq = q.trim().toLowerCase();
    if (!qq) return base;

    return base.filter((r) => {
      const eid = (r as any).customer_entity_id || (r.meta_json as any)?.entity_id || r.customer_id;
      const entityName = eid ? caseEntitiesQ.data?.get(eid) : null;
      
      const cust = isCrm ? customersQ.data?.get(String((r as any).customer_id ?? "")) : null;
      const metaPhone = getMetaPhone(r.meta_json);
      const fieldPhone = isCrm ? casePhoneQ.data?.get(r.id) : null;

      const t = `${r.title ?? ""} ${(r.users_profile?.display_name ?? "")} ${(r.users_profile?.email ?? "")} ${entityName ?? ""} ${cust?.name ?? ""} ${cust?.phone_e164 ?? ""} ${cust?.email ?? ""} ${metaPhone ?? ""} ${fieldPhone ?? ""}`.toLowerCase();

      // Busca por número exata ou parcial sem formatação
      const cleanQ = qq.replace(/\D/g, "");
      if (cleanQ && (
        (metaPhone || "").replace(/\D/g, "").includes(cleanQ) ||
        (fieldPhone || "").replace(/\D/g, "").includes(cleanQ) ||
        (cust?.phone_e164 || "").replace(/\D/g, "").includes(cleanQ)
      )) return true;

      return t.includes(qq);
    });
  }, [journeyRows, q, isCrm, customersQ.data, caseEntitiesQ.data, casePhoneQ.data, instanceFilterId, assigneeFilterId, entityFilterId, startDate, endDate]);

  const visibleCaseIds = useMemo(() => filteredRows.map((r) => r.id), [filteredRows]);

  const readsQ = useQuery({
    queryKey: ["case_message_reads", activeTenantId, user?.id],
    enabled: Boolean(activeTenantId && user?.id),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_message_reads")
        .select("case_id,last_seen_at")
        .eq("tenant_id", activeTenantId!)
        .eq("user_id", user!.id)
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as any as ReadRow[];
    },
  });

  const lastInboundQ = useQuery({
    queryKey: ["case_last_inbound", activeTenantId, visibleCaseIds.join(",")],
    enabled: Boolean(activeTenantId && visibleCaseIds.length),
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_messages")
        .select("case_id,occurred_at,from_phone")
        .eq("tenant_id", activeTenantId!)
        .eq("direction", "inbound")
        .in("case_id", visibleCaseIds)
        .order("occurred_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as any as WaMsgLite[];
    },
  });

  const readByCase = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of readsQ.data ?? []) m.set(r.case_id, r.last_seen_at);
    return m;
  }, [readsQ.data]);

  const lastInboundAtByCase = useMemo(() => {
    const m = new Map<string, string>();
    const instPhone = instanceQ.data?.phone_number ?? null;

    for (const row of lastInboundQ.data ?? []) {
      const cid = String((row as any).case_id ?? "");
      if (!cid) continue;
      if (instPhone && samePhoneLoose(instPhone, (row as any).from_phone)) continue;
      if (!m.has(cid)) m.set(cid, row.occurred_at);
    }
    return m;
  }, [lastInboundQ.data, instanceQ.data?.phone_number]);

  const unreadByCase = useMemo(() => {
    const s = new Set<string>();
    for (const [cid, lastInboundAt] of lastInboundAtByCase.entries()) {
      const seenAt = readByCase.get(cid) ?? null;
      if (!seenAt) {
        s.add(cid);
        continue;
      }
      if (new Date(lastInboundAt).getTime() > new Date(seenAt).getTime()) s.add(cid);
    }
    return s;
  }, [lastInboundAtByCase, readByCase]);

  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filteredRows) {
      const k = String(r.status ?? "");
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredRows]);

  // Diagnóstico "verdade do banco" (SECURITY DEFINER) — detecta casos mesmo quando o front não enxerga via RLS.
  const debugRpcQ = useQuery({
    queryKey: ["debug_cases_for_tenant_journey", activeTenantId, selectedKey],
    enabled: Boolean(activeTenantId && selectedKey),
    refetchInterval: 120_000,
    staleTime: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("debug_cases_for_tenant_journey", {
        p_tenant_id: activeTenantId!,
        p_journey_key: selectedKey,
      });
      if (error) throw error;
      return data as any as DebugRpc;
    },
  });

  // Diagnóstico do lado do banco: como o Postgres está vendo seu JWT?
  const rlsDiagQ = useQuery({
    queryKey: ["rls_diag", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 120_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [claimsRes, superRes, panelRes] = await Promise.all([
        supabase.rpc("jwt_claims"),
        supabase.rpc("is_super_admin"),
        supabase.rpc("is_panel_user", { p_tenant_id: activeTenantId! }),
      ]);

      return {
        jwtClaims: claimsRes.error ? null : (claimsRes.data as any),
        jwtClaimsError: claimsRes.error ? claimsRes.error.message : null,
        isSuperAdminDb: superRes.error ? null : (superRes.data as any),
        isSuperAdminDbError: superRes.error ? superRes.error.message : null,
        isPanelUserDb: panelRes.error ? null : (panelRes.data as any),
        isPanelUserDbError: panelRes.error ? panelRes.error.message : null,
      };
    },
  });

  const pendQ = useQuery({
    queryKey: ["pendencies_open", activeTenantId, filteredRows.map((c) => c.id).join(",")],
    enabled: Boolean(activeTenantId && filteredRows.length),
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
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
        const cur = byCase.get((p as any).case_id) ?? { open: 0, need_location: false };
        cur.open += 1;
        if ((p as any).type === "need_location") cur.need_location = true;
        byCase.set((p as any).case_id, cur);
      }
      return byCase;
    },
  });

  const columns = useMemo(() => {
    const baseStates = states.length ? states : Array.from(new Set(filteredRows.map((r) => r.state)));

    const known = new Set(baseStates);
    const extras = Array.from(new Set(filteredRows.map((r) => r.state))).filter((s) => !known.has(s));

    const all = [...baseStates, ...(extras.length ? ["__other__"] : [])];

    const sortCases = (a: CaseRow, b: CaseRow) => {
      const ap = Boolean((a.meta_json as any)?.priority);
      const bp = Boolean((b.meta_json as any)?.priority);
      if (ap !== bp) return ap ? -1 : 1;

      const au = unreadByCase.has(a.id);
      const bu = unreadByCase.has(b.id);
      if (au !== bu) return au ? -1 : 1;

      const at = lastInboundAtByCase.get(a.id) ?? a.updated_at;
      const bt = lastInboundAtByCase.get(b.id) ?? b.updated_at;
      return new Date(bt).getTime() - new Date(at).getTime();
    };

    return all.map((st) => {
      const isAnalise = st === "em_anlise" || st === "em_analise";

      const itemsRaw =
        st === "__other__"
          ? filteredRows.filter((r) => {
            if (known.has(r.state)) return false;
            // If current state column is analise-related, maybe it's "known" via typo
            if (isAnalise && (r.state === "em_anlise" || r.state === "em_analise")) return false;
            return true;
          })
          : filteredRows.filter((r) => {
            if (r.state === st) return true;
            if (isAnalise && (r.state === "em_anlise" || r.state === "em_analise")) return true;
            return false;
          });

      const items = [...itemsRaw].sort(sortCases);

      return {
        key: st,
        label: st === "__other__" ? "Outros" : getStateLabel(selectedJourney as any, st),
        items,
      };
    });
  }, [filteredRows, states, unreadByCase, lastInboundAtByCase, selectedJourney]);

  const listStateOptions = useMemo(() => {
    const baseStates = states.length ? states : Array.from(new Set(filteredRows.map((r) => r.state)));
    const known = new Set(baseStates);
    const extras = Array.from(new Set(filteredRows.map((r) => r.state))).filter((s) => !known.has(s));
    const all = Array.from(new Set([...baseStates, ...extras].filter(Boolean)));

    return all.map((st) => ({
      value: st,
      label: getStateLabel(selectedJourney as any, st) || titleizeState(st),
    }));
  }, [states, filteredRows, selectedJourney]);

  const listRows = useMemo(() => {
    const sortCases = (a: CaseRow, b: CaseRow) => {
      const au = unreadByCase.has(a.id);
      const bu = unreadByCase.has(b.id);
      if (au !== bu) return au ? -1 : 1;

      const at = lastInboundAtByCase.get(a.id) ?? a.updated_at;
      const bt = lastInboundAtByCase.get(b.id) ?? b.updated_at;
      return new Date(bt).getTime() - new Date(at).getTime();
    };

    return [...filteredRows].sort(sortCases);
  }, [filteredRows, unreadByCase, lastInboundAtByCase]);

  const shouldShowInvalidJourneyBanner = false;

  const tokenLooksSuperAdminUi = Boolean(
    (user as any)?.app_metadata?.byfrost_super_admin || (user as any)?.app_metadata?.super_admin
  );

  const mismatch =
    selectedKey && debugRpcQ.data && debugRpcQ.data.cases_total > 0 && journeyRows.length === 0;

  const refreshToken = async () => {
    setRefreshingToken(true);
    try {
      await supabase.auth.refreshSession();
      await Promise.all([
        journeyQ.refetch(),
        casesQ.refetch(),
        pendQ.refetch(),
        debugRpcQ.refetch(),
        rlsDiagQ.refetch(),
      ]);
    } finally {
      setRefreshingToken(false);
    }
  };

  const { transitionState, updating: updatingCaseState } = useJourneyTransition();

  const updateCaseState = async (caseId: string, nextState: string) => {
    if (!activeTenantId) return;
    if (movingCaseId) return;
    if (updatingCaseState) return;

    // Find current state
    const currentCase = filteredRows.find(c => c.id === caseId);
    if (!currentCase) return;
    const oldState = currentCase.state;
    if (oldState === nextState) return;

    const isAdmin = profileQ.data?.role === 'admin' || (user as any)?.app_metadata?.role === 'super-admin';
    const isFinal = (s: string) => {
      const up = s.toUpperCase();
      return up.includes("CONCLU") || up.includes("FINAL") || up.includes("ENTREG");
    };

    if (isFinal(oldState) && !isAdmin) {
      showError("Apenas Admins podem reabrir tarefas concluídas.");
      return;
    }

    setMovingCaseId(caseId);

    try {
      // Pass journeyConfig from selectedJourney (or from row if needed, but Dashboard assumes single journey context usually)
      const journeyConfig = selectedJourney?.default_state_machine_json as unknown as StateMachine;

      const blocksReasons = await checkTransitionBlocks(supabase, activeTenantId, caseId, oldState, nextState, journeyConfig);

      if (blocksReasons.length > 0) {
        setTransitionBlock({ open: true, nextStateName: nextState, reasons: blocksReasons });
        return;
      }

      await transitionState(caseId, oldState, nextState, journeyConfig);

      // Sincronização com Entregáveis do Contrato
      if (isFinal(nextState) && currentCase.deliverable_id) {
        await supabase
          .from("deliverables")
          .update({ status: "completed" })
          .eq("id", currentCase.deliverable_id);
      }
    } catch (e: any) {
      // Toast already shown
    } finally {
      setMovingCaseId(null);
    }
  };

  const hasCrmAccess = (allJourneys: JourneyOpt[]) => allJourneys.some(j => j.is_crm);

  if (!journeyQ.isLoading && (journeyQ.data?.length ?? 0) === 0) {
    const allUserJourneys = (journeyQ.data || []); // This is already filtered
    // We need to know if they have ANY journey, even CRM
    return (
      <RequireAuth>
        <AppShell>
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 bg-white/40 rounded-[32px] border border-slate-200 backdrop-blur">
            <h2 className="text-xl font-semibold text-slate-800">Nenhuma jornada ativa no painel</h2>
            <p className="text-slate-500 mt-2 max-w-sm">
              Você não possui jornadas de operação padrão habilitadas.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild variant="outline" className="rounded-2xl h-11 px-6">
                <Link to="/app/crm">Ir para o CRM</Link>
              </Button>
              <Button asChild variant="ghost" className="rounded-2xl h-11 px-6">
                <Link to="/app/trello">Ver Tarefas</Link>
              </Button>
            </div>
          </div>
        </AppShell>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <AppShell>
        <div className="flex flex-col gap-6 p-6">
          {/* Header */}
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                  <LayoutList className="h-5 w-5" />
                </span>
                Operação M30
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Acompanhamento dos casos ativos desta jornada.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-[280px] mr-2">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Título, telefone, cliente…"
                  className="rounded-xl border-slate-200 dark:border-slate-850 text-sm pl-9 focus:border-indigo-400 focus:ring-indigo-400 w-full h-10"
                />
              </div>

              {activeTenantId && selectedJourney?.id && (isSuperAdmin || activeTenant?.role === "admin") ? (
                <NewOperacaoM30CardDialog tenantId={activeTenantId} journeyId={selectedJourney.id} />
              ) : null}

              <Button
                variant="outline"
                size="sm"
                className="h-10 rounded-xl"
                onClick={() => {
                  journeyQ.refetch();
                  casesQ.refetch();
                  pendQ.refetch();
                  debugRpcQ.refetch();
                  rlsDiagQ.refetch();
                  lastInboundQ.refetch();
                  readsQ.refetch();
                }}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
              </Button>
            </div>
          </div>

          {/* Tabs, View Mode & Filters */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center">
              <div className="flex items-center gap-4 flex-wrap flex-1">
                <div className="flex bg-slate-100 p-1 rounded-2xl self-start w-fit dark:bg-slate-900 shrink-0">
                  <button
                    onClick={() => setTab("kanban")}
                    className={cn(
                      "px-4 py-2 text-xs font-semibold rounded-xl transition-all",
                      tab === "kanban" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100" : "text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    )}
                  >
                    Quadro
                  </button>
                  <button
                    onClick={() => setTab("calendar")}
                    className={cn(
                      "px-4 py-2 text-xs font-semibold rounded-xl transition-all",
                      tab === "calendar" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100" : "text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    )}
                  >
                    Calendário
                  </button>
                  <button
                    onClick={() => setTab("contracts")}
                    className={cn(
                      "px-4 py-2 text-xs font-semibold rounded-xl transition-all",
                      tab === "contracts" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100" : "text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    )}
                  >
                    Contratos
                  </button>
                  <Link
                    to="/app/operacao-m30/postits"
                    className="px-4 py-2 text-xs font-semibold rounded-xl transition-all text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center justify-center"
                  >
                    Post-its
                  </Link>
                </div>

                {/* Inline Filters */}
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  <div className="flex flex-col gap-1 w-full sm:w-auto">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1">Cliente</label>
                    <select
                      value={entityFilterId}
                      onChange={(e) => setEntityFilterId(e.target.value)}
                      className="h-10 w-full sm:w-auto min-w-[160px] rounded-xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 px-3 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-400"
                    >
                      <option value="all">Todos os clientes</option>
                      <option value="__unassigned__">Sem cliente</option>
                      {(entitiesQ.data ?? []).map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.display_name || "Sem nome"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 w-full sm:w-auto">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1">Responsável</label>
                    <select
                      value={assigneeFilterId}
                      onChange={(e) => setAssigneeFilterId(e.target.value)}
                      className="h-10 w-full sm:w-auto min-w-[160px] rounded-xl border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 px-3 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-400"
                    >
                      <option value="all">Todos os responsáveis</option>
                      <option value="__unassigned__">Sem dono (Unassigned)</option>
                      {(tenantUsersQ.data ?? []).map((u) => (
                        <option key={u.user_id} value={u.user_id}>
                          {u.display_name ?? u.email ?? "Desconhecido"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 w-full sm:w-auto">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1">Período</label>
                    <div className="h-10 w-full sm:w-auto">
                      <DateRangePickerCustom
                        date={dateRange}
                        onDateChange={setDateRange}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {tab === "kanban" && (
                <div className="flex bg-slate-100 p-1 rounded-2xl self-start w-fit dark:bg-slate-900 shrink-0">
                  <button
                    onClick={() => setViewMode("kanban")}
                    className={cn(
                      "px-4 py-2 text-xs font-semibold rounded-xl transition-all",
                      viewMode === "kanban" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100" : "text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    )}
                    title="Modo Kanban"
                  >
                    <Columns2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "px-4 py-2 text-xs font-semibold rounded-xl transition-all",
                      viewMode === "list" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100" : "text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    )}
                    title="Modo Lista"
                  >
                    <LayoutList className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>



          {mismatch && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4" />
                <div className="min-w-0">
                  O banco diz que existem <span className="font-semibold">{debugRpcQ.data!.cases_total}</span> case(s)
                  nesse fluxo, mas a UI não está enxergando.
                  <div className="mt-1 text-xs text-amber-900/80">
                    Isso é quase sempre <span className="font-semibold">RLS (policies)</span> + token sem o claim
                    certo.
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  variant="secondary"
                  className="h-10 rounded-2xl"
                  onClick={refreshToken}
                  disabled={refreshingToken}
                >
                  {refreshingToken ? "Atualizando token…" : "Atualizar token (RLS)"}
                </Button>
                <div className="text-xs text-amber-900/80">
                  user.app_metadata: {tokenLooksSuperAdminUi ? "super-admin" : "(sem super-admin)"}
                  {rlsDiagQ.data?.isSuperAdminDbError
                    ? ` • db.is_super_admin erro: ${rlsDiagQ.data.isSuperAdminDbError}`
                    : typeof rlsDiagQ.data?.isSuperAdminDb === "boolean"
                      ? ` • db.is_super_admin: ${rlsDiagQ.data.isSuperAdminDb ? "true" : "false"}`
                      : ""}
                  {rlsDiagQ.data?.isPanelUserDbError
                    ? ` • db.is_panel_user erro: ${rlsDiagQ.data.isPanelUserDbError}`
                    : typeof rlsDiagQ.data?.isPanelUserDb === "boolean"
                      ? ` • db.is_panel_user: ${rlsDiagQ.data.isPanelUserDb ? "true" : "false"}`
                      : ""}
                </div>
              </div>

              {debugRpcQ.data?.latest?.length ? (
                <div className="mt-3 text-xs text-amber-900/80">
                  Últimos cases no fluxo (do banco):
                  <div className="mt-1 flex flex-wrap gap-2">
                    {debugRpcQ.data.latest.slice(0, 5).map((c) => (
                      <span
                        key={c.id}
                        className="rounded-full border border-amber-200 bg-white/70 px-2 py-1 font-medium"
                        title={`${c.status} • ${c.state}`}
                      >
                        {c.id.slice(0, 8)}…
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {!selectedKey && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Habilite ao menos uma jornada no Admin.
            </div>
          )}

          {selectedKey && (
            <div className="mt-4 overflow-x-auto pb-1">
              {tab === "kanban" && viewMode === "kanban" ? (
                <div className="flex min-w-[980px] gap-4 h-[calc(100vh-280px)] min-h-[500px]">
                  {columns.map((col, idx) => (
                    <div
                      key={col.key}
                      className="w-[320px] flex-shrink-0 flex flex-col h-full"
                      onDragOver={(e) => {
                        if (col.key === "__other__") return;
                        e.preventDefault();
                      }}
                      onDrop={(e) => {
                        if (col.key === "__other__") return;
                        const cid = e.dataTransfer.getData("text/caseId");
                        if (!cid) return;
                        if (movingCaseId) return;
                        updateCaseState(cid, col.key);
                      }}
                    >
                      <div className="flex items-center justify-between px-1 mb-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={col.items.length > 0 && col.items.every(item => selectedCaseIds.includes(item.id))}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                const newIds = col.items.map(i => i.id).filter(id => !selectedCaseIds.includes(id));
                                setSelectedCaseIds(prev => [...prev, ...newIds]);
                              } else {
                                const colIds = col.items.map(i => i.id);
                                setSelectedCaseIds(prev => prev.filter(id => !colIds.includes(id)));
                              }
                            }}
                            className="h-4 w-4 border-slate-300 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                          />
                          <div className="text-sm font-semibold text-slate-800">{col.label}</div>
                        </div>
                        <div className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {col.items.length}
                        </div>
                      </div>

                      <div
                        className={cn(
                          "flex flex-col gap-2 overflow-y-auto flex-1 p-2 mt-2 rounded-[24px]",
                          col.key !== "__other__" 
                            ? idx % 2 === 0 
                              ? "bg-slate-50/60 border border-dashed border-slate-200" 
                              : "bg-primary/5 border border-dashed border-primary/20"
                            : ""
                        )}
                      >
                        {col.items.map((c) => {
                          const pend = pendQ.data?.get(c.id);
                          const age = formatCaseDate(c.updated_at);
                          const isMoving = movingCaseId === c.id;
                          const unread = unreadByCase.has(c.id);
                          const cust = isCrm ? customersQ.data?.get(String((c as any).customer_id ?? "")) : null;

                          // Para CRM: o título do card vira o nome do cliente; se não tiver,
                          // usa o WhatsApp relacionado ao case no ato de criação (case_fields/meta_json).
                          const titlePrimary =
                            isCrm
                              ? (cust?.name ??
                                casePhoneQ.data?.get(c.id) ??
                                getMetaPhone((c as any).meta_json) ??
                                cust?.phone_e164 ??
                                c.title ??
                                "Caso")
                              : c.title ?? "Caso";

                          return (
                            <Link
                              key={c.id}
                              to={`/app/operacao-m30/${c.id}`}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/caseId", c.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              className={cn(
                                "block rounded-[22px] border bg-white p-4 shadow-sm transition hover:shadow-md",
                                (c.meta_json as any)?.priority ? "border-rose-500 ring-2 ring-rose-500/20" : unread ? "border-rose-200 hover:border-rose-300" : "border-slate-200 hover:border-slate-300",
                                "cursor-grab active:cursor-grabbing",
                                isMoving ? "opacity-60" : ""
                              )}
                              title="Arraste para mudar de etapa"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1 pr-1">
                                  <div className="flex items-center gap-2">
                                    <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} className="shrink-0 flex items-center pt-0.5">
                                      <Checkbox
                                        checked={selectedCaseIds.includes(c.id)}
                                        onCheckedChange={() => toggleCaseSelection(c.id)}
                                        className="h-3.5 w-3.5 border-slate-300 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                      />
                                    </div>
                                    <div className="truncate text-sm font-semibold text-slate-900" title={titlePrimary}>{titlePrimary}</div>
                                    {locks[c.id] && (
                                      <div className="flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] uppercase font-bold text-rose-600 ring-1 ring-inset ring-rose-500/20" title={`Sendo editado por ${locks[c.id].userName}`}>
                                        <Lock className="h-3 w-3" /> Em Edição
                                      </div>
                                    )}
                                    {((c.meta_json as any)?.pending_subtasks || []).some((st: any) => 
                                      st.script_items?.some((it: any) => it.comment && it.comment.trim() !== "")
                                    ) && (
                                      <div className="flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase font-bold text-amber-600 ring-1 ring-inset ring-amber-500/20" title="Cliente solicitou revisão no roteiro">
                                        <MessageSquareWarning className="h-3 w-3" /> Revisão
                                      </div>
                                    )}
                                  </div>
                                  
                                  {(() => {
                                    const eid = (c as any).customer_entity_id || (c as any).customer_id || (c.meta_json as any)?.entity_id;
                                    const metaName = (c.meta_json as any)?.customer_entity_name || (c.meta_json as any)?.entity_name;
                                    const entityFullName = metaName || (eid ? caseEntitiesQ.data?.get(eid) : null);
                                    
                                    if (!entityFullName) return null;

                                    const nameParts = entityFullName.split(" ");
                                    const entityDisplayName = nameParts.slice(0, 2).join(" ");
                                    
                                    return (
                                      <div 
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const commitmentId = (c.meta_json as any)?.commitment_id;
                                          if (commitmentId) {
                                            nav(`/app/commitments/${commitmentId}`);
                                          }
                                        }}
                                        className="mt-1 inline-block cursor-pointer hover:bg-indigo-100 transition-colors truncate max-w-full rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-bold text-indigo-700 ring-1 ring-inset ring-indigo-700/10"
                                        title={`${entityFullName} (Ver Contrato)`}
                                      >
                                        {entityDisplayName}
                                      </div>
                                    );
                                  })()}

                                  {((c.meta_json as any)?.labels || []).length > 0 && (
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {((c.meta_json as any)?.labels || []).map((lblId: string) => {
                                        const lbl = globalLabelsMap.get(lblId);
                                        if (!lbl) return null;
                                        return (
                                          <span key={lbl.id} className="text-[8px] font-bold px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: lbl.color, color: '#fff' }}>
                                            {lbl.name}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}

                                  <div className="mt-1 truncate text-xs text-slate-500">
                                    {(c.users_profile?.display_name ?? c.users_profile?.email ?? "Sem dono")}
                                  </div>
                                </div>

                                <div className="flex flex-col items-end gap-2">
                                  {unread ? (
                                    <span
                                      className="h-2.5 w-2.5 rounded-full bg-rose-600 ring-4 ring-rose-100"
                                      title="Mensagem nova"
                                      aria-label="Mensagem nova"
                                    />
                                  ) : null}

                                  {pend?.open ? (
                                    <Badge className="rounded-full border-0 bg-amber-100 text-amber-900 hover:bg-amber-100">
                                      {pend.open} pend.
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>

                              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-600">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                                  {age}
                                </div>
                                {pend?.need_location && (
                                  <div className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-rose-700">
                                    <MapPin className="h-3.5 w-3.5" />
                                    localização
                                  </div>
                                )}
                              </div>
                            </Link>
                          );
                        })}

                        {col.items.length === 0 && (
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/40 p-4 text-xs text-slate-500">
                            {col.key !== "__other__" ? "Solte um card aqui para mover." : "Sem cards aqui."}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : tab === "kanban" && viewMode === "list" ? (
                <div className="rounded-[22px] border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900">
                  <Table>
                    <TableHeader className="bg-slate-50/80 dark:bg-slate-850/50">
                      <TableRow className="hover:bg-transparent border-slate-200 dark:border-slate-800">
                        <TableHead className="w-[40px] pl-4">
                          <Checkbox
                            checked={listRows.length > 0 && selectedCaseIds.length === listRows.length}
                            onCheckedChange={() => {
                              if (selectedCaseIds.length === listRows.length) {
                                clearSelection();
                              } else {
                                setSelectedCaseIds(listRows.map(r => r.id));
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-600 dark:text-slate-400">Card / Cliente</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-600 dark:text-slate-400">Responsável</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-600 dark:text-slate-400">Estágio</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-600 dark:text-slate-400">Estilo</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-600 dark:text-slate-400">Data e Pend.</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {listRows.map((c) => {
                        const pend = pendQ.data?.get(c.id);
                        const age = formatCaseDate(c.updated_at);
                        const isMoving = movingCaseId === c.id;
                        const unread = unreadByCase.has(c.id);
                        const cust = isCrm ? customersQ.data?.get(String((c as any).customer_id ?? "")) : null;

                        const titlePrimary =
                          isCrm
                            ? (cust?.name ??
                              casePhoneQ.data?.get(c.id) ??
                              getMetaPhone((c as any).meta_json) ??
                              cust?.phone_e164 ??
                              c.title ??
                              "Caso")
                            : c.title ?? "Caso";

                        const eid = (c as any).customer_entity_id || (c as any).customer_id || (c.meta_json as any)?.entity_id;
                        const metaName = (c.meta_json as any)?.customer_entity_name || (c.meta_json as any)?.entity_name;
                        const entityFullName = metaName || (eid ? caseEntitiesQ.data?.get(eid) : null);
                        const entityDisplayName = entityFullName ? entityFullName.split(" ").slice(0, 2).join(" ") : null;

                        return (
                          <TableRow 
                            key={c.id}
                            className={cn(
                              "group border-slate-100 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/30 transition-colors",
                              selectedCaseIds.includes(c.id) && "bg-indigo-50/50 dark:bg-indigo-900/20"
                            )}
                          >
                            <TableCell className="pl-4 py-3">
                              <Checkbox
                                checked={selectedCaseIds.includes(c.id)}
                                onCheckedChange={() => toggleCaseSelection(c.id)}
                              />
                            </TableCell>
                            <TableCell className="py-3">
                              <Link to={`/app/operacao-m30/${c.id}`} className="block">
                                <div className="flex items-center gap-2">
                                  {unread && <div className="w-2 h-2 rounded-full bg-rose-500" />}
                                  <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{titlePrimary}</div>
                                </div>
                                {((c.meta_json as any)?.labels || []).length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {((c.meta_json as any)?.labels || []).map((lblId: string) => {
                                      const lbl = globalLabelsMap.get(lblId);
                                      if (!lbl) return null;
                                      return (
                                        <span key={lbl.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: lbl.color, color: '#fff' }}>
                                          {lbl.name}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                                {entityDisplayName && (
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{entityDisplayName}</div>
                                )}
                              </Link>
                            </TableCell>
                            <TableCell className="py-3">
                              <select
                                value={c.assigned_user_id || "__unassigned__"}
                                onChange={(e) => handleSingleAssign(c.id, e.target.value)}
                                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 outline-none hover:border-indigo-400 focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 min-w-[120px]"
                              >
                                <option value="__unassigned__">Sem dono</option>
                                {(tenantUsersQ.data ?? []).map(u => (
                                  <option key={u.user_id} value={u.user_id}>{u.display_name ?? u.email}</option>
                                ))}
                              </select>
                            </TableCell>
                            <TableCell className="py-3">
                              <select
                                value={c.state || ""}
                                onChange={(e) => updateCaseState(c.id, e.target.value)}
                                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 outline-none hover:border-indigo-400 focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 min-w-[140px]"
                              >
                                {listStateOptions.map(o => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </TableCell>
                            <TableCell className="py-3">
                              <select
                                value={c.case_type || "order"}
                                onChange={(e) => handleSingleUpdateCaseType(c.id, e.target.value)}
                                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold uppercase text-slate-800 outline-none hover:border-indigo-400 focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 min-w-[120px]"
                              >
                                <option value="planejamento">PLANEJAMENTO</option>
                                <option value="trafego_pago">TRÁFEGO PAGO</option>
                                <option value="arte_estatica">ARTE ESTÁTICA</option>
                                <option value="gravacao">GRAVAÇÃO</option>
                                <option value="relatorio">RELATÓRIO</option>
                                <option value="edicao">EDIÇÃO</option>
                                <option value="validacao">VALIDAÇÃO</option>
                                <option value="aprovacao">APROVAÇÃO</option>
                                <option value="calendario">CALENDÁRIO</option>
                                <option value="order">GERAL</option>
                              </select>
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex flex-col gap-1 items-start">
                                <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{age}</span>
                                {pend?.open ? (
                                  <Badge className="rounded-full border-0 bg-amber-100 text-amber-900 hover:bg-amber-100 px-1.5 h-5 text-[10px]">
                                    {pend.open} pend.
                                  </Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="py-3 pr-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.preventDefault(); handleSingleClose(c.id); }}
                                className="h-8 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                title="Concluir caso"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {listRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-10 text-center text-slate-500">
                            Nenhum caso encontrado.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : tab === "calendar" ? (
                <M30CalendarView cases={filteredRows} date={calendarDate} onChangeDate={setCalendarDate} locks={locks} />
              ) : tab === "contracts" ? (
                <div className="space-y-8 animate-in fade-in duration-500 pb-10">
                  {Object.entries(groupedM30Contracts).map(([entityId, contracts]) => (
                    <div key={entityId} className="space-y-4">
                      <div className="flex items-center gap-2 px-1">
                        <User className="h-5 w-5 text-slate-400" />
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                          {contracts[0].customer?.display_name || "Cliente sem Nome"}
                          {contracts[0].customer?.metadata?.internal_label && (
                            <span className="ml-2 text-blue-500 font-medium text-sm">
                              ({contracts[0].customer.metadata.internal_label})
                            </span>
                          )}
                          <span className="ml-3 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {contracts.length}
                          </span>
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {contracts.map(c => (
                          <Link
                            key={c.id}
                            to={`/app/commitments/${c.id}`}
                            className="group relative flex flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm transition-all hover:scale-[1.02] hover:border-blue-200 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
                          >
                            <div className="mb-4 flex items-start justify-between">
                              <Badge className={cn(
                                "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest",
                                c.status === "active" ? "bg-emerald-100 text-emerald-700" : 
                                c.status === "draft" ? "bg-amber-100 text-amber-700" :
                                c.status === "completed" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"
                              )}>
                                {c.status || "draft"}
                              </Badge>
                              <div className="rounded-full bg-slate-50 p-2 text-slate-400 transition-colors group-hover:bg-blue-50 group-hover:text-blue-500">
                                <ExternalLink className="h-4 w-4" />
                              </div>
                            </div>
                            <div className="mb-4">
                              <h4 className="font-bold text-slate-900 dark:text-white">
                                Contrato #{c.id.slice(0, 8)}
                              </h4>
                              <p className="text-xs text-slate-500">
                                Criado em {new Date(c.created_at).toLocaleDateString("pt-BR")}
                              </p>
                            </div>
                            <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ver detalhes</span>
                              <div className="h-2 w-2 rounded-full bg-blue-500 opacity-0 transition-opacity group-hover:opacity-100" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                  {Object.keys(groupedM30Contracts).length === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-[40px] border-2 border-dashed border-slate-100 bg-slate-50/50 py-20 text-center">
                      <FileText className="mb-4 h-12 w-12 text-slate-200" />
                      <h3 className="text-lg font-bold text-slate-400">Nenhum contrato ativo encontrado</h3>
                      <p className="max-w-xs text-sm text-slate-400">Os contratos aparecerão aqui assim que forem registrados no sistema.</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {casesQ.isError && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              Erro ao carregar casos: {(casesQ.error as any)?.message ?? ""}
            </div>
          )}

          <TransitionBlockDialog
            open={transitionBlock.open}
            onOpenChange={(v) => setTransitionBlock({ ...transitionBlock, open: v })}
            nextStateName={transitionBlock.nextStateName}
            blocks={transitionBlock.reasons}
          />
          {/* Mass Action Toolbar */}
          {selectedCaseIds.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white rounded-full px-4 py-3 shadow-xl flex items-center gap-4 animate-in slide-in-from-bottom-5">
              <div className="text-sm font-semibold pl-2">
                {selectedCaseIds.length} caso{selectedCaseIds.length > 1 ? 's' : ''} selecionado{selectedCaseIds.length > 1 ? 's' : ''}
              </div>
              <div className="h-6 w-px bg-slate-700" />
              
              <div className="flex items-center gap-2">
                <select
                  className="bg-slate-800 text-xs rounded-full px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 border border-slate-700 max-w-[140px]"
                  onChange={(e) => {
                    if (e.target.value) {
                      handleMassMoveState(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  disabled={massUpdating}
                >
                  <option value="">Mover para...</option>
                  {listStateOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>

                <select
                  className="bg-slate-800 text-xs rounded-full px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 border border-slate-700 max-w-[140px]"
                  onChange={(e) => {
                    if (e.target.value) {
                      handleMassAssign(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  disabled={massUpdating}
                >
                  <option value="">Responsável...</option>
                  <option value="__unassigned__">Sem dono (Unassigned)</option>
                  {(tenantUsersQ.data ?? []).map(u => (
                    <option key={u.user_id} value={u.user_id}>{u.display_name ?? u.email}</option>
                  ))}
                </select>
                
                <CreatePostingCalendarDialog 
                  selectedCaseIds={selectedCaseIds} 
                  cases={filteredRows} 
                  onSuccess={clearSelection}
                  tenantId={activeTenantId!}
                  journeyId={selectedJourney?.id}
                />
              </div>

              <div className="h-6 w-px bg-slate-700" />
              <button 
                onClick={clearSelection}
                className="text-slate-400 hover:text-white text-xs underline pr-2"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </AppShell>
    </RequireAuth>
  );
}