import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

function pickFirstString(...values: any[]) {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function inferMime(payload: any): string | null {
  return pickFirstString(
    payload?.mimeType,
    payload?.mimetype,
    payload?.data?.mimeType,
    payload?.data?.mimetype,
    payload?.audio?.mimeType,
    payload?.audio?.mimetype,
    payload?.data?.audio?.mimeType,
    payload?.data?.audio?.mimetype,
    payload?.document?.mimeType,
    payload?.document?.mimetype,
    payload?.data?.document?.mimeType,
    payload?.data?.document?.mimetype
  );
}

function pickMediaUrl(msg: any): string | null {
  return pickFirstString(
    msg?.media_url,
    msg?.payload_json?.mediaUrl,
    msg?.payload_json?.media_url,
    msg?.payload_json?.url,
    msg?.payload_json?.data?.mediaUrl,
    msg?.payload_json?.data?.media_url,
    msg?.payload_json?.data?.url,
    msg?.payload_json?.audio?.audioUrl,
    msg?.payload_json?.data?.audio?.audioUrl
  );
}

function guessFileName(mime: string | null) {
  const m = String(mime ?? "").toLowerCase();
  if (m.includes("mpeg") || m.includes("mp3")) return "audio.mp3";
  if (m.includes("mp4") || m.includes("m4a")) return "audio.m4a";
  if (m.includes("wav")) return "audio.wav";
  if (m.includes("ogg") || m.includes("opus")) return "audio.ogg";
  return "audio.bin";
}

serve(async (req) => {
  const fn = "wa-transcribe-audio";

  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
    if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      console.error(`[${fn}] Missing env`, {
        hasUrl: Boolean(supabaseUrl),
        hasAnon: Boolean(supabaseAnon),
        hasService: Boolean(supabaseService),
      });
      return new Response("Server misconfigured", { status: 500, headers: corsHeaders });
    }

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: u, error: uErr } = await userClient.auth.getUser(token);
    if (uErr || !u?.user?.id) {
      console.error(`[${fn}] auth.getUser failed`, { uErr });
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const messageId = String(body?.messageId ?? "").trim();

    if (!tenantId || !messageId) {
      return new Response(JSON.stringify({ ok: false, error: "tenantId_and_messageId_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } });

    // Membership check: user must exist in users_profile for this tenant.
    const { data: member, error: memberErr } = await admin
      .from("users_profile")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", u.user.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (memberErr) {
      console.error(`[${fn}] users_profile check failed`, { memberErr });
      return new Response(JSON.stringify({ ok: false, error: "membership_check_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!member?.user_id) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: msg, error: msgErr } = await admin
      .from("wa_messages")
      .select("id,tenant_id,type,media_url,body_text,payload_json,case_id")
      .eq("tenant_id", tenantId)
      .eq("id", messageId)
      .limit(1)
      .maybeSingle();

    if (msgErr) {
      console.error(`[${fn}] wa_messages load failed`, { msgErr });
      return new Response(JSON.stringify({ ok: false, error: "message_load_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!msg?.id) {
      return new Response(JSON.stringify({ ok: false, error: "message_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existing = String((msg as any).body_text ?? "").trim();
    if (existing) {
      return new Response(JSON.stringify({ ok: true, transcript: existing, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mediaUrl = pickMediaUrl(msg);
    if (!mediaUrl) {
      return new Response(JSON.stringify({ ok: false, error: "missing_media_url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("AI_API_KEY") ?? "";
    const provider = (Deno.env.get("AI_PROVIDER") ?? "").toLowerCase();
    if (!apiKey || provider !== "openai") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "transcription_not_configured",
          hint: "Configure AI_PROVIDER=openai e AI_API_KEY (OpenAI) nas Secrets do Supabase.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const mediaRes = await fetch(mediaUrl).catch((e) => {
      console.error(`[${fn}] media fetch failed`, { e: String((e as any)?.message ?? e) });
      return null;
    });

    if (!mediaRes || !mediaRes.ok) {
      console.warn(`[${fn}] media fetch not ok`, { status: mediaRes?.status ?? null });
      return new Response(JSON.stringify({ ok: false, error: "media_fetch_failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mime = pickFirstString(mediaRes.headers.get("content-type"), inferMime((msg as any).payload_json));
    const audioBuf = await mediaRes.arrayBuffer();

    const file = new Blob([audioBuf], { type: mime ?? "application/octet-stream" });
    const form = new FormData();
    form.append("file", file, guessFileName(mime));
    form.append("model", "whisper-1");
    form.append("language", "pt");

    const openAiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    const json = await openAiRes.json().catch(() => null);
    if (!openAiRes.ok || !json) {
      console.error(`[${fn}] OpenAI transcription failed`, { status: openAiRes.status, json });
      return new Response(JSON.stringify({ ok: false, error: "transcription_failed", details: json }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcript = String((json as any)?.text ?? "").trim();
    if (!transcript) {
      return new Response(JSON.stringify({ ok: false, error: "empty_transcript" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persist transcript so the UI can show it later.
    const { error: updErr } = await admin
      .from("wa_messages")
      .update({ body_text: transcript })
      .eq("tenant_id", tenantId)
      .eq("id", messageId);

    if (updErr) {
      console.error(`[${fn}] Failed to persist transcript`, { updErr });
      // still return transcript
    }

    // Optional: timeline event for traceability
    if ((msg as any)?.case_id) {
      await admin.from("timeline_events").insert({
        tenant_id: tenantId,
        case_id: (msg as any).case_id,
        event_type: "wa_audio_transcribed",
        actor_type: "admin",
        actor_id: u.user.id,
        message: "Áudio transcrito no painel.",
        meta_json: { wa_message_id: messageId },
        occurred_at: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ ok: true, transcript, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[wa-transcribe-audio] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});