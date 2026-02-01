import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { CalendarDays, CheckCircle2, Clock, MapPin, ShieldAlert, Workflow } from "lucide-react";

const PRESENCE_CLOSE_URL =
  "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/presence-close-day";

type Gate = {
  journey_id: string;
  enabled: boolean;
};

type PresenceCase = {
  id: string;
  title: string | null;
  state: string;
  status: string;
  case_date: string;
  entity_id: string | null;
  updated_at: string;
};

type PendLite = { case_id: string; type: string; status: string; required: boolean };

type PunchRow = {
  id: string;
  timestamp: string;
  type: string;
  within_radius: boolean;
  distance_from_location: number | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  source: string;
};

type TimelineRow = {
  id: string;
  event_type: string;
  message: string;
  occurred_at: string;
};

type PendRow = {
  id: string;
  type: string;
  question_text: string;
  status: string;
  required: boolean;
  answered_text: string | null;
};

function ymdInSaoPaulo(d = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(d);
}

function titleize(s: string) {
  return (s ?? "")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatShort(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function callEdge(url: string, body: any) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Faça login novamente.");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = json?.error || json?.message || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return json;
}

export default function PresenceManage() {
  const qc = useQueryClient();
  const { activeTenantId, activeTenant } = useTenant();
  const [date, setDate] = useState(() => ymdInSaoPaulo());
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const role = activeTenant?.role ?? "vendor";
  const canManage = new Set(["admin", "manager", "supervisor", "leader"]).has(role);

  const gateQ = useQuery({
    queryKey: ["presence_gate_manage", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 20_000,
    queryFn: async () => {
      const { data: j, error: jErr } = await supabase
        .from("journeys")
        .select("id")
        .eq("key", "presence")
        .limit(1)
        .maybeSingle();
      if (jErr) throw jErr;
      if (!j?.id) return null;

      const { data: tj, error: tjErr } = await supabase
        .from("tenant_journeys")
        .select("enabled,config_json")
        .eq("tenant_id", activeTenantId!)
        .eq("journey_id", j.id)
        .eq("enabled", true)
        .limit(1)
        .maybeSingle();
      if (tjErr) throw tjErr;

      const cfg = (tj as any)?.config_json ?? {};
      return {
        journey_id: j.id,
        enabled: Boolean(cfg?.flags?.presence_enabled),
      } as Gate;
    },
  });

  const casesQ = useQuery({
    queryKey: ["presence_cases_by_date", activeTenantId, date],
    enabled: Boolean(activeTenantId && gateQ.data?.enabled),
    refetchInterval: 7000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,title,state,status,case_date,entity_id,updated_at")
        .eq("tenant_id", activeTenantId!)
        .eq("case_type", "PRESENCE_DAY")
        .eq("case_date", date)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as PresenceCase[];
    },
  });

  const caseIds = useMemo(() => (casesQ.data ?? []).map((c) => c.id), [casesQ.data]);

  const pendsQ = useQuery({
    queryKey: ["presence_pendencies_by_case", activeTenantId, date, caseIds.join(",")],
    enabled: Boolean(activeTenantId && caseIds.length),
    refetchInterval: 9000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendencies")
        .select("case_id,type,status,required")
        .eq("tenant_id", activeTenantId!)
        .in("case_id", caseIds)
        .eq("status", "open")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as any as PendLite[];
    },
  });

  const pendByCase = useMemo(() => {
    const m = new Map<string, { open: number; critical: number; types: Set<string> }>();
    const criticalTypes = new Set(["late_arrival", "outside_radius", "missing_break", "missing_exit"]);

    for (const p of pendsQ.data ?? []) {
      const cid = String((p as any).case_id ?? "");
      if (!cid) continue;
      const cur = m.get(cid) ?? { open: 0, critical: 0, types: new Set<string>() };
      cur.open += 1;
      const t = String((p as any).type ?? "");
      if (criticalTypes.has(t)) cur.critical += 1;
      if (t) cur.types.add(t);
      m.set(cid, cur);
    }
    return m;
  }, [pendsQ.data]);

  const columns = useMemo(() => {
    const rows = casesQ.data ?? [];

    const critical: PresenceCase[] = [];
    const justify: PresenceCase[] = [];
    const approve: PresenceCase[] = [];
    const ok: PresenceCase[] = [];
    const closed: PresenceCase[] = [];

    for (const c of rows) {
      const p = pendByCase.get(c.id);
      const isClosed = c.state === "FECHADO" || c.status === "closed";
      if (isClosed) {
        closed.push(c);
        continue;
      }

      if ((p?.critical ?? 0) > 0) {
        critical.push(c);
        continue;
      }

      if (c.state === "PENDENTE_JUSTIFICATIVA") {
        justify.push(c);
        continue;
      }

      if (c.state === "PENDENTE_APROVACAO") {
        approve.push(c);
        continue;
      }

      ok.push(c);
    }

    return [
      { key: "critical", title: "Pendências críticas", items: critical, tone: "amber" },
      { key: "justify", title: "Aguardando justificativa", items: justify, tone: "rose" },
      { key: "approve", title: "Aguardando aprovação", items: approve, tone: "sky" },
      { key: "ok", title: "OK", items: ok, tone: "emerald" },
      { key: "closed", title: "Fechados", items: closed, tone: "slate" },
    ];
  }, [casesQ.data, pendByCase]);

  const selectedCase = useMemo(
    () => (casesQ.data ?? []).find((c) => c.id === openCaseId) ?? null,
    [casesQ.data, openCaseId]
  );

  const detailPunchesQ = useQuery({
    queryKey: ["presence_detail_punches", activeTenantId, openCaseId],
    enabled: Boolean(activeTenantId && openCaseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_punches")
        .select("id,timestamp,type,within_radius,distance_from_location,latitude,longitude,status,source")
        .eq("tenant_id", activeTenantId!)
        .eq("case_id", openCaseId!)
        .order("timestamp", { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as PunchRow[];
    },
  });

  const detailTimelineQ = useQuery({
    queryKey: ["presence_detail_timeline", activeTenantId, openCaseId],
    enabled: Boolean(activeTenantId && openCaseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timeline_events")
        .select("id,event_type,message,occurred_at")
        .eq("tenant_id", activeTenantId!)
        .eq("case_id", openCaseId!)
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as TimelineRow[];
    },
  });

  const detailPendQ = useQuery({
    queryKey: ["presence_detail_pendencies", activeTenantId, openCaseId],
    enabled: Boolean(activeTenantId && openCaseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendencies")
        .select("id,type,question_text,status,required,answered_text")
        .eq("tenant_id", activeTenantId!)
        .eq("case_id", openCaseId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PendRow[];
    },
  });

  const closeDay = async () => {
    if (!activeTenantId || !openCaseId) return;
    setClosing(true);
    try {
      const out = await callEdge(PRESENCE_CLOSE_URL, { tenant_id: activeTenantId, case_id: openCaseId });
      showSuccess(`Fechado. Δ ${out.minutes_delta}min • saldo ${out.balance_after}min.`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["presence_cases_by_date", activeTenantId, date] }),
        qc.invalidateQueries({ queryKey: ["presence_detail_punches", activeTenantId, openCaseId] }),
        qc.invalidateQueries({ queryKey: ["presence_detail_timeline", activeTenantId, openCaseId] }),
        qc.invalidateQueries({ queryKey: ["presence_detail_pendencies", activeTenantId, openCaseId] }),
      ]);
    } catch (e: any) {
      showError(e?.message ?? "Falha ao fechar dia.");
    } finally {
      setClosing(false);
    }
  };

  const lastGeo = useMemo(() => {
    const p = (detailPunchesQ.data ?? []).slice().reverse().find((x) => x.latitude != null && x.longitude != null);
    if (!p) return null;
    return { lat: Number(p.latitude), lng: Number(p.longitude), within: Boolean(p.within_radius), dist: p.distance_from_location };
  }, [detailPunchesQ.data]);

  const mapsUrl = lastGeo
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${lastGeo.lat},${lastGeo.lng}`)}`
    : null;

  if (!activeTenantId) {
    return (
      <RequireAuth>
        <AppShell>
          <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur">
            Selecione um tenant.
          </div>
        </AppShell>
      </RequireAuth>
    );
  }

  if (!canManage) {
    return (
      <RequireAuth>
        <AppShell>
          <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 shadow-sm backdrop-blur">
            Você não tem permissão para a gestão de presença neste tenant.
          </div>
        </AppShell>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <AppShell>
        <div className="grid gap-4">
          <div className="rounded-[28px] border border-slate-200 bg-white/65 p-5 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                    <Workflow className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold tracking-tight text-slate-900">Gestão de Presença</h1>
                    <div className="mt-0.5 text-sm text-slate-600">Kanban de ponto (default: hoje)</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 shadow-sm">
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  <div className="text-xs font-semibold text-slate-700">Data</div>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700"
                  />
                </div>

                <Button
                  variant="secondary"
                  className="h-10 rounded-2xl"
                  onClick={() => {
                    casesQ.refetch();
                    pendsQ.refetch();
                  }}
                >
                  Atualizar
                </Button>
              </div>
            </div>

            {!gateQ.data?.enabled ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Presença não está habilitada neste tenant (flags.presence_enabled).
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto pb-1">
                <div className="flex min-w-[1080px] gap-4">
                  {columns.map((col) => (
                    <div key={col.key} className="w-[320px] flex-shrink-0">
                      <div className="flex items-center justify-between px-1">
                        <div className="text-sm font-semibold text-slate-800">{col.title}</div>
                        <div className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {col.items.length}
                        </div>
                      </div>

                      <div className="mt-2 space-y-3 rounded-[24px] border border-dashed border-slate-200 bg-slate-50/50 p-2">
                        {col.items.map((c) => {
                          const pend = pendByCase.get(c.id);
                          const isClosed = c.state === "FECHADO" || c.status === "closed";

                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setOpenCaseId(c.id)}
                              className="w-full rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-slate-900">
                                    {c.title ?? "Colaborador"}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">{titleize(c.state)}</div>
                                </div>

                                <div className="flex flex-col items-end gap-2">
                                  {(pend?.open ?? 0) > 0 ? (
                                    <Badge className="rounded-full border-0 bg-amber-100 text-amber-900">
                                      {pend!.open} pend.
                                    </Badge>
                                  ) : (
                                    <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-900">ok</Badge>
                                  )}

                                  {isClosed ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                  ) : null}
                                </div>
                              </div>

                              <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                                  {formatShort(c.updated_at)}
                                </div>
                                {(pend?.critical ?? 0) > 0 ? (
                                  <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-900">
                                    <ShieldAlert className="h-3.5 w-3.5" />
                                    crítico
                                  </div>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}

                        {col.items.length === 0 && (
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/50 p-4 text-xs text-slate-500">
                            Sem cards aqui.
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Sheet open={Boolean(openCaseId)} onOpenChange={(o) => setOpenCaseId(o ? openCaseId : null)}>
            <SheetContent className="w-full max-w-[520px] rounded-l-[28px] border-slate-200 bg-white p-0">
              <div className="p-5">
                <SheetHeader>
                  <SheetTitle className="text-slate-900">{selectedCase?.title ?? "Presença"}</SheetTitle>
                  <SheetDescription>
                    {selectedCase?.case_date} • {titleize(selectedCase?.state ?? "")}
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge className={cn(
                    "rounded-full border-0",
                    selectedCase?.state === "FECHADO" || selectedCase?.status === "closed"
                      ? "bg-emerald-100 text-emerald-900"
                      : selectedCase?.state === "PENDENTE_JUSTIFICATIVA"
                        ? "bg-amber-100 text-amber-900"
                        : selectedCase?.state === "PENDENTE_APROVACAO"
                          ? "bg-sky-100 text-sky-900"
                          : "bg-slate-100 text-slate-700"
                  )}>
                    {titleize(selectedCase?.state ?? "")}
                  </Badge>
                  {(pendByCase.get(openCaseId ?? "")?.open ?? 0) > 0 ? (
                    <Badge className="rounded-full border-0 bg-amber-100 text-amber-900">
                      {pendByCase.get(openCaseId ?? "")!.open} pend.
                    </Badge>
                  ) : (
                    <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-900">ok</Badge>
                  )}
                </div>

                <div className="mt-4">
                  <Separator className="bg-slate-200" />
                </div>

                <Card className="mt-4 rounded-[22px] border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">Ações</div>
                  <div className="mt-3 grid gap-2">
                    <Button
                      disabled={closing || selectedCase?.state === "FECHADO" || selectedCase?.status === "closed"}
                      onClick={closeDay}
                      className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                    >
                      {closing ? "Fechando…" : "Fechar dia (lançar banco de horas)"}
                    </Button>
                    <div className="text-[11px] text-slate-600">
                      Regra: apenas humanos fecham. O lançamento é imutável (bank_hour_ledger).
                    </div>
                  </div>
                </Card>

                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 flex items-center justify-between rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 hover:border-slate-300"
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-slate-500" />
                      <span>Ver última localização no mapa</span>
                    </div>
                    <span className="text-xs text-slate-500">Google Maps</span>
                  </a>
                )}

                <div className="mt-4">
                  <Separator className="bg-slate-200" />
                </div>

                <div className="mt-4">
                  <div className="text-sm font-semibold text-slate-900">Batidas</div>
                  <div className="mt-3 space-y-2">
                    {(detailPunchesQ.data ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        Sem batidas.
                      </div>
                    ) : (
                      (detailPunchesQ.data ?? []).map((p) => (
                        <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold text-slate-900">{p.type}</div>
                              <div className="mt-0.5 text-xs text-slate-600">{formatShort(p.timestamp)}</div>
                            </div>
                            <Badge
                              className={cn(
                                "rounded-full border-0",
                                p.within_radius ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
                              )}
                            >
                              {p.within_radius ? "OK" : "exceção"}
                            </Badge>
                          </div>
                          <div className="mt-2 text-[11px] text-slate-600">
                            fonte: {p.source} • status: {p.status}
                            {p.distance_from_location != null ? ` • distância: ${Math.round(p.distance_from_location)}m` : ""}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <Separator className="bg-slate-200" />
                </div>

                <div className="mt-4">
                  <div className="text-sm font-semibold text-slate-900">Pendências</div>
                  <div className="mt-3 space-y-2">
                    {(detailPendQ.data ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        Sem pendências.
                      </div>
                    ) : (
                      (detailPendQ.data ?? []).map((p) => (
                        <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900">{p.type}</div>
                              <div className="mt-1 text-xs text-slate-600">{p.question_text}</div>
                            </div>
                            <Badge className={cn(
                              "rounded-full border-0",
                              p.status === "open" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
                            )}>
                              {p.status}
                            </Badge>
                          </div>
                          {p.answered_text ? (
                            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                              <div className="text-[11px] font-semibold text-slate-700">Resposta</div>
                              <div className="mt-1">{p.answered_text}</div>
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <Separator className="bg-slate-200" />
                </div>

                <div className="mt-4">
                  <div className="text-sm font-semibold text-slate-900">Timeline</div>
                  <div className="mt-3 space-y-2">
                    {(detailTimelineQ.data ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        Sem eventos.
                      </div>
                    ) : (
                      (detailTimelineQ.data ?? []).map((t) => (
                        <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900">{t.event_type}</div>
                              <div className="mt-1 text-xs text-slate-600">{t.message}</div>
                            </div>
                            <div className="text-[11px] text-slate-500">{formatShort(t.occurred_at)}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
