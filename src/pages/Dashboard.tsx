import { useMemo, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showError, showSuccess } from "@/utils/toast";
import { Clock, MapPin, RefreshCw, Search, Sparkles, ShieldAlert } from "lucide-react";

type CaseRow = {
  id: string;
  journey_id: string | null;
  title: string | null;
  status: string;
  state: string;
  created_at: string;
  updated_at: string;
  assigned_vendor_id: string | null;
  vendors?: { display_name: string | null; phone_e164: string | null } | null;
  // Nem sempre existe FK/relacionamento exposto; então mantemos também meta_json.
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

function minutesAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(diff / 60000));
}

function titleizeState(s: string) {
  return (s ?? "")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function Dashboard() {
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const { journeyKey } = useParams<{ journeyKey?: string }>();
  const qc = useQueryClient();

  const [refreshingToken, setRefreshingToken] = useState(false);
  const [q, setQ] = useState("");
  const [movingCaseId, setMovingCaseId] = useState<string | null>(null);

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

      const opts: JourneyOpt[] = (data ?? [])
        .map((r: any) => r.journeys)
        .filter(Boolean)
        .map((j: any) => ({
          id: j.id,
          key: j.key,
          name: j.name,
          is_crm: j.is_crm ?? false,
          default_state_machine_json: j.default_state_machine_json ?? {},
        }));

      opts.sort((a, b) => a.name.localeCompare(b.name));
      return opts;
    },
  });

  const selectedKey = journeyKey ?? "";

  const selectedJourney = useMemo(() => {
    if (!selectedKey) return null;
    return (journeyQ.data ?? []).find((j) => j.key === selectedKey) ?? null;
  }, [journeyQ.data, selectedKey]);

  const isCrm = Boolean(selectedJourney?.is_crm);

  const pickFirstJourney = () => {
    const first = journeyQ.data?.[0];
    if (!first?.key) return;
    nav(`/app/j/${encodeURIComponent(first.key)}`, { replace: true });
  };

  useEffect(() => {
    if (!activeTenantId) return;
    if (!journeyQ.data?.length) return;

    // 1) Se veio um ?journey antigo (uuid), tenta mapear para key
    if (!journeyKey && legacyJourneyId) {
      const match = (journeyQ.data ?? []).find((j) => j.id === legacyJourneyId);
      if (match?.key) {
        nav(`/app/j/${encodeURIComponent(match.key)}`, { replace: true });
        return;
      }
    }

    // 2) Se não tem journeyKey na rota, manda para a primeira
    if (!journeyKey) {
      pickFirstJourney();
      return;
    }

    // 3) Se a key não existe mais (ex: após reset), volta para a primeira
    if (journeyKey && !selectedJourney) {
      pickFirstJourney();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId, journeyQ.data, journeyKey, legacyJourneyId]);

  const states = useMemo(() => {
    const st = (selectedJourney?.default_state_machine_json?.states ?? []) as string[];
    const normalized = (st ?? []).map((s) => String(s)).filter(Boolean);
    return Array.from(new Set(normalized));
  }, [selectedJourney]);

  // Para debug e confiabilidade pós-reset:
  // - buscamos os casos do tenant (respeita RLS)
  // - filtramos por key (preferência: journeys.key; fallback: meta_json.journey_key)
  const casesQ = useQuery({
    queryKey: ["cases_by_tenant", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // NOTE: "cases" possui mais de uma FK para "vendors"; precisamos desambiguar o embed.
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,journey_id,title,status,state,created_at,updated_at,assigned_vendor_id,vendors:vendors!cases_assigned_vendor_id_fkey(display_name,phone_e164),journeys:journeys!cases_journey_id_fkey(key,name,is_crm),meta_json"
        )
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(300);

      if (error) throw error;
      return (data ?? []) as any as CaseRow[];
    },
  });

  const filteredRows = useMemo(() => {
    const rows = casesQ.data ?? [];
    if (!selectedKey) return [];

    const base = rows.filter((r) => {
      const keyFromJoin = r.journeys?.key ?? null;
      const keyFromMeta = (r.meta_json as any)?.journey_key ?? null;

      if (keyFromJoin && keyFromJoin === selectedKey) return true;
      if (keyFromMeta && keyFromMeta === selectedKey) return true;

      // fallback adicional por journey_id quando a jornada selecionada foi encontrada
      if (selectedJourney?.id && r.journey_id && r.journey_id === selectedJourney.id) return true;

      return false;
    });

    const qq = q.trim().toLowerCase();
    if (!qq) return base;

    return base.filter((r) => {
      const t = `${r.title ?? ""} ${(r.vendors?.display_name ?? "")} ${(r.vendors?.phone_e164 ?? "")}`.toLowerCase();
      return t.includes(qq);
    });
  }, [casesQ.data, selectedKey, selectedJourney?.id, q]);

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
    refetchInterval: 7000,
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
    refetchInterval: 7000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const ids = filteredRows.map((c) => c.id);
      const { data, error } = await supabase
        .from("pendencies")
        .select("case_id,type,status")
        .eq("tenant_id", activeTenantId!)
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

    return all.map((st) => {
      const items =
        st === "__other__"
          ? filteredRows.filter((r) => !known.has(r.state))
          : filteredRows.filter((r) => r.state === st);
      return {
        key: st,
        label: st === "__other__" ? "Outros" : titleizeState(st),
        items,
      };
    });
  }, [filteredRows, states]);

  const shouldShowInvalidJourneyBanner =
    Boolean(journeyKey) && Boolean(journeyQ.data?.length) && !selectedJourney;

  const tokenLooksSuperAdminUi = Boolean(
    (user as any)?.app_metadata?.byfrost_super_admin || (user as any)?.app_metadata?.super_admin
  );

  const mismatch =
    selectedKey && debugRpcQ.data && debugRpcQ.data.cases_total > 0 && filteredRows.length === 0;

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

  const updateCaseState = async (caseId: string, nextState: string) => {
    if (!activeTenantId) return;
    if (movingCaseId) return;
    setMovingCaseId(caseId);

    try {
      const { error } = await supabase
        .from("cases")
        .update({ state: nextState })
        .eq("tenant_id", activeTenantId)
        .eq("id", caseId);
      if (error) throw error;

      showSuccess(`Movido para ${titleizeState(nextState)}.`);
      await qc.invalidateQueries({ queryKey: ["cases_by_tenant", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao mover: ${e?.message ?? "erro"}`);
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
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Casos</h2>
              <p className="mt-1 text-sm text-slate-600">
                Agora a jornada faz parte da rota: <span className="font-medium">/app/j/&lt;slug&gt;</span>.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="hidden items-center gap-2 md:flex">
                <div className="rounded-2xl bg-[hsl(var(--byfrost-accent)/0.10)] px-3 py-2 text-xs font-medium text-[hsl(var(--byfrost-accent))]">
                  <Sparkles className="mr-1 inline h-4 w-4" /> explicabilidade ativa
                </div>
              </div>

              <Button
                variant="secondary"
                className="h-10 rounded-2xl"
                onClick={() => {
                  journeyQ.refetch();
                  casesQ.refetch();
                  pendQ.refetch();
                  debugRpcQ.refetch();
                  rlsDiagQ.refetch();
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
              </Button>

              <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 shadow-sm">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-700">Jornada</div>
                    <select
                      value={selectedKey}
                      onChange={(e) => {
                        const nextKey = e.target.value;
                        if (!nextKey) return;
                        nav(`/app/j/${encodeURIComponent(nextKey)}`);
                      }}
                      className="mt-1 h-9 w-full min-w-[260px] rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                    >
                      {(journeyQ.data ?? []).length === 0 ? (
                        <option value="">(nenhuma jornada habilitada)</option>
                      ) : (
                        (journeyQ.data ?? []).map((j) => (
                          <option key={j.key} value={j.key}>
                            {j.name}{j.is_crm ? " • CRM" : ""}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <Button
                    variant="secondary"
                    className="h-9 rounded-2xl"
                    onClick={pickFirstJourney}
                    disabled={!journeyQ.data?.length}
                    title="Voltar para o fluxo principal"
                  >
                    Principal
                  </Button>
                </div>

                {selectedKey && (
                  <div className="mt-2 text-[11px] text-slate-500">
                    {selectedKey}
                    {selectedJourney?.id ? ` • ${selectedJourney.id.slice(0, 8)}…` : ""}
                    {selectedJourney?.is_crm ? (
                      <span className="ml-2 rounded-full bg-[hsl(var(--byfrost-accent)/0.12)] px-2 py-0.5 font-semibold text-[hsl(var(--byfrost-accent))]">
                        CRM
                      </span>
                    ) : null}
                    {typeof debugRpcQ.data?.cases_total === "number" ? (
                      <span className="text-slate-400">
                        {" "}• banco: {debugRpcQ.data.cases_total}
                        {debugRpcQ.data.by_status?.length
                          ? ` • ${debugRpcQ.data.by_status
                              .map((s) => `${s.status}(${s.qty})`)
                              .join(", ")}`
                          : ""}
                      </span>
                    ) : null}
                    {(casesQ.data?.length ?? 0) ? ` • UI(tenant): ${casesQ.data?.length ?? 0}` : ""}
                    {` • UI(filtro): ${filteredRows.length}`}
                    {statusCounts.length ? (
                      <span className="text-slate-400">
                        {" "}• UI status: {statusCounts.map(([s, n]) => `${s}(${n})`).join(", ")}
                      </span>
                    ) : null}
                  </div>
                )}

                {debugRpcQ.isError && (
                  <div className="mt-2 text-[11px] text-rose-700">
                    Debug banco falhou: {(debugRpcQ.error as any)?.message ?? ""}
                  </div>
                )}
              </div>
            </div>
          </div>

          {isCrm && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por título, vendedor ou telefone…"
                  className="h-11 rounded-2xl pl-10"
                />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-600 shadow-sm">
                Arraste um card para mudar de status.
              </div>
            </div>
          )}

          {shouldShowInvalidJourneyBanner && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              O slug <span className="font-semibold">{journeyKey}</span> não existe (ou foi resetado). Vou te levar
              para o fluxo principal.
            </div>
          )}

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
              <div className="flex min-w-[980px] gap-4">
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className={cn(
                      "w-[320px] flex-shrink-0",
                      isCrm && col.key !== "__other__" ? "" : ""
                    )}
                    onDragOver={(e) => {
                      if (!isCrm) return;
                      if (col.key === "__other__") return;
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (!isCrm) return;
                      if (col.key === "__other__") return;
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
                        isCrm && col.key !== "__other__"
                          ? "bg-slate-50/60 border border-dashed border-slate-200"
                          : ""
                      )}
                    >
                      {col.items.map((c) => {
                        const pend = pendQ.data?.get(c.id);
                        const age = minutesAgo(c.updated_at);
                        const isMoving = movingCaseId === c.id;

                        return (
                          <Link
                            key={c.id}
                            to={`/app/cases/${c.id}`}
                            draggable={isCrm}
                            onDragStart={(e) => {
                              if (!isCrm) return;
                              e.dataTransfer.setData("text/caseId", c.id);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            className={cn(
                              "block rounded-[22px] border bg-white p-4 shadow-sm transition hover:shadow-md",
                              "border-slate-200 hover:border-slate-300",
                              isCrm ? "cursor-grab active:cursor-grabbing" : "",
                              isMoving ? "opacity-60" : ""
                            )}
                            title={isCrm ? "Arraste para mudar de estado" : undefined}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-900">
                                  {c.title ?? "Caso"}
                                </div>
                                <div className="mt-1 truncate text-xs text-slate-500">
                                  {(c.vendors?.display_name ?? "Vendedor") +
                                    (c.vendors?.phone_e164 ? ` • ${c.vendors.phone_e164}` : "")}
                                </div>
                              </div>
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
                          {isCrm && col.key !== "__other__"
                            ? "Solte um card aqui para mover."
                            : "Sem cards aqui."}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {casesQ.isError && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              Erro ao carregar casos: {(casesQ.error as any)?.message ?? ""}
            </div>
          )}
        </div>
      </AppShell>
    </RequireAuth>
  );
}