import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Banknote, IdCard, Save } from "lucide-react";

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
      // Cliente
      name: getField(fields, "name"),
      customer_code: getField(fields, "customer_code"),
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

      // Financeiro
      payment_conditions: getField(fields, "payment_conditions"),
      payment_value_1: getField(fields, "payment_value_1"),
      payment_value_2: getField(fields, "payment_value_2"),
      deal_signal_date_text: getField(fields, "deal_signal_date_text"),
      financial_origin: getField(fields, "financial_origin"),
      financial_local: getField(fields, "financial_local"),
      due_date_text: getField(fields, "due_date_text"),
      proposal_valid_until_text: getField(fields, "proposal_valid_until_text"),
      expected_delivery_date_text: getField(fields, "expected_delivery_date_text"),
      notes: getField(fields, "notes"),
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
        // Cliente
        { key: "name", value_text: cleanOrNull(draft.name) },
        { key: "customer_code", value_text: cleanOrNull(draft.customer_code) },
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

        // Financeiro
        { key: "payment_conditions", value_text: cleanOrNull(draft.payment_conditions) },
        { key: "payment_value_1", value_text: cleanOrNull(draft.payment_value_1) },
        { key: "payment_value_2", value_text: cleanOrNull(draft.payment_value_2) },
        { key: "deal_signal_date_text", value_text: cleanOrNull(draft.deal_signal_date_text) },
        { key: "financial_origin", value_text: cleanOrNull(draft.financial_origin) },
        { key: "financial_local", value_text: cleanOrNull(draft.financial_local) },
        { key: "due_date_text", value_text: cleanOrNull(draft.due_date_text) },
        { key: "proposal_valid_until_text", value_text: cleanOrNull(draft.proposal_valid_until_text) },
        { key: "expected_delivery_date_text", value_text: cleanOrNull(draft.expected_delivery_date_text) },
        { key: "notes", value_text: cleanOrNull(draft.notes) },
      ]
        .map((r) => ({
          case_id: caseId,
          key: r.key,
          value_text: r.value_text,
          confidence: 1,
          source: "admin",
          last_updated_by: "panel",
        }))
        // Don't write totally empty fields (keeps DB cleaner)
        .filter((r) => r.value_text !== null);

      // If user cleared everything for a field, we still want to persist "null".
      // Do it explicitly for keys that exist already.
      const existingKeys = new Set((fields ?? []).map((f) => f.key));
      const clearable = [
        // cliente
        "customer_code",
        "email",
        "cpf",
        "cnpj",
        "rg",
        "birth_date_text",
        "address",
        "city",
        "cep",
        "state",
        "uf",
        // financeiro
        "payment_conditions",
        "payment_value_1",
        "payment_value_2",
        "deal_signal_date_text",
        "financial_origin",
        "financial_local",
        "due_date_text",
        "proposal_valid_until_text",
        "expected_delivery_date_text",
        "notes",
      ];

      const cleared = clearable
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

      showSuccess("Dados salvos.");
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
            Campos editáveis. Ao salvar, gravamos em <span className="font-mono">case_fields</span>.
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
            <Label className="text-xs">Código do cliente</Label>
            <Input
              value={draft.customer_code}
              onChange={(e) => setDraft((p) => ({ ...p, customer_code: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="Ex: 12345"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Telefone</Label>
            <Input
              value={draft.phone}
              onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="(DD) 9xxxx-xxxx"
            />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              value={draft.email}
              onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="cliente@empresa.com"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Data de nascimento</Label>
            <Input
              value={draft.birth_date_text}
              onChange={(e) => setDraft((p) => ({ ...p, birth_date_text: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="dd/mm/aaaa"
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

        <div className="grid gap-3 sm:grid-cols-2">
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
              placeholder="Paraná"
            />
          </div>
        </div>

        <Separator className="my-1" />

        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Banknote className="h-4 w-4 text-slate-500" /> Financeiro
        </div>
        <div className="text-xs text-slate-600">
          Preencha manualmente quando a extração não conseguir ler as condições de pagamento.
        </div>

        <div>
          <Label className="text-xs">Condições de pagamento</Label>
          <Input
            value={draft.payment_conditions}
            onChange={(e) => setDraft((p) => ({ ...p, payment_conditions: e.target.value }))}
            className="mt-1 h-10 rounded-2xl"
            placeholder="Ex: À vista / 30 dias / 2x..."
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Valor (R$) 1</Label>
            <Input
              value={draft.payment_value_1}
              onChange={(e) => setDraft((p) => ({ ...p, payment_value_1: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="0,00"
            />
          </div>
          <div>
            <Label className="text-xs">Valor (R$) 2</Label>
            <Input
              value={draft.payment_value_2}
              onChange={(e) => setDraft((p) => ({ ...p, payment_value_2: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="0,00"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Sinal de negócio em</Label>
            <Input
              value={draft.deal_signal_date_text}
              onChange={(e) => setDraft((p) => ({ ...p, deal_signal_date_text: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="dd/mm/aaaa"
            />
          </div>
          <div>
            <Label className="text-xs">Com vencimento em</Label>
            <Input
              value={draft.due_date_text}
              onChange={(e) => setDraft((p) => ({ ...p, due_date_text: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="dd/mm/aaaa"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Origem financeira</Label>
            <Input
              value={draft.financial_origin}
              onChange={(e) => setDraft((p) => ({ ...p, financial_origin: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="Ex: cooperativa / banco / próprio"
            />
          </div>
          <div>
            <Label className="text-xs">Local (financeiro)</Label>
            <Input
              value={draft.financial_local}
              onChange={(e) => setDraft((p) => ({ ...p, financial_local: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="Cidade/loja"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Validade da proposta</Label>
            <Input
              value={draft.proposal_valid_until_text}
              onChange={(e) => setDraft((p) => ({ ...p, proposal_valid_until_text: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="dd/mm/aaaa"
            />
          </div>
          <div>
            <Label className="text-xs">Data prevista para entrega</Label>
            <Input
              value={draft.expected_delivery_date_text}
              onChange={(e) => setDraft((p) => ({ ...p, expected_delivery_date_text: e.target.value }))}
              className="mt-1 h-10 rounded-2xl"
              placeholder="dd/mm/aaaa"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Obs.</Label>
          <Textarea
            value={draft.notes}
            onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
            className="mt-1 min-h-[92px] rounded-2xl"
            placeholder="Observações do pedido"
          />
        </div>

        <Button
          onClick={save}
          disabled={saving}
          className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white shadow-sm hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
        >
          {saving ? "Salvando…" : "Salvar dados"}
          <Save className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}