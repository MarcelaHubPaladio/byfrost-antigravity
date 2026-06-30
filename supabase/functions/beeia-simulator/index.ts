import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { generateText } from "../_shared/llm.ts";
import { checkTenantAILimits, logAITokenUsage } from "../_shared/billing.ts";

serve(async (req) => {
  // 1. Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { tenant_id, session_id, message } = body;

    if (!tenant_id || !session_id || !message) {
      throw new Error("Missing tenant_id, session_id, or message");
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

    // 3. Save User Message
    const { error: insErr1 } = await supabaseAdmin
      .from("beeia_simulations")
      .insert({
        tenant_id,
        session_id,
        role: "user",
        content: message
      });

    if (insErr1) throw insErr1;

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
    llmMessages.push({
      role: "system",
      content: `${sysPrompt}\n\n[AMBIENTE DE SIMULAÇÃO] Você está conversando com o administrador do sistema que está testando suas regras. Aja exatamente como agiria com um cliente real. Se for hora de encerrar/qualificar, inclua a tag [STAGE_TRANSITION] no final da sua fala.`
    });

    history?.forEach((m) => {
      llmMessages.push({
        role: m.role as "user" | "assistant",
        content: m.content
      });
    });

    // 6. Generate Response
    const llmRes = await generateText({
      messages: llmMessages,
      fallback: () => "Ocorreu um erro no simulador."
    });

    const responseText = llmRes.text;

    if (llmRes.tokensUsed > 0) {
      await logAITokenUsage(tenant_id, llmRes.tokensUsed, `Simulador BeeIA`, llmRes.provider, supabaseAdmin);
    }

    // 7. Save Assistant Message
    const { error: insErr2 } = await supabaseAdmin
      .from("beeia_simulations")
      .insert({
        tenant_id,
        session_id,
        role: "assistant",
        content: responseText
      });

    if (insErr2) throw insErr2;

    // 8. Return response
    return new Response(JSON.stringify({ response: responseText }), {
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
