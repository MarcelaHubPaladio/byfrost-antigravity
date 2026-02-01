import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

type Answer = { pendencyId: string; answerText: string };

serve(async (req) => {
  const fn = "presence-justify";

  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
    if (!token) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!url || !anonKey) {
      console.error(`[${fn}] Missing env`, { hasUrl: Boolean(url), hasAnon: Boolean(anonKey) });
      return new Response("Server misconfigured", { status: 500, headers: corsHeaders });
    }

    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: u, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !u?.user?.id) {
      console.error(`[${fn}] auth.getUser failed`, { uErr });
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const caseId = String(body?.caseId ?? "").trim();
    const answers = (Array.isArray(body?.answers) ? body.answers : []) as Answer[];

    if (!tenantId || !caseId) {
      return new Response(JSON.stringify({ ok: false, error: "tenantId_and_caseId_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update provided answers (best-effort)
    for (const a of answers) {
      const id = String(a?.pendencyId ?? "").trim();
      const ans = String(a?.answerText ?? "").trim();
      if (!id || !ans) continue;

      const { error } = await supabase
        .from("pendencies")
        .update({ status: "answered", answered_text: ans })
        .eq("id", id)
        .eq("case_id", caseId);

      if (error) {
        console.warn(`[${fn}] Failed to update pendency`, { id, error });
      }
    }

    const { data: open, error: openErr } = await supabase
      .from("pendencies")
      .select("id,required,status")
      .eq("case_id", caseId)
      .eq("status", "open")
      .limit(500);

    if (openErr) {
      console.error(`[${fn}] Failed to load open pendencies`, { openErr });
      return new Response(JSON.stringify({ ok: false, error: "pendencies_lookup_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requiredOpen = (open ?? []).some((p: any) => Boolean(p.required));

    if (!requiredOpen) {
      // Ensure an approval pendency exists (governance: human approval/close)
      try {
        await supabase.rpc("presence_upsert_pendency", {
          p_tenant_id: tenantId,
          p_case_id: caseId,
          p_type: "approval_required",
          p_question: "Aprovação do gestor necessária para fechamento do dia.",
          p_required: true,
          p_assigned_to_role: "admin",
        });
      } catch (e) {
        console.warn(`[${fn}] presence_upsert_pendency failed (ignored)`, { e: String(e) });
      }

      const { error: updErr } = await supabase
        .from("cases")
        .update({ state: "PENDENTE_APROVACAO" })
        .eq("tenant_id", tenantId)
        .eq("id", caseId);

      if (updErr) {
        console.error(`[${fn}] Failed to update case state`, { updErr });
        return new Response(JSON.stringify({ ok: false, error: "case_update_failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("timeline_events").insert({
        tenant_id: tenantId,
        case_id: caseId,
        event_type: "presence_justification_sent",
        actor_type: "admin",
        actor_id: u.user.id,
        message: "Justificativas enviadas pelo colaborador.",
        meta_json: {},
        occurred_at: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ ok: true, requiredOpen }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[presence-justify] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});