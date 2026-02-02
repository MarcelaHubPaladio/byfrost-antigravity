import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { showError, showSuccess } from "@/utils/toast";
import { CalendarDays, RefreshCw } from "lucide-react";

type Mode = "month" | "week";

type CalendarPub = {
  id: string;
  tenant_id: string;
  case_id: string;
  content_item_id: string;
  channel: string;
  scheduled_at: string | null;
  publish_status: string;
  content_items?: { theme_title: string | null; client_name: string | null } | null;
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7; // monday-based
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(iso: string) {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function fmtTime(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function titleize(s: string) {
  return (s ?? "")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function ContentCalendar() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { activeTenantId } = useTenant();

  const [mode, setMode] = useState<Mode>("month");
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [movingPubId, setMovingPubId] = useState<string | null>(null);

  const range = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(cursor);
      const end = addDays(start, 7);
      return { start, end, gridDays: 7 };
    }

    const m = startOfMonth(cursor);
    const gridStart = startOfWeek(m);
    const gridEnd = addDays(gridStart, 42);
    return { start: gridStart, end: gridEnd, gridDays: 42 };
  }, [mode, cursor]);

  const pubsQ = useQuery({
    queryKey: ["content_calendar_pubs", activeTenantId, mode, range.start.toISOString().slice(0, 10)],
    enabled: Boolean(activeTenantId),
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_publications")
        .select(
          "id,tenant_id,case_id,content_item_id,channel,scheduled_at,publish_status,content_items(theme_title,client_name)"
        )
        .eq("tenant_id", activeTenantId!)
        .gte("scheduled_at", range.start.toISOString())
        .lt("scheduled_at", range.end.toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(2500);
      if (error) throw error;
      return (data ?? []) as any as CalendarPub[];
    },
  });

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarPub[]>();
    for (const r of pubsQ.data ?? []) {
      const iso = String(r.scheduled_at ?? "");
      if (!iso) continue;
      const k = dayKey(iso);
      const cur = m.get(k) ?? [];
      cur.push(r);
      m.set(k, cur);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(String(a.scheduled_at)).getTime() - new Date(String(b.scheduled_at)).getTime());
    }
    return m;
  }, [pubsQ.data]);

  const setScheduledAt = async (pubId: string, next: Date) => {
    if (!activeTenantId) return;
    setMovingPubId(pubId);
    try {
      const { error } = await supabase
        .from("content_publications")
        .update({ scheduled_at: next.toISOString(), publish_status: "SCHEDULED" })
        .eq("tenant_id", activeTenantId)
        .eq("id", pubId)
        .neq("publish_status", "PUBLISHED");
      if (error) throw error;

      showSuccess("Agendamento atualizado.");
      await qc.invalidateQueries({ queryKey: ["content_calendar_pubs", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao reagendar: ${e?.message ?? "erro"}`);
    } finally {
      setMovingPubId(null);
    }
  };

  const headerLabel =
    mode === "week"
      ? `Semana de ${fmtDate(startOfWeek(cursor))}`
      : cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const prev = () => {
    const c = new Date(cursor);
    if (mode === "week") c.setDate(c.getDate() - 7);
    else c.setMonth(c.getMonth() - 1);
    setCursor(c);
  };

  const next = () => {
    const c = new Date(cursor);
    if (mode === "week") c.setDate(c.getDate() + 7);
    else c.setMonth(c.getMonth() + 1);
    setCursor(c);
  };

  if (!activeTenantId) {
    return (
      <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Selecione um tenant.
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-900">Calendário oficial</h3>
              <p className="mt-0.5 text-sm text-slate-600">Arraste cards para reagendar (atualiza scheduled_at).</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => pubsQ.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-1">
            <button
              type="button"
              className={cn(
                "h-9 rounded-2xl px-3 text-xs font-semibold",
                mode === "month" ? "bg-slate-900 text-white" : "text-slate-700"
              )}
              onClick={() => setMode("month")}
            >
              Mês
            </button>
            <button
              type="button"
              className={cn(
                "h-9 rounded-2xl px-3 text-xs font-semibold",
                mode === "week" ? "bg-slate-900 text-white" : "text-slate-700"
              )}
              onClick={() => setMode("week")}
            >
              Semana
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-2 py-1">
            <Button variant="secondary" className="h-9 rounded-2xl" onClick={prev}>
              ←
            </Button>
            <div className="px-1 text-xs font-semibold text-slate-800">{headerLabel}</div>
            <Button variant="secondary" className="h-9 rounded-2xl" onClick={next}>
              →
            </Button>
          </div>
        </div>
      </div>

      {mode === "month" ? (
        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-7 gap-2 text-[11px] font-semibold text-slate-600">
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                <div key={d} className="px-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-2">
              {Array.from({ length: range.gridDays }).map((_, idx) => {
                const d = addDays(range.start, idx);
                const k = d.toISOString().slice(0, 10);
                const items = byDay.get(k) ?? [];
                const isToday = k === new Date().toISOString().slice(0, 10);

                return (
                  <div
                    key={k}
                    className={cn(
                      "min-h-[120px] rounded-[18px] border bg-white p-2",
                      isToday ? "border-[hsl(var(--byfrost-accent)/0.35)]" : "border-slate-200"
                    )}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const pubId = e.dataTransfer.getData("text/pubId");
                      const timeIso = e.dataTransfer.getData("text/pubTime");
                      if (!pubId) return;

                      const base = new Date(k + "T09:00:00");
                      if (timeIso) {
                        try {
                          const t = new Date(timeIso);
                          if (!Number.isNaN(t.getTime())) {
                            base.setHours(t.getHours(), t.getMinutes(), 0, 0);
                          }
                        } catch {
                          // ignore
                        }
                      }
                      setScheduledAt(pubId, base);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className={cn("text-xs font-semibold", isToday ? "text-[hsl(var(--byfrost-accent))]" : "text-slate-800")}>
                        {d.getDate()}
                      </div>
                      <div className="text-[10px] text-slate-400">{items.length ? items.length : ""}</div>
                    </div>

                    <div className="mt-2 space-y-1">
                      {items.slice(0, 4).map((p) => {
                        const label = p.content_items?.theme_title || p.content_items?.client_name || p.channel;
                        const dim = movingPubId === p.id;
                        const canDrag = p.publish_status !== "PUBLISHED";

                        return (
                          <button
                            key={p.id}
                            type="button"
                            draggable={canDrag}
                            onDragStart={(e) => {
                              if (!canDrag) return;
                              e.dataTransfer.setData("text/pubId", p.id);
                              e.dataTransfer.setData("text/pubTime", String(p.scheduled_at ?? ""));
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onClick={() => nav(`/app/content/${encodeURIComponent(p.case_id)}`)}
                            className={cn(
                              "w-full rounded-2xl border px-2 py-1 text-left text-[11px] font-semibold transition",
                              dim ? "opacity-60" : "",
                              canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                              "border-slate-200 bg-slate-50 hover:bg-white"
                            )}
                            title={label}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-slate-800">{label}</span>
                              <span className="shrink-0 text-[10px] text-slate-500">{fmtTime(p.scheduled_at)}</span>
                            </div>
                          </button>
                        );
                      })}

                      {items.length > 4 && (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-2 py-1 text-[11px] text-slate-500">
                          +{items.length - 4}…
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-[980px] gap-3">
            {Array.from({ length: 7 }).map((_, idx) => {
              const d = addDays(range.start, idx);
              const k = d.toISOString().slice(0, 10);
              const items = byDay.get(k) ?? [];

              return (
                <div
                  key={k}
                  className="w-[320px] flex-shrink-0 rounded-[22px] border border-slate-200 bg-white p-3"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const pubId = e.dataTransfer.getData("text/pubId");
                    const timeIso = e.dataTransfer.getData("text/pubTime");
                    if (!pubId) return;

                    const base = new Date(k + "T09:00:00");
                    if (timeIso) {
                      try {
                        const t = new Date(timeIso);
                        if (!Number.isNaN(t.getTime())) {
                          base.setHours(t.getHours(), t.getMinutes(), 0, 0);
                        }
                      } catch {
                        // ignore
                      }
                    }
                    setScheduledAt(pubId, base);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">
                      {d.toLocaleDateString(undefined, { weekday: "short" })}
                      <span className="text-slate-400"> • </span>
                      <span className="text-slate-700">{fmtDate(d)}</span>
                    </div>
                    <div className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{items.length}</div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {items.map((p) => {
                      const label = p.content_items?.theme_title || p.content_items?.client_name || p.channel;
                      const dim = movingPubId === p.id;
                      const canDrag = p.publish_status !== "PUBLISHED";

                      return (
                        <button
                          key={p.id}
                          type="button"
                          draggable={canDrag}
                          onDragStart={(e) => {
                            if (!canDrag) return;
                            e.dataTransfer.setData("text/pubId", p.id);
                            e.dataTransfer.setData("text/pubTime", String(p.scheduled_at ?? ""));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => nav(`/app/content/${encodeURIComponent(p.case_id)}`)}
                          className={cn(
                            "w-full rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:bg-white",
                            dim ? "opacity-60" : "",
                            canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">{label}</div>
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                {titleize(p.channel)} • {titleize(p.publish_status)}
                              </div>
                            </div>
                            <Badge className="rounded-full border-0 bg-indigo-100 text-indigo-900 hover:bg-indigo-100">
                              {fmtTime(p.scheduled_at)}
                            </Badge>
                          </div>
                        </button>
                      );
                    })}

                    {items.length === 0 && (
                      <div className="rounded-[18px] border border-dashed border-slate-200 bg-white/60 p-3 text-xs text-slate-500">
                        Solte aqui para agendar.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pubsQ.isError && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          Erro ao carregar calendário: {(pubsQ.error as any)?.message ?? ""}
        </div>
      )}
    </div>
  );
}