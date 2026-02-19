import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

export type OfferingOption = {
  id: string;
  display_name: string;
  subtype: string | null;
};

export type DeliverableTemplateRow = {
  id: string;
  tenant_id: string;
  offering_entity_id: string;
  name: string;
  estimated_minutes: number | null;
  required_resource_type: string | null;
  created_at: string;
  deleted_at: string | null;
};

export function DeliverableTemplateUpsertDialog({
  open,
  onOpenChange,
  tenantId,
  offerings,
  initial,
  defaultOfferingId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  offerings: OfferingOption[];
  initial?: DeliverableTemplateRow | null;
  defaultOfferingId?: string | null;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = Boolean(initial?.id);

  const [saving, setSaving] = useState(false);

  const [offeringId, setOfferingId] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [estimatedMinutes, setEstimatedMinutes] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [resourceType, setResourceType] = useState<string>("");

  useEffect(() => {
    if (!open) return;

    setOfferingId(String(initial?.offering_entity_id ?? defaultOfferingId ?? ""));
    setName(String(initial?.name ?? ""));

    const mins = initial?.estimated_minutes;
    setEstimatedMinutes(mins === null || mins === undefined ? "" : String(mins));

    setQuantity(String((initial as any)?.quantity ?? "1"));

    setResourceType(String(initial?.required_resource_type ?? ""));
  }, [open, initial?.id, defaultOfferingId]);

  const title = isEdit ? "Editar template" : "Novo template";
  const canSave =
    Boolean(tenantId) &&
    Boolean(offeringId) &&
    name.trim().length >= 2 &&
    !saving;

  const minutesNumber = useMemo(() => {
    const v = estimatedMinutes.trim();
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return NaN;
    return Math.round(n);
  }, [estimatedMinutes]);

  const minutesOk = minutesNumber === null || Number.isFinite(minutesNumber);

  const save = async () => {
    if (!canSave) return;
    if (!minutesOk) {
      showError("Estimated minutes inválido");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        offering_entity_id: offeringId,
        name: name.trim(),
        estimated_minutes: minutesNumber,
        quantity: Math.max(1, Math.round(Number(quantity) || 1)),
        required_resource_type: resourceType.trim() ? resourceType.trim() : null,
      };

      if (isEdit) {
        const { error } = await supabase
          .from("deliverable_templates")
          .update(payload)
          .eq("tenant_id", tenantId)
          .eq("id", initial!.id)
          .is("deleted_at", null);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("deliverable_templates").insert(payload);
        if (error) throw error;
      }

      showSuccess(isEdit ? "Template atualizado." : "Template criado.");
      await qc.invalidateQueries({ queryKey: ["deliverable_templates"] });
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      // Common: unique constraint by (tenant_id, offering_entity_id, name) where deleted_at is null.
      showError(e?.message ?? "Erro ao salvar template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Templates ficam no catálogo do offering e são usados para gerar deliverables quando um compromisso é criado/ativado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Offering</Label>
            <Select value={offeringId} onValueChange={setOfferingId}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Selecione um offering…" />
              </SelectTrigger>
              <SelectContent>
                {offerings.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.display_name}
                    {o.subtype ? ` (${o.subtype})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Nome do template</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Instalação, Treinamento, Setup…"
              className="rounded-xl"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Estimated minutes</Label>
              <Input
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                inputMode="numeric"
                placeholder="Ex.: 60"
                className="rounded-xl"
              />
              {!minutesOk ? <div className="text-xs text-red-600">Use um número válido ≥ 0.</div> : null}
            </div>

            <div className="grid gap-2">
              <Label>Quantidade base</Label>
              <Input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                type="number"
                min={1}
                placeholder="Ex.: 1"
                className="rounded-xl"
              />
              <div className="text-xs text-slate-500">Número de repetições por venda.</div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Tipo de recurso</Label>
            <Input
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
              placeholder="Ex.: tecnico, designer, analista…"
              className="rounded-xl"
            />
            <div className="text-xs text-slate-500">Opcional. Ajuda a somar capacidade por tipo.</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button className="rounded-xl" onClick={save} disabled={!canSave || !minutesOk}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
