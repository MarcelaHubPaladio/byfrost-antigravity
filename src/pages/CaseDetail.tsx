import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WhatsAppConversation } from "@/components/case/WhatsAppConversation";
import { CaseTimeline, type CaseTimelineEvent } from "@/components/case/CaseTimeline";
import { CaseCustomerCard } from "@/components/crm/CaseCustomerCard";
import { CaseNotesCard } from "@/components/crm/CaseNotesCard";
import { CaseTasksCard } from "@/components/crm/CaseTasksCard";
import { CaseProductsCard } from "@/components/crm/CaseProductsCard";
import { CaseTagsCard } from "@/components/crm/CaseTagsCard";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Image as ImageIcon,
  ShieldCheck,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", cls)}>
      {pct}%
    </span>
  );
}

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
  vendors?: { display_name: string | null; phone_e164: string | null } | null;
  journeys?: { key: string | null; name: string | null; is_crm?: boolean } | null;
};

export default function CaseDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { activeTenantId, activeTenant } = useTenant();
  const { user } = useSession();

  const [sending, setSending] = useState(false);

  const caseQ = useQuery({
    queryKey: ["case", activeTenantId, id],
    enabled: Boolean(activeTenantId && id),
    queryFn: async () => {
      // NOTE: "cases" possui mais de uma FK para "vendors"; precisamos desambiguar o embed.
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,tenant_id,customer_id,title,status,state,created_at,updated_at,assigned_vendor_id,vendors:vendors!cases_assigned_vendor_id_fkey(display_name,phone_e164),journeys:journeys!cases_journey_id_fkey(key,name,is_crm)"
        )
        .eq("tenant_id", activeTenantId!)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Caso não encontrado");
      return data as any as CaseRow;
    },
  });

  const attachmentsQ = useQuery({
    queryKey: ["case_attachments", activeTenantId, id],
    enabled: Boolean(activeTenantId && id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_attachments")
        .select("id,kind,storage_path,created_at")
        .eq("tenant_id", activeTenantId!)
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
        .eq("tenant_id", activeTenantId!)
        .eq("case_id", id!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const pendQ = useQuery({
    queryKey: ["pendencies", activeTenantId, id],
    enabled: Boolean(activeTenantId && id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendencies")
        .select("id,type,assigned_to_role,question_text,required,status,created_at,answered_text")
        .eq("tenant_id", activeTenantId!)
        .eq("case_id", id!)
        .order("created_at", { ascending: true });
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

  const decisionQ = useQuery({
    queryKey: ["decision_logs", activeTenantId, id],
    enabled: Boolean(activeTenantId && id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decision_logs")
        .select("id,input_summary,output_summary,reasoning_public,why_json,confidence_json,occurred_at")
        .eq("tenant_id", activeTenantId!)
        .eq("case_id", id!)
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const notifyCustomerEnabled =
    (activeTenant?.branding_json?.features?.notify_customer as boolean | undefined) ?? true;

  const extractedCustomerPhone = useMemo(() => {
    const phone = fieldsQ.data?.find((f: any) => f.key === "phone")?.value_text;
    return phone as string | undefined;
  }, [fieldsQ.data]);

  const isCrm = Boolean(caseQ.data?.journeys?.is_crm);

  const approveAndPrepare = async () => {
    if (!activeTenantId || !id || !caseQ.data) return;
    setSending(true);
    try {
      // Human approval record (timeline + case update)
      await supabase.from("timeline_events").insert({
        tenant_id: activeTenantId,
        case_id: id,
        event_type: "human_approval",
        actor_type: "admin",
        actor_id: user?.id ?? null,
        message: "Aprovação humana registrada para comunicação com cliente.",
        meta_json: { notifyCustomerEnabled },
        occurred_at: new Date().toISOString(),
      });

      await supabase
        .from("cases")
        .update({ status: "confirmed", state: "confirmed" })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);

      if (!notifyCustomerEnabled) {
        await supabase.from("timeline_events").insert({
          tenant_id: activeTenantId,
          case_id: id,
          event_type: "customer_notify_skipped",
          actor_type: "admin",
          actor_id: user?.id ?? null,
          message: "Notificação ao cliente está desabilitada pelo tenant. Nenhuma mensagem será preparada.",
          meta_json: {},
          occurred_at: new Date().toISOString(),
        });
      } else {
        const { data: inst } = await supabase
          .from("wa_instances")
          .select("id, phone_number")
          .eq("tenant_id", activeTenantId)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!inst?.id) throw new Error("Nenhuma instância WhatsApp ativa configurada.");

        const vendorName = caseQ.data.vendors?.display_name ?? "seu vendedor";
        const vendorPhone = caseQ.data.vendors?.phone_e164 ?? "";

        const to = extractedCustomerPhone;
        if (!to) throw new Error("Telefone do cliente não encontrado nos campos extraídos.");

        const text = `Olá! Recebemos seu pedido. O vendedor responsável foi avisado: ${vendorName}${
          vendorPhone ? ` (${vendorPhone})` : ""
        }. Precisa de mais algo?`;

        const url =
          "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/integrations-zapi-send";
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;

        // Prepare/send via Edge Function (also writes outbox)
        await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            tenantId: activeTenantId,
            instanceId: inst.id,
            to,
            type: "text",
            text,
            meta: { case_id: id, kind: "customer_approved_message" },
          }),
        });

        await supabase.from("timeline_events").insert({
          tenant_id: activeTenantId,
          case_id: id,
          event_type: "customer_message_prepared",
          actor_type: "admin",
          actor_id: user?.id ?? null,
          message:
            "Mensagem ao cliente preparada/enfileirada (governança: aprovado por humano).",
          meta_json: { to },
          occurred_at: new Date().toISOString(),
        });
      }

      await qc.invalidateQueries({ queryKey: ["case", activeTenantId, id] });
      await qc.invalidateQueries({ queryKey: ["timeline", activeTenantId, id] });
      await qc.invalidateQueries({ queryKey: ["cases", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["wa_messages_case", activeTenantId, id] });
    } finally {
      setSending(false);
    }
  };

  const c = caseQ.data;

  return (
    <RequireAuth>
      <AppShell>
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
                {c?.title ?? "Caso"}
              </h2>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <Badge className="rounded-full border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
                  {c?.state}
                </Badge>
                <Badge className="rounded-full border-0 bg-[hsl(var(--byfrost-accent)/0.10)] text-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.10)]">
                  {c?.status}
                </Badge>
                {c?.journeys?.is_crm ? (
                  <Badge className="rounded-full border-0 bg-indigo-100 text-indigo-900 hover:bg-indigo-100">
                    CRM
                  </Badge>
                ) : null}
                <span className="truncate">
                  {(c?.vendors?.display_name ?? "Vendedor") +
                    (c?.vendors?.phone_e164 ? ` • ${c?.vendors?.phone_e164}` : "")}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                onClick={approveAndPrepare}
                disabled={sending || !c}
                className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-5 text-white shadow-sm hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
              >
                {sending ? "Processando…" : "Aprovar e preparar mensagem"}
                <Send className="ml-2 h-4 w-4" />
              </Button>
              <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-600 shadow-sm">
                <ShieldCheck className="mr-1 inline h-4 w-4 text-[hsl(var(--byfrost-accent))]" />
                IA não altera status
              </div>
            </div>
          </div>

          {/* Layout: esquerda (conteúdo) + direita (chat fixo) */}
          <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            {/* Left */}
            <div className="space-y-4">
              {isCrm && activeTenantId && id && (
                <div className="space-y-4">
                  <CaseCustomerCard
                    tenantId={activeTenantId}
                    caseId={id}
                    customerId={c?.customer_id ?? null}
                    assignedVendorId={c?.assigned_vendor_id ?? null}
                    suggestedPhone={extractedCustomerPhone ?? null}
                  />

                  <CaseTagsCard tenantId={activeTenantId} caseId={id} />

                  <CaseProductsCard tenantId={activeTenantId} caseId={id} />

                  <div className="grid gap-4 lg:grid-cols-2">
                    <CaseTasksCard tenantId={activeTenantId} caseId={id} />
                    <CaseNotesCard tenantId={activeTenantId} caseId={id} userId={user?.id ?? null} />
                  </div>
                </div>
              )}

              {/* Pendências */}
              <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Pendências</div>
                  <div className="text-xs text-slate-500">{pendQ.data?.length ?? 0}</div>
                </div>
                <div className="mt-3 space-y-2">
                  {(pendQ.data ?? []).map((p: any) => (
                    <div
                      key={p.id}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {p.question_text}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {p.assigned_to_role} • {p.type} • {p.required ? "obrigatória" : "opcional"}
                          </div>
                        </div>
                        <Badge
                          className={cn(
                            "rounded-full border-0",
                            p.status === "open"
                              ? "bg-amber-100 text-amber-900"
                              : p.status === "answered"
                                ? "bg-emerald-100 text-emerald-900"
                                : "bg-slate-100 text-slate-700"
                          )}
                        >
                          {p.status}
                        </Badge>
                      </div>
                      {p.answered_text && (
                        <div className="mt-2 text-xs text-slate-600">
                          <span className="font-medium">Resposta:</span> {p.answered_text}
                        </div>
                      )}
                    </div>
                  ))}
                  {(pendQ.data ?? []).length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
                      Sem pendências.
                    </div>
                  )}
                </div>
              </div>

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
                          alt="Pedido"
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
                      Ainda não há campos extraídos. Rode o processor (jobs) ou use o simulador.
                    </div>
                  )}
                </div>
              </div>

              {/* Decisões IA */}
              <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Decisões da IA (WHY)</div>
                  <div className="text-xs text-slate-500">explicável</div>
                </div>

                <div className="mt-3 space-y-2">
                  {(decisionQ.data ?? []).slice(0, 8).map((d: any) => (
                    <div
                      key={d.id}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {d.output_summary ?? "Decisão"}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {new Date(d.occurred_at).toLocaleString()}
                          </div>
                        </div>
                        <Badge className="rounded-full border-0 bg-[hsl(var(--byfrost-accent)/0.10)] text-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.10)]">
                          WHY
                        </Badge>
                      </div>

                      {d.reasoning_public && (
                        <div className="mt-2 text-xs leading-relaxed text-slate-600">{d.reasoning_public}</div>
                      )}

                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <div className="rounded-2xl bg-slate-50 p-2">
                          <div className="text-[11px] font-semibold text-slate-700">why_json</div>
                          <pre className="mt-1 max-h-24 overflow-auto text-[11px] text-slate-600">
                            {JSON.stringify(d.why_json ?? {}, null, 2)}
                          </pre>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-2">
                          <div className="text-[11px] font-semibold text-slate-700">confidence_json</div>
                          <pre className="mt-1 max-h-24 overflow-auto text-[11px] text-slate-600">
                            {JSON.stringify(d.confidence_json ?? {}, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}

                  {(decisionQ.data ?? []).length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
                      Sem decision logs ainda.
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline por último (estilo do anexo) */}
              <CaseTimeline events={timelineQ.data ?? []} />
            </div>

            {/* Right: Chat fixo ocupando o espaço */}
            <div className="lg:sticky lg:top-5 lg:h-[calc(100vh-140px)]">
              <div className="h-[70vh] lg:h-full">
                {id && <WhatsAppConversation caseId={id} className="h-full" />}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-600" />
            Ações críticas (aprovação/status) são humanas. A IA registra sugestões, pendências e justificativas.
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}