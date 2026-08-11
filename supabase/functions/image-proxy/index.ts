import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) {
      return new Response("Missing url parameter", { status: 400, headers: corsHeaders });
    }

    // Apenas permitir domínios do Meta para evitar uso como proxy aberto
    if (!targetUrl.includes("fbcdn.net") && !targetUrl.includes("scontent") && !targetUrl.includes("instagram.com")) {
      return new Response("Forbidden domain", { status: 403, headers: corsHeaders });
    }

    const response = await fetch(targetUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const imageBlob = await response.blob();

    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", response.headers.get("Content-Type") || "image/jpeg");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(imageBlob, {
      status: 200,
      headers,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
