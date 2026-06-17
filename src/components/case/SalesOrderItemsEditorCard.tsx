import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Plus, ReceiptText, Save, Trash2, Check, Loader2, DollarSign, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { QuickCreateProductDialog } from "@/components/case/QuickCreateProductDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";

type CaseItemRow = {
  id: string;
  case_id: string;
  line_no: number;
  code: string | null;
  description: string | null;
  qty: number | null;
  price: number | null;
  total: number | null;
  discount_percent: number | null;
  discount_value: number | null;
  offering_entity_id: string | null;
  confidence_json: any;
  updated_at: string;
};

type DraftRow = {
  id?: string;
  line_no: number;
  code: string;
  description: string;
  qty: string;
  price: string;
  discount_percent: string;
  offering_entity_id: string | null;
  config_id: string | null;
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

function parseDateString(dateString: string) {
  if (!dateString) return undefined;
  const parsed = parse(dateString, "dd/MM/yyyy", new Date());
  if (!isNaN(parsed.getTime())) return parsed;
  return undefined;
}

function computeRowTotal(qty: number | null, price: number | null, discountPct: number | null = 0) {
  const q = Number(qty ?? 0);
  const p = Number(price ?? 0);
  const d = Number(discountPct ?? 0);
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0;
  const subtotal = q * p;
  const discount = subtotal * (d / 100);
  return subtotal - discount;
}

export function SalesOrderItemsEditorCard(props: { caseId: string; fields?: any[]; className?: string }) {
  const { caseId, fields, className } = props;
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const [saving, setSaving] = useState(false);
  const [globalDiscountInput, setGlobalDiscountInput] = useState("");

  const initialExtraFields = useMemo(() => ({
    proposal_validity_date_text: fields?.find(f => f.key === "proposal_validity_date_text" || f.key === "proposal_valid_until_text")?.value_text || "",
    delivery_forecast_text: fields?.find(f => f.key === "delivery_forecast_text" || f.key === "expected_delivery_date_text")?.value_text || ""
  }), [fields]);

  const [extraFields, setExtraFields] = useState(initialExtraFields);

  useEffect(() => {
    setExtraFields(initialExtraFields);
  }, [initialExtraFields]);

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
        .select("id,case_id,line_no,code,description,qty,price,total,discount_percent,discount_value,offering_entity_id,confidence_json,updated_at")
        .eq("case_id", caseId)
        .order("line_no", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CaseItemRow[];
    },
  });

  const [searchOffering, setSearchOffering] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [openOfferingPerLine, setOpenOfferingPerLine] = useState<Record<string, boolean>>({});

  const [quickCreate, setQuickCreate] = useState<{ open: boolean; name: string; lineNo: number | null }>({
    open: false,
    name: "",
    lineNo: null
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchOffering), 300);
    return () => clearTimeout(t);
  }, [searchOffering]);

  const offeringsQ = useQuery({
    queryKey: ["offerings_search_all", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("core_entities")
        .select("id,display_name,internal_code,metadata,status")
        .eq("tenant_id", activeTenantId!)
        .in("entity_type", ["offering", "product"])
        .is("deleted_at", null)
        .order("display_name", { ascending: true })
        .limit(1000);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

interface SearchOption {
  key: string;
  offering: any;
  configId: string | null;
  display_name: string;
  code: string;
  price: string;
}

  const searchableOptions = useMemo<SearchOption[]>(() => {
    const all = offeringsQ.data ?? [];
    const options: SearchOption[] = [];
    
    for (const off of all) {
      const configs = off.metadata?.configurations;
      if (Array.isArray(configs) && configs.length > 0) {
        for (const cfg of configs) {
          options.push({
            key: `${off.id}:${cfg.id}`,
            offering: off,
            configId: cfg.id,
            display_name: `${off.display_name} - ${cfg.name}`,
            code: cfg.internal_code || cfg.sku || off.metadata?.internal_code || off.metadata?.code || "",
            price: cfg.price_sale != null 
              ? String(cfg.price_sale)
              : (off.metadata?.price_sale != null ? String(off.metadata.price_sale) : "")
          });
        }
      } else {
        options.push({
          key: off.id,
          offering: off,
          configId: null,
          display_name: off.display_name,
          code: off.metadata?.short_name || off.metadata?.code || off.internal_code || "",
          price: off.metadata?.price_sale != null 
            ? String(off.metadata.price_sale) 
            : (off.metadata?.price != null ? String(off.metadata.price) : "")
        });
      }
    }
    return options;
  }, [offeringsQ.data]);

  const filteredOfferings = useMemo<SearchOption[]>(() => {
    const term = debouncedSearch.toLowerCase().trim();
    if (!term) return searchableOptions.slice(0, 30);

    return searchableOptions.filter((opt) => {
      return (
        opt.display_name.toLowerCase().includes(term) ||
        opt.code.toLowerCase().includes(term)
      );
    }).slice(0, 30);
  }, [searchableOptions, debouncedSearch]);

  const initialDraft = useMemo<DraftRow[]>(() => {
    return (itemsQ.data ?? []).map((r) => ({
      id: r.id,
      line_no: r.line_no,
      code: r.code ?? "",
      description: r.description ?? "",
      qty: r.qty == null ? "" : String(r.qty).replace(/\./g, ","),
      price: r.price == null ? "" : String(r.price).replace(/\./g, ","),
      discount_percent: r.discount_percent == null ? "0" : String(r.discount_percent).replace(/\./g, ","),
      offering_entity_id: r.offering_entity_id,
      config_id: r.confidence_json?.config_id || null,
    }));
  }, [itemsQ.data]);

  const [draft, setDraft] = useState<DraftRow[]>([]);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  const referencedProductIds = useMemo(() => {
    return Array.from(new Set(draft.map(d => d.offering_entity_id).filter(Boolean))) as string[];
  }, [draft]);

  const productsQ = useQuery({
    queryKey: ["products_details_lookup", activeTenantId, referencedProductIds],
    enabled: Boolean(activeTenantId && referencedProductIds.length > 0),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id,display_name,metadata")
        .in("id", referencedProductIds);
      if (error) throw error;
      return data ?? [];
    }
  });

  const productsMap = useMemo(() => {
    const map = new Map<string, any>();
    if (productsQ.data) {
      for (const p of productsQ.data) {
        map.set(p.id, p);
      }
    }
    return map;
  }, [productsQ.data]);

  const { data: caseInfo } = useQuery({
    queryKey: ["case_info_commission", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("assigned_user_id, assigned_vendor_id, users_profile:users_profile!fk_cases_users_profile(meta_json), assigned_vendor:vendors!cases_assigned_vendor_id_fkey(display_name)")
        .eq("id", caseId)
        .single();
      if (error) throw error;
      return data;
    }
  });

  const { data: vendorUserProfile } = useQuery({
    queryKey: ["vendor_user_profile", caseInfo?.assigned_vendor?.display_name],
    enabled: !!caseInfo?.assigned_vendor?.display_name && !caseInfo?.users_profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("meta_json")
        .eq("display_name", caseInfo!.assigned_vendor!.display_name!)
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    }
  });

  const commissionRules = useMemo(() => {
    const up = caseInfo?.users_profile;
    const directRules = Array.isArray(up) ? (up[0] as any)?.meta_json?.commission_rules : (up as any)?.meta_json?.commission_rules;
    if (directRules) return directRules;
    return (vendorUserProfile as any)?.meta_json?.commission_rules;
  }, [caseInfo, vendorUserProfile]);

  const nextLineNo = useMemo(() => {
    const max = Math.max(0, ...draft.map((d) => Number(d.line_no) || 0));
    return max + 1;
  }, [draft]);

  function calculateRowCommission(rowTotal: number, discountPct: number, offeringEntityId?: string | null) {
    if (!commissionRules) return 0;
    
    let base = commissionRules.base_percent || 0;
    let tiers = commissionRules.discount_tiers || [];

    if (offeringEntityId && offeringsQ.data) {
       const off = offeringsQ.data.find((o: any) => o.id === offeringEntityId);
       const catId = off?.metadata?.commission_category_id;
       if (catId) {
          const catRule = (commissionRules.category_rules || {})[catId];
          if (catRule) {
             base = catRule.base_percent;
             tiers = catRule.discount_tiers || [];
          }
       }
    }

    const applicableTier = tiers.find((t: any) => t.max_discount_pct >= discountPct);
    const pct = applicableTier ? applicableTier.commission_pct : base;
    return rowTotal * (pct / 100);
  }

  const grandTotal = useMemo(() => {
    return draft.reduce((acc, r) => {
      const qty = parsePtBrNumber(r.qty) ?? 0;
      const price = parsePtBrNumber(r.price) ?? 0;
      const discount = parsePtBrNumber(r.discount_percent) ?? 0;
      return acc + computeRowTotal(qty, price, discount);
    }, 0);
  }, [draft]);

  const totalCommission = useMemo(() => {
    return draft.reduce((acc, r) => {
      const qty = parsePtBrNumber(r.qty) ?? 0;
      const price = parsePtBrNumber(r.price) ?? 0;
      const discountPct = parsePtBrNumber(r.discount_percent) ?? 0;
      const total = computeRowTotal(qty, price, discountPct);
      return acc + calculateRowCommission(total, discountPct, r.offering_entity_id);
    }, 0);
  }, [draft, commissionRules, offeringsQ.data]);

  const applyGlobalDiscount = (pct: number) => {
    setDraft((prev) =>
      prev.map((x) => ({
        ...x,
        discount_percent: String(pct).replace(/\./g, ","),
      }))
    );
    showSuccess(`Desconto de ${pct}% aplicado a todos os itens.`);
  };

  const addRow = () => {
    setDraft((prev) => [
      ...prev,
      {
        line_no: nextLineNo,
        code: "",
        description: "",
        qty: "1",
        price: "0",
        discount_percent: "0",
        offering_entity_id: null,
        config_id: null
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
      await qc.invalidateQueries({ queryKey: ["inventory_item"] });
      await qc.invalidateQueries({ queryKey: ["inventory"] });
      await qc.invalidateQueries({ queryKey: ["products_details_lookup"] });
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

      // Valida se variação foi selecionada se o produto as contiver
      if (r.offering_entity_id) {
        const product = productsMap.get(r.offering_entity_id);
        const hasConfigs = Array.isArray(product?.metadata?.configurations) && product.metadata.configurations.length > 0;
        if (hasConfigs && !r.config_id) {
          showError(`Selecione a variação para o produto "${r.description}" no item #${r.line_no}.`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      // 2. Salva os registros em case_items
      const touchedIds: string[] = [];
      const insertedCount = { n: 0 };
      const updatedCount = { n: 0 };

      for (const r of draft) {
        const qty = parsePtBrNumber(r.qty) ?? 0;
        const price = parsePtBrNumber(r.price) ?? 0;
        const discountPct = parsePtBrNumber(r.discount_percent) ?? 0;
        const rowTotalBruto = qty * price;
        const discountValue = rowTotalBruto * (discountPct / 100);
        const total = rowTotalBruto - discountValue;
        const commissionValue = calculateRowCommission(total, discountPct, r.offering_entity_id);

        const payload = {
          case_id: caseId,
          line_no: r.line_no,
          code: r.code.trim() || null,
          description: r.description.trim() || null,
          qty,
          price,
          total,
          discount_percent: discountPct,
          discount_value: discountValue,
          commission_value: commissionValue,
          offering_entity_id: r.offering_entity_id || null,
          confidence_json: { config_id: r.config_id || null },
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

      if (activeTenantId) {
        await supabase.from("timeline_events").insert({
          tenant_id: activeTenantId,
          case_id: caseId,
          event_type: "case_items_manual_saved",
          actor_type: "admin",
          actor_id: user?.id ?? null,
          message: "Itens do pedido salvos e estoque movimentado.",
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

      // 3. Save extra fields to case_fields
      const extraFieldsPayload = [
        {
          case_id: caseId,
          key: "proposal_validity_date_text",
          value_text: extraFields.proposal_validity_date_text.trim() || null,
          confidence: 1,
          source: "admin",
          last_updated_by: "panel"
        },
        {
          case_id: caseId,
          key: "delivery_forecast_text",
          value_text: extraFields.delivery_forecast_text.trim() || null,
          confidence: 1,
          source: "admin",
          last_updated_by: "panel"
        }
      ].filter((r) => r.value_text !== null);

      if (extraFieldsPayload.length > 0) {
        await supabase.from("case_fields").upsert(extraFieldsPayload as any, { onConflict: "case_id,key" });
      }

      const clearedFields = [
        "proposal_validity_date_text",
        "delivery_forecast_text"
      ].filter(k => {
        if (k === "proposal_validity_date_text") return !extraFields.proposal_validity_date_text.trim();
        if (k === "delivery_forecast_text") return !extraFields.delivery_forecast_text.trim();
        return false;
      }).map(k => ({
        tenant_id: activeTenantId,
        case_id: caseId,
        key: k,
        value_text: null,
        confidence: 1,
        source: "admin",
        last_updated_by: "panel"
      }));

      if (clearedFields.length > 0) {
        await supabase.from("case_fields").upsert(clearedFields as any, { onConflict: "case_id,key" });
      }

      showSuccess("Itens do pedido salvos com sucesso.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case_items", caseId] }),
        qc.invalidateQueries({ queryKey: ["inventory_item"] }),
        qc.invalidateQueries({ queryKey: ["inventory"] }),
        qc.invalidateQueries({ queryKey: ["products_details_lookup"] }),
        qc.invalidateQueries({ queryKey: ["timeline", activeTenantId, caseId] }),
        qc.invalidateQueries({ queryKey: ["orders_case_data"] }),
      ]);
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
            Edite a tabela do pedido. As variações e estoques serão reservados ao salvar.
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Carregados: <span className="font-semibold text-slate-700">{itemsQ.data?.length ?? 0}</span>
            {itemsQ.isFetching ? <span className="ml-2">(atualizando…)</span> : null}
          </div>
        </div>

      </div>

      {itemsQ.isError && (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          Erro ao carregar itens: {(itemsQ.error as any)?.message ?? ""}
        </div>
      )}



      <div className="mt-4 rounded-2xl border border-slate-200">
        <div className="hidden grid-cols-[90px_1fr_70px_110px_80px_110px_40px] gap-2 bg-slate-50 px-3 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 sm:grid border-b border-slate-200">
          <div>ID / Ref</div>
          <div>Descrição do Produto / Serviço</div>
          <div className="text-right">Qtd</div>
          <div className="text-right">Unitário</div>
          <div className="text-right">Desc %</div>
          <div className="text-right">Total Líq.</div>
          <div className="text-right">Ações</div>
        </div>

        <div className="divide-y divide-slate-200 bg-white">
          {draft.map((row) => {
            const parsedQty = parsePtBrNumber(row.qty) ?? 0;
            const parsedPrice = parsePtBrNumber(row.price) ?? 0;
            const parsedDiscount = parsePtBrNumber(row.discount_percent) ?? 0;
            const total = computeRowTotal(parsedQty, parsedPrice, parsedDiscount);

            const product = row.offering_entity_id ? productsMap.get(row.offering_entity_id) : null;
            const hasConfigs = Array.isArray(product?.metadata?.configurations) && product.metadata.configurations.length > 0;

            return (
              <div key={`${row.id ?? "new"}:${row.line_no}`} className="px-3 py-3 relative z-auto">
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
                      <Label className="text-[11px] text-slate-600 font-bold uppercase tracking-tighter">Unitário</Label>
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
                      <Label className="text-[11px] text-amber-600 font-bold uppercase tracking-tighter">Desconto %</Label>
                      <Input
                        value={row.discount_percent}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((x) => (x.line_no === row.line_no ? { ...x, discount_percent: e.target.value } : x))
                          )
                        }
                        className="mt-1 h-10 rounded-2xl text-right tabular-nums bg-amber-50 border-amber-200"
                        inputMode="decimal"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-[11px] text-slate-600">Produto / Serviço</Label>
                    <div className="relative">
                      <Input
                        value={row.description}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDraft((prev) =>
                            prev.map((x) =>
                              x.line_no === row.line_no
                                ? { ...x, description: val, offering_entity_id: null, config_id: null }
                                : x
                            )
                          );
                          setSearchOffering(val);
                          setOpenOfferingPerLine((prev) => ({ ...prev, [`mob-${row.line_no}`]: true }));
                        }}
                        onFocus={() => {
                          setSearchOffering(row.description);
                          setOpenOfferingPerLine((prev) => ({ ...prev, [`mob-${row.line_no}`]: true }));
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setOpenOfferingPerLine((prev) => ({ ...prev, [`mob-${row.line_no}`]: false }));
                          }, 200);
                        }}
                        className={cn("mt-1 h-10 rounded-2xl", row.offering_entity_id && "pr-10")}
                        placeholder="Digite o nome do produto..."
                      />
                      {row.offering_entity_id && (
                         <Link to={`/app/inventory/${row.offering_entity_id}`} title="Abrir produto no inventário" className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-blue-600 transition-colors mt-0.5">
                             <ExternalLink className="h-4 w-4" />
                         </Link>
                      )}
                      
                      {openOfferingPerLine[`mob-${row.line_no}`] && (
                        <div className="absolute left-0 right-0 top-full z-[100] mt-1 max-h-[220px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
                          {offeringsQ.isFetching && !filteredOfferings.length && (
                            <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                              <Loader2 className="h-3 w-3 animate-spin" /> Procurando...
                            </div>
                          )}
                          <div>
                            {filteredOfferings.map((opt: SearchOption) => (
                              <button
                                key={opt.key}
                                type="button"
                                className="w-full text-left rounded-none h-auto min-h-12 py-2 px-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                                onClick={() => {
                                  setDraft((prev) =>
                                    prev.map((x) =>
                                      x.line_no === row.line_no
                                        ? {
                                            ...x,
                                            code: opt.code || x.code,
                                            description: opt.display_name,
                                            offering_entity_id: opt.offering.id,
                                            config_id: opt.configId,
                                            price: opt.price ? opt.price.replace(/\./g, ",") : x.price
                                          }
                                        : x
                                    )
                                  );
                                  setOpenOfferingPerLine((prev) => ({ ...prev, [`mob-${row.line_no}`]: false }));
                                  setSearchOffering("");
                                }}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex flex-col gap-0.5">
                                    <div className="text-sm font-medium text-slate-900 leading-snug">
                                      {opt.display_name}
                                    </div>
                                    {opt.code && (
                                      <div className="text-[11px] text-slate-500 font-mono">
                                        {opt.code}
                                      </div>
                                    )}
                                  </div>
                                  {row.offering_entity_id === opt.offering.id && row.config_id === opt.configId && (
                                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                                  )}
                                </div>
                              </button>
                            ))}
                            {!offeringsQ.isFetching && filteredOfferings.length === 0 && (
                              <div className="p-4 flex flex-col items-center gap-3 text-center">
                                <div className="text-xs text-slate-500">
                                  Nenhum produto encontrado para "{searchOffering}".
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-9 rounded-xl border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold px-4"
                                  onClick={() => {
                                    setQuickCreate({ open: true, name: searchOffering, lineNo: row.line_no });
                                    setOpenOfferingPerLine((prev) => ({ ...prev, [`mob-${row.line_no}`]: false, [`desk-${row.line_no}`]: false }));
                                  }}
                                >
                                  <Plus className="mr-2 h-3 w-3" /> Cadastrar este produto
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {hasConfigs && (
                      <div className="mt-2">
                        <Label className="text-[11px] text-slate-600 font-bold uppercase tracking-tighter">Variação/Configuração</Label>
                        <Select
                          value={row.config_id || "unselected"}
                          onValueChange={(val) => {
                            const cfgId = val === "unselected" ? null : val;
                            const selectedConfig = product.metadata.configurations.find((c: any) => c.id === cfgId);
                            setDraft((prev) =>
                              prev.map((x) =>
                                x.line_no === row.line_no
                                  ? {
                                      ...x,
                                      config_id: cfgId,
                                      price: selectedConfig?.price_sale != null ? String(selectedConfig.price_sale).replace(/\./g, ",") : x.price,
                                      code: selectedConfig?.internal_code || x.code
                                    }
                                  : x
                              )
                            );
                          }}
                        >
                          <SelectTrigger className="h-10 w-full rounded-2xl text-xs bg-slate-50 border-slate-200 mt-1">
                            <SelectValue placeholder="Selecione a variação..." />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="unselected" disabled className="text-xs">Selecione a variação...</SelectItem>
                            {product.metadata.configurations.map((cfg: any) => (
                              <SelectItem key={cfg.id} value={cfg.id} className="text-xs rounded-lg">
                                {cfg.name} (Loja: {cfg.estoque_loja || 0}) {cfg.price_sale ? `- R$ ${cfg.price_sale}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
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
                <div className="hidden grid-cols-[90px_1fr_70px_110px_80px_110px_40px] items-center gap-2 sm:grid">
                  <div>
                    <Input
                      value={row.code}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev.map((x) => (x.line_no === row.line_no ? { ...x, code: e.target.value } : x))
                        )
                      }
                      className="h-10 rounded-xl bg-slate-50/50 border-slate-200 text-xs font-mono"
                      placeholder="ID"
                    />
                  </div>

                  <div className="relative">
                    <Input
                      value={row.description}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraft((prev) =>
                          prev.map((x) =>
                            x.line_no === row.line_no
                              ? { ...x, description: val, offering_entity_id: null, config_id: null }
                              : x
                          )
                        );
                        setSearchOffering(val);
                        setOpenOfferingPerLine((prev) => ({ ...prev, [`desk-${row.line_no}`]: true }));
                      }}
                      onFocus={() => {
                        setSearchOffering(row.description);
                        setOpenOfferingPerLine((prev) => ({ ...prev, [`desk-${row.line_no}`]: true }));
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setOpenOfferingPerLine((prev) => ({ ...prev, [`desk-${row.line_no}`]: false }));
                        }, 200);
                      }}
                      className={cn("h-10 rounded-xl text-sm border-slate-200", row.offering_entity_id && "pr-10")}
                      placeholder="Nome do produto ou serviço..."
                    />
                    {row.offering_entity_id && (
                       <Link to={`/app/inventory/${row.offering_entity_id}`} title="Abrir produto no inventário" className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center h-6 w-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-blue-600 transition-colors">
                           <ExternalLink className="h-3 w-3" />
                       </Link>
                    )}

                    {openOfferingPerLine[`desk-${row.line_no}`] && (
                      <div className="absolute left-0 right-0 top-full z-[100] mt-1 max-h-[260px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        {offeringsQ.isFetching && !filteredOfferings.length && (
                          <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" /> Procurando...
                          </div>
                        )}
                        <div>
                          {filteredOfferings.map((opt: SearchOption) => (
                            <button
                              key={opt.key}
                              type="button"
                              className="w-full text-left rounded-none h-auto min-h-12 py-2 px-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                              onClick={() => {
                                setDraft((prev) =>
                                  prev.map((x) =>
                                    x.line_no === row.line_no
                                      ? {
                                          ...x,
                                          code: opt.code || x.code,
                                          description: opt.display_name,
                                          offering_entity_id: opt.offering.id,
                                          config_id: opt.configId,
                                          price: opt.price ? opt.price.replace(/\./g, ",") : x.price
                                        }
                                      : x
                                  )
                                );
                                setOpenOfferingPerLine((prev) => ({ ...prev, [`desk-${row.line_no}`]: false }));
                                setSearchOffering("");
                              }}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex flex-col gap-0.5">
                                  <div className="text-sm font-medium text-slate-900 leading-snug">
                                    {opt.display_name}
                                  </div>
                                  {opt.code && (
                                    <div className="text-[11px] text-slate-500 font-mono">
                                      {opt.code}
                                    </div>
                                  )}
                                </div>
                                {row.offering_entity_id === opt.offering.id && row.config_id === opt.configId && (
                                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                                )}
                              </div>
                            </button>
                          ))}
                          {!offeringsQ.isFetching && filteredOfferings.length === 0 && (
                            <div className="p-4 flex flex-col items-center gap-3 text-center">
                              <div className="text-xs text-slate-500">
                                Nenhum produto encontrado para "{searchOffering}".
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-9 rounded-xl border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold px-4"
                                onClick={() => {
                                  setQuickCreate({ open: true, name: searchOffering, lineNo: row.line_no });
                                  setOpenOfferingPerLine((prev) => ({ ...prev, [`mob-${row.line_no}`]: false, [`desk-${row.line_no}`]: false }));
                                }}
                              >
                                <Plus className="mr-2 h-3 w-3" /> Cadastrar este produto
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {hasConfigs && (
                      <div className="mt-1.5">
                        <Select
                          value={row.config_id || "unselected"}
                          onValueChange={(val) => {
                            const cfgId = val === "unselected" ? null : val;
                            const selectedConfig = product.metadata.configurations.find((c: any) => c.id === cfgId);
                            setDraft((prev) =>
                              prev.map((x) =>
                                x.line_no === row.line_no
                                  ? {
                                      ...x,
                                      config_id: cfgId,
                                      price: selectedConfig?.price_sale != null ? String(selectedConfig.price_sale).replace(/\./g, ",") : x.price,
                                      code: selectedConfig?.internal_code || x.code
                                    }
                                  : x
                              )
                            );
                          }}
                        >
                          <SelectTrigger className="h-8 w-full rounded-xl text-xs bg-slate-50 border-slate-200">
                            <SelectValue placeholder="Selecione a variação..." />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="unselected" disabled className="text-xs">Selecione a variação...</SelectItem>
                            {product.metadata.configurations.map((cfg: any) => (
                              <SelectItem key={cfg.id} value={cfg.id} className="text-xs rounded-lg">
                                {cfg.name} (Loja: {cfg.estoque_loja || 0}) {cfg.price_sale ? `- R$ ${cfg.price_sale}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div>
                    <Input
                      value={row.qty}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev.map((x) => (x.line_no === row.line_no ? { ...x, qty: e.target.value } : x))
                        )
                      }
                      className="h-10 rounded-xl text-right tabular-nums border-slate-200"
                      inputMode="decimal"
                      placeholder="1"
                    />
                  </div>

                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={row.price}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev.map((x) => (x.line_no === row.line_no ? { ...x, price: e.target.value } : x))
                        )
                      }
                      className="h-10 rounded-xl text-right tabular-nums pl-7 border-slate-200"
                      inputMode="decimal"
                      placeholder="0,00"
                    />
                  </div>

                  <div>
                    <Input
                      value={row.discount_percent}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev.map((x) => (x.line_no === row.line_no ? { ...x, discount_percent: e.target.value } : x))
                        )
                      }
                      className="h-10 rounded-xl text-right tabular-nums bg-amber-50/50 border-amber-200 text-amber-700 font-medium"
                      inputMode="decimal"
                      placeholder="0"
                    />
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-black tabular-nums text-slate-900 whitespace-nowrap">
                      {moneyPtBr(total)}
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      onClick={() => removeRow(row)}
                      title="Remover item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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

      {commissionRules && (
        <div className="mt-4 flex items-center justify-between rounded-3xl bg-blue-50/40 p-5 border border-blue-100/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-400 mb-0.5">Performance Projeta</div>
              <div className="text-base font-black text-blue-900 tracking-tight">Comissão Estimada</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1 opacity-60">Ganhos do Vendedor</div>
            <div className="text-2xl font-black text-blue-700 tabular-nums tracking-tighter">
              {moneyPtBr(totalCommission)}
            </div>
          </div>
        </div>
      )}

      <QuickCreateProductDialog
        open={quickCreate.open}
        onOpenChange={(v) => setQuickCreate((p) => ({ ...p, open: v }))}
        tenantId={activeTenantId!}
        initialName={quickCreate.name}
        onCreated={(entity) => {
          if (quickCreate.lineNo != null) {
            setDraft((prev) =>
              prev.map((x) =>
                x.line_no === quickCreate.lineNo
                  ? {
                      ...x,
                      code: entity.metadata?.code || x.code,
                      description: entity.display_name,
                      offering_entity_id: entity.id,
                      config_id: null,
                      price: entity.metadata?.price_sale != null 
                        ? String(entity.metadata.price_sale).replace(/\./g, ",") 
                        : entity.metadata?.price != null 
                          ? String(entity.metadata.price).replace(/\./g, ",") 
                          : x.price
                    }
                  : x
              )
            );
          }
        }}
      />

      <div className="mt-8 pt-6 border-t border-slate-100 grid gap-4 sm:grid-cols-3 items-end relative z-20">
        <div>
          <Label className="text-xs font-semibold text-slate-700">Validade da proposta</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full mt-1 h-11 rounded-2xl justify-start text-left font-medium bg-white border-slate-200 hover:bg-slate-50 transition-colors shadow-sm",
                  !extraFields.proposal_validity_date_text && "text-slate-400"
                )}
              >
                <CalendarIcon className="mr-3 h-4 w-4 text-slate-400" />
                {extraFields.proposal_validity_date_text || <span>Selecionar data</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-[24px] border-slate-200 shadow-xl" align="start">
              <Calendar
                mode="single"
                selected={parseDateString(extraFields.proposal_validity_date_text)}
                onSelect={(date) => setExtraFields(p => ({ ...p, proposal_validity_date_text: date ? format(date, "dd/MM/yyyy") : "" }))}
                initialFocus
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label className="text-xs font-semibold text-slate-700">Data prevista para entrega</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full mt-1 h-11 rounded-2xl justify-start text-left font-medium bg-white border-slate-200 hover:bg-slate-50 transition-colors shadow-sm",
                  !extraFields.delivery_forecast_text && "text-slate-400"
                )}
              >
                <CalendarIcon className="mr-3 h-4 w-4 text-slate-400" />
                {extraFields.delivery_forecast_text || <span>Selecionar data</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-[24px] border-slate-200 shadow-xl" align="start">
              <Calendar
                mode="single"
                selected={parseDateString(extraFields.delivery_forecast_text)}
                onSelect={(date) => setExtraFields(p => ({ ...p, delivery_forecast_text: date ? format(date, "dd/MM/yyyy") : "" }))}
                initialFocus
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label className="text-xs font-semibold text-amber-700">Desconto Geral (%)</Label>
          <div className="flex items-center mt-1 shadow-sm rounded-2xl">
            <Input
              type="number"
              min="0"
              max="100"
              value={globalDiscountInput}
              onChange={(e) => setGlobalDiscountInput(e.target.value)}
              className="h-11 rounded-l-2xl rounded-r-none border-r-0 border-amber-200 bg-amber-50/30 text-amber-900 font-bold focus-visible:ring-amber-500"
              placeholder="0 a 100"
            />
            <Button
              onClick={() => {
                const pct = parsePtBrNumber(globalDiscountInput);
                if (pct === null || pct < 0 || pct > 100) {
                  showError("Desconto inválido. Use um número entre 0 e 100.");
                  return;
                }
                setDraft((prev) => prev.map((x) => ({ ...x, discount_percent: String(pct).replace(/\./g, ",") })));
                showSuccess(`Desconto de ${pct}% aplicado a todos os itens.`);
                setGlobalDiscountInput("");
              }}
              variant="outline"
              className="h-11 rounded-r-2xl rounded-l-none border border-l-0 border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-200 font-black px-5 transition-all"
            >
              Aplicar
            </Button>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 bg-white pt-5 border-t border-slate-100 z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-6">
        <Button type="button" variant="secondary" className="h-11 rounded-2xl" onClick={addRow}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar item
        </Button>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Total Geral</div>
            <div className="text-xl font-black tabular-nums text-slate-900 tracking-tight whitespace-nowrap">
              {moneyPtBr(grandTotal)}
            </div>
          </div>
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
    </div>
  );
}