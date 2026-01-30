import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { NotebookPen, Plus, Trash2 } from "lucide-react";

type NoteRow = {
  id: string;
  tenant_id: string;
  case_id: string;
  body: string;
  created_by_user_id: string | null;
  created_at: string;
  deleted_at: string | null;
};

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export function CaseNotesCard(props: { tenantId: string; caseId: string; userId: string | null }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const notesQ = useQuery({
    queryKey: ["case_notes", props.tenantId, props.caseId],
    enabled: Boolean(props.tenantId && props.caseId),
    refetchInterval: 9000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_notes")
        .select("id,tenant_id,case_id,body,created_by_user_id,created_at,deleted_at")
        .eq("tenant_id", props.tenantId)
        .eq("case_id", props.caseId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as NoteRow[];
    },
  });

  const add = async () => {
    const t = text.trim();
    if (!t) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("case_notes").insert({
        tenant_id: props.tenantId,
        case_id: props.caseId,
        body: t,
        created_by_user_id: props.userId,
      });
      if (error) throw error;
      setText("");
      showSuccess("Observação adicionada.");
      await qc.invalidateQueries({ queryKey: ["case_notes", props.tenantId, props.caseId] });
    } catch (e: any) {
      showError(`Falha ao salvar observação: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (noteId: string) => {
    try {
      const { error } = await supabase
        .from("case_notes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("tenant_id", props.tenantId)
        .eq("id", noteId);
      if (error) throw error;
      showSuccess("Observação removida.");
      await qc.invalidateQueries({ queryKey: ["case_notes", props.tenantId, props.caseId] });
    } catch (e: any) {
      showError(`Falha ao remover observação: ${e?.message ?? "erro"}`);
    }
  };

  return (
    <Card className="rounded-[22px] border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-100 text-slate-700">
            <NotebookPen className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Observações</div>
            <div className="mt-0.5 text-[11px] text-slate-500">Notas internas do time</div>
          </div>
        </div>
      </div>

      {notesQ.isError && (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          Erro ao carregar observações: {(notesQ.error as any)?.message ?? ""}
        </div>
      )}

      <div className="mt-4 grid gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[86px] rounded-2xl"
          placeholder="Escreva uma observação…"
        />
        <Button
          onClick={add}
          disabled={saving || !text.trim()}
          className={cn(
            "h-11 rounded-2xl px-4 text-white",
            "bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
          )}
        >
          <Plus className="mr-2 h-4 w-4" /> {saving ? "Salvando…" : "Adicionar"}
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {(notesQ.data ?? []).map((n) => (
          <div key={n.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="whitespace-pre-wrap text-sm text-slate-900">{n.body}</div>
                <div className="mt-2 text-[11px] text-slate-500">{fmt(n.created_at)}</div>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="h-9 w-9 rounded-2xl p-0"
                onClick={() => remove(n.id)}
                title="Remover"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {(notesQ.data ?? []).length === 0 && !notesQ.isError && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
            Ainda não há observações.
          </div>
        )}
      </div>
    </Card>
  );
}
