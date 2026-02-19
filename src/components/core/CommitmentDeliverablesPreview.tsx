import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type CommitmentItemRow = {
  id: string;
  offering_entity_id: string;
  quantity: number;
  metadata?: any;
};

type TemplateRow = {
  id: string;
  name: string;
  estimated_minutes: number | null;
  required_resource_type: string | null;
};

export function CommitmentDeliverablesPreview({
  tenantId,
  items,
  onUpdateMetadata,
}: {
  tenantId: string;
  items: CommitmentItemRow[];
  onUpdateMetadata?: (itemId: string, metadata: any) => void;
}) {
  const uniqueOfferings = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.offering_entity_id) s.add(it.offering_entity_id);
    return Array.from(s);
  }, [items]);

  const qs = useQueries({
    queries: uniqueOfferings.map((offeringId) => ({
      queryKey: ["deliverable_templates", tenantId, offeringId],
      enabled: Boolean(tenantId && offeringId),
      queryFn: async () => {
        const { data, error } = await supabase
          .from("deliverable_templates")
          .select("id,name,estimated_minutes,required_resource_type")
          .eq("tenant_id", tenantId)
          .eq("offering_entity_id", offeringId)
          .is("deleted_at", null)
          .order("created_at", { ascending: true });
        if (error) throw error;
        return { offeringId, rows: (data ?? []) as TemplateRow[] };
      },
      staleTime: 10_000,
    })),
  });

  const loading = qs.some((q) => q.isLoading);

  const templatesByOffering = useMemo(() => {
    const m = new Map<string, TemplateRow[]>();
    for (const q of qs) {
      const v = q.data as any;
      if (v?.offeringId) m.set(String(v.offeringId), (v.rows ?? []) as TemplateRow[]);
    }
    return m;
  }, [qs]);

  const flat = useMemo(() => {
    const out: Array<{ item: CommitmentItemRow; template: TemplateRow }> = [];
    for (const it of items) {
      const rows = templatesByOffering.get(it.offering_entity_id) ?? [];
      for (const t of rows) out.push({ item: it, template: t });
    }
    return out;
  }, [items, templatesByOffering]);

  const handleUpdateQty = (itemId: string, templateId: string, val: number) => {
    const it = items.find((i) => i.id === itemId);
    if (!it || !onUpdateMetadata) return;

    const currentMetadata = it.metadata ?? {};
    const overrides = currentMetadata.deliverable_overrides ?? {};

    onUpdateMetadata(itemId, {
      ...currentMetadata,
      deliverable_overrides: {
        ...overrides,
        [templateId]: { quantity: val },
      },
    });
  };

  const totals = useMemo(() => {
    const byType = new Map<string, number>();
    for (const x of flat) {
      const k = String(x.template.required_resource_type ?? "(sem tipo)");
      const templateId = x.template.id;
      const overrideQty = x.item.metadata?.deliverable_overrides?.[templateId]?.quantity;
      const qty = typeof overrideQty === "number" ? overrideQty : Number(x.item.quantity ?? 1);
      const m = Number(x.template.estimated_minutes ?? 0) * qty;
      byType.set(k, (byType.get(k) ?? 0) + m);
    }
    return Array.from(byType.entries()).sort((a, b) => b[1] - a[1]);
  }, [flat]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Prévia de deliverables</Badge>
        {loading ? <span className="text-xs text-slate-600">carregando…</span> : null}
      </div>

      <Card className="rounded-2xl border-slate-200 p-4">
        {flat.length === 0 && !loading ? (
          <div className="text-sm text-slate-600">Nenhum template encontrado para os itens selecionados.</div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              {totals.map(([rt, mins]) => (
                <div key={rt} className="flex items-center justify-between rounded-xl border bg-white px-3 py-2 shadow-sm">
                  <div className="text-sm font-semibold text-slate-800">{rt}</div>
                  <div className="text-sm font-medium text-[hsl(var(--byfrost-accent))]">{mins} min</div>
                </div>
              ))}
            </div>

            <div className="divide-y rounded-xl border bg-white shadow-sm overflow-hidden">
              {flat.map((x) => {
                const templateId = x.template.id;
                const overrideQty = x.item.metadata?.deliverable_overrides?.[templateId]?.quantity;
                const qty = typeof overrideQty === "number" ? overrideQty : Number(x.item.quantity ?? 1);

                return (
                  <div key={`${x.item.id}:${templateId}`} className="group flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-14">
                        <Input
                          type="number"
                          min={0}
                          value={qty}
                          onChange={(e) => handleUpdateQty(x.item.id, templateId, Number(e.target.value))}
                          className="h-8 rounded-lg text-center px-1 font-semibold"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{x.template.name}</div>
                        <div className="text-[10px] text-slate-500 uppercase font-medium">{x.template.required_resource_type ?? "Geral"}</div>
                      </div>
                    </div>
                    <div className="text-sm font-medium text-slate-600 shrink-0">
                      {Number(x.template.estimated_minutes ?? 0) * qty} min
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
