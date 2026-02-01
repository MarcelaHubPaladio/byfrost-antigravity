import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Clock, LocateFixed, MapPin, ShieldCheck, Workflow } from "lucide-react";

const PRESENCE_CLOCK_URL =
  "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/presence-clock";
const PRESENCE_JUSTIFY_URL =
  "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/presence-justify";

type PresenceGate = {
  journey_id: string;
  enabled: boolean;
  allow_whatsapp: boolean;
  schedule_start: string | null;
  planned_minutes: number;
};

type CaseRow = {
  id: string;
  state: string;
  status: string;
  case_date: string;
};

type PunchRow = {
  id: string;
  timestamp: string;
  type: "ENTRY" | "BREAK_START" | "BREAK_END" | "EXIT";
  within_radius: boolean;
  distance_from_location: number | null;
  status: string;
  source: string;
};

type PendRow = {
  id: string;
  type: string;
  question_text: string;
  status: string;
  required: boolean;
};

function formatDateBr(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function nextLabelFromPunches(punches: PunchRow[]) {
  const last = punches[0]?.type ?? null;
  if (!last) return { nextType: "ENTRY" as const, label: "Registrar entrada" };
  if (last === "ENTRY") return { nextType: "BREAK_START" as const, label: "Iniciar intervalo" };
  if (last === "BREAK_START") return { nextType: "BREAK_END" as const, label: "Voltar do intervalo" };
  if (last === "BREAK_END") return { nextType: "EXIT" as const, label: "Registrar saída" };
  return { nextType: null as any, label: "Dia finalizado" };
}

function ymdInSaoPaulo() {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(new Date());
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

export default function PresenceClock() {
  const qc = useQueryClient();
  const { activeTenantId, activeTenant } = useTenant();
  const { user } = useSession();
  const [geoBusy, setGeoBusy] = useState(false);
  const [justifying, setJustifying] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});

  const role = activeTenant?.role ?? "vendor";
  const canManage = new Set(["admin", "manager", "supervisor", "leader"]).has(role);

  const gateQ = useQuery({
    queryKey: ["presence_gate", activeTenantId],
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
      const enabled = Boolean(cfg?.flags?.presence_enabled);
      const allowWhatsapp = Boolean(cfg?.flags?.presence_allow_whatsapp_clocking);
      const scheduleStart =
        (cfg?.presence?.schedule?.start_time as string | undefined) ?? null;
      const plannedMinutes = Number(cfg?.presence?.schedule?.planned_minutes ?? 480);

      return {
        journey_id: j.id,
        enabled,
        allow_whatsapp: allowWhatsapp,
        schedule_start: scheduleStart,
        planned_minutes: plannedMinutes,
      } as PresenceGate;
    },
  });

  const today = ymdInSaoPaulo();

  const caseQ = useQuery({
    queryKey: ["presence_case_today", activeTenantId, user?.id, today],
    enabled: Boolean(activeTenantId && user?.id && gateQ.data?.enabled),
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,state,status,case_date")
        .eq("tenant_id", activeTenantId!)
        .eq("case_type", "PRESENCE_DAY")
        .eq("entity_type", "employee")
        .eq("entity_id", user!.id)
        .eq("case_date", today)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CaseRow | null;
    },
  });

  const punchesQ = useQuery({
    queryKey: ["presence_punches", activeTenantId, caseQ.data?.id],
    enabled: Boolean(activeTenantId && caseQ.data?.id),
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_punches")
        .select("id,timestamp,type,within_radius,distance_from_location,status,source")
        .eq("tenant_id", activeTenantId!)
        .eq("case_id", caseQ.data!.id)
        .order("timestamp", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as PunchRow[];
    },
  });

  const pendQ = useQuery({
    queryKey: ["presence_pendencies", activeTenantId, caseQ.data?.id],
    enabled: Boolean(activeTenantId && caseQ.data?.id),
    refetchInterval: 7000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendencies")
        .select("id,type,question_text,status,required")
        .eq("tenant_id", activeTenantId!)
        .eq("case_id", caseQ.data!.id)
        .eq("status", "open")
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PendRow[];
    },
  });

  const punches = punchesQ.data ?? [];
  const next = nextLabelFromPunches(punches);
  const lastPunch = punches[0] ?? null;

  const dayStatusBadge = useMemo(() => {
    const st = caseQ.data?.state ?? "AGUARDANDO_ENTRADA";
    const base = "rounded-full border-0";
    if (st === "PENDENTE_JUSTIFICATIVA")
      return <Badge className={cn(base, "bg-amber-100 text-amber-900")}>pendente justificativa</Badge>;
    if (st === "PENDENTE_APROVACAO")
      return <Badge className={cn(base, "bg-sky-100 text-sky-900")}>pendente aprovação</Badge>;
    if (st === "FECHADO")
      return <Badge className={cn(base, "bg-emerald-100 text-emerald-900")}>fechado</Badge>;
    return <Badge className={cn(base, "bg-slate-100 text-slate-700")}>{st.toLowerCase().replace(/_/g, " ")}</Badge>;
  }, [caseQ.data?.state]);

  const doPunch = async () => {
    if (!activeTenantId) return;
    setGeoBusy(true);

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 10_000,
        });
      });

      const payload = {
        tenant_id: activeTenantId,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_meters: pos.coords.accuracy,
      };

      const out = await callEdge(PRESENCE_CLOCK_URL, payload);

      showSuccess(`Batida registrada: ${out?.punch?.type ?? "ok"}`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["presence_case_today", activeTenantId] }),
        qc.invalidateQueries({ queryKey: ["presence_punches", activeTenantId] }),
        qc.invalidateQueries({ queryKey: ["presence_pendencies", activeTenantId] }),
      ]);
    } catch (e: any) {
      showError(e?.message ?? "Falha ao registrar batida.");
    } finally {
      setGeoBusy(false);
    }
  };

  const submitJustification = async (p: PendRow) => {
    if (!activeTenantId) return;
    const text = String(answerDraft[p.id] ?? "").trim();
    if (!text) {
      showError("Escreva uma justificativa antes de enviar.");
      return;
    }

    setJustifying(p.id);
    try {
      await callEdge(PRESENCE_JUSTIFY_URL, {
        tenant_id: activeTenantId,
        pendency_id: p.id,
        answer_text: text,
      });
      showSuccess("Justificativa enviada.");
      setAnswerDraft((prev) => ({ ...prev, [p.id]: "" }));
      await qc.invalidateQueries({ queryKey: ["presence_pendencies", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["presence_case_today", activeTenantId] });
    } catch (e: any) {
      showError(e?.message ?? "Falha ao enviar justificativa.");
    } finally {
      setJustifying(null);
    }
  };

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

  const gate = gateQ.data;

  return (
    <RequireAuth>
      <AppShell>
        <div className="grid gap-4">
          <div className="rounded-[28px] border border-slate-200 bg-white/65 p-5 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold tracking-tight text-slate-900">Bater Ponto</h1>
                    <div className="mt-0.5 text-sm text-slate-600">{today} • {activeTenant?.slug}</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {dayStatusBadge}
                  {gate?.schedule_start ? (
                    <Badge className="rounded-full border-0 bg-violet-100 text-violet-900">
                      jornada {gate.schedule_start} • {gate.planned_minutes}min
                    </Badge>
                  ) : (
                    <Badge className="rounded-full border-0 bg-slate-100 text-slate-700">sem jornada prevista</Badge>
                  )}
                  {gate?.allow_whatsapp ? (
                    <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-900">
                      WhatsApp habilitado
                    </Badge>
                  ) : (
                    <Badge className="rounded-full border-0 bg-slate-100 text-slate-700">
                      WhatsApp desligado
                    </Badge>
                  )}
                </div>
              </div>

              {canManage && (
                <div className="flex items-center gap-2">
                  <Link to="/app/presence/manage">
                    <Button variant="secondary" className="h-10 rounded-2xl">
                      <Workflow className="mr-2 h-4 w-4" /> Gestão
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            {!gate?.enabled ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4" />
                  <div>
                    A jornada <span className="font-semibold">presence</span> ainda não está habilitada neste tenant.
                    <div className="mt-1 text-xs text-amber-900/80">
                      No Admin → Jornadas, ative a jornada <span className="font-mono">presence</span> e defina
                      <span className="font-mono"> config_json.flags.presence_enabled = true</span>.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.95fr]">
                <Card className="rounded-[24px] border-slate-200 bg-white/70 p-4">
                  <div className="text-sm font-semibold text-slate-900">Ação do momento</div>
                  <div className="mt-1 text-xs text-slate-600">
                    Um botão único. O sistema sugere a próxima batida válida.
                  </div>

                  <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-700">Próxima ação</div>
                        <div className="mt-1 text-base font-semibold text-slate-900">{next.label}</div>
                        <div className="mt-1 text-xs text-slate-600">
                          {caseQ.data?.id ? `case: ${caseQ.data.id.slice(0, 8)}…` : "case do dia será criado na primeira batida"}
                        </div>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 ring-1 ring-slate-200">
                        <LocateFixed className="h-5 w-5" />
                      </div>
                    </div>

                    <Button
                      onClick={doPunch}
                      disabled={geoBusy || !next.nextType}
                      className="mt-4 h-12 w-full rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                    >
                      {geoBusy ? "Obtendo localização…" : next.label}
                    </Button>

                    <div className="mt-3 text-[11px] text-slate-600">
                      Dica: se a localização estiver fora do raio, a batida <span className="font-semibold">não é bloqueada</span> — ela vira exceção e abre pendência.
                    </div>
                  </div>

                  <div className="mt-4">
                    <Separator className="bg-slate-200" />
                  </div>

                  <div className="mt-4">
                    <div className="text-sm font-semibold text-slate-900">Último registro</div>
                    {!lastPunch ? (
                      <div className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        Nenhuma batida registrada ainda.
                      </div>
                    ) : (
                      <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-700">{lastPunch.type}</div>
                            <div className="mt-1 text-sm font-semibold text-slate-900">{formatDateBr(lastPunch.timestamp)}</div>
                            <div className="mt-1 text-xs text-slate-600">origem: {lastPunch.source}</div>
                          </div>
                          <Badge
                            className={cn(
                              "rounded-full border-0",
                              lastPunch.within_radius ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
                            )}
                          >
                            {lastPunch.within_radius ? "dentro do raio" : "fora do raio"}
                          </Badge>
                        </div>

                        <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4 text-slate-400" />
                            {lastPunch.distance_from_location != null
                              ? `distância: ${Math.round(lastPunch.distance_from_location)}m`
                              : "distância: (sem política)"}
                          </div>
                          <div>
                            status: <span className="font-medium">{lastPunch.status}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="rounded-[24px] border-slate-200 bg-white/70 p-4">
                  <div className="text-sm font-semibold text-slate-900">Batidas do dia</div>
                  <div className="mt-1 text-xs text-slate-600">Fonte de verdade: tabela time_punches.</div>

                  <div className="mt-4 space-y-2">
                    {punches.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        Sem batidas ainda.
                      </div>
                    ) : (
                      punches
                        .slice()
                        .reverse()
                        .map((p, idx) => (
                          <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-700">
                                  {idx + 1}. {p.type}
                                </div>
                                <div className="mt-0.5 text-xs text-slate-600">{formatDateBr(p.timestamp)}</div>
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
                          </div>
                        ))
                    )}
                  </div>

                  <div className="mt-5">
                    <Separator className="bg-slate-200" />
                  </div>

                  <div className="mt-4">
                    <div className="text-sm font-semibold text-slate-900">Pendências</div>
                    <div className="mt-1 text-xs text-slate-600">
                      Reutiliza a estrutura de pendencies + approvals.
                    </div>

                    {(pendQ.data ?? []).length === 0 ? (
                      <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        Nenhuma pendência aberta.
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {(pendQ.data ?? []).map((p) => (
                          <div key={p.id} className="rounded-[20px] border border-slate-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-900">{p.type}</div>
                                <div className="mt-1 text-xs text-slate-600">{p.question_text}</div>
                              </div>
                              <Badge className="rounded-full border-0 bg-amber-100 text-amber-900">obrigatória</Badge>
                            </div>

                            <div className="mt-3 grid gap-2">
                              <Textarea
                                value={answerDraft[p.id] ?? ""}
                                onChange={(e) => setAnswerDraft((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                className="min-h-[88px] rounded-2xl bg-white"
                                placeholder="Escreva sua justificativa…"
                              />
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => submitJustification(p)}
                                  disabled={justifying === p.id}
                                  className="h-10 flex-1 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                                >
                                  {justifying === p.id ? "Enviando…" : "Enviar justificativa"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="h-10 rounded-2xl"
                                  onClick={() => setAnswerDraft((prev) => ({ ...prev, [p.id]: "" }))}
                                >
                                  Limpar
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {gate?.allow_whatsapp ? (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                        WhatsApp: envie uma <span className="font-semibold">localização</span> com a legenda:
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {[
                            "ENTRADA",
                            "INTERVALO",
                            "VOLTEI",
                            "SAIDA",
                          ].map((x) => (
                            <div key={x} className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px]">
                              {x}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
