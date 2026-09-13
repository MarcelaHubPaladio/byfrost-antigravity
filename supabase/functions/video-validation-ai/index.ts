import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-requested-with, prefer",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function createSupabaseAdmin(token?: string) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = token ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or token");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, originalStatus = 400, extra?: any) {
  // Always return 200 so the frontend gets the JSON payload instead of an opaque 500 exception.
  return json({ ok: false, error: message, originalStatus, ...extra }, 200);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const body = await req.json().catch(() => null);
    const { validationId, roteiro, tenantId, caseId, subtaskId, videoPath, videoUrl } = body || {};

    if (!videoUrl || !videoPath || !validationId) {
      return err("missing_parameters", 400);
    }

    const supabase = createSupabaseAdmin();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    
    if (!apiKey) {
      return err("gemini_api_key_not_configured", 500);
    }

    console.log(`Processing validation ${validationId} for video ${videoPath}`);

    // Update status to processing
    await supabase.from('video_validations').update({ status: 'processing' }).eq('id', validationId);

    // Download the video from Storage
    const { data: videoData, error: downloadError } = await supabase
      .storage
      .from('video_validations')
      .download(videoPath);

    if (downloadError || !videoData) {
      console.error("Failed to download video:", downloadError);
      await supabase.from('video_validations').update({ status: 'failed' }).eq('id', validationId);
      return err("failed_to_download_video", 500);
    }

    console.log(`Video downloaded, size: ${videoData.size} bytes`);
    
    // Upload to Gemini File API using simple upload (limit 2GB)
    const mimeType = videoData.type || 'video/mp4';
    const uploadRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "raw",
        "X-Goog-Upload-Command": "start, upload, finalize",
        "X-Goog-Upload-Header-Content-Length": String(videoData.size),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": mimeType,
      },
      body: videoData
    });

    if (!uploadRes.ok) {
      const txt = await uploadRes.text();
      console.error("Gemini upload failed", txt);
      await supabase.from('video_validations').update({ status: 'failed' }).eq('id', validationId);
      return err("gemini_upload_failed", 500);
    }

    const fileInfo = await uploadRes.json();
    const fileUri = fileInfo.file.uri;
    const fileName = fileInfo.file.name;
    
    console.log(`Gemini File uploaded: ${fileUri}`);

    // Wait for the video to be processed by Gemini (it needs to be ACTIVE)
    let state = "PROCESSING";
    let attempts = 0;
    while (state === "PROCESSING" && attempts < 10) {
      await new Promise(r => setTimeout(r, 4000));
      const statusRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
      const statusInfo = await statusRes.json();
      state = statusInfo.state;
      console.log(`File state: ${state}`);
      attempts++;
    }

    if (state !== "ACTIVE") {
      console.error("File didn't reach ACTIVE state within timeout", state);
      await supabase.from('video_validations').update({ status: 'failed' }).eq('id', validationId);
      return err("gemini_file_processing_timeout", 500);
    }

    // Call generateContent
    const prompt = `Você é um avaliador rigoroso de vídeos (Guardião Byfrost).
O roteiro do vídeo é:
"""${roteiro || "Sem roteiro fornecido"}"""

Assista ao vídeo e avalie:
1. Gancho (Hook): É impactante e bate com o roteiro?
2. Áudio/Vídeo: A qualidade está boa? Tem oscilações de volume?
3. CTA: A chamada para ação está clara no final?

VOCÊ DEVE OBRIGATORIAMENTE RETORNAR O TEXTO EXATAMENTE NA SEGUINTE ESTRUTURA JSON:
{
  "score": <nota de 0 a 100>,
  "recommendation": "<recomendacao geral em uma frase>",
  "details": [
    { "topic": "Gancho (Hook)", "status": "approved|needs_adjustment", "note": "..." },
    { "topic": "Áudio/Vídeo", "status": "approved|needs_adjustment", "note": "..." },
    { "topic": "CTA", "status": "approved|needs_adjustment", "note": "..." }
  ]
}
Não inclua crases \`\`\`json no retorno, apenas o objeto JSON.`;

    const generateRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { fileData: { mimeType: fileInfo.file.mimeType, fileUri } },
            { text: prompt }
          ]
        }]
      })
    });

    if (!generateRes.ok) {
      const txt = await generateRes.text();
      console.error("Gemini generateContent failed", txt);
      await supabase.from('video_validations').update({ status: 'failed' }).eq('id', validationId);
      return err("gemini_generate_failed", 500);
    }

    const genData = await generateRes.json();
    let textOut = genData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    textOut = textOut.replace(/```json/g, "").replace(/```/g, "").trim();

    let aiResponse;
    try {
      aiResponse = JSON.parse(textOut);
    } catch (e) {
      console.error("Failed to parse Gemini JSON", textOut);
      aiResponse = { score: 70, recommendation: "Não foi possível estruturar a resposta da IA.", details: [] };
    }

    console.log("Validation complete:", aiResponse.score);

    // Update the validation record
    await supabase
      .from('video_validations')
      .update({
        status: 'completed',
        score: aiResponse.score,
        recommendation: aiResponse.recommendation,
        ai_response: aiResponse,
        updated_at: new Date().toISOString()
      })
      .eq('id', validationId);

    // If score < 90, send Discord Webhook
    if (aiResponse.score < 90) {
      console.log("Score below 90, sending Discord webhook...");
      const webhookUrl = "https://discord.com/api/webhooks/1548525329235320882/nCz3V_-zUBq8kRn70vGIOGMelUCBF0Ig2kIQbuza89flkd2Hz0TW4nNJayEwiR8Q1DTa";
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `⚠️ **Ajuste Necessário no Vídeo**\n\n**Caso:** ${caseId}\n**Subtarefa:** ${subtaskId}\n**Nota IA:** ${aiResponse.score}/100\n\n**Recomendação:**\n${aiResponse.recommendation}\n\n[Link do Vídeo](${videoUrl})`
        })
      });
    }

    return json({ ok: true, message: "Validation processed", result: aiResponse });

  } catch (e: any) {
    console.error(`[video-validation-ai] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500);
  }
});
