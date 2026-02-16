import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Public webhook endpoint.
// IMPORTANT: In Supabase, set Verify JWT = OFF for this function.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-autentique-signature, x-autentique-timestamp, x-webhook-secret",
};

function createSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400, detail?: any) {
  return json({ ok: false, error: message, detail }, status);
}

async function sha256Hex(text: string) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
}

function encodeUtf8(s: string) {
  return new TextEncoder().encode(s);
}

function base64Encode(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function hmacSha256(secret: string, messageBytes: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    encodeUtf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, messageBytes);
  return new Uint8Array(sig);
}

function parseTimestampToMs(tsRaw: string) {
  const n = Number(tsRaw);
  if (!Number.isFinite(n)) return null;

  // common formats:
  // - seconds (10 digits)
  // - ms (13 digits)
  // - microseconds (16 digits)
  // - nanoseconds (19 digits)
  if (n > 1e18) return Math.floor(n / 1e6); // ns -> ms
  if (n > 1e15) return Math.floor(n / 1e3); // µs -> ms
  if (n > 1e12) return Math.floor(n); // ms
  return Math.floor(n * 1000); // seconds -> ms
}

async function verifyAutentiqueWebhookSignature(params: {
  secret: string;
  rawBody: string;
  signatureHeader: string;
  timestampHeader: string;
  toleranceMs?: number;
}) {
  const toleranceMs = params.toleranceMs ?? 5 * 60 * 1000;

  const tsMs = parseTimestampToMs(params.timestampHeader);
  if (tsMs === null) return false;
  if (Math.abs(Date.now() - tsMs) > toleranceMs) return false;

  const sigHeader = String(params.signatureHeader ?? "").trim();
  if (!sigHeader) return false;

  const bodyBytes = encodeUtf8(params.rawBody);
  const tsStr = String(params.timestampHeader);

  // Autentique provides x-autentique-signature + x-autentique-timestamp.
  // Keep verification tolerant to the most common message formats.
  const candidateMessages: Uint8Array[] = [
    encodeUtf8(`${tsStr}.${params.rawBody}`),
    encodeUtf8(`${tsStr}${params.rawBody}`),
    bodyBytes,
  ];

  for (const msg of candidateMessages) {
    const mac = await hmacSha256(params.secret, msg);

    const b64 = base64Encode(mac);
    if (constantTimeEqual(encodeUtf8(b64), encodeUtf8(sigHeader))) return true;

    const hex = Array.from(mac)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (constantTimeEqual(encodeUtf8(hex), encodeUtf8(sigHeader))) return true;
  }

  return false;
}

function pickDocumentId(payload: any): string | null {
  const v =
    payload?.document?.id ??
    payload?.document_id ??
    payload?.documentId ??
    payload?.data?.document?.id ??
    null;
  return v ? String(v) : null;
}

function pickStatus(payload: any): string | null {
  const v = payload?.document?.status ?? payload?.status ?? payload?.data?.document?.status ?? null;
  return v ? String(v) : null;
}

function pickEventType(payload: any): string | null {
  const v = payload?.event ?? payload?.type ?? payload?.action ?? payload?.name ?? null;
  return v ? String(v) : null;
}

function isSignedEvent(payload: any): boolean {
  const status = String(pickStatus(payload) ?? "").toLowerCase();
  const ev = String(pickEventType(payload) ?? "").toLowerCase();

  if (["signed", "completed", "closed", "finalized"].includes(status)) return true;
  if (ev.includes("signed")) return true;
  if (ev.includes("completed")) return true;
  return false;
}

serve(async (req) => {
  const fn = "autentique-webhook";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const url = new URL(req.url);

    // Webhook signature validation.
    // If Autentique plan does not allow custom headers, you can append ?secret=... to the webhook URL.
    // Configure AUTENTIQUE_WEBHOOK_SECRET in Supabase Edge Function secrets.
    const secret = (Deno.env.get("AUTENTIQUE_WEBHOOK_SECRET") ?? "").trim();
    const signatureHeader = String(req.headers.get("x-autentique-signature") ?? "").trim();
    const timestampHeader = String(req.headers.get("x-autentique-timestamp") ?? "").trim();

    const raw = await req.text();
    if (!raw) return err("empty_body", 400);

    // Backwards compatibility: if your plan supports custom headers, we still accept x-webhook-secret.
    const legacyHeaderSecret = String(req.headers.get("x-webhook-secret") ?? "").trim();
    const querySecret = String(url.searchParams.get("secret") ?? url.searchParams.get("token") ?? "").trim();

    if (secret) {
      const legacyOk = legacyHeaderSecret && legacyHeaderSecret === secret;
      const queryOk = querySecret && querySecret === secret;
      const signatureOk = await verifyAutentiqueWebhookSignature({
        secret,
        rawBody: raw,
        signatureHeader,
        timestampHeader,
      });

      if (!legacyOk && !queryOk && !signatureOk) {
        return err("unauthorized", 401, {
          reason: "missing_or_invalid_auth",
          hasSignature: !!signatureHeader,
          hasTimestamp: !!timestampHeader,
          hasQuerySecret: !!querySecret,
        });
      }
    }

    const payload = JSON.parse(raw);
    const payloadSha = await sha256Hex(raw);

    const documentId = pickDocumentId(payload);
    const status = pickStatus(payload);
    const eventType = pickEventType(payload);

    const supabase = createSupabaseAdmin();

    // Find proposal by document_id stored in party_proposals.autentique_json.document_id
    let proposal: any = null;
    if (documentId) {
      const { data } = await supabase
        .from("party_proposals")
        .select("id,tenant_id,status,autentique_json")
        .is("deleted_at", null)
        .eq("autentique_json->>document_id", String(documentId))
        .maybeSingle();
      proposal = data ?? null;
    }

    // Audit insert (idempotent on payload_sha256)
    const { error: insErr } = await supabase.from("autentique_webhook_events").insert({
      tenant_id: proposal?.tenant_id ?? null,
      proposal_id: proposal?.id ?? null,
      document_id: documentId,
      event_type: eventType,
      status,
      payload_sha256: payloadSha,
      payload_json: payload,
      received_at: new Date().toISOString(),
    } as any);

    // Ignore duplicates
    if (insErr && !String(insErr.message ?? "").toLowerCase().includes("duplicate")) {
      return err("insert_failed", 500, { message: insErr.message });
    }

    // Best-effort status update
    if (proposal && isSignedEvent(payload)) {
      const nextAut = {
        ...(proposal.autentique_json ?? {}),
        status: "signed",
        signed_at: new Date().toISOString(),
        last_webhook_event: eventType,
        last_webhook_received_at: new Date().toISOString(),
      };

      await supabase
        .from("party_proposals")
        .update({ status: "signed", autentique_json: nextAut })
        .eq("tenant_id", proposal.tenant_id)
        .eq("id", proposal.id)
        .is("deleted_at", null);
    }

    return json({ ok: true });
  } catch (e: any) {
    console.error(`[${fn}] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500, { message: e?.message ?? String(e) });
  }
});