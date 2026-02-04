import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { normalizePhoneE164Like } from "../_shared/normalize.ts";
import { fetchAsBase64 } from "../_shared/crypto.ts";

function toDigits(s: string) {
  return (s ?? "").replace(/\D/g, "");
}

function extractFieldsFromText(text: string) {
  const cpfMatch = text.match(/\b(\d{3}\.?(\d{3})\.?(\d{3})-?(\d{2}))\b/);
  const cpf = cpfMatch ? toDigits(cpfMatch[1]) : null;
  const rgMatch = text.match(/\bRG\s*[:\-]?\s*(\d{6,12})\b/i) ?? text.match(/\b(\d{7,10})\b/);
  const rg = rgMatch ? toDigits(rgMatch[1]) : null;
  const birthMatch = text.match(/\b(\d{2}[\/-]\d{2}[\/-]\d{2,4})\b/);
  const birth_date_text = birthMatch ? birthMatch[1] : null;
  const phoneMatch = text.match(/\b(\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4})\b/);
  const phone_raw = phoneMatch ? phoneMatch[1] : null;
  const totalMatch = text.match(/R\$\s*([0-9\.,]{2,})/);
  const total_raw = totalMatch ? totalMatch[0] : null;
  const nameMatch = text.match(/\bNome\s*[:\-]\s*(.+)/i);
  const name = nameMatch ? nameMatch[1].trim().slice(0, 80) : null;
  const signaturePresent = /assinatura/i.test(text);
  return { name, cpf, rg, birth_date_text, phone_raw, total_raw, signaturePresent };
}

async function runOcrGoogleVision(input: { imageUrl?: string | null; imageBase64?: string | null }) {
  const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY") ?? "";
  if (!apiKey) return { ok: false as const, error: "Missing GOOGLE_VISION_API_KEY" };

  const imageUrl = input.imageUrl ?? null;
  const imageBase64 = input.imageBase64 ?? null;

  if (!imageUrl && !imageBase64) {
    return { ok: false as const, error: "Missing mediaUrl/mediaBase64" };
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
  if (!res.ok || !json) return { ok: false as const, error: `Vision API error: ${res.status}`, raw: json };
  const annotation = json?.responses?.[0]?.fullTextAnnotation;
  return { ok: true as const, text: annotation?.text ?? "", raw: json?.responses?.[0] ?? json };
}

async function ensureSalesOrderJourney(supabase: ReturnType<typeof createSupabaseAdmin>) {
  const fn = "simulator-whatsapp";

  // 1) Try to find the expected seeded journey
  const { data: journeyExisting, error: jErr } = await supabase
    .from("journeys")
    .select("id")
    .eq("key", "sales_order")
    .maybeSingle();

  if (jErr) {
    console.error(`[${fn}] Failed to query journeys`, { jErr });
  }

  if (journeyExisting?.id) return journeyExisting.id as string;

  // 2) If missing (db without seeds), recreate minimal catalog rows so simulator can run.
  console.warn(`[${fn}] Journey sales_order missing; attempting to (re)seed minimal catalog rows`);

  let sectorId: string | null = null;
  const { data: sector } = await supabase.from("sectors").select("id").eq("name", "Vendas").maybeSingle();
  sectorId = sector?.id ?? null;

  if (!sectorId) {
    const { data: createdSector, error: sErr } = await supabase
      .from("sectors")
      .insert({ name: "Vendas", description: "Templates para fluxos de vendas" })
      .select("id")
      .single();

    if (sErr || !createdSector?.id) {
      console.error(`[${fn}] Failed to create sector Vendas`, { sErr });
      return null;
    }

    sectorId = createdSector.id;
  }

  const defaultStateMachine = {
    states: [
      "new",
      "awaiting_ocr",
      "awaiting_location",
      "pending_vendor",
      "ready_for_review",
      "confirmed",
      "in_separation",
      "in_route",
      "delivered",
      "finalized",
    ],
    default: "new",
  };

  const { data: createdJourney, error: cjErr } = await supabase
    .from("journeys")
    .upsert(
      {
        sector_id: sectorId,
        key: "sales_order",
        name: "Pedido (WhatsApp + Foto)",
        description: "Captura de pedido por foto com OCR e pendências",
        default_state_machine_json: defaultStateMachine,
      },
      { onConflict: "sector_id,key" }
    )
    .select("id")
    .single();

  if (cjErr || !createdJourney?.id) {
    console.error(`[${fn}] Failed to upsert journey sales_order`, { cjErr });
    return null;
  }

  console.log(`[${fn}] Seeded journey sales_order`, { journeyId: createdJourney.id });
  return createdJourney.id as string;
}

serve(async (req) => {
  const fn = "simulator-whatsapp";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    const body = await req.json().catch(() => null);
    if (!body) return new Response("Invalid JSON", { status: 400, headers: corsHeaders });

    const tenantId = body.tenantId as string | undefined;
    const instanceIdRaw = body.instanceId as string | undefined; // wa_instances.id (opcional)
    const instanceId = instanceIdRaw ? String(instanceIdRaw).trim() : null;

    // Optional: allow testing with a different journey
    const journeyKeyRaw = body.journeyKey as string | undefined;
    const journeyIdRaw = body.journeyId as string | undefined;
    const journeyKey = journeyKeyRaw ? String(journeyKeyRaw).trim() : "";
    const journeyIdOverride = journeyIdRaw ? String(journeyIdRaw).trim() : "";

    const type = (body.type as string | undefined) ?? "text";
    const from = normalizePhoneE164Like(body.from);
    const to = normalizePhoneE164Like(body.to);
    const text = (body.text as string | undefined) ?? null;
    const mediaUrl = (body.mediaUrl as string | undefined) ?? null;
    const mediaBase64 = (body.mediaBase64 as string | undefined) ?? null;
    const location = body.location as { lat: number; lng: number } | undefined;

    if (!tenantId || !from) {
      return new Response(JSON.stringify({ ok: false, error: "Missing tenantId/from" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const correlationId = `sim:${crypto.randomUUID()}`;

    const supabase = createSupabaseAdmin();

    // Ensure vendor
    let vendorId: string | null = null;
    const { data: vendor } = await supabase
      .from("vendors")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("phone_e164", from)
      .maybeSingle();
    vendorId = vendor?.id ?? null;
    if (!vendorId) {
      const { data: createdVendor } = await supabase
        .from("vendors")
        .insert({ tenant_id: tenantId, phone_e164: from, display_name: "Vendedor (sim)" })
        .select("id")
        .single();
      vendorId = createdVendor?.id ?? null;
    }

    // Decide which journey to use
    let journeyId: string | null = null;
    if (journeyIdOverride) {
      const { data: j } = await supabase.from("journeys").select("id").eq("id", journeyIdOverride).maybeSingle();
      journeyId = j?.id ?? null;
    } else if (journeyKey) {
      const { data: j } = await supabase.from("journeys").select("id").eq("key", journeyKey).maybeSingle();
      journeyId = j?.id ?? null;
    } else {
      journeyId = await ensureSalesOrderJourney(supabase);
    }

    if (!journeyId) {
      return new Response(
        JSON.stringify({ ok: false, error: journeyKey || journeyIdOverride ? "Journey not found" : "Journey sales_order missing" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Case creation flow (MVP)
    let caseId: string | null = null;

    if (type === "image") {
      const { data: createdCase, error: cErr } = await supabase
        .from("cases")
        .insert({
          tenant_id: tenantId,
          journey_id: journeyId,
          case_type: "order",
          // NOTE: DB enforces cases_status_check; use the canonical status.
          status: "open",
          state: "awaiting_ocr",
          created_by_channel: "api",
          created_by_vendor_id: vendorId,
          assigned_vendor_id: vendorId,
          title: "Pedido (simulador)",
          meta_json: { correlation_id: correlationId, simulator: true },
        })
        .select("id")
        .single();

      if (cErr || !createdCase) {
        console.error(`[${fn}] Failed to create case`, { cErr });
        return new Response(JSON.stringify({ ok: false, error: "Failed to create case" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      caseId = createdCase.id;

      // Persist inbound (linked to case)
      await supabase.from("wa_messages").insert({
        tenant_id: tenantId,
        instance_id: instanceId,
        case_id: caseId,
        direction: "inbound",
        from_phone: from,
        to_phone: to,
        type: type === "image" ? "image" : type === "audio" ? "audio" : type === "location" ? "location" : "text",
        body_text: text,
        media_url: mediaUrl,
        payload_json: body,
        correlation_id: correlationId,
        occurred_at: new Date().toISOString(),
      });

      // attachment (URL-based) or placeholder (inline base64)
      if (mediaUrl) {
        await supabase.from("case_attachments").insert({
          tenant_id: tenantId,
          case_id: caseId,
          kind: "image",
          storage_path: mediaUrl,
          meta_json: { source: "simulator" },
        });
      } else if (mediaBase64) {
        await supabase.from("case_attachments").insert({
          tenant_id: tenantId,
          case_id: caseId,
          kind: "image",
          storage_path: `inline://simulator/${correlationId}`,
          meta_json: { source: "simulator", inline_base64: true, note: "inline image not stored" },
        });
      }

      await supabase.from("pendencies").insert([
        {
          tenant_id: tenantId,
          case_id: caseId,
          type: "need_location",
          assigned_to_role: "vendor",
          question_text: "Envie sua localização (WhatsApp: Compartilhar localização). Sem isso não conseguimos registrar o pedido.",
          required: true,
          status: "open",
          due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        },
        {
          tenant_id: tenantId,
          case_id: caseId,
          type: "need_more_pages",
          assigned_to_role: "vendor",
          question_text: "Tem mais alguma folha desse pedido? Se sim, envie as próximas fotos. Se não, responda: última folha.",
          required: false,
          status: "open",
          due_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
      ]);

      await supabase.from("timeline_events").insert({
        tenant_id: tenantId,
        case_id: caseId,
        event_type: "sim_inbound_image",
        actor_type: "vendor",
        actor_id: vendorId,
        message: "Simulador: foto do pedido recebida.",
        meta_json: { correlation_id: correlationId },
        occurred_at: new Date().toISOString(),
      });

      // OCR + extraction + validation (inline)
      if (mediaUrl || mediaBase64) {
        const ocr = await runOcrGoogleVision({ imageUrl: mediaUrl, imageBase64: mediaBase64 });
        if (ocr.ok) {
          await supabase.from("case_fields").upsert({
            tenant_id: tenantId,
            case_id: caseId,
            key: "ocr_text",
            value_text: ocr.text,
            confidence: 0.85,
            source: "ocr",
            last_updated_by: "ocr_agent",
          });
          const extracted = extractFieldsFromText(ocr.text);

          const upserts: any[] = [];
          if (extracted.name)
            upserts.push({ tenant_id: tenantId, case_id: caseId, key: "name", value_text: extracted.name, confidence: 0.7, source: "ocr", last_updated_by: "extract" });
          if (extracted.cpf)
            upserts.push({ tenant_id: tenantId, case_id: caseId, key: "cpf", value_text: extracted.cpf, confidence: extracted.cpf.length === 11 ? 0.8 : 0.4, source: "ocr", last_updated_by: "extract" });
          if (extracted.rg)
            upserts.push({ tenant_id: tenantId, case_id: caseId, key: "rg", value_text: extracted.rg, confidence: extracted.rg.length >= 7 ? 0.7 : 0.4, source: "ocr", last_updated_by: "extract" });
          if (extracted.birth_date_text)
            upserts.push({ tenant_id: tenantId, case_id: caseId, key: "birth_date_text", value_text: extracted.birth_date_text, confidence: 0.65, source: "ocr", last_updated_by: "extract" });
          if (extracted.phone_raw)
            upserts.push({ tenant_id: tenantId, case_id: caseId, key: "phone", value_text: extracted.phone_raw, confidence: 0.65, source: "ocr", last_updated_by: "extract" });
          if (extracted.total_raw)
            upserts.push({ tenant_id: tenantId, case_id: caseId, key: "total_raw", value_text: extracted.total_raw, confidence: 0.6, source: "ocr", last_updated_by: "extract" });
          upserts.push({ tenant_id: tenantId, case_id: caseId, key: "signature_present", value_text: extracted.signaturePresent ? "yes" : "no", confidence: 0.5, source: "ocr", last_updated_by: "extract" });

          if (upserts.length) await supabase.from("case_fields").upsert(upserts);
        }
      }

      // apply location if provided
      if (location) {
        await supabase.from("case_fields").upsert({
          tenant_id: tenantId,
          case_id: caseId,
          key: "location",
          value_json: location,
          value_text: `${location.lat},${location.lng}`,
          confidence: 1,
          source: "vendor",
          last_updated_by: "simulator",
        });
        await supabase
          .from("pendencies")
          .update({ status: "answered", answered_text: "Localização enviada", answered_payload_json: location })
          .eq("tenant_id", tenantId)
          .eq("case_id", caseId)
          .eq("type", "need_location");
      }

      // Validate
      const { data: fields } = await supabase
        .from("case_fields")
        .select("key, value_text, value_json")
        .eq("tenant_id", tenantId)
        .eq("case_id", caseId);
      const fm = new Map<string, any>();
      for (const f of fields ?? []) fm.set(f.key, f.value_text ?? f.value_json);

      const missing: string[] = [];
      if (!fm.get("name")) missing.push("nome");
      if (!fm.get("cpf") || String(fm.get("cpf")).length < 11) missing.push("cpf");
      if (!fm.get("rg") || String(fm.get("rg")).length < 7) missing.push("rg");
      if (!fm.get("birth_date_text")) missing.push("data_nascimento");
      if (!fm.get("phone")) missing.push("telefone");
      if (!fm.get("location")) missing.push("localizacao");

      // Outbox preview (pendency list)
      const { data: pends } = await supabase
        .from("pendencies")
        .select("question_text, required")
        .eq("tenant_id", tenantId)
        .eq("case_id", caseId)
        .eq("assigned_to_role", "vendor")
        .eq("status", "open")
        .order("created_at", { ascending: true });

      if (pends?.length) {
        const list = pends.map((p, i) => `${i + 1}) ${p.question_text}${p.required ? "" : " (opcional)"}`).join("\n");
        const msg = `Byfrost.ia — Pendências do pedido:\n\n${list}`;
        await supabase.from("wa_messages").insert({
          tenant_id: tenantId,
          instance_id: instanceId,
          case_id: caseId,
          direction: "outbound",
          from_phone: to,
          to_phone: from,
          type: "text",
          body_text: msg,
          payload_json: { kind: "outbox_preview", case_id: caseId, missing },
          correlation_id: correlationId,
          occurred_at: new Date().toISOString(),
        });
      }

      await supabase.rpc("append_audit_ledger", {
        p_tenant_id: tenantId,
        p_payload: { kind: "simulator_run", correlation_id: correlationId, case_id: caseId },
      });
    } else {
      // Persist inbound (not linked to case) for non-image simulator payloads
      await supabase.from("wa_messages").insert({
        tenant_id: tenantId,
        instance_id: instanceId,
        case_id: null,
        direction: "inbound",
        from_phone: from,
        to_phone: to,
        type: type === "image" ? "image" : type === "audio" ? "audio" : type === "location" ? "location" : "text",
        body_text: text,
        media_url: mediaUrl,
        payload_json: body,
        correlation_id: correlationId,
        occurred_at: new Date().toISOString(),
      });
    }

    const { data: outbox } = await supabase
      .from("wa_messages")
      .select("id, to_phone, type, body_text, media_url, occurred_at")
      .eq("tenant_id", tenantId)
      .eq("direction", "outbound")
      .eq("correlation_id", correlationId)
      .order("occurred_at", { ascending: true });

    return new Response(JSON.stringify({ ok: true, correlationId, caseId, instanceId, journeyId, outbox: outbox ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[simulator-whatsapp] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});