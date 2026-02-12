import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

function parseDateInput(v: string): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s + "T12:00:00.000Z");
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function NewTrelloCardDialog(props: { tenantId: string; journeyId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [creating, setCreating] = useState(false);

  const dueAtIso = useMemo(() => parseDateInput(dueDate), [dueDate]);

  const create = async () => {
    const t = title.trim();
    if (!t) return;

    setCreating(true);
    try {
      const { data: ins, error } = await supabase
        .from("cases")
        .insert({
          tenant_id: props.tenantId,
          journey_id: props.journeyId,
          case_type: "TRELLO",
          created_by_channel: "panel",
          title: t,
          summary_text: description.trim() || null,
          // IMPORTANT: o banco tem check constraint (cases_status_check). Em toda a base, o status inicial padrão é "open".
          status: "open",
          state: "BACKLOG",
          meta_json: {
            due_at: dueAtIso,
          },
        })
        .select("id")
        .single();

      if (error) throw error;

      const caseId = String((ins as any)?.id ?? "");
      if (!caseId) throw new Error("Falha ao criar case (id vazio)");

      await supabase.from("timeline_events").insert({
        tenant_id: props.tenantId,
        case_id: caseId,
        event_type: "card_created",
        actor_type: "admin",
        actor_id: null,
        message: `Card criado: ${t}`,
        meta_json: { kind: "trello" },
        occurred_at: new Date().toISOString(),
      });

      showSuccess("Card criado.");
      setOpen(false);
      setTitle("");
      setDescription("");
      setDueDate("");
    } catch (e: any) {
      showError(`Falha ao criar card: ${e?.message ?? "erro"}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          className={cn(
            "h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white shadow-sm hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
          )}
          title="Criar novo card"
        >
          <Plus className="mr-2 h-4 w-4" /> Novo card
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[95vw] max-w-[720px] rounded-[24px] border-slate-200 bg-white p-0 shadow-xl">
        <div className="p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900">Novo card</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Crie um card na jornada Trello (Byfrost).
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-3">
            <div>
              <Label className="text-xs">Título</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 h-11 rounded-2xl"
                placeholder="Ex: Ajustar criativos do cliente"
              />
            </div>

            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 min-h-[120px] rounded-2xl"
                placeholder="Contexto / links / critérios de aceite…"
              />
            </div>

            <div>
              <Label className="text-xs">Prazo (opcional)</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 h-11 rounded-2xl" />
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button type="button" variant="secondary" className="h-11 rounded-2xl" onClick={() => setOpen(false)} disabled={creating}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={create}
                disabled={creating || !title.trim()}
                className={cn(
                  "h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-5 text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                )}
              >
                {creating ? "Criando…" : "Criar"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
