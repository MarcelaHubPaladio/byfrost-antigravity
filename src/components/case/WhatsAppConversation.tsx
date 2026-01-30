import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import { Paperclip, Send, Image as ImageIcon, Mic, Users, MessagesSquare, MapPin } from "lucide-react";

type WaMessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  type: "text" | "image" | "audio" | "location";
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
  // 1) Prefer body_text when it is already a normal string.
  const raw = (m.body_text ?? "").trim();
  if (raw && raw !== "[object Object]") {
    // Sometimes we accidentally store a JSON-string in body_text.
    if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
      const parsed = safeJsonParse(raw);
      if (parsed.ok) {
        const v = parsed.value;
        // Common shapes
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

  // 2) Fallback: extract from payload_json.
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
  // require at least 10 digits to reduce false matches
  if (Math.min(da.length, db.length) < 10) return false;
  return da === db;
}

export function WhatsAppConversation({ caseId, className }: { caseId: string; className?: string }) {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();
  const [tab, setTab] = useState<"messages" | "participants">("messages");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const instanceQ = useQuery({
    queryKey: ["wa_instance_active_first", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_instances")
        .select("id,phone_number")
        .eq("tenant_id", activeTenantId!)
        .eq("status", "active")
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

    // Hygiene: sometimes provider webhooks store our own instance-sent messages as inbound.
    // If the instance phone matches `from_phone`, treat it as outbound.
    const effectiveOutbound =
      samePhoneLoose(instancePhone, last.from_phone) ||
      (last.direction === "outbound" && !samePhoneLoose(instancePhone, last.to_phone));

    if (effectiveOutbound) return last.to_phone ?? null;
    return last.from_phone ?? null;
  }, [waMsgsQ.data, instancePhone]);

  const participants = useMemo(() => {
    const s = new Set<string>();
    for (const m of waMsgsQ.data ?? []) {
      if (m.from_phone) s.add(m.from_phone);
      if (m.to_phone) s.add(m.to_phone);
    }
    return Array.from(s);
  }, [waMsgsQ.data]);

  const sendText = async () => {
    if (!activeTenantId) return;
    const inst = instanceQ.data;
    const to = counterpartPhone;

    if (!inst?.id) {
      showError("Nenhuma instância WhatsApp ativa configurada para este tenant.");
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
      await qc.invalidateQueries({ queryKey: ["wa_messages_case", activeTenantId, caseId] });
    } catch (e: any) {
      showError(`Falha ao enviar: ${e?.message ?? "erro"}`);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (tab !== "messages") return;
    const el = scrollerRef.current;
    if (!el) return;
    // scroll to bottom after updates
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
            WhatsApp • {counterpartPhone ? `destinatário: ${counterpartPhone}` : "aguardando mensagens"}
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

                const loc = m.type === "location" ? extractLocation(m.payload_json) : null;
                const mapsUrl = loc ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : null;

                const text = m.type === "text" ? getBestText(m) : "";

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
                        {m.type === "image" && m.media_url ? (
                          <a href={m.media_url} target="_blank" rel="noreferrer" className="block">
                            <img
                              src={m.media_url}
                              alt="Imagem"
                              className={cn(
                                "max-h-[220px] w-auto rounded-2xl border",
                                effectiveInbound ? "border-slate-200" : "border-white/25"
                              )}
                            />
                          </a>
                        ) : m.type === "audio" ? (
                          <div className="space-y-2">
                            <div
                              className={cn(
                                "text-sm font-medium",
                                effectiveInbound ? "text-slate-900" : "text-white"
                              )}
                            >
                              Áudio
                            </div>
                            {m.media_url ? (
                              <audio controls src={m.media_url} className="w-full" />
                            ) : (
                              <div className={cn("text-sm", effectiveInbound ? "text-slate-600" : "text-white/90")}>
                                (sem URL do áudio)
                              </div>
                            )}
                          </div>
                        ) : m.type === "location" ? (
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
                              "text-sm leading-relaxed",
                              effectiveInbound ? "text-slate-900" : "text-white"
                            )}
                          >
                            {text || "(sem texto)"}
                          </div>
                        )}
                      </div>

                      <div
                        className={cn(
                          "mt-1 text-[11px]",
                          effectiveInbound ? "text-slate-500" : "text-slate-500 text-right"
                        )}
                      >
                        {effectiveInbound ? (m.from_phone ?? "") : "Você"} • {fmtTime(m.occurred_at)}
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
              Enter envia • Shift+Enter quebra linha • envio usa a instância ativa do tenant
            </div>
          </div>
        </div>
      )}
    </div>
  );
}