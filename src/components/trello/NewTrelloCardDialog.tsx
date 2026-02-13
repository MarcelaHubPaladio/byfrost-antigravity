import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Plus, UserRound } from "lucide-react";
import { normalizeRichTextHtmlOrNull, RichTextEditor } from "@/components/RichTextEditor";

type VendorRow = { id: string; phone_e164: string; display_name: string | null };

function labelForVendor(v: VendorRow) {
  const name = (v.display_name ?? "").trim();
  if (name) return `${name} • ${v.phone_e164}`;
  return v.phone_e164;
}

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
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [responsibleId, setResponsibleId] = useState<string>("__unassigned__");
  const [creating, setCreating] = useState(false);

  const vendorsQ = useQuery({
    queryKey: ["trello_vendors", props.tenantId],
    enabled: Boolean(open && props.tenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id,phone_e164,display_name")
        .eq("tenant_id", props.tenantId)
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw error;
      const list = (data ?? []) as VendorRow[];
      list.sort((a, b) => labelForVendor(a).localeCompare(labelForVendor(b)));
      return list;
    },
  });

  const dueAtIso = useMemo(() => parseDateInput(dueDate), [dueDate]);

  const create = async () => {
    const t = title.trim();
    if (!t) return;

    setCreating(true);
    try {
      const assigned_vendor_id = responsibleId === "__unassigned__" ? null : responsibleId;

      // Alguns ambientes têm um check constraint diferente em cases.status (ex.: 'OPEN' vs 'open').
      // Para garantir compatibilidade, tentamos algumas variações e, se possível, deixamos o default do banco.
      const basePayload: any = {
        tenant_id: props.tenantId,
        journey_id: props.journeyId,
        case_type: "TRELLO",
        created_by_channel: "panel",
        title: t,
        summary_text: normalizeRichTextHtmlOrNull(descriptionHtml),
        state: "BACKLOG",
        ...(assigned_vendor_id ? { assigned_vendor_id } : {}),
        meta_json: {
          due_at: dueAtIso,
        },
      };

      const tryPayloads: any[] = [
        // 1) Sem status (usa default do banco)
        basePayload,
        // 2) Lowercase
        { ...basePayload, status: "open" },
        // 3) Uppercase (alguns bancos usam enum/constraint em CAPS)
        { ...basePayload, status: "OPEN" },
      ];

      let ins: any = null;
      let lastErr: any = null;

      for (const payload of tryPayloads) {
        const res = await supabase.from("cases").insert(payload).select("id").single();
        if (!res.error) {
          ins = res.data;
          lastErr = null;
          break;
        }
        lastErr = res.error;

        // Se não for problema de status, não faz sentido tentar outras variações.
        const msg = String(res.error.message ?? "");
        const details = String((res.error as any).details ?? "");
        const hint = String((res.error as any).hint ?? "");
        const combined = `${msg} ${details} ${hint}`.toLowerCase();
        if (!combined.includes("cases_status_check") && !combined.includes("status")) break;
      }

      if (lastErr) throw lastErr;

      const caseId = String((ins as any)?.id ?? "");
      if (!caseId) throw new Error("Falha ao criar case (id vazio)");

      await supabase.from("timeline_events").insert({
        tenant_id: props.tenantId,
        case_id: caseId,
        event_type: "card_created",
        actor_type: "admin",
        actor_id: null,
        message: `Card criado: ${t}`,
        meta_json: { kind: "trello", assigned_vendor_id },
        occurred_at: new Date().toISOString(),
      });

      showSuccess("Card criado.");
      setOpen(false);
      setTitle("");
      setDescriptionHtml("");
      setDueDate("");
      setResponsibleId("__unassigned__");
    } catch (e: any) {
      const parts = [
        e?.message ? String(e.message) : null,
        e?.details ? `details: ${String(e.details)}` : null,
        e?.hint ? `hint: ${String(e.hint)}` : null,
        e?.code ? `code: ${String(e.code)}` : null,
      ].filter(Boolean);

      // Ajuda a debugar diferenças de constraint entre ambientes.
      console.error("[trello] Falha ao criar card", e);

      showError(`Falha ao criar card: ${parts.join(" | ") || "erro"}`);
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
              <div className="mt-1">
                <RichTextEditor
                  value={descriptionHtml}
                  onChange={setDescriptionHtml}
                  placeholder="Contexto / links / critérios de aceite…"
                  minHeightClassName="min-h-[140px]"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Prazo (opcional)</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 h-11 rounded-2xl"
              />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-slate-500" />
                <Label className="text-xs">Responsável (opcional)</Label>
              </div>
              <Select value={responsibleId} onValueChange={setResponsibleId} disabled={vendorsQ.isLoading}>
                <SelectTrigger className="mt-1 h-11 rounded-2xl bg-white">
                  <SelectValue placeholder="Selecionar…" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="__unassigned__" className="rounded-xl">
                    (sem responsável)
                  </SelectItem>
                  {(vendorsQ.data ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id} className="rounded-xl">
                      {labelForVendor(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {vendorsQ.isError ? (
                <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-900">
                  Erro ao carregar responsáveis: {(vendorsQ.error as any)?.message ?? ""}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="h-11 rounded-2xl"
                onClick={() => setOpen(false)}
                disabled={creating}
              >
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