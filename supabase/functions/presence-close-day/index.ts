import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

type ReqBody = {
  tenant_id: string;
  case_id: string;
};

type PunchRow = {
  type: "ENTRY" | "BREAK_START" | "BREAK_END" | "EXIT";
  timestamp: string;
};

function diffMinutes(aIso: string, bIso: string) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.max(0, Math.round((b - a) / 60000));
}

serve(async (req) => {
  const fn = "presence-close-day";
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
    const caseId = String(body?.case_id ?? "");
    if (!tenantId || !caseId) return new Response("tenant_id and case_id required", { status: 400, headers: corsHeaders });

    const isSuperAdmin = Boolean((user as any)?.app_metadata?.byfrost_super_admin || (user as any)?.app_metadata?.super_admin);

    let role: string | null = null;
    if (!isSuperAdmin) {
      const { data: membership } = await supabase
        .from("users_profile")
        .select("role")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      role = (membership as any)?.role ?? null;

      if (!role) return new Response("Forbidden", { status: 403, headers: corsHeaders });

      const allowed = new Set(["admin", "manager", "supervisor", "leader"]);
      if (!allowed.has(String(role))) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }
    }

    // Feature gating
    const { data: presenceJourney } = await supabase.from("journeys").select("id").eq("key", "presence").limit(1).maybeSingle();
    if (!presenceJourney?.id) return new Response("Presence journey missing", { status: 500, headers: corsHeaders });

    const { data: tenantJourney } = await supabase
      .from("tenant_journeys")
      .select("id, enabled, config_json")
      .eq("tenant_id", tenantId)
      .eq("journey_id", presenceJourney.id)
      .eq("enabled", true)
      .limit(1)
      .maybeSingle();

    const presenceEnabled = Boolean((tenantJourney as any)?.config_json?.flags?.presence_enabled);
    if (!tenantJourney?.id || !presenceEnabled) {
      return new Response("Presence not enabled for this tenant", { status: 403, headers: corsHeaders });
    }

    const plannedMinutes = Number((tenantJourney as any)?.config_json?.presence?.schedule?.planned_minutes ?? 480);

    const { data: c, error: cErr } = await supabase
      .from("cases")
      .select("id, tenant_id, case_type, entity_id, state")
      .eq("id", caseId)
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();

    if (cErr || !c?.id) return new Response("Case not found", { status: 404, headers: corsHeaders });
    if (String((c as any).case_type) !== "PRESENCE_DAY") return new Response("Not a presence case", { status: 400, headers: corsHeaders });

    const employeeId = String((c as any).entity_id ?? "");
    if (!employeeId) return new Response("Case missing employee", { status: 400, headers: corsHeaders });

    const { data: policy } = await supabase
      .from("presence_policies")
      .select("break_required")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const breakRequired = Boolean((policy as any)?.break_required ?? true);

    const { data: punches, error: pErr } = await supabase
      .from("time_punches")
      .select("type,timestamp")
      .eq("tenant_id", tenantId)
      .eq("case_id", caseId)
      .order("timestamp", { ascending: true })
      .limit(100);

    if (pErr) return new Response("Failed to load punches", { status: 500, headers: corsHeaders });

    const list = (punches ?? []) as any as PunchRow[];

    const entry = list.find((x) => x.type === "ENTRY")?.timestamp ?? null;
    const exit = [...list].reverse().find((x) => x.type === "EXIT")?.timestamp ?? null;

    if (!entry) return new Response("Missing ENTRY", { status: 400, headers: corsHeaders });
    if (!exit) return new Response("Missing EXIT", { status: 400, headers: corsHeaders });

    const breakStart = list.find((x) => x.type === "BREAK_START")?.timestamp ?? null;
    const breakEnd = list.find((x) => x.type === "BREAK_END")?.timestamp ?? null;

    if (breakRequired && (!breakStart || !breakEnd)) {
      return new Response("Missing required break (BREAK_START/BREAK_END)", { status: 400, headers: corsHeaders });
    }

    const workedMinutes = breakStart && breakEnd
      ? diffMinutes(entry, breakStart) + diffMinutes(breakEnd, exit)
      : diffMinutes(entry, exit);

    const delta = workedMinutes - plannedMinutes;

    const { data: lastLedger } = await supabase
      .from("bank_hour_ledger")
      .select("balance_after")
      .eq("tenant_id", tenantId)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevBalance = Number((lastLedger as any)?.balance_after ?? 0);
    const balanceAfter = prevBalance + delta;

    await supabase.from("bank_hour_ledger").insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      case_id: caseId,
      minutes_delta: delta,
      balance_after: balanceAfter,
      source: "AUTO",
    });

    await supabase.from("cases").update({ state: "FECHADO", status: "closed" }).eq("id", caseId);

    await supabase.from("timeline_events").insert({
      tenant_id: tenantId,
      case_id: caseId,
      event_type: "presence_day_closed",
      actor_type: "admin",
      actor_id: user.id,
      message: `Dia fechado. Trabalhado: ${workedMinutes}min • Previsto: ${plannedMinutes}min • Δ: ${delta}min.`,
      meta_json: { worked_minutes: workedMinutes, planned_minutes: plannedMinutes, minutes_delta: delta, balance_after: balanceAfter },
      occurred_at: new Date().toISOString(),
    });

    await supabase.from("decision_logs").insert({
      tenant_id: tenantId,
      case_id: caseId,
      agent_id: null,
      input_summary: "Fechamento do dia",
      output_summary: "Lançamento de banco de horas criado",
      reasoning_public: "Ao fechar, calculamos minutos trabalhados (entrada→intervalo + volta→saída) e lançamos o delta no ledger (imutável).",
      why_json: { worked_minutes: workedMinutes, planned_minutes: plannedMinutes, minutes_delta: delta },
      confidence_json: { overall: 0.9 },
      occurred_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ ok: true, case_id: caseId, worked_minutes: workedMinutes, planned_minutes: plannedMinutes, minutes_delta: delta, balance_after: balanceAfter }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[presence-close-day] Unhandled error", { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
