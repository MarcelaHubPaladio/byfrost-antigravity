import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type PresencePunchType,
  type PresencePunchSource,
  inferNextPunchType,
  getLocalYmd,
} from "./presence-logic.ts";

export type { PresencePunchType, PresencePunchSource };
export { getLocalYmd, inferNextPunchType };

type PresencePolicy = {
  id: string;
  location_id: string;
  radius_meters: number;
  lateness_tolerance_minutes: number;
  break_required: boolean;
  allow_outside_radius: boolean;
  presence_locations?: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
  } | null;
};

type PresenceEmployeeConfig = {
  scheduled_start_hhmm: string | null;
  planned_minutes: number | null;
} | null;

function getLocalHm(timeZone: string, d = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const s = dtf.format(d);
  const [hh, mm] = s.split(":");
  return { hh: Number(hh), mm: Number(mm) };
}

function minutesOfDay(hh: number, mm: number) {
  return hh * 60 + mm;
}

function parseHHMM(s: string, fallback = "08:00") {
  const raw = (s || fallback).trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { hh: 8, mm: 0 };
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return { hh, mm };
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function getPresenceTenantConfig(
  supabase: SupabaseClient,
  tenantId: string
): Promise<
  | {
    enabled: boolean;
    journeyId: string | null;
    config: any;
    flags: { presence_enabled: boolean; presence_allow_whatsapp_clocking: boolean };
    presence: { time_zone: string; scheduled_start_hhmm: string; planned_minutes: number };
  }
  | { enabled: false; journeyId: null; config: any; flags: any; presence: any }
> {
  const { data, error } = await supabase
    .from("tenant_journeys")
    .select("journey_id, config_json, journeys!inner(key)")
    .eq("tenant_id", tenantId)
    .eq("enabled", true)
    .eq("journeys.key", "presence")
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const cfg = (data as any)?.config_json ?? {};
  const flags = (cfg?.flags ?? {}) as any;
  const presenceCfg = (cfg?.presence ?? {}) as any;

  const enabled = Boolean(flags?.presence_enabled === true);

  return {
    enabled,
    journeyId: (data as any)?.journey_id ?? null,
    config: cfg,
    flags: {
      presence_enabled: enabled,
      presence_allow_whatsapp_clocking: Boolean(flags?.presence_allow_whatsapp_clocking === true),
    },
    presence: {
      time_zone: String(presenceCfg?.time_zone ?? "America/Sao_Paulo"),
      scheduled_start_hhmm: String(presenceCfg?.scheduled_start_hhmm ?? "08:00"),
      planned_minutes: Number(presenceCfg?.planned_minutes ?? 480),
    },
  };
}

export async function getPresencePolicy(supabase: SupabaseClient, tenantId: string): Promise<PresencePolicy | null> {
  const { data, error } = await supabase
    .from("presence_policies")
    .select(
      "id,location_id,radius_meters,lateness_tolerance_minutes,break_required,allow_outside_radius,presence_locations(id,name,latitude,longitude)"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as any) ?? null;
}

export async function getPresenceEmployeeConfig(
  supabase: SupabaseClient,
  tenantId: string,
  employeeId: string
): Promise<PresenceEmployeeConfig> {
  try {
    const { data, error } = await supabase
      .from("presence_employee_configs")
      .select("scheduled_start_hhmm,planned_minutes")
      .eq("tenant_id", tenantId)
      .eq("employee_id", employeeId)
      .limit(1)
      .maybeSingle();

    if (error) return null;

    return {
      scheduled_start_hhmm: (data as any)?.scheduled_start_hhmm ?? null,
      planned_minutes: (data as any)?.planned_minutes ?? null,
    };
  } catch {
    return null;
  }
}



export async function ensurePresenceDayCase(args: {
  supabase: SupabaseClient;
  tenantId: string;
  employeeId: string;
  journeyId: string;
  timeZone: string;
}) {
  const { supabase, tenantId, employeeId, journeyId, timeZone } = args;
  const day = getLocalYmd(timeZone);

  const { data: existing, error: exErr } = await supabase
    .from("cases")
    .select("id,state,status,case_date")
    .eq("tenant_id", tenantId)
    .eq("case_type", "PRESENCE_DAY")
    .eq("entity_type", "employee")
    .eq("entity_id", employeeId)
    .eq("case_date", day)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (exErr) throw exErr;
  if ((existing as any)?.id) return { caseId: (existing as any).id as string, day };

  // Best-effort label to avoid managers needing access to users_profile.
  let employeeLabel: string | null = null;
  try {
    const { data: prof } = await supabase
      .from("users_profile")
      .select("display_name,email")
      .eq("tenant_id", tenantId)
      .eq("user_id", employeeId)
      .is("deleted_at", null)
      .maybeSingle();
    employeeLabel =
      (prof as any)?.display_name ||
      ((prof as any)?.email ? String((prof as any).email).split("@")[0] : null);
  } catch {
    employeeLabel = null;
  }

  const { data: created, error: cErr } = await supabase
    .from("cases")
    .insert({
      tenant_id: tenantId,
      journey_id: journeyId,
      case_type: "PRESENCE_DAY",
      status: "open",
      state: "AGUARDANDO_ENTRADA",
      created_by_channel: "panel",
      title: employeeLabel ? `Ponto • ${day} • ${employeeLabel}` : `Ponto • ${day}`,
      entity_type: "employee",
      entity_id: employeeId,
      case_date: day,
      meta_json: {
        journey_key: "presence",
        presence: { day, employee_label: employeeLabel },
      },
    })
    .select("id")
    .single();

  if (cErr) {
    // Possible unique race — try fetch again.
    const { data: again, error: aErr } = await supabase
      .from("cases")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("case_type", "PRESENCE_DAY")
      .eq("entity_type", "employee")
      .eq("entity_id", employeeId)
      .eq("case_date", day)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (aErr) throw cErr;
    if ((again as any)?.id) return { caseId: (again as any).id as string, day };
    throw cErr;
  }

  return { caseId: (created as any).id as string, day };
}

export async function clockPresencePunch(args: {
  supabase: SupabaseClient;
  tenantId: string;
  employeeId: string;
  source: PresencePunchSource;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  forcedType?: PresencePunchType | null;
  actorType: "admin" | "system";
  actorId: string | null;
}) {
  const { supabase, tenantId, employeeId, source, latitude, longitude, accuracyMeters, forcedType, actorType, actorId } =
    args;

  const tenantCfg = await getPresenceTenantConfig(supabase, tenantId);
  if (!tenantCfg.enabled || !tenantCfg.journeyId) {
    return { ok: false as const, error: "presence_not_enabled" };
  }

  const policy = await getPresencePolicy(supabase, tenantId);
  const breakRequired = policy?.break_required ?? true;

  const employeeCfg = await getPresenceEmployeeConfig(supabase, tenantId, employeeId);
  const scheduledStartHhmm = employeeCfg?.scheduled_start_hhmm || tenantCfg.presence.scheduled_start_hhmm;

  const { caseId, day } = await ensurePresenceDayCase({
    supabase,
    tenantId,
    employeeId,
    journeyId: tenantCfg.journeyId,
    timeZone: tenantCfg.presence.time_zone,
  });

  // last punch
  const { data: lastPunch, error: lpErr } = await supabase
    .from("time_punches")
    .select("id,type,timestamp,within_radius,distance_from_location,status")
    .eq("tenant_id", tenantId)
    .eq("case_id", caseId)
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lpErr) throw lpErr;

  const lastType = (lastPunch as any)?.type ? (String((lastPunch as any).type) as PresencePunchType) : null;
  const inferred = inferNextPunchType(lastType, breakRequired);

  if (forcedType && inferred && forcedType !== inferred) {
    return {
      ok: false as const,
      error: "invalid_sequence",
      expected: inferred,
      got: forcedType,
    };
  }

  const nextType = forcedType ?? inferred;

  if (!nextType) {
    return { ok: false as const, error: "no_next_action" };
  }

  // Geofence
  let withinRadius = true;
  let distanceFromLocation: number | null = null;
  let punchStatus: "VALID" | "VALID_WITH_EXCEPTION" | "PENDING_REVIEW" = "VALID";
  let locationName: string | null = null;

  if (policy?.presence_locations && latitude != null && longitude != null) {
    locationName = policy.presence_locations.name;
    distanceFromLocation = haversineMeters(
      { lat: latitude, lng: longitude },
      { lat: policy.presence_locations.latitude, lng: policy.presence_locations.longitude }
    );
    withinRadius = distanceFromLocation <= (policy.radius_meters ?? 100);

    if (!withinRadius) {
      punchStatus = "VALID_WITH_EXCEPTION";
      // NEVER block. Always create pendency.
      await supabase.rpc("presence_upsert_pendency", {
        p_tenant_id: tenantId,
        p_case_id: caseId,
        p_type: "outside_radius",
        p_question: `Batida fora do raio (${Math.round(distanceFromLocation)}m de ${locationName}). Envie justificativa.`,
        p_required: true,
        p_assigned_to_role: "admin",
      });

      await supabase
        .from("cases")
        .update({ state: "PENDENTE_JUSTIFICATIVA" })
        .eq("tenant_id", tenantId)
        .eq("id", caseId);
    }
  }

  // Lateness (only on ENTRY)
  if (nextType === "ENTRY") {
    const tol = policy?.lateness_tolerance_minutes ?? 10;
    const nowHm = getLocalHm(tenantCfg.presence.time_zone);
    const startHm = parseHHMM(scheduledStartHhmm);

    if (minutesOfDay(nowHm.hh, nowHm.mm) > minutesOfDay(startHm.hh, startHm.mm) + tol) {
      punchStatus = withinRadius ? "VALID_WITH_EXCEPTION" : punchStatus;

      await supabase.rpc("presence_upsert_pendency", {
        p_tenant_id: tenantId,
        p_case_id: caseId,
        p_type: "late_arrival",
        p_question: `Entrada após tolerância (+${tol} min). Envie justificativa.`,
        p_required: true,
        p_assigned_to_role: "admin",
      });

      await supabase
        .from("cases")
        .update({ state: "PENDENTE_JUSTIFICATIVA" })
        .eq("tenant_id", tenantId)
        .eq("id", caseId);

      await supabase.from("timeline_events").insert({
        tenant_id: tenantId,
        case_id: caseId,
        event_type: "late_arrival",
        actor_type: "system",
        actor_id: null,
        message: "Atraso detectado (entrada fora da tolerância).",
        meta_json: {
          tolerance_minutes: tol,
          scheduled_start_hhmm: scheduledStartHhmm,
          scheduled_start_source: employeeCfg?.scheduled_start_hhmm ? "employee" : "tenant",
        },
        occurred_at: new Date().toISOString(),
      });
    }
  }

  // Insert punch
  const { data: inserted, error: insErr } = await supabase
    .from("time_punches")
    .insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      case_id: caseId,
      type: nextType,
      latitude,
      longitude,
      accuracy_meters: accuracyMeters,
      distance_from_location: distanceFromLocation,
      within_radius: withinRadius,
      status: punchStatus,
      source,
      meta_json: {
        day,
        policy: policy
          ? {
            radius_meters: policy.radius_meters,
            lateness_tolerance_minutes: policy.lateness_tolerance_minutes,
            break_required: policy.break_required,
            allow_outside_radius: policy.allow_outside_radius,
            location_name: locationName,
          }
          : null,
        employee_config: employeeCfg
          ? {
            scheduled_start_hhmm: scheduledStartHhmm,
            scheduled_start_source: employeeCfg?.scheduled_start_hhmm ? "employee" : "tenant",
            planned_minutes: employeeCfg?.planned_minutes ?? null,
          }
          : null,
      },
    })
    .select("id,timestamp,type")
    .single();

  if (insErr) throw insErr;

  // Update state machine (happy path)
  let nextState: string | null = null;
  if (nextType === "ENTRY") nextState = "EM_EXPEDIENTE";
  if (nextType === "BREAK_START") nextState = "EM_INTERVALO";
  if (nextType === "BREAK_END") nextState = "AGUARDANDO_SAIDA";
  if (nextType === "EXIT") {
    // If break required but missing, it must be pending justification.
    if (breakRequired) {
      const { data: br, error: brErr } = await supabase
        .from("time_punches")
        .select("type")
        .eq("tenant_id", tenantId)
        .eq("case_id", caseId)
        .in("type", ["BREAK_START", "BREAK_END"])
        .limit(10);
      if (brErr) throw brErr;
      const hasStart = (br ?? []).some((r: any) => r.type === "BREAK_START");
      const hasEnd = (br ?? []).some((r: any) => r.type === "BREAK_END");

      if (!hasStart || !hasEnd) {
        await supabase.rpc("presence_upsert_pendency", {
          p_tenant_id: tenantId,
          p_case_id: caseId,
          p_type: "missing_break",
          p_question: "Intervalo obrigatório não registrado (INÍCIO e FIM). Envie justificativa.",
          p_required: true,
          p_assigned_to_role: "admin",
        });
        nextState = "PENDENTE_JUSTIFICATIVA";
      }
    }

    if (!nextState) {
      nextState = punchStatus === "VALID" ? "PENDENTE_APROVACAO" : "PENDENTE_JUSTIFICATIVA";
    }

    if (nextState === "PENDENTE_APROVACAO") {
      await supabase.rpc("presence_upsert_pendency", {
        p_tenant_id: tenantId,
        p_case_id: caseId,
        p_type: "approval_required",
        p_question: "Aprovação do gestor necessária para fechamento do dia.",
        p_required: true,
        p_assigned_to_role: "admin",
      });
    }
  }

  if (nextState) {
    await supabase
      .from("cases")
      .update({ state: nextState })
      .eq("tenant_id", tenantId)
      .eq("id", caseId);
  }

  // Audit trail
  await supabase.from("timeline_events").insert({
    tenant_id: tenantId,
    case_id: caseId,
    event_type: "presence_punch",
    actor_type: actorType,
    actor_id: actorId,
    message: `Batida registrada: ${nextType}`,
    meta_json: {
      type: nextType,
      source,
      within_radius: withinRadius,
      distance_from_location: distanceFromLocation,
      status: punchStatus,
    },
    occurred_at: new Date().toISOString(),
  });

  if (punchStatus === "VALID_WITH_EXCEPTION") {
    await supabase.from("decision_logs").insert({
      tenant_id: tenantId,
      case_id: caseId,
      agent_id: null,
      input_summary: "Registro de batida",
      output_summary: "Batida válida com exceção",
      reasoning_public: "A batida nunca é bloqueada. Quando há exceção (geofence/atraso), abrimos pendência obrigatória.",
      why_json: {
        within_radius: withinRadius,
        distance_from_location: distanceFromLocation,
        type: nextType,
      },
      confidence_json: { overall: 0.9 },
      occurred_at: new Date().toISOString(),
    });
  }

  return {
    ok: true as const,
    caseId,
    day,
    nextType,
    nextState,
    punch: {
      id: (inserted as any)?.id,
      timestamp: (inserted as any)?.timestamp,
      type: (inserted as any)?.type,
      within_radius: withinRadius,
      distance_from_location: distanceFromLocation,
      status: punchStatus,
    },
  };
}