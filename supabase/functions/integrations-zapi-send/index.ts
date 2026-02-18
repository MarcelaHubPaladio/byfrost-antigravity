import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { normalizePhoneE164Like } from "../_shared/normalize.ts";

serve(async (req) => {
  const fn = "integrations-zapi-send";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    const body = await req.json().catch(() => null);
    if (!body) return new Response("Invalid JSON", { status: 400, headers: corsHeaders });

    const tenantId = body.tenantId as string | undefined;
    const instanceId = body.instanceId as string | undefined; // wa_instances.id
    const to = normalizePhoneE164Like(body.to);
    const from = normalizePhoneE164Like(body.from);
    const type = (body.type as string | undefined) ?? "text";
    const text = (body.text as string | undefined) ?? null;
    const mediaUrl = (body.mediaUrl as string | undefined) ?? null;
    const payloadMeta = body.meta ?? {};

    const caseId =
      (body.caseId as string | undefined) ??
      (payloadMeta?.case_id as string | undefined) ??
      (payloadMeta?.caseId as string | undefined) ??
      null;

    if (!tenantId || !instanceId || !to) {
      return new Response(JSON.stringify({ ok: false, error: "Missing tenantId/instanceId/to" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createSupabaseAdmin();

    const { data: inst, error: instErr } = await supabase
      .from("wa_instances")
      .select("id, tenant_id, zapi_instance_id, zapi_token_encrypted, phone_number")
      .eq("id", instanceId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (instErr || !inst) {
      console.error(`[${fn}] Instance not found`, { instErr });
      return new Response(JSON.stringify({ ok: false, error: "Instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const correlationId = String(body.correlationId ?? crypto.randomUUID());

    // Always persist an outbound record (even if external sending is disabled)
    const { error: msgErr } = await supabase.from("wa_messages").insert({
      tenant_id: tenantId,
      instance_id: inst.id,
      case_id: caseId,
      direction: "outbound",
      from_phone: from ?? inst.phone_number ?? null,
      to_phone: to,
      type: type === "image" ? "image" : type === "location" ? "location" : "text",
      body_text: text,
      media_url: mediaUrl,
      payload_json: { ...body, meta: payloadMeta },
      correlation_id: correlationId,
      occurred_at: new Date().toISOString(),
    });

    if (msgErr) {
      console.error(`[${fn}] Failed to insert outbound wa_message`, { msgErr });
    }

    await supabase.from("usage_events").insert({
      tenant_id: tenantId,
      type: "message",
      qty: 1,
      ref_type: "wa_message",
      meta_json: { direction: "outbound", wa_type: type },
      occurred_at: new Date().toISOString(),
    });

    // External call (best-effort)
    const zapiDomain = (Deno.env.get("ZAPI_DOMAIN") ?? "https://api.z-api.io").replace(/\/$/, "");
    const zapiInstanceId = inst.zapi_instance_id;
    const zapiToken = inst.zapi_token_encrypted; // Assuming this is the raw token despite the name

    // If we don't have instance/token, we can't send.
    const shouldCall = Boolean(zapiInstanceId && zapiToken);

    let external: any = null;
    if (shouldCall) {
      try {
        let endpoint = "send-text";
        let bodyPayload: any = { phone: to };

        if (type === "text") {
          endpoint = "send-text";
          bodyPayload.message = text;
        } else if (type === "image") {
          endpoint = "send-image";
          bodyPayload.image = mediaUrl;
          if (text) bodyPayload.caption = text;
        } else if (type === "audio") {
          endpoint = "send-audio";
          bodyPayload.audio = mediaUrl;
        } else if (type === "location") {
          endpoint = "send-location";
          // Location payload requires latitude/longitude.
          // We expect these in `payloadMeta` or `body`.
          const lat = payloadMeta?.latitude ?? body.latitude;
          const lng = payloadMeta?.longitude ?? body.longitude;
          if (lat && lng) {
            bodyPayload.latitude = lat;
            bodyPayload.longitude = lng;
            if (text) bodyPayload.title = text;
          } else {
            throw new Error("Missing latitude/longitude for location message");
          }
        } else {
          // Fallback or other types (video, document, etc) - implement as needed.
          // For now, treat unknown as text if text is present, or error.
          if (text) {
            endpoint = "send-text";
            bodyPayload.message = text;
          } else {
            throw new Error(`Unsupported message type: ${type}`);
          }
        }

        const url = `${zapiDomain}/instances/${zapiInstanceId}/token/${zapiToken}/${endpoint}`;

        console.log(`[${fn}] Sending to Z-API`, { url, type });

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
        });

        const resText = await res.text();
        let resJson: any = null;
        try {
          resJson = JSON.parse(resText);
        } catch { }

        external = {
          ok: res.ok,
          status: res.status,
          body: resJson ?? resText,
        };
        console.log(`[${fn}] External send result`, { ok: res.ok, status: res.status });

      } catch (e) {
        console.warn(`[${fn}] External send failed (ignored)`, { e });
        external = { ok: false, error: String(e) };
      }
    } else {
      console.log(`[${fn}] Z-API credentials missing (instance_id/token); message prepared only (outbox).`);
    }

    await supabase.rpc("append_audit_ledger", {
      p_tenant_id: tenantId,
      p_payload: {
        kind: "wa_outbound_prepared",
        correlation_id: correlationId,
        to,
        type,
        case_id: caseId,
        has_external_attempt: shouldCall,
      },
    });

    return new Response(JSON.stringify({ ok: true, correlationId, external }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[integrations-zapi-send] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});