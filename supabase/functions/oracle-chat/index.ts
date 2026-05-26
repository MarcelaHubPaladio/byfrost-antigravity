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

    // Fetch focus_key from database for this chat to load focused context
    const { data: chatData, error: chatErr } = await supabase
      .from("oracle_chats")
      .select("focus_key")
      .eq("id", chatId)
      .single();

    if (chatErr) throw chatErr;
    const focusKey = chatData?.focus_key || "global";

    // Fetch dynamic context based on focusKey (using a wider 90-day window to prevent missing previous months like March/April)
    const sinceDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    let contextText = `\n--- CONTEXTO ATUAL DA OPERAÇÃO (Foco: ${focusKey}) ---\n`;

    if (focusKey === "global" || focusKey === "finance") {
      // Fetch bank accounts and financial categories for mapping in memory
      const { data: bankAccounts } = await supabase
        .from("bank_accounts")
        .select("id, bank_name, account_name")
        .eq("tenant_id", tenantId);

      const { data: financialCategories } = await supabase
        .from("financial_categories")
        .select("id, name")
        .eq("tenant_id", tenantId);

      const accountMap = new Map((bankAccounts || []).map((a: any) => [a.id, `${a.bank_name} (${a.account_name})`]));
      const categoryMap = new Map((financialCategories || []).map((c: any) => [c.id, c.name]));

      const { data: finances } = await supabase
        .from("financial_transactions")
        .select("type, amount, description, transaction_date, status, source, created_at, account_id, category_id")
        .eq("tenant_id", tenantId)
        .gte("transaction_date", sinceDate.slice(0, 10))
        .order("transaction_date", { ascending: false });

      contextText += `Transações Financeiras Recentes:\n`;
      if (finances && finances.length > 0) {
        contextText += finances.map((f: any) => {
          const bank = accountMap.get(f.account_id) || 'Desconhecido';
          const cat = categoryMap.get(f.category_id) || 'Sem categoria';
          const createdStr = new Date(f.created_at).toLocaleString('pt-BR');
          return `[${f.transaction_date}] ${f.type.toUpperCase()}: R$ ${f.amount} - ${f.description} (Cat: ${cat} | Banco: ${bank} | Status: ${f.status} | Inserido em: ${createdStr} via ${f.source})`;
        }).join("\n");
      } else {
        contextText += `Nenhuma transação financeira recente encontrada.\n`;
      }
    }

    if (focusKey === "global" || focusKey === "tasks") {
      // Fetch users_profile to resolve assignments safely in memory
      const { data: profiles } = await supabase
        .from("users_profile")
        .select("user_id, display_name")
        .eq("tenant_id", tenantId);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.display_name]));

      // Query 1: Journey Tasks
      const { data: journeyTasks } = await supabase
        .from("tasks")
        .select("title, status, created_at, assigned_to_user_id")
        .eq("tenant_id", tenantId)
        .gte("created_at", sinceDate)
        .order("created_at", { ascending: false });

      // Query 2: Super Tasks (Checklists)
      const { data: superTasks } = await supabase
        .from("super_tasks")
        .select("title, is_completed, created_at, assigned_to")
        .eq("tenant_id", tenantId)
        .gte("created_at", sinceDate)
        .order("created_at", { ascending: false });

      contextText += `\nTarefas de Jornadas (Processos):\n`;
      if (journeyTasks && journeyTasks.length > 0) {
        contextText += journeyTasks.map((t: any) => `[${t.created_at.slice(0,10)}] ${t.title} - Status: ${t.status === 'done' ? 'Concluída' : 'Pendente'} (Atribuído a: ${profileMap.get(t.assigned_to_user_id) || 'Não atribuído'})`).join("\n");
      } else {
        contextText += `Nenhuma tarefa de jornada recente encontrada.\n`;
      }

      contextText += `\nChecklists Globais (Super-tarefas):\n`;
      if (superTasks && superTasks.length > 0) {
        contextText += superTasks.map((t: any) => `[${t.created_at.slice(0,10)}] ${t.title} - Status: ${t.is_completed ? 'Concluída' : 'Pendente'} (Atribuído a: ${profileMap.get(t.assigned_to) || 'Não atribuído'})`).join("\n");
      } else {
        contextText += `Nenhum checklist global recente encontrado.\n`;
      }
    }

    if (focusKey === "global") {
      const { data: events } = await supabase
        .from("timeline_events")
        .select("event_type, actor_type, message, occurred_at")
        .eq("tenant_id", tenantId)
        .gte("occurred_at", sinceDate)
        .order("occurred_at", { ascending: false });

      contextText += `\nHistórico e Eventos Recentes das Jornadas:\n`;
      if (events && events.length > 0) {
        contextText += events.map((e: any) => `[${e.occurred_at.slice(0, 16)}] ${e.actor_type} - ${e.event_type}: ${e.message}`).join("\n");
      } else {
        contextText += `Nenhum evento recente registrado nas jornadas.\n`;
      }
    }

    // UUID case (Specific Journey Focus)
    if (focusKey !== "global" && focusKey !== "finance" && focusKey !== "tasks") {
      const { data: journey } = await supabase
        .from("journeys")
        .select("name")
        .eq("id", focusKey)
        .maybeSingle();
      const journeyName = journey?.name || "Jornada Especificada";

      const { data: events } = await supabase
        .from("timeline_events")
        .select("event_type, actor_type, message, occurred_at, cases!inner(journey_id)")
        .eq("tenant_id", tenantId)
        .eq("cases.journey_id", focusKey)
        .gte("occurred_at", sinceDate)
        .order("occurred_at", { ascending: false });

      contextText += `Eventos e Histórico da Jornada [${journeyName}]:\n`;
      if (events && events.length > 0) {
        contextText += events.map((e: any) => `[${e.occurred_at}] ${e.actor_type} - ${e.event_type}: ${e.message}`).join("\n");
      } else {
        contextText += `Nenhum evento recente registrado para esta jornada.\n`;
      }
    }

    const systemPrompt = `Você é o Oráculo, um assistente virtual e consultor estratégico de negócios.
Você tem acesso ao contexto selecionado da empresa do usuário. Use os dados fornecidos no contexto abaixo para responder às perguntas do usuário com precisão, insights estratégicos e sugestões práticas.
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
      const costUsd = tokensUsed * 0.0000003;
      await supabase.from("usage_events").insert({
        tenant_id: tenantId,
        type: "ai_token",
        qty: tokensUsed,
        ref_type: "oracle_chat",
        ref_id: chatId,
        meta_json: {
          description: "Oráculo Chat: " + (message.length > 50 ? message.slice(0, 50) + "..." : message),
          cost_usd: costUsd,
          model: "gpt-4o-mini"
        }
      });

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
