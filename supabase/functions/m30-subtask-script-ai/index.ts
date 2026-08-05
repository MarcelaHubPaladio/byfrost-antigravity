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
  const fn = "m30-subtask-script-ai";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return err("unauthorized", 401);
    const token = auth.slice("Bearer ".length).trim();

    const body = await req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const caseId = String(body?.caseId ?? "").trim();
    const briefing = String(body?.briefing ?? "").trim();
    const planningContext = String(body?.planningContext ?? "").trim();
    const title = String(body?.title ?? "").trim();

    if (!tenantId) return err("missing_tenantId", 400);

    const supabase = createSupabaseAdmin();

    // Verify auth
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      console.error(`[${fn}] auth.getUser failed`, { error: userErr?.message });
      return err("unauthorized", 401);
    }
    const userId = userRes.user.id;

    const sys = 
      "Você é um roteirista especializado em vídeos curtos e dinâmicos (estilo Reels/TikTok) para empresas e influenciadores. " +
      "Crie um roteiro utilizando as instruções do Briefing, o Título do vídeo e o Contexto Geral fornecido.\n\n" +
      "VOCÊ DEVE OBRIGATORIAMENTE RETORNAR O TEXTO EXATAMENTE NA SEGUINTE ESTRUTURA, SEM NENHUM TEXTO ADICIONAL ANTES OU DEPOIS:\n\n" +
      "Gancho: [Escreva o gancho impactante aqui]\n" +
      "Frase 1: [Escreva a frase 1 aqui]\n" +
      "Frase 2: [Escreva a frase 2 aqui]\n" +
      "Frase 3: [Escreva a frase 3 aqui]\n" +
      "Frase 4: [Escreva a frase 4 aqui]\n" +
      "Cta: [Escreva a chamada para ação aqui]";

    let userContent = "Contexto Geral do Planejamento:\n" + (planningContext || "Sem contexto geral") + "\n\n";
    userContent += "Título do Vídeo:\n" + (title || "Não especificado") + "\n\n";
    userContent += "Briefing Específico desta Pauta (Instruções e Notas):\n" + (briefing || "Gere uma ideia genérica baseada no contexto.");

    const out = await generateText({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userContent },
      ],
      fallback: () => "Gancho: Como perder o medo de falhar?\nFrase 1: Comece pequeno e celebre vitórias.\nFrase 2: A falha é um feedback, não um fim.\nFrase 3: Ajuste a rota com calma.\nFrase 4: Não deixe o perfeccionismo travar você.\nCta: Curte se isso ajudou!",
    });

    const script = out.text.trim();

    if (caseId) {
      const agentKey = "script_writer_agent"; // Using a placeholder agent key
      const { data: agent } = await supabase.from("agents").select("id").eq("key", agentKey).limit(1).maybeSingle();

      if (agent?.id) {
        await supabase.from("decision_logs").insert({
          tenant_id: tenantId,
          case_id: caseId,
          agent_id: agent.id,
          input_summary: "Gerar roteiro da pauta via IA M30",
          output_summary: "Roteiro gerado",
          reasoning_public: script,
          why_json: { provider: out.provider },
          confidence_json: { overall: 0.9, method: out.provider === "fallback" ? "template" : out.provider },
          occurred_at: new Date().toISOString(),
        });
      }
    }

    return json({ ok: true, script, provider: out.provider });
  } catch (e: any) {
    console.error(`[${fn}] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
