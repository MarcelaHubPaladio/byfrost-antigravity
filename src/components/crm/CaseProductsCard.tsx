import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BadgeDollarSign, Check, ChevronsUpDown, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useSession } from "@/providers/SessionProvider";

type CaseItemRow = {
  id: string;
  case_id: string;
  line_no: number;
  description: string | null;
  qty: number | null;
  price: number | null;
  total: number | null;
  offering_entity_id?: string | null;
  created_at: string;
};

function toMoney(v: number) {
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${v.toFixed(2)}`;
  }
}

function parseMoney(s: string) {
  const raw = (s ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (Number.isNaN(n)) return null;
  return n;
}

export function CaseProductsCard(props: { tenantId: string; caseId: string }) {
  const qc = useQueryClient();
  const { user } = useSession();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [adding, setAdding] = useState(false);

  const [entityId, setEntityId] = useState<string | null>(null);
  const [openOffering, setOpenOffering] = useState(false);
  const [searchOffering, setSearchOffering] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchOffering), 300);
    return () => clearTimeout(t);
  }, [searchOffering]);

  const offeringsQ = useQuery({
    queryKey: ["crm_offerings_search", props.tenantId, debouncedSearch],
    enabled: Boolean(props.tenantId),
    queryFn: async () => {
      let q = supabase
        .from("core_entities")
        .select("id, display_name")
        .eq("tenant_id", props.tenantId)
        .eq("entity_type", "offering")
        .is("deleted_at", null)
        .order("display_name", { ascending: true })
        .limit(20);

      if (debouncedSearch) {
        q = q.ilike("display_name", `%${debouncedSearch}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const itemsQ = useQuery({
    queryKey: ["crm_case_items", props.tenantId, props.caseId],
    enabled: Boolean(props.tenantId && props.caseId),
    refetchInterval: 9000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_items")
        .select("id,case_id,line_no,description,qty,price,total,offering_entity_id,created_at")
        .eq("tenant_id", props.tenantId)
        .eq("case_id", props.caseId)
        .order("line_no", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CaseItemRow[];
    },
  });

  const sum = useMemo(() => {
    let s = 0;
    for (const it of itemsQ.data ?? []) {
      const t = it.total ?? ((it.qty ?? 1) * (it.price ?? 0));
      s += Number(t) || 0;
    }
    return s;
  }, [itemsQ.data]);

  const nextLineNo = useMemo(() => {
    const max = Math.max(0, ...(itemsQ.data ?? []).map((x) => Number(x.line_no) || 0));
    return max + 1;
  }, [itemsQ.data]);

  const logTimeline = async (message: string, meta_json: any = {}) => {
    await supabase.from("timeline_events").insert({
      tenant_id: props.tenantId,
      case_id: props.caseId,
      event_type: "products_updated",
      actor_type: "admin",
      actor_id: user?.id ?? null,
      message,
      meta_json,
      occurred_at: new Date().toISOString(),
    });
  };

  const add = async () => {
    const d = name.trim();
    const p = parseMoney(price);
    if (!d) {
      showError("Informe o nome do produto/serviço.");
      return;
    }
    if (p == null || p < 0) {
      showError("Informe um preço válido.");
      return;
    }

    setAdding(true);
    try {
      const qty = 1;
      const { error } = await supabase.from("case_items").insert({
        tenant_id: props.tenantId,
        case_id: props.caseId,
        line_no: nextLineNo,
        description: d,
        qty,
        price: p,
        total: qty * p,
        offering_entity_id: entityId,
        confidence_json: {},
      });
      if (error) throw error;

      await logTimeline(`Item adicionado: ${d} (${toMoney(p)})`, { action: "created", description: d, price: p });

      setName("");
      setPrice("");
      setEntityId(null);
      setSearchOffering("");
      showSuccess("Item adicionado.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["crm_case_items", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
      ]);
    } catch (e: any) {
      showError(`Falha ao adicionar item: ${e?.message ?? "erro"}`);
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const it = (itemsQ.data ?? []).find((x) => x.id === id);
      const { error } = await supabase
        .from("case_items")
        .delete()
        .eq("tenant_id", props.tenantId)
        .eq("id", id);
      if (error) throw error;

      await logTimeline(`Item removido: ${it?.description ?? `#${it?.line_no ?? ""}`}`, {
        action: "deleted",
        description: it?.description,
        line_no: it?.line_no,
      });

      showSuccess("Item removido.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["crm_case_items", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
      ]);
    } catch (e: any) {
      showError(`Falha ao remover item: ${e?.message ?? "erro"}`);
    }
  };

  return (
    <Card className="rounded-[22px] border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-100 text-slate-700">
            <BadgeDollarSign className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Produtos / Serviços</div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              Potencial de venda: <span className="font-semibold text-slate-900">{toMoney(sum)}</span>
            </div>
          </div>
        </div>
      </div>

      {itemsQ.isError && (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          Erro ao carregar itens: {(itemsQ.error as any)?.message ?? ""}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px_auto]">
        <div>
          <Label className="text-xs">Nome / Produto</Label>
          <Popover open={openOffering} onOpenChange={setOpenOffering}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openOffering}
                className="mt-1 flex h-11 w-full justify-between items-center rounded-2xl border-slate-200 px-3 py-2 font-normal text-slate-900 bg-white"
              >
                <div className="truncate text-sm">
                  {name ? name : <span className="text-slate-500">Ex: Produto X</span>}
                </div>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] rounded-2xl p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Buscar ou criar novo..."
                  value={searchOffering}
                  onValueChange={setSearchOffering}
                />
                <CommandList>
                  <CommandEmpty>
                    <div className="p-3 text-sm text-slate-500">
                      Nenhum produto listado.
                      {searchOffering && (
                        <div className="mt-2">
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-8 rounded-xl px-3 text-xs w-full"
                            onClick={() => {
                              setName(searchOffering);
                              setEntityId(null);
                              setOpenOffering(false);
                            }}
                          >
                            Utilizar "{searchOffering}"
                          </Button>
                        </div>
                      )}
                    </div>
                  </CommandEmpty>
                  {offeringsQ.data?.map((off) => (
                    <CommandItem
                      key={off.id}
                      value={off.id}
                      onSelect={() => {
                        setName(off.display_name);
                        setEntityId(off.id);
                        setOpenOffering(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", entityId === off.id ? "opacity-100" : "opacity-0")} />
                      {off.display_name}
                    </CommandItem>
                  ))}
                  {offeringsQ.data && offeringsQ.data.length > 0 && searchOffering && !offeringsQ.data.find(o => o.display_name.toLowerCase() === searchOffering.toLowerCase()) && (
                    <CommandItem
                      value={`custom-${searchOffering}`}
                      onSelect={() => {
                        setName(searchOffering);
                        setEntityId(null);
                        setOpenOffering(false);
                      }}
                      className="border-t border-slate-100 text-slate-600 mt-1"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Utilizar "{searchOffering}" livremente
                    </CommandItem>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label className="text-xs">Preço (R$)</Label>
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 h-11 rounded-2xl"
            placeholder="1500,00"
            inputMode="decimal"
          />
        </div>
        <div className="flex items-end">
          <Button
            onClick={add}
            disabled={adding || !name.trim() || !price.trim()}
            className={cn(
              "h-11 rounded-2xl px-4 text-white",
              "bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
            )}
          >
            <Plus className="mr-2 h-4 w-4" /> Adicionar
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {(itemsQ.data ?? []).map((it) => {
          const qty = it.qty ?? 1;
          const unit = it.price ?? 0;
          const total = it.total ?? qty * unit;
          const entityId = it.offering_entity_id ?? null;

          return (
            <div
              key={it.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {it.description ?? `Item #${it.line_no}`}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                  <span>
                    {qty} × {toMoney(unit)} • <span className="font-semibold">{toMoney(total)}</span>
                  </span>

                  {entityId ? (
                    <Link
                      to={`/app/entities/${encodeURIComponent(entityId)}`}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-50"
                      title="Abrir entidade do produto/serviço"
                    >
                      entidade <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="h-9 w-9 rounded-2xl p-0"
                onClick={() => remove(it.id)}
                title="Remover"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}

        {(itemsQ.data ?? []).length === 0 && !itemsQ.isError && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
            Adicione um produto ou serviço para estimar o valor desse case.
          </div>
        )}
      </div>

      <div className="mt-3 text-[11px] text-slate-500">
        Observação: cada item do CRM também é sincronizado com o módulo Entidades (core_entities) como offering.
      </div>
    </Card>
  );
}