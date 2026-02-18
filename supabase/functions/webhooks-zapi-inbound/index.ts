import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { normalizePhoneE164Like } from "../_shared/normalize.ts";
import { clockPresencePunch, getPresenceTenantConfig, type PresencePunchType } from "../_shared/presence.ts";

type InboundType = "text" | "image" | "audio" | "video" | "location";

type WebhookDirection = "inbound" | "outbound";

type JourneyInfo = {
  id: string;
  key: string;
  name?: string;
  is_crm?: boolean;
  default_state_machine_json?: any;
};

function pickFirst<T>(...values: Array<T | null | undefined>): T | null {
  for (const v of values) if (v !== null && v !== undefined && v !== "") return v as T;
  return null;
}

function digitsOnly(v: string | null | undefined) {
  return String(v ?? "").replace(/\D/g, "");
}

function buildBrPhoneVariantsE164(phoneE164: string | null | undefined) {
  const digits = digitsOnly(phoneE164);
  const out = new Set<string>();
  if (!digits) return out;

  // normalize base
  const dNo00 = digits.replace(/^00+/, "");
  const dNo55 = dNo00.startsWith("55") ? dNo00.slice(2) : dNo00;

  const add = (d: string) => {
    const dd = digitsOnly(d);
    if (!dd) return;
    // Always store as E.164-like +...
    if (dd.startsWith("55")) out.add(`+${dd}`);
    else out.add(`+55${dd}`);
  };

  // base
  add(dNo00);
  add(dNo55);

  // mobile 9-digit variants
  if (dNo55.length === 11 && dNo55[2] === "9") {
    // remove extra 9
    add(dNo55.slice(0, 2) + dNo55.slice(3));
  }
  if (dNo55.length === 10) {
    // insert extra 9
    add(dNo55.slice(0, 2) + "9" + dNo55.slice(2));
  }

  // Also add tail-based variants (common imports without country)
  if (dNo55.length >= 10) add(dNo55.slice(-10));
  if (dNo55.length >= 11) add(dNo55.slice(-11));

  return out;
}

function looksLikeWhatsAppGroupId(v: any) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return false;

  // Common WhatsApp non-user chats
  if (s.includes("status@broadcast")) return true;
  if (s.includes("@g.us") || s.includes("g.us")) return true;

  const digits = s.replace(/\D/g, "");
  if (!digits) return false;

  // Many WA group ids start with 1203... (sometimes prefixed by country)
  const d = digits.startsWith("55") ? digits.slice(2) : digits;
  if (d.startsWith("1203") && d.length >= 16) return true;

  return false;
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

function normalizePresenceCommand(
  text: string | null | undefined
): { raw: "ENTRADA" | "SAIDA" | "INTERVALO" | "VOLTEI"; forcedType: PresencePunchType } | null {
  const t = String(text ?? "").trim().toUpperCase();
  if (!t) return null;
  if (t === "ENTRADA") return { raw: "ENTRADA", forcedType: "ENTRY" };
  if (t === "SAIDA" || t === "SAÍDA") return { raw: "SAIDA", forcedType: "EXIT" };
  if (t === "INTERVALO") return { raw: "INTERVALO", forcedType: "BREAK_START" };
  if (t === "VOLTEI") return { raw: "VOLTEI", forcedType: "BREAK_END" };
  return null;
}

function detectCallEvent(payload: any, rawTypeLower: string) {
  // Providers vary. IMPORTANT: avoid false-positives like "receivedcallback" (contains "call").
  // Only mark as call when we have explicit evidence.

  const t = String(rawTypeLower ?? "").toLowerCase();

  // Explicit type patterns
  if ((/(^|[^a-z])call([^a-z]|$)/i).test(t)) return true; // matches "call", "call_event", "call-event" etc; NOT "callback"
  if (t.startsWith("call_")) return true;
  if (t.endsWith("_call")) return true;

  // Explicit event/hook markers
  if (String(payload?.event ?? "").toLowerCase().includes("call")) return true;
  if (String(payload?.hookType ?? "").toLowerCase().includes("call")) return true;

  // Structured call objects/ids
  if (payload?.call || payload?.data?.call) return true;
  if (payload?.callId || payload?.data?.callId) return true;

  return false;
}

function extractCallPeerPhones(payload: any): { from: string | null; to: string | null; status: string | null } {
  // Best-effort across common schemas.
  const call = payload?.call ?? payload?.data?.call ?? null;

  const fromRaw = pickFirst(
    call?.from,
    call?.caller,
    call?.callerPhone,
    payload?.caller,
    payload?.callerPhone,
    payload?.data?.caller,
    payload?.data?.callerPhone
  );

  const toRaw = pickFirst(call?.to, call?.callee, call?.calleePhone, payload?.callee, payload?.data?.callee);

  const statusRaw = pickFirst(call?.status, call?.type, payload?.callStatus, payload?.data?.callStatus, payload?.event);

  return {
    from: normalizePhoneE164Like(fromRaw),
    to: normalizePhoneE164Like(toRaw),
    status: statusRaw ? String(statusRaw) : null,
  };
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
  meta: { isCallEvent: boolean; callStatus: string | null; rawType: string };
  raw: any;
} {
  const zapiInstanceId = pickFirst<string>(payload?.instanceId, payload?.instance_id, payload?.instance);

  const rawType = String(
    pickFirst(
      payload?.type,
      payload?.messageType,
      payload?.data?.type,
      payload?.data?.messageType,
      payload?.message?.type,
      payload?.event,
      payload?.hookType
    ) ?? "text"
  ).toLowerCase();

  const callInfo = extractCallPeerPhones(payload);
  const isCallEvent = detectCallEvent(payload, rawType);

  const mime = String(
    pickFirst(
      payload?.mimeType,
      payload?.mimetype,
      payload?.data?.mimeType,
      payload?.data?.mimetype,

      // Audio
      payload?.audio?.mimeType,
      payload?.audio?.mimetype,
      payload?.data?.audio?.mimeType,
      payload?.data?.audio?.mimetype,

      // Video
      payload?.video?.mimeType,
      payload?.video?.mimetype,
      payload?.data?.video?.mimeType,
      payload?.data?.video?.mimetype,

      // Image (IMPORTANT: Z-API sends image info under payload.image)
      payload?.image?.mimeType,
      payload?.image?.mimetype,
      payload?.data?.image?.mimeType,
      payload?.data?.image?.mimetype,

      // Document
      payload?.document?.mimeType,
      payload?.document?.mimetype,
      payload?.data?.document?.mimeType,
      payload?.data?.document?.mimetype
    ) ?? ""
  ).toLowerCase();

  const isImageMime = mime.startsWith("image/") || mime.includes("jpeg") || mime.includes("png") || mime.includes("webp");
  const isAudioMime = mime.startsWith("audio/") || mime.includes("ogg") || mime.includes("opus") || mime.includes("mpeg");
  const isVideoMime = mime.startsWith("video/") || mime.includes("mp4") || mime.includes("webm");

  const hasImage = Boolean(payload?.image?.imageUrl || payload?.data?.image?.imageUrl || payload?.image?.thumbnailUrl || payload?.data?.image?.thumbnailUrl);

  const type: InboundType =
    rawType.includes("image") || rawType.includes("photo") || isImageMime || hasImage
      ? "image"
      : rawType.includes("video") || isVideoMime || payload?.video || payload?.data?.video
        ? "video"
        : rawType.includes("audio") || rawType.includes("ptt") || isAudioMime || payload?.audio || payload?.data?.audio
          ? "audio"
          : rawType.includes("location")
            ? "location"
            : "text";

  // Z-API payloads vary; best-effort: accept chatId (ex: 5511...@c.us) too.
  // For call events, some providers store caller/callee in different fields.
  const fromRaw = pickFirst(
    callInfo.from,
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
  const toRaw = pickFirst(
    callInfo.to,
    payload?.to,
    payload?.data?.to,
    payload?.toPhone,
    payload?.data?.toPhone
  );

  const from = normalizePhoneE164Like(fromRaw);
  const to = normalizePhoneE164Like(toRaw);

  // Common Z-API schema: payload.text.message (and link previews)
  const textMessage = pickFirst<string>(payload?.text?.message, payload?.data?.text?.message);
  const textTitle = pickFirst<string>(payload?.text?.title, payload?.data?.text?.title);
  const textUrl = pickFirst<string>(payload?.text?.url, payload?.data?.text?.url);
  const textDescription = pickFirst<string>(payload?.text?.description, payload?.data?.text?.description);

  const text =
    textMessage ??
    pickFirst<string>(
      payload?.text,
      payload?.body,
      payload?.message,
      payload?.data?.text,
      payload?.data?.body,
      payload?.data?.message,
      payload?.caption,
      payload?.data?.caption,
      // Z-API images/videos often have caption nested
      payload?.image?.caption,
      payload?.data?.image?.caption,
      payload?.video?.caption,
      payload?.data?.video?.caption,
      // Link preview fallbacks
      textTitle,
      textDescription,
      textUrl
    );

  const mediaUrl = pickFirst<string>(
    payload?.mediaUrl,
    payload?.media_url,
    payload?.url,
    payload?.data?.mediaUrl,
    payload?.data?.url,
    payload?.data?.media_url,
    payload?.audio?.audioUrl,
    payload?.data?.audio?.audioUrl,
    payload?.video?.videoUrl,
    payload?.data?.video?.videoUrl,
    payload?.sticker?.stickerUrl,
    payload?.data?.sticker?.stickerUrl,
    payload?.image?.imageUrl,
    payload?.data?.image?.imageUrl
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

  // If it's a call event but the sender didn't provide a usable text, create a readable text.
  const synthesizedText = isCallEvent
    ? `📞 Evento de ligação${callInfo.status ? ` (${callInfo.status})` : ""}`
    : null;

  return {
    zapiInstanceId,
    type,
    from,
    to,
    text: (text ?? null) || synthesizedText,
    mediaUrl: mediaUrl ?? null,
    location,
    externalMessageId,
    meta: { isCallEvent, callStatus: callInfo.status, rawType },
    raw: payload,
  };
}

function isNonMessageCallbackEvent(args: {
  rawType: string;
  payload: any;
  normalized: { text: string | null; mediaUrl: string | null; location: any };
}) {
  const t = String(args.rawType ?? "").toLowerCase();

  // We only ignore when we have strong evidence this is a status/receipt callback (not user content).
  const looksCallback =
    t.includes("callback") ||
    t.includes("ack") ||
    t.includes("receipt") ||
    t.includes("delivered") ||
    t.includes("delivery") ||
    t.includes("read") ||
    t.includes("seen") ||
    t.includes("status") ||
    t.includes("presence") ||
    t.includes("connection") ||
    t.includes("connected") ||
    t.includes("disconnected");

  if (!looksCallback) return false;

  // Z-API flag: waitingMessage=true frequently indicates a "receipt/callback" without actual user message.
  if (args.payload?.waitingMessage === true || args.payload?.data?.waitingMessage === true) {
    const hasContent = Boolean(args.normalized.text || args.normalized.mediaUrl || args.normalized.location);
    if (!hasContent) return true;
  }

  const hasContent = Boolean(args.normalized.text || args.normalized.mediaUrl || args.normalized.location);
  if (hasContent) return false;

  return true;
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
      payload?.action,
      payload?.data?.action,
      // Some providers encode direction in the type/messageType itself
      payload?.type,
      payload?.messageType,
      payload?.data?.type,
      payload?.data?.messageType
    ) ?? ""
  ).toLowerCase();

  if (rawDirection.includes("out") || rawDirection.includes("sent") || rawDirection.includes("send") || rawDirection.includes("outgoing")) {
    return "outbound";
  }
  if (rawDirection.includes("in") || rawDirection.includes("received") || rawDirection.includes("receive") || rawDirection.includes("incoming")) {
    return "inbound";
  }

  // Heuristic: compare with instance phone.
  const inst = normalizePhoneE164Like(instancePhone);
  if (inst && normalized.from && normalized.from === inst) return "outbound";
  if (inst && normalized.to && normalized.to === inst) return "inbound";

  // Default safe assumption.
  return "inbound";
}

function detectFromMe(payload: any) {
  // Broad detection for outbound/sent events across providers.
  // Keep it safe: only return true when we have explicit evidence.
  if (!payload) return false;
  const direct =
    payload?.fromMe === true ||
    payload?.isFromMe === true ||
    payload?.sentByMe === true ||
    payload?.sendByMe === true ||
    payload?.data?.fromMe === true ||
    payload?.data?.isFromMe === true ||
    payload?.data?.sentByMe === true ||
    payload?.data?.sendByMe === true;
  if (direct) return true;

  const raw = String(
    pickFirst(
      payload?.direction,
      payload?.data?.direction,
      payload?.event,
      payload?.hookType,
      payload?.action,
      payload?.data?.action,
      payload?.type,
      payload?.messageType,
      payload?.data?.type,
      payload?.data?.messageType
    ) ?? ""
  ).toLowerCase();

  // Z-API/webhook naming patterns
  if (raw.includes("message_sent") || raw.includes("messagesent")) return true;
  if (raw.includes("outgoing") || raw.includes("outbound")) return true;
  if (raw.includes("sent") || raw.includes("send")) return true;

  return false;
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
  const raw = pickFirst(
    payload?.to,
    payload?.data?.to,
    payload?.toPhone,
    payload?.data?.toPhone,
    payload?.chatId,
    payload?.data?.chatId,
    payload?.phone,
    payload?.data?.phone,
    payload?.recipient,
    payload?.data?.recipient,
    payload?.peer
  );
  if (looksLikeWhatsAppGroupId(raw)) return raw;
  return normalizePhoneE164Like(raw);
}

function inferContactLabel(payload: any, fallbackPhone: string | null) {
  const name =
    (payload?.senderName as string | undefined) ??
    (payload?.sender?.name as string | undefined) ??
    (payload?.data?.senderName as string | undefined) ??
    (payload?.data?.sender?.name as string | undefined) ??
    null;
  const clean = typeof name === "string" ? name.trim() : "";
  return clean ? clean : fallbackPhone;
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

      // IMPORTANT: We cannot use maybeSingle() here because, in the real world, it's common to
      // accidentally have duplicated rows (e.g. one deleted row + one active row) sharing the same
      // zapi_instance_id. We'll pick the most recently updated ACTIVE row.
      const { data, error } = await supabase
        .from("wa_instances")
        .select("id, tenant_id, name, webhook_secret, default_journey_id, phone_number, assigned_user_id, status, deleted_at, updated_at")
        .eq("zapi_instance_id", zapiInstanceId)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(2);

      if (error) {
        console.error(`[${fn}] Failed to load wa_instance`, { error });
        return null;
      }

      const rows = (data as any[]) ?? [];
      if (rows.length > 1) {
        console.warn(`[${fn}] Duplicate wa_instances rows for zapi_instance_id (using the latest)`, {
          zapi_instance_id: zapiInstanceId,
          picked_instance_id: rows[0]?.id,
          other_instance_id: rows[1]?.id,
        });
      }

      return rows?.[0] ?? null;
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

    // Debug: if we failed to parse phones, log candidate fields (helps when providers change schemas).
    if (!normalized.from || !normalized.to) {
      console.warn(`[${fn}] normalize_inbound_missing_phones`, {
        zapi_instance_id: normalized.zapiInstanceId ?? pathInstanceId ?? null,
        raw_type: normalized.meta.rawType,
        candidates: {
          from: payload?.from,
          data_from: payload?.data?.from,
          sender_phone: payload?.sender?.phone,
          data_sender_phone: payload?.data?.sender?.phone,
          phone: payload?.phone,
          chatId: payload?.chatId,
          data_chatId: payload?.data?.chatId,
          senderId: payload?.senderId,
          data_senderId: payload?.data?.senderId,
          to: payload?.to,
          data_to: payload?.data?.to,
          toPhone: payload?.toPhone,
          data_toPhone: payload?.data?.toPhone,
        },
      });
    }

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
            raw_type: normalized.meta.rawType,
            call_event: normalized.meta.isCallEvent,
            call_status: normalized.meta.callStatus,
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

    // If this is a call event, we want to ensure we attach it to the "other" phone (caller/callee),
    // not to the instance phone.
    const instancePhoneNorm = normalizePhoneE164Like(instance.phone_number ?? null);

    // NEW: For CRM ownership, prefer the instance's assigned_user_id (if present).
    // This lets you keep the "owner" stable even if the WhatsApp number on the instance changes.
    let sellerPhoneNorm = instancePhoneNorm;
    let sellerDisplayName = String((instance as any)?.name ?? "").trim() || (sellerPhoneNorm ? `Vendedor ${sellerPhoneNorm}` : "Vendedor");

    if ((instance as any)?.assigned_user_id) {
      try {
        const { data: up } = await supabase
          .from("users_profile")
          .select("phone_e164,display_name,email")
          .eq("tenant_id", String((instance as any).tenant_id))
          .eq("user_id", String((instance as any).assigned_user_id))
          .is("deleted_at", null)
          .maybeSingle();

        const upPhone = normalizePhoneE164Like((up as any)?.phone_e164 ?? null);
        if (upPhone) sellerPhoneNorm = upPhone;

        const label = String((up as any)?.display_name ?? (up as any)?.email ?? "").trim();
        if (label) sellerDisplayName = label;
      } catch (e) {
        console.warn(`[${fn}] Failed to load assigned_user profile (ignored)`, { e: String((e as any)?.message ?? e) });
      }
    }

    const callCounterpartPhone =
      normalized.meta.isCallEvent && instancePhoneNorm
        ? (normalized.from && normalized.from === instancePhoneNorm
          ? normalized.to
          : normalized.to && normalized.to === instancePhoneNorm
            ? normalized.from
            : normalized.from) // default
        : null;

    // For call events, treat the peer (caller/callee) as the effective sender for matching/case linking.
    const inboundFromPhone =
      normalized.meta.isCallEvent && callCounterpartPhone ? callCounterpartPhone : normalized.from;

    // If provider doesn't send an explicit "to", assume the connected instance phone for inbound.
    const inboundToPhone =
      normalized.meta.isCallEvent && inboundFromPhone && instancePhoneNorm
        ? instancePhoneNorm
        : (normalized.to ?? instancePhoneNorm);

    if (!inboundFromPhone) {
      console.warn(`[${fn}] inbound_missing_from_phone`, {
        tenant_id: instance.tenant_id,
        zapi_instance_id: effectiveInstanceId,
        instance_phone: instancePhoneNorm,
        normalized_from: normalized.from,
        normalized_to: normalized.to,
        raw_type: normalized.meta.rawType,
      });
    }

    if (normalized.meta.isCallEvent) {
      console.log(`[${fn}] call_event_detected`, {
        tenant_id: instance.tenant_id,
        instance_phone: instancePhoneNorm,
        from: normalized.from,
        to: normalized.to,
        counterpart: callCounterpartPhone,
        effective_from: inboundFromPhone,
        effective_to: inboundToPhone,
        raw_type: payload?.type ?? payload?.messageType ?? payload?.event ?? payload?.hookType,
      });
    }

    const inferred = inferDirection({
      payload,
      normalized: { from: normalized.from, to: normalized.to },
      instancePhone: instance.phone_number ?? null,
    });

    const explicitFromMe = detectFromMe(payload);

    // Hygiene: Sometimes the webhook is configured with a forced dir=inbound URL, but provider still
    // sends outbound events to that same endpoint. If we can strongly infer outbound, prefer it.
    const strongOutbound =
      (inferred === "outbound" || explicitFromMe) &&
      (payload?.fromMe === true ||
        payload?.data?.fromMe === true ||
        payload?.isFromMe === true ||
        payload?.data?.isFromMe === true ||
        explicitFromMe ||
        (instancePhoneNorm && normalized.from === instancePhoneNorm));

    // For call events, if we could identify a counterpart phone, treat them as inbound by default.
    const direction: WebhookDirection =
      normalized.meta.isCallEvent && callCounterpartPhone
        ? (forced === "outbound" ? "outbound" : "inbound")
        : forced && strongOutbound
          ? "outbound"
          : forced ?? inferred;

    console.log(`[${fn}] direction_resolved`, {
      tenant_id: instance.tenant_id,
      zapi_instance_id: effectiveInstanceId,
      instance_phone: instancePhoneNorm,
      normalized_from: normalized.from,
      normalized_to: normalized.to,
      forced_direction: forced ?? null,
      inferred_direction: inferred,
      explicit_from_me: explicitFromMe,
      strong_outbound: strongOutbound,
      raw_direction: String(pickFirst(payload?.direction, payload?.data?.direction, payload?.event, payload?.hookType, payload?.action) ?? ""),
    });

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

    // Ignore WhatsApp group/broadcast identifiers (we don't open cases from groups).
    const isGroupMsg =
      payload?.isGroupMsg === true ||
      payload?.data?.isGroupMsg === true ||
      payload?.isGroup === true ||
      payload?.data?.isGroup === true;

    const groupLike =
      isGroupMsg ||
      looksLikeWhatsAppGroupId(pickFirst(payload?.chatId, payload?.data?.chatId)) ||
      looksLikeWhatsAppGroupId(pickFirst(payload?.to, payload?.data?.to, payload?.toPhone, payload?.data?.toPhone)) ||
      looksLikeWhatsAppGroupId(pickFirst(payload?.from, payload?.data?.from, payload?.senderId, payload?.data?.senderId)) ||
      looksLikeWhatsAppGroupId(normalized.to) ||
      looksLikeWhatsAppGroupId(normalized.from);

    // EARLY GROUP CHECK REMOVED:
    // We used to block all groups here, but we now support monitoring specific groups (see below).
    // The specific logic at line ~1426 handles ignoring unmonitored groups.
    /*
    if (groupLike) {
      await logInbox({ ... });
      return ...;
    }
    */

    // Ignore provider callbacks/receipts (delivery/read/ack/etc) that carry no user content.
    // These events must never open cases.
    if (isNonMessageCallbackEvent({ rawType: normalized.meta.rawType, payload, normalized })) {
      await logInbox({
        instance,
        ok: true,
        http_status: 200,
        reason: "non_message_event_ignored",
        direction,
        meta: { forced_direction: forced ?? null, inferred_direction: inferred, strong_outbound: strongOutbound },
      });

      return new Response(JSON.stringify({ ok: true, ignored: true, reason: "non_message_event_ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // INBOUND idempotency (best-effort): if the provider sends a stable external message id,
    // prevent duplicate processing/case creation.
    if (direction === "inbound" && normalized.externalMessageId) {
      const { data: existingInbound } = await supabase
        .from("wa_messages")
        .select("id, case_id")
        .eq("tenant_id", instance.tenant_id)
        .eq("instance_id", instance.id)
        .eq("direction", "inbound")
        .eq("correlation_id", correlationId)
        .limit(1)
        .maybeSingle();

      if (existingInbound?.id) {
        await logInbox({
          instance,
          ok: true,
          http_status: 200,
          reason: "duplicate_ignored",
          direction,
          case_id: (existingInbound as any).case_id ?? null,
          meta: { forced_direction: forced ?? null, inferred_direction: inferred, strong_outbound: strongOutbound },
        });

        return new Response(JSON.stringify({ ok: true, correlation_id: correlationId, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // -------------------- Presence (WhatsApp clocking) — feature flagged per tenant --------------------
    // This MUST NOT interfere with other journeys.
    if (direction === "inbound") {
      const presenceCfg = await getPresenceTenantConfig(supabase as any, String(instance.tenant_id)).catch(() => null);
      const allowPresenceWa = Boolean(presenceCfg?.enabled && presenceCfg?.flags?.presence_allow_whatsapp_clocking);

      if (allowPresenceWa && normalized.from) {
        const command = normalizePresenceCommand(normalized.text);

        const upsertContactMeta = async (patch: any) => {
          const { data: existing } = await supabase
            .from("wa_contacts")
            .select("meta_json")
            .eq("tenant_id", instance.tenant_id)
            .eq("phone_e164", normalized.from)
            .is("deleted_at", null)
            .maybeSingle();

          const merged = { ...((existing as any)?.meta_json ?? {}), ...patch };

          await supabase
            .from("wa_contacts")
            .upsert(
              {
                tenant_id: instance.tenant_id,
                phone_e164: normalized.from,
                name: null,
                role_hint: "employee",
                meta_json: merged,
              },
              { onConflict: "tenant_id,phone_e164" }
            );
        };

        const writeInboundMessage = async () => {
          await supabase.from("wa_messages").insert({
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
            case_id: null,
          });
        };

        // 1) Command message => stage command, require location next.
        if (normalized.type === "text" && command) {
          await upsertContactMeta({
            presence_pending_command: command.raw,
            presence_pending_command_at: new Date().toISOString(),
          });

          await writeInboundMessage();

          await logInbox({
            instance,
            ok: true,
            http_status: 200,
            reason: "presence_command_staged",
            direction,
            meta: {
              correlation_id: correlationId,
              command: command.raw,
              forced_type: command.forcedType,
            },
          });

          return new Response(JSON.stringify({ ok: true, presence: { staged: true, command: command.raw } }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // 2) Location message => must have a command (either inline text or pending from previous message).
        if (normalized.type === "location" && normalized.location) {
          const inlineCmd = normalizePresenceCommand(normalized.text);

          const { data: contact } = await supabase
            .from("wa_contacts")
            .select("meta_json")
            .eq("tenant_id", instance.tenant_id)
            .eq("phone_e164", normalized.from)
            .is("deleted_at", null)
            .maybeSingle();

          const pendingRaw = String((contact as any)?.meta_json?.presence_pending_command ?? "").trim().toUpperCase();
          const pendingAt = String((contact as any)?.meta_json?.presence_pending_command_at ?? "");
          const pending = normalizePresenceCommand(pendingRaw);

          const used = inlineCmd ?? pending;

          // Require a command.
          if (!used) {
            await writeInboundMessage();
            await logInbox({
              instance,
              ok: true,
              http_status: 200,
              reason: "presence_missing_command",
              direction,
              meta: { correlation_id: correlationId },
            });
            return new Response(JSON.stringify({ ok: true, presence: { handled: false, reason: "missing_command" } }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // If it came from pending, enforce freshness (10 minutes).
          if (!inlineCmd && pendingAt) {
            const dt = Date.parse(pendingAt);
            if (!Number.isNaN(dt) && Date.now() - dt > 10 * 60_000) {
              await upsertContactMeta({ presence_pending_command: null, presence_pending_command_at: null });
              await writeInboundMessage();
              await logInbox({
                instance,
                ok: true,
                http_status: 200,
                reason: "presence_pending_command_expired",
                direction,
                meta: { correlation_id: correlationId },
              });
              return new Response(
                JSON.stringify({ ok: true, presence: { handled: false, reason: "pending_command_expired" } }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }

          // Map phone -> employee user
          const { data: employee } = await supabase
            .from("users_profile")
            .select("user_id")
            .eq("tenant_id", instance.tenant_id)
            .eq("phone_e164", normalized.from)
            .is("deleted_at", null)
            .limit(1)
            .maybeSingle();

          if (!(employee as any)?.user_id) {
            await writeInboundMessage();
            await logInbox({
              instance,
              ok: true,
              http_status: 200,
              reason: "presence_employee_not_found",
              direction,
              meta: { correlation_id: correlationId, from: normalized.from },
            });
            return new Response(JSON.stringify({ ok: true, presence: { handled: false, reason: "employee_not_found" } }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const punchRes = await clockPresencePunch({
            supabase: supabase as any,
            tenantId: String(instance.tenant_id),
            employeeId: String((employee as any).user_id),
            source: "WHATSAPP",
            latitude: normalized.location.lat,
            longitude: normalized.location.lng,
            accuracyMeters: null,
            forcedType: used.forcedType,
            actorType: "system",
            actorId: null,
          }).catch((e) => ({ ok: false as const, error: "presence_clock_failed", details: String(e?.message ?? e) }));

          // Clear pending command (best-effort)
          await upsertContactMeta({ presence_pending_command: null, presence_pending_command_at: null });

          await writeInboundMessage();

          await logInbox({
            instance,
            ok: true,
            http_status: 200,
            reason: (punchRes as any)?.ok ? "presence_clocked" : (punchRes as any)?.error ?? "presence_clock_failed",
            direction,
            meta: {
              correlation_id: correlationId,
              command: used.raw,
              forced_type: used.forcedType,
              punch: punchRes,
            },
          });

          return new Response(JSON.stringify({ ok: true, presence: punchRes }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const pickLatestMessageWithCase = async (phones: string[]) => {
      const list = (phones ?? []).map((p) => String(p)).filter(Boolean);
      if (!list.length) return null;

      const [fromRes, toRes] = await Promise.all([
        supabase
          .from("wa_messages")
          .select("case_id,occurred_at")
          .eq("tenant_id", instance.tenant_id)
          .eq("instance_id", instance.id)
          .in("from_phone", list)
          .not("case_id", "is", null)
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("wa_messages")
          .select("case_id,occurred_at")
          .eq("tenant_id", instance.tenant_id)
          .eq("instance_id", instance.id)
          .in("to_phone", list)
          .not("case_id", "is", null)
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const a = (fromRes as any)?.data ?? null;
      const b = (toRes as any)?.data ?? null;
      if (!a?.case_id && !b?.case_id) return null;

      const aT = a?.occurred_at ? Date.parse(String(a.occurred_at)) : 0;
      const bT = b?.occurred_at ? Date.parse(String(b.occurred_at)) : 0;
      return bT > aT ? b : a;
    };

    const loadOpenCase = async (caseId: string, opts: { deleted: "exclude" | "only" }) => {
      let q = supabase
        .from("cases")
        .select("id,journey_id,is_chat,assigned_vendor_id,deleted_at,updated_at")
        .eq("tenant_id", instance.tenant_id)
        .eq("id", caseId)
        .eq("status", "open");

      if (opts.deleted === "exclude") q = q.is("deleted_at", null);
      if (opts.deleted === "only") q = q.not("deleted_at", "is", null);

      const { data } = await q.maybeSingle();
      return (data as any) ?? null;
    };

    const findOpenCaseByRecentMessages = async (phones: string[]) => {
      const msg = await pickLatestMessageWithCase(phones);
      const caseId = (msg as any)?.case_id ? String((msg as any).case_id) : null;
      if (!caseId) return null;
      return await loadOpenCase(caseId, { deleted: "exclude" });
    };

    const findDeletedOpenCaseByRecentMessages = async (phones: string[]) => {
      const msg = await pickLatestMessageWithCase(phones);
      const caseId = (msg as any)?.case_id ? String((msg as any).case_id) : null;
      if (!caseId) return null;
      return await loadOpenCase(caseId, { deleted: "only" });
    };

    // Outbound webhook capture (messages sent outside Byfrost):
    // - We DO NOT create cases here.
    // - We try to link to an existing case by customer phone (counterpart).
    if (direction === "outbound") {
      const instPhone = normalizePhoneE164Like(instance.phone_number ?? null);

      // Some providers don't send an explicit `to`, only chatId/phone.
      let counterpart = normalized.to ?? inferOutboundCounterpart(payload);

      // [MOD] If normalization failed but we have a group ID, use it as counterpart.
      if (!counterpart) {
        const rawTo = pickFirst(payload?.to, payload?.toPhone, payload?.chatId, payload?.data?.chatId);
        if (looksLikeWhatsAppGroupId(rawTo)) {
          counterpart = rawTo;
        }
      }

      // If normalization picked chatId as `from` (common), use it as counterpart.
      if ((!counterpart || (instPhone && counterpart === instPhone)) && normalized.from && normalized.from !== instPhone) {
        counterpart = normalized.from;
      }

      // If we do have an instance phone, ensure counterpart is the "other" side.
      if (instPhone && counterpart && counterpart === instPhone) {
        counterpart = normalized.from && normalized.from !== instPhone ? normalized.from : null;
      }

      if (!counterpart) {
        const rawTo = pickFirst(
          payload?.chatId,
          payload?.data?.chatId,
          payload?.to,
          payload?.toPhone,
          payload?.phone,
          payload?.data?.phone,
          payload?.recipient,
          payload?.peer
        );
        await logInbox({
          instance,
          ok: false,
          http_status: 400,
          reason: rawTo ? `missing_to_phone: ${rawTo}` : "missing_to_phone",
          direction,
          meta: {
            forced_direction: forced ?? null,
            inferred_direction: inferred,
            strong_outbound: strongOutbound,
            raw_chat_id: rawTo
          },
        });
        return new Response("Missing to", { status: 400, headers: corsHeaders });
      }

      // Pick the best sender phone (prefer instance phone for outbound)
      const fromPhone = instPhone ?? normalized.from ?? null;

      // Link outbound to an existing customer case when possible
      // [MOD] If counterpart is a group ID, don't try to format as phone, use it directly
      const isGroup = looksLikeWhatsAppGroupId(counterpart);
      const counterpartVariants = isGroup ? [counterpart] : Array.from(buildBrPhoneVariantsE164(counterpart));
      let caseId: string | null = null;

      try {
        // [MOD] Special handling for outbound group messages
        if (isGroup) {
          const { data: monCase } = await supabase
            .from("cases")
            .select("id")
            .eq("tenant_id", instance.tenant_id)
            .eq("status", "open")
            .is("deleted_at", null)
            .contains("meta_json", { monitoring: { whatsapp_group_id: counterpart } })
            .limit(1)
            .maybeSingle();

          if (monCase) caseId = monCase.id;
        } else {
          // Normal individual phone logic
          // 1) Find customer by phone variants
          const { data: existingCustomer } = await supabase
            .from("customer_accounts")
            .select("id")
            .eq("tenant_id", instance.tenant_id)
            .in("phone_e164", counterpartVariants.length ? counterpartVariants : [counterpart])
            .is("deleted_at", null)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const customerId = (existingCustomer as any)?.id ?? null;

          if (customerId) {
            // Prefer an open case for this customer.
            const { data: c } = await supabase
              .from("cases")
              .select("id")
              .eq("tenant_id", instance.tenant_id)
              .eq("status", "open")
              .eq("customer_id", customerId)
              .is("deleted_at", null)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            caseId = (c as any)?.id ?? null;
          }
        }

        // 2) Fallback: open case matching phone stored in meta_json (only if not already found and not group)
        // 2) Fallback: open case matching phone stored in meta_json (only if not already found and not group)
        if (!caseId && !isGroup) {
          if (!caseId) {
            const keys = ["customer_phone", "counterpart_phone", "phone", "whatsapp"];
            for (const k of keys) {
              for (const p of counterpartVariants.length ? counterpartVariants : [counterpart]) {
                const { data: c } = await supabase
                  .from("cases")
                  .select("id")
                  .eq("tenant_id", instance.tenant_id)
                  .eq("status", "open")
                  .contains("meta_json", { [k]: p })
                  .is("deleted_at", null)
                  .order("updated_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                caseId = (c as any)?.id ?? null;
                if (caseId) break;
              }
              if (caseId) break;
            }
          }

          // 3) Fallback: last case that already has message history with this phone
          if (!caseId) {
            const c = await findOpenCaseByRecentMessages(counterpartVariants.length ? counterpartVariants : [counterpart]);
            caseId = c?.id ? String(c.id) : null;
          }
        }
      } catch (e) {
        console.warn(`[${fn}] outbound_case_link_failed (ignored)`, { e: String((e as any)?.message ?? e) });
      }

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
        meta: {
          forced_direction: forced ?? null,
          inferred_direction: inferred,
          strong_outbound: strongOutbound,
          linked_by: caseId ? "customer_phone_or_history" : null,
        },
      });

      return new Response(JSON.stringify({ ok: true, correlation_id: correlationId, case_id: caseId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------- INBOUND routing below --------------------

    // Group Message Handling
    // Default: Ignore group messages unless they are explicitly monitored by an open case.
    const effectiveGroupId = pickFirst(
      looksLikeWhatsAppGroupId(payload?.chatId) ? payload?.chatId : null,
      looksLikeWhatsAppGroupId(payload?.data?.chatId) ? payload?.data?.chatId : null,
      looksLikeWhatsAppGroupId(normalized.from) ? normalized.from : null,
      looksLikeWhatsAppGroupId(normalized.to) ? normalized.to : null
    );

    if (effectiveGroupId) {
      const groupId = effectiveGroupId as string;

      // Check if any open case is monitoring this group
      // We look into meta_json->monitoring->whatsapp_group_id
      const { data: monitoredCase } = await supabase
        .from("cases")
        .select("id")
        .eq("tenant_id", instance.tenant_id)
        .eq("status", "open")
        .is("deleted_at", null)
        .contains("meta_json", { monitoring: { whatsapp_group_id: groupId } })
        .limit(1)
        .maybeSingle();

      if (!monitoredCase) {
        // Ignore unmonitored group message
        // [MOD] Append groupId to reason for easier debugging in Admin UI
        await logInbox({
          instance,
          ok: true,
          http_status: 200,
          reason: `group_ignored_unmonitored: ${groupId}`,
          direction: "inbound",
          meta: { conversation_group_id: groupId },
        });
        return new Response("Group message ignored", { status: 200, headers: corsHeaders });
      }

      console.log(`[${fn}] Monitored group message found`, { groupId, caseId: monitoredCase.id });

      // Force linking to this case
      // We insert directly to bypass the normal "find journey/customer" flow which expects individual numbers
      const { error: msgErr } = await supabase.from("wa_messages").insert({
        tenant_id: instance.tenant_id,
        instance_id: instance.id,
        direction: "inbound",
        from_phone: normalized.from, // likely the group ID or participant ID? Z-API sends participant in 'from' sometimes?
        // Z-API Group: 'from' is group ID (1203...) if not specified otherwise? 
        // Actually usually: from=1203...@g.us, participant=5511...@c.us
        // normalized.from is the group id if we used standard normalization on 'from'.
        // Let's trust normalized.from is the group ID here.
        to_phone: normalized.to,
        type: normalized.type,
        body_text: normalized.text,
        media_url: normalized.mediaUrl,
        payload_json: payload,
        correlation_id: correlationId,
        occurred_at: new Date().toISOString(),
        case_id: monitoredCase.id,
      });

      if (msgErr) {
        console.error(`[${fn}] Failed to insert monitored group message`, { msgErr });
        return new Response("Failed to insert group message", { status: 500, headers: corsHeaders });
      }

      await logInbox({
        instance,
        ok: true,
        http_status: 200,
        reason: `group_monitored: ${groupId}`,
        direction: "inbound",
        case_id: monitoredCase.id,
        meta: { conversation_group_id: groupId, case_id: monitoredCase.id },
      });

      return new Response(JSON.stringify({ ok: true, case_id: monitoredCase.id, group_monitored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine whether the inbound sender is a *vendor user* (users_profile.role='vendor').
    // This is used to support using the same WhatsApp instance for both:
    // - sales_order (vendor -> company number)
    // - CRM (customer -> company number)
    const inboundFromVariants = inboundFromPhone ? Array.from(buildBrPhoneVariantsE164(inboundFromPhone)) : [];

    const { data: vendorUserProfile, error: vendorUserErr } = inboundFromPhone
      ? await supabase
        .from("users_profile")
        .select("user_id,role,display_name,email,phone_e164")
        .eq("tenant_id", instance.tenant_id)
        .eq("role", "vendor")
        .in("phone_e164", inboundFromVariants.length ? inboundFromVariants : [inboundFromPhone])
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle()
      : ({ data: null, error: null } as any);

    if (vendorUserErr) {
      console.warn(`[${fn}] Failed to resolve vendorUserProfile (ignored)`, { vendorUserErr });
    }

    const isVendorUserSender = Boolean((vendorUserProfile as any)?.user_id);

    // Journey routing:
    // 1) instance.default_journey_id (if set)
    // 2) first enabled tenant_journey
    // 3) fallback to sales_order
    // PLUS:
    // - If sender is a vendor user => force sales_order (if available)
    // - If sender is NOT a vendor user AND current journey is sales_order => prefer first CRM journey
    let journey: JourneyInfo | null = null;

    // Load enabled journeys for tenant once (we'll reuse later).
    const { data: enabledTjRows, error: enabledTjErr } = await supabase
      .from("tenant_journeys")
      .select("journey_id, journeys(id,key,name,is_crm,default_state_machine_json)")
      .eq("tenant_id", instance.tenant_id)
      .eq("enabled", true)
      .order("created_at", { ascending: true })
      .limit(200);
    if (enabledTjErr) console.error(`[${fn}] Failed to load tenant_journeys for routing`, { enabledTjErr });

    const enabledJourneys: JourneyInfo[] = (enabledTjRows ?? [])
      .map((r: any) => r.journeys)
      .filter((j: any) => Boolean(j?.id));

    const firstEnabledJourney = enabledJourneys[0] ?? null;
    const firstCrmJourney = enabledJourneys.find((j) => Boolean(j?.is_crm)) ?? null;

    // Load sales_order journey once (used as fallback and for vendor-user routing).
    const { data: salesOrderJourney, error: soErr } = await supabase
      .from("journeys")
      .select("id,key,name,is_crm,default_state_machine_json")
      .eq("key", "sales_order")
      .maybeSingle();
    if (soErr) console.error(`[${fn}] Failed to load journey sales_order`, { soErr });

    if (instance.default_journey_id) {
      // Note: algumas instalações não têm deleted_at em journeys. Evite filtrar por deleted_at aqui.
      const { data: j, error: jErr } = await supabase
        .from("journeys")
        .select("id,key,name,is_crm,default_state_machine_json")
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

    if (!journey && firstEnabledJourney?.id) {
      journey = firstEnabledJourney;
    }

    if (!journey && (salesOrderJourney as any)?.id) {
      journey = salesOrderJourney as any;
    }

    // Conditional reroute (same instance, different flows)
    if ((salesOrderJourney as any)?.id) {
      if (isVendorUserSender) {
        journey = salesOrderJourney as any;
      } else if (journey?.key === "sales_order" && firstCrmJourney?.id) {
        journey = firstCrmJourney;
      }
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
      from: inboundFromPhone,
      is_vendor_user_sender: isVendorUserSender,
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

    // Default: create case on text unless explicitly disabled.
    const cfgCreateCaseOnText = (readCfg(cfg, "automation.on_text.create_case") as boolean | undefined) ?? true;
    const cfgInitialStateOnText = (readCfg(cfg, "automation.on_text.initial_state") as string | undefined) ?? null;

    const cfgCreateCaseOnLocation = Boolean(readCfg(cfg, "automation.on_location.create_case"));
    const cfgInitialStateOnLocation =
      (readCfg(cfg, "automation.on_location.initial_state") as string | undefined) ?? null;
    const cfgLocationNextState = (readCfg(cfg, "automation.on_location.next_state") as string | undefined) ?? null;

    // Conversations: by default we DO NOT assume the sender is a "vendor".
    // This should be configured in the panel per-journey/instance.
    // For sales_order: enforce vendor-user sender.
    const isSalesOrderJourney = journey.key === "sales_order";
    const defaultSenderIsVendor = isSalesOrderJourney ? true : false;

    // Vendor rules (raw config)
    const cfgAutoCreateVendorRaw =
      (readCfg(cfg, "automation.conversations.auto_create_vendor") as boolean | undefined) ?? false;
    const cfgRequireVendorRaw = Boolean(readCfg(cfg, "automation.conversations.require_vendor"));

    // If sender_is_vendor is not explicitly set, keep backward-compat with existing configs
    // that already rely on vendor identification.
    const cfgSenderIsVendorExplicit = readCfg(cfg, "automation.conversations.sender_is_vendor") as
      | boolean
      | undefined;

    // sales_order: always treat sender as vendor, but only accept if it's a vendor user.
    const cfgSenderIsVendor = isSalesOrderJourney
      ? true
      : (cfgSenderIsVendorExplicit ?? (defaultSenderIsVendor || cfgAutoCreateVendorRaw || cfgRequireVendorRaw));

    // Vendor rules (only applied when sender_is_vendor=true)
    const cfgAutoCreateVendor = cfgSenderIsVendor
      ? (isSalesOrderJourney ? true : cfgAutoCreateVendorRaw)
      : false;

    const cfgRequireVendor = cfgSenderIsVendor
      ? (isSalesOrderJourney ? true : cfgRequireVendorRaw)
      : false;

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

    // Contact label:
    // 1) wa_contacts.name (if stored)
    // 2) payload sender name
    // 3) phone
    let waContactName: string | null = null;
    if (inboundFromPhone) {
      const { data: waContact } = await supabase
        .from("wa_contacts")
        .select("name")
        .eq("tenant_id", instance.tenant_id)
        .eq("phone_e164", inboundFromPhone)
        .is("deleted_at", null)
        .maybeSingle();
      waContactName = (waContact as any)?.name ? String((waContact as any).name).trim() : null;
    }

    const payloadLabel = inferContactLabel(payload, inboundFromPhone);
    const contactLabel = (waContactName && waContactName.trim()) ? waContactName : payloadLabel;

    // Determine initial state based on type
    const initialHint =
      normalized.type === "image" ? cfgInitialStateOnImage : normalized.type === "location" ? cfgInitialStateOnLocation : cfgInitialStateOnText;
    const initialState = pickInitialState(journey, initialHint);

    // Call RPC for atomic processing
    const { data: rpcResult, error: rpcError } = await supabase.rpc("process_zapi_inbound_message", {
      p_tenant_id: instance.tenant_id,
      p_instance_id: instance.id,
      p_zapi_instance_id: effectiveInstanceId,
      p_direction: "inbound",
      p_type: normalized.type,
      p_from_phone: inboundFromPhone,
      p_to_phone: inboundToPhone,
      p_body_text: normalized.text,
      p_media_url: normalized.mediaUrl,
      p_payload_json: payload,
      p_correlation_id: correlationId,
      p_occurred_at: new Date().toISOString(),
      p_journey_config: {
        id: journey.id,
        key: journey.key,
        initial_state: initialState
      },
      p_sender_is_vendor: cfgSenderIsVendor,
      p_contact_label: contactLabel,
      p_options: {
        create_case_on_text: cfgCreateCaseOnText,
        create_case_on_location: cfgCreateCaseOnLocation,
        pendencies_on_image: cfgPendenciesOnImage,
        ocr_enabled: cfgOcrEnabled
      }
    });

    if (rpcError) {
      console.error(`[${fn}] RPC process_zapi_inbound_message failed`, { rpcError });
      await logInbox({
        instance,
        ok: false,
        http_status: 500,
        reason: "rpc_failed",
        journey_id: journey.id,
        direction,
        meta: { error: rpcError }
      });
      return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
    }

    const resData = (rpcResult as any)?.[0] ?? (rpcResult as any);
    const { ok: rpcOk, case_id: rpcCaseId, message_id: msgId, event: rpcEvent, details: rpcDetails } = resData || {};
    const caseId = rpcCaseId; // Alias for the rest of the code

    console.log(`[${fn}] RPC executed`, {
      resData,
      case_id: caseId,
      event: rpcEvent
    });

    // Post-processing: OCR Jobs
    // The RPC already creates the message and case attachments, 
    // but the complex job enqueuing for OCR (which relies on Queues/Edge Functions) 
    // is best kept here or moved to a database trigger.
    // Given the previous code enqueued jobs:
    if (caseId && cfgOcrEnabled && normalized.type === "image") {
      await enqueueJob("OCR_IMAGE", `OCR_IMAGE:${caseId}`, {
        case_id: caseId,
        correlation_id: correlationId,
      });
      await enqueueJob("VALIDATE_FIELDS", `VALIDATE_FIELDS:${caseId}:${Date.now()}`, {
        case_id: caseId,
        correlation_id: correlationId,
      });
      // ASK_PENDENCIES is often redundant if the RPC already created pendencies, 
      // but the job might be "Answer Pendenicies via AI". Keeping for compatibility.
      await enqueueJob("ASK_PENDENCIES", `ASK_PENDENCIES:${caseId}:${Date.now()}`, {
        case_id: caseId,
        correlation_id: correlationId,
      });
    } else if (caseId && cfgOcrEnabled && (normalized.type === "text" || normalized.type === "audio")) {
      // Validation jobs for text
      await enqueueJob("VALIDATE_FIELDS", `VALIDATE_FIELDS:${caseId}:${Date.now()}`, {
        case_id: caseId,
        correlation_id: correlationId,
      });
      await enqueueJob("ASK_PENDENCIES", `ASK_PENDENCIES:${caseId}:${Date.now()}`, {
        case_id: caseId,
        correlation_id: correlationId,
      });
    }

    // Always log inbox for observability
    await logInbox({
      instance,
      ok: true,
      http_status: 200,
      reason: (rpcDetails as any)?.skipped_reason,
      journey_id: journey.id,
      case_id: caseId,
      direction,
      meta: {
        journey_key: journey.key,
        create_case_on_text: cfgCreateCaseOnText,
        sender_is_vendor: cfgSenderIsVendor,
        rpc_event: rpcEvent,
        rpc_details: rpcDetails
      },
    });

    return new Response(JSON.stringify({
      ok: true,
      correlation_id: correlationId,
      case_id: caseId,
      message_id: msgId,
      event: rpcEvent
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[webhooks-zapi-inbound] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});