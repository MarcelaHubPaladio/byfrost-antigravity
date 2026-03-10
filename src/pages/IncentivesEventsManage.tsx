import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase, SUPABASE_URL_IN_USE } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { ParticipantsMultiSelect } from "@/components/admin/ParticipantsMultiSelect";
import { showError, showSuccess } from "@/utils/toast";
import { CalendarClock, Pencil, Trash2 } from "lucide-react";

const BUCKET = "tenant-assets";
const UPLOAD_URL =
  `${SUPABASE_URL_IN_USE}/functions/v1/upload-tenant-asset`;

type ParticipantRow = {
  id: string;
  tenant_id: string;
  name: string;
  display_name: string | null;
};

type CampaignRow = {
  id: string;
  tenant_id: string;
  name: string;
  status: "draft" | "active" | "finished";
  visibility: "public" | "private";
};

type EventRow = {
  id: string;
  tenant_id: string;
  campaign_id: string;
  participant_id: string;
  event_type: "sale" | "indication" | "points" | "bonus";
  value: number | null;
  points: number | null;
  attachment_url: string | null;
  created_at: string;
};

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = (error) => reject(error);
  });
}

async function uploadTenantAsset(params: {
  tenantId: string;
  kind: "events";
  file: File;
}) {
  const b64 = await fileToBase64(params.file);

  const { data: json, error: upError } = await supabase.functions.invoke("upload-tenant-asset", {
    body: {
      action: "upload",
      tenantId: params.tenantId,
      kind: params.kind,
      fileName: params.file.name,
      mimeType: params.file.type || "application/octet-stream",
      mediaBase64: b64,
    },
  });

  if (upError || !json?.ok) {
    throw new Error(upError?.message || json?.error || "Erro no upload");
  }

  return {
    bucket: String(json.bucket ?? BUCKET),
    path: String(json.path ?? ""),
    signedUrl: (json.signedUrl as string | null | undefined) ?? null,
  };
}

export default function IncentivesEventsManage() {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();

  // create
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [eventType, setEventType] = useState<EventRow["event_type"]>("points");
  const [value, setValue] = useState<string>("");
  const [points, setPoints] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const eventFileRef = useRef<HTMLInputElement | null>(null);

  // edit
  const [editOpen, setEditOpen] = useState(false);
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editType, setEditType] = useState<EventRow["event_type"]>("points");
  const [editValue, setEditValue] = useState<string>("");
  const [editPoints, setEditPoints] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);

  const participantsQ = useQuery({
    queryKey: ["incentives_manage_participants", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incentive_participants")
        .select("id,tenant_id,name,display_name")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as ParticipantRow[];
    },
  });

  const campaignsQ = useQuery({
    queryKey: ["incentives_manage_campaigns", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id,tenant_id,name,status,visibility")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });

  const eventsQ = useQuery({
    queryKey: ["incentives_manage_events", activeTenantId, campaignId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("incentive_events")
        .select("id,tenant_id,campaign_id,participant_id,event_type,value,points,attachment_url,created_at")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (campaignId) q = q.eq("campaign_id", campaignId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const participantsById = useMemo(() => {
    const m = new Map<string, ParticipantRow>();
    for (const p of participantsQ.data ?? []) m.set(p.id, p);
    return m;
  }, [participantsQ.data]);

  const campaignsById = useMemo(() => {
    const m = new Map<string, CampaignRow>();
    for (const c of campaignsQ.data ?? []) m.set(c.id, c);
    return m;
  }, [campaignsQ.data]);

  const openEdit = (e: EventRow) => {
    setEditEventId(e.id);
    setEditType(e.event_type);
    setEditValue(e.value == null ? "" : String(e.value));
    setEditPoints(e.points == null ? "" : String(e.points));
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!activeTenantId || !editEventId) return;
    setSavingEdit(true);
    try {
      const valueNum = editValue.trim() ? Number(editValue.replace(",", ".")) : null;
      const pointsNum = editPoints.trim() ? Number(editPoints.replace(",", ".")) : null;

      const { error } = await supabase
        .from("incentive_events")
        .update({
          event_type: editType,
          value: Number.isFinite(valueNum as any) ? valueNum : null,
          points: Number.isFinite(pointsNum as any) ? pointsNum : null,
        })
        .eq("tenant_id", activeTenantId)
        .eq("id", editEventId);

      if (error) throw error;
      showSuccess("Evento atualizado.");
      setEditOpen(false);
      await qc.invalidateQueries({ queryKey: ["incentives_manage_events", activeTenantId, campaignId] });
    } catch (e: any) {
      showError(`Falha ao editar evento: ${e?.message ?? "erro"}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteEvent = async (id: string) => {
    if (!activeTenantId) return;
    try {
      const { error } = await supabase
        .from("incentive_events")
        .delete()
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;
      showSuccess("Evento removido.");
      await qc.invalidateQueries({ queryKey: ["incentives_manage_events", activeTenantId, campaignId] });
    } catch (e: any) {
      showError(`Falha ao remover evento: ${e?.message ?? "erro"}`);
    }
  };

  const createEvents = async () => {
    if (!activeTenantId) return;
    if (!campaignId || participantIds.length === 0) {
      showError("Selecione campanha e pelo menos 1 participante.");
      return;
    }

    setCreating(true);
    try {
      const file = eventFileRef.current?.files?.[0] ?? null;
      let attachmentPath: string | null = null;

      if (file) {
        const up = await uploadTenantAsset({ tenantId: activeTenantId, kind: "events", file });
        attachmentPath = up.path || null;
      }

      const valueNum = value.trim() ? Number(value.replace(",", ".")) : null;
      const pointsNum = points.trim() ? Number(points.replace(",", ".")) : null;

      const rows = participantIds.map((pid) => ({
        tenant_id: activeTenantId,
        campaign_id: campaignId,
        participant_id: pid,
        event_type: eventType,
        value: Number.isFinite(valueNum as any) ? valueNum : null,
        points: Number.isFinite(pointsNum as any) ? pointsNum : null,
        attachment_url: attachmentPath,
      }));

      const { error } = await supabase.from("incentive_events").insert(rows);
      if (error) throw error;

      setValue("");
      setPoints("");
      setParticipantIds([]);
      if (eventFileRef.current) eventFileRef.current.value = "";

      showSuccess(`Evento lançado para ${rows.length} participante(s).`);
      await qc.invalidateQueries({ queryKey: ["incentives_manage_events", activeTenantId, campaignId] });
    } catch (e: any) {
      showError(`Falha ao lançar evento: ${e?.message ?? "erro"}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <RequireAuth>
      <AppShell>
        <div className="grid gap-4">
          <Card className="rounded-[22px] border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <CalendarClock className="h-4 w-4" />
                  Incentivos • Gestão de eventos
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Crie eventos (um por participante selecionado) e edite/remova eventos recentes.
                </div>
              </div>
              <Button variant="secondary" className="h-9 rounded-2xl" onClick={() => eventsQ.refetch()}>
                Atualizar
              </Button>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <Card className="rounded-[22px] border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Lançar evento</div>
              <div className="mt-4 grid gap-3">
                <div>
                  <Label className="text-xs">Campanha</Label>
                  <Select value={campaignId ?? ""} onValueChange={(v) => setCampaignId(v)}>
                    <SelectTrigger className="mt-1 h-11 rounded-2xl">
                      <SelectValue placeholder="Selecione uma campanha" />
                    </SelectTrigger>
                    <SelectContent>
                      {(campaignsQ.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Participantes</Label>
                  <div className="mt-1">
                    <ParticipantsMultiSelect
                      options={(participantsQ.data ?? []).map((p) => ({
                        value: p.id,
                        label: p.display_name ?? p.name,
                      }))}
                      value={participantIds}
                      onChange={setParticipantIds}
                      placeholder="Selecione 1 ou mais participantes"
                      disabled={creating}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={eventType} onValueChange={(v) => setEventType(v as any)}>
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
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      className="mt-1 h-11 rounded-2xl"
                      placeholder="Ex: 1500"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Points</Label>
                    <Input
                      value={points}
                      onChange={(e) => setPoints(e.target.value)}
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

                <Button onClick={createEvents} disabled={creating} className="h-11 rounded-2xl">
                  {creating
                    ? "Enviando…"
                    : participantIds.length > 1
                      ? `Lançar evento (${participantIds.length})`
                      : "Lançar evento"}
                </Button>
              </div>
            </Card>

            <Card className="rounded-[22px] border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Eventos recentes</div>
                <div className="text-xs text-slate-500">{(eventsQ.data ?? []).length}</div>
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Campanha</TableHead>
                      <TableHead>Participante</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Value/Points</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(eventsQ.data ?? []).map((e) => {
                      const p = participantsById.get(e.participant_id);
                      const pn = p ? p.display_name ?? p.name : e.participant_id.slice(0, 8) + "…";
                      const c = campaignsById.get(e.campaign_id);
                      const cn = c ? c.name : e.campaign_id.slice(0, 8) + "…";
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs text-slate-600">{new Date(e.created_at).toLocaleString()}</TableCell>
                          <TableCell className="text-sm font-medium text-slate-900">{cn}</TableCell>
                          <TableCell className="text-sm font-medium text-slate-900">{pn}</TableCell>
                          <TableCell>
                            <Badge className="rounded-full border-0 bg-slate-100 text-slate-700">{e.event_type}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold text-slate-900">
                            {e.value ?? "—"} / {e.points ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="secondary" className="h-9 rounded-2xl" onClick={() => openEdit(e)}>
                                <Pencil className="h-4 w-4" />
                              </Button>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="secondary" className="h-9 rounded-2xl" title="Remover">
                                    <Trash2 className="h-4 w-4 text-rose-600" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-3xl">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remover evento?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta ação não pode ser desfeita. O evento será excluído do ranking.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
                                    <AlertDialogAction className="rounded-2xl" onClick={() => deleteEvent(e.id)}>
                                      Remover
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {(eventsQ.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                          Nenhum evento.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        </div>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg rounded-3xl">
            <DialogHeader>
              <DialogTitle>Editar evento</DialogTitle>
              <DialogDescription>Altere tipo/value/points. (Participante/campanha não são alterados aqui.)</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={editType} onValueChange={(v) => setEditType(v as any)}>
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

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Value</Label>
                  <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="mt-1 h-11 rounded-2xl" />
                </div>
                <div>
                  <Label className="text-xs">Points</Label>
                  <Input value={editPoints} onChange={(e) => setEditPoints(e.target.value)} className="mt-1 h-11 rounded-2xl" />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button className="h-10 rounded-2xl" onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppShell>
    </RequireAuth>
  );
}
