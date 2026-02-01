import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

type ReqBody = {
  tenant_id: string;
  pendency_id: string;
  answer_text: string;
};

serve(async (req) => {
  const fn = "presence-justify";
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
    const pendencyId = String(body?.pendency_id ?? "");
    const answerText = String(body?.answer_text ?? "").trim();

    if (!tenantId || !pendencyId || !answerText) {
      return new Response("tenant_id, pendency_id and answer_text are required", { status: 400, headers: corsHeaders });
    }

    const isSuperAdmin = Boolean((user as any)?.app_metadata?.byfrost_super_admin || (user as any)?.app_metadata?.super_admin);

    if (!isSuperAdmin) {
      const { data: membership } = await supabase
        .from("users_profile")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();

      if (!membership?.user_id) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }
    }

    const { data: pend, error: pErr } = await supabase
      .from("pendencies")
      .select("id, case_id, tenant_id, type, status, required")
      .eq("id", pendencyId)
      .limit(1)
      .maybeSingle();

    if (pErr || !pend?.id) {
      console.error(`[${fn}] pendency not found`, { pErr, pendencyId });
      return new Response("Pendency not found", { status: 404, headers: corsHeaders });
    }

    if (String((pend as any).tenant_id) !== tenantId) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const caseId = String((pend as any).case_id);

    const { error: updErr } = await supabase
      .from("pendencies")
      .update({
        status: "answered",
        answered_text: answerText,
        answered_payload_json: { answered_by: user.id, answered_at: new Date().toISOString() },
      })
      .eq("id", pendencyId);

    if (updErr) {
      console.error(`[${fn}] failed to update pendency`, { updErr });
      return new Response("Failed to update pendency", { status: 500, headers: corsHeaders });
    }

    await supabase.from("timeline_events").insert({
      tenant_id: tenantId,
      case_id: caseId,
      event_type: "presence_justification_submitted",
      actor_type: "admin",
      actor_id: user.id,
      message: "Justificativa enviada pelo colaborador.",
      meta_json: { pendency_id: pendencyId, pendency_type: (pend as any).type },
      occurred_at: new Date().toISOString(),
    });

    // If no more open required pendencies, move to approval
    const { data: openRequired } = await supabase
      .from("pendencies")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("case_id", caseId)
      .eq("status", "open")
      .eq("required", true)
      .limit(1);

    const hasOpenRequired = Boolean(openRequired?.length);

    if (!hasOpenRequired) {
      await supabase.from("cases").update({ state: "PENDENTE_APROVACAO" }).eq("id", caseId);
      await supabase.from("timeline_events").insert({
        tenant_id: tenantId,
        case_id: caseId,
        event_type: "presence_ready_for_approval",
        actor_type: "system",
        actor_id: null,
        message: "Todas as pendências obrigatórias foram justificadas. Aguardando aprovação.",
        meta_json: {},
        occurred_at: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ ok: true, case_id: caseId, next_state: hasOpenRequired ? "PENDENTE_JUSTIFICATIVA" : "PENDENTE_APROVACAO" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[presence-justify] Unhandled error", { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
