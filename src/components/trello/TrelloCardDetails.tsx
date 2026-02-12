import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { CalendarDays, ClipboardList, Save, UserRound } from "lucide-react";
import { CaseOwnerCard } from "@/components/crm/CaseOwnerCard";
import { CaseTasksCard } from "@/components/crm/CaseTasksCard";
import { CaseTimeline, type CaseTimelineEvent } from "@/components/case/CaseTimeline";

function fmtDateInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateInput(v: string): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s + "T12:00:00.000Z");
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function TrelloCardDetails(props: { tenantId: string; caseId: string }) {
  const qc = useQueryClient();

  const caseQ = useQuery({
    queryKey: ["trello_case", props.tenantId, props.caseId],
    enabled: Boolean(props.tenantId && props.caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,tenant_id,title,summary_text,assigned_vendor_id,meta_json")
        .eq("tenant_id", props.tenantId)
        .eq("id", props.caseId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Caso não encontrado");
      return data as any as {
        id: string;
        tenant_id: string;
        title: string | null;
        summary_text: string | null;
        assigned_vendor_id: string | null;
        meta_json: any;
      };
    },
  });

  const timelineQ = useQuery({
    queryKey: ["timeline", props.tenantId, props.caseId],
    enabled: Boolean(props.tenantId && props.caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timeline_events")
        .select("id,event_type,actor_type,message,occurred_at")
        .eq("tenant_id", props.tenantId)
        .eq("case_id", props.caseId)
        .order("occurred_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CaseTimelineEvent[];
    },
  });

  const attachmentsQ = useQuery({
    queryKey: ["case_attachments", props.tenantId, props.caseId],
    enabled: Boolean(props.tenantId && props.caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_attachments")
        .select("id,kind,storage_path,original_filename,created_at")
        .eq("tenant_id", props.tenantId)
        .eq("case_id", props.caseId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const draft = useMemo(() => {
    const c = caseQ.data;
    return {
      title: c?.title ?? "",
      description: c?.summary_text ?? "",
      dueDate: fmtDateInput((c?.meta_json as any)?.due_at ?? null),
    };
  }, [caseQ.data]);

  const [form, setForm] = useState(draft);
  const [lastLoadedId, setLastLoadedId] = useState<string | null>(null);
  if (caseQ.data?.id && lastLoadedId !== caseQ.data.id) {
    setLastLoadedId(caseQ.data.id);
    setTimeout(() => setForm(draft), 0);
  }

  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!props.tenantId || !props.caseId) return;
    setSaving(true);
    try {
      const payload: any = {
        title: form.title.trim() || null,
        summary_text: form.description.trim() || null,
        meta_json: {
          ...((caseQ.data as any)?.meta_json ?? {}),
          due_at: parseDateInput(form.dueDate),
        },
      };

      const { error } = await supabase
        .from("cases")
        .update(payload)
        .eq("tenant_id", props.tenantId)
        .eq("id", props.caseId);
      if (error) throw error;

      await supabase.from("timeline_events").insert({
        tenant_id: props.tenantId,
        case_id: props.caseId,
        event_type: "card_updated",
        actor_type: "admin",
        actor_id: null,
        message: "Card atualizado (título/descrição/prazo).",
        meta_json: { kind: "trello" },
        occurred_at: new Date().toISOString(),
      });

      showSuccess("Card salvo.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["trello_case", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["case", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["cases_by_tenant", props.tenantId] }),
        qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
      ]);
    } catch (e: any) {
      showError(`Falha ao salvar: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  const dueAtLabel = (caseQ.data?.meta_json as any)?.due_at
    ? new Date((caseQ.data?.meta_json as any)?.due_at).toLocaleDateString()
    : "—";

  return (
    <div className="space-y-4">
      <Card className="rounded-[22px] border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">Card</div>
            <div className="mt-1 text-xs text-slate-500">Título, descrição e prazo</div>
          </div>
          <Badge className="rounded-full border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">trello</Badge>
        </div>

        <div className="mt-4 grid gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-700">Título</div>
            <Input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="mt-1 h-11 rounded-2xl"
              placeholder="Ex: Revisar materiais do cliente"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-700">Descrição</div>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="mt-1 min-h-[120px] rounded-2xl"
              placeholder="Contexto, objetivo, links…"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <CalendarDays className="h-4 w-4 text-slate-500" /> Prazo
              </div>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                className="mt-1 h-11 rounded-2xl"
              />
              <div className="mt-1 text-[11px] text-slate-500">Atual: {dueAtLabel}</div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <UserRound className="h-4 w-4 text-slate-500" /> Responsável
              </div>
              <div className="mt-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                Use o card de atribuição (abaixo) para selecionar o responsável.
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={save}
              disabled={saving || caseQ.isLoading}
              className={cn(
                "h-11 rounded-2xl px-4 text-white",
                "bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
              )}
            >
              <Save className="mr-2 h-4 w-4" /> {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>

          {caseQ.isError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              Erro: {(caseQ.error as any)?.message ?? ""}
            </div>
          ) : null}
        </div>
      </Card>

      <CaseOwnerCard tenantId={props.tenantId} caseId={props.caseId} assignedVendorId={caseQ.data?.assigned_vendor_id ?? null} />

      <CaseTasksCard tenantId={props.tenantId} caseId={props.caseId} />

      <Card className="rounded-[22px] border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ClipboardList className="h-4 w-4 text-slate-500" /> Anexos
            </div>
            <div className="mt-1 text-xs text-slate-500">Lista de anexos vinculados ao case</div>
          </div>
          <Badge className="rounded-full border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
            {(attachmentsQ.data ?? []).length}
          </Badge>
        </div>

        <div className="mt-3 space-y-2">
          {(attachmentsQ.data ?? []).map((a) => (
            <a
              key={a.id}
              href={a.storage_path}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 hover:bg-slate-100"
              title={a.original_filename ?? a.storage_path}
            >
              <div className="min-w-0 truncate">
                {a.original_filename ?? a.storage_path.split("/").slice(-1)[0]}
              </div>
              <div className="text-[11px] text-slate-500">{new Date(a.created_at).toLocaleString()}</div>
            </a>
          ))}

          {(attachmentsQ.data ?? []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
              Sem anexos ainda.
            </div>
          ) : null}
        </div>
      </Card>

      <CaseTimeline events={timelineQ.data ?? []} />
    </div>
  );
}
