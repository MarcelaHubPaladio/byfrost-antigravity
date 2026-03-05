import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";

const COLUMNS = [
  { key: "CRITICO", label: "Crítico", hint: "decidir hoje" },
  { key: "ATENCAO", label: "Atenção", hint: "acompanhar" },
  { key: "ESTRATEGICO", label: "Estratégico", hint: "planejar" },
  { key: "RESOLVIDO", label: "Resolvido", hint: "concluído" },
] as const;

type BoardColumn = (typeof COLUMNS)[number]["key"];

type DecisionCardRow = {
  id: string;
  tenant_id: string;
  tension_event_id: string;
  title: string;
  description: string;
  severity: string;
  recommended_actions: any;
  status: "open" | "in_progress" | "resolved" | "ignored";
  board_column: BoardColumn | null;
  board_order: number | null;
  created_at: string;
};

function formatScore(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toFixed(1);
}

function firstActionText(actions: any) {
  if (!Array.isArray(actions) || actions.length === 0) return null;
  const a = actions[0];
  const t = String(a?.title ?? "").trim();
  const d = String(a?.detail ?? "").trim();
  if (!t && !d) return null;
  return d ? `${t}: ${d}` : t;
}

function columnStyles(col: BoardColumn) {
  if (col === "CRITICO") return "border-red-200/70 bg-red-50/40 dark:border-red-950/60 dark:bg-red-950/20";
  if (col === "ATENCAO") return "border-amber-200/70 bg-amber-50/40 dark:border-amber-950/60 dark:bg-amber-950/20";
  if (col === "ESTRATEGICO") return "border-slate-200/70 bg-white/30 dark:border-slate-800 dark:bg-slate-950/20";
  return "border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-950/60 dark:bg-emerald-950/20";
}

function normalizeColumnFromRow(r: DecisionCardRow): BoardColumn {
  if (r.board_column) return r.board_column;
  if (r.status === "resolved" || r.status === "ignored") return "RESOLVIDO";
  const s = String(r.severity ?? "").toLowerCase();
  if (s === "high") return "CRITICO";
  if (s === "medium") return "ATENCAO";
  return "ESTRATEGICO";
}

export function FinancialDecisionBoard() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);

  const cardsQ = useQuery({
    queryKey: ["financial_decision_cards_board", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 25_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_decision_cards")
        .select(
          "id,tenant_id,tension_event_id,title,description,severity,recommended_actions,status,board_column,board_order,created_at"
        )
        .eq("tenant_id", activeTenantId!)
        .order("board_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as DecisionCardRow[];
    },
  });

  const eventIds = useMemo(() => (cardsQ.data ?? []).map((c) => c.tension_event_id), [cardsQ.data]);

  const scoresQ = useQuery({
    queryKey: ["tension_scores_for_board", activeTenantId, eventIds.join(",")],
    enabled: Boolean(activeTenantId && eventIds.length > 0),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tension_scores")
        .select("tension_event_id,impact_score,urgency_score,final_score")
        .in("tension_event_id", eventIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const scoreByEvent = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of scoresQ.data ?? []) m.set(s.tension_event_id, s);
    return m;
  }, [scoresQ.data]);

  const cardsByColumn = useMemo(() => {
    const by = new Map<BoardColumn, DecisionCardRow[]>();
    for (const c of COLUMNS) by.set(c.key, []);

    for (const row of cardsQ.data ?? []) {
      const col = normalizeColumnFromRow(row);
      by.get(col)!.push(row);
    }

    for (const col of COLUMNS) {
      by.get(col.key)!.sort((a, b) => {
        const ao = Number(a.board_order ?? 0);
        const bo = Number(b.board_order ?? 0);
        if (ao !== bo) return ao - bo;
        return String(a.created_at).localeCompare(String(b.created_at));
      });
    }

    return by;
  }, [cardsQ.data]);

  const moveM = useMutation({
    mutationFn: async ({ cardId, toColumn }: { cardId: string; toColumn: BoardColumn }) => {
      if (!activeTenantId) throw new Error("Tenant inválido");

      const card = (cardsQ.data ?? []).find((c) => c.id === cardId);
      if (!card) throw new Error("Card não encontrado");

      const fromColumn = normalizeColumnFromRow(card);
      if (fromColumn === toColumn) return;

      // Persist board state + keep status/severity consistent.
      const nowOrder = Date.now();

      const next: any = {
        board_column: toColumn,
        board_order: nowOrder,
      };

      if (toColumn === "RESOLVIDO") {
        next.status = "resolved";
      } else {
        // moving back from resolved/ignored reopens
        if (card.status === "resolved" || card.status === "ignored") next.status = "open";

        if (toColumn === "CRITICO") next.severity = "high";
        if (toColumn === "ATENCAO") next.severity = "medium";
        if (toColumn === "ESTRATEGICO") next.severity = "low";
      }

      const { error } = await supabase
        .from("financial_decision_cards")
        .update(next)
        .eq("tenant_id", activeTenantId)
        .eq("id", cardId);
      if (error) throw error;

      // Audit trail
      await supabase.from("decision_logs").insert({
        tenant_id: activeTenantId,
        case_id: null,
        agent_id: null,
        input_summary: "Movimentação no quadro de decisões",
        output_summary: `${fromColumn} → ${toColumn}`,
        reasoning_public: "Mudança persistida via drag-and-drop no quadro financeiro.",
        why_json: {
          kind: "financial_decision_board_move",
          card_id: cardId,
          from_column: fromColumn,
          to_column: toColumn,
          from_status: card.status,
          to_status: next.status ?? card.status,
          from_severity: card.severity,
          to_severity: next.severity ?? card.severity,
        },
        confidence_json: { overall: 1, method: "user_action" },
        occurred_at: new Date().toISOString(),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["financial_decision_cards_board", activeTenantId] });
      showSuccess("Movimento salvo.");
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao mover"),
  });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          Arraste cards entre colunas. Impacto/urgência vêm do score da tensão.
        </div>
        <Button variant="secondary" className="h-9 rounded-2xl" onClick={() => cardsQ.refetch()}>
          Atualizar
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = cardsByColumn.get(col.key) ?? [];
          return (
            <Card
              key={col.key}
              className={cn(
                "rounded-[22px] border p-3 shadow-sm backdrop-blur",
                "bg-white/70 dark:bg-slate-950/40",
                columnStyles(col.key)
              )}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (!id) return;
                moveM.mutate({ cardId: id, toColumn: col.key });
                setDragId(null);
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{col.label}</div>
                  <div className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">{col.hint}</div>
                </div>
                <div className="rounded-full border border-slate-200 bg-white/60 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
                  {items.length}
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                {items.map((c) => {
                  const score = scoreByEvent.get(c.tension_event_id);
                  const action = firstActionText(c.recommended_actions);

                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", c.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(c.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      className={cn(
                        "rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition",
                        "dark:border-slate-800 dark:bg-slate-950/30",
                        dragId === c.id && "opacity-60"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{c.title}</div>
                        <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                          {formatScore(score?.final_score)}
                        </div>
                      </div>

                      <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-xl bg-slate-50 px-2 py-1 text-slate-700 dark:bg-slate-900/30 dark:text-slate-200">
                          Impacto: <span className="font-semibold">{formatScore(score?.impact_score)}</span>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-2 py-1 text-slate-700 dark:bg-slate-900/30 dark:text-slate-200">
                          Urgência: <span className="font-semibold">{formatScore(score?.urgency_score)}</span>
                        </div>
                      </div>

                      <div className="mt-2 whitespace-pre-wrap text-[11px] text-slate-600 dark:text-slate-300">
                        {String(c.description ?? "").slice(0, 280)}
                        {String(c.description ?? "").length > 280 ? "…" : ""}
                      </div>

                      {action ? (
                        <div className="mt-2 rounded-xl border border-slate-200 bg-white/60 px-2 py-2 text-[11px] text-slate-800 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100">
                          <div className="font-semibold">Ação sugerida</div>
                          <div className="mt-0.5 text-slate-600 dark:text-slate-300">{action}</div>
                        </div>
                      ) : null}

                      <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                        {c.status} • {c.severity}
                      </div>
                    </div>
                  );
                })}

                {!cardsQ.isLoading && items.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/40 px-3 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/20 dark:text-slate-400">
                    Sem cards.
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      {cardsQ.isError || scoresQ.isError ? (
        <div className="text-xs text-red-600 dark:text-red-300">Falha ao carregar o quadro.</div>
      ) : null}
    </div>
  );
}