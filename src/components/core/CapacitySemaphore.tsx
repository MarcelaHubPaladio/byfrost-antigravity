import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";

type ProjectionRow = {
  day: string;
  demand_minutes: number;
  capacity_minutes: number;
  delta_minutes: number;
  deliverables_count: number;
  resources_count: number;
};

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function CapacitySemaphore({
  tenantId,
  extraDemandMinutes = 0,
  extraDemandOnDate,
}: {
  tenantId: string;
  extraDemandMinutes?: number;
  extraDemandOnDate?: string; // YYYY-MM-DD
}) {
  const now = new Date();
  const start = toIsoDate(now);
  const end = toIsoDate(addDays(now, 14));

  const q = useQuery({
    queryKey: ["capacity_projection", tenantId, start, end],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("capacity_projection", {
        p_tenant_id: tenantId,
        p_start_date: start,
        p_end_date: end,
        p_resource_type: null,
      });
      if (error) throw error;
      return (data ?? []) as ProjectionRow[];
    },
    staleTime: 10_000,
  });

  const rows = q.data ?? [];

  const worst = useMemo(() => {
    if (!rows.length) return null;
    const adjusted = rows.map((r) => {
      const extra = extraDemandOnDate && r.day === extraDemandOnDate ? extraDemandMinutes : 0;
      const demand = Number(r.demand_minutes ?? 0) + Number(extra ?? 0);
      const capacity = Number(r.capacity_minutes ?? 0);
      const delta = capacity - demand;
      return { ...r, demand_minutes: demand, delta_minutes: delta };
    });

    let min = adjusted[0];
    for (const r of adjusted) {
      if (r.delta_minutes < min.delta_minutes) min = r;
    }
    return min;
  }, [rows, extraDemandMinutes, extraDemandOnDate]);

  if (q.isLoading) return <Badge variant="secondary">Capacidade: …</Badge>;
  if (q.isError) return <Badge variant="destructive">Capacidade indisponível</Badge>;
  if (!worst) return <Badge variant="secondary">Sem dados</Badge>;

  const delta = Number(worst.delta_minutes);

  // Simple UX: green / yellow / red. No overdesign.
  if (delta < 0) return <Badge variant="destructive">Semáforo: vermelho</Badge>;
  if (delta < 120) return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Semáforo: amarelo</Badge>;
  return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Semáforo: verde</Badge>;
}
