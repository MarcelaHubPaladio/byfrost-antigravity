import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { showError, showSuccess } from "@/utils/toast";

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function severityBadgeClass(sev: string) {
  const s = String(sev ?? "").toLowerCase();
  if (s === "high") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200";
  if (s === "medium") return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200";
  return "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-200";
}

export function FinancialDecisionsPanel() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  const cardsQ = useQuery({
    queryKey: ["financial_decision_cards", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_decision_cards")
        .select(
          "id,tenant_id,tension_event_id,title,description,severity,recommended_actions,status,owner,due_date,created_at"
        )
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const updateStatusM = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const { error } = await supabase
        .from("financial_decision_cards")
        .update({ status })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["financial_decision_cards", activeTenantId] });
      showSuccess("Status atualizado.");
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao atualizar"),
  });

  const actionsTextByCardId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cardsQ.data ?? []) {
      const arr = Array.isArray(c.recommended_actions) ? c.recommended_actions : [];
      const text = arr
        .map((a: any) => {
          const title = String(a?.title ?? "ação");
          const detail = String(a?.detail ?? "");
          return detail ? `• ${title}: ${detail}` : `• ${title}`;
        })
        .join("\n");
      m.set(c.id, text);
    }
    return m;
  }, [cardsQ.data]);

  return (
    <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cards de decisão</div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Um card só é criado quando existe ação possível (ex.: cobrar recebível, renegociar pagável, reduzir custo etc.).
          </div>
        </div>
        <Button variant="secondary" className="h-9 rounded-2xl" onClick={() => cardsQ.refetch()}>
          Atualizar
        </Button>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Criado em</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Severidade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações recomendadas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(cardsQ.data ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell className="whitespace-nowrap text-xs">{formatDateTime(c.created_at)}</TableCell>
                <TableCell className="min-w-[260px]">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{c.title}</div>
                  <div className="mt-1 whitespace-pre-wrap text-[11px] text-slate-600 dark:text-slate-300">
                    {c.description}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${severityBadgeClass(c.severity)}`}>
                    {c.severity}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  <Select value={c.status} onValueChange={(v) => updateStatusM.mutate({ id: c.id, status: v })}>
                    <SelectTrigger className="h-9 w-[160px] rounded-2xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">open</SelectItem>
                      <SelectItem value="in_progress">in_progress</SelectItem>
                      <SelectItem value="resolved">resolved</SelectItem>
                      <SelectItem value="ignored">ignored</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="min-w-[360px] whitespace-pre-wrap text-[11px] text-slate-700 dark:text-slate-200">
                  {actionsTextByCardId.get(c.id) || "—"}
                </TableCell>
              </TableRow>
            ))}

            {!cardsQ.isLoading && !(cardsQ.data ?? []).length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-xs text-slate-600 dark:text-slate-400">
                  Nenhum card ainda.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
