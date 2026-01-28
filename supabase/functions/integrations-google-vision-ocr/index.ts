import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchAsBase64 } from "../_shared/crypto.ts";

serve(async (req) => {
  const fn = "integrations-google-vision-ocr";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY") ?? "";
    if (!apiKey) {
      console.warn(`[${fn}] Missing GOOGLE_VISION_API_KEY`);
      return new Response(JSON.stringify({ ok: false, error: "Missing GOOGLE_VISION_API_KEY" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body) return new Response("Invalid JSON", { status: 400, headers: corsHeaders });

    const imageUrl = body.imageUrl as string | undefined;
    const imageBase64 = body.imageBase64 as string | undefined;

    if (!imageUrl && !imageBase64) {
      return new Response(JSON.stringify({ ok: false, error: "Provide imageUrl or imageBase64" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = imageBase64 ?? (await fetchAsBase64(imageUrl!));

    const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;

    const visionReq = {
      requests: [
        {
          image: { content },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(visionReq),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      console.error(`[${fn}] Vision API error`, { status: res.status, json });
      return new Response(JSON.stringify({ ok: false, status: res.status, json }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const annotation = json?.responses?.[0]?.fullTextAnnotation;
    const text = annotation?.text ?? "";

    return new Response(
      JSON.stringify({ ok: true, text, blocks: annotation?.pages ?? [], raw: json?.responses?.[0] ?? json }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(`[integrations-google-vision-ocr] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
