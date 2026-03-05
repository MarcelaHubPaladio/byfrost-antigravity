import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { CheckSquare, Plus, Trash2 } from "lucide-react";
import { useSession } from "@/providers/SessionProvider";

type TaskRow = {
  id: string;
  tenant_id: string;
  case_id: string | null;
  title: string;
  status: string;
  created_at: string;
  meta_json: any;
  deleted_at: string | null;
};

const MAX_TASK_TITLE = 160;

function isDone(status: string) {
  const s = String(status ?? "").toLowerCase();
  return s === "done" || s === "completed" || s === "closed";
}

function fmtCompletedAt(meta: any) {
  const raw = meta?.completed_at ?? null;
  if (!raw) return null;
  try {
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString();
  } catch {
    return null;
  }
}

export function CaseTasksCard(props: { tenantId: string; caseId: string }) {
  const qc = useQueryClient();
  const { user } = useSession();
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);

  const tasksQ = useQuery({
    queryKey: ["tasks_case", props.tenantId, props.caseId],
    enabled: Boolean(props.tenantId && props.caseId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,tenant_id,case_id,title,status,created_at,meta_json,deleted_at")
        .eq("tenant_id", props.tenantId)
        .eq("case_id", props.caseId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as TaskRow[];
    },
  });

  const doneCount = useMemo(() => (tasksQ.data ?? []).filter((t) => isDone(t.status)).length, [tasksQ.data]);

  const logTimeline = async (message: string, meta_json: any = {}) => {
    await supabase.from("timeline_events").insert({
      tenant_id: props.tenantId,
      case_id: props.caseId,
      event_type: "task_updated",
      actor_type: "admin",
      actor_id: user?.id ?? null,
      message,
      meta_json,
      occurred_at: new Date().toISOString(),
    });
  };

  const add = async () => {
    const t = title.trim();
    if (!t) return;
    if (t.length > MAX_TASK_TITLE) {
      showError(`A tarefa pode ter no máximo ${MAX_TASK_TITLE} caracteres.`);
      return;
    }

    setAdding(true);
    try {
      const { error } = await supabase.from("tasks").insert({
        tenant_id: props.tenantId,
        case_id: props.caseId,
        title: t,
        status: "open",
        // CHECK constraint do banco: created_by in ('system','ai','admin')
        created_by: "admin",
        meta_json: { completed_at: null },
      });
      if (error) throw error;

      await logTimeline(`Tarefa criada: ${t}`, { action: "created", title: t });

      setTitle("");
      showSuccess("Tarefa criada.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["tasks_case", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
      ]);
    } catch (e: any) {
      showError(`Falha ao criar tarefa: ${e?.message ?? "erro"}`);
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (task: TaskRow) => {
    try {
      const next = isDone(task.status) ? "open" : "done";
      const now = new Date().toISOString();
      const nextMeta = {
        ...(task.meta_json ?? {}),
        completed_at: next === "done" ? now : null,
      };

      const { error } = await supabase
        .from("tasks")
        .update({ status: next, meta_json: nextMeta })
        .eq("tenant_id", props.tenantId)
        .eq("id", task.id);
      if (error) throw error;

      await logTimeline(`Tarefa ${next === "done" ? "concluída" : "reaberta"}: ${task.title}`, {
        action: "status",
        from: task.status,
        to: next,
        title: task.title,
        completed_at: next === "done" ? now : null,
      });

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["tasks_case", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
      ]);
    } catch (e: any) {
      showError(`Falha ao atualizar tarefa: ${e?.message ?? "erro"}`);
    }
  };

  const remove = async (task: TaskRow) => {
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("tenant_id", props.tenantId)
        .eq("id", task.id);
      if (error) throw error;

      await logTimeline(`Tarefa removida: ${task.title}`, { action: "deleted", title: task.title });

      showSuccess("Tarefa removida.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["tasks_case", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
      ]);
    } catch (e: any) {
      showError(`Falha ao remover tarefa: ${e?.message ?? "erro"}`);
    }
  };

  const remaining = MAX_TASK_TITLE - title.trim().length;

  return (
    <Card className="rounded-[22px] border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-100 text-slate-700">
            <CheckSquare className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Tarefas</div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {doneCount}/{(tasksQ.data ?? []).length} concluídas
            </div>
          </div>
        </div>
      </div>

      {tasksQ.isError && (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          Erro ao carregar tarefas: {(tasksQ.error as any)?.message ?? ""}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <div className="min-w-0 flex-1">
          <Input
            value={title}
            maxLength={MAX_TASK_TITLE}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="h-11 rounded-2xl"
            placeholder="Nova tarefa (ex: confirmar endereço)"
          />
          <div className={cn("mt-1 text-[11px]", remaining < 0 ? "text-rose-600" : "text-slate-500")}>
            {Math.max(0, remaining)} caracteres restantes
          </div>
        </div>
        <Button
          onClick={add}
          disabled={adding || !title.trim()}
          className={cn(
            "h-11 rounded-2xl px-4 text-white",
            "bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
          )}
        >
          <Plus className="mr-2 h-4 w-4" /> Adicionar
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {(tasksQ.data ?? []).map((t) => {
          const done = isDone(t.status);
          const completedAt = fmtCompletedAt(t.meta_json);
          return (
            <div
              key={t.id}
              className={cn(
                "rounded-2xl border px-3 py-2",
                done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggle(t)}
                  className="flex min-w-0 flex-1 items-start gap-3 overflow-hidden text-left"
                  title={t.title}
                >
                  <Checkbox checked={done} className="mt-0.5" />
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "text-sm font-medium leading-snug break-words whitespace-normal line-clamp-2",
                        done ? "text-emerald-900 line-through" : "text-slate-900"
                      )}
                    >
                      {t.title}
                    </div>
                    {done && completedAt ? (
                      <div className="mt-0.5 text-[11px] text-emerald-800/80">Concluída em {completedAt}</div>
                    ) : null}
                  </div>
                </button>

                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 w-9 rounded-2xl p-0"
                  onClick={() => remove(t)}
                  title="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}