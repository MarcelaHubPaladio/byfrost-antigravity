import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { generateText } from "../_shared/llm.ts";
import { checkTenantAILimits, logAITokenUsage } from "../_shared/billing.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const body = await req.json();
    const { tenant_id, case_ids } = body;

    if (!tenant_id || !case_ids || !Array.isArray(case_ids) || case_ids.length === 0) {
      throw new Error("Missing required fields or empty case_ids");
    }

    // Check billing limits
    try {
      await checkTenantAILimits(tenant_id, supabaseAdmin);
    } catch (err: any) {
      return new Response(JSON.stringify({ error: "Limite de Tokens atingido." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 402,
      });
    }

    let allConversationsText = "";

    // Fetch messages for each case
    for (const case_id of case_ids) {
      const { data: messages, error: msgErr } = await supabaseAdmin
        .from("wa_messages")
        .select("direction, body_text, occurred_at")
        .eq("tenant_id", tenant_id)
        .eq("case_id", case_id)
        .order("occurred_at", { ascending: true })
        .limit(100);

      if (msgErr) throw msgErr;

      const validMessages = (messages || []).filter(m => m.body_text);
      if (validMessages.length > 0) {
        allConversationsText += `\n--- CONVERSA (Case ID: ${case_id}) ---\n`;
        for (const m of validMessages) {
          const sender = m.direction === "inbound" ? "Cliente" : "Empresa/IA";
          allConversationsText += `[${sender}]: ${m.body_text}\n`;
        }
      }
    }

    if (!allConversationsText) {
      return new Response(JSON.stringify({ ok: true, count: 0, message: "No text to analyze" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build the prompt to extract learnings
    const sysPrompt = `Você é um Analista de Atendimento Sênior avaliando conversas reais entre uma empresa e seus clientes pelo WhatsApp.
Sua missão é extrair APRENDIZADOS, REGRAS DE OURO ou PADRÕES de comportamento que ocorreram nessas conversas, para que possam ser usados para treinar uma IA de atendimento (BeeIA) futuramente.

Foque nos seguintes pontos:
1. Tom de voz adequado ao negócio (ex: formal, informal, uso de emojis, uso de gírias).
2. Objeções comuns e como contorná-las (ex: preço, distância, prazo).
3. Informações frequentes de produtos ou jargões usados.

Analise as conversas abaixo e retorne um JSON array contendo entre 1 e 5 regras/aprendizados curtos, claros e diretos (como instruções).
Formato obrigatório:
[
  "Sempre usar um tom empático e usar emojis ao lidar com objeções de preço.",
  "Nunca encerrar a conversa sem antes oferecer uma alternativa de produto."
]

IMPORTANTE: 
- Retorne APENAS um JSON array válido. Não use blocos de código (markdown) e nenhuma explicação adicional.
- Se a conversa for irrelevante ou um teste simples, retorne [].`;

    const llmMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: sysPrompt },
      { role: "user", content: `Aqui estão as transcrições:\n${allConversationsText}` }
    ];

    const llmRes = await generateText({
      messages: llmMessages,
      fallback: () => "[]",
      temperature: 0.3
    });

    let extractedLearnings: string[] = [];
    try {
      // Clean up markdown just in case the LLM returned it
      let rawText = llmRes.text.trim();
      if (rawText.startsWith("\`\`\`json")) rawText = rawText.replace(/\`\`\`json/g, "");
      if (rawText.startsWith("\`\`\`")) rawText = rawText.replace(/\`\`\`/g, "");
      rawText = rawText.trim();
      
      extractedLearnings = JSON.parse(rawText);
      if (!Array.isArray(extractedLearnings)) {
        extractedLearnings = [];
      }
    } catch (e) {
      console.error("Failed to parse LLM JSON:", llmRes.text);
    }

    // Filter valid strings
    const validLearnings = extractedLearnings.filter(l => typeof l === "string" && l.length > 5);

    // Log Usage
    if (llmRes.tokensUsed > 0) {
      await logAITokenUsage(
        tenant_id,
        llmRes.tokensUsed,
        "Análise e Aprendizado de Contexto (Extração de Regras)",
        llmRes.provider,
        supabaseAdmin,
        "beeia_extract_learnings",
        undefined
      );
    }

    return new Response(JSON.stringify({ ok: true, learnings: validLearnings }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in beeia-extract-learnings:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
