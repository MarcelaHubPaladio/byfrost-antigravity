import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { WhatsAppConversation } from "@/components/case/WhatsAppConversation";
import { CaseTimeline, type CaseTimelineEvent } from "@/components/case/CaseTimeline";
import { CaseCustomerCard } from "@/components/crm/CaseCustomerCard";
import { CaseTagsCard } from "@/components/crm/CaseTagsCard";
import { CaseProductsCard } from "@/components/crm/CaseProductsCard";
import { CaseTasksCard } from "@/components/crm/CaseTasksCard";
import { CaseNotesCard } from "@/components/crm/CaseNotesCard";
import { CaseTechnicalReportDialog } from "@/components/case/CaseTechnicalReportDialog";
import { ArrowLeft, ClipboardList, Image as ImageIcon, MessagesSquare, Trash2, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";

type CaseRow = {
  id: string;
  tenant_id: string;
  title: string | null;
  status: string;
  state: string;
  created_at: string;
  updated_at: string;
  assigned_vendor_id: string | null;
  customer_id: string | null;
  meta_json?: any;
  is_chat?: boolean;
  vendors?: { display_name: string | null; phone_e164: string | null } | null;
  journeys?: { key: string | null; name: string | null; is_crm?: boolean; default_state_machine_json?: any } | null;
};

function getMetaPhone(meta: any): string | null {
  if (!meta || typeof meta !== "object") return null;
  const direct =
    meta.customer_phone ??
    meta.customerPhone ??
    meta.phone ??
    meta.whatsapp ??
    meta.to_phone ??
    meta.toPhone ??
    null;
  return typeof direct === "string" && direct.trim() ? direct.trim() : null;
}

function ConfidencePill({ v }: { v: number | null | undefined }) {
  const pct = Math.round(Math.max(0, Math.min(1, Number(v ?? 0))) * 100);
  const tone = pct >= 80 ? "emerald" : pct >= 60 ? "amber" : "rose";
  const cls =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-900"
      : tone === "amber"
        ? "bg-amber-100 text-amber-900"
        : "bg-rose-100 text-rose-900";

  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", cls)}>{pct}%</span>
  );
}

export default function CrmCaseDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();
  const { user } = useSession();

  const [chatOnly, setChatOnly] = useState(false);
  const [updatingChatOnly, setUpdatingChatOnly] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updatingState, setUpdatingState] = useState(false);

  const caseQ = useQuery({
    queryKey: ["case", activeTenantId, id],
    enabled: Boolean(activeTenantId && id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,tenant_id,customer_id,title,status,state,created_at,updated_at,assigned_vendor_id,meta_json,is_chat,vendors:vendors!cases_assigned_vendor_id_fkey(display_name,phone_e164),journeys:journeys!cases_journey_id_fkey(key,name,is_crm,default_state_machine_json)"
        )
        .eq("tenant_id", activeTenantId!)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Caso não encontrado");
      return data as any as CaseRow;
    },
  });

  useEffect(() => {
    setChatOnly(Boolean(caseQ.data?.is_chat));
  }, [caseQ.data?.is_chat]);

  const updateChatOnly = async (next: boolean) => {
    if (!activeTenantId || !id) return;
    if (updatingChatOnly) return;

    setUpdatingChatOnly(true);
    setChatOnly(next);
    try {
      const { error } = await supabase
        .from("cases")
        .update({ is_chat: next })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;

      await supabase.from("timeline_events").insert({
        tenant_id: activeTenantId,
        case_id: id,
        event_type: "case_updated",
        actor_type: "admin",
        actor_id: user?.id ?? null,
        message: next ? "Marcado como chat (fora de fluxo)." : "Removido de chat (volta ao fluxo).",
        meta_json: { field: "is_chat", value: next },
        occurred_at: new Date().toISOString(),
      });

      showSuccess(next ? "Marcado como chat." : "Removido de chat.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case", activeTenantId, id] }),
        qc.invalidateQueries({ queryKey: ["timeline", activeTenantId, id] }),
        qc.invalidateQueries({ queryKey: ["crm_cases_by_tenant", activeTenantId] }),
        qc.invalidateQueries({ queryKey: ["cases_by_tenant", activeTenantId] }),
        qc.invalidateQueries({ queryKey: ["chat_cases", activeTenantId] }),
      ]);

      if (next) nav(`/app/chat/${id}`, { replace: true });
    } catch (e: any) {
      setChatOnly(Boolean(caseQ.data?.is_chat));
      showError(`Falha ao atualizar: ${e?.message ?? "erro"}`);
    } finally {
      setUpdatingChatOnly(false);
    }
  };

  const deleteCase = async () => {
    if (!activeTenantId || !id) return;
    if (deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("cases")
        .update({ deleted_at: new Date().toISOString() })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;

      await supabase.from("timeline_events").insert({
        tenant_id: activeTenantId,
        case_id: id,
        event_type: "case_deleted",
        actor_type: "admin",
        actor_id: user?.id ?? null,
        message: "Caso excluído (soft delete).",
        meta_json: {},
        occurred_at: new Date().toISOString(),
      });

      showSuccess("Caso excluído.");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case", activeTenantId, id] }),
        qc.invalidateQueries({ queryKey: ["timeline", activeTenantId, id] }),
        qc.invalidateQueries({ queryKey: ["crm_cases_by_tenant", activeTenantId] }),
        qc.invalidateQueries({ queryKey: ["cases_by_tenant", activeTenantId] }),
        qc.invalidateQueries({ queryKey: ["chat_cases", activeTenantId] }),
      ]);

      nav("/app/crm", { replace: true });
    } catch (e: any) {
      showError(`Falha ao excluir: ${e?.message ?? "erro"}`);
    } finally {
      setDeleting(false);
    }
  };

  const states = useMemo(() => {
    const st = (caseQ.data?.journeys as any)?.default_state_machine_json?.states;
    const arr = Array.isArray(st) ? st.map((x: any) => String(x)).filter(Boolean) : [];
    const fallback = caseQ.data?.state ? [caseQ.data.state] : [];
    return Array.from(new Set([...(arr.length ? arr : fallback)]));
  }, [caseQ.data?.journeys, caseQ.data?.state]);

  const updateState = async (next: string) => {
    if (!activeTenantId || !id) return;
    if (updatingState) return;
    const prev = caseQ.data?.state ?? null;
    if (!next || next === prev) return;

    setUpdatingState(true);
    try {
      const { error } = await supabase
        .from("cases")
        .update({ state: next })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;

      // timeline é registrada automaticamente via trigger no banco
      showSuccess(`Estado atualizado para: ${next}`);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case", activeTenantId, id] }),
        qc.invalidateQueries({ queryKey: ["timeline", activeTenantId, id] }),
        qc.invalidateQueries({ queryKey: ["crm_cases_by_tenant", activeTenantId] }),
        qc.invalidateQueries({ queryKey: ["cases_by_tenant", activeTenantId] }),
      ]);
    } catch (e: any) {
      showError(`Falha ao atualizar estado: ${e?.message ?? "erro"}`);
    } finally {
      setUpdatingState(false);
    }
  };

  // Se foi marcado como chat, abre no inbox de chat.
  useEffect(() => {
    if (!caseQ.data?.id) return;
    if (!caseQ.data.is_chat) return;
    nav(`/app/chat/${caseQ.data.id}`, { replace: true });
  }, [caseQ.data?.id, caseQ.data?.is_chat, nav]);

  // Se cair aqui por engano (case não é CRM), manda pro detalhe padrão.
  useEffect(() => {
    if (!caseQ.data?.id) return;
    if (caseQ.data.is_chat) return;
    if (caseQ.data.journeys?.is_crm) return;
    nav(`/app/cases/${caseQ.data.id}`, { replace: true });
  }, [caseQ.data?.id, caseQ.data?.journeys?.is_crm, caseQ.data?.is_chat, nav]);

  // Ao abrir o case, marca as mensagens inbound como "vistas" (por usuário).
  useEffect(() => {
    if (!activeTenantId || !id || !user?.id) return;
    supabase
      .from("case_message_reads")
      .upsert(
        {
          tenant_id: activeTenantId,
          case_id: id,
          user_id: user.id,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,case_id,user_id" }
      )
      .then(() => null);
  }, [activeTenantId, id, user?.id]);

  const attachmentsQ = useQuery({
    queryKey: ["case_attachments", activeTenantId, id],
    enabled: Boolean(activeTenantId && id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_attachments")
        .select("id,kind,storage_path,created_at")
        .eq("case_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const fieldsQ = useQuery({
    queryKey: ["case_fields", activeTenantId, id],
    enabled: Boolean(activeTenantId && id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_fields")
        .select("key,value_text,value_json,confidence,source,updated_at")
        // NOTE: case_fields não tem tenant_id; o RLS já valida via cases
        .eq("case_id", id!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const timelineQ = useQuery({
    queryKey: ["timeline", activeTenantId, id],
    enabled: Boolean(activeTenantId && id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timeline_events")
        .select("id,event_type,actor_type,message,occurred_at")
        .eq("tenant_id", activeTenantId!)
        .eq("case_id", id!)
        .order("occurred_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CaseTimelineEvent[];
    },
  });

  const suggestedPhone = useMemo(() => {
    const byField = fieldsQ.data?.find((f: any) =>
      ["whatsapp", "phone", "customer_phone"].includes(String(f.key ?? ""))
    )?.value_text;
    return (byField as string | undefined) ?? getMetaPhone(caseQ.data?.meta_json) ?? null;
  }, [fieldsQ.data, caseQ.data?.meta_json]);

  const displayTitle = useMemo(() => {
    const c = caseQ.data;
    if (!c) return "Case";
    return (
      c.title ??
      suggestedPhone ??
      c.vendors?.display_name ??
      `Case ${String(c.id).slice(0, 8)}…`
    );
  }, [caseQ.data, suggestedPhone]);

  const c = caseQ.data;

  return (
    <RequireAuth>
      <AppShell hideTopBar>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <button
                onClick={() => nav(-1)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-white"
              >
                <ArrowLeft className="h-4 w-4" /> Voltar
              </button>

              <h2 className="mt-3 truncate text-xl font-semibold tracking-tight text-slate-900">
                {displayTitle}
              </h2>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <Badge className="rounded-full border-0 bg-indigo-100 text-indigo-900 hover:bg-indigo-100">
                  CRM
                </Badge>

                {c?.meta_json?.lead_source === "csv_import" ? (
                  <Badge className="rounded-full border-0 bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.12)]">
                    Lead importado
                  </Badge>
                ) : null}

                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-2 py-1 shadow-sm">
                  <span className="text-[11px] font-semibold text-slate-700">Estado</span>
                  <Select value={c?.state ?? ""} onValueChange={updateState} disabled={!c || updatingState}>
                    <SelectTrigger className="h-7 w-[180px] rounded-full border-slate-200 bg-white px-3 text-xs">
                      <SelectValue placeholder="Selecionar…" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {states.map((s) => (
                        <SelectItem key={s} value={s} className="rounded-xl">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Badge className="rounded-full border-0 bg-[hsl(var(--byfrost-accent)/0.10)] text-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.10)]">
                  {c?.status}
                </Badge>

                <span className="truncate inline-flex items-center gap-1">
                  <UsersRound className="h-3.5 w-3.5 text-slate-400" />
                  {(c?.vendors?.display_name ?? "Vendedor") +
                    (c?.vendors?.phone_e164 ? ` • ${c?.vendors?.phone_e164}` : "")}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-700 shadow-sm">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-slate-800">Somente chat</div>
                  <div className="text-[11px] text-slate-500">fora de fluxo</div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={chatOnly} onCheckedChange={updateChatOnly} disabled={updatingChatOnly || !c} />
                  {chatOnly ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9 rounded-2xl"
                      onClick={() => nav(`/app/chat/${id}`)}
                      title="Abrir no inbox de Chat"
                    >
                      <MessagesSquare className="mr-2 h-4 w-4" /> Abrir
                    </Button>
                  ) : null}
                </div>
              </div>

              {id ? <CaseTechnicalReportDialog caseId={id} /> : null}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    className={cn(
                      "h-11 rounded-2xl border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100",
                      deleting ? "opacity-60" : ""
                    )}
                    disabled={!c || deleting}
                    title="Excluir caso"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-[22px]">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir este caso?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação remove o caso das listas (CRM/Dashboard/Chat). As mensagens continuam no histórico do banco.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="rounded-2xl bg-rose-600 text-white hover:bg-rose-700"
                      onClick={(e) => {
                        e.preventDefault();
                        deleteCase();
                      }}
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                type="button"
                variant="secondary"
                className="h-11 rounded-2xl"
                onClick={() => nav("/app/crm")}
              >
                Voltar ao CRM
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4">
              {activeTenantId && id && (
                <div className="space-y-4">
                  <CaseCustomerCard
                    tenantId={activeTenantId}
                    caseId={id}
                    customerId={c?.customer_id ?? null}
                    assignedVendorId={c?.assigned_vendor_id ?? null}
                    suggestedPhone={suggestedPhone}
                  />

                  <CaseTagsCard tenantId={activeTenantId} caseId={id} />

                  <CaseProductsCard tenantId={activeTenantId} caseId={id} />

                  <div className="grid gap-4 lg:grid-cols-2">
                    <CaseTasksCard tenantId={activeTenantId} caseId={id} />
                    <CaseNotesCard tenantId={activeTenantId} caseId={id} userId={user?.id ?? null} />
                  </div>
                </div>
              )}

              {/* Anexos */}
              <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <ImageIcon className="h-4 w-4 text-slate-500" /> Anexos
                  </div>
                  <div className="text-xs text-slate-500">{attachmentsQ.data?.length ?? 0}</div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(attachmentsQ.data ?? [])
                    .filter((a: any) => a.kind === "image")
                    .slice(0, 4)
                    .map((a: any) => (
                      <a
                        key={a.id}
                        href={a.storage_path}
                        target="_blank"
                        rel="noreferrer"
                        className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                        title="Abrir imagem"
                      >
                        <img
                          src={a.storage_path}
                          alt="Anexo"
                          className="h-44 w-full object-cover transition group-hover:scale-[1.02]"
                        />
                      </a>
                    ))}

                  {(!attachmentsQ.data || attachmentsQ.data.length === 0) && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
                      Sem anexos ainda.
                    </div>
                  )}
                </div>
              </div>

              {/* Campos extraídos */}
              <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <ClipboardList className="h-4 w-4 text-slate-500" /> Campos extraídos
                  </div>
                  <div className="text-xs text-slate-500">com confiança</div>
                </div>

                <div className="mt-3 space-y-2">
                  {(fieldsQ.data ?? [])
                    .filter((f: any) => f.key !== "ocr_text")
                    .sort((a: any, b: any) => a.key.localeCompare(b.key))
                    .map((f: any) => (
                      <div
                        key={f.key}
                        className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {f.key}
                          </div>
                          <div className="truncate text-sm font-medium text-slate-900">
                            {f.value_text ?? (f.value_json ? JSON.stringify(f.value_json) : "—")}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">fonte: {f.source}</div>
                        </div>
                        <ConfidencePill v={f.confidence} />
                      </div>
                    ))}

                  {(fieldsQ.data ?? []).filter((f: any) => f.key !== "ocr_text").length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
                      Ainda não há campos extraídos.
                    </div>
                  )}
                </div>
              </div>

              <CaseTimeline events={timelineQ.data ?? []} />
            </div>

            <div className="lg:sticky lg:top-5 lg:h-[calc(100vh-140px)]">
              <div className="h-[70vh] lg:h-full">{id && <WhatsAppConversation caseId={id} className="h-full" />}</div>
            </div>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}