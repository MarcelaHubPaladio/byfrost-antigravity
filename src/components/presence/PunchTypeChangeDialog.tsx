import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { titleizePunchType, type PresencePunchType } from "@/lib/presence";

export function PunchTypeChangeDialog({
  open,
  onOpenChange,
  currentType,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentType: PresencePunchType | null;
  onSubmit: (payload: { newType: PresencePunchType; note: string }) => Promise<void>;
}) {
  const [newType, setNewType] = useState<PresencePunchType>("EXIT");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNewType(currentType ?? "EXIT");
    setNote("");
  }, [open, currentType]);

  const canSave = useMemo(() => note.trim().length >= 5, [note]);

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSubmit({ newType, note: note.trim() });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] rounded-[28px] border-slate-200 bg-white p-0 shadow-xl">
        <div className="p-5">
          <DialogHeader>
            <DialogTitle className="text-lg tracking-tight text-slate-900">Reclassificar tipo da batida</DialogTitle>
          </DialogHeader>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {currentType && (
              <Badge className="rounded-full border-0 bg-slate-100 text-slate-800">
                atual: <span className="ml-1 font-semibold">{titleizePunchType(currentType)}</span>
              </Badge>
            )}
            <Badge className="rounded-full border-0 bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
              auditoria ligada
            </Badge>
          </div>

          <div className="mt-4 grid gap-3">
            <div>
              <div className="text-[11px] font-semibold text-slate-700">Novo tipo</div>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as PresencePunchType)}
                className={cn(
                  "mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--byfrost-accent)/0.25)]"
                )}
              >
                {(["ENTRY", "BREAK_START", "BREAK_END", "BREAK2_START", "BREAK2_END", "EXIT"] as PresencePunchType[]).map((t) => (
                  <option key={t} value={t}>
                    {titleizePunchType(t)}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">
                Dica: para “sair e voltar” durante a jornada, normalmente use <span className="font-semibold">intervalo extra</span>.
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-slate-700">
                Nota (obrigatória)
                <span className={cn("ml-2", canSave ? "text-emerald-700" : "text-rose-700")}>{canSave ? "ok" : "mín. 5 caracteres"}</span>
              </div>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 min-h-[96px] rounded-2xl"
                placeholder="Explique o motivo (ex.: batida classificada errado como saída)."
              />
            </div>

            <Button
              onClick={submit}
              disabled={!canSave || saving}
              className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
            >
              {saving ? "Salvando…" : "Salvar reclassificação"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
