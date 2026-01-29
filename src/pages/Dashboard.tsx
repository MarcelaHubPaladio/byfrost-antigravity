import { useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MapPin, RefreshCw, Sparkles } from "lucide-react";

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
  journeys?: { key: string | null; name: string | null } | null;
};

type JourneyOpt = {
  id: string;
  key: string;
  name: string;
  default_state_machine_json?: any;
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
  const [sp, setSp] = useSearchParams();

  const journeyQ = useQuery({
    queryKey: ["tenant_journeys_enabled", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("journey_id, journeys(id,key,name,default_state_machine_json)")
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
          default_state_machine_json: j.default_state_machine_json ?? {},
        }));

      opts.sort((a, b) => a.name.localeCompare(b.name));
      return opts;
    },
  });

  const selectedJourneyId = sp.get("journey") || "";

  const selectedJourneyIsValid = useMemo(() => {
    if (!selectedJourneyId) return false;
    return Boolean((journeyQ.data ?? []).some((j) => j.id === selectedJourneyId));
  }, [journeyQ.data, selectedJourneyId]);

  const pickFirstJourney = () => {
    const first = journeyQ.data?.[0]?.id;
    if (!first) return;
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("journey", first);
        return next;
      },
      { replace: true }
    );
  };

  useEffect(() => {
    if (!activeTenantId) return;
    if (selectedJourneyId && selectedJourneyIsValid) return;
    if (!journeyQ.data?.length) return;
    pickFirstJourney();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId, journeyQ.data, selectedJourneyId, selectedJourneyIsValid]);

  const selectedJourney = useMemo(() => {
    if (!selectedJourneyId) return null;
    return (journeyQ.data ?? []).find((j) => j.id === selectedJourneyId) ?? null;
  }, [journeyQ.data, selectedJourneyId]);

  const states = useMemo(() => {
    const st = (selectedJourney?.default_state_machine_json?.states ?? []) as string[];
    const normalized = (st ?? []).map((s) => String(s)).filter(Boolean);
    return Array.from(new Set(normalized));
  }, [selectedJourney]);

  // IMPORTANTE: após resets, podem existir jornadas duplicadas (mesma key, ids diferentes).
  // Para não "sumir" com casos recém-criados, carregamos os casos do tenant e filtramos no client por:
  // - journey_id (preferencial)
  // - OU journey key (fallback)
  const casesQ = useQuery({
    queryKey: ["cases_by_tenant", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,journey_id,title,status,state,created_at,updated_at,assigned_vendor_id,vendors(display_name,phone_e164),journeys(key,name)"
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
    if (!selectedJourneyId) return [];

    const key = selectedJourney?.key ?? null;

    return rows.filter((r) => {
      if (r.journey_id && r.journey_id === selectedJourneyId) return true;
      if (key && r.journeys?.key && r.journeys.key === key) return true;
      return false;
    });
  }, [casesQ.data, selectedJourneyId, selectedJourney?.key]);

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
        st === "__other__" ? filteredRows.filter((r) => !known.has(r.state)) : filteredRows.filter((r) => r.state === st);
      return {
        key: st,
        label: st === "__other__" ? "Outros" : titleizeState(st),
        items,
      };
    });
  }, [filteredRows, states]);

  const shouldShowInvalidJourneyBanner =
    Boolean(selectedJourneyId) && !selectedJourneyIsValid && Boolean(journeyQ.data?.length);

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Casos</h2>
              <p className="mt-1 text-sm text-slate-600">
                Selecione a jornada para visualizar o board por estados. A IA apenas sugere e pede informações —
                mudanças de status e aprovações são humanas.
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
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
              </Button>

              <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 shadow-sm">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-700">Jornada</div>
                    <select
                      value={selectedJourneyId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setSp((prev) => {
                          const next = new URLSearchParams(prev);
                          if (nextId) next.set("journey", nextId);
                          else next.delete("journey");
                          return next;
                        });
                      }}
                      className="mt-1 h-9 w-full min-w-[260px] rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                    >
                      {(journeyQ.data ?? []).length === 0 ? (
                        <option value="">(nenhuma jornada habilitada)</option>
                      ) : (
                        (journeyQ.data ?? []).map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.name}
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
                    Padrão
                  </Button>
                </div>

                {selectedJourney && (
                  <div className="mt-2 text-[11px] text-slate-500">
                    {selectedJourney.key} • {selectedJourney.id.slice(0, 8)}…
                    {filteredRows.length === 0 && (casesQ.data?.length ?? 0) > 0 ? (
                      <span className="text-slate-400"> • 0 casos nesse filtro</span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>

          {shouldShowInvalidJourneyBanner && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Essa URL está com um <span className="font-semibold">filtro de jornada antigo</span>. Clique em{" "}
              <span className="font-semibold">Padrão</span> (ao lado do seletor) para corrigir.
              <div className="mt-1 text-xs text-amber-900/80">Filtro atual: {selectedJourneyId}</div>
            </div>
          )}

          {!selectedJourneyId && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Habilite ao menos uma jornada no Admin e selecione aqui.
            </div>
          )}

          {selectedJourneyId && (
            <div className="mt-4 overflow-x-auto pb-1">
              <div className="flex min-w-[980px] gap-4">
                {columns.map((col) => (
                  <div key={col.key} className="w-[320px] flex-shrink-0">
                    <div className="flex items-center justify-between px-1">
                      <div className="text-sm font-semibold text-slate-800">{col.label}</div>
                      <div className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {col.items.length}
                      </div>
                    </div>

                    <div className="mt-2 space-y-3">
                      {col.items.map((c) => {
                        const pend = pendQ.data?.get(c.id);
                        const age = minutesAgo(c.updated_at);
                        return (
                          <Link
                            key={c.id}
                            to={`/app/cases/${c.id}`}
                            className={cn(
                              "block rounded-[22px] border bg-white p-4 shadow-sm transition hover:shadow-md",
                              "border-slate-200 hover:border-slate-300"
                            )}
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
                          Sem cards aqui.
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