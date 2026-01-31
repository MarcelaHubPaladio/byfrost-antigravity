import { useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WhatsAppConversation } from "@/components/case/WhatsAppConversation";
import { Clock, MessagesSquare, Search, UserRound } from "lucide-react";

type CaseRow = {
  id: string;
  title: string | null;
  updated_at: string;
  meta_json?: any;
};

type ReadRow = { case_id: string; last_seen_at: string };

type WaMsgLite = {
  case_id: string | null;
  occurred_at: string;
  direction: "inbound" | "outbound";
  type: string;
  body_text: string | null;
  from_phone: string | null;
  to_phone: string | null;
};

type WaInstanceRow = { id: string; phone_number: string | null };

type CaseFieldRow = { case_id: string; key: string; value_text: string | null };

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

function getMetaPhone(meta: any): string | null {
  if (!meta || typeof meta !== "object") return null;
  const direct =
    meta.customer_phone ??
    meta.customerPhone ??
    meta.phone ??
    meta.whatsapp ??
    meta.to_phone ??
    meta.toPhone ??
    null;
  return typeof direct === "string" && direct.trim() ? direct.trim() : null;
}

function minutesAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(diff / 60000));
}

function bestSnippet(m: WaMsgLite | null) {
  if (!m) return "";
  if (m.type === "image") return "📷 Imagem";
  if (m.type === "audio") return "🎤 Áudio";
  if (m.type === "location") return "📍 Localização";
  const t = String(m.body_text ?? "").trim();
  return t || "(sem texto)";
}

export default function Chats() {
  const { id } = useParams<{ id?: string }>();
  const nav = useNavigate();
  const loc = useLocation();
  const { activeTenantId } = useTenant();
  const { user } = useSession();

  const q = useMemo(() => {
    const sp = new URLSearchParams(loc.search);
    return (sp.get("q") ?? "").trim();
  }, [loc.search]);

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

  const chatsQ = useQuery({
    queryKey: ["chat_cases", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,title,updated_at,meta_json")
        .eq("tenant_id", activeTenantId!)
        .eq("is_chat", true)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as any as CaseRow[];
    },
  });

  const caseIds = useMemo(() => (chatsQ.data ?? []).map((c) => c.id), [chatsQ.data]);

  const fieldsQ = useQuery({
    queryKey: ["chat_cases_phone_fields", activeTenantId, caseIds.join(",")],
    enabled: Boolean(activeTenantId && caseIds.length),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_fields")
        .select("case_id,key,value_text")
        .eq("tenant_id", activeTenantId!)
        .in("case_id", caseIds)
        .in("key", ["whatsapp", "phone", "customer_phone"])
        .limit(4000);
      if (error) throw error;
      return (data ?? []) as any as CaseFieldRow[];
    },
  });

  const phoneByCase = useMemo(() => {
    const priority = new Map<string, number>([
      ["whatsapp", 1],
      ["customer_phone", 2],
      ["phone", 3],
    ]);
    const best = new Map<string, { p: number; v: string }>();

    for (const r of fieldsQ.data ?? []) {
      const cid = String((r as any).case_id ?? "");
      const k = String((r as any).key ?? "");
      const v = String((r as any).value_text ?? "").trim();
      if (!cid || !v) continue;
      const p = priority.get(k) ?? 999;
      const cur = best.get(cid);
      if (!cur || p < cur.p) best.set(cid, { p, v });
    }

    const out = new Map<string, string>();
    for (const [cid, { v }] of best.entries()) out.set(cid, v);
    return out;
  }, [fieldsQ.data]);

  const readsQ = useQuery({
    queryKey: ["case_message_reads", activeTenantId, user?.id],
    enabled: Boolean(activeTenantId && user?.id),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_message_reads")
        .select("case_id,last_seen_at")
        .eq("tenant_id", activeTenantId!)
        .eq("user_id", user!.id)
        .limit(4000);
      if (error) throw error;
      return (data ?? []) as any as ReadRow[];
    },
  });

  const lastInboundQ = useQuery({
    queryKey: ["chat_case_last_inbound", activeTenantId, caseIds.join(",")],
    enabled: Boolean(activeTenantId && caseIds.length),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_messages")
        .select("case_id,occurred_at,from_phone")
        .eq("tenant_id", activeTenantId!)
        .eq("direction", "inbound")
        .in("case_id", caseIds)
        .order("occurred_at", { ascending: false })
        .limit(6000);
      if (error) throw error;
      return (data ?? []) as any as Array<{ case_id: string | null; occurred_at: string; from_phone: string | null }>;
    },
  });

  const lastMsgQ = useQuery({
    queryKey: ["chat_case_last_message", activeTenantId, caseIds.join(",")],
    enabled: Boolean(activeTenantId && caseIds.length),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_messages")
        .select("case_id,occurred_at,direction,type,body_text,from_phone,to_phone")
        .eq("tenant_id", activeTenantId!)
        .in("case_id", caseIds)
        .order("occurred_at", { ascending: false })
        .limit(8000);
      if (error) throw error;
      return (data ?? []) as any as WaMsgLite[];
    },
  });

  const readByCase = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of readsQ.data ?? []) m.set(r.case_id, r.last_seen_at);
    return m;
  }, [readsQ.data]);

  const lastInboundAtByCase = useMemo(() => {
    const m = new Map<string, string>();
    const instPhone = instanceQ.data?.phone_number ?? null;

    for (const row of lastInboundQ.data ?? []) {
      const cid = String((row as any).case_id ?? "");
      if (!cid) continue;
      if (instPhone && samePhoneLoose(instPhone, (row as any).from_phone)) continue;
      if (!m.has(cid)) m.set(cid, (row as any).occurred_at);
    }
    return m;
  }, [lastInboundQ.data, instanceQ.data?.phone_number]);

  const unreadByCase = useMemo(() => {
    const s = new Set<string>();
    for (const [cid, lastInboundAt] of lastInboundAtByCase.entries()) {
      const seenAt = readByCase.get(cid) ?? null;
      if (!seenAt) {
        s.add(cid);
        continue;
      }
      if (new Date(lastInboundAt).getTime() > new Date(seenAt).getTime()) s.add(cid);
    }
    return s;
  }, [lastInboundAtByCase, readByCase]);

  const lastMsgByCase = useMemo(() => {
    const m = new Map<string, WaMsgLite>();
    for (const row of lastMsgQ.data ?? []) {
      const cid = String((row as any).case_id ?? "");
      if (!cid) continue;
      if (!m.has(cid)) m.set(cid, row);
    }
    return m;
  }, [lastMsgQ.data]);

  const filteredChats = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const rows = chatsQ.data ?? [];
    if (!qq) return rows;

    return rows.filter((c) => {
      const phone = phoneByCase.get(c.id) ?? getMetaPhone(c.meta_json) ?? "";
      const title = c.title ?? "";
      const blob = `${title} ${phone}`.toLowerCase();
      return blob.includes(qq);
    });
  }, [chatsQ.data, phoneByCase, q]);

  const sortedChats = useMemo(() => {
    const rows = [...filteredChats];

    const sortKey = (c: CaseRow) => {
      const last = lastMsgByCase.get(c.id) ?? null;
      return last?.occurred_at ?? c.updated_at;
    };

    rows.sort((a, b) => {
      const au = unreadByCase.has(a.id);
      const bu = unreadByCase.has(b.id);
      if (au !== bu) return au ? -1 : 1;

      const at = sortKey(a);
      const bt = sortKey(b);
      return new Date(bt).getTime() - new Date(at).getTime();
    });

    return rows;
  }, [filteredChats, lastMsgByCase, unreadByCase]);

  const activeCaseId = id ?? null;

  // Default selection: if /app/chat without id, jump to the first chat.
  useEffect(() => {
    if (activeCaseId) return;
    const first = sortedChats[0];
    if (first?.id) nav(`/app/chat/${first.id}${loc.search || ""}`, { replace: true });
  }, [activeCaseId, sortedChats, nav, loc.search]);

  // When selecting a chat, mark as read.
  useEffect(() => {
    if (!activeTenantId || !activeCaseId || !user?.id) return;
    supabase
      .from("case_message_reads")
      .upsert(
        {
          tenant_id: activeTenantId,
          case_id: activeCaseId,
          user_id: user.id,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,case_id,user_id" }
      )
      .then(() => null);
  }, [activeTenantId, activeCaseId, user?.id]);

  const activeCase = useMemo(() => {
    if (!activeCaseId) return null;
    return (chatsQ.data ?? []).find((c) => c.id === activeCaseId) ?? null;
  }, [activeCaseId, chatsQ.data]);

  const activeTitle = useMemo(() => {
    if (!activeCase) return "Chat";
    return (
      activeCase.title ??
      phoneByCase.get(activeCase.id) ??
      getMetaPhone(activeCase.meta_json) ??
      `Chat ${String(activeCase.id).slice(0, 8)}…`
    );
  }, [activeCase, phoneByCase]);

  const hasSelection = Boolean(activeCaseId && activeCase);

  return (
    <RequireAuth>
      <AppShell hideTopBar>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 shadow-sm backdrop-blur overflow-hidden">
          <div className="grid min-h-[calc(100vh-28px)] grid-cols-1 md:grid-cols-[360px_1fr]">
            {/* Left: chat list */}
            <aside
              className={cn(
                "border-r border-slate-200 bg-white/70 backdrop-blur",
                hasSelection ? "hidden md:block" : "block"
              )}
            >
              <div className="flex items-center justify-between gap-2 px-4 py-4">
                <div className="flex items-center gap-2">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                    <MessagesSquare className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Chat</div>
                    <div className="text-[11px] text-slate-500">Conversas fora de fluxo</div>
                  </div>
                </div>

                <Button type="button" variant="secondary" className="h-10 rounded-2xl" asChild>
                  <Link to="/app">Voltar</Link>
                </Button>
              </div>

              <div className="px-4 pb-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={q}
                    onChange={(e) => {
                      const sp = new URLSearchParams(loc.search);
                      const v = e.target.value;
                      if (v.trim()) sp.set("q", v);
                      else sp.delete("q");
                      nav({ pathname: loc.pathname, search: sp.toString() }, { replace: true });
                    }}
                    placeholder="Buscar por nome ou telefone…"
                    className="h-11 rounded-2xl pl-10"
                  />
                </div>
              </div>

              <div className="px-2 pb-3">
                <div className="max-h-[calc(100vh-200px)] overflow-y-auto px-2">
                  {sortedChats.map((c) => {
                    const phone = phoneByCase.get(c.id) ?? getMetaPhone(c.meta_json) ?? null;
                    const primary = c.title ?? phone ?? "Conversa";
                    const secondary = c.title && phone ? phone : "WhatsApp";

                    const last = lastMsgByCase.get(c.id) ?? null;
                    const snippet = bestSnippet(last);

                    const unread = unreadByCase.has(c.id);
                    const active = c.id === activeCaseId;

                    return (
                      <Link
                        key={c.id}
                        to={`/app/chat/${c.id}${loc.search || ""}`}
                        className={cn(
                          "group flex items-center justify-between gap-3 rounded-[22px] border px-3 py-3 transition",
                          active
                            ? "border-[hsl(var(--byfrost-accent)/0.35)] bg-[hsl(var(--byfrost-accent)/0.10)]"
                            : unread
                              ? "border-rose-200 bg-white hover:border-rose-300"
                              : "border-slate-200 bg-white hover:border-slate-300"
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={cn(
                              "grid h-11 w-11 place-items-center rounded-2xl border",
                              active
                                ? "border-[hsl(var(--byfrost-accent)/0.35)] bg-white text-[hsl(var(--byfrost-accent))]"
                                : "border-slate-200 bg-slate-50 text-slate-700"
                            )}
                          >
                            <UserRound className="h-5 w-5" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-semibold text-slate-900">{primary}</div>
                              {unread ? (
                                <span
                                  className="h-2.5 w-2.5 rounded-full bg-rose-600 ring-4 ring-rose-100"
                                  title="Mensagem nova"
                                  aria-label="Mensagem nova"
                                />
                              ) : null}
                            </div>
                            <div className="mt-0.5 truncate text-[11px] text-slate-500">{secondary}</div>
                            <div className="mt-1 truncate text-xs text-slate-600">{snippet}</div>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                            <Clock className="h-3.5 w-3.5" />
                            {minutesAgo(last?.occurred_at ?? c.updated_at)}m
                          </div>
                        </div>
                      </Link>
                    );
                  })}

                  {sortedChats.length === 0 && (
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/60 p-5 text-sm text-slate-600">
                      Nenhuma conversa marcada como chat ainda.
                      <div className="mt-2 text-xs text-slate-500">
                        Abra um case e ative o toggle <span className="font-semibold">"Somente chat"</span>.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </aside>

            {/* Right: conversation */}
            <main className={cn("bg-[hsl(var(--byfrost-bg))]", hasSelection ? "block" : "hidden md:block")}>
              {hasSelection ? (
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between gap-2 px-4 py-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{activeTitle}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">WhatsApp • conversa</div>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10 rounded-2xl md:hidden"
                      onClick={() => nav("/app/chat" + (loc.search || ""))}
                    >
                      Voltar
                    </Button>
                  </div>

                  <div className="flex-1 px-3 pb-4 md:px-4">
                    <WhatsAppConversation caseId={activeCaseId!} className="h-[calc(100vh-170px)]" />
                  </div>
                </div>
              ) : (
                <div className="grid h-full place-items-center p-8">
                  <div className="max-w-md rounded-[28px] border border-slate-200 bg-white/70 p-6 text-center shadow-sm backdrop-blur">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                      <MessagesSquare className="h-6 w-6" />
                    </div>
                    <div className="mt-3 text-sm font-semibold text-slate-900">Selecione uma conversa</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Este inbox é só para cases marcados como <span className="font-semibold">chat</span>.
                    </div>
                  </div>
                </div>
              )}
            </main>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}