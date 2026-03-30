import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
import { showError } from "@/utils/toast";
import {
  Clock,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Target,
  Settings,
  Layers,
  ArrowRightCircle,
  Instagram,
  Youtube,
  Smartphone,
  Video
} from "lucide-react";
import { getStateLabel } from "@/lib/journeyLabels";
import { useJourneyTransition } from "@/hooks/useJourneyTransition";
import { StateMachine } from "@/lib/journeys/types"
import { checkTransitionBlocks, TransitionBlockReason } from "@/lib/journeys/validation";
import { TransitionBlockDialog } from "@/components/case/TransitionBlockDialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { NewMktTechaCardDialog } from "@/components/mkt_techa/NewMktTechaCardDialog";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday, addMonths, subMonths, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

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

type ReadRow = { case_id: string; last_seen_at: string };
type WaMsgLite = { case_id: string | null; occurred_at: string; from_phone: string | null };
type WaInstanceRow = { id: string; phone_number: string | null };

const STAGE_INSTRUCTIONS: Record<string, {
  what_is: string;
  objective: string;
  what_needs_to_happen: string[];
  subtasks: string[];
  output: string;
  extra?: string;
}> = {
  ideias: {
    what_is: "Registro inicial de uma oportunidade de campanha.",
    objective: "Garantir que toda campanha nasça com contexto e rastreabilidade.",
    what_needs_to_happen: ["criar campanha", "definir origem", "definir prioridade", "nomear campanha"],
    subtasks: ["responsável", "prazo", "status", "observação"],
    output: "Campanha criada"
  },
  planejamento: {
    what_is: "Estruturação estratégica da campanha.",
    objective: "Definir a campanha central que guiará todos os canais.",
    what_needs_to_happen: ["definir objetivo", "definir mensagem central", "definir mecânica", "definir duração", "definir canais"],
    subtasks: ["objetivo", "mensagem central", "mecânica", "canais", "aprovação"],
    output: "Campanha estruturada",
    extra: "Toda campanha deve ter uma mensagem central única e uma visão multi-canal desde o início."
  },
  ofertas_definidas: {
    what_is: "Definição comercial da campanha.",
    objective: "Garantir viabilidade e clareza do que será vendido.",
    what_needs_to_happen: ["selecionar produtos", "definir preços", "validar estoque"],
    subtasks: ["produtos", "preços", "estoque", "aprovação"],
    output: "Ofertas definidas"
  },
  cadastro_big2be: {
    what_is: "Registro das ofertas no sistema.",
    objective: "Garantir execução operacional correta.",
    what_needs_to_happen: ["cadastrar ofertas", "validar dados", "definir vigência"],
    subtasks: ["cadastro", "conferência", "validação"],
    output: "Ofertas ativas"
  },
  criativos: {
    what_is: "Produção dos criativos da campanha.",
    objective: "Transformar a campanha central em peças multi-canais.",
    what_needs_to_happen: ["criar criativos por canal", "vincular à campanha", "classificar por tipo e formato", "permitir tarefas flexíveis", "anexar arquivos"],
    subtasks: ["briefing", "produção", "revisão", "envio para aprovação", "ajustes", "aprovação final"],
    output: "Kit multi-canal criado e aprovado",
    extra: "Apenas criativos aprovados podem ser distribuídos. Todos são aprovados em um link único."
  },
  distribuio: {
    what_is: "Ativação dos criativos nos canais.",
    objective: "Garantir execução coordenada da campanha.",
    what_needs_to_happen: ["selecionar criativos aprovados", "vincular aos canais", "definir datas", "executar publicação"],
    subtasks: ["agendamento", "publicação", "envio", "ativação mídia"],
    output: "Campanha ativa nos canais",
    extra: "Todo criativo distribuído precisa estar aprovado."
  },
  analise: {
    what_is: "Leitura de desempenho da campanha.",
    objective: "Entender o que funcionou e o que não funcionou.",
    what_needs_to_happen: ["coletar dados de vendas", "coletar dados de mídia", "analisar por canal", "analisar por criativo"],
    subtasks: ["vendas", "métricas", "produtos destaque", "canais destaque"],
    output: "Insights da campanha"
  },
  relatrio: {
    what_is: "Consolidação final da campanha.",
    objective: "Transformar execução em inteligência.",
    what_needs_to_happen: ["consolidar dados", "registrar aprendizados", "comparar histórico", "gerar resumo"],
    subtasks: ["consolidar dados", "escrever insights", "comparar campanhas", "validar relatório"],
    output: "Relatório estruturado + resumo compartilhável",
    extra: "O link de resumo é ideal para compartilhar com sócios ou clientes."
  },
  concluido: {
    what_is: "Encerramento da campanha.",
    objective: "Transformar a campanha em ativo reutilizável.",
    what_needs_to_happen: ["finalizar campanha", "arquivar dados", "manter histórico", "alimentar biblioteca"],
    subtasks: ["finalizar", "arquivar", "manter histórico"],
    output: "Campanha concluída e reutilizável"
  }
};

function minutesAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(diff / 60000));
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

function TechaCalendarView({ cases, date, onChangeDate }: { cases: CaseRow[], date: Date, onChangeDate: (d: Date) => void }) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(monthStart);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const blanks = Array.from({ length: startDayOfWeek }).map((_, i) => <div key={`blank-${i}`} className="bg-slate-50/50 rounded-[24px] border border-transparent min-h-[140px]" />);

  const nextMonth = () => onChangeDate(addMonths(date, 1));
  const prevMonth = () => onChangeDate(subMonths(date, 1));

  // Build map of day -> { cases: CaseRow[], creatives: { caseTitle: string, creative: any, caseId: string }[] }
  const calendarData = new Map<string, { cases: CaseRow[], creatives: any[] }>();

  for (const c of cases) {
    const meta = c.meta_json || {};
    
    // 1. Main case due_at
    if (meta.due_at) {
      const d = parseISO(meta.due_at);
      if (!isNaN(d.getTime())) {
        const dayKey = format(d, 'yyyy-MM-dd');
        const entry = calendarData.get(dayKey) ?? { cases: [], creatives: [] };
        entry.cases.push(c);
        calendarData.set(dayKey, entry);
      }
    }

    // 2. Active creatives intervals
    const creativesList = (meta.creatives || []) as any[];
    for (const cr of creativesList) {
      if (cr.publish_start_date && cr.publish_end_date) {
        const start = startOfDay(parseISO(cr.publish_start_date));
        const end = endOfDay(parseISO(cr.publish_end_date));
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          // Iterate days in interval overlap with current month to avoid massive loops
          // But actually let's just use eachDayOfInterval if it's reasonable
          try {
            const crDays = eachDayOfInterval({ start, end });
            for (const crDay of crDays) {
              const dayKey = format(crDay, 'yyyy-MM-dd');
              const entry = calendarData.get(dayKey) ?? { cases: [], creatives: [] };
              entry.creatives.push({ caseTitle: c.title, creative: cr, caseId: c.id });
              calendarData.set(dayKey, entry);
            }
          } catch (e) {}
        }
      }
    }
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
          const data = calendarData.get(dayKey) || { cases: [], creatives: [] };
          const isTodayDate = isToday(day);

          return (
            <div key={dayKey} className={cn(
              "bg-white/80 rounded-[24px] border p-2 min-h-[160px] shadow-sm transition-all flex flex-col group/day",
              isTodayDate ? "border-[hsl(var(--byfrost-accent)/0.4)] bg-[hsl(var(--byfrost-accent)/0.02)] ring-1 ring-[hsl(var(--byfrost-accent)/0.2)]" : "border-slate-200 hover:border-slate-300"
            )}>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className={cn(
                  "text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-lg tracking-tighter",
                  isTodayDate ? "bg-[hsl(var(--byfrost-accent))] text-white" : "text-slate-400"
                )}>{format(day, 'd')}</span>
                {(data.cases.length > 0 || data.creatives.length > 0) && (
                  <div className="flex -space-x-1">
                    {data.cases.length > 0 && <div className="w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-white" />}
                    {data.creatives.length > 0 && <div className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5 overflow-y-auto no-scrollbar flex-1 max-h-[180px]">
                {/* Main Cases */}
                {data.cases.map(c => (
                  <Link
                    key={c.id}
                    to={`/app/mkt-techa/${c.id}`}
                    className="block p-1.5 rounded-xl border border-indigo-100 bg-indigo-50/50 hover:bg-indigo-100 transition-colors shadow-sm"
                  >
                    <div className="text-[10px] font-black text-indigo-700 truncate tracking-tight">{c.title || "Untitled"}</div>
                  </Link>
                ))}

                {/* Creatives (Sub-events) */}
                {data.creatives.map((item, idx) => (
                  <Link
                    key={`${item.caseId}-${idx}`}
                    to={`/app/mkt-techa/${item.caseId}`}
                    className="block p-1.5 rounded-xl border border-slate-100 bg-white hover:border-emerald-200 transition-all shadow-sm group/item"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                       {item.creative.channel === 'Instagram' && <Instagram className="h-2.5 w-2.5 text-pink-500" />}
                       {item.creative.channel === 'TikTok' && <Smartphone className="h-2.5 w-2.5 text-slate-400" />}
                       {item.creative.channel === 'YouTube' && <Youtube className="h-2.5 w-2.5 text-red-500" />}
                       <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate">{item.creative.channel}</span>
                    </div>
                    <div className="text-[9px] font-bold text-slate-600 truncate leading-none">
                      {item.creative.type.toUpperCase()}: {item.caseTitle}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MktTecha() {
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const loc = useLocation();
  const { prefs } = useTheme();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [movingCaseId, setMovingCaseId] = useState<string | null>(null);
  const [transitionBlock, setTransitionBlock] = useState<{
    open: boolean;
    nextStateName: string;
    reasons: TransitionBlockReason[];
  }>({ open: false, nextStateName: "", reasons: [] });
  const [tab, setTab] = useState<"kanban" | "calendar">("kanban");
  const [calendarDate, setCalendarDate] = useState(new Date());

  const [assigneeFilterId, setAssigneeFilterId] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const tenantUsersQ = useQuery({
    queryKey: ["tenant_users_hierarchy_techa", activeTenantId, user?.id],
    enabled: Boolean(activeTenantId && user?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const { data: meProfile } = await supabase
        .from("users_profile")
        .select("role")
        .eq("tenant_id", activeTenantId!)
        .eq("user_id", user!.id)
        .maybeSingle();

      const isAdmin = meProfile?.role === "admin";

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
    queryKey: ["wa_instances_all_techa", activeTenantId],
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
    queryKey: ["wa_instance_active_first_techa", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const data = allInstancesQ.data?.[0] ?? null;
      return data as WaInstanceRow | null;
    },
  });

  const journeyQ = useQuery({
    queryKey: ["tenant_journeys_techa", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("journey_id, journeys(id,key,name,is_crm,default_state_machine_json)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true);
      if (error) throw error;

      return (data ?? [])
        .map((r: any) => r.journeys)
        .filter(Boolean)
        .map((j: any) => ({
          id: j.id,
          key: j.key,
          name: j.name,
          is_crm: j.is_crm,
          default_state_machine_json: j.default_state_machine_json ?? {},
        }));
    },
  });

  const selectedKey = "mkt-super-techa";

  const selectedJourney = useMemo(() => {
    return (journeyQ.data ?? []).find((j) => j.key === selectedKey) ?? null;
  }, [journeyQ.data, selectedKey]);

  const states = useMemo(() => {
    const st = (selectedJourney?.default_state_machine_json?.states ?? []) as string[];
    return Array.from(new Set(st.filter(Boolean)));
  }, [selectedJourney]);

  const casesQ = useQuery({
    queryKey: ["cases_by_tenant_techa", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,journey_id,customer_id,customer_entity_id,title,status,state,created_at,updated_at,assigned_user_id,is_chat,users_profile:users_profile(display_name,email),meta_json"
        )
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .eq("is_chat", false)
        .order("updated_at", { ascending: false })
        .limit(300);

      if (error) throw error;
      return (data ?? []) as any as CaseRow[];
    },
  });

  const journeyRows = useMemo(() => {
    const rows = casesQ.data ?? [];
    return rows.filter((r) => {
      const keyFromMeta = (r.meta_json as any)?.journey_key ?? null;
      if (keyFromMeta && keyFromMeta === selectedKey) return true;
      if (selectedJourney?.id && r.journey_id === selectedJourney.id) return true;
      return false;
    });
  }, [casesQ.data, selectedKey, selectedJourney?.id]);

  const filteredRows = useMemo(() => {
    let base = journeyRows;

    if (startDate) {
      const start = new Date(startDate).getTime();
      base = base.filter((r) => new Date(r.created_at).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      base = base.filter((r) => new Date(r.created_at).getTime() <= end.getTime());
    }

    if (assigneeFilterId !== "all") {
      base = base.filter((r) => {
        if (assigneeFilterId === "__unassigned__") return !r.assigned_user_id;
        return r.assigned_user_id === assigneeFilterId;
      });
    }

    const qq = q.trim().toLowerCase();
    if (!qq) return base;

    return base.filter((r) => {
      const t = `${r.title ?? ""} ${(r.users_profile?.display_name ?? "")}`.toLowerCase();
      return t.includes(qq);
    });
  }, [journeyRows, q, assigneeFilterId, startDate, endDate]);

  const visibleCaseIds = useMemo(() => filteredRows.map((r) => r.id), [filteredRows]);

  const readsQ = useQuery({
    queryKey: ["case_message_reads_techa", activeTenantId, user?.id],
    enabled: Boolean(activeTenantId && user?.id),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_message_reads")
        .select("case_id,last_seen_at")
        .eq("tenant_id", activeTenantId!)
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as any as ReadRow[];
    },
  });

  const lastInboundQ = useQuery({
    queryKey: ["case_last_inbound_techa", activeTenantId, visibleCaseIds.join(",")],
    enabled: Boolean(activeTenantId && visibleCaseIds.length),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_messages")
        .select("case_id,occurred_at,from_phone")
        .eq("tenant_id", activeTenantId!)
        .eq("direction", "inbound")
        .in("case_id", visibleCaseIds)
        .order("occurred_at", { ascending: false });
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
      if (!seenAt || new Date(lastInboundAt).getTime() > new Date(seenAt).getTime()) s.add(cid);
    }
    return s;
  }, [lastInboundAtByCase, readByCase]);

  const columns = useMemo(() => {
    const baseStates = states.length ? states : Array.from(new Set(filteredRows.map((r) => r.state)));
    const known = new Set(baseStates);
    const extras = Array.from(new Set(filteredRows.map((r) => r.state))).filter((s) => !known.has(s));
    const all = [...baseStates, ...(extras.length ? ["__other__"] : [])];

    const sortCases = (a: CaseRow, b: CaseRow) => {
      const au = unreadByCase.has(a.id);
      const bu = unreadByCase.has(b.id);
      if (au !== bu) return au ? -1 : 1;
      const at = lastInboundAtByCase.get(a.id) ?? a.updated_at;
      const bt = lastInboundAtByCase.get(b.id) ?? b.updated_at;
      return new Date(bt).getTime() - new Date(at).getTime();
    };

    return all.map((st) => {
      const items = filteredRows.filter((r) => st === "__other__" ? !known.has(r.state) : r.state === st).sort(sortCases);
      return {
        key: st,
        label: st === "__other__" ? "Outros" : getStateLabel(selectedJourney as any, st),
        items,
      };
    });
  }, [filteredRows, states, unreadByCase, lastInboundAtByCase, selectedJourney]);

  const { transitionState, updating: updatingCaseState } = useJourneyTransition();

  const updateCaseState = async (caseId: string, nextState: string) => {
    if (!activeTenantId || movingCaseId || updatingCaseState) return;
    const currentCase = filteredRows.find(c => c.id === caseId);
    if (!currentCase || currentCase.state === nextState) return;

    setMovingCaseId(caseId);
    try {
      const journeyConfig = selectedJourney?.default_state_machine_json as unknown as StateMachine;
      const blocksReasons = await checkTransitionBlocks(supabase, activeTenantId, caseId, currentCase.state, nextState, journeyConfig);

      if (blocksReasons.length > 0) {
        setTransitionBlock({ open: true, nextStateName: nextState, reasons: blocksReasons });
        return;
      }

      await transitionState(caseId, currentCase.state, nextState, journeyConfig);
      casesQ.refetch();
    } catch (e: any) {
    } finally {
      setMovingCaseId(null);
    }
  };

  if (!journeyQ.isLoading && (journeyQ.data?.length ?? 0) === 0) {
    return (
      <RequireAuth>
        <AppShell>
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 bg-white/40 rounded-[32px] border border-slate-200 backdrop-blur">
            <h2 className="text-xl font-semibold text-slate-800">Nenhuma jornada ativa no painel</h2>
          </div>
        </AppShell>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">MKT Técha</h2>
              <p className="mt-1 text-sm text-slate-600">Gestão operacional da jornada MKT Técha.</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {activeTenantId && selectedJourney?.id && (
                <NewMktTechaCardDialog tenantId={activeTenantId} journeyId={selectedJourney.id} />
              )}
              <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => casesQ.refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <div className="mb-1 text-[11px] font-semibold text-slate-700">Busca rápida</div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título..." className="h-11 rounded-2xl pl-10" />
              </div>
            </div>

            <div className="relative">
              <div className="mb-1 text-[11px] font-semibold text-slate-700">Visualização</div>
              <div className="flex bg-slate-100 p-1 rounded-2xl">
                <button onClick={() => setTab("kanban")} className={cn("px-4 py-1.5 text-xs font-bold rounded-xl transition-all", tab === "kanban" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>Quadro</button>
                <button onClick={() => setTab("calendar")} className={cn("px-4 py-1.5 text-xs font-bold rounded-xl transition-all", tab === "calendar" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>Calendário</button>
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            {tab === "kanban" ? (
              <div className="flex gap-4 min-w-[1000px]">
                {columns.map((col) => {
                  const inst = STAGE_INSTRUCTIONS[col.key];
                  return (
                    <div key={col.key} className="w-[320px] flex-shrink-0" onDragOver={(e) => col.key !== "__other__" && e.preventDefault()} onDrop={(e) => {
                      const cid = e.dataTransfer.getData("text/caseId");
                      if (cid && col.key !== "__other__") updateCaseState(cid, col.key);
                    }}>
                      <div className="flex items-center justify-between px-1 mb-2">
                        <div className="flex items-center gap-1.5">
                          <div className="text-sm font-bold text-slate-800">{col.label}</div>
                          {inst && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full text-slate-400 hover:text-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.1)]">
                                  <HelpCircle className="h-3.5 w-3.5" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[340px] rounded-[24px] border-slate-200 bg-white p-5 shadow-2xl animate-in zoom-in-95 duration-200" align="start">
                                <div className="space-y-4">
                                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                                    <Target className="h-4 w-4 text-[hsl(var(--byfrost-accent))]" />
                                    <h4 className="font-black text-xs uppercase tracking-widest text-slate-800">{col.label}</h4>
                                  </div>
                                  
                                  <div className="space-y-3">
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1">O que é</p>
                                      <p className="text-xs text-slate-600 leading-relaxed font-medium">{inst.what_is}</p>
                                    </div>
                                    
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1">Objetivo</p>
                                      <p className="text-xs text-slate-700 leading-relaxed font-semibold">{inst.objective}</p>
                                    </div>

                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1.5">O que precisa acontecer</p>
                                      <div className="grid grid-cols-1 gap-1.5">
                                        {inst.what_needs_to_happen.map((item, i) => (
                                          <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-2.5 py-1.5 rounded-xl">
                                            <Settings className="h-3 w-3 text-slate-400" />
                                            <span className="text-[11px] text-slate-600 font-bold lowercase">{item}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1.5">Sugestão de Subtarefas</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {inst.subtasks.map((st, i) => (
                                          <Badge key={i} variant="secondary" className="rounded-lg bg-slate-100 border-none text-[10px] font-bold text-slate-500 py-0.5">{st}</Badge>
                                        ))}
                                      </div>
                                    </div>

                                    {inst.extra && (
                                      <div className="bg-[hsl(var(--byfrost-accent)/0.03)] border border-[hsl(var(--byfrost-accent)/0.1)] p-3 rounded-2xl">
                                        <p className="text-[10px] text-[hsl(var(--byfrost-accent))] font-bold leading-relaxed">{inst.extra}</p>
                                      </div>
                                    )}

                                    <div className="flex items-center gap-2 pt-2 text-[11px] font-black italic text-emerald-600 border-t border-slate-100">
                                      <ArrowRightCircle className="h-3.5 w-3.5" />
                                      ENTREGA: {inst.output.toUpperCase()}
                                    </div>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                        <Badge variant="secondary" className="rounded-full">{col.items.length}</Badge>
                      </div>
                      <div className="space-y-3 rounded-[24px] bg-slate-50/50 p-2 border border-slate-100 min-h-[500px]">
                        {col.items.map((c) => (
                          <Link key={c.id} to={`/app/mkt-techa/${c.id}`} draggable onDragStart={(e) => e.dataTransfer.setData("text/caseId", c.id)} className={cn("block rounded-[22px] border bg-white p-4 shadow-sm transition hover:shadow-md cursor-grab active:cursor-grabbing", (c.meta_json as any)?.priority ? "border-rose-500 ring-1 ring-rose-500/20" : "border-slate-200")}>
                            <div className="text-sm font-bold text-slate-900 truncate">{c.title}</div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <TechaCalendarView cases={filteredRows} date={calendarDate} onChangeDate={setCalendarDate} />
            )}
          </div>
        </div>
        <TransitionBlockDialog open={transitionBlock.open} onOpenChange={(v) => setTransitionBlock({ ...transitionBlock, open: v })} nextStateName={transitionBlock.nextStateName} blocks={transitionBlock.reasons} />
      </AppShell>
    </RequireAuth>
  );
}
