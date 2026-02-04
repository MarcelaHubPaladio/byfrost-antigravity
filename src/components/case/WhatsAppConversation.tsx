import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { useChatInstanceAccess } from "@/hooks/useChatInstanceAccess";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import { Paperclip, Send, Image as ImageIcon, Mic, Users, MessagesSquare, MapPin } from "lucide-react";

type WaMessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  type: string;
  from_phone: string | null;
  to_phone: string | null;
  body_text: string | null;
  media_url: string | null;
  payload_json: any;
  occurred_at: string;
};

type WaInstanceRow = {
  id: string;
  phone_number: string | null;
};

type CaseRowLite = { id: string; journey_id: string };

type TenantJourneyRowLite = { config_json: any };

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function initialsFromPhone(phone: string | null) {
  if (!phone) return "??";
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-2).padStart(2, "•");
}

function extractLocation(payload: any): { lat: number; lng: number } | null {
  try {
    const lat = payload?.latitude ?? payload?.location?.latitude ?? payload?.data?.latitude;
    const lng = payload?.longitude ?? payload?.location?.longitude ?? payload?.data?.longitude;
    if (lat == null || lng == null) return null;
    const nlat = Number(lat);
    const nlng = Number(lng);
    if (Number.isNaN(nlat) || Number.isNaN(nlng)) return null;
    return { lat: nlat, lng: nlng };
  } catch {
    return null;
  }
}

function pickFirstString(...values: any[]) {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function safeJsonParse(s: string) {
  try {
    return { ok: true as const, value: JSON.parse(s) };
  } catch {
    return { ok: false as const, value: null };
  }
}

function getBestText(m: WaMessageRow) {
  const raw = (m.body_text ?? "").trim();
  if (raw && raw !== "[object Object]") {
    if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
      const parsed = safeJsonParse(raw);
      if (parsed.ok) {
        const v = parsed.value;
        if (typeof v === "string") return v;
        if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : "")).filter(Boolean).join("\n");
        if (v && typeof v === "object") {
          return (
            pickFirstString(
              v.text,
              v.body,
              v.message,
              v.caption,
              v.content,
              v.data?.text,
              v.data?.body,
              v.data?.message
            ) ?? ""
          );
        }
      }
    }

    return raw;
  }

  const p = m.payload_json ?? {};
  return (
    pickFirstString(
      p.text,
      p.body,
      p.message,
      p.caption,
      p.data?.text,
      p.data?.body,
      p.data?.message,
      p.message?.text,
      p.message?.body
    ) ?? ""
  );
}

function digitsTail(s: string | null | undefined, tail = 11) {
  const d = String(s ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length > tail ? d.slice(-tail) : d;
}

function samePhoneLoose(a: string | null | undefined, b: string | null | undefined) {
  const da = digitsTail(a);
  const db = digitsTail(b);
  if (!da || !db) return false;
  if (Math.min(da.length, db.length) < 10) return false;
  return da === db;
}

function looksLikeGroupNumber(v: string | null | undefined) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return false;
  if (s.includes("status@broadcast")) return true;
  if (s.includes("@g.us") || s.includes("g.us")) return true;
  const digits = s.replace(/\D/g, "");
  if (!digits) return false;
  const d = digits.startsWith("55") ? digits.slice(2) : digits;
  return d.startsWith("1203") && d.length >= 16;
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

function normalizeWaType(
  type: string,
  payload: any,
  mediaUrl: string | null
): "text" | "image" | "audio" | "video" | "location" {
  const t = String(type ?? "").toLowerCase();
  const mime = String(
    pickFirstString(
      payload?.mimeType,
      payload?.mimetype,
      payload?.data?.mimeType,
      payload?.data?.mimetype,
      payload?.audio?.mimeType,
      payload?.audio?.mimetype,
      payload?.data?.audio?.mimeType,
      payload?.data?.audio?.mimetype,
      payload?.video?.mimeType,
      payload?.video?.mimetype,
      payload?.data?.video?.mimeType,
      payload?.data?.video?.mimetype,
      // IMPORTANT: Z-API images come under payload.image
      payload?.image?.mimeType,
      payload?.image?.mimetype,
      payload?.data?.image?.mimeType,
      payload?.data?.image?.mimetype,
      payload?.document?.mimeType,
      payload?.document?.mimetype,
      payload?.data?.document?.mimeType,
      payload?.data?.document?.mimetype
    ) ?? ""
  ).toLowerCase();

  const isImageMime = mime.startsWith("image/") || mime.includes("jpeg") || mime.includes("png") || mime.includes("webp");
  const isAudioMime = mime.startsWith("audio/") || mime.includes("ogg") || mime.includes("opus") || mime.includes("mpeg");
  const isVideoMime = mime.startsWith("video/") || mime.includes("mp4") || mime.includes("webm");

  const hasImage = Boolean(
    payload?.image?.imageUrl ||
      payload?.data?.image?.imageUrl ||
      payload?.image?.thumbnailUrl ||
      payload?.data?.image?.thumbnailUrl
  );

  // Simulator support: inline Base64 payloads.
  const hasInlineBase64 = Boolean(
    pickFirstString(
      payload?.mediaBase64,
      payload?.media_base64,
      payload?.imageBase64,
      payload?.image_base64,
      payload?.data?.mediaBase64,
      payload?.data?.media_base64,
      payload?.data?.imageBase64,
      payload?.data?.image_base64
    )
  );

  if (t.includes("location")) return "location";
  if (t.includes("image") || t.includes("photo") || isImageMime || hasImage || hasInlineBase64) return "image";
  if (t.includes("video") || isVideoMime || payload?.video?.videoUrl || payload?.data?.video?.videoUrl) return "video";
  if (t.includes("audio") || t.includes("ptt") || t.includes("voice") || isAudioMime) return "audio";

  // Extra fallback: payload contains an audio object.
  if (payload?.audio?.audioUrl || payload?.data?.audio?.audioUrl) return "audio";

  return "text";
}

function pickBestMediaUrl(m: { media_url: string | null; payload_json: any }) {
  const direct =
    pickFirstString(
      m.media_url,
      m.payload_json?.mediaUrl,
      m.payload_json?.media_url,
      m.payload_json?.url,
      m.payload_json?.data?.mediaUrl,
      m.payload_json?.data?.media_url,
      m.payload_json?.data?.url,
      m.payload_json?.audio?.audioUrl,
      m.payload_json?.data?.audio?.audioUrl,
      m.payload_json?.video?.videoUrl,
      m.payload_json?.data?.video?.videoUrl,
      m.payload_json?.image?.imageUrl,
      m.payload_json?.data?.image?.imageUrl
    ) ?? null;

  if (direct) return direct;

  // Simulator fallback: if we only have Base64, render as data URL.
  const base64 =
    pickFirstString(
      m.payload_json?.mediaBase64,
      m.payload_json?.media_base64,
      m.payload_json?.imageBase64,
      m.payload_json?.image_base64,
      m.payload_json?.data?.mediaBase64,
      m.payload_json?.data?.media_base64,
      m.payload_json?.data?.imageBase64,
      m.payload_json?.data?.image_base64
    ) ?? null;

  if (!base64) return null;
  if (base64.trim().startsWith("data:")) return base64.trim();

  const mime =
    pickFirstString(
      m.payload_json?.mimeType,
      m.payload_json?.mimetype,
      m.payload_json?.data?.mimeType,
      m.payload_json?.data?.mimetype
    ) ?? "image/jpeg";

  return `data:${mime};base64,${base64}`;
}

export function WhatsAppConversation({ caseId, className }: { caseId: string; className?: string }) {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const chatAccess = useChatInstanceAccess();
  const [tab, setTab] = useState<"messages" | "participants">("messages");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [transcribingById, setTranscribingById] = useState<Record<string, boolean>>({});

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const caseQ = useQuery({
    queryKey: ["case_lite_for_chat", activeTenantId, caseId],
    enabled: Boolean(activeTenantId && caseId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,journey_id")
        .eq("tenant_id", activeTenantId!)
        .eq("id", caseId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Case não encontrado");
      return data as CaseRowLite;
    },
  });

  const tenantJourneyCfgQ = useQuery({
    queryKey: ["tenant_journey_cfg", activeTenantId, caseQ.data?.journey_id],
    enabled: Boolean(activeTenantId && caseQ.data?.journey_id),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("config_json")
        .eq("tenant_id", activeTenantId!)
        .eq("journey_id", caseQ.data!.journey_id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TenantJourneyRowLite | null;
    },
  });

  const senderIsVendor = useMemo(() => {
    const cfg = (tenantJourneyCfgQ.data as any)?.config_json ?? {};
    return Boolean(readCfg(cfg, "automation.conversations.sender_is_vendor"));
  }, [tenantJourneyCfgQ.data]);

  const counterpartRoleLabel = senderIsVendor ? "vendedor" : "cliente";

  const instanceQ = useQuery({
    queryKey: ["wa_instance_for_chat_user", activeTenantId, chatAccess.instanceIds.join(",")],
    enabled: Boolean(activeTenantId && chatAccess.instanceIds.length),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_instances")
        .select("id,phone_number")
        .eq("tenant_id", activeTenantId!)
        .eq("status", "active")
        .is("deleted_at", null)
        .in("id", chatAccess.instanceIds)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WaInstanceRow | null;
    },
  });

  const waMsgsQ = useQuery({
    queryKey: ["wa_messages_case", activeTenantId, caseId],
    enabled: Boolean(activeTenantId && caseId),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_messages")
        .select("id,direction,type,from_phone,to_phone,body_text,media_url,payload_json,occurred_at")
        .eq("tenant_id", activeTenantId!)
        .eq("case_id", caseId)
        .order("occurred_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as WaMessageRow[];
    },
  });

  const instancePhone = instanceQ.data?.phone_number ?? null;

  const counterpartPhone = useMemo(() => {
    const msgs = waMsgsQ.data ?? [];
    if (!msgs.length) return null;

    const last = msgs[msgs.length - 1];

    const effectiveOutbound =
      samePhoneLoose(instancePhone, last.from_phone) ||
      (last.direction === "outbound" && !samePhoneLoose(instancePhone, last.to_phone));

    const candidate = effectiveOutbound ? last.to_phone ?? null : last.from_phone ?? null;
    if (looksLikeGroupNumber(candidate)) return null;
    return candidate;
  }, [waMsgsQ.data, instancePhone]);

  const participants = useMemo(() => {
    const s = new Set<string>();
    for (const m of waMsgsQ.data ?? []) {
      if (m.from_phone) s.add(m.from_phone);
      if (m.to_phone) s.add(m.to_phone);
    }
    return Array.from(s);
  }, [waMsgsQ.data]);

  const logTimeline = async (args: { event_type: string; message: string; meta_json?: any }) => {
    if (!activeTenantId || !caseId) return;
    await supabase.from("timeline_events").insert({
      tenant_id: activeTenantId,
      case_id: caseId,
      event_type: args.event_type,
      actor_type: "admin",
      actor_id: user?.id ?? null,
      message: args.message,
      meta_json: args.meta_json ?? {},
      occurred_at: new Date().toISOString(),
    });
  };

  const sendText = async () => {
    if (!activeTenantId) return;
    const inst = instanceQ.data;
    const to = counterpartPhone;

    if (!inst?.id) {
      showError("Nenhuma instância WhatsApp ativa está vinculada ao seu usuário neste tenant.");
      return;
    }

    if (!to) {
      showError("Não consegui identificar o destinatário (sem mensagens no case). ");
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token ?? null;

      const url = "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/integrations-zapi-send";
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tenantId: activeTenantId,
          instanceId: inst.id,
          to,
          type: "text",
          text: trimmed,
          meta: { case_id: caseId },
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      setText("");
      showSuccess("Mensagem preparada/enfileirada.");

      await logTimeline({
        event_type: "whatsapp_outbound",
        message: `Mensagem enviada para ${counterpartRoleLabel}.`,
        meta_json: { to, kind: "panel_send", preview: trimmed.slice(0, 240) },
      });

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["wa_messages_case", activeTenantId, caseId] }),
        qc.invalidateQueries({ queryKey: ["timeline", activeTenantId, caseId] }),
      ]);
    } catch (e: any) {
      showError(`Falha ao enviar: ${e?.message ?? "erro"}`);
    } finally {
      setSending(false);
    }
  };

  const analyzeMedia = async (msgId: string, mode: "ocr" | "transcribe") => {
    if (!activeTenantId) return;
    if (transcribingById[msgId]) return;

    setTranscribingById((p) => ({ ...p, [msgId]: true }));
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const url = "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/wa-analyze-media";
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenantId: activeTenantId, messageId: msgId, mode }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const hint = json?.hint ? ` (${json.hint})` : "";
        throw new Error(String(json?.error ?? `Falha (${res.status})`) + hint);
      }

      showSuccess(mode === "ocr" ? "Texto extraído da imagem." : "Mídia transcrita.");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["wa_messages_case", activeTenantId, caseId] }),
        qc.invalidateQueries({ queryKey: ["timeline", activeTenantId, caseId] }),
      ]);
    } catch (e: any) {
      showError(e?.message ?? "Falha ao interpretar mídia");
    } finally {
      setTranscribingById((p) => ({ ...p, [msgId]: false }));
    }
  };

  useEffect(() => {
    if (tab !== "messages") return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [waMsgsQ.data?.length, tab]);

  return (
    <div
      className={cn(
        "rounded-[22px] border border-slate-200 bg-[hsl(var(--byfrost-bg))] shadow-sm overflow-hidden flex flex-col",
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-white/70 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">Conversa</div>
          <div className="mt-0.5 text-[11px] text-slate-600 truncate">
            WhatsApp • {counterpartPhone ? `destinatário (${counterpartRoleLabel}): ${counterpartPhone}` : "aguardando mensagens"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={tab === "messages" ? "default" : "secondary"}
            className={cn(
              "h-9 rounded-2xl",
              tab === "messages"
                ? "bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                : ""
            )}
            onClick={() => setTab("messages")}
          >
            <MessagesSquare className="mr-2 h-4 w-4" /> Mensagens
          </Button>
          <Button
            type="button"
            variant={tab === "participants" ? "default" : "secondary"}
            className={cn(
              "h-9 rounded-2xl",
              tab === "participants"
                ? "bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                : ""
            )}
            onClick={() => setTab("participants")}
          >
            <Users className="mr-2 h-4 w-4" /> Participantes
          </Button>
        </div>
      </div>

      {/* Body */}
      {tab === "participants" ? (
        <div className="bg-white p-4">
          <div className="text-xs font-semibold text-slate-900">Participantes (deduzidos)</div>
          <div className="mt-2 grid gap-2">
            {participants.map((p) => (
              <div
                key={p}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{p}</div>
                  <div className="text-[11px] text-slate-500">número</div>
                </div>
                <div className="h-8 w-8 rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))] grid place-items-center text-xs font-bold">
                  {initialsFromPhone(p)}
                </div>
              </div>
            ))}

            {participants.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
                Ainda não há mensagens vinculadas a este case.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Messages */}
          <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
            {waMsgsQ.isError && (
              <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                Erro ao carregar conversa: {(waMsgsQ.error as any)?.message ?? ""}
              </div>
            )}

            {(waMsgsQ.data ?? []).length === 0 && !waMsgsQ.isError && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-600">
                Sem mensagens ainda.
              </div>
            )}

            <div className="space-y-3">
              {(waMsgsQ.data ?? []).map((m) => {
                const effectiveInbound =
                  samePhoneLoose(instancePhone, m.from_phone)
                    ? false
                    : samePhoneLoose(instancePhone, m.to_phone)
                      ? true
                      : m.direction === "inbound";

                const mediaUrl = pickBestMediaUrl(m);
                const normalizedType = normalizeWaType(m.type, m.payload_json, mediaUrl);

                const loc = normalizedType === "location" ? extractLocation(m.payload_json) : null;
                const mapsUrl = loc ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : null;

                const extractedText =
                  normalizedType === "audio" || normalizedType === "video" || normalizedType === "image"
                    ? getBestText(m)
                    : "";

                const msgText = normalizedType === "text" ? getBestText(m) : "";

                const inboundLabel = senderIsVendor ? "Vendedor" : "Cliente";

                return (
                  <div
                    key={m.id}
                    className={cn("flex items-end gap-2", effectiveInbound ? "justify-start" : "justify-end")}
                  >
                    {/* Avatar (only show on inbound to mimic the reference layout) */}
                    {effectiveInbound ? (
                      <div className="h-9 w-9 flex-shrink-0 rounded-2xl bg-white/80 border border-slate-200 grid place-items-center text-xs font-bold text-slate-700">
                        {initialsFromPhone(m.from_phone)}
                      </div>
                    ) : (
                      <div className="h-9 w-9 flex-shrink-0" />
                    )}

                    <div className={cn("max-w-[78%]", effectiveInbound ? "mr-auto" : "ml-auto")}>
                      <div
                        className={cn(
                          "rounded-[20px] px-3 py-2 shadow-sm",
                          effectiveInbound
                            ? "bg-white border border-slate-200 text-slate-900"
                            : "bg-[hsl(var(--byfrost-accent))] text-white"
                        )}
                      >
                        {normalizedType === "image" && mediaUrl ? (
                          <div className="space-y-2">
                            <a href={mediaUrl} target="_blank" rel="noreferrer" className="block">
                              <img
                                src={mediaUrl}
                                alt="Imagem"
                                className={cn(
                                  "max-h-[240px] max-w-full h-auto w-auto rounded-2xl border object-contain",
                                  effectiveInbound ? "border-slate-200" : "border-white/25"
                                )}
                              />
                            </a>

                            <div
                              className={cn(
                                "flex items-center justify-between gap-2",
                                effectiveInbound ? "" : ""
                              )}
                            >
                              <div
                                className={cn(
                                  "text-sm font-medium",
                                  effectiveInbound ? "text-slate-900" : "text-white"
                                )}
                              >
                                Imagem
                              </div>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className={cn(
                                  "h-8 rounded-2xl px-3",
                                  effectiveInbound ? "" : "border-white/25 bg-white/10 text-white hover:bg-white/15"
                                )}
                                onClick={() => analyzeMedia(m.id, "ocr")}
                                disabled={Boolean(transcribingById[m.id]) || !mediaUrl || Boolean(extractedText?.trim())}
                                title={
                                  extractedText?.trim()
                                    ? "Esta imagem já tem texto extraído"
                                    : !mediaUrl
                                      ? "Sem URL da imagem"
                                      : "Extrair texto (OCR)"
                                }
                              >
                                {transcribingById[m.id]
                                  ? "Extraindo…"
                                  : extractedText?.trim()
                                    ? "Extraído"
                                    : "Extrair texto"}
                              </Button>
                            </div>

                            {extractedText?.trim() ? (
                              <div
                                className={cn(
                                  "rounded-2xl p-3 text-sm leading-relaxed whitespace-pre-wrap break-words",
                                  effectiveInbound ? "bg-slate-50 text-slate-800" : "bg-white/10 text-white/95"
                                )}
                              >
                                {extractedText}
                              </div>
                            ) : null}
                          </div>
                        ) : normalizedType === "video" ? (
                          <div className="space-y-2">
                            <div
                              className={cn(
                                "flex items-center justify-between gap-2 text-sm font-medium",
                                effectiveInbound ? "text-slate-900" : "text-white"
                              )}
                            >
                              <span>Vídeo</span>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className={cn(
                                  "h-8 rounded-2xl px-3",
                                  effectiveInbound ? "" : "border-white/25 bg-white/10 text-white hover:bg-white/15"
                                )}
                                onClick={() => analyzeMedia(m.id, "transcribe")}
                                disabled={Boolean(transcribingById[m.id]) || !mediaUrl || Boolean(extractedText?.trim())}
                                title={
                                  extractedText?.trim()
                                    ? "Este vídeo já tem transcrição"
                                    : !mediaUrl
                                      ? "Sem URL do vídeo"
                                      : "Transcrever áudio do vídeo"
                                }
                              >
                                {transcribingById[m.id]
                                  ? "Transcrevendo…"
                                  : extractedText?.trim()
                                    ? "Transcrito"
                                    : "Transcrever"}
                              </Button>
                            </div>

                            {mediaUrl ? (
                              <video controls src={mediaUrl} className="w-full max-w-full rounded-2xl" />
                            ) : (
                              <div className={cn("text-sm", effectiveInbound ? "text-slate-600" : "text-white/90")}>
                                (sem URL do vídeo)
                              </div>
                            )}

                            {extractedText?.trim() ? (
                              <div
                                className={cn(
                                  "rounded-2xl p-3 text-sm leading-relaxed whitespace-pre-wrap break-words",
                                  effectiveInbound ? "bg-slate-50 text-slate-800" : "bg-white/10 text-white/95"
                                )}
                              >
                                {extractedText}
                              </div>
                            ) : null}
                          </div>
                        ) : normalizedType === "audio" ? (
                          <div className="space-y-2">
                            <div
                              className={cn(
                                "flex items-center justify-between gap-2 text-sm font-medium",
                                effectiveInbound ? "text-slate-900" : "text-white"
                              )}
                            >
                              <span>Áudio</span>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className={cn(
                                  "h-8 rounded-2xl px-3",
                                  effectiveInbound ? "" : "border-white/25 bg-white/10 text-white hover:bg-white/15"
                                )}
                                onClick={() => analyzeMedia(m.id, "transcribe")}
                                disabled={Boolean(transcribingById[m.id]) || !mediaUrl || Boolean(extractedText?.trim())}
                                title={
                                  extractedText?.trim()
                                    ? "Este áudio já tem transcrição"
                                    : !mediaUrl
                                      ? "Sem URL do áudio"
                                      : "Transcrever áudio"
                                }
                              >
                                {transcribingById[m.id]
                                  ? "Transcrevendo…"
                                  : extractedText?.trim()
                                    ? "Transcrito"
                                    : "Transcrever"}
                              </Button>
                            </div>

                            {mediaUrl ? (
                              <audio controls src={mediaUrl} className="w-full" crossOrigin="anonymous" />
                            ) : (
                              <div className={cn("text-sm", effectiveInbound ? "text-slate-600" : "text-white/90")}>
                                (sem URL do áudio)
                              </div>
                            )}

                            {extractedText?.trim() ? (
                              <div
                                className={cn(
                                  "rounded-2xl p-3 text-sm leading-relaxed whitespace-pre-wrap break-words",
                                  effectiveInbound ? "bg-slate-50 text-slate-800" : "bg-white/10 text-white/95"
                                )}
                              >
                                {extractedText}
                              </div>
                            ) : null}
                          </div>
                        ) : normalizedType === "location" ? (
                          <div className="space-y-1">
                            <div
                              className={cn(
                                "flex items-center gap-2 text-sm font-medium",
                                effectiveInbound ? "text-slate-900" : "text-white"
                              )}
                            >
                              <MapPin className="h-4 w-4" /> Localização
                            </div>
                            {mapsUrl ? (
                              <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={cn(
                                  "text-sm underline underline-offset-2",
                                  effectiveInbound ? "text-slate-700" : "text-white/95"
                                )}
                              >
                                Abrir no Maps
                              </a>
                            ) : (
                              <div className={cn("text-sm", effectiveInbound ? "text-slate-600" : "text-white/90")}>
                                (sem coordenadas)
                              </div>
                            )}
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "text-sm leading-relaxed whitespace-pre-wrap break-words",
                              effectiveInbound ? "text-slate-900" : "text-white"
                            )}
                          >
                            {msgText || "(sem texto)"}
                          </div>
                        )}
                      </div>

                      <div
                        className={cn(
                          "mt-1 text-[11px]",
                          effectiveInbound ? "text-slate-500" : "text-slate-500 text-right"
                        )}
                      >
                        {effectiveInbound ? `${inboundLabel}${m.from_phone ? ` • ${m.from_phone}` : ""}` : "Painel"} • {fmtTime(m.occurred_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Typing indicator */}
            {text.trim().length > 0 && (
              <div className="mt-4 flex items-center gap-2 text-xs text-slate-600">
                <div className="h-2 w-2 rounded-full bg-[hsl(var(--byfrost-accent))]" />
                Você está digitando…
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-slate-200 bg-white/80 p-3 backdrop-blur">
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 w-10 rounded-2xl p-0"
                  title="Anexar (em breve)"
                  disabled
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 w-10 rounded-2xl p-0"
                  title="Foto (em breve)"
                  disabled
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 w-10 rounded-2xl p-0"
                  title="Áudio (em breve)"
                  disabled
                >
                  <Mic className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex-1">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Escreva sua mensagem…"
                  className={cn(
                    "h-10 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 shadow-sm outline-none",
                    "placeholder:text-slate-400 focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                  )}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendText();
                    }
                  }}
                />
              </div>

              <Button
                type="button"
                className="h-10 w-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] p-0 text-white shadow-sm hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                onClick={sendText}
                disabled={sending || !text.trim()}
                title="Enviar"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-2 text-[11px] text-slate-500">
              Enter envia • Shift+Enter quebra linha • envio usa sua instância do tenant
            </div>
          </div>
        </div>
      )}
    </div>
  );
}