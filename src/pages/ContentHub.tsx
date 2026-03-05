import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { CalendarDays, Columns3, Plus, RefreshCw } from "lucide-react";

const KANBAN_COLUMNS = [
  "CRIAR",
  "PRODUCAO",
  "APROVACAO",
  "AGENDADO",
  "PUBLICADO",
  "ANALISADO",
  "ENCERRADO",
] as const;

type KanbanState = (typeof KANBAN_COLUMNS)[number];

type MetaJourneyRow = {
  id: string;
  config_json: any;
  journeys: { id: string; key: string; name: string };
};

type CaseRow = {
  id: string;
  tenant_id: string;
  journey_id: string;
  title: string | null;
  state: string;
  status: string;
  created_at: string;
  updated_at: string;
  journeys?: { key: string | null } | null;
};

type ContentItemRow = {
  id: string;
  case_id: string | null;
  client_name: string | null;
  theme_title: string | null;
  recording_date: string | null;
};

type PubRow = {
  id: string;
  case_id: string | null;
  content_item_id: string;
  channel: string;
  scheduled_at: string | null;
  publish_status: string;
};

function titleize(s: string) {
  return (s ?? "")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function dayKey(iso: string) {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

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

function clampState(s: string): KanbanState {
  const up = String(s ?? "").toUpperCase().trim();
  return (KANBAN_COLUMNS as readonly string[]).includes(up) ? (up as KanbanState) : "CRIAR";
}

function Kanban({
  metaJourney,
}: {
  metaJourney: MetaJourneyRow;
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { activeTenantId } = useTenant();

  const [movingCaseId, setMovingCaseId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [clientName, setClientName] = useState("");
  const [themeTitle, setThemeTitle] = useState("");
  const [recordingDate, setRecordingDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const casesQ = useQuery({
    queryKey: ["meta_content_cases", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,tenant_id,journey_id,title,state,status,created_at,updated_at,journeys:journeys!cases_journey_id_fkey(key)")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .eq("is_chat", false)
        .eq("journeys.key", "meta_content")
        .order("updated_at", { ascending: false })
        .limit(600);
      if (error) throw error;
      return (data ?? []) as any as CaseRow[];
    },
  });

  const caseIds = useMemo(() => (casesQ.data ?? []).map((c) => c.id), [casesQ.data]);

  const itemsQ = useQuery({
    queryKey: ["meta_content_items_by_case", activeTenantId, caseIds.join(",")],
    enabled: Boolean(activeTenantId && caseIds.length),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_items")
        .select("id,case_id,client_name,theme_title,recording_date")
        .eq("tenant_id", activeTenantId!)
        .in("case_id", caseIds)
        .limit(1000);
      if (error) throw error;
      const m = new Map<string, ContentItemRow>();
      for (const r of data ?? []) {
        const cid = String((r as any).case_id ?? "");
        if (cid) m.set(cid, r as any);
      }
      return m;
    },
  });

  const itemIds = useMemo(() => {
    const out: string[] = [];
    for (const it of itemsQ.data?.values() ?? []) out.push(it.id);
    return out;
  }, [itemsQ.data]);

  const pubsQ = useQuery({
    queryKey: ["meta_content_pubs_by_item", activeTenantId, itemIds.join(",")],
    enabled: Boolean(activeTenantId && itemIds.length),
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_publications")
        .select("id,case_id,content_item_id,channel,scheduled_at,publish_status")
        .eq("tenant_id", activeTenantId!)
        .in("content_item_id", itemIds)
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .limit(2000);
      if (error) throw error;

      const nextByCase = new Map<string, PubRow>();
      for (const r of data ?? []) {
        const cid = String((r as any).case_id ?? "");
        if (!cid) continue;
        if ((r as any).scheduled_at) {
          if (!nextByCase.has(cid)) nextByCase.set(cid, r as any);
        }
      }

      return { nextByCase };
    },
  });

  const updateCaseState = async (caseId: string, nextState: KanbanState) => {
    if (!activeTenantId) return;
    if (movingCaseId) return;
    setMovingCaseId(caseId);

    try {
      const { error } = await supabase
        .from("cases")
        .update({ state: nextState })
        .eq("tenant_id", activeTenantId)
        .eq("id", caseId);
      if (error) throw error;
      showSuccess(`Movido para ${titleize(nextState)}.`);
      await qc.invalidateQueries({ queryKey: ["meta_content_cases", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao mover: ${e?.message ?? "erro"}`);
    } finally {
      setMovingCaseId(null);
    }
  };

  const columns = useMemo(() => {
    const rows = casesQ.data ?? [];
    const byState = new Map<KanbanState, CaseRow[]>();
    for (const st of KANBAN_COLUMNS) byState.set(st, []);

    for (const c of rows) {
      const st = clampState(c.state);
      byState.get(st)!.push(c);
    }

    // Sort: most recently updated first
    for (const arr of byState.values()) {
      arr.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }

    return KANBAN_COLUMNS.map((st) => ({ key: st, label: titleize(st), items: byState.get(st) ?? [] }));
  }, [casesQ.data]);

  const createNew = async () => {
    if (!activeTenantId) return;
    if (!themeTitle.trim()) {
      showError("Informe um tema/título.");
      return;
    }

    setCreating(true);
    try {
      const journeyId = metaJourney.journeys.id;

      const { data: created, error: cErr } = await supabase
        .from("cases")
        .insert({
          tenant_id: activeTenantId,
          journey_id: journeyId,
          case_type: "META_CONTENT",
          status: "open",
          state: "CRIAR",
          created_by_channel: "panel",
          title: themeTitle.trim(),
        } as any)
        .select("id")
        .maybeSingle();

      if (cErr) throw cErr;
      if (!created?.id) throw new Error("Falha ao criar case");

      const { error: iErr } = await supabase.from("content_items").insert({
        tenant_id: activeTenantId,
        case_id: created.id,
        client_name: clientName.trim() || null,
        theme_title: themeTitle.trim(),
        recording_date: recordingDate || null,
        tags: [],
      } as any);

      if (iErr) throw iErr;

      showSuccess("Conteúdo criado.");
      setCreateOpen(false);
      setClientName("");
      setThemeTitle("");
      await qc.invalidateQueries({ queryKey: ["meta_content_cases", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["meta_content_items_by_case", activeTenantId] });

      nav(`/app/content/${created.id}`);
    } catch (e: any) {
      showError(`Falha ao criar: ${e?.message ?? "erro"}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
              <Columns3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Produção</h2>
              <p className="mt-0.5 text-sm text-slate-600">Arraste cards entre etapas para atualizar o estado do case.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant="secondary"
            className="h-10 rounded-2xl"
            onClick={() => {
              casesQ.refetch();
              itemsQ.refetch();
              pubsQ.refetch();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]">
                <Plus className="mr-2 h-4 w-4" /> Novo conteúdo
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[24px]">
              <DialogHeader>
                <DialogTitle>Novo conteúdo</DialogTitle>
                <DialogDescription>
                  Cria um <span className="font-semibold">case</span> na jornada meta_content e o registro em <span className="font-mono">content_items</span>.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <div>
                  <Label className="text-xs">Cliente (opcional)</Label>
                  <Input value={clientName} onChange={(e) => setClientName(e.target.value)} className="mt-1 rounded-2xl" placeholder="Ex: Loja Centro" />
                </div>
                <div>
                  <Label className="text-xs">Tema / título</Label>
                  <Input value={themeTitle} onChange={(e) => setThemeTitle(e.target.value)} className="mt-1 rounded-2xl" placeholder="Ex: 3 dicas para..." />
                </div>
                <div>
                  <Label className="text-xs">Data de gravação</Label>
                  <Input type="date" value={recordingDate} onChange={(e) => setRecordingDate(e.target.value)} className="mt-1 rounded-2xl" />
                </div>
              </div>

              <DialogFooter>
                <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                  onClick={createNew}
                  disabled={creating}
                >
                  {creating ? "Criando…" : "Criar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="flex min-w-[980px] gap-4">
          {columns.map((col) => (
            <div
              key={col.key}
              className="w-[320px] flex-shrink-0"
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                const cid = e.dataTransfer.getData("text/caseId");
                if (!cid) return;
                updateCaseState(cid, col.key);
              }}
            >
              <div className="flex items-center justify-between px-1">
                <div className="text-sm font-semibold text-slate-800">{col.label}</div>
                <div className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{col.items.length}</div>
              </div>

              <div className="mt-2 space-y-3 rounded-[24px] border border-dashed border-slate-200 bg-slate-50/60 p-2">
                {col.items.map((c) => {
                  const item = itemsQ.data?.get(c.id) ?? null;
                  const nextPub = pubsQ.data?.nextByCase?.get(c.id) ?? null;
                  const isMoving = movingCaseId === c.id;

                  const title = item?.theme_title?.trim() || c.title || "Conteúdo";
                  const subtitle = item?.client_name?.trim() || "—";

                  return (
                    <Link
                      key={c.id}
                      to={`/app/content/${c.id}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/caseId", c.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className={cn(
                        "block rounded-[22px] border bg-white p-4 shadow-sm transition hover:shadow-md",
                        "border-slate-200 hover:border-slate-300",
                        "cursor-grab active:cursor-grabbing",
                        isMoving ? "opacity-60" : ""
                      )}
                      title="Arraste para mudar de etapa"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
                          <div className="mt-1 truncate text-xs text-slate-500">Cliente: {subtitle}</div>
                        </div>

                        {nextPub?.scheduled_at ? (
                          <Badge className="rounded-full border-0 bg-indigo-100 text-indigo-900 hover:bg-indigo-100">
                            {fmtTime(nextPub.scheduled_at)}
                          </Badge>
                        ) : (
                          <Badge className="rounded-full border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
                            sem agenda
                          </Badge>
                        )}
                      </div>

                      {item?.recording_date ? (
                        <div className="mt-3 text-xs text-slate-600">
                          gravação: <span className="font-medium">{new Date(item.recording_date).toLocaleDateString()}</span>
                        </div>
                      ) : null}

                      {nextPub?.scheduled_at ? (
                        <div className="mt-2 text-[11px] text-slate-500">
                          próximo: {dayKey(nextPub.scheduled_at)} • {titleize(nextPub.channel)} • {titleize(nextPub.publish_status)}
                        </div>
                      ) : null}
                    </Link>
                  );
                })}

                {col.items.length === 0 && (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/40 p-4 text-xs text-slate-500">
                    Solte um card aqui.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {casesQ.isError && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          Erro ao carregar casos: {(casesQ.error as any)?.message ?? ""}
        </div>
      )}
    </div>
  );
}

function CalendarView() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { activeTenantId } = useTenant();

  const [mode, setMode] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [movingPubId, setMovingPubId] = useState<string | null>(null);

  const range = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(cursor);
      const end = addDays(start, 7);
      return { start, end };
    }

    const m = startOfMonth(cursor);
    const gridStart = startOfWeek(m);
    const gridEnd = addDays(gridStart, 42);
    return { start: gridStart, end: gridEnd };
  }, [mode, cursor]);

  const pubsQ = useQuery({
    queryKey: ["meta_content_calendar", activeTenantId, mode, range.start.toISOString().slice(0, 10)],
    enabled: Boolean(activeTenantId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_publications")
        .select(
          "id,tenant_id,case_id,content_item_id,channel,scheduled_at,publish_status,content_items(theme_title,client_name),cases(state)"
        )
        .eq("tenant_id", activeTenantId!)
        .gte("scheduled_at", range.start.toISOString())
        .lt("scheduled_at", range.end.toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(2500);

      if (error) throw error;
      return data ?? [];
    },
  });

  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const r of pubsQ.data ?? []) {
      const d = String((r as any).scheduled_at ?? "");
      if (!d) continue;
      const k = dayKey(d);
      const cur = m.get(k) ?? [];
      cur.push(r);
      m.set(k, cur);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    }
    return m;
  }, [pubsQ.data]);

  const setScheduledAt = async (pubId: string, next: Date) => {
    if (!activeTenantId) return;
    setMovingPubId(pubId);
    try {
      const { error } = await supabase
        .from("content_publications")
        .update({ scheduled_at: next.toISOString() })
        .eq("tenant_id", activeTenantId)
        .eq("id", pubId);
      if (error) throw error;

      showSuccess("Agendamento atualizado.");
      await qc.invalidateQueries({ queryKey: ["meta_content_calendar", activeTenantId] });
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

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Calendário oficial</h2>
              <p className="mt-0.5 text-sm text-slate-600">Arraste para reagendar (atualiza scheduled_at).</p>
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
              {Array.from({ length: 42 }).map((_, idx) => {
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
                      {items.slice(0, 4).map((p: any) => {
                        const ci = p.content_items ?? null;
                        const label = ci?.theme_title || ci?.client_name || p.channel;
                        const dim = movingPubId === p.id;

                        return (
                          <button
                            key={p.id}
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/pubId", p.id);
                              e.dataTransfer.setData("text/pubTime", String(p.scheduled_at ?? ""));
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onClick={() => {
                              const cid = String(p.case_id ?? "");
                              if (cid) nav(`/app/content/${cid}`);
                            }}
                            className={cn(
                              "w-full rounded-2xl border px-2 py-1 text-left text-[11px] font-semibold transition",
                              dim ? "opacity-60" : "",
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
                    {items.map((p: any) => {
                      const ci = p.content_items ?? null;
                      const label = ci?.theme_title || ci?.client_name || p.channel;
                      const dim = movingPubId === p.id;

                      return (
                        <button
                          key={p.id}
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/pubId", p.id);
                            e.dataTransfer.setData("text/pubTime", String(p.scheduled_at ?? ""));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => {
                            const cid = String(p.case_id ?? "");
                            if (cid) nav(`/app/content/${cid}`);
                          }}
                          className={cn(
                            "w-full rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:bg-white",
                            dim ? "opacity-60" : ""
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

export default function ContentHub() {
  const { activeTenantId } = useTenant();

  const metaJourneyQ = useQuery({
    queryKey: ["meta_content_tenant_journey", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("id,config_json,journeys!inner(id,key,name)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true)
        .eq("journeys.key", "meta_content")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any as MetaJourneyRow | null;
    },
  });

  const metaEnabled = Boolean(metaJourneyQ.data?.config_json?.meta_content_enabled);

  return (
    <RequireAuth>
      <AppShell>
        {!activeTenantId ? (
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Selecione um tenant para usar o scheduler.
          </div>
        ) : !metaJourneyQ.data || !metaEnabled ? (
          <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <div className="font-semibold">Jornada Meta Content desabilitada para este tenant.</div>
            <div className="mt-1 text-sm text-amber-900/80">
              Habilite em <span className="font-semibold">Admin → Jornadas</span> e mantenha
              <span className="font-mono"> meta_content_enabled=true</span>.
            </div>
            <div className="mt-3">
              <Link
                to="/app/admin"
                className="inline-flex items-center rounded-2xl bg-amber-900 px-3 py-2 text-xs font-semibold text-white"
              >
                Abrir Admin
              </Link>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="kanban">
            <TabsList className="rounded-2xl bg-white/70 p-1">
              <TabsTrigger value="kanban" className="rounded-xl">
                Kanban
              </TabsTrigger>
              <TabsTrigger value="calendar" className="rounded-xl">
                Calendário
              </TabsTrigger>
            </TabsList>

            <TabsContent value="kanban" className="mt-4">
              <Kanban metaJourney={metaJourneyQ.data} />
            </TabsContent>

            <TabsContent value="calendar" className="mt-4">
              <CalendarView />
            </TabsContent>
          </Tabs>
        )}
      </AppShell>
    </RequireAuth>
  );
}
