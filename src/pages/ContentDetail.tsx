import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Film,
  Hash,
  Instagram,
  Save,
  Upload,
} from "lucide-react";

const CONTENT_MEDIA_UPLOAD_URL =
  "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/content-media-upload";

type ContentItemRow = {
  id: string;
  tenant_id: string;
  case_id: string;
  client_code: string | null;
  client_name: string | null;
  cycle_number: number | null;
  recording_date: string | null;
  content_number: number | null;
  theme_title: string | null;
  references_notes: string | null;
  script_text: string | null;
  duration_seconds: number | null;
  video_link: string | null;
  cover_link: string | null;
  tags: string[] | null;
  created_at: string;
};

type PubRow = {
  id: string;
  tenant_id: string;
  case_id: string;
  content_item_id: string;
  channel: "ig_story" | "ig_feed" | "ig_reels" | "fb_feed";
  caption_text: string | null;
  creative_type: "IMAGE" | "VIDEO" | "CAROUSEL" | "MIXED" | null;
  media_storage_paths: string[];
  scheduled_at: string | null;
  publish_status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED" | "ASSISTED_REQUIRED";
  meta_post_id: string | null;
  meta_permalink: string | null;
  last_error: string | null;
  created_at: string;
};

function publicUrl(bucket: string, path: string) {
  try {
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

async function fileToBase64(file: File) {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function parseTags(v: string) {
  const parts = v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

export default function ContentDetail() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { activeTenantId } = useTenant();

  const caseId = id ?? "";

  const caseQ = useQuery({
    queryKey: ["content_case", activeTenantId, caseId],
    enabled: Boolean(activeTenantId && caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,tenant_id,journey_id,title,state,status,created_at,updated_at")
        .eq("tenant_id", activeTenantId!)
        .eq("id", caseId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Caso não encontrado");
      return data as any;
    },
  });

  const itemQ = useQuery({
    queryKey: ["content_item_by_case", activeTenantId, caseId],
    enabled: Boolean(activeTenantId && caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_items")
        .select(
          "id,tenant_id,case_id,client_code,client_name,cycle_number,recording_date,content_number,theme_title,references_notes,script_text,duration_seconds,video_link,cover_link,tags,created_at"
        )
        .eq("tenant_id", activeTenantId!)
        .eq("case_id", caseId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ContentItemRow | null;
    },
  });

  const pubsQ = useQuery({
    queryKey: ["content_publications_by_case", activeTenantId, caseId],
    enabled: Boolean(activeTenantId && caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_publications")
        .select(
          "id,tenant_id,case_id,content_item_id,channel,caption_text,creative_type,media_storage_paths,scheduled_at,publish_status,meta_post_id,meta_permalink,last_error,created_at"
        )
        .eq("tenant_id", activeTenantId!)
        .eq("case_id", caseId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any as PubRow[];
    },
  });

  const draft = useMemo(() => {
    const it = itemQ.data;
    return {
      client_code: it?.client_code ?? "",
      client_name: it?.client_name ?? "",
      cycle_number: it?.cycle_number?.toString() ?? "",
      recording_date: it?.recording_date ?? "",
      content_number: it?.content_number?.toString() ?? "",
      theme_title: it?.theme_title ?? "",
      references_notes: it?.references_notes ?? "",
      script_text: it?.script_text ?? "",
      duration_seconds: it?.duration_seconds?.toString() ?? "",
      video_link: it?.video_link ?? "",
      cover_link: it?.cover_link ?? "",
      tags: (it?.tags ?? [])?.join(", ") ?? "",
    };
  }, [itemQ.data]);

  const [form, setForm] = useState(draft);
  // Keep UX: update form when item loads (but avoid overwriting local edits on every render)
  const lastLoadedItemId = useRef<string | null>(null);
  if (itemQ.data?.id && lastLoadedItemId.current !== itemQ.data.id) {
    lastLoadedItemId.current = itemQ.data.id;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    setTimeout(() => setForm(draft), 0);
  }

  const [saving, setSaving] = useState(false);

  const saveItem = async () => {
    if (!activeTenantId || !caseId) return;
    setSaving(true);
    try {
      const payload: any = {
        tenant_id: activeTenantId,
        case_id: caseId,
        client_code: form.client_code.trim() || null,
        client_name: form.client_name.trim() || null,
        cycle_number: form.cycle_number ? Number(form.cycle_number) : null,
        recording_date: form.recording_date || null,
        content_number: form.content_number ? Number(form.content_number) : null,
        theme_title: form.theme_title.trim() || null,
        references_notes: form.references_notes.trim() || null,
        script_text: form.script_text.trim() || null,
        duration_seconds: form.duration_seconds ? Number(form.duration_seconds) : null,
        video_link: form.video_link.trim() || null,
        cover_link: form.cover_link.trim() || null,
        tags: parseTags(form.tags),
      };

      const existing = itemQ.data;

      if (existing?.id) {
        const { error } = await supabase
          .from("content_items")
          .update(payload)
          .eq("tenant_id", activeTenantId)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("content_items").insert(payload);
        if (error) throw error;
      }

      showSuccess("Conteúdo salvo.");
      await qc.invalidateQueries({ queryKey: ["content_item_by_case", activeTenantId, caseId] });
      await qc.invalidateQueries({ queryKey: ["content_cases", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao salvar: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  const [approving, setApproving] = useState(false);
  const approve = async () => {
    if (!activeTenantId || !caseId) return;
    setApproving(true);
    try {
      const { error } = await supabase
        .from("cases")
        .update({ state: "APROVACAO" })
        .eq("tenant_id", activeTenantId)
        .eq("id", caseId);
      if (error) throw error;
      showSuccess("Movido para APROVAÇÃO.");
      await qc.invalidateQueries({ queryKey: ["content_case", activeTenantId, caseId] });
      await qc.invalidateQueries({ queryKey: ["content_cases", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao aprovar: ${e?.message ?? "erro"}`);
    } finally {
      setApproving(false);
    }
  };

  // Publications
  const [pubChannel, setPubChannel] = useState<PubRow["channel"]>("ig_story");
  const [pubCreative, setPubCreative] = useState<NonNullable<PubRow["creative_type"]>>("IMAGE");
  const [pubCaption, setPubCaption] = useState("");
  const [pubScheduledAt, setPubScheduledAt] = useState<string>("");
  const pubFilesRef = useRef<HTMLInputElement | null>(null);
  const [creatingPub, setCreatingPub] = useState(false);

  const createPublication = async () => {
    if (!activeTenantId || !caseId) return;
    const contentItemId = itemQ.data?.id;
    if (!contentItemId) {
      showError("Salve o conteúdo antes de criar publicações.");
      return;
    }

    setCreatingPub(true);
    try {
      const scheduledIso = pubScheduledAt ? new Date(pubScheduledAt).toISOString() : null;
      const status: PubRow["publish_status"] = scheduledIso ? "SCHEDULED" : "DRAFT";

      const { data: ins, error: insErr } = await supabase
        .from("content_publications")
        .insert({
          tenant_id: activeTenantId,
          case_id: caseId,
          content_item_id: contentItemId,
          channel: pubChannel,
          creative_type: pubCreative,
          caption_text: pubCaption.trim() || null,
          scheduled_at: scheduledIso,
          publish_status: status,
          media_storage_paths: [],
        })
        .select("id")
        .single();

      if (insErr) throw insErr;

      const pubId = String((ins as any).id);

      // Optional media upload
      const files = pubFilesRef.current?.files ? Array.from(pubFilesRef.current.files) : [];
      if (files.length) {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error("Sessão inválida");

        const uploadedPaths: string[] = [];

        for (const f of files) {
          const fileBase64 = await fileToBase64(f);
          const res = await fetch(CONTENT_MEDIA_UPLOAD_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              tenantId: activeTenantId,
              caseId,
              publicationId: pubId,
              filename: f.name,
              contentType: f.type || "application/octet-stream",
              fileBase64,
            }),
          });

          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.ok || !json?.path) {
            throw new Error(json?.error || `HTTP ${res.status}`);
          }
          uploadedPaths.push(String(json.path));
        }

        if (uploadedPaths.length) {
          const { error: upErr } = await supabase
            .from("content_publications")
            .update({ media_storage_paths: uploadedPaths })
            .eq("tenant_id", activeTenantId)
            .eq("id", pubId);
          if (upErr) throw upErr;
        }
      }

      showSuccess("Publicação criada.");
      setPubCaption("");
      setPubScheduledAt("");
      setPubChannel("ig_story");
      setPubCreative("IMAGE");
      if (pubFilesRef.current) pubFilesRef.current.value = "";

      await qc.invalidateQueries({ queryKey: ["content_publications_by_case", activeTenantId, caseId] });
      await qc.invalidateQueries({ queryKey: ["content_calendar_pubs", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao criar publicação: ${e?.message ?? "erro"}`);
    } finally {
      setCreatingPub(false);
    }
  };

  const headerTitle =
    form.theme_title.trim() || caseQ.data?.title || (itemQ.data?.theme_title ?? "Conteúdo");

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <Link
                to="/app/content"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Link>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold tracking-tight text-slate-900">{headerTitle}</h2>
                {caseQ.data?.state ? (
                  <Badge className="rounded-full border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
                    {caseQ.data.state}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Case: <span className="font-medium">{caseId.slice(0, 8)}…</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                onClick={approve}
                disabled={approving || !caseQ.data}
                variant="secondary"
                className="h-10 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {approving ? "Aprovando…" : "Aprovar"}
              </Button>

              <Button
                onClick={saveItem}
                disabled={saving || !activeTenantId || !caseQ.data}
                className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>

          {(caseQ.isError || itemQ.isError) && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              Erro ao carregar: {(caseQ.error as any)?.message ?? (itemQ.error as any)?.message ?? ""}
            </div>
          )}

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.95fr]">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Dados do conteúdo</div>
              <div className="mt-1 text-xs text-slate-500">Modelo oficial para produção. Sem integração externa nesta fase.</div>

              <div className="mt-4 grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Cliente (nome)</Label>
                    <Input
                      value={form.client_name}
                      onChange={(e) => setForm((p) => ({ ...p, client_name: e.target.value }))}
                      className="mt-1 rounded-2xl"
                      placeholder="Ex: Clínica XPTO"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Cliente (código)</Label>
                    <Input
                      value={form.client_code}
                      onChange={(e) => setForm((p) => ({ ...p, client_code: e.target.value }))}
                      className="mt-1 rounded-2xl"
                      placeholder="Ex: CL-001"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Tema/Título</Label>
                  <Input
                    value={form.theme_title}
                    onChange={(e) => setForm((p) => ({ ...p, theme_title: e.target.value }))}
                    className="mt-1 rounded-2xl"
                    placeholder="Ex: 3 erros comuns no skincare"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <Label className="text-xs">Ciclo</Label>
                    <Input
                      value={form.cycle_number}
                      onChange={(e) => setForm((p) => ({ ...p, cycle_number: e.target.value }))}
                      className="mt-1 rounded-2xl"
                      placeholder="1"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Nº do conteúdo</Label>
                    <Input
                      value={form.content_number}
                      onChange={(e) => setForm((p) => ({ ...p, content_number: e.target.value }))}
                      className="mt-1 rounded-2xl"
                      placeholder="12"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Data de gravação</Label>
                    <Input
                      type="date"
                      value={form.recording_date}
                      onChange={(e) => setForm((p) => ({ ...p, recording_date: e.target.value }))}
                      className="mt-1 rounded-2xl"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Referências / Observações</Label>
                  <Textarea
                    value={form.references_notes}
                    onChange={(e) => setForm((p) => ({ ...p, references_notes: e.target.value }))}
                    className="mt-1 min-h-[90px] rounded-2xl"
                    placeholder="Links, benchmarks, ideias…"
                  />
                </div>

                <div>
                  <Label className="text-xs">Roteiro</Label>
                  <Textarea
                    value={form.script_text}
                    onChange={(e) => setForm((p) => ({ ...p, script_text: e.target.value }))}
                    className="mt-1 min-h-[160px] rounded-2xl"
                    placeholder="Texto do roteiro…"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Duração (seg)</Label>
                    <Input
                      value={form.duration_seconds}
                      onChange={(e) => setForm((p) => ({ ...p, duration_seconds: e.target.value }))}
                      className="mt-1 rounded-2xl"
                      placeholder="30"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Tags (separadas por vírgula)</Label>
                    <Input
                      value={form.tags}
                      onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
                      className="mt-1 rounded-2xl"
                      placeholder="skincare, reels, dicas"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Link do vídeo (opcional)</Label>
                    <Input
                      value={form.video_link}
                      onChange={(e) => setForm((p) => ({ ...p, video_link: e.target.value }))}
                      className="mt-1 rounded-2xl"
                      placeholder="https://…"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Link da capa (opcional)</Label>
                    <Input
                      value={form.cover_link}
                      onChange={(e) => setForm((p) => ({ ...p, cover_link: e.target.value }))}
                      className="mt-1 rounded-2xl"
                      placeholder="https://…"
                    />
                  </div>
                </div>

                {(form.video_link.trim() || form.cover_link.trim()) && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-900">Links</div>
                    <div className="mt-2 grid gap-2 text-xs">
                      {form.video_link.trim() ? (
                        <a
                          className="inline-flex items-center gap-2 text-[hsl(var(--byfrost-accent))] hover:underline"
                          href={form.video_link.trim()}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Film className="h-4 w-4" /> Vídeo <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      {form.cover_link.trim() ? (
                        <a
                          className="inline-flex items-center gap-2 text-[hsl(var(--byfrost-accent))] hover:underline"
                          href={form.cover_link.trim()}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Instagram className="h-4 w-4" /> Capa <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Criar publicação</div>
                <div className="mt-1 text-xs text-slate-500">Crie story/feed e agende no calendário oficial.</div>

                <div className="mt-4 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">Canal</Label>
                      <select
                        value={pubChannel}
                        onChange={(e) => setPubChannel(e.target.value as any)}
                        className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                      >
                        <option value="ig_story">IG Story</option>
                        <option value="ig_feed">IG Feed</option>
                        <option value="ig_reels">IG Reels</option>
                        <option value="fb_feed">FB Feed</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Tipo criativo</Label>
                      <select
                        value={pubCreative}
                        onChange={(e) => setPubCreative(e.target.value as any)}
                        className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                      >
                        <option value="IMAGE">Imagem</option>
                        <option value="VIDEO">Vídeo</option>
                        <option value="CAROUSEL">Carrossel</option>
                        <option value="MIXED">Misto</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Agendar (data e hora)</Label>
                    <Input
                      type="datetime-local"
                      value={pubScheduledAt}
                      onChange={(e) => setPubScheduledAt(e.target.value)}
                      className="mt-1 rounded-2xl"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Legenda (caption)</Label>
                    <Textarea
                      value={pubCaption}
                      onChange={(e) => setPubCaption(e.target.value)}
                      className="mt-1 min-h-[90px] rounded-2xl"
                      placeholder="Texto da legenda…"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Mídia (upload)</Label>
                    <Input
                      ref={pubFilesRef}
                      type="file"
                      multiple
                      className="mt-1 rounded-2xl file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700"
                    />
                    <div className="mt-1 text-[11px] text-slate-500">
                      Será salvo no bucket <span className="font-medium">content-media</span>.
                    </div>
                  </div>

                  <Button
                    onClick={createPublication}
                    disabled={creatingPub || !itemQ.data?.id}
                    className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {creatingPub ? "Criando…" : "Criar publicação"}
                  </Button>

                  {!itemQ.data?.id && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      Primeiro salve o conteúdo para gerar o <span className="font-medium">content_item</span>.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Publicações</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Itens agendados aparecem no calendário oficial.
                    </div>
                  </div>
                  <Badge className="rounded-full border-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
                    {(pubsQ.data ?? []).length}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3">
                  {(pubsQ.data ?? []).map((p) => {
                    const when = p.scheduled_at ? format(new Date(p.scheduled_at), "dd/MM HH:mm") : "—";
                    const media = p.media_storage_paths ?? [];

                    return (
                      <div key={p.id} className="rounded-[20px] border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className="rounded-full border-0 bg-indigo-100 text-indigo-900 hover:bg-indigo-100">
                                {p.channel}
                              </Badge>
                              <Badge
                                className={cn(
                                  "rounded-full border-0",
                                  p.publish_status === "PUBLISHED"
                                    ? "bg-emerald-100 text-emerald-900"
                                    : p.publish_status === "FAILED"
                                      ? "bg-rose-100 text-rose-900"
                                      : p.publish_status === "SCHEDULED"
                                        ? "bg-amber-100 text-amber-900"
                                        : "bg-slate-100 text-slate-700"
                                )}
                              >
                                {p.publish_status}
                              </Badge>
                              <Badge className="rounded-full border-0 bg-white text-slate-700 hover:bg-white">
                                <CalendarDays className="mr-1 h-3.5 w-3.5" /> {when}
                              </Badge>
                            </div>

                            {p.caption_text ? (
                              <div className="mt-2 text-sm text-slate-900 line-clamp-3">{p.caption_text}</div>
                            ) : (
                              <div className="mt-2 text-sm text-slate-500">(sem legenda)</div>
                            )}

                            {media.length ? (
                              <div className="mt-3 grid gap-2">
                                <div className="text-[11px] font-semibold text-slate-700">Mídias</div>
                                <div className="flex flex-wrap gap-2">
                                  {media.map((path) => {
                                    const url = publicUrl("content-media", path);
                                    return (
                                      <a
                                        key={path}
                                        href={url ?? undefined}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                        title={path}
                                      >
                                        <Upload className="h-3.5 w-3.5" />
                                        <span className="max-w-[210px] truncate">{path.split("/").slice(-1)[0]}</span>
                                        <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                                      </a>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}

                            {p.last_error ? (
                              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                                {p.last_error}
                              </div>
                            ) : null}
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
                            <div className="flex items-center gap-2">
                              <Hash className="h-3.5 w-3.5 text-slate-400" />
                              <span className="font-medium text-slate-900">{p.id.slice(0, 8)}…</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {(pubsQ.data ?? []).length === 0 && (
                    <div className="rounded-[20px] border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
                      Ainda não há publicações.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => nav("/app/content")}
            >
              Voltar
            </Button>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
