import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { showError, showSuccess } from "@/utils/toast";
import { CalendarDays, Plus, RefreshCw } from "lucide-react";

const PIPELINE = ["CRIAR", "PRODUCAO", "APROVACAO", "AGENDADO", "PUBLICADO", "ANALISADO", "ENCERRADO"] as const;

type CaseRow = {
  id: string;
  title: string | null;
  state: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type ContentItemLite = {
  id: string;
  case_id: string;
  client_name: string | null;
  theme_title: string | null;
  recording_date: string | null;
  tags: string[] | null;
};

function titleizeState(s: string) {
  return String(s ?? "")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function minutesAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(diff / 60000));
}

export function ContentKanban() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { activeTenantId } = useTenant();

  const [movingCaseId, setMovingCaseId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newThemeTitle, setNewThemeTitle] = useState("");
  const [newRecordingDate, setNewRecordingDate] = useState("");

  const metaJourneyQ = useQuery({
    queryKey: ["meta_content_journey"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journeys")
        .select("id,key")
        .eq("key", "meta_content")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) throw new Error("Jornada meta_content não encontrada");
      return data as { id: string; key: string };
    },
  });

  const journeyId = metaJourneyQ.data?.id ?? "";

  const casesQ = useQuery({
    queryKey: ["content_cases", activeTenantId, journeyId],
    enabled: Boolean(activeTenantId && journeyId),
    refetchInterval: 6000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,title,state,status,created_at,updated_at")
        .eq("tenant_id", activeTenantId!)
        .eq("journey_id", journeyId)
        .is("deleted_at", null)
        .eq("is_chat", false)
        .order("updated_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      return (data ?? []) as CaseRow[];
    },
  });

  const caseIds = useMemo(() => (casesQ.data ?? []).map((c) => c.id), [casesQ.data]);

  const itemsQ = useQuery({
    queryKey: ["content_items_lite", activeTenantId, caseIds.join(",")],
    enabled: Boolean(activeTenantId && caseIds.length),
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_items")
        .select("id,case_id,client_name,theme_title,recording_date,tags")
        .eq("tenant_id", activeTenantId!)
        .in("case_id", caseIds)
        .limit(800);
      if (error) throw error;
      return (data ?? []) as any as ContentItemLite[];
    },
  });

  const itemByCase = useMemo(() => {
    const m = new Map<string, ContentItemLite>();
    for (const it of itemsQ.data ?? []) m.set(it.case_id, it);
    return m;
  }, [itemsQ.data]);

  const columns = useMemo(() => {
    const rows = casesQ.data ?? [];
    const known = new Set<string>(PIPELINE as any);
    const extras = Array.from(new Set(rows.map((r) => r.state))).filter((s) => !known.has(s));

    const colKeys = [...PIPELINE, ...(extras.length ? ["__other__"] : [])];

    return colKeys.map((k) => {
      const items =
        k === "__other__" ? rows.filter((r) => !known.has(r.state)) : rows.filter((r) => r.state === k);
      return {
        key: k,
        label: k === "__other__" ? "Outros" : titleizeState(k),
        items,
      };
    });
  }, [casesQ.data]);

  const updateCaseState = async (caseId: string, nextState: string) => {
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

      showSuccess(`Movido para ${titleizeState(nextState)}.`);
      await qc.invalidateQueries({ queryKey: ["content_cases", activeTenantId, journeyId] });
    } catch (e: any) {
      showError(`Falha ao mover: ${e?.message ?? "erro"}`);
    } finally {
      setMovingCaseId(null);
    }
  };

  const createCaseAndItem = async () => {
    if (!activeTenantId || !journeyId) return;
    if (!newThemeTitle.trim()) {
      showError("Informe um tema/título.");
      return;
    }

    setCreating(true);
    try {
      const title = newThemeTitle.trim();

      const { data: insCase, error: cErr } = await supabase
        .from("cases")
        .insert({
          tenant_id: activeTenantId,
          journey_id: journeyId,
          case_type: "CONTENT",
          status: "open",
          state: "CRIAR",
          created_by_channel: "panel",
          title,
          meta_json: { journey_key: "meta_content" },
        } as any)
        .select("id")
        .single();
      if (cErr) throw cErr;

      const newCaseId = String((insCase as any).id);

      const { error: iErr } = await supabase.from("content_items").insert({
        tenant_id: activeTenantId,
        case_id: newCaseId,
        client_name: newClientName.trim() || null,
        theme_title: title,
        recording_date: newRecordingDate || null,
      } as any);
      if (iErr) throw iErr;

      showSuccess("Conteúdo criado.");
      setDialogOpen(false);
      setNewClientName("");
      setNewThemeTitle("");
      setNewRecordingDate("");

      await qc.invalidateQueries({ queryKey: ["content_cases", activeTenantId, journeyId] });
      await qc.invalidateQueries({ queryKey: ["content_items_lite", activeTenantId] });

      nav(`/app/content/${encodeURIComponent(newCaseId)}`);
    } catch (e: any) {
      showError(`Falha ao criar: ${e?.message ?? "erro"}`);
    } finally {
      setCreating(false);
    }
  };

  if (!activeTenantId) {
    return (
      <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Selecione um tenant.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="rounded-full border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
            {casesQ.data?.length ?? 0} itens
          </Badge>
          {casesQ.isFetching ? (
            <Badge className="rounded-full border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
              atualizando…
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => casesQ.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]">
                <Plus className="mr-2 h-4 w-4" /> Novo conteúdo
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[22px]">
              <DialogHeader>
                <DialogTitle>Novo conteúdo</DialogTitle>
                <DialogDescription>Cria um case na jornada meta_content e um content_item vinculado.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <div>
                  <Label className="text-xs">Tema/Título</Label>
                  <Input
                    value={newThemeTitle}
                    onChange={(e) => setNewThemeTitle(e.target.value)}
                    className="mt-1 rounded-2xl"
                    placeholder="Ex: Dica rápida de skincare"
                  />
                </div>
                <div>
                  <Label className="text-xs">Cliente (nome)</Label>
                  <Input
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="mt-1 rounded-2xl"
                    placeholder="Ex: Clínica XPTO"
                  />
                </div>
                <div>
                  <Label className="text-xs">Data de gravação (opcional)</Label>
                  <Input
                    type="date"
                    value={newRecordingDate}
                    onChange={(e) => setNewRecordingDate(e.target.value)}
                    className="mt-1 rounded-2xl"
                  />
                </div>

                <Button
                  onClick={createCaseAndItem}
                  disabled={creating || !newThemeTitle.trim()}
                  className="mt-1 h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                >
                  {creating ? "Criando…" : "Criar"}
                </Button>
              </div>
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
                if (col.key === "__other__") return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                if (col.key === "__other__") return;
                const cid = e.dataTransfer.getData("text/caseId");
                if (!cid) return;
                updateCaseState(cid, String(col.key));
              }}
            >
              <div className="flex items-center justify-between px-1">
                <div className="text-sm font-semibold text-slate-800">{col.label}</div>
                <div className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {col.items.length}
                </div>
              </div>

              <div className="mt-2 space-y-3 rounded-[24px] border border-dashed border-slate-200 bg-slate-50/60 p-2">
                {col.items.map((c) => {
                  const it = itemByCase.get(c.id) ?? null;
                  const title = it?.theme_title || c.title || "Conteúdo";
                  const subtitle = it?.client_name || "(sem cliente)";
                  const age = minutesAgo(c.updated_at);

                  return (
                    <Link
                      key={c.id}
                      to={`/app/content/${encodeURIComponent(c.id)}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/caseId", c.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className={cn(
                        "block rounded-[22px] border bg-white p-4 shadow-sm transition hover:shadow-md",
                        "border-slate-200 hover:border-slate-300 cursor-grab active:cursor-grabbing",
                        movingCaseId === c.id ? "opacity-60" : ""
                      )}
                      title="Arraste para mudar de etapa"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
                          <div className="mt-1 truncate text-xs text-slate-500">{subtitle}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600">
                          {age}m
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {it?.recording_date ? (
                          <Badge className="rounded-full border-0 bg-indigo-100 text-indigo-900 hover:bg-indigo-100">
                            <CalendarDays className="mr-1 h-3.5 w-3.5" /> {it.recording_date}
                          </Badge>
                        ) : null}
                        {(it?.tags ?? []).slice(0, 2).map((t) => (
                          <Badge key={t} className="rounded-full border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
                            {t}
                          </Badge>
                        ))}
                      </div>
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
          Erro ao carregar: {(casesQ.error as any)?.message ?? ""}
        </div>
      )}
    </div>
  );
}
