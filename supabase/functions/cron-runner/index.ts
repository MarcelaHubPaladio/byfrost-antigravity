import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const JOBS_PROCESSOR_URL =
  "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/jobs-processor";

serve(async (req) => {
  const fn = "cron-runner";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    // 1) Kick job processor (best-effort)
    let jobsProcessor: any = null;
    try {
      const res = await fetch(JOBS_PROCESSOR_URL, { method: "POST" });
      jobsProcessor = {
        ok: res.ok,
        status: res.status,
        body: await res.text(),
      };
      console.log(`[${fn}] jobs-processor invoked`, { ok: res.ok, status: res.status });
    } catch (e) {
      console.warn(`[${fn}] jobs-processor invoke failed (ignored)`, { e: String(e) });
      jobsProcessor = { ok: false, error: String(e) };
    }

    // 2) Escalate overdue vendor pendencies (>4h by due_at)
    const supabase = createSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: overdue, error: oErr } = await supabase
      .from("pendencies")
      .select("id, tenant_id, case_id, due_at, question_text")
      .eq("status", "open")
      .eq("assigned_to_role", "vendor")
      .not("due_at", "is", null)
      .lt("due_at", now)
      .limit(100);

    if (oErr) {
      console.error(`[${fn}] Failed to read overdue pendencies`, { oErr });
      return new Response(JSON.stringify({ ok: false, error: "Failed to read overdue pendencies" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let escalated = 0;

    for (const p of overdue ?? []) {
      // Avoid duplicate alerts per pendency
      const { data: existing } = await supabase
        .from("alerts")
        .select("id")
        .eq("tenant_id", (p as any).tenant_id)
        .eq("status", "open")
        .contains("meta_json", { pendency_id: (p as any).id })
        .limit(1);

      if (existing?.length) continue;

      const tenantId = (p as any).tenant_id as string;
      const caseId = (p as any).case_id as string;

      const { data: leader } = await supabase
        .from("leaders")
        .select("id, phone_e164, display_name")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      await supabase.from("alerts").insert({
        tenant_id: tenantId,
        case_id: caseId,
        severity: "warn",
        title: "Pendência sem resposta > SLA",
        message: `Pendência do vendedor sem resposta após o prazo: ${(p as any).question_text}`,
        status: "open",
        created_by: "system",
        meta_json: { pendency_id: (p as any).id, due_at: (p as any).due_at },
      });

      await supabase.from("timeline_events").insert({
        tenant_id: tenantId,
        case_id: caseId,
        event_type: "pendency_escalated",
        actor_type: "system",
        message: "Pendência do vendedor estourou SLA e foi escalonada ao líder.",
        meta_json: { pendency_id: (p as any).id },
        occurred_at: new Date().toISOString(),
      });

      if (leader?.phone_e164) {
        const { data: inst } = await supabase
          .from("wa_instances")
          .select("id, phone_number")
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (inst?.id) {
          await supabase.from("wa_messages").insert({
            tenant_id: tenantId,
            instance_id: inst.id,
            direction: "outbound",
            from_phone: inst.phone_number ?? null,
            to_phone: leader.phone_e164,
            type: "text",
            body_text: `Byfrost.ia — SLA: vendedor sem resposta. Caso ${caseId}. Pendência: ${(p as any).question_text}`,
            payload_json: { kind: "sla_escalation", case_id: caseId, pendency_id: (p as any).id },
            correlation_id: `case:${caseId}`,
            occurred_at: new Date().toISOString(),
          });

          await supabase.from("usage_events").insert({
            tenant_id: tenantId,
            type: "message",
            qty: 1,
            ref_type: "wa_message",
            meta_json: { direction: "outbound", wa_type: "text", kind: "sla_escalation" },
            occurred_at: new Date().toISOString(),
          });
        }
      }

      await supabase.rpc("append_audit_ledger", {
        p_tenant_id: tenantId,
        p_payload: { kind: "pendency_escalated", pendency_id: (p as any).id, case_id: caseId },
      });

      escalated += 1;
    }

    return new Response(JSON.stringify({ ok: true, jobsProcessor, escalated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[cron-runner] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
