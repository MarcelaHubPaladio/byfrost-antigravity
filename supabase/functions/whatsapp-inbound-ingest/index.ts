import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { normalizePhoneE164Like } from "../_shared/normalize.ts";

// This is the new, refactored global ingestion point.
// It focuses on "Conversations" (Audit) before deciding on specific business journeys.

type InboundType = "text" | "image" | "audio" | "video" | "location";
type WebhookDirection = "inbound" | "outbound";

function pickFirst<T>(...values: Array<T | null | undefined>): T | null {
    for (const v of values) if (v !== null && v !== undefined && v !== "") return v as T;
    return null;
}

function digitsOnly(v: string | null | undefined) {
    return String(v ?? "").replace(/\D/g, "");
}

function looksLikeWhatsAppGroupId(v: any) {
    const s = String(v ?? "").trim().toLowerCase();
    if (!s) return false;
    if (s.includes("status@broadcast")) return true;
    if (s.includes("@g.us") || s.includes("g.us")) return true;
    const digits = s.replace(/\D/g, "");
    if (!digits) return false;
    const d = digits.startsWith("55") ? digits.slice(2) : digits;
    if (d.startsWith("1203") && d.length >= 16) return true;
    return false;
}

function normalizeInbound(payload: any) {
    const zapiInstanceId = pickFirst<string>(payload?.instanceId, payload?.instance_id, payload?.instance);
    const isGroup = Boolean(
        payload?.isGroup ||
        payload?.isGroupMsg ||
        payload?.data?.isGroup ||
        payload?.data?.isGroupMsg ||
        String(payload?.from ?? "").includes("@g.us") ||
        String(payload?.chatId ?? "").includes("@g.us")
    );

    const participantRaw = pickFirst(
        payload?.participant,
        payload?.data?.participant,
        payload?.author,
        payload?.data?.author,
        payload?.sender?.phone,
        payload?.data?.sender?.phone,
        payload?.sender,
        payload?.senderId
    );

    const fromRaw = pickFirst(
        payload?.from,
        payload?.data?.from,
        payload?.sender?.phone,
        payload?.phone,
        payload?.chatId,
        payload?.senderId
    );

    const toRaw = pickFirst(
        payload?.to,
        payload?.data?.to,
        payload?.toPhone
    );

    const rawType = String(pickFirst(payload?.type, payload?.messageType, payload?.event, payload?.data?.type, payload?.hookType) ?? "unknown").toLowerCase();

    // Basic type mapping (simplified for Audit)
    const type: InboundType = rawType.includes("image") ? "image" :
        rawType.includes("audio") ? "audio" :
            rawType.includes("video") ? "video" :
                rawType.includes("location") ? "location" :
                    "text";

    const isMessage = Boolean(
        payload?.text || payload?.body || payload?.chatId || payload?.phone ||
        payload?.messageId || payload?.image || payload?.audio || payload?.video
    );

    const messageText = pickFirst<string>(
        payload?.text?.message,
        payload?.text,
        payload?.body,
        payload?.caption,
        payload?.image?.caption,
        payload?.video?.caption
    );

    const mediaUrl = pickFirst<string>(
        payload?.mediaUrl,
        payload?.url,
        payload?.audio?.audioUrl,
        payload?.video?.videoUrl,
        payload?.image?.imageUrl
    );

    const externalMessageId = pickFirst<string>(payload?.messageId, payload?.id) ?? null;

    return {
        zapiInstanceId,
        isGroup,
        participant: normalizePhoneE164Like(participantRaw),
        from: normalizePhoneE164Like(fromRaw),
        to: normalizePhoneE164Like(toRaw),
        type,
        text: messageText ?? null,
        mediaUrl: mediaUrl ?? null,
        externalMessageId,
        raw: payload
    };
}

serve(async (req) => {
    const fn = "whatsapp-inbound-ingest";
    try {
        if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

        const supabase = createSupabaseAdmin();
        const rawBody = await req.text().catch(() => "");
        const payload = rawBody ? JSON.parse(rawBody) : null;

        if (!payload) return new Response("Invalid JSON", { status: 400, headers: corsHeaders });

        const normalized = normalizeInbound(payload);
        const zapiId = normalized.zapiInstanceId;

        if (!zapiId) return new Response("Missing instanceId", { status: 400, headers: corsHeaders });

        // 1. Lookup Instance
        const { data: instance } = await supabase
            .from("wa_instances")
            .select("id, tenant_id, phone_number, webhook_secret, enable_v1_business, enable_v2_audit")
            .eq("zapi_instance_id", zapiId)
            .eq("status", "active")
            .is("deleted_at", null)
            .maybeSingle();

        if (!instance) return new Response("Unknown instance", { status: 404, headers: corsHeaders });

        // 2. Secret Validation
        const secret = req.headers.get("x-webhook-secret") || new URL(req.url).searchParams.get("secret");
        if (secret && secret !== instance.webhook_secret) {
            return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }

        // 3. Resolve Direction & Participant
        const instPhone = normalizePhoneE164Like(instance.phone_number);
        const fromMe = payload.fromMe === true || payload.isFromMe === true || (instPhone && normalized.from === instPhone);
        const direction: WebhookDirection = fromMe ? "outbound" : "inbound";

        // For Audit/Conversation purposes:
        const chatId = pickFirst(payload?.chatId, payload?.data?.chatId, normalized.from, normalized.to);
        const isGroup = looksLikeWhatsAppGroupId(chatId);

        const participantPhone = isGroup
            ? (fromMe ? instPhone : normalized.participant || normalized.from)
            : (fromMe ? normalized.to : normalized.from);

        const groupId = isGroup ? String(chatId) : null;

        // 4. Atomic Ingestion via RPC (ONLY for messages/chat events)
        let auditResult = { conversation_id: null, message_id: null, case_id: null, journey_id: null, ok: true, event: "none" };

        // We only call the audit storage if it looks like a message or a chat event
        const looksLikeChatEvent = Boolean(normalized.text || normalized.mediaUrl || normalized.externalMessageId || isGroup);

        if (instance.enable_v2_audit && looksLikeChatEvent) {
            const { data: rpcResult, error: rpcError } = await supabase.rpc("ingest_whatsapp_audit_message", {
                p_tenant_id: instance.tenant_id,
                p_instance_id: instance.id,
                p_zapi_instance_id: zapiId,
                p_direction: direction,
                p_type: normalized.type,
                p_from_phone: normalized.from,
                p_to_phone: normalized.to,
                p_participant_phone: participantPhone,
                p_group_id: groupId,
                p_body_text: normalized.text,
                p_media_url: normalized.mediaUrl,
                p_payload_json: payload,
                p_correlation_id: normalized.externalMessageId || crypto.randomUUID(),
                p_occurred_at: new Date().toISOString()
            });

            if (rpcError) {
                console.error(`[${fn}] RPC failed`, rpcError);
                // Continue to diagnostic logging anyway
                auditResult.ok = false;
                auditResult.event = "rpc_failed";
            } else {
                auditResult = rpcResult?.[0] || rpcResult || auditResult;
            }
        }

        const { conversation_id, message_id, case_id, journey_id, ok: ingestOk, event: ingestEvent } = auditResult;

        // 5. DIAGNOSTIC LOGGING (wa_webhook_inbox) - REGISTRA TUDO
        try {
            const inboxRecord = {
                tenant_id: instance.tenant_id,
                instance_id: instance.id,
                zapi_instance_id: zapiId,
                direction: direction,
                wa_type: normalized.type,
                from_phone: normalized.from,
                to_phone: normalized.to,
                ok: ingestOk !== false,
                http_status: ingestOk !== false ? 200 : 500,
                reason: ingestEvent || (looksLikeChatEvent ? (ingestOk !== false ? "ingested" : "failed") : "event_received"),
                payload_json: payload,
                journey_id: journey_id || instance.default_journey_id,
                meta_json: {
                    case_id,
                    journey_id,
                    conversation_id,
                    message_id,
                    external_message_id: normalized.externalMessageId,
                    is_group: isGroup,
                    participant: participantPhone,
                    raw_type: payload?.type || payload?.event
                },
                received_at: new Date().toISOString()
            };

            console.log(`[${fn}] Inserting diagnostic log for tenant ${instance.tenant_id}, reason: ${inboxRecord.reason}`);

            const { error: inboxErr } = await supabase.from("wa_webhook_inbox").insert(inboxRecord);

            if (inboxErr) {
                console.error(`[${fn}] Database insert failed for wa_webhook_inbox`, inboxErr);
            } else {
                console.log(`[${fn}] Diagnostic log inserted successfully`);
            }
        } catch (e) {
            console.error(`[${fn}] Diagnostic logging critical failure`, e);
        }

        return new Response(JSON.stringify({
            ok: true,
            conversation_id,
            message_id,
            case_id,
            direction
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (e) {
        console.error(`[${fn}] Unhandled error`, e);
        return new Response("Internal error", { status: 500, headers: corsHeaders });
    }
});
