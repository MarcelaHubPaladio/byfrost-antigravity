import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import {
  formatYmdInTimeZone,
  inferNextPunchType,
  titleizeCaseState,
  titleizePunchType,
  type PresencePunchType,
} from "@/lib/presence";
import { ArrowRight, Compass, MapPin, ShieldAlert } from "lucide-react";

type TenantJourneyPresence = {
  journey_id: string;
  config_json: any;
  journeys?: { key: string } | null;
};

type PresenceCase = {
  id: string;
  state: string;
  status: string;
  case_date: string | null;
};

type PunchRow = {
  id: string;
  timestamp: string;
  type: PresencePunchType;
  within_radius: boolean;
  distance_from_location: number | null;
  status: string;
  source: string;
};

type PendencyRow = {
  id: string;
  type: string;
  question_text: string;
  required: boolean;
  status: string;
  answered_text: string | null;
};

export default function Presence() {
  const { activeTenantId, activeTenant } = useTenant();
  const { user } = useSession();
  const qc = useQueryClient();

  const [punching, setPunching] = useState(false);
  const [justificationDraft, setJustificationDraft] = useState<Record<string, string>>({});
  const [geoHint, setGeoHint] = useState<"idle" | "ok" | "denied">("idle");

  const presenceCfgQ = useQuery({
    queryKey: ["presence_cfg", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("journey_id,config_json,journeys!inner(key)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true)
        .eq("journeys.key", "presence")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as any as TenantJourneyPresence | null;
    },
  });

  const presenceEnabled = Boolean((presenceCfgQ.data as any)?.config_json?.flags?.presence_enabled === true);
  const timeZone = String((presenceCfgQ.data as any)?.config_json?.presence?.time_zone ?? "America/Sao_Paulo");

  const today = useMemo(() => formatYmdInTimeZone(timeZone), [timeZone]);

  const policyQ = useQuery({
    queryKey: ["presence_policy", activeTenantId, presenceEnabled],
    enabled: Boolean(activeTenantId && presenceEnabled),
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presence_policies")
        .select("break_required")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any as { break_required: boolean } | null;
    },
  });

  const breakRequired = policyQ.data?.break_required ?? true;

  const caseQ = useQuery({
    queryKey: ["presence_case_today", activeTenantId, user?.id, today],
    enabled: Boolean(activeTenantId && user?.id && presenceEnabled),
    refetchInterval: 8000,
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
      return (data ?? null) as PresenceCase | null;
    },
  });

  const punchesQ = useQuery({
    queryKey: ["presence_punches_today", activeTenantId, caseQ.data?.id],
    enabled: Boolean(activeTenantId && caseQ.data?.id && presenceEnabled),
    refetchInterval: 8000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_punches")
        .select("id,timestamp,type,within_radius,distance_from_location,status,source")
        .eq("tenant_id", activeTenantId!)
        .eq("case_id", caseQ.data!.id)
        .order("timestamp", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any as PunchRow[];
    },
  });

  const pendQ = useQuery({
    queryKey: ["presence_pendencies_today", activeTenantId, caseQ.data?.id],
    enabled: Boolean(activeTenantId && caseQ.data?.id && presenceEnabled),
    refetchInterval: 9000,
    queryFn: async () => {
      const base = supabase
        .from("pendencies")
        .select("id,type,question_text,required,status,answered_text")
        .eq("case_id", caseQ.data!.id)
        .order("created_at", { ascending: true })
        .limit(200);

      // Some installations have tenant_id; keep it best-effort.
      const { data, error } = activeTenantId
        ? await (base as any).eq("tenant_id", activeTenantId)
        : await (base as any);

      if (error) throw error;
      return (data ?? []) as any as PendencyRow[];
    },
  });

  const lastPunch = useMemo(() => {
    const list = punchesQ.data ?? [];
    return list.length ? list[list.length - 1] : null;
  }, [punchesQ.data]);

  const openPendencies = useMemo(() => (pendQ.data ?? []).filter((p) => p.status === "open"), [pendQ.data]);

  const suggestedNext = useMemo(() => {
    const last = lastPunch?.type ?? null;
    return inferNextPunchType(last, breakRequired);
  }, [lastPunch?.type, breakRequired]);

  useEffect(() => {
    if (!presenceEnabled) return;
    if (!navigator.geolocation) {
      setGeoHint("denied");
      return;
    }

    // Best-effort permission hint (not supported on all browsers)
    const anyNav: any = navigator;
    if (anyNav.permissions?.query) {
      anyNav.permissions
        .query({ name: "geolocation" })
        .then((s: any) => {
          if (s?.state === "denied") setGeoHint("denied");
          else setGeoHint("ok");
        })
        .catch(() => setGeoHint("idle"));
    }
  }, [presenceEnabled]);

  const clockNow = async () => {
    if (!activeTenantId) return;
    if (!presenceEnabled) {
      showError("Presença não está habilitada para este tenant.");
      return;
    }

    if (!suggestedNext) {
      showError("Nenhuma ação disponível para hoje.");
      return;
    }

    setPunching(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Geolocalização indisponível"));
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 10_000,
          timeout: 12_000,
        });
      });

      const url = "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/presence-clock";
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenantId: activeTenantId,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Falha ao bater ponto (${res.status})`);
      }

      showSuccess(`Batida registrada: ${titleizePunchType(json.nextType as PresencePunchType)}`);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["presence_case_today", activeTenantId, user?.id, today] }),
        qc.invalidateQueries({ queryKey: ["presence_punches_today", activeTenantId, caseQ.data?.id] }),
        qc.invalidateQueries({ queryKey: ["presence_pendencies_today", activeTenantId, caseQ.data?.id] }),
      ]);
    } catch (e: any) {
      if (String(e?.message ?? "").toLowerCase().includes("permission")) setGeoHint("denied");
      showError(e?.message ?? "Falha ao bater ponto");
    } finally {
      setPunching(false);
    }
  };

  const submitJustifications = async () => {
    if (!activeTenantId || !caseQ.data?.id) return;

    const open = openPendencies;
    if (!open.length) return;

    try {
      const answers = open
        .map((p) => ({ pendencyId: p.id, answerText: (justificationDraft[p.id] ?? "").trim() }))
        .filter((a) => Boolean(a.answerText));

      if (!answers.length) {
        showError("Escreva ao menos uma justificativa para enviar.");
        return;
      }

      const url = "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/presence-justify";
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenantId: activeTenantId, caseId: caseQ.data.id, answers }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Falha ao enviar (${res.status})`);
      }

      showSuccess(json.requiredOpen ? "Justificativa enviada." : "Justificativas enviadas. Aguardando aprovação.");
      setJustificationDraft({});

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["presence_case_today", activeTenantId, user?.id, today] }),
        qc.invalidateQueries({ queryKey: ["presence_pendencies_today", activeTenantId, caseQ.data.id] }),
      ]);
    } catch (e: any) {
      showError(e?.message ?? "Falha ao enviar justificativas");
    }
  };

  const timeFmt = useMemo(() => {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, [timeZone]);

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--byfrost-accent)/0.10)] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--byfrost-accent))]">
                <Compass className="h-4 w-4" />
                Presença • Ponto digital
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">Bater Ponto</h2>
              <p className="mt-1 text-sm text-slate-600">
                Tenant: <span className="font-medium">{activeTenant?.slug ?? "—"}</span> • Hoje: {today}
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-700 shadow-sm">
                Status do dia: <span className="font-semibold">{titleizeCaseState(caseQ.data?.state ?? "AGUARDANDO_ENTRADA")}</span>
              </div>
              <Button
                onClick={clockNow}
                disabled={punching || !activeTenantId || !presenceEnabled || !suggestedNext}
                className={cn(
                  "h-11 rounded-2xl px-5 text-white shadow-sm",
                  "bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                )}
              >
                {punching
                  ? "Registrando…"
                  : suggestedNext
                    ? `Registrar: ${titleizePunchType(suggestedNext)}`
                    : "Dia finalizado"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          {!presenceEnabled && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Esta jornada é opcional e só funciona quando a flag
              <span className="mx-1 font-mono">journey.config_json.flags.presence_enabled</span>
              estiver <span className="font-semibold">true</span>.
            </div>
          )}

          {presenceEnabled && (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold text-slate-600">Próxima ação sugerida</div>
                <div className="mt-2 text-lg font-semibold text-slate-900">
                  {suggestedNext ? titleizePunchType(suggestedNext) : "—"}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {breakRequired ? "Intervalo obrigatório" : "Sem intervalo obrigatório"}
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold text-slate-600">Geolocalização</div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      geoHint === "denied" ? "bg-rose-600" : geoHint === "ok" ? "bg-emerald-600" : "bg-slate-300"
                    )}
                  />
                  <div className="text-sm font-semibold text-slate-900">
                    {geoHint === "denied" ? "Bloqueada" : geoHint === "ok" ? "Disponível" : "Verificando…"}
                  </div>
                </div>
                <div className="mt-1 text-sm text-slate-600">A batida exige localização (APP e WhatsApp).</div>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold text-slate-600">Pendências</div>
                <div className="mt-2 flex items-center gap-2">
                  <Badge
                    className={cn(
                      "rounded-full border-0",
                      openPendencies.length ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
                    )}
                  >
                    {openPendencies.length ? `${openPendencies.length} abertas` : "ok"}
                  </Badge>
                </div>
                <div className="mt-1 text-sm text-slate-600">Justificativas e aprovação seguem a governança.</div>
              </div>
            </div>
          )}

          {lastPunch && !lastPunch.within_radius && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4" />
                <div className="min-w-0">
                  Batida registrada fora do raio. Isso gera pendência obrigatória, mas
                  <span className="font-semibold"> nunca bloqueia</span> o registro.
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Batidas do dia</div>
                <div className="text-xs text-slate-500">{punchesQ.data?.length ?? 0}</div>
              </div>

              <div className="mt-3 space-y-2">
                {(punchesQ.data ?? []).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{titleizePunchType(p.type)}</div>
                      <div className="mt-0.5 text-[11px] text-slate-600">
                        {timeFmt.format(new Date(p.timestamp))} • {p.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      {p.within_radius ? "ok" : "exceção"}
                    </div>
                  </div>
                ))}

                {!punchesQ.data?.length && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
                    Ainda não há batidas hoje. Clique em "Registrar" para iniciar.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Pendências / justificativas</div>
                <div className="text-xs text-slate-500">{openPendencies.length} abertas</div>
              </div>

              <div className="mt-3 space-y-3">
                {openPendencies.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-900">{p.question_text}</div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
                      <span>{p.type}</span>
                      <span className={cn(p.required ? "text-rose-700" : "text-slate-500")}>{p.required ? "obrigatória" : "opcional"}</span>
                    </div>
                    <Textarea
                      value={justificationDraft[p.id] ?? ""}
                      onChange={(e) => setJustificationDraft((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      className="mt-2 min-h-[88px] rounded-2xl bg-white"
                      placeholder="Escreva sua justificativa…"
                    />
                  </div>
                ))}

                {!openPendencies.length && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
                    Sem pendências no momento.
                  </div>
                )}

                <Button
                  onClick={submitJustifications}
                  disabled={!openPendencies.length}
                  className="h-11 w-full rounded-2xl bg-slate-900 text-white hover:bg-slate-800"
                >
                  Enviar justificativas
                </Button>

                <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-600">
                  <Compass className="mr-1 inline h-4 w-4 text-[hsl(var(--byfrost-accent))]" />
                  A aprovação e o fechamento do dia são ações humanas.
                </div>
              </div>
            </div>
          </div>

          {(presenceCfgQ.isError || policyQ.isError || caseQ.isError || punchesQ.isError || pendQ.isError) && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              Erro ao carregar presença: {(presenceCfgQ.error as any)?.message ?? (caseQ.error as any)?.message ?? ""}
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <span className="font-semibold">Nota:</span> se você não ver este módulo, ele pode estar desabilitado no tenant.
            Fale com o administrador do sistema.
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}