import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { CalendarClock, Lock, Plus, Trophy, Upload, Users } from "lucide-react";
import { ParticipantsMultiSelect } from "@/components/admin/ParticipantsMultiSelect";

const BUCKET = "tenant-assets";
const UPLOAD_URL =
  "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/upload-tenant-asset";

type ParticipantRow = {
  id: string;
  tenant_id: string;
  name: string;
  display_name: string | null;
  cpf: string | null;
  whatsapp: string | null;
  photo_url: string | null;
  active: boolean;
  created_at: string;
};

type CampaignRow = {
  id: string;
  tenant_id: string;
  name: string;
  participant_scope: "all" | "type" | "custom";
  ranking_type: "revenue" | "points" | "quantity";
  visibility: "public" | "private";
  status: "draft" | "active" | "finished";
  start_date: string | null;
  end_date: string | null;
  finalized_at: string | null;
  created_at: string;
};

type CampaignParticipantRow = {
  id: string;
  tenant_id: string;
  campaign_id: string;
  participant_id: string;
  joined_at: string;
};

type EventRow = {
  id: string;
  tenant_id: string;
  campaign_id: string;
  participant_id: string;
  event_type: string;
  value: number | null;
  points: number | null;
  attachment_url: string | null;
  created_at: string;
};

type SnapshotRow = {
  id: string;
  tenant_id: string;
  campaign_id: string;
  participant_id: string;
  final_position: number;
  final_score: number;
  created_at: string;
};

function initials(name: string) {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const i = parts.map((p) => p[0]?.toUpperCase()).join("");
  return i || "?";
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

async function uploadTenantAsset(params: {
  tenantId: string;
  kind: "participants" | "events";
  file: File;
}) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Sessão inválida");

  const fileBase64 = await fileToBase64(params.file);

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: "upload",
      tenantId: params.tenantId,
      kind: params.kind,
      filename: params.file.name,
      contentType: params.file.type || "application/octet-stream",
      fileBase64,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }

  return {
    bucket: String(json.bucket ?? BUCKET),
    path: String(json.path ?? ""),
    signedUrl: (json.signedUrl as string | null | undefined) ?? null,
  };
}

function normalizeCpf(raw: string) {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 11);
}

function normalizeWhatsapp(raw: string) {
  const s = String(raw ?? "").trim();
  const hasPlus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
}

export function IncentivesPanel() {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();

  // ---- Participants ----
  const [pName, setPName] = useState("");
  const [pDisplayName, setPDisplayName] = useState("");
  const [pCpf, setPCpf] = useState("");
  const [pWhatsapp, setPWhatsapp] = useState("");
  const [creatingParticipant, setCreatingParticipant] = useState(false);

  // ---- Campaigns ----
  const [cName, setCName] = useState("");
  const [cRankingType, setCRankingType] = useState<CampaignRow["ranking_type"]>("points");
  const [cVisibility, setCVisibility] = useState<CampaignRow["visibility"]>("private");
  const [creatingCampaign, setCreatingCampaign] = useState(false);

  const [manageCampaignId, setManageCampaignId] = useState<string | null>(null);
  const [addingParticipantId, setAddingParticipantId] = useState<string | null>(null);
  const [addingParticipant, setAddingParticipant] = useState(false);

  // ---- Events ----
  const [eCampaignId, setECampaignId] = useState<string | null>(null);
  const [eParticipantIds, setEParticipantIds] = useState<string[]>([]);
  const [eType, setEType] = useState<string>("points");
  const [eValue, setEValue] = useState<string>("");
  const [ePoints, setEPoints] = useState<string>("");
  const [creatingEvent, setCreatingEvent] = useState(false);
  const eventFileRef = useRef<HTMLInputElement | null>(null);

  const participantsQ = useQuery({
    queryKey: ["incentives_participants", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incentive_participants")
        .select("id,tenant_id,name,display_name,cpf,whatsapp,photo_url,active,created_at")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ParticipantRow[];
    },
  });

  const campaignsQ = useQuery({
    queryKey: ["incentives_campaigns", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select(
          "id,tenant_id,name,participant_scope,ranking_type,visibility,start_date,end_date,status,finalized_at,created_at"
        )
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });

  const campaignParticipantsQ = useQuery({
    queryKey: ["incentives_campaign_participants", activeTenantId, manageCampaignId],
    enabled: Boolean(activeTenantId && manageCampaignId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_participants")
        .select("id,tenant_id,campaign_id,participant_id,joined_at")
        .eq("tenant_id", activeTenantId!)
        .eq("campaign_id", manageCampaignId!)
        .order("joined_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CampaignParticipantRow[];
    },
  });

  const eventsQ = useQuery({
    queryKey: ["incentives_events", activeTenantId, eCampaignId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("incentive_events")
        .select("id,tenant_id,campaign_id,participant_id,event_type,value,points,attachment_url,created_at")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (eCampaignId) q = q.eq("campaign_id", eCampaignId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const snapshotsQ = useQuery({
    queryKey: ["incentives_snapshots", activeTenantId, manageCampaignId],
    enabled: Boolean(activeTenantId && manageCampaignId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_ranking_snapshot")
        .select("id,tenant_id,campaign_id,participant_id,final_position,final_score,created_at")
        .eq("tenant_id", activeTenantId!)
        .eq("campaign_id", manageCampaignId!)
        .order("final_position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SnapshotRow[];
    },
  });

  const participantsById = useMemo(() => {
    const m = new Map<string, ParticipantRow>();
    for (const p of participantsQ.data ?? []) m.set(p.id, p);
    return m;
  }, [participantsQ.data]);

  const manageCampaign = useMemo(() => {
    if (!manageCampaignId) return null;
    return (campaignsQ.data ?? []).find((c) => c.id === manageCampaignId) ?? null;
  }, [campaignsQ.data, manageCampaignId]);

  const participantIdsInCampaign = useMemo(() => {
    const set = new Set<string>();
    for (const row of campaignParticipantsQ.data ?? []) set.add(row.participant_id);
    return set;
  }, [campaignParticipantsQ.data]);

  const availableParticipants = useMemo(() => {
    return (participantsQ.data ?? []).filter((p) => !participantIdsInCampaign.has(p.id));
  }, [participantsQ.data, participantIdsInCampaign]);

  // Signed URLs for participant photos (best-effort)
  const [photoSignedUrls, setPhotoSignedUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const rows = participantsQ.data ?? [];
      const paths = rows
        .map((p) => p.photo_url)
        .filter((p): p is string => Boolean(p))
        .slice(0, 24);

      if (!paths.length) {
        setPhotoSignedUrls({});
        return;
      }

      const pairs = await Promise.all(
        paths.map(async (path) => {
          const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
          if (error || !data?.signedUrl) return [path, ""] as const;
          return [path, data.signedUrl] as const;
        })
      );

      if (cancelled) return;

      const next: Record<string, string> = {};
      for (const [path, url] of pairs) {
        if (url) next[path] = url;
      }
      setPhotoSignedUrls(next);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [participantsQ.data]);

  const createParticipant = async () => {
    if (!activeTenantId) return;

    const cpf = normalizeCpf(pCpf);
    const whatsapp = normalizeWhatsapp(pWhatsapp);

    if (!pName.trim()) {
      showError("Informe o nome.");
      return;
    }
    if (cpf.length !== 11) {
      showError("Informe um CPF válido (11 dígitos, sem pontuação).");
      return;
    }
    if (!whatsapp) {
      showError("Informe o WhatsApp.");
      return;
    }

    setCreatingParticipant(true);
    try {
      const { error } = await supabase.from("incentive_participants").insert({
        tenant_id: activeTenantId,
        name: pName.trim(),
        display_name: pDisplayName.trim() || null,
        cpf,
        whatsapp,
      });
      if (error) throw error;
      setPName("");
      setPDisplayName("");
      setPCpf("");
      setPWhatsapp("");
      showSuccess("Participante criado.");
      await qc.invalidateQueries({ queryKey: ["incentives_participants", activeTenantId] });
    } catch (e: any) {
      const msg = String(e?.message ?? "erro");
      const msgLower = msg.toLowerCase();

      // PostgREST schema cache errors may refer to missing table OR missing columns.
      if (msgLower.includes("schema cache") && msgLower.includes("column")) {
        showError(
          "O banco ainda não tem as colunas obrigatórias (cpf/whatsapp) ou o schema cache não atualizou. Execute a migration 0025 e rode: notify pgrst, 'reload schema'."
        );
        return;
      }

      if (msgLower.includes("schema cache") || msgLower.includes("could not find the table")) {
        showError(
          "As migrations do Incentive Engine ainda não foram aplicadas neste Supabase (ou o app está apontando para outro projeto). Aplique 0021+ e rode: notify pgrst, 'reload schema'."
        );
        return;
      }

      showError(`Falha ao criar participante: ${msg}`);
    } finally {
      setCreatingParticipant(false);
    }
  };

  const uploadParticipantPhoto = async (participantId: string, file: File) => {
    if (!activeTenantId) return;

    try {
      const up = await uploadTenantAsset({ tenantId: activeTenantId, kind: "participants", file });
      if (!up.path) throw new Error("Upload não retornou path");

      const { error } = await supabase
        .from("incentive_participants")
        .update({ photo_url: up.path })
        .eq("tenant_id", activeTenantId)
        .eq("id", participantId);

      if (error) throw error;

      showSuccess("Foto atualizada.");
      await qc.invalidateQueries({ queryKey: ["incentives_participants", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao enviar foto: ${e?.message ?? "erro"}`);
    }
  };

  const toggleParticipantActive = async (participantId: string, nextActive: boolean) => {
    if (!activeTenantId) return;

    try {
      const { error } = await supabase
        .from("incentive_participants")
        .update({ active: nextActive })
        .eq("tenant_id", activeTenantId)
        .eq("id", participantId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["incentives_participants", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao atualizar participante: ${e?.message ?? "erro"}`);
    }
  };

  const createCampaign = async () => {
    if (!activeTenantId) return;
    if (!cName.trim()) {
      showError("Informe o nome da campanha.");
      return;
    }

    setCreatingCampaign(true);
    try {
      const { error } = await supabase.from("campaigns").insert({
        tenant_id: activeTenantId,
        name: cName.trim(),
        ranking_type: cRankingType,
        visibility: cVisibility,
        participant_scope: "custom",
        status: "draft",
      });
      if (error) throw error;
      setCName("");
      showSuccess("Campanha criada.");
      await qc.invalidateQueries({ queryKey: ["incentives_campaigns", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao criar campanha: ${e?.message ?? "erro"}`);
    } finally {
      setCreatingCampaign(false);
    }
  };

  const updateCampaign = async (campaignId: string, patch: Partial<CampaignRow>) => {
    if (!activeTenantId) return;

    try {
      const { error } = await supabase
        .from("campaigns")
        .update(patch)
        .eq("tenant_id", activeTenantId)
        .eq("id", campaignId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["incentives_campaigns", activeTenantId] });
      if (manageCampaignId === campaignId) {
        await qc.invalidateQueries({
          queryKey: ["incentives_campaign_participants", activeTenantId, manageCampaignId],
        });
        await qc.invalidateQueries({
          queryKey: ["incentives_snapshots", activeTenantId, manageCampaignId],
        });
      }
    } catch (e: any) {
      showError(`Falha ao atualizar campanha: ${e?.message ?? "erro"}`);
    }
  };

  const finalizeCampaign = async (campaignId: string) => {
    await updateCampaign(campaignId, { status: "finished" });
    showSuccess("Campanha finalizada. Snapshot do ranking será criado automaticamente.");
  };

  const addParticipantToCampaign = async () => {
    if (!activeTenantId || !manageCampaignId || !addingParticipantId) return;

    setAddingParticipant(true);
    try {
      const { error } = await supabase.from("campaign_participants").insert({
        tenant_id: activeTenantId,
        campaign_id: manageCampaignId,
        participant_id: addingParticipantId,
      });
      if (error) throw error;
      setAddingParticipantId(null);
      showSuccess("Participante vinculado.");
      await qc.invalidateQueries({
        queryKey: ["incentives_campaign_participants", activeTenantId, manageCampaignId],
      });
    } catch (e: any) {
      showError(`Falha ao vincular participante: ${e?.message ?? "erro"}`);
    } finally {
      setAddingParticipant(false);
    }
  };

  const removeParticipantFromCampaign = async (participantId: string) => {
    if (!activeTenantId || !manageCampaignId) return;

    try {
      const { error } = await supabase
        .from("campaign_participants")
        .delete()
        .eq("tenant_id", activeTenantId)
        .eq("campaign_id", manageCampaignId)
        .eq("participant_id", participantId);

      if (error) throw error;
      showSuccess("Participante removido da campanha.");
      await qc.invalidateQueries({
        queryKey: ["incentives_campaign_participants", activeTenantId, manageCampaignId],
      });
    } catch (e: any) {
      showError(`Falha ao remover: ${e?.message ?? "erro"}`);
    }
  };

  const createEvent = async () => {
    if (!activeTenantId) return;
    if (!eCampaignId || eParticipantIds.length === 0) {
      showError("Selecione campanha e pelo menos 1 participante.");
      return;
    }

    setCreatingEvent(true);
    try {
      const file = eventFileRef.current?.files?.[0] ?? null;
      let attachmentPath: string | null = null;

      if (file) {
        const up = await uploadTenantAsset({ tenantId: activeTenantId, kind: "events", file });
        attachmentPath = up.path || null;
      }

      const valueNum = eValue.trim() ? Number(eValue.replace(",", ".")) : null;
      const pointsNum = ePoints.trim() ? Number(ePoints.replace(",", ".")) : null;

      const rows = eParticipantIds.map((pid) => ({
        tenant_id: activeTenantId,
        campaign_id: eCampaignId,
        participant_id: pid,
        event_type: eType,
        value: Number.isFinite(valueNum as any) ? valueNum : null,
        points: Number.isFinite(pointsNum as any) ? pointsNum : null,
        attachment_url: attachmentPath,
      }));

      const { error } = await supabase.from("incentive_events").insert(rows);
      if (error) throw error;

      setEValue("");
      setEPoints("");
      setEParticipantIds([]);
      if (eventFileRef.current) eventFileRef.current.value = "";

      showSuccess(`Evento lançado para ${rows.length} participante(s).`);
      await qc.invalidateQueries({ queryKey: ["incentives_events", activeTenantId, eCampaignId] });
    } catch (e: any) {
      showError(`Falha ao lançar evento: ${e?.message ?? "erro"}`);
    } finally {
      setCreatingEvent(false);
    }
  };

  if (!activeTenantId) {
    return (
      <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Selecione um tenant (botão "Trocar") para configurar Incentives.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <Card className="rounded-[22px] border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Incentive Engine</div>
            <div className="mt-1 text-xs text-slate-500">
              Cadastre participantes, crie campanhas, vincule participantes e lance eventos. O ranking é calculado em tempo real
              e pode ser publicado com <span className="font-medium">visibility=public</span>.
            </div>
          </div>
          <Badge className="rounded-full border-0 bg-slate-100 text-slate-700">tenant-assets privado</Badge>
        </div>
      </Card>

      <Tabs defaultValue="participants">
        <TabsList className="rounded-2xl bg-white/70 p-1">
          <TabsTrigger value="participants" className="rounded-xl">
            <Users className="mr-2 h-4 w-4" /> Participantes
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="rounded-xl">
            <Trophy className="mr-2 h-4 w-4" /> Campanhas
          </TabsTrigger>
          <TabsTrigger value="events" className="rounded-xl">
            <CalendarClock className="mr-2 h-4 w-4" /> Eventos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="participants" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <Card className="rounded-[22px] border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Preparar participante</div>
              <div className="mt-1 text-xs text-slate-500">
                Obrigatórios: <span className="font-medium">nome</span>, <span className="font-medium">CPF</span> e{" "}
                <span className="font-medium">WhatsApp</span>. No ranking público, exibimos apenas display_name e foto.
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <Label className="text-xs">Nome (obrigatório)</Label>
                  <Input
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    className="mt-1 h-11 rounded-2xl"
                    placeholder="Ex: Maria Silva"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">CPF (obrigatório)</Label>
                    <Input
                      value={pCpf}
                      onChange={(e) => setPCpf(e.target.value)}
                      className="mt-1 h-11 rounded-2xl"
                      placeholder="Somente números"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">WhatsApp (obrigatório)</Label>
                    <Input
                      value={pWhatsapp}
                      onChange={(e) => setPWhatsapp(e.target.value)}
                      className="mt-1 h-11 rounded-2xl"
                      placeholder="Ex: +5511999999999"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Display name (opcional)</Label>
                  <Input
                    value={pDisplayName}
                    onChange={(e) => setPDisplayName(e.target.value)}
                    className="mt-1 h-11 rounded-2xl"
                    placeholder="Ex: Maria S."
                  />
                </div>

                <Button
                  onClick={createParticipant}
                  disabled={creatingParticipant}
                  className="h-11 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {creatingParticipant ? "Criando…" : "Criar participante"}
                </Button>
              </div>
            </Card>

            <Card className="rounded-[22px] border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Participantes</div>
                <div className="text-xs text-slate-500">{participantsQ.data?.length ?? 0}</div>
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Participante</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(participantsQ.data ?? []).map((p) => {
                      const display = p.display_name ?? p.name;
                      const photo = p.photo_url ? photoSignedUrls[p.photo_url] : undefined;
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarImage src={photo} alt={display} />
                                <AvatarFallback className="bg-slate-100 text-slate-700">
                                  {initials(display)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-900">{display}</div>
                                <div className="mt-0.5 truncate text-[11px] text-slate-500">{p.id.slice(0, 8)}…</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={cn(
                                "rounded-full border-0",
                                p.active ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"
                              )}
                            >
                              {p.active ? "ativo" : "inativo"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                                <Upload className="h-4 w-4" /> Foto
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    uploadParticipantPhoto(p.id, f);
                                    e.currentTarget.value = "";
                                  }}
                                />
                              </label>
                              <Button
                                variant="secondary"
                                className="h-9 rounded-2xl"
                                onClick={() => toggleParticipantActive(p.id, !p.active)}
                              >
                                {p.active ? "Desativar" : "Ativar"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {(participantsQ.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-sm text-slate-500">
                          Nenhum participante ainda.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <Card className="rounded-[22px] border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Criar campanha</div>
              <div className="mt-1 text-xs text-slate-500">
                Dica: deixe <span className="font-medium">visibility=private</span> até estar pronto para publicar.
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <Label className="text-xs">Nome</Label>
                  <Input
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                    className="mt-1 h-11 rounded-2xl"
                    placeholder="Ex: Campanha Fevereiro"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Ranking</Label>
                    <Select value={cRankingType} onValueChange={(v) => setCRankingType(v as any)}>
                      <SelectTrigger className="mt-1 h-11 rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="points">points</SelectItem>
                        <SelectItem value="revenue">revenue</SelectItem>
                        <SelectItem value="quantity">quantity</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Visibilidade</Label>
                    <Select value={cVisibility} onValueChange={(v) => setCVisibility(v as any)}>
                      <SelectTrigger className="mt-1 h-11 rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private">private</SelectItem>
                        <SelectItem value="public">public</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={createCampaign}
                  disabled={creatingCampaign}
                  className="h-11 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {creatingCampaign ? "Criando…" : "Criar campanha"}
                </Button>
              </div>
            </Card>

            <Card className="rounded-[22px] border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Campanhas</div>
                <div className="text-xs text-slate-500">{campaignsQ.data?.length ?? 0}</div>
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campanha</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(campaignsQ.data ?? []).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">{c.name}</div>
                            <div className="mt-0.5 truncate text-[11px] text-slate-500">
                              {c.visibility} • {c.ranking_type} • {c.id.slice(0, 8)}…
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              "rounded-full border-0",
                              c.status === "finished"
                                ? "bg-slate-200 text-slate-900"
                                : c.status === "active"
                                  ? "bg-emerald-100 text-emerald-900"
                                  : "bg-slate-100 text-slate-700"
                            )}
                          >
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="secondary"
                              className="h-9 rounded-2xl"
                              onClick={() => setManageCampaignId(c.id)}
                            >
                              Gerenciar
                            </Button>
                            <Button
                              variant="secondary"
                              className="h-9 rounded-2xl"
                              onClick={() =>
                                updateCampaign(c.id, {
                                  visibility: c.visibility === "public" ? "private" : "public",
                                })
                              }
                            >
                              {c.visibility === "public" ? "Tornar private" : "Tornar public"}
                            </Button>
                            <Button
                              className="h-9 rounded-2xl"
                              disabled={c.status === "finished"}
                              onClick={() => finalizeCampaign(c.id)}
                            >
                              <Lock className="mr-2 h-4 w-4" /> Finalizar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}

                    {(campaignsQ.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-sm text-slate-500">
                          Nenhuma campanha ainda.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-3 text-[11px] text-slate-500">
                Ranking público: use <span className="font-medium">/incentives/&lt;tenant_slug&gt;/&lt;campaign_id&gt;</span> (somente
                quando a campanha estiver <span className="font-medium">public</span>).
              </div>
            </Card>
          </div>

          <Dialog open={Boolean(manageCampaignId)} onOpenChange={(o) => !o && setManageCampaignId(null)}>
            <DialogContent className="max-w-3xl rounded-3xl">
              <DialogHeader>
                <DialogTitle>Gerenciar campanha</DialogTitle>
                <DialogDescription>
                  Vincule participantes e confira o snapshot (após finalizar). O snapshot é criado automaticamente.
                </DialogDescription>
              </DialogHeader>

              {!manageCampaign ? (
                <div className="text-sm text-slate-600">Carregando…</div>
              ) : (
                <div className="grid gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{manageCampaign.name}</div>
                        <div className="mt-1 text-xs text-slate-600">
                          {manageCampaign.visibility} • {manageCampaign.ranking_type} • status {manageCampaign.status}
                          {manageCampaign.finalized_at
                            ? ` • finalized_at ${new Date(manageCampaign.finalized_at).toLocaleString()}`
                            : ""}
                        </div>
                      </div>
                      {manageCampaign.visibility === "public" && (
                        <Badge className="rounded-full border-0 bg-emerald-100 text-emerald-900">pública</Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="rounded-3xl border-slate-200 p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-900">Vincular participante</div>
                        <Badge className="rounded-full border-0 bg-slate-100 text-slate-700">
                          {(campaignParticipantsQ.data ?? []).length}
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-3">
                        <Select value={addingParticipantId ?? ""} onValueChange={(v) => setAddingParticipantId(v)}>
                          <SelectTrigger className="h-11 rounded-2xl">
                            <SelectValue placeholder="Selecione um participante" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableParticipants.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.display_name ?? p.name}
                              </SelectItem>
                            ))}
                            {availableParticipants.length === 0 && (
                              <div className="px-3 py-2 text-xs text-slate-500">Nenhum disponível.</div>
                            )}
                          </SelectContent>
                        </Select>

                        <Button
                          onClick={addParticipantToCampaign}
                          disabled={addingParticipant || !addingParticipantId}
                          className="h-11 rounded-2xl"
                        >
                          <Users className="mr-2 h-4 w-4" />
                          {addingParticipant ? "Vinculando…" : "Vincular"}
                        </Button>

                        <Separator />

                        <div className="grid gap-2">
                          {(campaignParticipantsQ.data ?? []).map((cp) => {
                            const p = participantsById.get(cp.participant_id);
                            const name = p ? p.display_name ?? p.name : cp.participant_id;
                            return (
                              <div
                                key={cp.id}
                                className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium text-slate-900">{name}</div>
                                  <div className="mt-0.5 text-[11px] text-slate-500">
                                    joined {new Date(cp.joined_at).toLocaleString()}
                                  </div>
                                </div>
                                <Button
                                  variant="secondary"
                                  className="h-9 rounded-2xl"
                                  onClick={() => removeParticipantFromCampaign(cp.participant_id)}
                                >
                                  Remover
                                </Button>
                              </div>
                            );
                          })}

                          {(campaignParticipantsQ.data ?? []).length === 0 && (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-3 text-xs text-slate-500">
                              Nenhum participante vinculado ainda.
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>

                    <Card className="rounded-3xl border-slate-200 p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-900">Snapshot (após finalizar)</div>
                        <Badge className="rounded-full border-0 bg-slate-100 text-slate-700">
                          {(snapshotsQ.data ?? []).length}
                        </Badge>
                      </div>
                      <div className="mt-3">
                        {manageCampaign.status !== "finished" ? (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                            O snapshot é criado automaticamente quando você finaliza a campanha.
                          </div>
                        ) : (
                          <div className="grid gap-2">
                            {(snapshotsQ.data ?? []).slice(0, 10).map((s) => {
                              const p = participantsById.get(s.participant_id);
                              const name = p ? p.display_name ?? p.name : s.participant_id;
                              return (
                                <div
                                  key={s.id}
                                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-slate-900">
                                      #{s.final_position} • {name}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-slate-500">score {s.final_score}</div>
                                  </div>
                                </div>
                              );
                            })}

                            {(snapshotsQ.data ?? []).length === 0 && (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-3 text-xs text-slate-500">
                                Snapshot ainda vazio (campanha finalizada sem participantes/eventos?).
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => setManageCampaignId(null)}>
                  Fechar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <Card className="rounded-[22px] border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Lançar evento</div>
              <div className="mt-1 text-xs text-slate-500">
                O ranking usa <span className="font-medium">value</span> quando a campanha é <span className="font-medium">revenue</span> e
                <span className="font-medium"> points</span> quando é <span className="font-medium">points</span>.
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <Label className="text-xs">Campanha</Label>
                  <Select value={eCampaignId ?? ""} onValueChange={(v) => setECampaignId(v)}>
                    <SelectTrigger className="mt-1 h-11 rounded-2xl">
                      <SelectValue placeholder="Selecione uma campanha" />
                    </SelectTrigger>
                    <SelectContent>
                      {(campaignsQ.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.status})
                        </SelectItem>
                      ))}
                      {(campaignsQ.data ?? []).length === 0 && (
                        <div className="px-3 py-2 text-xs text-slate-500">Crie uma campanha primeiro.</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Participante</Label>
                  <div className="mt-1">
                    <ParticipantsMultiSelect
                      options={(participantsQ.data ?? []).map((p) => ({
                        value: p.id,
                        label: p.display_name ?? p.name,
                      }))}
                      value={eParticipantIds}
                      onChange={setEParticipantIds}
                      placeholder="Selecione 1 ou mais participantes"
                      disabled={creatingEvent}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={eType} onValueChange={setEType}>
                      <SelectTrigger className="mt-1 h-11 rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sale">sale</SelectItem>
                        <SelectItem value="indication">indication</SelectItem>
                        <SelectItem value="points">points</SelectItem>
                        <SelectItem value="bonus">bonus</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Value</Label>
                    <Input
                      value={eValue}
                      onChange={(e) => setEValue(e.target.value)}
                      className="mt-1 h-11 rounded-2xl"
                      placeholder="Ex: 1500"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Points</Label>
                    <Input
                      value={ePoints}
                      onChange={(e) => setEPoints(e.target.value)}
                      className="mt-1 h-11 rounded-2xl"
                      placeholder="Ex: 10"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Anexo (opcional)</Label>
                  <Input ref={eventFileRef} type="file" className="mt-1 rounded-2xl" />
                  <div className="mt-1 text-[11px] text-slate-500">Armazenado no bucket privado tenant-assets.</div>
                </div>

                <Button onClick={createEvent} disabled={creatingEvent} className="h-11 rounded-2xl">
                  {creatingEvent ? "Enviando…" : eParticipantIds.length > 1 ? `Lançar evento (${eParticipantIds.length})` : "Lançar evento"}
                </Button>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    <Lock className="h-4 w-4" /> Bloqueio após finalização
                  </div>
                  <div className="mt-1">
                    Quando uma campanha vira <span className="font-medium">finished</span>, novos eventos ficam bloqueados para usuários comuns
                    (admins/super-admin ainda podem inserir).
                  </div>
                </div>
              </div>
            </Card>

            <Card className="rounded-[22px] border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Eventos recentes</div>
                <Button variant="secondary" className="h-9 rounded-2xl" onClick={() => eventsQ.refetch()}>
                  Atualizar
                </Button>
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Participante</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Value/Points</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(eventsQ.data ?? []).map((e) => {
                      const p = participantsById.get(e.participant_id);
                      const pn = p ? p.display_name ?? p.name : e.participant_id.slice(0, 8) + "…";
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs text-slate-600">{new Date(e.created_at).toLocaleString()}</TableCell>
                          <TableCell className="text-sm font-medium text-slate-900">{pn}</TableCell>
                          <TableCell>
                            <Badge className="rounded-full border-0 bg-slate-100 text-slate-700">{e.event_type}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold text-slate-900">
                            {e.value ?? "—"} / {e.points ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {(eventsQ.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-slate-500">
                          Nenhum evento ainda.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}