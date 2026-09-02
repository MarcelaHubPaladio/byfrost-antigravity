import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { xml_url } = await req.json();

    if (!xml_url) {
      throw new Error("xml_url is required");
    }

    // Try to fetch the XML to see if it's accessible
    const response = await fetch(xml_url, {
      method: "GET",
      headers: {
        "Accept": "application/xml, text/xml, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Falha ao acessar o link: o servidor retornou código ${response.status} (${response.statusText}). Verifique se o link está correto ou se exige autenticação/liberação de IP.` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Optionally check if the content-type is xml or just return success
    // We don't need to parse the whole XML just to ping if it's alive
    return new Response(
      JSON.stringify({ success: true, message: "XML is accessible" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: `Erro na comunicação: ${error.message}` }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  }
});
