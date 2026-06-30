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
    const { tenant_id, session_id, case_id, message, action, hours_limit } = body;

    if (!tenant_id || (!session_id && !case_id) || (!message && action !== "evaluate_session")) {
      throw new Error("Missing required fields");
    }

    // 2. Fetch System Prompt
    const { data: config, error: cfgErr } = await supabaseAdmin
      .from("beeia_configs")
      .select("system_prompt, target_stage")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (cfgErr) throw cfgErr;
    let sysPrompt = config?.system_prompt || "Você é a BeeIA, assistente virtual.";

    // 2a. Fetch Learnings
    const { data: learnings, error: lrnErr } = await supabaseAdmin
      .from("beeia_learnings")
      .select("learning_text")
      .eq("tenant_id", tenant_id);
    
    if (!lrnErr && learnings && learnings.length > 0) {
      sysPrompt += "\n\n[REGRAS APRENDIDAS EM TREINAMENTOS ANTERIORES]:\n";
      learnings.forEach((l, i) => {
        sysPrompt += `${i + 1}. ${l.learning_text}\n`;
      });
    }



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
      
      if (session_id) {
        const { error: insErr1 } = await supabaseAdmin
          .from("beeia_simulations")
          .insert({
            tenant_id,
            session_id,
            role: isTrainer ? "system" : "user",
            content: isTrainer ? `[MENSAGEM DO SEU TREINADOR]: ${message}` : message
          });
        if (insErr1) throw insErr1;
      } else if (case_id) {
        // Save as system_note in wa_messages so it appears in chat but doesn't get sent to Z-API
        const { error: insErrCase } = await supabaseAdmin
          .from("wa_messages")
          .insert({
            tenant_id,
            case_id,
            direction: "inbound",
            type: "system_note",
            from_phone: "system",
            to_phone: "system",
            body_text: isTrainer ? `[MENSAGEM DO SEU TREINADOR]: ${message}` : message,
            payload_json: {},
            occurred_at: new Date().toISOString()
          });
        if (insErrCase) throw insErrCase;
      }
    }

    // 4. Fetch History
    let history: { role: string; content: string }[] = [];
    if (session_id) {
      const { data: hist, error: histErr } = await supabaseAdmin
        .from("beeia_simulations")
        .select("role, content")
        .eq("tenant_id", tenant_id)
        .eq("session_id", session_id)
        .order("created_at", { ascending: true })
        .limit(30);
      if (histErr) throw histErr;
      history = (hist ?? []).map(h => ({ role: h.role, content: h.content }));
    } else if (case_id) {
      let q = supabaseAdmin
        .from("wa_messages")
        .select("direction, type, body_text")
        .eq("tenant_id", tenant_id)
        .eq("case_id", case_id);
        
      if (hours_limit) {
        const minDate = new Date(Date.now() - Number(hours_limit) * 60 * 60 * 1000).toISOString();
        q = q.gte("occurred_at", minDate);
      }

      const { data: hist, error: histErr } = await q
        .order("occurred_at", { ascending: true })
        .limit(100); // Increased limit since we rely on time window now
      if (histErr) throw histErr;
      
      history = (hist ?? [])
        .filter(m => (m.type === "text" || m.type === "system_note") && m.body_text)
        .map(h => ({
          role: h.type === "system_note" ? "system" : (h.direction === "inbound" ? "user" : "assistant"),
          content: h.body_text!
        }));
    }

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
          content: `Responda agora diretamente ao seu treinador/auditor (que mandou a mensagem acima).
REGRAS OBRIGATÓRIAS:
1. Se a mensagem ACIMA do treinador for uma AUTORIZAÇÃO para salvar uma regra (ex: "sim", "pode salvar", "manda bala", "isso mesmo"), VOCÊ NÃO DEVE PERGUNTAR NOVAMENTE. Apenas confirme que salvou e OBRIGATORIAMENTE inclua a tag [SAVE_LEARNING: escreva a regra aqui] no final da sua resposta.
2. Se a mensagem ACIMA do treinador for uma correção nova ou bronca, elabore uma regra curta sobre o que você aprendeu e PERGUNTE textualmente: "Posso salvar no meu aprendizado a seguinte instrução: [sua regra]?".
Siga estas regras rigorosamente.`
        });
      }
    }

    // 6. Generate Response
    const llmRes = await generateText({
      messages: llmMessages,
      fallback: () => "Ocorreu um erro no simulador."
    });

    let responseText = llmRes.text;
    
    // Check for SAVE_LEARNING tag
    const saveMatch = responseText.match(/\[SAVE_LEARNING:\s*([^\]]+)\]/i);
    if (saveMatch && saveMatch[1]) {
      const learningText = saveMatch[1].trim();
      // Insert into beeia_learnings
      await supabaseAdmin.from("beeia_learnings").insert({
        tenant_id,
        learning_text: learningText
      });
      // Optionally clean the tag from the UI response
      responseText = responseText.replace(/\[SAVE_LEARNING:\s*[^\]]+\]/i, "\n\n*(✅ Aprendizado salvo na sua base de treinamento!)*");
    }

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

    // 7. Save Assistant Response
    if (action !== "evaluate_session") {
      if (session_id) {
        await supabaseAdmin.from("beeia_simulations").insert({
          tenant_id,
          session_id,
          role: "assistant",
          content: responseText
        });
      } else if (case_id) {
        const { error: insErr } = await supabaseAdmin.from("wa_messages").insert({
          tenant_id,
          case_id,
          direction: "inbound", // use inbound so it acts as internal note
          type: "system_note",
          from_phone: "system",
          to_phone: "system",
          body_text: responseText,
          payload_json: {},
          occurred_at: new Date().toISOString()
        });
        if (insErr) throw insErr;
      }
    } else {
      if (session_id) {
        await supabaseAdmin.from("beeia_simulations").insert({
          tenant_id,
          session_id,
          role: "system",
          content: "AUTO-AVALIAÇÃO DA IA: " + responseText
        });
      } else if (case_id) {
        const { error: insErr } = await supabaseAdmin.from("wa_messages").insert({
          tenant_id,
          case_id,
          direction: "inbound", // use inbound so it acts as internal note
          type: "system_note",
          from_phone: "system",
          to_phone: "system",
          body_text: "AUTO-AVALIAÇÃO DA IA: " + responseText,
          payload_json: {},
          occurred_at: new Date().toISOString()
        });
        if (insErr) throw insErr;
      }
    }

    // 8. Return response
    return new Response(JSON.stringify({ 
      ok: true, 
      response: responseText, 
      tokensUsed: llmRes.tokensUsed 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in beeia-simulator:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
