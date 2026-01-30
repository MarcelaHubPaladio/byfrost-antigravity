import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { normalizePhoneE164Like } from "../_shared/normalize.ts";

type InboundType = "text" | "image" | "audio" | "location";

type WebhookDirection = "inbound" | "outbound";

type JourneyInfo = {
  id: string;
  key: string;
  name?: string;
  default_state_machine_json?: any;
};

function pickFirst<T>(...values: Array<T | null | undefined>): T | null {
  for (const v of values) if (v !== null && v !== undefined && v !== "") return v as T;
  return null;
}

function extractPathAuth(reqUrl: string): { pathInstanceId: string | null; pathSecret: string | null } {
  try {
    const u = new URL(reqUrl);
    // Example:
    // /functions/v1/webhooks-zapi-inbound/<instanceId>/<secret>
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "webhooks-zapi-inbound");
    if (idx < 0) return { pathInstanceId: null, pathSecret: null };
    const after = parts.slice(idx + 1);
    return {
      pathInstanceId: after?.[0] ? decodeURIComponent(after[0]) : null,
      pathSecret: after?.[1] ? decodeURIComponent(after[1]) : null,
    };
  } catch {
    return { pathInstanceId: null, pathSecret: null };
  }
}

function forceDirectionFromUrl(reqUrl: string): WebhookDirection | null {
  try {
    const u = new URL(reqUrl);
    const raw = (u.searchParams.get("dir") ?? u.searchParams.get("direction") ?? "").toLowerCase();
    if (raw === "out" || raw === "outbound" || raw === "send" || raw === "sent") return "outbound";
    if (raw === "in" || raw === "inbound" || raw === "receive" || raw === "received") return "inbound";
    return null;
  } catch {
    return null;
  }
}

function normalizeInbound(payload: any): {
  zapiInstanceId: string | null;
  type: InboundType;
  from: string | null;
  to: string | null;
  text: string | null;
  mediaUrl: string | null;
  location: { lat: number; lng: number } | null;
  externalMessageId: string | null;
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

  // Z-API payloads vary; best-effort: accept chatId (ex: 551199...@c.us) too.
  const fromRaw = pickFirst(
    payload?.from,
    payload?.data?.from,
    payload?.sender?.phone,
    payload?.data?.sender?.phone,
    payload?.phone,
    payload?.chatId,
    payload?.data?.chatId,
    payload?.senderId,
    payload?.data?.senderId
  );
  const toRaw = pickFirst(payload?.to, payload?.data?.to, payload?.toPhone, payload?.data?.toPhone);

  const from = normalizePhoneE164Like(fromRaw);
  const to = normalizePhoneE164Like(toRaw);

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

  const latRaw = pickFirst(
    payload?.latitude,
    payload?.data?.latitude,
    payload?.location?.latitude,
    payload?.data?.location?.latitude
  );
  const lngRaw = pickFirst(
    payload?.longitude,
    payload?.data?.longitude,
    payload?.location?.longitude,
    payload?.data?.location?.longitude
  );

  const location =
    type === "location" && latRaw != null && lngRaw != null
      ? { lat: Number(latRaw), lng: Number(lngRaw) }
      : null;

  // External message id (for dedupe), when present.
  const externalMessageId =
    pickFirst<string>(
      payload?.messageId,
      payload?.message_id,
      payload?.data?.messageId,
      payload?.data?.message_id,
      payload?.id,
      payload?.data?.id
    ) ?? null;

  return {
    zapiInstanceId,
    type,
    from,
    to,
    text: text ?? null,
    mediaUrl: mediaUrl ?? null,
    location,
    externalMessageId,
    raw: payload,
  };
}

function inferDirection(args: {
  payload: any;
  normalized: { from: string | null; to: string | null };
  instancePhone: string | null;
}): WebhookDirection {
  const { payload, normalized, instancePhone } = args;

  // Some providers send explicit flags for messages sent by the connected account.
  if (payload?.fromMe === true || payload?.data?.fromMe === true) return "outbound";
  if (payload?.isFromMe === true || payload?.data?.isFromMe === true) return "outbound";

  const rawDirection = String(
    pickFirst(
      payload?.direction,
      payload?.data?.direction,
      payload?.event,
      payload?.hookType,
      payload?.webhookEvent,
      payload?.action
    ) ?? ""
  ).toLowerCase();

  if (rawDirection.includes("out") || rawDirection.includes("sent") || rawDirection.includes("send")) {
    return "outbound";
  }
  if (rawDirection.includes("in") || rawDirection.includes("received") || rawDirection.includes("receive")) {
    return "inbound";
  }

  // Heuristic: compare with instance phone.
  const inst = normalizePhoneE164Like(instancePhone);
  if (inst && normalized.from && normalized.from === inst) return "outbound";
  if (inst && normalized.to && normalized.to === inst) return "inbound";

  // Default safe assumption.
  return "inbound";
}

function safeStates(j: JourneyInfo | null | undefined) {
  const st = (j?.default_state_machine_json?.states ?? []) as any[];
  return Array.isArray(st) ? st.map((s) => String(s)).filter(Boolean) : [];
}

function pickInitialState(j: JourneyInfo, hint: string | null) {
  const states = safeStates(j);
  const def = String(j?.default_state_machine_json?.default ?? "new");
  if (hint && states.includes(hint)) return hint;
  if (states.includes(def)) return def;
  return states[0] ?? def;
}

function readCfg(obj: any, path: string) {
  const parts = path.split(".").filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function inferOutboundCounterpart(payload: any) {
  return normalizePhoneE164Like(
    pickFirst(
      payload?.to,
      payload?.data?.to,
      payload?.toPhone,
      payload?.data?.toPhone,
      // In some providers, chatId is the conversation target (e.g. 5511...@c.us)
      payload?.chatId,
      payload?.data?.chatId,
      payload?.phone,
      payload?.data?.phone,
      payload?.recipient,
      payload?.data?.recipient
    )
  );
}

serve(async (req) => {
  const fn = "webhooks-zapi-inbound";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const { pathInstanceId, pathSecret } = extractPathAuth(req.url);
    const forced = forceDirectionFromUrl(req.url);

    const supabase = createSupabaseAdmin();

    const lookupInstanceByZapiId = async (zapiInstanceId: string | null) => {
      if (!zapiInstanceId) return null;
      const { data, error } = await supabase
        .from("wa_instances")
        .select("id, tenant_id, webhook_secret, default_journey_id, phone_number")
        .eq("zapi_instance_id", zapiInstanceId)
        .maybeSingle();
      if (error) {
        console.error(`[${fn}] Failed to load wa_instance`, { error });
        return null;
      }
      return data as any;
    };

    const logInboxLite = async (args: {
      instance: any | null;
      zapiInstanceId: string | null;
      ok: boolean;
      http_status: number;
      reason: string;
      direction: WebhookDirection;
      payload_json?: any;
      meta_json?: any;
    }) => {
      try {
        await supabase.from("wa_webhook_inbox").insert({
          tenant_id: args.instance?.tenant_id ?? null,
          instance_id: args.instance?.id ?? null,
          zapi_instance_id: args.zapiInstanceId,
          direction: args.direction,
          wa_type: null,
          from_phone: null,
          to_phone: null,
          ok: args.ok,
          http_status: args.http_status,
          reason: args.reason,
          payload_json: args.payload_json ?? {},
          meta_json: args.meta_json ?? {},
          received_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error(`[${fn}] Failed to write wa_webhook_inbox (lite)`, { e });
      }
    };

    // Some providers do a GET to validate the webhook.
    if (req.method === "GET") {
      const zapiId = pathInstanceId;
      const instance = await lookupInstanceByZapiId(zapiId);
      await logInboxLite({
        instance,
        zapiInstanceId: zapiId,
        ok: true,
        http_status: 200,
        reason: "healthcheck_get",
        direction: forced ?? "inbound",
        meta_json: { method: "GET", url: req.url, forced_direction: forced ?? null },
      });
      return new Response("OK", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      const zapiId = pathInstanceId;
      const instance = await lookupInstanceByZapiId(zapiId);
      await logInboxLite({
        instance,
        zapiInstanceId: zapiId,
        ok: false,
        http_status: 405,
        reason: "method_not_allowed",
        direction: forced ?? "inbound",
        meta_json: { method: req.method, url: req.url, forced_direction: forced ?? null },
      });
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    // Parse JSON in a robust way (some webhook senders don't set content-type correctly)
    const rawBody = await req.text().catch(() => "");
    let payload: any = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      payload = null;
    }

    if (!payload) {
      const zapiId = pathInstanceId;
      const instance = await lookupInstanceByZapiId(zapiId);
      await logInboxLite({
        instance,
        zapiInstanceId: zapiId,
        ok: false,
        http_status: 400,
        reason: "invalid_json",
        direction: forced ?? "inbound",
        payload_json: { raw: String(rawBody ?? "").slice(0, 2000) },
        meta_json: { url: req.url, forced_direction: forced ?? null },
      });
      return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
    }

    const normalized = normalizeInbound(payload);
    const effectiveInstanceId = normalized.zapiInstanceId ?? pathInstanceId;

    if (!effectiveInstanceId) {
      console.warn(`[${fn}] Missing instance id`, { keys: Object.keys(payload ?? {}) });
      await logInboxLite({
        instance: null,
        zapiInstanceId: null,
        ok: false,
        http_status: 400,
        reason: "missing_instance_id",
        direction: forced ?? "inbound",
        payload_json: payload,
        meta_json: { url: req.url, forced_direction: forced ?? null },
      });
      return new Response("Missing instanceId", { status: 400, headers: corsHeaders });
    }

    const secretHeader = req.headers.get("x-webhook-secret") ?? req.headers.get("x-byfrost-webhook-secret");
    const secretQuery = new URL(req.url).searchParams.get("secret");
    const providedSecret = secretHeader ?? secretQuery ?? pathSecret;

    const correlationId = String(payload?.correlation_id ?? normalized.externalMessageId ?? crypto.randomUUID());

    const logInbox = async (args: {
      instance?: any;
      ok: boolean;
      http_status: number;
      reason?: string | null;
      case_id?: string | null;
      journey_id?: string | null;
      direction: WebhookDirection;
      meta?: any;
    }) => {
      const inst = args.instance;
      try {
        await supabase.from("wa_webhook_inbox").insert({
          tenant_id: inst?.tenant_id ?? null,
          instance_id: inst?.id ?? null,
          zapi_instance_id: effectiveInstanceId,
          direction: args.direction,
          wa_type: normalized.type,
          from_phone: normalized.from,
          to_phone: normalized.to,
          ok: args.ok,
          http_status: args.http_status,
          reason: args.reason ?? null,
          payload_json: payload,
          meta_json: {
            correlation_id: correlationId,
            journey_id: args.journey_id ?? null,
            case_id: args.case_id ?? null,
            external_message_id: normalized.externalMessageId,
            ...((args.meta ?? {}) as any),
          },
          received_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error(`[${fn}] Failed to write wa_webhook_inbox`, { e });
      }
    };

    const instance = await lookupInstanceByZapiId(effectiveInstanceId);

    if (!instance) {
      await logInboxLite({
        instance: null,
        zapiInstanceId: effectiveInstanceId,
        ok: false,
        http_status: 404,
        reason: "unknown_instance",
        direction: forced ?? "inbound",
        payload_json: payload,
        meta_json: { url: req.url, forced_direction: forced ?? null },
      });
      return new Response("Unknown instance", { status: 404, headers: corsHeaders });
    }

    const inferred = inferDirection({
      payload,
      normalized: { from: normalized.from, to: normalized.to },
      instancePhone: instance.phone_number ?? null,
    });

    // Hygiene: Sometimes the webhook is configured with a forced dir=inbound URL, but provider still
    // sends outbound events to that same endpoint. If we can strongly infer outbound, prefer it.
    const strongOutbound =
      inferred === "outbound" &&
      (payload?.fromMe === true ||
        payload?.data?.fromMe === true ||
        payload?.isFromMe === true ||
        payload?.data?.isFromMe === true ||
        (normalizePhoneE164Like(instance.phone_number ?? null) &&
          normalized.from === normalizePhoneE164Like(instance.phone_number ?? null)));

    const direction: WebhookDirection = forced && strongOutbound ? "outbound" : forced ?? inferred;

    if (!providedSecret || providedSecret !== instance.webhook_secret) {
      console.warn(`[${fn}] Invalid webhook secret`, { hasProvided: Boolean(providedSecret) });
      await logInbox({
        instance,
        ok: false,
        http_status: 401,
        reason: "unauthorized",
        direction,
        meta: { forced_direction: forced ?? null, inferred_direction: inferred, strong_outbound: strongOutbound },
      });
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    // Outbound webhook capture (messages sent outside Byfrost):
    // - We DO NOT create cases here.
    // - We try to link to the latest existing case by vendor phone or by extracted customer phone.
    if (direction === "outbound") {
      const instPhone = normalizePhoneE164Like(instance.phone_number ?? null);

      // Some providers don't send an explicit `to`, only chatId/phone.
      let counterpart = normalized.to ?? inferOutboundCounterpart(payload);

      // If normalization picked chatId as `from` (common), use it as counterpart.
      if ((!counterpart || (instPhone && counterpart === instPhone)) && normalized.from && normalized.from !== instPhone) {
        counterpart = normalized.from;
      }

      if (!counterpart) {
        await logInbox({
          instance,
          ok: false,
          http_status: 400,
          reason: "missing_to_phone",
          direction,
          meta: { forced_direction: forced ?? null, inferred_direction: inferred, strong_outbound: strongOutbound },
        });
        return new Response("Missing to", { status: 400, headers: corsHeaders });
      }

      // Pick the best sender phone (prefer instance phone for outbound)
      const fromPhone = instPhone ?? normalized.from ?? null;

      // Heuristic dedupe: same message content to same phone within 20s.
      const { data: possibleDup } = await supabase
        .from("wa_messages")
        .select("id")
        .eq("tenant_id", instance.tenant_id)
        .eq("instance_id", instance.id)
        .eq("direction", "outbound")
        .eq("to_phone", counterpart)
        .eq("type", normalized.type)
        .eq("body_text", normalized.text)
        .gte("occurred_at", new Date(Date.now() - 20_000).toISOString())
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (possibleDup?.id) {
        await logInbox({
          instance,
          ok: true,
          http_status: 200,
          reason: "possible_duplicate_ignored",
          direction,
          meta: {
            wa_message_id: possibleDup.id,
            forced_direction: forced ?? null,
            inferred_direction: inferred,
            strong_outbound: strongOutbound,
          },
        });
        return new Response(JSON.stringify({ ok: true, correlation_id: correlationId, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Link to an existing case:
      // Most common in Byfrost: instance sends a message back to a vendor (counterpart = vendor phone).
      // But we also support the opposite mapping (vendor phone = fromPhone) for setups where the sender is the vendor.
      let caseId: string | null = null;

      const vendorPhoneCandidates = Array.from(new Set([counterpart, fromPhone].filter(Boolean))) as string[];
      for (const vp of vendorPhoneCandidates) {
        const { data: vendor } = await supabase
          .from("vendors")
          .select("id")
          .eq("tenant_id", instance.tenant_id)
          .eq("phone_e164", vp)
          .maybeSingle();

        if (vendor?.id) {
          const { data: c } = await supabase
            .from("cases")
            .select("id")
            .eq("tenant_id", instance.tenant_id)
            .eq("assigned_vendor_id", vendor.id)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          caseId = (c as any)?.id ?? null;
          if (caseId) break;
        }

        const { data: cByMeta } = await supabase
          .from("cases")
          .select("id")
          .eq("tenant_id", instance.tenant_id)
          .eq("meta_json->>vendor_phone", vp)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        caseId = (cByMeta as any)?.id ?? null;
        if (caseId) break;
      }

      if (!caseId) {
        const digits = counterpart.replace(/\D/g, "");
        // only attempt if we have a reasonably long number
        if (digits.length >= 10) {
          const { data: cf } = await supabase
            .from("case_fields")
            .select("case_id,updated_at")
            .eq("tenant_id", instance.tenant_id)
            .eq("key", "phone")
            .ilike("value_text", `%${digits}%`)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          caseId = (cf as any)?.case_id ?? null;
        }
      }

      const { error: msgErr } = await supabase.from("wa_messages").insert({
        tenant_id: instance.tenant_id,
        instance_id: instance.id,
        direction: "outbound",
        from_phone: fromPhone,
        to_phone: counterpart,
        type: normalized.type,
        body_text: normalized.text,
        media_url: normalized.mediaUrl,
        payload_json: payload,
        correlation_id: correlationId,
        occurred_at: new Date().toISOString(),
        case_id: caseId,
      });

      if (msgErr) {
        console.error(`[${fn}] Failed to insert outbound wa_message`, { msgErr });
        await logInbox({
          instance,
          ok: false,
          http_status: 500,
          reason: "wa_message_insert_failed",
          direction,
          case_id: caseId,
          meta: { forced_direction: forced ?? null, inferred_direction: inferred, strong_outbound: strongOutbound },
        });
        return new Response("Failed to insert message", { status: 500, headers: corsHeaders });
      }

      await logInbox({
        instance,
        ok: true,
        http_status: 200,
        reason: caseId ? null : "outbound_unlinked_no_case",
        direction,
        case_id: caseId,
        meta: { forced_direction: forced ?? null, inferred_direction: inferred, strong_outbound: strongOutbound },
      });

      return new Response(JSON.stringify({ ok: true, correlation_id: correlationId, case_id: caseId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------- INBOUND routing below --------------------

    // Journey routing:
    // 1) instance.default_journey_id (if set)
    // 2) first enabled tenant_journey
    // 3) fallback to sales_order
    let journey: JourneyInfo | null = null;

    if (instance.default_journey_id) {
      // Note: algumas instalações não têm deleted_at em journeys. Evite filtrar por deleted_at aqui.
      const { data: j, error: jErr } = await supabase
        .from("journeys")
        .select("id,key,name,default_state_machine_json")
        .eq("id", instance.default_journey_id)
        .maybeSingle();
      if (jErr) {
        console.error(`[${fn}] Failed to load journey by default_journey_id`, {
          default_journey_id: instance.default_journey_id,
          jErr,
        });
      }
      if (j?.id) journey = j as any;
      if (!journey) {
        console.warn(`[${fn}] Instance default_journey_id not found`, {
          default_journey_id: instance.default_journey_id,
        });
      }
    }

    if (!journey) {
      const { data: tj, error: tjErr } = await supabase
        .from("tenant_journeys")
        .select("journey_id, journeys(id,key,name,default_state_machine_json)")
        .eq("tenant_id", instance.tenant_id)
        .eq("enabled", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (tjErr) console.error(`[${fn}] Failed to load tenant_journeys for routing`, { tjErr });
      if (tj?.journeys?.id) journey = tj.journeys as any;
    }

    if (!journey) {
      const { data: j, error: jErr } = await supabase
        .from("journeys")
        .select("id,key,name,default_state_machine_json")
        .eq("key", "sales_order")
        .maybeSingle();
      if (jErr) console.error(`[${fn}] Failed to load fallback journey sales_order`, { jErr });
      if (j?.id) journey = j as any;
    }

    if (!journey) {
      console.error(`[${fn}] No journey available for routing`, { tenantId: instance.tenant_id });
      await logInbox({ instance, ok: false, http_status: 500, reason: "journey_not_configured", direction });
      return new Response("Journey not configured", { status: 500, headers: corsHeaders });
    }

    console.log(`[${fn}] Routed inbound`, {
      tenant_id: instance.tenant_id,
      instance_id: instance.id,
      zapi_instance_id: effectiveInstanceId,
      journey_id: journey.id,
      journey_key: journey.key,
      wa_type: normalized.type,
      from: normalized.from,
    });

    // Read tenant+jornada config_json (panel-configurable)
    const { data: tJ, error: tJErr } = await supabase
      .from("tenant_journeys")
      .select("config_json")
      .eq("tenant_id", instance.tenant_id)
      .eq("journey_id", journey.id)
      .maybeSingle();
    if (tJErr) console.error(`[${fn}] Failed to load tenant_journeys config_json`, { tJErr });
    const cfg = (tJ as any)?.config_json ?? {};

    const cfgOcrEnabled = Boolean(readCfg(cfg, "automation.ocr.enabled"));
    const cfgPendenciesOnImage = Boolean(readCfg(cfg, "automation.on_image.create_default_pendencies"));
    const cfgInitialStateOnImage = (readCfg(cfg, "automation.on_image.initial_state") as string | undefined) ?? null;

    // Conversations / vendor rules (panel-configurable)
    const cfgAutoCreateVendor = (readCfg(cfg, "automation.conversations.auto_create_vendor") as boolean | undefined) ?? true;
    const cfgRequireVendor = Boolean(readCfg(cfg, "automation.conversations.require_vendor"));

    // Default: create case on text unless explicitly disabled.
    const cfgCreateCaseOnText = (readCfg(cfg, "automation.on_text.create_case") as boolean | undefined) ?? true;
    const cfgInitialStateOnText = (readCfg(cfg, "automation.on_text.initial_state") as string | undefined) ?? null;

    const cfgCreateCaseOnLocation = Boolean(readCfg(cfg, "automation.on_location.create_case"));
    const cfgInitialStateOnLocation =
      (readCfg(cfg, "automation.on_location.initial_state") as string | undefined) ?? null;
    const cfgLocationNextState = (readCfg(cfg, "automation.on_location.next_state") as string | undefined) ?? null;

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
      if (!vendorId && cfgAutoCreateVendor) {
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

    const findLatestActiveCase = async () => {
      // Prefer vendor_id; fallback to phone stored in meta_json.
      if (vendorId) {
        const { data } = await supabase
          .from("cases")
          .select("id,state,status")
          .eq("tenant_id", instance.tenant_id)
          .eq("journey_id", journey!.id)
          .eq("assigned_vendor_id", vendorId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return (data as any) ?? null;
      }

      if (!normalized.from) return null;
      const { data } = await supabase
        .from("cases")
        .select("id,state,status")
        .eq("tenant_id", instance.tenant_id)
        .eq("journey_id", journey!.id)
        .eq("meta_json->>vendor_phone", normalized.from)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as any) ?? null;
    };

    const ensureCase = async (mode: "image" | "text" | "location") => {
      // Reuse last active case when possible (keeps conversation inside a single case)
      const existing = await findLatestActiveCase();
      if (existing?.id) return { caseId: existing.id as string, created: false as const, skippedReason: null };

      if (mode === "text" && !cfgCreateCaseOnText) {
        return { caseId: null as any, created: false as const, skippedReason: "create_case_disabled_text" };
      }
      if (mode === "location" && !cfgCreateCaseOnLocation) {
        return { caseId: null as any, created: false as const, skippedReason: "create_case_disabled_location" };
      }

      // If we require vendor, enforce it; otherwise allow opening based on phone.
      if (cfgRequireVendor && !vendorId) {
        return { caseId: null as any, created: false as const, skippedReason: "missing_vendor_required" };
      }

      if (!normalized.from) {
        return { caseId: null as any, created: false as const, skippedReason: "missing_from_phone" };
      }

      const initialHint =
        mode === "image" ? cfgInitialStateOnImage : mode === "location" ? cfgInitialStateOnLocation : cfgInitialStateOnText;
      const initial = pickInitialState(journey!, initialHint);

      const title =
        mode === "image"
          ? journey!.key === "sales_order"
            ? "Pedido (foto recebida)"
            : `Novo caso (${journey!.name ?? journey!.key})`
          : journey!.key === "sales_order"
            ? "Conversa (WhatsApp)"
            : `Conversa (${journey!.name ?? journey!.key})`;

      // IMPORTANT: The current DB schema enforces a status check constraint.
      // Use the default/expected status "open".
      const { data: createdCase, error: cErr } = await supabase
        .from("cases")
        .insert({
          tenant_id: instance.tenant_id,
          journey_id: journey!.id,
          case_type: "order",
          status: "open",
          state: initial,
          created_by_channel: "whatsapp",
          created_by_vendor_id: vendorId,
          assigned_vendor_id: vendorId,
          title,
          meta_json: {
            correlation_id: correlationId,
            journey_key: journey!.key,
            zapi_instance: effectiveInstanceId,
            opened_by: mode,
            vendor_phone: normalized.from,
            vendor_required: cfgRequireVendor,
          },
        })
        .select("id")
        .single();

      if (cErr || !createdCase?.id) {
        console.error(`[${fn}] Failed to create case`, { cErr });
        return { caseId: null as any, created: false as const, skippedReason: "create_case_failed" };
      }

      await supabase.from("timeline_events").insert({
        tenant_id: instance.tenant_id,
        case_id: createdCase.id,
        event_type: "case_opened",
        actor_type: "system",
        actor_id: null,
        message: `Case aberto automaticamente (${mode}).`,
        meta_json: { correlation_id: correlationId, journey_key: journey!.key },
        occurred_at: new Date().toISOString(),
      });

      await supabase.rpc("append_audit_ledger", {
        p_tenant_id: instance.tenant_id,
        p_payload: {
          kind: "case_opened",
          correlation_id: correlationId,
          case_id: createdCase.id,
          from: normalized.from,
          instance: effectiveInstanceId,
          journey_id: journey!.id,
          journey_key: journey!.key,
          mode,
        },
      });

      return { caseId: createdCase.id as string, created: true as const, skippedReason: null };
    };

    // Decide case for this inbound
    let caseId: string | null = null;
    let skippedReason: string | null = null;

    if (normalized.type === "image") {
      const res = await ensureCase("image");
      caseId = res.caseId ?? null;
      skippedReason = (res as any).skippedReason ?? null;
    } else if (normalized.type === "location") {
      const res = await ensureCase("location");
      caseId = res.caseId ?? null;
      skippedReason = (res as any).skippedReason ?? null;
    } else {
      // text/audio
      const res = await ensureCase("text");
      caseId = res.caseId ?? null;
      skippedReason = (res as any).skippedReason ?? null;
    }

    console.log(`[${fn}] ensureCase`, { case_id: caseId, skippedReason, wa_type: normalized.type });

    // Write inbound message (always)
    const { data: insertedMsg, error: msgErr } = await supabase
      .from("wa_messages")
      .insert({
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
        case_id: caseId,
      })
      .select("id")
      .single();

    if (msgErr) {
      console.error(`[${fn}] Failed to insert wa_message`, { msgErr });
      await logInbox({
        instance,
        ok: false,
        http_status: 500,
        reason: "wa_message_insert_failed",
        journey_id: journey.id,
        case_id: caseId,
        direction,
      });
      return new Response("Failed to insert message", { status: 500, headers: corsHeaders });
    }

    // Usage event
    await supabase.from("usage_events").insert({
      tenant_id: instance.tenant_id,
      type: "message",
      qty: 1,
      ref_type: "wa_message",
      ref_id: insertedMsg?.id ?? null,
      meta_json: { direction: "inbound", wa_type: normalized.type },
      occurred_at: new Date().toISOString(),
    });

    // Always log inbox for observability
    await logInbox({
      instance,
      ok: true,
      http_status: 200,
      reason: skippedReason,
      journey_id: journey.id,
      case_id: caseId,
      direction,
      meta: {
        journey_key: journey.key,
        default_journey_id: instance.default_journey_id ?? null,
        create_case_on_text: cfgCreateCaseOnText,
        require_vendor: cfgRequireVendor,
        auto_create_vendor: cfgAutoCreateVendor,
        vendor_id: vendorId,
        forced_direction: forced ?? null,
        inferred_direction: inferred,
        strong_outbound: strongOutbound,
      },
    });

    // Routing
    if (normalized.type === "image") {
      // Attach image to the active case
      if (caseId && normalized.mediaUrl) {
        await supabase.from("case_attachments").insert({
          tenant_id: instance.tenant_id,
          case_id: caseId,
          kind: "image",
          storage_path: normalized.mediaUrl,
          original_filename: payload?.fileName ?? null,
          content_type: payload?.mimeType ?? null,
          meta_json: { source: "zapi", correlation_id: correlationId },
        });
      }

      if (caseId) {
        await supabase.from("timeline_events").insert({
          tenant_id: instance.tenant_id,
          case_id: caseId,
          event_type: "inbound_image",
          actor_type: "vendor",
          actor_id: vendorId,
          message: cfgOcrEnabled
            ? "Imagem recebida. OCR será executado conforme configuração do fluxo."
            : "Imagem recebida via WhatsApp.",
          meta_json: { correlation_id: correlationId, journey_key: journey.key },
          occurred_at: new Date().toISOString(),
        });
      }

      // Default pendencies (configurable) — only when a case exists
      if (caseId && cfgPendenciesOnImage) {
        await supabase.from("pendencies").insert([
          {
            tenant_id: instance.tenant_id,
            case_id: caseId,
            type: "need_location",
            assigned_to_role: "vendor",
            question_text: "Envie sua localização (WhatsApp: Compartilhar localização).",
            required: true,
            status: "open",
            due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          },
          {
            tenant_id: instance.tenant_id,
            case_id: caseId,
            type: "need_more_pages",
            assigned_to_role: "vendor",
            question_text: "Tem mais alguma folha desse pedido? Se sim, envie as próximas fotos. Se não, responda: última folha.",
            required: false,
            status: "open",
            due_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          },
        ]);
      }

      // OCR pipeline (configurable)
      if (caseId && cfgOcrEnabled) {
        await enqueueJob("OCR_IMAGE", `OCR_IMAGE:${caseId}`, {
          case_id: caseId,
          correlation_id: correlationId,
        });
        await enqueueJob("VALIDATE_FIELDS", `VALIDATE_FIELDS:${caseId}`, {
          case_id: caseId,
          correlation_id: correlationId,
        });
        await enqueueJob("ASK_PENDENCIES", `ASK_PENDENCIES:${caseId}:${Date.now()}`, {
          case_id: caseId,
          correlation_id: correlationId,
        });
      }

      if (caseId) {
        await supabase.rpc("append_audit_ledger", {
          p_tenant_id: instance.tenant_id,
          p_payload: {
            kind: "wa_inbound_routed",
            correlation_id: correlationId,
            case_id: caseId,
            from: normalized.from,
            instance: effectiveInstanceId,
            journey_id: journey.id,
            journey_key: journey.key,
            cfg_ocr_enabled: cfgOcrEnabled,
          },
        });
      }

      return new Response(JSON.stringify({ ok: true, correlation_id: correlationId, case_id: caseId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (normalized.type === "location") {
      if (!normalized.location) {
        return new Response("Missing location", { status: 400, headers: corsHeaders });
      }

      if (!caseId) {
        return new Response(JSON.stringify({ ok: true, note: "No open case" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("case_fields")
        .upsert({
          tenant_id: instance.tenant_id,
          case_id: caseId,
          key: "location",
          value_json: normalized.location,
          value_text: `${normalized.location.lat},${normalized.location.lng}`,
          confidence: 1,
          source: "vendor",
          last_updated_by: "whatsapp_location",
        });

      // (Optional) answer a standard pendency if present
      await supabase
        .from("pendencies")
        .update({ status: "answered", answered_text: "Localização enviada", answered_payload_json: normalized.location })
        .eq("tenant_id", instance.tenant_id)
        .eq("case_id", caseId)
        .eq("type", "need_location")
        .eq("status", "open");

      await supabase.from("timeline_events").insert({
        tenant_id: instance.tenant_id,
        case_id: caseId,
        event_type: "location_received",
        actor_type: "vendor",
        actor_id: vendorId,
        message: "Localização recebida via WhatsApp.",
        meta_json: { correlation_id: correlationId, ...normalized.location, journey_key: journey.key },
        occurred_at: new Date().toISOString(),
      });

      if (cfgLocationNextState && safeStates(journey).includes(cfgLocationNextState)) {
        await supabase.from("cases").update({ state: cfgLocationNextState }).eq("id", caseId);
      }

      return new Response(JSON.stringify({ ok: true, correlation_id: correlationId, case_id: caseId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // text/audio
    if (normalized.type === "text" || normalized.type === "audio") {
      if (!caseId) {
        return new Response(JSON.stringify({ ok: true, note: "No open case" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const answerText = normalized.type === "audio" ? "(áudio recebido - transcrição pendente)" : normalized.text;

      // Minimal behavior: if there is an open vendor pendency, answer it.
      const { data: pendency } = await supabase
        .from("pendencies")
        .select("id")
        .eq("tenant_id", instance.tenant_id)
        .eq("case_id", caseId)
        .eq("assigned_to_role", "vendor")
        .eq("status", "open")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (pendency?.id) {
        await supabase
          .from("pendencies")
          .update({ status: "answered", answered_text: answerText, answered_payload_json: payload })
          .eq("id", pendency.id);
      }

      await supabase.from("timeline_events").insert({
        tenant_id: instance.tenant_id,
        case_id: caseId,
        event_type: "vendor_reply",
        actor_type: "vendor",
        actor_id: vendorId,
        message: `Mensagem do vendedor recebida${normalized.type === "audio" ? " (áudio)" : ""}.`,
        meta_json: { correlation_id: correlationId, journey_key: journey.key },
        occurred_at: new Date().toISOString(),
      });

      // If OCR pipeline is enabled for this journey, keep validating/asking.
      if (cfgOcrEnabled) {
        await enqueueJob("VALIDATE_FIELDS", `VALIDATE_FIELDS:${caseId}:${Date.now()}`, {
          case_id: caseId,
          correlation_id: correlationId,
        });
        await enqueueJob("ASK_PENDENCIES", `ASK_PENDENCIES:${caseId}:${Date.now()}`, {
          case_id: caseId,
          correlation_id: correlationId,
        });
      }

      return new Response(JSON.stringify({ ok: true, correlation_id: correlationId, case_id: caseId }), {
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