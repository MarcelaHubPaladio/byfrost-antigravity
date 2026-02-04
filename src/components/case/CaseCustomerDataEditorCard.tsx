import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { IdCard, Save } from "lucide-react";

type FieldRow = {
  key: string;
  value_text: string | null;
  source?: string | null;
  confidence?: number | null;
};

function getField(fields: FieldRow[] | undefined, key: string) {
  const row = (fields ?? []).find((f) => f.key === key);
  return row?.value_text ?? "";
}

function cleanOrNull(s: string) {
  const v = (s ?? "").trim();
  return v ? v : null;
}

export function CaseCustomerDataEditorCard(props: {
  caseId: string;
  fields: FieldRow[] | undefined;
  className?: string;
}) {
  const { caseId, fields, className } = props;
  const qc = useQueryClient();

  const initial = useMemo(
    () => ({
      name: getField(fields, "name"),
      phone: getField(fields, "phone"),
      email: getField(fields, "email"),
      cpf: getField(fields, "cpf"),
      cnpj: getField(fields, "cnpj"),
      rg: getField(fields, "rg"),
      birth_date_text: getField(fields, "birth_date_text"),
      address: getField(fields, "address"),
      city: getField(fields, "city"),
      cep: getField(fields, "cep"),
      state: getField(fields, "state"),
      uf: getField(fields, "uf"),
    }),
    [fields]
  );

  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const save = async () => {
    if (!caseId) return;

    // Minimal guard: at least a name or a phone should exist.
    if (!cleanOrNull(draft.name) && !cleanOrNull(draft.phone)) {
      showError("Preencha ao menos Nome ou Telefone.");
      return;
    }

    setSaving(true);
    try {
      const rows = [
        { key: "name", value_text: cleanOrNull(draft.name) },
        { key: "phone", value_text: cleanOrNull(draft.phone) },
        { key: "email", value_text: cleanOrNull(draft.email) },
        { key: "cpf", value_text: cleanOrNull(draft.cpf) },
        { key: "cnpj", value_text: cleanOrNull(draft.cnpj) },
        { key: "rg", value_text: cleanOrNull(draft.rg) },
        { key: "birth_date_text", value_text: cleanOrNull(draft.birth_date_text) },
        { key: "address", value_text: cleanOrNull(draft.address) },
        { key: "city", value_text: cleanOrNull(draft.city) },
        { key: "cep", value_text: cleanOrNull(draft.cep) },
        { key: "state", value_text: cleanOrNull(draft.state) },
        { key: "uf", value_text: cleanOrNull(draft.uf) },
      ]
        .map((r) => ({
          case_id: caseId,
          key: r.key,
          value_text: r.value_text,
          confidence: 1,
          source: "admin",
          last_updated_by: "panel",
        }))
        // Don’t write totally empty fields (keeps DB cleaner)
        .filter((r) => r.value_text !== null);

      // If user cleared everything for a field, we still want to persist "null".
      // Do it explicitly for keys that exist already.
      const existingKeys = new Set((fields ?? []).map((f) => f.key));
      const cleared = ["email", "cpf", "cnpj", "rg", "birth_date_text", "address", "city", "cep", "state", "uf"]
        .filter((k) => existingKeys.has(k) && cleanOrNull((draft as any)[k]) === null)
        .map((k) => ({
          case_id: caseId,
          key: k,
          value_text: null,
          confidence: 1,
          source: "admin",
          last_updated_by: "panel",
        }));

      const payload = [...rows, ...cleared];
      if (!payload.length) {
        showError("Nada para salvar.");
        return;
      }

      const { error } = await supabase.from("case_fields").upsert(payload as any, {
        onConflict: "case_id,key",
      });
      if (error) throw error;

      showSuccess("Dados do cliente salvos.");
      await qc.invalidateQueries({ queryKey: ["case_fields"] });
    } catch (e: any) {
      showError(`Falha ao salvar: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("rounded-[22px] border border-slate-200 bg-white p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <IdCard className="h-4 w-4 text-slate-500" /> Dados do cliente
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Campos editáveis (não inclui fornecedor). Ao salvar, gravamos em <span className="font-mono">case_fields</span>.
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="Nome do cliente"
            />
          </div>
          <div>
            <Label className="text-xs">Telefone</Label>
            <Input
              value={draft.phone}
              onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="(DD) 9xxxx-xxxx"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              value={draft.email}
              onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="cliente@empresa.com"
            />
          </div>
          <div>
            <Label className="text-xs">Data de nascimento</Label>
            <Input
              value={draft.birth_date_text}
              onChange={(e) => setDraft((p) => ({ ...p, birth_date_text: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="dd/mm/aaaa"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">CPF</Label>
            <Input
              value={draft.cpf}
              onChange={(e) => setDraft((p) => ({ ...p, cpf: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="somente números"
            />
          </div>
          <div>
            <Label className="text-xs">CNPJ (se PJ)</Label>
            <Input
              value={draft.cnpj}
              onChange={(e) => setDraft((p) => ({ ...p, cnpj: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="somente números"
            />
          </div>
          <div>
            <Label className="text-xs">RG</Label>
            <Input
              value={draft.rg}
              onChange={(e) => setDraft((p) => ({ ...p, rg: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="somente números"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Endereço</Label>
          <Input
            value={draft.address}
            onChange={(e) => setDraft((p) => ({ ...p, address: e.target.value }))}
            className="mt-1 h-10 rounded-2xl"
            placeholder="Rua, número, complemento"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label className="text-xs">Cidade</Label>
            <Input
              value={draft.city}
              onChange={(e) => setDraft((p) => ({ ...p, city: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="Cidade"
            />
          </div>
          <div>
            <Label className="text-xs">UF</Label>
            <Input
              value={draft.uf}
              onChange={(e) => setDraft((p) => ({ ...p, uf: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="PR"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">CEP</Label>
            <Input
              value={draft.cep}
              onChange={(e) => setDraft((p) => ({ ...p, cep: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="00000-000"
            />
          </div>
          <div>
            <Label className="text-xs">Estado (texto)</Label>
            <Input
              value={draft.state}
              onChange={(e) => setDraft((p) => ({ ...p, state: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="PR"
            />
          </div>
        </div>

        <Button
          onClick={save}
          disabled={saving}
          className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white shadow-sm hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
        >
          {saving ? "Salvando…" : "Salvar dados do cliente"}
          <Save className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
