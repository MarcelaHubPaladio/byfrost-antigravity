import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { generateText } from "../_shared/llm.ts";

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async (req) => {
  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const authHeader = req.headers.get("Authorization");
    const adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const supabase = createSupabaseAdmin();

    // Calculate dates: 06:00 yesterday to 05:59 today
    const now = new Date();
    // Assuming timezone is UTC-3 or we just use UTC for now? 
    // Usually edge functions run in UTC. If the user wants 6 AM local time (e.g. UTC-3), 
    // the cron should run at 9 AM UTC. 
    // Let's build the timestamps for the query.
    // We will just do: End = now, Start = now - 24 hours. Since cron runs at exactly 6 AM, this is perfect.
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

    // 1. Get all push tokens grouped by tenant
    const { data: tokensData, error: tokensErr } = await supabase
      .from("user_push_tokens")
      .select("expo_push_token, last_tenant_id")
      .not("last_tenant_id", "is", null)
      .not("expo_push_token", "is", null);

    if (tokensErr) throw tokensErr;

    const tenantsMap = new Map<string, string[]>();
    for (const t of tokensData || []) {
      const arr = tenantsMap.get(t.last_tenant_id) || [];
      arr.push(t.expo_push_token);
      tenantsMap.set(t.last_tenant_id, arr);
    }

    const results = [];

    // 2. Process each tenant
    for (const [tenantId, tokens] of tenantsMap.entries()) {
      // Fetch timeline events for this tenant in the last 24h
      const { data: events, error: eventsErr } = await supabase
        .from("tenant_events")
        .select("event_type, actor_type, message, occurred_at")
        .eq("tenant_id", tenantId)
        .gte("occurred_at", startDate.toISOString())
        .lte("occurred_at", endDate.toISOString());

      if (eventsErr) {
        console.error(`Error fetching events for tenant ${tenantId}`, eventsErr);
        continue;
      }

      if (!events || events.length === 0) {
        results.push({ tenantId, status: 'No events' });
        continue;
      }

      // 3. Generate Summary using LLM
      const prompt = `
Você é o Guardião (assiste virtual de negócios). 
Resuma os seguintes eventos que aconteceram nas últimas 24 horas em um único parágrafo curto e de alto impacto (máximo de 150 caracteres), adequado para uma Push Notification de celular. 
Destaque os sucessos ou pontos críticos, se houver.
Eventos:
${events.map(e => `- ${new Date(e.occurred_at).toLocaleTimeString()}: [${e.event_type}] ${e.message}`).join('\n')}
      `;

      try {
        const { text: summary } = await generateText({
          messages: [{ role: "user", content: prompt }],
          fallback: () => `Resumo de ontem: ${events.length} novos eventos registrados no sistema.`,
        });

        // 4. Send Push Notification via Expo
        const pushMessages = tokens.map((pushToken) => ({
          to: pushToken,
          sound: 'default',
          title: 'Guardião: Resumo do dia 🛡️',
          body: summary,
          data: { tenantId },
        }));

        const pushRes = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(pushMessages),
        });

        const pushData = await pushRes.json();
        results.push({ tenantId, pushData });
      } catch (err) {
        console.error(`Error generating/sending push for tenant ${tenantId}`, err);
        results.push({ tenantId, status: 'Error', error: String(err) });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
