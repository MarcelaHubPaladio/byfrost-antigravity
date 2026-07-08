import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { webhook_url } = await req.json();

    if (!webhook_url) {
      throw new Error("Missing webhook_url");
    }

    const payload = {
      content: "🚀 **Ping!** A integração da *BeeIA* com este canal do Discord está configurada e funcionando perfeitamente.",
      username: "BeeIA Notificações",
      avatar_url: "https://github.com/marcelahubpaladio.png" // Placeholder or leave empty for default discord avatar
    };

    const res = await fetch(webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Discord API Error (${res.status}): ${txt}`);
    }

    return new Response(JSON.stringify({ ok: true, message: "Ping sent successfully" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
