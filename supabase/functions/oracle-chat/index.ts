import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: any) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { chatId, message, tenantId } = body;

    if (!chatId || !message || !tenantId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Insert the user message
    const { error: insertErr } = await supabase.from("oracle_messages").insert({
      chat_id: chatId,
      role: "user",
      content: message
    });

    if (insertErr) throw insertErr;

    // Touch the chat
    await supabase.from("oracle_chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);

    // Fetch chat history
    const { data: messages } = await supabase
      .from("oracle_messages")
      .select("role, content")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    // Fetch dynamic context
    const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: finances } = await supabase
      .from("financial_transactions")
      .select("type, amount, description, transaction_date, status")
      .eq("tenant_id", tenantId)
      .gte("transaction_date", sinceDate.slice(0, 10))
      .order("transaction_date", { ascending: false })
      .limit(50);

    const { data: tasks } = await supabase
      .from("tasks")
      .select("title, status, created_at, assigned_to_role")
      .eq("tenant_id", tenantId)
      .gte("created_at", sinceDate)
      .order("created_at", { ascending: false })
      .limit(50);

    let contextText = `\n--- CONTEXTO ATUAL DA OPERAÇÃO ---\n`;
    contextText += `Transações Financeiras Recentes:\n`;
    if (finances && finances.length > 0) {
      contextText += finances.map((f: any) => `[${f.transaction_date}] ${f.type.toUpperCase()}: R$ ${f.amount} - ${f.description} (${f.status})`).join("\n");
    } else {
      contextText += `Nenhuma transação financeira recente encontrada.\n`;
    }

    contextText += `\nTarefas Recentes:\n`;
    if (tasks && tasks.length > 0) {
      contextText += tasks.map((t: any) => `[${t.created_at.slice(0,10)}] ${t.title} - Status: ${t.status}`).join("\n");
    } else {
      contextText += `Nenhuma tarefa recente encontrada.\n`;
    }

    const systemPrompt = `Você é o Oráculo, um assistente virtual e consultor estratégico de negócios.
Você tem acesso ao contexto financeiro e operacional da empresa do usuário. Use os dados fornecidos no contexto abaixo para responder às perguntas do usuário com precisão, insights estratégicos e sugestões práticas.
Se o usuário perguntar sobre algo que não está no contexto, informe educadamente o que você consegue ver.
Responda de forma clara, amigável e profissional, usando formatação markdown quando apropriado.

${contextText}
`;

    // Prepare messages for OpenAI
    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...(messages || []).map((m: any) => ({ role: m.role, content: m.content }))
    ];

    // Call OpenAI
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY is missing");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: aiMessages,
        temperature: 0.7,
        max_tokens: 1500
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenAI error: ${res.status} ${txt}`);
    }

    const json = await res.json();
    const replyContent = json.choices?.[0]?.message?.content ?? "Não foi possível gerar uma resposta.";
    const tokensUsed = json.usage?.total_tokens || 1000;

    // Save AI response
    await supabase.from("oracle_messages").insert({
      chat_id: chatId,
      role: "assistant",
      content: replyContent
    });

    // Update usage counters (similar to jobs-processor)
    if (tokensUsed > 0) {
      const periodStart = new Date();
      periodStart.setDate(1);
      const periodStartDate = periodStart.toISOString().slice(0, 10);
  
      const { data: counter } = await supabase
        .from("usage_counters")
        .select("id, metrics_json")
        .eq("tenant_id", tenantId)
        .eq("period_start", periodStartDate)
        .maybeSingle();
  
      if (counter) {
        const currentTokens = Number((counter.metrics_json as any)?.ai_tokens || 0);
        await supabase
          .from("usage_counters")
          .update({
            metrics_json: { ...counter.metrics_json, ai_tokens: currentTokens + tokensUsed }
          })
          .eq("id", counter.id);
      } else {
        const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);
        const periodEndDate = periodEnd.toISOString().slice(0, 10);
        await supabase
          .from("usage_counters")
          .insert({
            tenant_id: tenantId,
            period_start: periodStartDate,
            period_end: periodEndDate,
            metrics_json: { ai_tokens: tokensUsed }
          });
      }
    }

    return new Response(JSON.stringify({ reply: replyContent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Oracle Chat Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
