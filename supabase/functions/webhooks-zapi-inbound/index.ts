import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { normalizePhoneE164Like } from "../_shared/normalize.ts";

type InboundType = "text" | "image" | "audio" | "location";

function pickFirst<T>(...values: Array<T | null | undefined>): T | null {
  for (const v of values) if (v !== null && v !== undefined && v !== "") return v as T;
  return null;
}

function normalizeInbound(payload: any): {
  zapiInstanceId: string | null;
  type: InboundType;
  from: string | null;
  to: string | null;
  text: string | null;
  mediaUrl: string | null;
  location: { lat: number; lng: number } | null;
  raw: any;
} {
  const zapiInstanceId = pickFirst<string>(payload?.instanceId, payload?.instance_id, payload?.instance);

  const rawType = String(
    pickFirst(
      payload?.type,
      payload?.messageType,
      payload?.data?.type,
      payload?.data?.messageType,
      payload?.message?.type
    ) ?? "text"
  ).toLowerCase();

  const type: InboundType =
    rawType.includes("image") || rawType.includes("photo")
      ? "image"
      : rawType.includes("audio") || rawType.includes("ptt")
        ? "audio"
        : rawType.includes("location")
          ? "location"
          : "text";

  const from = normalizePhoneE164Like(
    pickFirst(payload?.from, payload?.data?.from, payload?.sender?.phone, payload?.phone)
  );
  const to = normalizePhoneE164Like(pickFirst(payload?.to, payload?.data?.to));

  const text = pickFirst<string>(
    payload?.text,
    payload?.body,
    payload?.message,
    payload?.data?.text,
    payload?.data?.body,
    payload?.data?.message
  );

  const mediaUrl = pickFirst<string>(
    payload?.mediaUrl,
    payload?.media_url,
    payload?.url,
    payload?.data?.mediaUrl,
    payload?.data?.url,
    payload?.data?.media_url
  );

  const latRaw = pickFirst(payload?.latitude, payload?.data?.latitude, payload?.location?.latitude, payload?.data?.location?.latitude);
  const lngRaw = pickFirst(payload?.longitude, payload?.data?.longitude, payload?.location?.longitude, payload?.data?.location?.longitude);

  const location =
    type === "location" && latRaw != null && lngRaw != null
      ? { lat: Number(latRaw), lng: Number(lngRaw) }
      : null;

  return { zapiInstanceId, type, from, to, text: text ?? null, mediaUrl: mediaUrl ?? null, location, raw: payload };
}

serve(async (req) => {
  const fn = "webhooks-zapi-inbound";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const payload = await req.json().catch(() => null);
    if (!payload) {
      return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
    }

    const normalized = normalizeInbound(payload);
    if (!normalized.zapiInstanceId) {
      console.warn(`[${fn}] Missing instance id`, { keys: Object.keys(payload ?? {}) });
      return new Response("Missing instanceId", { status: 400, headers: corsHeaders });
    }

    const secretHeader = req.headers.get("x-webhook-secret") ?? req.headers.get("x-byfrost-webhook-secret");
    const secretQuery = new URL(req.url).searchParams.get("secret");
    const providedSecret = secretHeader ?? secretQuery;

    const supabase = createSupabaseAdmin();

    const { data: instance, error: instErr } = await supabase
      .from("wa_instances")
      .select("id, tenant_id, webhook_secret")
      .eq("zapi_instance_id", normalized.zapiInstanceId)
      .maybeSingle();

    if (instErr) {
      console.error(`[${fn}] Failed to load wa_instance`, { instErr });
      return new Response("Failed to load instance", { status: 500, headers: corsHeaders });
    }

    if (!instance) {
      return new Response("Unknown instance", { status: 404, headers: corsHeaders });
    }

    if (!providedSecret || providedSecret !== instance.webhook_secret) {
      console.warn(`[${fn}] Invalid webhook secret`, { hasProvided: Boolean(providedSecret) });
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const correlationId = String(payload?.correlation_id ?? crypto.randomUUID());

    // Write inbound message
    const { error: msgErr } = await supabase.from("wa_messages").insert({
      tenant_id: instance.tenant_id,
      instance_id: instance.id,
      direction: "inbound",
      from_phone: normalized.from,
      to_phone: normalized.to,
      type: normalized.type,
      body_text: normalized.text,
      media_url: normalized.mediaUrl,
      payload_json: payload,
      correlation_id: correlationId,
      occurred_at: new Date().toISOString(),
    });

    if (msgErr) {
      console.error(`[${fn}] Failed to insert wa_message`, { msgErr });
      return new Response("Failed to insert message", { status: 500, headers: corsHeaders });
    }

    // Usage event
    await supabase.from("usage_events").insert({
      tenant_id: instance.tenant_id,
      type: "message",
      qty: 1,
      ref_type: "wa_message",
      meta_json: { direction: "inbound", wa_type: normalized.type },
      occurred_at: new Date().toISOString(),
    });

    // Vendor identification (by WhatsApp number)
    let vendorId: string | null = null;
    if (normalized.from) {
      const { data: vendor } = await supabase
        .from("vendors")
        .select("id")
        .eq("tenant_id", instance.tenant_id)
        .eq("phone_e164", normalized.from)
        .maybeSingle();
      if (vendor?.id) vendorId = vendor.id;
      if (!vendorId) {
        const { data: createdVendor, error: vErr } = await supabase
          .from("vendors")
          .insert({
            tenant_id: instance.tenant_id,
            phone_e164: normalized.from,
            display_name: payload?.senderName ?? payload?.sender?.name ?? null,
            active: true,
          })
          .select("id")
          .single();
        if (vErr) console.error(`[${fn}] Failed to create vendor`, { vErr });
        vendorId = createdVendor?.id ?? null;
      }
    }

    // Find journey (MVP sales_order)
    const { data: journeyRow, error: jErr } = await supabase
      .from("journeys")
      .select("id")
      .eq("key", "sales_order")
      .maybeSingle();
    if (jErr || !journeyRow) {
      console.error(`[${fn}] Missing journey sales_order`, { jErr });
      return new Response("Journey not configured", { status: 500, headers: corsHeaders });
    }

    const enqueueJob = async (type: string, idempotencyKey: string, payloadJson: any) => {
      const { error } = await supabase.from("job_queue").insert({
        tenant_id: instance.tenant_id,
        type,
        idempotency_key: idempotencyKey,
        payload_json: payloadJson,
        status: "pending",
        run_after: new Date().toISOString(),
      });
      // Ignore conflict (idempotency)
      if (error && !String(error.message ?? "").toLowerCase().includes("duplicate")) {
        console.error(`[${fn}] Failed to enqueue job`, { type, error });
      }
    };

    // Routing
    if (normalized.type === "image") {
      if (!vendorId) {
        return new Response("Missing vendor phone", { status: 400, headers: corsHeaders });
      }

      const { data: createdCase, error: cErr } = await supabase
        .from("cases")
        .insert({
          tenant_id: instance.tenant_id,
          journey_id: journeyRow.id,
          case_type: "order",
          status: "in_progress",
          state: "awaiting_ocr",
          created_by_channel: "whatsapp",
          created_by_vendor_id: vendorId,
          assigned_vendor_id: vendorId,
          title: "Pedido (foto recebida)",
          meta_json: { correlation_id: correlationId, photo_attempt: 1 },
        })
        .select("id")
        .single();

      if (cErr || !createdCase) {
        console.error(`[${fn}] Failed to create case`, { cErr });
        return new Response("Failed to create case", { status: 500, headers: corsHeaders });
      }

      if (normalized.mediaUrl) {
        await supabase.from("case_attachments").insert({
          tenant_id: instance.tenant_id,
          case_id: createdCase.id,
          kind: "image",
          storage_path: normalized.mediaUrl,
          original_filename: payload?.fileName ?? null,
          content_type: payload?.mimeType ?? null,
          meta_json: { source: "zapi" },
        });
      }

      // Initial pendencies
      await supabase.from("pendencies").insert([
        {
          tenant_id: instance.tenant_id,
          case_id: createdCase.id,
          type: "need_location",
          assigned_to_role: "vendor",
          question_text: "Envie sua localização (WhatsApp: Compartilhar localização). Sem isso não conseguimos registrar o pedido.",
          required: true,
          status: "open",
          due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        },
        {
          tenant_id: instance.tenant_id,
          case_id: createdCase.id,
          type: "need_more_pages",
          assigned_to_role: "vendor",
          question_text: "Tem mais alguma folha desse pedido? Se sim, envie as próximas fotos. Se não, responda: última folha.",
          required: false,
          status: "open",
          due_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
      ]);

      await supabase.from("timeline_events").insert({
        tenant_id: instance.tenant_id,
        case_id: createdCase.id,
        event_type: "inbound_image",
        actor_type: "vendor",
        actor_id: vendorId,
        message: "Foto do pedido recebida. Iniciando OCR e validações.",
        meta_json: { correlation_id: correlationId },
        occurred_at: new Date().toISOString(),
      });

      await supabase.from("decision_logs").insert({
        tenant_id: instance.tenant_id,
        case_id: createdCase.id,
        agent_id: null,
        input_summary: "Mensagem inbound com imagem",
        output_summary: "Caso criado + pendências iniciais (localização / páginas)",
        reasoning_public: "Para registrar o pedido, a localização do WhatsApp é obrigatória. OCR será executado para extrair os campos.",
        why_json: { need_location: true, ask_more_pages: true },
        confidence_json: { overall: 0.6 },
        occurred_at: new Date().toISOString(),
      });

      await supabase.rpc("append_audit_ledger", {
        p_tenant_id: instance.tenant_id,
        p_payload: {
          kind: "inbound_image_created_case",
          correlation_id: correlationId,
          case_id: createdCase.id,
          from: normalized.from,
          instance: normalized.zapiInstanceId,
        },
      });

      await enqueueJob("OCR_IMAGE", `OCR_IMAGE:${createdCase.id}`, {
        case_id: createdCase.id,
        correlation_id: correlationId,
      });
      await enqueueJob("VALIDATE_FIELDS", `VALIDATE_FIELDS:${createdCase.id}`, {
        case_id: createdCase.id,
        correlation_id: correlationId,
      });
      await enqueueJob("ASK_PENDENCIES", `ASK_PENDENCIES:${createdCase.id}:${Date.now()}`, {
        case_id: createdCase.id,
        correlation_id: correlationId,
      });

      return new Response(JSON.stringify({ ok: true, correlation_id: correlationId, case_id: createdCase.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (normalized.type === "location") {
      if (!vendorId || !normalized.location) {
        return new Response("Missing vendor or location", { status: 400, headers: corsHeaders });
      }

      // Find latest case for this vendor needing location
      const { data: openCase } = await supabase
        .from("cases")
        .select("id")
        .eq("tenant_id", instance.tenant_id)
        .eq("assigned_vendor_id", vendorId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!openCase?.id) {
        return new Response(JSON.stringify({ ok: true, note: "No open case" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("case_fields").upsert({
        tenant_id: instance.tenant_id,
        case_id: openCase.id,
        key: "location",
        value_json: normalized.location,
        value_text: `${normalized.location.lat},${normalized.location.lng}`,
        confidence: 1,
        source: "vendor",
        last_updated_by: "whatsapp_location",
      });

      await supabase
        .from("pendencies")
        .update({ status: "answered", answered_text: "Localização enviada", answered_payload_json: normalized.location })
        .eq("tenant_id", instance.tenant_id)
        .eq("case_id", openCase.id)
        .eq("type", "need_location")
        .eq("status", "open");

      await supabase.from("timeline_events").insert({
        tenant_id: instance.tenant_id,
        case_id: openCase.id,
        event_type: "location_received",
        actor_type: "vendor",
        actor_id: vendorId,
        message: "Localização recebida. Pedido pode avançar para revisão.",
        meta_json: normalized.location,
        occurred_at: new Date().toISOString(),
      });

      await supabase.from("cases").update({ state: "ready_for_review" }).eq("id", openCase.id);

      await supabase.rpc("append_audit_ledger", {
        p_tenant_id: instance.tenant_id,
        p_payload: { kind: "location_received", correlation_id: correlationId, case_id: openCase.id, from: normalized.from },
      });

      return new Response(JSON.stringify({ ok: true, correlation_id: correlationId, case_id: openCase.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // text/audio: treat as pendency answer (MVP)
    if (normalized.type === "text" || normalized.type === "audio") {
      if (!vendorId) {
        return new Response(JSON.stringify({ ok: true, note: "No vendor" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: openCase } = await supabase
        .from("cases")
        .select("id")
        .eq("tenant_id", instance.tenant_id)
        .eq("assigned_vendor_id", vendorId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!openCase?.id) {
        return new Response(JSON.stringify({ ok: true, note: "No open case" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const answerText = normalized.type === "audio" ? "(áudio recebido - transcrição pendente)" : normalized.text;

      // Answer the oldest open vendor pendency
      const { data: pendency } = await supabase
        .from("pendencies")
        .select("id")
        .eq("tenant_id", instance.tenant_id)
        .eq("case_id", openCase.id)
        .eq("assigned_to_role", "vendor")
        .eq("status", "open")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (pendency?.id) {
        await supabase.from("pendencies").update({ status: "answered", answered_text: answerText, answered_payload_json: payload }).eq("id", pendency.id);
      }

      await supabase.from("timeline_events").insert({
        tenant_id: instance.tenant_id,
        case_id: openCase.id,
        event_type: "vendor_reply",
        actor_type: "vendor",
        actor_id: vendorId,
        message: `Resposta do vendedor recebida${normalized.type === "audio" ? " (áudio)" : ""}.`,
        meta_json: { correlation_id: correlationId },
        occurred_at: new Date().toISOString(),
      });

      await enqueueJob("VALIDATE_FIELDS", `VALIDATE_FIELDS:${openCase.id}:${Date.now()}`, {
        case_id: openCase.id,
        correlation_id: correlationId,
      });
      await enqueueJob("ASK_PENDENCIES", `ASK_PENDENCIES:${openCase.id}:${Date.now()}`, {
        case_id: openCase.id,
        correlation_id: correlationId,
      });

      return new Response(JSON.stringify({ ok: true, correlation_id: correlationId, case_id: openCase.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, note: "Ignored" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[webhooks-zapi-inbound] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
