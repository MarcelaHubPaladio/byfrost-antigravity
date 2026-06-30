import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { generateText } from "../_shared/llm.ts";
import { checkTenantAILimits, logAITokenUsage } from "../_shared/billing.ts";

serve(async (req) => {
  // 1. Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const body = await req.json();
    const { tenant_id, session_id, message, action } = body;

    if (!tenant_id || !session_id || (!message && action !== "evaluate_session")) {
      throw new Error("Missing required fields");
    }

    // 2. Fetch System Prompt
    const { data: config, error: cfgErr } = await supabaseAdmin
      .from("beeia_configs")
      .select("system_prompt, target_stage")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (cfgErr) throw cfgErr;
    const sysPrompt = config?.system_prompt || "Você é a BeeIA, assistente virtual.";

    // 2b. Check limits
    try {
      await checkTenantAILimits(tenant_id, supabaseAdmin);
    } catch (err: any) {
      return new Response(JSON.stringify({ error: "Limite de Tokens do seu plano atingido." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 402,
      });
    }

    // 3. Save User Message if not evaluating
    if (action !== "evaluate_session") {
      const isTrainer = action === "trainer_message";
      const { error: insErr1 } = await supabaseAdmin
        .from("beeia_simulations")
        .insert({
          tenant_id,
          session_id,
          role: isTrainer ? "system" : "user",
          content: isTrainer ? `[MENSAGEM DO SEU TREINADOR]: ${message}` : message
        });

      if (insErr1) throw insErr1;
    }

    // 4. Fetch History
    const { data: history, error: histErr } = await supabaseAdmin
      .from("beeia_simulations")
      .select("role, content")
      .eq("tenant_id", tenant_id)
      .eq("session_id", session_id)
      .order("created_at", { ascending: true })
      .limit(20);

    if (histErr) throw histErr;

    // 5. Prepare LLM Context
    const llmMessages: { role: "system" | "user" | "assistant"; content: string }[] = [];
    
    if (action === "evaluate_session") {
      // In evaluation mode, we feed the history first, then ask it to evaluate.
      history?.forEach((m) => {
        llmMessages.push({
          role: m.role as "user" | "assistant" | "system",
          content: m.content
        });
      });
      llmMessages.push({
        role: "user",
        content: `Aja como um auditor sênior de IA analisando a sua própria performance.
        Aqui estão as regras originais do seu prompt:
        "${sysPrompt}"
        
        Leia a conversa acima e liste 1 acerto claro e 1 erro/ponto de melhoria crítico que você cometeu na sua performance de qualificação comercial, comparado às regras originais. Seja direto, crítico e altamente analítico.`
      });
    } else {
      llmMessages.push({
        role: "system",
        content: `${sysPrompt}\n\n[AMBIENTE DE SIMULAÇÃO] Você está conversando com o administrador do sistema que está testando suas regras. Aja exatamente como agiria com um cliente real. Se for hora de encerrar/qualificar, inclua a tag [STAGE_TRANSITION] no final da sua fala.`
      });
      history?.forEach((m) => {
        llmMessages.push({
          role: m.role as "user" | "assistant" | "system",
          content: m.content
        });
      });
      if (action === "trainer_message") {
        llmMessages.push({
          role: "system",
          content: "Responda agora diretamente ao seu treinador/auditor (que acabou de mandar a mensagem acima). Agradeça o feedback e explique brevemente como você vai aplicar essa correção daqui pra frente."
        });
      }
    }

    // 6. Generate Response
    const llmRes = await generateText({
      messages: llmMessages,
      fallback: () => "Ocorreu um erro no simulador."
    });

    const responseText = llmRes.text;

    if (llmRes.tokensUsed > 0) {
      await logAITokenUsage(
        tenant_id, 
        llmRes.tokensUsed, 
        action === "evaluate_session" ? `Auto-Avaliação da Simulação BeeIA` : `Simulador BeeIA`, 
        llmRes.provider, 
        supabaseAdmin, 
        action === "evaluate_session" ? "beeia_simulator_eval" : "beeia_simulator", 
        session_id
      );
    }

    // 7. Save Assistant/System Message
    const isEvalOrTrainer = action === "evaluate_session" || action === "trainer_message";
    const { error: insErr2 } = await supabaseAdmin
      .from("beeia_simulations")
      .insert({
        tenant_id,
        session_id,
        role: isEvalOrTrainer ? "system" : "assistant",
        content: action === "evaluate_session" ? "AUTO-AVALIAÇÃO DA IA:\n\n" + responseText : responseText
      });

    if (insErr2) throw insErr2;

    // 8. Return response
    return new Response(JSON.stringify({ response: responseText, tokensUsed: llmRes.tokensUsed || 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error in beeia-simulator:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
