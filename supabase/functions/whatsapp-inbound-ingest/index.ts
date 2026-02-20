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

function pickInitialState(j: any, hint?: string | null) {
    const states = j?.default_state_machine_json?.states ?? [];
    if (hint && states.find((s: any) => s.key === hint)) return hint;
    return states[0]?.key ?? "novo";
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
        const secretHeader = req.headers.get("x-webhook-secret") ?? req.headers.get("x-byfrost-webhook-secret") ?? req.headers.get("client-token") ?? req.headers.get("x-zapi-secret");
        const secretQuery = new URL(req.url).searchParams.get("secret");
        const secret = secretHeader ?? secretQuery ?? payload?.securityToken ?? payload?.ClientToken ?? payload?.secret;
        if (secret && secret !== instance.webhook_secret) {
            return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }

        // 3. Resolve Direction & Participant
        const instPhone = normalizePhoneE164Like(instance.phone_number);
        const fromMe = payload.fromMe === true || payload.isFromMe === true || (instPhone && normalized.from === instPhone);
        const direction: WebhookDirection = fromMe ? "outbound" : "inbound";

        // For Audit/Conversation purposes:
        // Use raw IDs for group detection and extraction, as normalized phones might be null for group IDs
        const rawChatId = pickFirst(payload?.chatId, payload?.data?.chatId, payload?.from, payload?.phone, payload?.senderId);
        const isGroup = normalized.isGroup || looksLikeWhatsAppGroupId(rawChatId);
        const groupId = isGroup ? String(rawChatId) : null;

        // In a group, we want a single conversation record for the entire group.
        // By passing participantPhone = null for groups, our unique constraint 
        // (tenant_id, participant_phone, group_id) will always hit the same row for that group.
        const participantPhone = isGroup
            ? null
            : (fromMe ? normalized.to : normalized.from);

        // However, we still want to know WHICH person in the group sent/received the message
        // for individual auditing or case tracking.
        const msgParticipantPhone = isGroup
            ? (fromMe ? instPhone : normalized.participant || normalized.from)
            : participantPhone;

        // 4. Atomic Ingestion via RPC (ONLY for messages/chat events)
        let auditResult = { conversation_id: null, message_id: null, case_id: null, journey_id: null, ok: true, event: "none" };
        let crmResult = null;

        const looksLikeChatEvent = Boolean(normalized.text || normalized.mediaUrl || normalized.externalMessageId || isGroup);

        // Hybrid Routing Logic:
        // If enable_v1_business is true AND it's INBOUND, we try the CRM flow first.
        if (instance.enable_v1_business && direction === "inbound" && looksLikeChatEvent) {
            try {
                // Load active journeys once
                const { data: enabledTjRows } = await supabase
                    .from("tenant_journeys")
                    .select("journey_id, journeys(id,key,name,is_crm,default_state_machine_json)")
                    .eq("tenant_id", instance.tenant_id)
                    .eq("enabled", true)
                    .order("created_at", { ascending: true });

                const enabledJourneys = (enabledTjRows ?? []).map((r: any) => r.journeys).filter(Boolean);
                const firstEnabledJourney = enabledJourneys[0] ?? null;
                const firstCrmJourney = enabledJourneys.find((j: any) => j.is_crm) ?? null;

                let targetJourney = null;
                if (instance.default_journey_id) {
                    const { data: j } = await supabase.from("journeys").select("*").eq("id", instance.default_journey_id).maybeSingle();
                    if (j) targetJourney = j;
                }
                if (!targetJourney) targetJourney = firstCrmJourney ?? firstEnabledJourney;

                if (targetJourney) {
                    const initialState = pickInitialState(targetJourney);
                    const { data: rpcRes, error: rpcErr } = await supabase.rpc("process_zapi_inbound_message", {
                        p_tenant_id: instance.tenant_id,
                        p_instance_id: instance.id,
                        p_zapi_instance_id: zapiId,
                        p_direction: direction,
                        p_type: normalized.type,
                        p_from_phone: normalized.from || instPhone,
                        p_to_phone: instPhone,
                        p_body_text: normalized.text,
                        p_media_url: normalized.mediaUrl,
                        p_payload_json: payload,
                        p_correlation_id: normalized.externalMessageId || crypto.randomUUID(),
                        p_occurred_at: new Date().toISOString(),
                        p_journey_config: {
                            id: targetJourney.id,
                            key: targetJourney.key,
                            initial_state: initialState
                        },
                        p_sender_is_vendor: false,
                        p_contact_label: normalized.from,
                        p_options: {
                            create_case_on_text: true,
                            create_case_on_location: true,
                            pendencies_on_image: true,
                            ocr_enabled: true
                        }
                    });

                    if (!rpcErr) {
                        crmResult = (rpcRes as any)?.[0] ?? rpcRes;
                        if (crmResult?.ok) {
                            auditResult = {
                                conversation_id: crmResult.details?.conversation_id ?? null,
                                message_id: crmResult.message_id,
                                case_id: crmResult.case_id,
                                journey_id: targetJourney.id,
                                ok: true,
                                event: crmResult.event || "crm_ingested"
                            };
                        }
                    } else {
                        console.error(`[${fn}] CRM RPC failed`, rpcErr);
                    }
                }
            } catch (e) {
                console.error(`[${fn}] CRM flow critical error`, e);
            }
        }

        // 5. Audit Fallback (V2) or Outbound
        // If it's outbound, or if CRM didn't handle it, we call the audit ingest.
        if (instance.enable_v2_audit && looksLikeChatEvent && (direction === "outbound" || !crmResult?.ok)) {
            // For the message itself, we want to know the sender/receiver
            // Since this block only runs for outbound messages (direction === "outbound"):
            const fromPhone = instPhone;
            const toPhone = isGroup ? groupId : normalized.to;

            const { data: rpcResult, error: rpcError } = await supabase.rpc("ingest_whatsapp_audit_message", {
                p_tenant_id: instance.tenant_id,
                p_instance_id: instance.id,
                p_zapi_instance_id: zapiId,
                p_direction: direction,
                p_type: normalized.type,
                p_from_phone: fromPhone,
                p_to_phone: toPhone,
                p_participant_phone: participantPhone, // NULL for groups to unify conversation
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

        // 6. DIAGNOSTIC LOGGING (wa_webhook_inbox) - REGISTRA TUDO
        try {
            const inboxRecord = {
                tenant_id: instance.tenant_id,
                instance_id: instance.id,
                zapi_instance_id: zapiId,
                direction: direction,
                wa_type: normalized.type,
                from_phone: direction === "inbound" ? msgParticipantPhone : instPhone,
                to_phone: direction === "outbound" ? (isGroup ? groupId : normalized.to) : (isGroup ? groupId : instPhone),
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
                    participant: msgParticipantPhone,
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
