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
import { CalendarClock, Pencil, Trash2, LayoutGrid, ListTodo } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const BUCKET = "tenant-assets";
const UPLOAD_URL =
  `${SUPABASE_URL_IN_USE}/functions/v1/upload-tenant-asset`;

type SellerRow = {
  user_id: string;
  display_name: string | null;
  email?: string | null;
};

type ParticipantRow = {
  id: string;
  tenant_id: string;
  name: string;
  user_id: string | null;
};

type CampaignRow = {
  id: string;
  tenant_id: string;
  name: string;
  status: "draft" | "active" | "finished";
  visibility: "public" | "private";
  metadata?: {
    commission_rate?: number;
  };
};

type EventRow = {
  id: string;
  tenant_id: string;
  campaign_id: string;
  participant_id: string;
  event_type: "sale" | "indication" | "points" | "bonus";
  value: number | null;
  points: number | null;
  order_number: string | null;
  commission_rate: number | null;
  commission_value: number | null;
  source_entity_id: string | null;
  related_entity_id: string | null;
  attachment_url: string | null;
  created_at: string;
};

type EntityRow = {
  id: string;
  display_name: string;
  subtype: string | null;
};


async function uploadTenantAsset(params: {
  tenantId: string;
  kind: "events";
  file: File;
}) {
  const fd = new FormData();
  fd.append("tenantId", params.tenantId);
  fd.append("kind", params.kind);
  fd.append("file", params.file);

  const { data: json, error: upError } = await supabase.functions.invoke("upload-tenant-asset", {
    body: fd,
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
  const [eventType, setEventType] = useState<EventRow["event_type"]>("sale");
  const [value, setValue] = useState<string>("");
  const [points, setPoints] = useState<string>("");
  const [orderNumber, setOrderNumber] = useState("");
  const [commissionRate, setCommissionRate] = useState("");
  const [sourceEntityId, setSourceEntityId] = useState<string | null>(null);
  const [relatedEntityId, setRelatedEntityId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("launch");
  const [creating, setCreating] = useState(false);
  const eventFileRef = useRef<HTMLInputElement | null>(null);

  // quick painter create
  const [showQuickPainter, setShowQuickPainter] = useState(false);
  const [qpName, setQpName] = useState("");
  const [qpCpf, setQpCpf] = useState("");
  const [qpWhatsapp, setQpWhatsapp] = useState("");
  const [creatingP, setCreatingP] = useState(false);

  // edit
  const [editOpen, setEditOpen] = useState(false);
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editType, setEditType] = useState<EventRow["event_type"]>("points");
  const [editValue, setEditValue] = useState<string>("");
  const [editPoints, setEditPoints] = useState<string>("");
  const [editOrderNumber, setEditOrderNumber] = useState("");
  const [editCommissionRate, setEditCommissionRate] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const sellersQ = useQuery({
    queryKey: ["incentives_sellers_users", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id, display_name, email")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SellerRow[];
    },
  });

  const participantsQ = useQuery({
    queryKey: ["incentives_participants_map", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incentive_participants")
        .select("id,tenant_id,name,user_id")
        .eq("tenant_id", activeTenantId!);
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
        .select("id,tenant_id,name,status,visibility,metadata")
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
        .select("id,tenant_id,campaign_id,participant_id,event_type,value,points,order_number,commission_rate,commission_value,source_entity_id,related_entity_id,attachment_url,created_at")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (campaignId) q = q.eq("campaign_id", campaignId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const entitiesQ = useQuery({
    queryKey: ["incentives_manage_entities", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id, display_name, subtype")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .in("subtype", ["fornecedor", "pintor"]);
      if (error) throw error;
      return (data ?? []) as EntityRow[];
    },
  });

  const suppliers = useMemo(() => (entitiesQ.data ?? []).filter(e => e.subtype === "fornecedor"), [entitiesQ.data]);
  const painters = useMemo(() => (entitiesQ.data ?? []).filter(e => e.subtype === "pintor"), [entitiesQ.data]);

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
      const commRateNum = editCommissionRate.trim() ? Number(editCommissionRate.replace(",", ".")) : null;
      const commValue = (valueNum && commRateNum) ? (valueNum * commRateNum) / 100 : null;

      const { error } = await supabase
        .from("incentive_events")
        .update({
          event_type: editType,
          value: Number.isFinite(valueNum as any) ? valueNum : null,
          points: Number.isFinite(pointsNum as any) ? pointsNum : null,
          order_number: editOrderNumber || null,
          commission_rate: Number.isFinite(commRateNum as any) ? commRateNum : null,
          commission_value: Number.isFinite(commValue as any) ? commValue : null,
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
      const commRateNum = commissionRate.trim() ? Number(commissionRate.replace(",", ".")) : null;
      const commValue = (valueNum && commRateNum) ? (valueNum * commRateNum) / 100 : null;

      // 1. Resolve participant_ids for each selected user_id
      const finalParticipantIds: string[] = [];
      const sellersMap = new Map<string, string>(); // user_id -> participant_id
      (participantsQ.data ?? []).forEach(p => { if (p.user_id) sellersMap.set(p.user_id, p.id); });

      for (const uid of participantIds) {
        if (sellersMap.has(uid)) {
          finalParticipantIds.push(sellersMap.get(uid)!);
        } else {
          // Create participant
          const seller = (sellersQ.data ?? []).find(s => s.user_id === uid);
          const { data: newP, error: pError } = await supabase
            .from("incentive_participants")
            .insert({
              tenant_id: activeTenantId,
              user_id: uid,
              name: seller?.display_name || seller?.email || uid
            })
            .select("id")
            .single();
          if (pError) throw pError;
          finalParticipantIds.push(newP.id);
        }
      }

      const rows = finalParticipantIds.map((pid) => ({
        tenant_id: activeTenantId,
        campaign_id: campaignId,
        participant_id: pid,
        event_type: eventType,
        value: Number.isFinite(valueNum as any) ? valueNum : null,
        points: Number.isFinite(pointsNum as any) ? pointsNum : null,
        order_number: orderNumber || null,
        commission_rate: Number.isFinite(commRateNum as any) ? commRateNum : null,
        commission_value: Number.isFinite(commValue as any) ? commValue : null,
        source_entity_id: sourceEntityId,
        related_entity_id: relatedEntityId,
        attachment_url: attachmentPath,
      }));

      const { error } = await supabase.from("incentive_events").insert(rows);
      if (error) throw error;

      setValue("");
      setPoints("");
      setOrderNumber("");
      setCommissionRate("");
      setParticipantIds([]);
      setSourceEntityId(null);
      setRelatedEntityId(null);
      if (eventFileRef.current) eventFileRef.current.value = "";

      showSuccess(`Evento lançado para ${rows.length} participante(s).`);
      await qc.invalidateQueries({ queryKey: ["incentives_manage_events", activeTenantId, campaignId] });
      await qc.invalidateQueries({ queryKey: ["incentives_participants_map", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao lançar evento: ${e?.message ?? "erro"}`);
    } finally {
      setCreating(false);
    }
  };

  const createQuickPainter = async () => {
    if (!activeTenantId || !qpName.trim() || !qpCpf.trim()) {
      showError("Nome e CPF são obrigatórios.");
      return;
    }
    setCreatingP(true);
    try {
      const { data, error } = await supabase.from("core_entities").insert({
        tenant_id: activeTenantId,
        display_name: qpName.trim(),
        subtype: "pintor",
        metadata: {
          cpf: qpCpf.trim(),
          whatsapp: qpWhatsapp.trim(),
        }
      }).select("id").single();
      if (error) throw error;
      showSuccess("Pintor cadastrado com sucesso.");
      setQpName(""); setQpCpf(""); setQpWhatsapp("");
      setShowQuickPainter(false);
      setRelatedEntityId(data.id);
      await qc.invalidateQueries({ queryKey: ["incentives_manage_entities", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao cadastrar: ${e?.message ?? "erro"}`);
    } finally {
      setCreatingP(false);
    }
  };

  return (
    <RequireAuth>
      <AppShell>
        <div className="grid gap-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <Card className="rounded-[22px] border-slate-200 bg-white p-4 mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <CalendarClock className="h-4 w-4" />
                      Incentivos • Gestão de eventos
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Crie eventos e acompanhe os lançamentos recentes.
                    </div>
                  </div>

                  <TabsList className="bg-slate-100 rounded-xl h-10 p-1">
                    <TabsTrigger value="launch" className="rounded-lg px-4 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900">
                      <LayoutGrid className="mr-2 h-3.5 w-3.5" />
                      Lançar Evento
                    </TabsTrigger>
                    <TabsTrigger value="history" className="rounded-lg px-4 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900">
                      <ListTodo className="mr-2 h-3.5 w-3.5" />
                      Histórico
                    </TabsTrigger>
                  </TabsList>
                </div>
                <Button variant="secondary" className="h-9 rounded-2xl" onClick={() => {
                  eventsQ.refetch();
                  campaignsQ.refetch();
                }}>
                  Atualizar
                </Button>
              </div>
            </Card>

            <TabsContent value="launch">
              <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                <Card className="rounded-[22px] border-slate-200 bg-white p-6">
                  <div className="text-sm font-semibold text-slate-900 mb-6 flex items-center gap-2">
                    <div className="h-6 w-1 rounded-full bg-indigo-500" />
                    Novo Evento
                  </div>

                  <div className="grid gap-5">
                    <div>
                      <Label className="text-xs font-semibold text-slate-600 mb-2 block">Campanha</Label>
                      <Select value={campaignId ?? ""} onValueChange={(v) => {
                        setCampaignId(v);
                        const camp = (campaignsQ.data ?? []).find(c => c.id === v);
                        if (camp?.metadata?.commission_rate) {
                          setCommissionRate(String(camp.metadata.commission_rate));
                        } else {
                          setCommissionRate("");
                        }
                      }}>
                        <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                          <SelectValue placeholder="Selecione uma campanha" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                          {(campaignsQ.data ?? []).map((c) => (
                            <SelectItem key={c.id} value={c.id} className="rounded-xl">
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs font-semibold text-slate-600 mb-2 block">Participante (Vendedor)</Label>
                        <ParticipantsMultiSelect
                          options={(sellersQ.data ?? []).map((s) => ({
                            value: s.user_id,
                            label: s.display_name || s.email || s.user_id,
                          }))}
                          value={participantIds}
                          onChange={setParticipantIds}
                          placeholder="Quem realizou?"
                          disabled={creating}
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-600 mb-2 block">Pintor</Label>
                        <div className="flex gap-2">
                          <Select value={relatedEntityId ?? "none"} onValueChange={(v) => setRelatedEntityId(v === "none" ? null : v)}>
                            <SelectTrigger className="h-12 flex-1 rounded-2xl border-slate-200 bg-slate-50/50">
                              <SelectValue placeholder="Selecione o pintor" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl">
                              <SelectItem value="none">Nenhum</SelectItem>
                              {painters.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            className="h-12 w-12 rounded-2xl border-dashed border-slate-300 hover:border-indigo-400 group"
                            onClick={() => setShowQuickPainter(true)}
                            title="Cadastro rápido"
                          >
                            <span className="text-xl text-slate-400 group-hover:text-indigo-500 transition-colors">+</span>
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs font-semibold text-slate-600 mb-2 block">Valor da Venda (R$)</Label>
                        <Input
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          className="h-12 rounded-2xl border-slate-200 bg-slate-50/50"
                          placeholder="0,00"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-600 mb-2 block">Número do Pedido</Label>
                        <Input
                          value={orderNumber}
                          onChange={(e) => setOrderNumber(e.target.value)}
                          className="h-12 rounded-2xl border-slate-200 bg-slate-50/50"
                          placeholder="#00000"
                        />
                      </div>
                    </div>

                    <div className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100/50">
                      <div className="flex items-center justify-between text-xs font-medium text-indigo-700">
                        <span>Comissão Estimada ({commissionRate || 0}%)</span>
                        <span className="text-sm font-bold">
                          R$ {((Number(value.replace(",", ".")) || 0) * (Number(commissionRate.replace(",", ".")) || 0) / 100).toLocaleString('pt-br', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2">
                      <Label className="text-xs font-semibold text-slate-600 mb-2 block">Anexo (opcional)</Label>
                      <Input ref={eventFileRef} type="file" className="h-12 rounded-2xl border-slate-200 bg-slate-50/50 flex file:bg-transparent file:border-0 file:text-xs file:font-semibold file:text-indigo-600 file:mr-4 file:cursor-pointer" />
                    </div>

                    <Button 
                      onClick={createEvents} 
                      disabled={creating} 
                      className="h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-base shadow-lg shadow-indigo-200 transition-all hover:scale-[1.01] active:scale-[0.98] mt-2"
                    >
                      {creating
                        ? "Lançando..."
                        : participantIds.length > 1
                          ? `Lançar para ${participantIds.length} participantes`
                          : "Lançar Evento"}
                    </Button>
                  </div>
                </Card>

                <Card className="rounded-[22px] border-slate-200 bg-white p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <div className="h-6 w-1 rounded-full bg-emerald-500" />
                      Lançamentos Recentes
                    </div>
                    <Badge variant="outline" className="rounded-xl px-3 py-1 text-slate-500 border-slate-200">
                      {(eventsQ.data ?? []).length} registros
                    </Badge>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-100">
                    <Table>
                      <TableHeader className="bg-slate-50/50">
                        <TableRow className="border-slate-100">
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Data</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Participante</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider text-slate-500 text-right">Venda</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold tracking-wider text-slate-500 text-right">Comissão (R$)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(eventsQ.data ?? []).slice(0, 8).map((e) => {
                          const p = (participantsQ.data ?? []).find(xp => xp.id === e.participant_id);
                          const pn = p ? p.name : e.participant_id.slice(0, 8) + "…";
                          return (
                            <TableRow key={e.id} className="border-slate-50 hover:bg-slate-50/30 transition-colors">
                              <TableCell className="text-xs text-slate-500">
                                {new Date(e.created_at).toLocaleDateString('pt-br')}
                                <div className="text-[10px] text-slate-400">{new Date(e.created_at).toLocaleTimeString('pt-br', { hour: '2-digit', minute: '2-digit' })}</div>
                              </TableCell>
                              <TableCell className="text-sm font-medium text-slate-700">{pn}</TableCell>
                              <TableCell className="text-right font-mono text-sm text-slate-600">
                                R$ {e.value?.toLocaleString('pt-br', { minimumFractionDigits: 2 }) ?? "0,00"}
                                {e.order_number && <div className="text-[10px] text-indigo-400 font-semibold">{e.order_number}</div>}
                              </TableCell>
                              <TableCell className="text-right text-sm font-bold text-emerald-600">
                                R$ {e.commission_value?.toLocaleString('pt-br', { minimumFractionDigits: 2 }) ?? "0,00"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {(eventsQ.data ?? []).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="py-20 text-center">
                              <div className="flex flex-col items-center gap-2 text-slate-400">
                                <ListTodo className="h-8 w-8 opacity-20" />
                                <span className="text-sm">Nenhum evento registrado hoje</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  { (eventsQ.data ?? []).length > 8 && (
                    <Button variant="ghost" className="w-full mt-4 text-xs text-slate-500 hover:text-indigo-600" onClick={() => setActiveTab("history")}>
                      Ver todo o histórico
                    </Button>
                  )}
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="history">
              <Card className="rounded-[22px] border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold text-slate-900">Histórico Completo</div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quando</TableHead>
                        <TableHead>Campanha</TableHead>
                        <TableHead>Participante</TableHead>
                        <TableHead>Tipo</TableHead>
                         <TableHead className="text-right">Venda/Pontos</TableHead>
                         <TableHead className="text-right">Comissão (R$)</TableHead>
                         <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(eventsQ.data ?? []).map((e) => {
                        const p = (participantsQ.data ?? []).find(xp => xp.id === e.participant_id);
                        const pn = p ? p.name : e.participant_id.slice(0, 8) + "…";
                        const c = (campaignsQ.data ?? []).find(xc => xc.id === e.campaign_id);
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
                               {e.value ? `R$ ${e.value}` : "—"} / {e.points ?? "—"}
                               {e.order_number && <div className="text-[10px] text-slate-400 font-normal">{e.order_number}</div>}
                             </TableCell>
                             <TableCell className="text-right text-sm font-semibold text-emerald-600">
                               {e.commission_value ? `R$ ${e.commission_value}` : "—"}
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
                          <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                            Nenhum evento.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg rounded-3xl">
            <DialogHeader>
              <DialogTitle>Editar evento</DialogTitle>
              <DialogDescription>Altere tipo/venda/comissão/pontos.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={editType} onValueChange={(v) => setEditType(v as any)}>
                  <SelectTrigger className="mt-1 h-11 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sale">Venda</SelectItem>
                    <SelectItem value="indication">Indicação</SelectItem>
                    <SelectItem value="points">Pontos Avulsos</SelectItem>
                    <SelectItem value="bonus">Bônus</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Número do Pedido</Label>
                <Input value={editOrderNumber} onChange={(e) => setEditOrderNumber(e.target.value)} className="mt-1 h-11 rounded-2xl" />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Valor Venda</Label>
                  <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="mt-1 h-11 rounded-2xl" />
                </div>
                <div>
                  <Label className="text-xs">% Comissão</Label>
                  <Input value={editCommissionRate} onChange={(e) => setEditCommissionRate(e.target.value)} className="mt-1 h-11 rounded-2xl" />
                </div>
                <div>
                  <Label className="text-xs">Pontos</Label>
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

        <Dialog open={showQuickPainter} onOpenChange={setShowQuickPainter}>
          <DialogContent className="max-w-md rounded-3xl">
            <DialogHeader>
              <DialogTitle>Cadastro Simplificado de Pintor</DialogTitle>
              <DialogDescription>Adicione um novo pintor conforme necessidade.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label className="text-xs">Nome Completo</Label>
                <Input value={qpName} onChange={(e) => setQpName(e.target.value)} placeholder="Ex: João da Silva" className="mt-1 h-11 rounded-2xl" />
              </div>
              <div>
                <Label className="text-xs">CPF (Somente números)</Label>
                <Input value={qpCpf} onChange={(e) => setQpCpf(e.target.value)} placeholder="00000000000" className="mt-1 h-11 rounded-2xl" />
              </div>
              <div>
                <Label className="text-xs">WhatsApp (Opcional)</Label>
                <Input value={qpWhatsapp} onChange={(e) => setQpWhatsapp(e.target.value)} placeholder="11999998888" className="mt-1 h-11 rounded-2xl" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowQuickPainter(false)} className="rounded-2xl">Cancelar</Button>
              <Button onClick={createQuickPainter} disabled={creatingP} className="rounded-2xl">
                {creatingP ? "Cadastrando…" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppShell>
    </RequireAuth>
  );
}
