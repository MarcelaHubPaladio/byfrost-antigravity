import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { generateText } from "../_shared/llm.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400, extra?: any) {
  return json({ ok: false, error: message, ...extra }, status);
}

serve(async (req) => {
  const fn = "m30-planning-ai";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return err("unauthorized", 401);
    const token = auth.slice("Bearer ".length).trim();

    const body = await req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const caseId = String(body?.caseId ?? "").trim();
    const transcription = String(body?.transcription ?? "").trim();

    if (!tenantId) return err("missing_tenantId", 400);
    if (!caseId) return err("missing_caseId", 400);
    if (!transcription) return err("missing_transcription", 400);

    const supabase = createSupabaseAdmin();

    // Verify auth
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      console.error(`[${fn}] auth.getUser failed`, { error: userErr?.message });
      return err("unauthorized", 401);
    }
    const userId = userRes.user.id;

    // Load case
    const { data: caseRow, error: caseErr } = await supabase
      .from("cases")
      .select("id,tenant_id,meta_json")
      .eq("tenant_id", tenantId)
      .eq("id", caseId)
      .maybeSingle();

    if (caseErr || !caseRow) return err("case_not_found", 404);

    const sys = 
      "Você é um estrategista de conteúdo especializado em vídeos promocionais para redes sociais. " +
      "Seu papel é ler a transcrição de uma reunião de planejamento com o cliente e extrair as seguintes informações para auxiliar na criação de roteiros:\n" +
      "1. Perfil do cliente e tom de voz desejado.\n" +
      "2. Dores e necessidades do público-alvo mencionadas.\n" +
      "3. Ideias centrais e temas principais levantados para os roteiros.\n" +
      "4. Pontos-chave, ofertas, CTAs ou objeções discutidas.\n\n" +
      "Apresente essas informações de forma clara, em tópicos estruturados, focando no que é acionável para um redator de roteiros. Seja objetivo e profissional.";

    const user = `Transcrição da reunião:\n\n${transcription}`;

    const out = await generateText({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      fallback: () => "A API de IA não está disponível no momento para gerar o resumo. Você pode usar a transcrição baseada no preenchimento manual.",
    });

    const summary = out.text.trim();

    const meta = (caseRow.meta_json as any) || {};
    const nextMeta = {
      ...meta,
      meeting_transcription: transcription,
      ai_planning_context: summary,
      ai_planning_generated_at: new Date().toISOString(),
      ai_planning_provider: out.provider,
    };

    const { error: updateErr } = await supabase
      .from("cases")
      .update({ meta_json: nextMeta })
      .eq("id", caseId);

    if (updateErr) throw updateErr;

    // Log the AI action
    const agentKey = "planning_strategist_agent"; // Using a placeholder agent key
    const { data: agent } = await supabase.from("agents").select("id").eq("key", agentKey).limit(1).maybeSingle();

    if (agent?.id) {
      await supabase.from("decision_logs").insert({
        tenant_id: tenantId,
        case_id: caseId,
        agent_id: agent.id,
        input_summary: "Gerar resumo da reunião de planejamento via IA",
        output_summary: "Resumo gerado e salvo no contexto",
        reasoning_public: summary,
        why_json: { provider: out.provider },
        confidence_json: { overall: 0.8, method: out.provider === "fallback" ? "template" : out.provider },
        occurred_at: new Date().toISOString(),
      });
    }

    // Add to timeline_events so Guardião do Negócio can read it
    await supabase.from("timeline_events").insert({
      tenant_id: tenantId,
      case_id: caseId,
      event_type: "planejamento_ai_summary",
      actor_type: "ai",
      message: `Resumo do Planejamento gerado:\n\n${summary}`,
      occurred_at: new Date().toISOString()
    });

    return json({ ok: true, summary, provider: out.provider });
  } catch (e: any) {
    console.error(`[${fn}] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
