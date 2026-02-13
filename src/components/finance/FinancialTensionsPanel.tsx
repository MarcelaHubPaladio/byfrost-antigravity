import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatMoneyBRL(n: number | null | undefined) {
  const x = Number(n ?? 0);
  try {
    return x.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${x.toFixed(2)}`;
  }
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

export function FinancialTensionsPanel() {
  const { activeTenantId } = useTenant();

  const eventsQ = useQuery({
    queryKey: ["tension_events", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 8000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tension_events")
        .select("id,tenant_id,tension_type,reference_id,description,detected_at")
        .eq("tenant_id", activeTenantId!)
        .order("detected_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const eventIds = useMemo(() => (eventsQ.data ?? []).map((e) => e.id), [eventsQ.data]);

  const scoresQ = useQuery({
    queryKey: ["tension_scores", activeTenantId, eventIds.join(",")],
    enabled: Boolean(activeTenantId && eventIds.length > 0),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tension_scores")
        .select("tension_event_id,impact_score,urgency_score,cascade_score,final_score")
        .in("tension_event_id", eventIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const scoreByEventId = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of scoresQ.data ?? []) m.set(s.tension_event_id, s);
    return m;
  }, [scoresQ.data]);

  return (
    <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tensões detectadas</div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Geradas por varreduras assíncronas (cron + job queue). Apenas tensões com impacto financeiro real são registradas.
          </div>
        </div>
        <Button variant="secondary" className="h-9 rounded-2xl" onClick={() => eventsQ.refetch()}>
          Atualizar
        </Button>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Detectado em</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Score final</TableHead>
              <TableHead>Impacto</TableHead>
              <TableHead>Urgência</TableHead>
              <TableHead>Explicação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(eventsQ.data ?? []).map((e) => {
              const s = scoreByEventId.get(e.id);
              return (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(e.detected_at)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs font-medium">{e.tension_type}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs font-semibold">
                    {s?.final_score != null ? Number(s.final_score).toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {s?.impact_score != null ? Number(s.impact_score).toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {s?.urgency_score != null ? Number(s.urgency_score).toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="min-w-[360px] text-xs">
                    <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{e.description}</div>
                  </TableCell>
                </TableRow>
              );
            })}

            {!eventsQ.isLoading && !(eventsQ.data ?? []).length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-xs text-slate-600 dark:text-slate-400">
                  Nenhuma tensão detectada ainda.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
        Dica: para gerar tensões, o tenant precisa ter transações (ledger) e/ou contas a pagar/receber e orçamento.
      </div>
    </Card>
  );
}
