import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

type Json = Record<string, any>;

type PunchType = "ENTRY" | "BREAK_START" | "BREAK_END" | "EXIT";

type PunchStatus = "VALID" | "VALID_WITH_EXCEPTION" | "PENDING_REVIEW";

type ReqBody = {
  tenant_id: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_meters?: number | null;
  // Optional: allow forcing a type (used by WhatsApp pipeline). App usually omits.
  force_type?: PunchType | null;
  source?: "APP" | "WHATSAPP";
};

function getLocalYyyyMmDdInTz(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(date); // YYYY-MM-DD
}

function parseHHMM(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function tzOffsetMs(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  const map: any = {};
  for (const p of parts) map[p.type] = p.value;

  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );

  return asUtc - date.getTime();
}

function localDateTimeToUtcIso(args: { ymd: string; hh: number; mm: number; timeZone: string }) {
  const [y, m, d] = args.ymd.split("-").map((n) => Number(n));
  const guessUtcMs = Date.UTC(y, m - 1, d, args.hh, args.mm, 0);

  // Two-pass correction
  let t = guessUtcMs;
  let off = tzOffsetMs(new Date(t), args.timeZone);
  t = guessUtcMs - off;
  off = tzOffsetMs(new Date(t), args.timeZone);
  t = guessUtcMs - off;

  return new Date(t).toISOString();
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nextPunchTypeFromLast(last: PunchType | null): PunchType | null {
  if (!last) return "ENTRY";
  if (last === "ENTRY") return "BREAK_START";
  if (last === "BREAK_START") return "BREAK_END";
  if (last === "BREAK_END") return "EXIT";
  return null; // EXIT -> no more
}

async function ensurePendency(args: {
  supabase: any;
  tenantId: string;
  caseId: string;
  type: string;
  question: string;
}) {
  const { data: existing } = await args.supabase
    .from("pendencies")
    .select("id")
    .eq("tenant_id", args.tenantId)
    .eq("case_id", args.caseId)
    .eq("type", args.type)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data, error } = await args.supabase
    .from("pendencies")
    .insert({
      tenant_id: args.tenantId,
      case_id: args.caseId,
      type: args.type,
      assigned_to_role: "admin",
      question_text: args.question,
      required: true,
      status: "open",
      due_at: null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

serve(async (req) => {
  const fn = "presence-clock";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const token = authHeader.replace("Bearer ", "").trim();

    const supabase = createSupabaseAdmin();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser(token);

    if (userErr || !user) {
      console.error(`[${fn}] auth.getUser failed`, { userErr });
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const body = (await req.json().catch(() => null)) as ReqBody | null;
    const tenantId = String(body?.tenant_id ?? "");
    if (!tenantId) return new Response("tenant_id required", { status: 400, headers: corsHeaders });

    const isSuperAdmin = Boolean((user as any)?.app_metadata?.byfrost_super_admin || (user as any)?.app_metadata?.super_admin);

    if (!isSuperAdmin) {
      const { data: membership, error: mErr } = await supabase
        .from("users_profile")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();

      if (mErr || !membership?.user_id) {
        console.warn(`[${fn}] forbidden tenant access`, { tenantId, userId: user.id, mErr });
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }
    }

    const timeZone = "America/Sao_Paulo";
    const today = getLocalYyyyMmDdInTz(new Date(), timeZone);

    // Presence feature gating: must be enabled per tenant with flags.presence_enabled=true
    const { data: presenceJourney, error: jErr } = await supabase
      .from("journeys")
      .select("id")
      .eq("key", "presence")
      .limit(1)
      .maybeSingle();

    if (jErr || !presenceJourney?.id) {
      console.error(`[${fn}] presence journey missing`, { jErr });
      return new Response("Presence journey not configured", { status: 500, headers: corsHeaders });
    }

    const { data: tenantJourney, error: tjErr } = await supabase
      .from("tenant_journeys")
      .select("id, enabled, config_json")
      .eq("tenant_id", tenantId)
      .eq("journey_id", presenceJourney.id)
      .eq("enabled", true)
      .limit(1)
      .maybeSingle();

    const presenceEnabled = Boolean((tenantJourney as any)?.config_json?.flags?.presence_enabled);
    if (tjErr || !tenantJourney?.id || !presenceEnabled) {
      return new Response("Presence not enabled for this tenant", { status: 403, headers: corsHeaders });
    }

    const scheduleStart =
      (tenantJourney as any)?.config_json?.presence?.schedule?.start_time ??
      (tenantJourney as any)?.config_json?.presence?.schedule?.scheduled_start ??
      null;

    const plannedMinutes = Number((tenantJourney as any)?.config_json?.presence?.schedule?.planned_minutes ?? 480);

    const userName =
      String((user as any)?.user_metadata?.full_name ?? "").trim() ||
      String([((user as any)?.user_metadata?.first_name ?? ""), ((user as any)?.user_metadata?.last_name ?? "")].filter(Boolean).join(" ")).trim() ||
      String(user.email ?? "Colaborador").split("@")[0];

    // Ensure day case (1 employee = 1 case/day)
    const { data: existingCase } = await supabase
      .from("cases")
      .select("id,state,status")
      .eq("tenant_id", tenantId)
      .eq("case_type", "PRESENCE_DAY")
      .eq("entity_type", "employee")
      .eq("entity_id", user.id)
      .eq("case_date", today)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    let caseId = (existingCase as any)?.id as string | null;

    if (!caseId) {
      const { data: created, error: cErr } = await supabase
        .from("cases")
        .insert({
          tenant_id: tenantId,
          journey_id: presenceJourney.id,
          case_type: "PRESENCE_DAY",
          status: "open",
          state: "AGUARDANDO_ENTRADA",
          created_by_channel: "api",
          title: userName,
          entity_type: "employee",
          entity_id: user.id,
          case_date: today,
          meta_json: {
            journey_key: "presence",
            employee_user_id: user.id,
            employee_email: user.email ?? null,
            case_date: today,
          },
        })
        .select("id")
        .single();

      if (cErr) {
        // Likely unique race; retry fetch.
        const { data: retry } = await supabase
          .from("cases")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("case_type", "PRESENCE_DAY")
          .eq("entity_type", "employee")
          .eq("entity_id", user.id)
          .eq("case_date", today)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();
        caseId = (retry as any)?.id ?? null;
      } else {
        caseId = created.id as string;
      }

      if (!caseId) {
        console.error(`[${fn}] failed to ensure day case`, { tenantId, userId: user.id });
        return new Response("Failed to create day case", { status: 500, headers: corsHeaders });
      }

      await supabase.from("timeline_events").insert({
        tenant_id: tenantId,
        case_id: caseId,
        event_type: "presence_day_case_created",
        actor_type: "system",
        actor_id: null,
        message: `Case diário de presença criado (${today}).`,
        meta_json: { case_date: today },
        occurred_at: new Date().toISOString(),
      });
    }

    // Determine next punch
    const { data: lastPunch } = await supabase
      .from("time_punches")
      .select("type")
      .eq("tenant_id", tenantId)
      .eq("case_id", caseId)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastType = (lastPunch as any)?.type ? (String((lastPunch as any).type) as PunchType) : null;
    const inferred = nextPunchTypeFromLast(lastType);

    const forced = body?.force_type ? (String(body.force_type) as PunchType) : null;
    const punchType = forced ?? inferred;

    if (!punchType) {
      return new Response(JSON.stringify({ ok: false, reason: "already_exited" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Geofence policy (optional)
    const { data: policyRow } = await supabase
      .from("presence_policies")
      .select("id,radius_meters,lateness_tolerance_minutes,break_required,allow_outside_radius,presence_locations(latitude,longitude,name)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const policy = policyRow as any;

    const lat = body?.latitude ?? null;
    const lng = body?.longitude ?? null;
    const acc = body?.accuracy_meters ?? null;

    let distanceFromLocation: number | null = null;
    let withinRadius = true;

    if (
      policy?.presence_locations?.latitude != null &&
      policy?.presence_locations?.longitude != null &&
      lat != null &&
      lng != null
    ) {
      distanceFromLocation = haversineMeters(
        { lat, lng },
        { lat: Number(policy.presence_locations.latitude), lng: Number(policy.presence_locations.longitude) }
      );
      withinRadius = distanceFromLocation <= Number(policy.radius_meters ?? 100);
    }

    let punchStatus: PunchStatus = withinRadius ? "VALID" : "VALID_WITH_EXCEPTION";

    // Create punch
    const { data: insertedPunch, error: pErr } = await supabase
      .from("time_punches")
      .insert({
        tenant_id: tenantId,
        employee_id: user.id,
        case_id: caseId,
        type: punchType,
        latitude: lat,
        longitude: lng,
        accuracy_meters: acc,
        distance_from_location: distanceFromLocation,
        within_radius: withinRadius,
        status: punchStatus,
        source: body?.source === "WHATSAPP" ? "WHATSAPP" : "APP",
        meta_json: {
          policy_id: policy?.id ?? null,
          location_name: policy?.presence_locations?.name ?? null,
        },
      })
      .select("id,timestamp")
      .single();

    if (pErr) {
      console.error(`[${fn}] failed to insert punch`, { pErr });
      return new Response("Failed to insert punch", { status: 500, headers: corsHeaders });
    }

    // State transitions
    let nextState: string | null = null;

    if (punchType === "ENTRY") nextState = "EM_EXPEDIENTE";
    if (punchType === "BREAK_START") nextState = "EM_INTERVALO";
    if (punchType === "BREAK_END") nextState = "AGUARDANDO_SAIDA";
    if (punchType === "EXIT") nextState = "PENDENTE_APROVACAO";

    let movedToJustification = false;

    // Outside radius => pending justification (never block)
    if (!withinRadius) {
      movedToJustification = true;
      await ensurePendency({
        supabase,
        tenantId,
        caseId,
        type: "outside_radius",
        question: `Batida registrada fora do raio do local (distância ~${Math.round(distanceFromLocation ?? 0)}m). Justifique.`,
      });

      await supabase.from("timeline_events").insert({
        tenant_id: tenantId,
        case_id: caseId,
        event_type: "presence_outside_radius",
        actor_type: "system",
        actor_id: null,
        message: "Batida fora do raio (registrada com exceção).",
        meta_json: { distance_meters: distanceFromLocation, radius_meters: policy?.radius_meters ?? 100 },
        occurred_at: new Date().toISOString(),
      });

      await supabase.from("decision_logs").insert({
        tenant_id: tenantId,
        case_id: caseId,
        agent_id: null,
        input_summary: "Geofence",
        output_summary: "Batida fora do raio",
        reasoning_public: "A batida nunca é bloqueada; quando fora do raio, vira exceção e cria pendência obrigatória.",
        why_json: { distance_meters: distanceFromLocation, radius_meters: policy?.radius_meters ?? 100 },
        confidence_json: { overall: 0.9 },
        occurred_at: new Date().toISOString(),
      });
    }

    // Lateness check (only for ENTRY and only if schedule exists)
    if (punchType === "ENTRY" && scheduleStart) {
      const hhmm = parseHHMM(scheduleStart);
      if (hhmm) {
        const startIso = localDateTimeToUtcIso({ ymd: today, hh: hhmm.hh, mm: hhmm.mm, timeZone });
        const tolerance = Number(policy?.lateness_tolerance_minutes ?? 10);
        const startWithTolMs = new Date(startIso).getTime() + tolerance * 60_000;
        const entryMs = new Date(insertedPunch.timestamp).getTime();

        if (entryMs > startWithTolMs) {
          movedToJustification = true;
          await ensurePendency({
            supabase,
            tenantId,
            caseId,
            type: "late_arrival",
            question: `Entrada registrada após o horário previsto (${scheduleStart}) + tolerância (${tolerance}min). Justifique.`,
          });

          await supabase.from("timeline_events").insert({
            tenant_id: tenantId,
            case_id: caseId,
            event_type: "late_arrival",
            actor_type: "system",
            actor_id: null,
            message: "Atraso detectado (registrado com pendência).",
            meta_json: { schedule_start: scheduleStart, tolerance_minutes: tolerance },
            occurred_at: new Date().toISOString(),
          });

          await supabase.from("decision_logs").insert({
            tenant_id: tenantId,
            case_id: caseId,
            agent_id: null,
            input_summary: "Tolerância de atraso",
            output_summary: "Late arrival",
            reasoning_public: "Se a entrada passar do horário previsto + tolerância, o sistema cria pendência obrigatória e move o case para justificativa.",
            why_json: { schedule_start: scheduleStart, tolerance_minutes: tolerance },
            confidence_json: { overall: 0.85 },
            occurred_at: new Date().toISOString(),
          });
        }
      }
    }

    // Break requirement when exiting
    if (punchType === "EXIT" && Boolean(policy?.break_required ?? true)) {
      const { data: all } = await supabase
        .from("time_punches")
        .select("type")
        .eq("tenant_id", tenantId)
        .eq("case_id", caseId)
        .limit(50);

      const hasBreakStart = (all ?? []).some((r: any) => r.type === "BREAK_START");
      const hasBreakEnd = (all ?? []).some((r: any) => r.type === "BREAK_END");

      if (!hasBreakStart || !hasBreakEnd) {
        movedToJustification = true;
        await ensurePendency({
          supabase,
          tenantId,
          caseId,
          type: "missing_break",
          question: "Intervalo obrigatório não identificado (BREAK_START/BREAK_END). Justifique.",
        });

        await supabase.from("timeline_events").insert({
          tenant_id: tenantId,
          case_id: caseId,
          event_type: "missing_break",
          actor_type: "system",
          actor_id: null,
          message: "Saída registrada, mas o intervalo obrigatório está ausente.",
          meta_json: { break_required: true },
          occurred_at: new Date().toISOString(),
        });
      }
    }

    const finalState = movedToJustification ? "PENDENTE_JUSTIFICATIVA" : nextState;

    if (finalState) {
      await supabase.from("cases").update({ state: finalState, status: "open" }).eq("id", caseId);
    }

    await supabase.from("timeline_events").insert({
      tenant_id: tenantId,
      case_id: caseId,
      event_type: "presence_punch",
      actor_type: "admin",
      actor_id: user.id,
      message: `Batida registrada: ${punchType}.`,
      meta_json: {
        punch_id: insertedPunch.id,
        punch_type: punchType,
        within_radius: withinRadius,
        distance_from_location: distanceFromLocation,
      },
      occurred_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        ok: true,
        case_id: caseId,
        case_date: today,
        case_state: finalState,
        punch: {
          id: insertedPunch.id,
          timestamp: insertedPunch.timestamp,
          type: punchType,
          within_radius: withinRadius,
          distance_from_location: distanceFromLocation,
          status: punchStatus,
        },
        schedule: { start_time: scheduleStart ?? null, planned_minutes: plannedMinutes },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[presence-clock] Unhandled error", { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
