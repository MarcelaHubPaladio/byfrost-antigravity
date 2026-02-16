import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export type CommitmentItemDraft = {
  offering_entity_id: string;
  quantity: number;
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
}: {
  tenantId: string;
  items: CommitmentItemDraft[];
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
  }, [qs.map((q) => q.data)]);

  const flat = useMemo(() => {
    const out: Array<{ offeringId: string; template: TemplateRow }> = [];
    for (const it of items) {
      const rows = templatesByOffering.get(it.offering_entity_id) ?? [];
      for (const t of rows) out.push({ offeringId: it.offering_entity_id, template: t });
    }
    return out;
  }, [items, templatesByOffering]);

  const totals = useMemo(() => {
    const byType = new Map<string, number>();
    for (const x of flat) {
      const k = String(x.template.required_resource_type ?? "(sem tipo)");
      const m = Number(x.template.estimated_minutes ?? 0);
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
                <div key={rt} className="flex items-center justify-between rounded-xl border bg-white px-3 py-2">
                  <div className="text-sm font-semibold text-slate-800">{rt}</div>
                  <div className="text-sm text-slate-700">{mins} min</div>
                </div>
              ))}
            </div>

            <div className="divide-y rounded-xl border bg-white">
              {flat.map((x) => (
                <div key={`${x.offeringId}:${x.template.id}`} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{x.template.name}</div>
                    <div className="text-xs text-slate-600">{x.template.required_resource_type ?? "—"}</div>
                  </div>
                  <div className="text-sm text-slate-700">{Number(x.template.estimated_minutes ?? 0)} min</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
