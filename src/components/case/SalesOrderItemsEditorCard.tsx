import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Plus, ReceiptText, Save, Trash2 } from "lucide-react";

type CaseItemRow = {
  id: string;
  case_id: string;
  line_no: number;
  color: string | null;
  description: string | null;
  qty: number | null;
  price: number | null;
  total: number | null;
  updated_at: string;
};

type DraftRow = {
  id?: string;
  line_no: number;
  color: string;
  description: string;
  qty: string;
  price: string;
};

function parsePtBrNumber(input: string) {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function moneyPtBr(v: number) {
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${v.toFixed(2)}`;
  }
}

function computeRowTotal(qty: number | null, price: number | null) {
  const q = Number(qty ?? 0);
  const p = Number(price ?? 0);
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0;
  return q * p;
}

export function SalesOrderItemsEditorCard(props: { caseId: string; className?: string }) {
  const { caseId, className } = props;
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const itemsQ = useQuery({
    queryKey: ["case_items", caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_items")
        .select("id,case_id,line_no,color,description,qty,price,total,updated_at")
        .eq("case_id", caseId)
        .order("line_no", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CaseItemRow[];
    },
  });

  const initialDraft = useMemo<DraftRow[]>(() => {
    return (itemsQ.data ?? []).map((r) => ({
      id: r.id,
      line_no: r.line_no,
      color: r.color ?? "",
      description: r.description ?? "",
      qty: r.qty == null ? "" : String(r.qty).replace(/\./g, ","),
      price: r.price == null ? "" : String(r.price).replace(/\./g, ","),
    }));
  }, [itemsQ.data]);

  const [draft, setDraft] = useState<DraftRow[]>([]);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  const nextLineNo = useMemo(() => {
    const max = Math.max(0, ...draft.map((d) => Number(d.line_no) || 0));
    return max + 1;
  }, [draft]);

  const rowsWithParsed = useMemo(() => {
    return draft.map((r) => {
      const qty = parsePtBrNumber(r.qty) ?? 0;
      const price = parsePtBrNumber(r.price) ?? 0;
      const total = computeRowTotal(qty, price);
      return { r, qty, price, total };
    });
  }, [draft]);

  const grandTotal = useMemo(() => {
    return rowsWithParsed.reduce((acc, x) => acc + (Number(x.total) || 0), 0);
  }, [rowsWithParsed]);

  const addRow = () => {
    setDraft((prev) => [
      ...prev,
      {
        line_no: nextLineNo,
        color: "",
        description: "",
        qty: "1",
        price: "",
      },
    ]);
  };

  const removeRow = async (row: DraftRow) => {
    if (!row.id) {
      setDraft((prev) => prev.filter((x) => x.line_no !== row.line_no));
      return;
    }

    try {
      const { error } = await supabase.from("case_items").delete().eq("id", row.id);
      if (error) throw error;
      showSuccess("Item removido.");
      await qc.invalidateQueries({ queryKey: ["case_items", caseId] });
    } catch (e: any) {
      showError(`Falha ao remover item: ${e?.message ?? "erro"}`);
    }
  };

  const saveAll = async () => {
    if (!caseId) return;
    if (saving) return;

    // Basic validation: each row should have at least a description.
    for (const r of draft) {
      if (!r.description.trim()) {
        showError(`Preencha a Descrição do item #${r.line_no}.`);
        return;
      }
      const qty = parsePtBrNumber(r.qty);
      if (qty == null || qty <= 0) {
        showError(`Informe uma Quantidade válida no item #${r.line_no}.`);
        return;
      }
      const price = parsePtBrNumber(r.price);
      if (price == null || price < 0) {
        showError(`Informe um Valor Unitário válido no item #${r.line_no}.`);
        return;
      }
    }

    setSaving(true);
    try {
      for (const r of draft) {
        const qty = parsePtBrNumber(r.qty) ?? 0;
        const price = parsePtBrNumber(r.price) ?? 0;
        const total = computeRowTotal(qty, price);

        const payload = {
          case_id: caseId,
          line_no: r.line_no,
          color: r.color.trim() || null,
          description: r.description.trim() || null,
          qty,
          price,
          total,
          confidence_json: {},
        };

        if (r.id) {
          const { error } = await supabase.from("case_items").update(payload).eq("id", r.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("case_items").insert(payload);
          if (error) throw error;
        }
      }

      showSuccess("Itens do pedido salvos.");
      await qc.invalidateQueries({ queryKey: ["case_items", caseId] });
    } catch (e: any) {
      showError(`Falha ao salvar itens: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("rounded-[22px] border border-slate-200 bg-white p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ReceiptText className="h-4 w-4 text-slate-500" /> Itens do pedido
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Edite a tabela do pedido (Cor, Descrição, Quantidade e Valor Unitário). O total é calculado automaticamente.
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</div>
          <div className="text-lg font-semibold text-slate-900">{moneyPtBr(grandTotal)}</div>
        </div>
      </div>

      {itemsQ.isError && (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          Erro ao carregar itens: {(itemsQ.error as any)?.message ?? ""}
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        {/* Header (desktop) */}
        <div className="hidden grid-cols-12 gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:grid">
          <div className="col-span-2">Cor</div>
          <div className="col-span-5">Descrição</div>
          <div className="col-span-2 text-right">Quant</div>
          <div className="col-span-2 text-right">Valor Unit.</div>
          <div className="col-span-1 text-right">Total</div>
        </div>

        <div className="divide-y divide-slate-200 bg-white">
          {draft.map((row) => {
            const parsedQty = parsePtBrNumber(row.qty) ?? 0;
            const parsedPrice = parsePtBrNumber(row.price) ?? 0;
            const total = computeRowTotal(parsedQty, parsedPrice);

            return (
              <div key={`${row.id ?? "new"}:${row.line_no}`} className="px-3 py-3">
                {/* Mobile layout */}
                <div className="grid gap-3 sm:hidden">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px] text-slate-600">Cor</Label>
                      <Input
                        value={row.color}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((x) => (x.line_no === row.line_no ? { ...x, color: e.target.value } : x))
                          )
                        }
                        className="mt-1 h-10 rounded-2xl"
                        placeholder="Ex: Azul"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-slate-600">Quant</Label>
                      <Input
                        value={row.qty}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((x) => (x.line_no === row.line_no ? { ...x, qty: e.target.value } : x))
                          )
                        }
                        className="mt-1 h-10 rounded-2xl text-right"
                        inputMode="decimal"
                        placeholder="1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-[11px] text-slate-600">Descrição</Label>
                    <Input
                      value={row.description}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev.map((x) =>
                            x.line_no === row.line_no ? { ...x, description: e.target.value } : x
                          )
                        )
                      }
                      className="mt-1 h-10 rounded-2xl"
                      placeholder="Descrição do item"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px] text-slate-600">Valor Unit.</Label>
                      <Input
                        value={row.price}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((x) => (x.line_no === row.line_no ? { ...x, price: e.target.value } : x))
                          )
                        }
                        className="mt-1 h-10 rounded-2xl text-right"
                        inputMode="decimal"
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-slate-600">Total</Label>
                      <div className="mt-1 flex h-10 items-center justify-end rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900">
                        {moneyPtBr(total)}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                      onClick={() => removeRow(row)}
                      title="Remover item"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Remover
                    </Button>
                  </div>
                </div>

                {/* Desktop/table layout */}
                <div className="hidden grid-cols-12 items-start gap-2 sm:grid">
                  <div className="col-span-2">
                    <Input
                      value={row.color}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev.map((x) => (x.line_no === row.line_no ? { ...x, color: e.target.value } : x))
                        )
                      }
                      className="h-10 rounded-2xl"
                      placeholder="Azul"
                    />
                  </div>
                  <div className="col-span-5">
                    <Input
                      value={row.description}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev.map((x) =>
                            x.line_no === row.line_no ? { ...x, description: e.target.value } : x
                          )
                        )
                      }
                      className="h-10 rounded-2xl"
                      placeholder="Descrição do item"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      value={row.qty}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev.map((x) => (x.line_no === row.line_no ? { ...x, qty: e.target.value } : x))
                        )
                      }
                      className="h-10 rounded-2xl text-right"
                      inputMode="decimal"
                      placeholder="1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      value={row.price}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev.map((x) => (x.line_no === row.line_no ? { ...x, price: e.target.value } : x))
                        )
                      }
                      className="h-10 rounded-2xl text-right"
                      inputMode="decimal"
                      placeholder="0,00"
                    />
                  </div>
                  <div className="col-span-1 flex items-start justify-end gap-2">
                    <div className="mt-1.5 text-right text-sm font-semibold text-slate-900">
                      {moneyPtBr(total)}
                    </div>
                  </div>

                  <div className="col-span-12 flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-rose-800 hover:bg-rose-100"
                      onClick={() => removeRow(row)}
                      title="Remover item"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Remover
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {draft.length === 0 && (
            <div className="p-4 text-sm text-slate-600">
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4">
                Nenhum item ainda. Clique em <span className="font-semibold">Adicionar item</span>.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="secondary"
          className="h-11 rounded-2xl"
          onClick={addRow}
        >
          <Plus className="mr-2 h-4 w-4" /> Adicionar item
        </Button>

        <Button
          type="button"
          onClick={saveAll}
          disabled={saving || draft.length === 0}
          className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-5 text-white shadow-sm hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
        >
          {saving ? "Salvando…" : "Salvar itens"}
          <Save className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}