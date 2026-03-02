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
    payload?.event?.resource?.id ??
    payload?.event?.document?.id ??
    payload?.resource?.id ??
    null;
  return v ? String(v) : null;
}

function pickSignerPublicId(payload: any): string | null {
  const v =
    payload?.signature?.public_id ??
    payload?.signature_public_id ??
    payload?.signaturePublicId ??
    payload?.data?.signature?.public_id ??
    payload?.document?.signatures?.[0]?.public_id ??
    payload?.signatures?.[0]?.public_id ??
    null;
  return v ? String(v) : null;
}

function pickStatus(payload: any): string | null {
  const v =
    payload?.document?.status ??
    payload?.status ??
    payload?.data?.document?.status ??
    payload?.event?.type ??
    null;
  return v ? String(v) : null;
}

function pickEventType(payload: any): string | null {
  const ev = payload?.event ?? payload?.type ?? payload?.action ?? payload?.name ?? null;

  // Autentique v2 commonly sends: { event: { type: 'signature.accepted', ... } }
  if (ev && typeof ev === "object") {
    const t = (ev as any)?.type ?? (ev as any)?.name ?? null;
    return t ? String(t) : null;
  }

  return ev ? String(ev) : null;
}

function normalizeEventToken(s: any) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function hasAnySignedMarker(payload: any): boolean {
  // Newer JSON payloads
  const sigs = payload?.document?.signatures ?? payload?.signatures ?? payload?.data?.document?.signatures ?? null;
  if (Array.isArray(sigs)) {
    for (const s of sigs) {
      if (s?.signed_at) return true;
      if (s?.signed?.created_at) return true;
      if (s?.signed?.created) return true;
      if (String(s?.status ?? "").toLowerCase() === "signed") return true;
    }
  }

  // Legacy PT-BR payloads sometimes include "partes" and "assinado"
  const partes = payload?.partes ?? payload?.document?.partes ?? payload?.data?.document?.partes ?? null;
  if (Array.isArray(partes)) {
    for (const p of partes) {
      if (p?.assinado?.created || p?.assinado?.created_at) return true;
      if (String(p?.status ?? "").toLowerCase() === "signed") return true;
    }
  }

  return false;
}

function isSignedEvent(payload: any): boolean {
  const statusRaw = String(pickStatus(payload) ?? "");
  const evRaw = String(pickEventType(payload) ?? "");

  const status = normalizeEventToken(statusRaw);
  const ev = normalizeEventToken(evRaw);

  // explicit status
  if (["signed", "completed", "closed", "finalized"].includes(status)) return true;

  // common event/status names (support dot/underscore/etc)
  if (ev.includes("signed")) return true;
  if (ev.includes("completed")) return true;
  if (ev.includes("signatureaccepted")) return true;
  if (ev.includes("accepted")) return true;

  // Some payloads put the event name into "status"
  if (status.includes("signatureaccepted")) return true;
  if (status.includes("accepted")) return true;

  // payload inspection
  if (hasAnySignedMarker(payload)) return true;

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
    const signerPublicId = pickSignerPublicId(payload);
    const status = pickStatus(payload);
    const eventType = pickEventType(payload);

    const supabase = createSupabaseAdmin();

    // 1. Try finding it as a User Goal Signature
    let goalSignature: any = null;
    let proposal: any = null;
    let matchedBy: string | null = null;
    let matchedContext = "";

    if (documentId) {
      // Check user_goal_signatures
      const { data: gData } = await supabase
        .from("user_goal_signatures")
        .select("id,tenant_id,autentique_status,autentique_json")
        .eq("autentique_json->>document_id", String(documentId))
        .maybeSingle();
      if (gData) {
        goalSignature = gData;
        matchedBy = "document_id";
        matchedContext = "goal_signature";
      } else {
        // Fallback to party_proposals
        const { data: pData } = await supabase
          .from("party_proposals")
          .select("id,tenant_id,status,autentique_json")
          .is("deleted_at", null)
          .eq("autentique_json->>document_id", String(documentId))
          .maybeSingle();
        if (pData) {
          proposal = pData;
          matchedBy = "document_id";
          matchedContext = "proposal";
        }
      }
    }

    // Fallback: find by signer_public_id if documentId failed
    if (!goalSignature && !proposal && signerPublicId) {
      // Check user_goal_signatures
      const { data: gData } = await supabase
        .from("user_goal_signatures")
        .select("id,tenant_id,autentique_status,autentique_json")
        .eq("autentique_json->>signer_public_id", String(signerPublicId))
        .maybeSingle();

      if (gData) {
        goalSignature = gData;
        matchedBy = "signer_public_id";
        matchedContext = "goal_signature";
      } else {
        const { data: pData } = await supabase
          .from("party_proposals")
          .select("id,tenant_id,status,autentique_json")
          .is("deleted_at", null)
          .eq("autentique_json->>signer_public_id", String(signerPublicId))
          .maybeSingle();
        if (pData) {
          proposal = pData;
          matchedBy = "signer_public_id";
          matchedContext = "proposal";
        }
      }
    }

    const signed = isSignedEvent(payload);

    const debug = url.searchParams.get("debug") === "1";
    if (debug) {
      console.log(`[${fn}] debug`, {
        keys: Object.keys(payload ?? {}),
        documentId,
        signerPublicId,
        status,
        eventType,
        signed,
        matchedBy,
        proposalId: proposal?.id ?? null,
      });
    }

    const tenantId = goalSignature?.tenant_id ?? proposal?.tenant_id ?? null;

    // Audit insert (idempotent on payload_sha256)
    const { error: insErr } = await supabase.from("autentique_webhook_events").insert({
      tenant_id: tenantId,
      proposal_id: proposal?.id ?? null,
      goal_signature_id: goalSignature?.id ?? null,
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

    if (goalSignature) {
      const nextAut = {
        ...(goalSignature.autentique_json ?? {}),
        last_webhook_event: eventType,
        last_webhook_status: status,
        last_webhook_received_at: new Date().toISOString(),
        status: signed ? "signed" : (goalSignature.autentique_json?.status ?? status ?? eventType ?? null),
        ...(signed ? { signed_at: new Date().toISOString() } : {}),
      };

      await supabase
        .from("user_goal_signatures")
        .update({
          autentique_status: signed ? "signed" : goalSignature.autentique_status,
          ...(signed ? { signed_at: new Date().toISOString() } : {}),
          autentique_json: nextAut,
        })
        .eq("tenant_id", goalSignature.tenant_id)
        .eq("id", goalSignature.id);
    }

    // Best-effort proposal update even if not signed (helps UI and debugging)
    if (proposal) {
      const nextAut = {
        ...(proposal.autentique_json ?? {}),
        last_webhook_event: eventType,
        last_webhook_status: status,
        last_webhook_received_at: new Date().toISOString(),
        // keep a mirror status for the UI
        status: signed ? "signed" : (proposal.autentique_json?.status ?? status ?? eventType ?? null),
        ...(signed ? { signed_at: new Date().toISOString() } : {}),
      };

      await supabase
        .from("party_proposals")
        .update({
          status: signed ? "signed" : proposal.status,
          autentique_json: nextAut,
        })
        .eq("tenant_id", proposal.tenant_id)
        .eq("id", proposal.id)
        .is("deleted_at", null);
    }

    if (debug) {
      return json({ ok: true, debug: { documentId, signerPublicId, status, eventType, signed, matchedBy, hasProposal: !!proposal } });
    }

    return json({ ok: true });
  } catch (e: any) {
    console.error(`[${fn}] unhandled`, { error: e?.message ?? String(e) });
    return err("internal_error", 500, { message: e?.message ?? String(e) });
  }
});