import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Public webhook endpoint.
// IMPORTANT: In Supabase, set Verify JWT = OFF for this function.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // Optional shared-secret guard.
    // Configure AUTENTIQUE_WEBHOOK_SECRET in Supabase Edge Function secrets.
    const secret = (Deno.env.get("AUTENTIQUE_WEBHOOK_SECRET") ?? "").trim();
    if (secret) {
      const provided = String(req.headers.get("x-webhook-secret") ?? "").trim();
      if (!provided || provided !== secret) return err("unauthorized", 401);
    }

    const raw = await req.text();
    if (!raw) return err("empty_body", 400);

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
