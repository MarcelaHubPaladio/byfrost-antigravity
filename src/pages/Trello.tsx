import { useMemo, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showError } from "@/utils/toast";
import {
    Clock,
    MapPin,
    RefreshCw,
    Search,
    Sparkles,
    Plus,
    Columns2,
} from "lucide-react";
import { NewTrelloCardDialog } from "@/components/trello/NewTrelloCardDialog";
import { getStateLabel } from "@/lib/journeyLabels";
import { useJourneyTransition } from "@/hooks/useJourneyTransition";
import { StateMachine } from "@/lib/journeys/types"
import { checkTransitionBlocks, TransitionBlockReason } from "@/lib/journeys/validation";
import { TransitionBlockDialog } from "@/components/case/TransitionBlockDialog";

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

type ReadRow = { case_id: string; last_seen_at: string };
type WaMsgLite = { case_id: string | null; occurred_at: string; from_phone: string | null };

function minutesAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    return Math.max(0, Math.round(diff / 60000));
}

export default function Trello() {
    const { activeTenantId, isSuperAdmin } = useTenant();
    const { user } = useSession();
    const nav = useNavigate();
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

    const [assigneeFilterId, setAssigneeFilterId] = useState<string>("all");

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

            // 2. Fetch all profiles in tenant
            const { data: allUsers, error: usersErr } = await supabase
                .from("users_profile")
                .select("user_id, display_name, email")
                .eq("tenant_id", activeTenantId!)
                .is("deleted_at", null)
                .order("display_name", { ascending: true });

            if (usersErr) throw usersErr;
            const list = (allUsers ?? []) as Array<{ user_id: string; display_name: string | null; email: string | null }>;

            if (isAdmin) return list;

            // 3. For non-admins, filter by hierarchy
            const { data: subordinateIds, error: rpcErr } = await supabase
                .rpc("get_subordinates", { p_tenant_id: activeTenantId!, p_user_id: user!.id });

            if (rpcErr) {
                console.warn("[trello] Failed to fetch subordinates", rpcErr);
                return list.filter(u => u.user_id === user!.id);
            }

            const subSet = new Set(subordinateIds as string[]);
            return list.filter(u => u.user_id === user!.id || subSet.has(u.user_id));
        },
    });

    const trelloJourneyQ = useQuery({
        queryKey: ["tenant_journey_trello", activeTenantId],
        enabled: Boolean(activeTenantId),
        staleTime: 60_000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tenant_journeys")
                .select("journey_id, journeys!inner(id,key,name,is_crm,default_state_machine_json)")
                .eq("tenant_id", activeTenantId!)
                .eq("enabled", true)
                .eq("journeys.key", "trello")
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            if (!data) return null;

            const j = (data as any).journeys;
            return {
                id: j.id,
                key: j.key,
                name: j.name,
                is_crm: false,
                default_state_machine_json: j.default_state_machine_json ?? {},
            } as JourneyOpt;
        },
    });

    const selectedJourney = trelloJourneyQ.data;

    const states = useMemo(() => {
        const st = (selectedJourney?.default_state_machine_json?.states ?? []) as string[];
        const normalized = (st ?? []).map((s) => String(s)).filter(Boolean);
        return Array.from(new Set(normalized));
    }, [selectedJourney]);

    const casesQ = useQuery({
        queryKey: ["cases_by_tenant_trello", activeTenantId, selectedJourney?.id],
        enabled: Boolean(activeTenantId && selectedJourney?.id),
        refetchInterval: 20_000,
        refetchOnWindowFocus: true,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("cases")
                .select(
                    "id,journey_id,customer_id,title,status,state,created_at,updated_at,assigned_user_id,is_chat,users_profile:users_profile!fk_cases_users_profile(display_name,email),journeys:journeys!cases_journey_id_fkey(key,name,is_crm),meta_json"
                )
                .eq("tenant_id", activeTenantId!)
                .eq("journey_id", selectedJourney!.id)
                .is("deleted_at", null)
                .or("is_chat.eq.false,is_chat.is.null")
                .order("updated_at", { ascending: false })
                .limit(300);

            if (error) throw error;
            return (data ?? []) as any as CaseRow[];
        },
    });

    const filteredRows = useMemo(() => {
        const rows = casesQ.data ?? [];
        if (!selectedJourney) return [] as CaseRow[];

        let base = rows.filter((r) => {
            const keyFromJoin = r.journeys?.key ?? null;
            const keyFromMeta = (r.meta_json as any)?.journey_key ?? null;

            if (keyFromJoin === "trello") return true;
            if (keyFromMeta === "trello") return true;
            if (r.journey_id === selectedJourney.id) return true;

            return false;
        });

        // Filtro de Responsável
        if (assigneeFilterId !== "all") {
            base = base.filter((r) => r.assigned_user_id === assigneeFilterId);
        }

        const qq = q.trim().toLowerCase();
        if (!qq) return base;

        return base.filter((r) => {
            const t = `${r.title ?? ""} ${(r.users_profile?.display_name ?? "")} ${(r.users_profile?.email ?? "")}`.toLowerCase();
            return t.includes(qq);
        });
    }, [casesQ.data, q, assigneeFilterId, selectedJourney]);

    const visibleCaseIds = useMemo(() => filteredRows.map((r) => r.id), [filteredRows]);

    const readsQ = useQuery({
        queryKey: ["case_message_reads_trello", activeTenantId, user?.id],
        enabled: Boolean(activeTenantId && user?.id),
        staleTime: 10_000,
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
        queryKey: ["case_last_inbound_trello", activeTenantId, visibleCaseIds.join(",")],
        enabled: Boolean(activeTenantId && visibleCaseIds.length),
        refetchInterval: 20_000,
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
        for (const row of lastInboundQ.data ?? []) {
            const cid = String((row as any).case_id ?? "");
            if (!cid) continue;
            if (!m.has(cid)) m.set(cid, row.occurred_at);
        }
        return m;
    }, [lastInboundQ.data]);

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

    const pendQ = useQuery({
        queryKey: ["pendencies_open_trello", activeTenantId, visibleCaseIds.join(",")],
        enabled: Boolean(activeTenantId && visibleCaseIds.length),
        refetchInterval: 25_000,
        refetchOnWindowFocus: true,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("pendencies")
                .select("case_id,type,status")
                .in("case_id", visibleCaseIds)
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
        const all = [...baseStates];

        const sortCases = (a: CaseRow, b: CaseRow) => {
            const au = unreadByCase.has(a.id);
            const bu = unreadByCase.has(b.id);
            if (au !== bu) return au ? -1 : 1;

            const at = lastInboundAtByCase.get(a.id) ?? a.updated_at;
            const bt = lastInboundAtByCase.get(b.id) ?? b.updated_at;
            return new Date(bt).getTime() - new Date(at).getTime();
        };

        return all.map((st) => {
            const itemsRaw = filteredRows.filter((r) => r.state === st);
            const items = [...itemsRaw].sort(sortCases);

            return {
                key: st,
                label: getStateLabel(selectedJourney as any, st),
                items,
            };
        });
    }, [filteredRows, states, unreadByCase, lastInboundAtByCase, selectedJourney]);

    const { transitionState, updating: updatingCaseState } = useJourneyTransition();

    const updateCaseState = async (caseId: string, nextState: string) => {
        if (!activeTenantId) return;
        if (movingCaseId) return;
        if (updatingCaseState) return;

        const currentCase = filteredRows.find(c => c.id === caseId);
        if (!currentCase) return;
        const oldState = currentCase.state;
        if (oldState === nextState) return;

        setMovingCaseId(caseId);

        try {
            const journeyConfig = selectedJourney?.default_state_machine_json as unknown as StateMachine;
            const blocksReasons = await checkTransitionBlocks(supabase, activeTenantId, caseId, oldState, nextState, journeyConfig);

            if (blocksReasons.length > 0) {
                setTransitionBlock({ open: true, nextStateName: nextState, reasons: blocksReasons });
                return;
            }

            await transitionState(caseId, oldState, nextState, journeyConfig);
        } catch (e: any) {
        } finally {
            setMovingCaseId(null);
        }
    };

    return (
        <RequireAuth>
            <AppShell>
                <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Tarefas (Trello)</h2>
                            <p className="mt-1 text-sm text-slate-600">
                                Organize suas tarefas de forma visual em quadros.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="hidden items-center gap-2 md:flex">
                                <div className="rounded-2xl bg-[hsl(var(--byfrost-accent)/0.10)] px-3 py-2 text-xs font-medium text-[hsl(var(--byfrost-accent))]">
                                    <Sparkles className="mr-1 inline h-4 w-4" /> explicabilidade ativa
                                </div>
                            </div>

                            {activeTenantId && selectedJourney?.id ? (
                                <NewTrelloCardDialog tenantId={activeTenantId} journeyId={selectedJourney.id} />
                            ) : null}

                            <Button
                                variant="secondary"
                                className="h-10 rounded-2xl"
                                onClick={() => {
                                    casesQ.refetch();
                                    trelloJourneyQ.refetch();
                                    tenantUsersQ.refetch();
                                    lastInboundQ.refetch();
                                    readsQ.refetch();
                                    pendQ.refetch();
                                }}
                            >
                                <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
                            </Button>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="relative flex-1">
                            <div className="mb-1 text-[11px] font-semibold text-slate-700">Busca rápida</div>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Título, responsável…"
                                    className="h-11 rounded-2xl pl-10"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                            <div className="text-[11px] font-semibold text-slate-700">Responsável</div>
                            <select
                                value={assigneeFilterId}
                                onChange={(e) => setAssigneeFilterId(e.target.value)}
                                className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                            >
                                <option value="all">Todos os responsáveis</option>
                                {(tenantUsersQ.data ?? []).map((u) => (
                                    <option key={u.user_id} value={u.user_id}>
                                        {u.display_name || u.email || u.user_id.slice(0, 8)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="hidden rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-600 shadow-sm md:block">
                            Arraste para mudar de etapa.
                        </div>
                    </div>

                    <div className="mt-4 overflow-x-auto pb-1">
                        <div className="flex min-w-[980px] gap-4">
                            {columns.map((col) => (
                                <div
                                    key={col.key}
                                    className="w-[320px] flex-shrink-0"
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                    }}
                                    onDrop={(e) => {
                                        const cid = e.dataTransfer.getData("text/caseId");
                                        if (!cid) return;
                                        if (movingCaseId) return;
                                        updateCaseState(cid, col.key);
                                    }}
                                >
                                    <div className="flex items-center justify-between px-1">
                                        <div className="text-sm font-semibold text-slate-800">{col.label}</div>
                                        <div className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                            {col.items.length}
                                        </div>
                                    </div>

                                    <div
                                        className={cn(
                                            "mt-2 space-y-3 rounded-[24px] p-2",
                                            "bg-slate-50/60 border border-dashed border-slate-200"
                                        )}
                                    >
                                        {col.items.map((c) => {
                                            const pend = pendQ.data?.get(c.id);
                                            const age = minutesAgo(c.updated_at);
                                            const isMoving = movingCaseId === c.id;
                                            const unread = unreadByCase.has(c.id);
                                            const titlePrimary = c.title ?? "Tarefa";

                                            return (
                                                <Link
                                                    key={c.id}
                                                    to={`/app/trello/${c.id}`}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.setData("text/caseId", c.id);
                                                        e.dataTransfer.effectAllowed = "move";
                                                    }}
                                                    className={cn(
                                                        "block rounded-[22px] border bg-white p-4 shadow-sm transition hover:shadow-md",
                                                        unread ? "border-rose-200 hover:border-rose-300" : "border-slate-200 hover:border-slate-300",
                                                        "cursor-grab active:cursor-grabbing",
                                                        isMoving ? "opacity-60" : ""
                                                    )}
                                                    title="Arraste para mudar de etapa"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="truncate text-sm font-semibold text-slate-900">{titlePrimary}</div>
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
                                                            ) : (
                                                                <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                                                                    ok
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-600">
                                                        <div className="flex items-center gap-1">
                                                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                                                            {age} min
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
                                                Solte um card aqui para mover.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {casesQ.isError && (
                        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                            Erro ao carregar tarefas: {(casesQ.error as any)?.message ?? ""}
                        </div>
                    )}

                    {!selectedJourney && !trelloJourneyQ.isLoading && (
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                            A jornada "Trello" não está habilitada para o seu tenant.
                        </div>
                    )}

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
