import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PresencePunchType } from "@/lib/presence";

function toTimeValue(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function combineDateAndTime(caseDate: string, hhmm: string) {
  // NOTE: this uses the browser local timezone. In practice, tenants should keep a single TZ.
  const dt = new Date(`${caseDate}T${hhmm}:00`);
  return dt.toISOString();
}

export type PunchAdjustMode =
  | {
      mode: "edit";
      punchId: string;
      type: PresencePunchType;
      timestampIso: string;
    }
  | {
      mode: "add";
      type: PresencePunchType;
    };

export function PunchAdjustDialog({
  open,
  onOpenChange,
  mode,
  caseDate,
  hasLedgerForCase,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: PunchAdjustMode | null;
  caseDate: string;
  hasLedgerForCase: boolean;
  onSubmit: (payload: { mode: PunchAdjustMode; timestampIso: string; note: string }) => Promise<void>;
}) {
  const [time, setTime] = useState("08:00");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !mode) return;
    if (mode.mode === "edit") setTime(toTimeValue(mode.timestampIso));
    else setTime("08:00");
    setNote("");
  }, [open, mode]);

  const title = mode?.mode === "edit" ? "Ajustar batida" : "Adicionar batida";

  const canSave = useMemo(() => {
    return Boolean(mode) && time.length >= 4 && note.trim().length >= 5;
  }, [mode, note, time]);

  const submit = async () => {
    if (!mode) return;
    const trimmed = note.trim();
    if (trimmed.length < 5) return;

    setSaving(true);
    try {
      await onSubmit({ mode, timestampIso: combineDateAndTime(caseDate, time), note: trimmed });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-[28px] border-slate-200 bg-white p-0 shadow-xl">
        <div className="p-5">
          <DialogHeader>
            <DialogTitle className="text-lg tracking-tight text-slate-900">{title}</DialogTitle>
          </DialogHeader>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {mode && (
              <Badge className="rounded-full border-0 bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                {mode.type}
              </Badge>
            )}
            {hasLedgerForCase && (
              <Badge className="rounded-full border-0 bg-amber-100 text-amber-900">dia já lançado</Badge>
            )}
          </div>

          {hasLedgerForCase && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
              Esse dia já tem lançamento no banco de horas. Ao salvar, será gerado um lançamento <span className="font-semibold">MANUAL</span> de correção.
            </div>
          )}

          <div className="mt-4 grid gap-3">
            <div className="grid gap-1">
              <div className="text-[11px] font-semibold text-slate-700">Horário</div>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-11 rounded-2xl"
              />
              <div className="text-[11px] text-slate-500">Data do case: {caseDate}</div>
            </div>

            <div className="grid gap-1">
              <div className="text-[11px] font-semibold text-slate-700">
                Nota (obrigatória)
                <span className={cn("ml-2 text-[11px]", note.trim().length >= 5 ? "text-emerald-700" : "text-rose-700")}>
                  {note.trim().length >= 5 ? "ok" : "mín. 5 caracteres"}
                </span>
              </div>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Explique o motivo do ajuste (ex.: colaborador esqueceu de bater a entrada)."
                className="min-h-[90px] rounded-2xl"
              />
            </div>

            <Button
              onClick={submit}
              disabled={!canSave || saving}
              className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
            >
              {saving ? "Salvando…" : "Salvar ajuste"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
