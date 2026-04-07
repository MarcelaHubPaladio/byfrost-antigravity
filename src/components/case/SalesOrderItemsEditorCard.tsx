import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, ReceiptText, Save, Trash2, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";

type CaseItemRow = {
  id: string;
  case_id: string;
  line_no: number;
  code: string | null;
  description: string | null;
  qty: number | null;
  price: number | null;
  total: number | null;
  offering_entity_id: string | null;
  updated_at: string;
};

type DraftRow = {
  id?: string;
  line_no: number;
  code: string;
  description: string;
  qty: string;
  price: string;
  offering_entity_id: string | null;
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
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const [saving, setSaving] = useState(false);

  // Helps when dev HMR keeps stale react-query error cache from previous schema.
  useEffect(() => {
    if (!caseId) return;
    qc.invalidateQueries({ queryKey: ["case_items", caseId] });
  }, [caseId, qc]);

  const itemsQ = useQuery({
    queryKey: ["case_items", caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_items")
        .select("id,case_id,line_no,code,description,qty,price,total,offering_entity_id,updated_at")
        .eq("case_id", caseId)
        .order("line_no", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CaseItemRow[];
    },
  });

  const [searchOffering, setSearchOffering] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [openOfferingPerLine, setOpenOfferingPerLine] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchOffering), 300);
    return () => clearTimeout(t);
  }, [searchOffering]);

  const offeringsQ = useQuery({
    queryKey: ["offerings_search", activeTenantId, debouncedSearch],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("core_entities")
        .select("id,display_name,metadata,status")
        .eq("tenant_id", activeTenantId!)
        .in("entity_type", ["offering", "product"])
        .is("deleted_at", null)
        .order("display_name", { ascending: true })
        .limit(30);

      const term = debouncedSearch.trim();
      if (term) {
        q = q.ilike("display_name", `%${term}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const initialDraft = useMemo<DraftRow[]>(() => {
    return (itemsQ.data ?? []).map((r) => ({
      id: r.id,
      line_no: r.line_no,
      code: r.code ?? "",
      description: r.description ?? "",
      qty: r.qty == null ? "" : String(r.qty).replace(/\./g, ","),
      price: r.price == null ? "" : String(r.price).replace(/\./g, ","),
      offering_entity_id: r.offering_entity_id,
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

  const grandTotal = useMemo(() => {
    return draft.reduce((acc, r) => {
      const qty = parsePtBrNumber(r.qty) ?? 0;
      const price = parsePtBrNumber(r.price) ?? 0;
      return acc + computeRowTotal(qty, price);
    }, 0);
  }, [draft]);

  const addRow = () => {
    setDraft((prev) => [
      ...prev,
      {
        line_no: nextLineNo,
        code: "",
        description: "",
        qty: "1",
        price: "",
        offering_entity_id: null,
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

      // Audit trail
      if (activeTenantId) {
        await supabase.from("timeline_events").insert({
          tenant_id: activeTenantId,
          case_id: caseId,
          event_type: "case_items_manual_saved",
          actor_type: "admin",
          actor_id: user?.id ?? null,
          message: `Item removido manualmente (#${row.line_no}).`,
          meta_json: { action: "delete", line_no: row.line_no, id: row.id },
          occurred_at: new Date().toISOString(),
        });
      }

      showSuccess("Item removido.");
      await qc.invalidateQueries({ queryKey: ["case_items", caseId] });
      await qc.invalidateQueries({ queryKey: ["timeline", activeTenantId, caseId] });
    } catch (e: any) {
      showError(`Falha ao remover item: ${e?.message ?? "erro"}`);
    }
  };

  const saveAll = async () => {
    if (!caseId) return;
    if (saving) return;

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
      const touchedIds: string[] = [];
      const insertedCount = { n: 0 };
      const updatedCount = { n: 0 };

      for (const r of draft) {
        const qty = parsePtBrNumber(r.qty) ?? 0;
        const price = parsePtBrNumber(r.price) ?? 0;
        const total = computeRowTotal(qty, price);

        const payload = {
          case_id: caseId,
          line_no: r.line_no,
          code: r.code.trim() || null,
          description: r.description.trim() || null,
          qty,
          price,
          total,
          offering_entity_id: r.offering_entity_id || null,
          confidence_json: {},
        };

        if (r.id) {
          const { error } = await supabase.from("case_items").update(payload).eq("id", r.id);
          if (error) throw error;
          touchedIds.push(r.id);
          updatedCount.n += 1;
        } else {
          const { data: ins, error } = await supabase.from("case_items").insert(payload).select("id").single();
          if (error) throw error;
          if (ins?.id) touchedIds.push(String((ins as any).id));
          insertedCount.n += 1;
        }
      }

      // Audit trail: timeline event with user + timestamp
      if (activeTenantId) {
        await supabase.from("timeline_events").insert({
          tenant_id: activeTenantId,
          case_id: caseId,
          event_type: "case_items_manual_saved",
          actor_type: "admin",
          actor_id: user?.id ?? null,
          message: "Itens do pedido preenchidos/ajustados manualmente.",
          meta_json: {
            inserted: insertedCount.n,
            updated: updatedCount.n,
            touched_ids: touchedIds.slice(0, 120),
            total_items: draft.length,
            grand_total: grandTotal,
          },
          occurred_at: new Date().toISOString(),
        });
      }

      showSuccess("Itens do pedido salvos.");
      await qc.invalidateQueries({ queryKey: ["case_items", caseId] });
      await qc.invalidateQueries({ queryKey: ["timeline", activeTenantId, caseId] });
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
            Edite a tabela do pedido (ID, Quantidade, Valor Unitário). A descrição fica em uma área maior abaixo.
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Carregados: <span className="font-semibold text-slate-700">{itemsQ.data?.length ?? 0}</span>
            {itemsQ.isFetching ? <span className="ml-2">(atualizando…)</span> : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</div>
          <div className="text-lg font-semibold tabular-nums text-slate-900 whitespace-nowrap">
            {moneyPtBr(grandTotal)}
          </div>
        </div>
        <Button
          onClick={saveAll}
          disabled={saving || draft.length === 0}
          size="sm"
          className="h-9 rounded-xl bg-[hsl(var(--byfrost-accent))] text-white shadow-sm hover:bg-[hsl(var(--byfrost-accent)/0.92)] font-bold px-4 shrink-0 mt-1"
        >
          {saving ? "Salvando…" : "Salvar"}
          <Save className="ml-2 h-3.5 w-3.5" />
        </Button>
      </div>

      {itemsQ.isError && (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          Erro ao carregar itens: {(itemsQ.error as any)?.message ?? ""}
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        {/* Header (desktop) */}
        <div className="hidden grid-cols-[120px_92px_140px_140px_110px] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:grid">
          <div>ID</div>
          <div className="text-right">Quant</div>
          <div className="text-right">Valor Unit.</div>
          <div className="text-right">Total</div>
          <div className="text-right">Ações</div>
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
                      <Label className="text-[11px] text-slate-600">ID</Label>
                      <Input
                        value={row.code}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((x) => (x.line_no === row.line_no ? { ...x, code: e.target.value } : x))
                          )
                        }
                        className="mt-1 h-10 rounded-2xl"
                        placeholder="Ex: 12345"
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
                        className="mt-1 h-10 rounded-2xl text-right tabular-nums"
                        inputMode="decimal"
                        placeholder="1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-[11px] text-slate-600">Produto / Serviço</Label>
                    <Popover
                      open={openOfferingPerLine[row.line_no] || false}
                      onOpenChange={(open) => {
                        setOpenOfferingPerLine((prev) => ({ ...prev, [row.line_no]: open }));
                        if (!open) {
                          setSearchOffering("");
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "mt-1 w-full justify-between h-auto min-h-10 text-left rounded-2xl whitespace-normal break-words",
                            !row.description && "text-slate-500"
                          )}
                        >
                          <span className="line-clamp-2">
                            {row.description || "Selecione ou digite..."}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0 rounded-2xl" side="bottom" align="start">
                        <div className="flex flex-col">
                          <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
                            <Input
                              placeholder="Buscar ou digitar item..."
                              value={searchOffering}
                              onChange={(e) => setSearchOffering(e.target.value)}
                              className="h-8 rounded-xl bg-slate-50 border-transparent shadow-none"
                            />
                            {offeringsQ.isFetching && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                          </div>
                          <div className="max-h-[220px] overflow-y-auto">
                            {!offeringsQ.isFetching && searchOffering.length > 0 && offeringsQ.data?.length === 0 && (
                              <div className="px-3 py-4 text-center text-sm text-slate-500">
                                Nenhum produto encontrado.
                              </div>
                            )}
                            {offeringsQ.data?.map((off: any) => (
                              <Button
                                key={off.id}
                                variant="ghost"
                                className="w-full justify-start rounded-none h-auto min-h-12 py-2 px-3 hover:bg-slate-50 whitespace-normal break-words text-left"
                                onClick={() => {
                                  setDraft((prev) =>
                                    prev.map((x) =>
                                      x.line_no === row.line_no
                                        ? {
                                            ...x,
                                            code: off.metadata?.short_name || off.metadata?.code || x.code,
                                            description: off.display_name,
                                            offering_entity_id: off.id,
                                          }
                                        : x
                                    )
                                  );
                                  setOpenOfferingPerLine((prev) => ({ ...prev, [row.line_no]: false }));
                                  setSearchOffering("");
                                }}
                              >
                                <div className="flex flex-col gap-0.5">
                                  <div className="text-sm font-medium text-slate-900 leading-snug">
                                    {off.display_name}
                                  </div>
                                  {(off.metadata?.short_name || off.metadata?.code) && (
                                    <div className="text-[11px] text-slate-500 font-mono">
                                      {off.metadata?.short_name || off.metadata?.code}
                                    </div>
                                  )}
                                </div>
                                {row.offering_entity_id === off.id && (
                                  <Check className="ml-auto h-4 w-4 text-emerald-600" />
                                )}
                              </Button>
                            ))}
                          </div>
                          {searchOffering.trim().length > 0 && (
                            <div className="p-2 border-t border-slate-100 bg-slate-50/50">
                              <Button
                                variant="ghost"
                                className="w-full justify-start text-[13px] h-9 rounded-xl text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/50"
                                onClick={() => {
                                  setDraft((prev) =>
                                    prev.map((x) =>
                                      x.line_no === row.line_no
                                        ? { ...x, description: searchOffering.trim(), offering_entity_id: null }
                                        : x
                                    )
                                  );
                                  setOpenOfferingPerLine((prev) => ({ ...prev, [row.line_no]: false }));
                                  setSearchOffering("");
                                }}
                              >
                                Usar o texto "{searchOffering}"
                              </Button>
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
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
                        className="mt-1 h-10 rounded-2xl text-right tabular-nums"
                        inputMode="decimal"
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-slate-600">Total</Label>
                      <div className="mt-1 flex h-10 items-center justify-end rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold tabular-nums text-slate-900 whitespace-nowrap">
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
                <div className="hidden gap-2 sm:grid">
                  <div className="grid grid-cols-[120px_92px_140px_140px_110px] items-start gap-2">
                    <div>
                      <Input
                        value={row.code}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((x) => (x.line_no === row.line_no ? { ...x, code: e.target.value } : x))
                          )
                        }
                        className="h-10 rounded-2xl"
                        placeholder="12345"
                      />
                    </div>
                    <div>
                      <Input
                        value={row.qty}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((x) => (x.line_no === row.line_no ? { ...x, qty: e.target.value } : x))
                          )
                        }
                        className="h-10 rounded-2xl text-right tabular-nums"
                        inputMode="decimal"
                        placeholder="1"
                      />
                    </div>
                    <div>
                      <Input
                        value={row.price}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((x) => (x.line_no === row.line_no ? { ...x, price: e.target.value } : x))
                          )
                        }
                        className="h-10 rounded-2xl text-right tabular-nums"
                        inputMode="decimal"
                        placeholder="0,00"
                      />
                    </div>
                    <div className="flex items-center justify-end">
                      <div className="text-right text-sm font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                        {moneyPtBr(total)}
                      </div>
                    </div>
                    <div className="flex items-center justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-rose-800 hover:bg-rose-100"
                        onClick={() => removeRow(row)}
                        title="Remover item"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remover
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-[11px] text-slate-600">Produto / Serviço</Label>
                    <Popover
                      open={openOfferingPerLine[row.line_no] || false}
                      onOpenChange={(open) => {
                        setOpenOfferingPerLine((prev) => ({ ...prev, [row.line_no]: open }));
                        if (!open) {
                          setSearchOffering("");
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "mt-1 w-full justify-between h-auto min-h-10 text-left rounded-2xl whitespace-normal break-words",
                            !row.description && "text-slate-500"
                          )}
                        >
                          <span className="line-clamp-2">
                            {row.description || "Selecione ou digite..."}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0 rounded-2xl" side="bottom" align="start">
                        <div className="flex flex-col">
                          <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
                            <Input
                              placeholder="Buscar ou digitar item..."
                              value={searchOffering}
                              onChange={(e) => setSearchOffering(e.target.value)}
                              className="h-8 rounded-xl bg-slate-50 border-transparent shadow-none"
                            />
                            {offeringsQ.isFetching && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                          </div>
                          <div className="max-h-[260px] overflow-y-auto">
                            {!offeringsQ.isFetching && searchOffering.length > 0 && offeringsQ.data?.length === 0 && (
                              <div className="px-3 py-4 text-center text-sm text-slate-500">
                                Nenhum produto encontrado.
                              </div>
                            )}
                            {offeringsQ.data?.map((off: any) => (
                              <Button
                                key={off.id}
                                variant="ghost"
                                className="w-full justify-start rounded-none h-auto min-h-12 py-2 px-3 hover:bg-slate-50 whitespace-normal break-words text-left"
                                onClick={() => {
                                  setDraft((prev) =>
                                    prev.map((x) =>
                                      x.line_no === row.line_no
                                        ? {
                                            ...x,
                                            code: off.metadata?.short_name || off.metadata?.code || x.code,
                                            description: off.display_name,
                                            offering_entity_id: off.id,
                                          }
                                        : x
                                    )
                                  );
                                  setOpenOfferingPerLine((prev) => ({ ...prev, [row.line_no]: false }));
                                  setSearchOffering("");
                                }}
                              >
                                <div className="flex flex-col gap-0.5">
                                  <div className="text-sm font-medium text-slate-900 leading-snug">
                                    {off.display_name}
                                  </div>
                                  {(off.metadata?.short_name || off.metadata?.code) && (
                                    <div className="text-[11px] text-slate-500 font-mono">
                                      {off.metadata?.short_name || off.metadata?.code}
                                    </div>
                                  )}
                                </div>
                                {row.offering_entity_id === off.id && (
                                  <Check className="ml-auto h-4 w-4 text-emerald-600" />
                                )}
                              </Button>
                            ))}
                          </div>
                          {searchOffering.trim().length > 0 && (
                            <div className="p-2 border-t border-slate-100 bg-slate-50/50">
                              <Button
                                variant="ghost"
                                className="w-full justify-start text-[13px] h-9 rounded-xl text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/50"
                                onClick={() => {
                                  setDraft((prev) =>
                                    prev.map((x) =>
                                      x.line_no === row.line_no
                                        ? { ...x, description: searchOffering.trim(), offering_entity_id: null }
                                        : x
                                    )
                                  );
                                  setOpenOfferingPerLine((prev) => ({ ...prev, [row.line_no]: false }));
                                  setSearchOffering("");
                                }}
                              >
                                Usar o texto "{searchOffering}"
                              </Button>
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            );
          })}

          {draft.length === 0 && !itemsQ.isError && (
            <div className="p-4 text-sm text-slate-600">
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4">
                Nenhum item encontrado nesse pedido.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 bg-white pt-3 border-t border-slate-100 z-10 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mt-4">
        <Button type="button" variant="secondary" className="h-11 rounded-2xl" onClick={addRow}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar item
        </Button>

        <Button
          type="button"
          onClick={saveAll}
          disabled={saving || draft.length === 0}
          className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-8 text-white shadow-sm hover:bg-[hsl(var(--byfrost-accent)/0.92)] font-bold"
        >
          {saving ? "Salvando…" : "Salvar itens"}
          <Save className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}