import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { checkTransitionBlocks, TransitionBlockReason } from "@/lib/journeys/validation";
import { TransitionBlockDialog } from "@/components/case/TransitionBlockDialog";
import { CaseTimeline, type CaseTimelineEvent } from "@/components/case/CaseTimeline";
import { TrelloCardDetails } from "@/components/trello/TrelloCardDetails";
import { Card } from "@/components/ui/card";
import {
    AlertCircle,
    ArrowLeft,
    Check,
    CheckCircle2,
    Clock,
    FileText,
    RefreshCw,
    Save,
    Trash2,
    ListChecks,
    Target,
    Settings,
    Plus,
    X,
    ExternalLink,
    MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import { getStateLabel } from "@/lib/journeyLabels";
import { useJourneyTransition } from "@/hooks/useJourneyTransition";
import { StateMachine } from "@/lib/journeys/types";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_STAGE_SUBTASKS, StageSubtask, MktTechaCreative, CREATIVE_CHANNELS, CREATIVE_TYPES, CREATIVE_STATUSES } from "@/lib/mkt_techa/constants";

type CaseRow = {
    id: string;
    tenant_id: string;
    case_type: string;
    title: string | null;
    status: string | null;
    state: string;
    created_at: string;
    updated_at: string;
    assigned_user_id: string | null;
    journey_id: string;
    summary_text: string | null;
    meta_json: any;
};

export default function MktTechaCase() {
    const { id } = useParams();
    const nav = useNavigate();
    const qc = useQueryClient();
    const { activeTenantId } = useTenant();
    const { user } = useSession();
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const [mainTitle, setMainTitle] = useState("");
    const [mainSummary, setMainSummary] = useState("");

    const caseQ = useQuery({
        queryKey: ["case_techa", activeTenantId, id],
        enabled: Boolean(activeTenantId && id),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("cases")
                .select(
                    "id,tenant_id,journey_id,case_type,title,status,state,created_at,updated_at,assigned_user_id,is_chat,users_profile:users_profile(display_name,email),meta_json"
                )
                .eq("tenant_id", activeTenantId!)
                .eq("id", id!)
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error("Caso não encontrado");
            return data as any as CaseRow;
        },
    });

    const [meta, setMeta] = useState<any>({});

    useEffect(() => {
        if (caseQ.data) {
            setMainTitle(caseQ.data.title || "");
            setMainSummary(caseQ.data.summary_text || "");
            setMeta(caseQ.data.meta_json || {});
        }
    }, [caseQ.data]);

    const [transitionBlock, setTransitionBlock] = useState<{
        open: boolean;
        nextStateName: string;
        reasons: TransitionBlockReason[];
    }>({ open: false, nextStateName: "", reasons: [] });

    const tenantUsersQ = useQuery({
        queryKey: ["tenant_users_techa", activeTenantId],
        enabled: Boolean(activeTenantId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("users_profile")
                .select("user_id, display_name, email")
                .eq("tenant_id", activeTenantId!)
                .is("deleted_at", null)
                .order("display_name", { ascending: true });
            if (error) throw error;
            return data as { user_id: string; display_name: string | null; email: string | null }[];
        },
    });

    const journeyQ = useQuery({
        queryKey: ["case_journey_techa", activeTenantId, caseQ.data?.journey_id],
        enabled: Boolean(activeTenantId && caseQ.data?.journey_id),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("journeys")
                .select("key,name,default_state_machine_json")
                .eq("id", caseQ.data!.journey_id)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
    });

    const states = useMemo(() => {
        const st = (journeyQ.data as any)?.default_state_machine_json?.states;
        const arr = Array.isArray(st) ? st.map((x: any) => String(x)).filter(Boolean) : [];
        const fallback = caseQ.data?.state ? [caseQ.data.state] : [];
        return Array.from(new Set([...(arr.length ? arr : fallback)]));
    }, [journeyQ.data, caseQ.data?.state]);

    const { transitionState, updating: updatingState } = useJourneyTransition();

    const updateState = async (next: string) => {
        if (!activeTenantId || !id || updatingState) return;
        const prev = caseQ.data?.state ?? "";
        if (!next || next === prev) return;

        // Custom MKT Techa Validation: Check current stage subtasks
        const currentChecklist = meta.stage_checklists?.[prev] || [];
        const incomplete = currentChecklist.filter((s: any) => !s.done);
        
        if (incomplete.length > 0) {
            setTransitionBlock({ 
                open: true, 
                nextStateName: next, 
                reasons: [{ 
                    type: "open_pendencies", 
                    missingTypes: incomplete.map((s: any) => s.label) 
                }] 
            });
            return;
        }

        const sm = journeyQ.data?.default_state_machine_json as any;
        const blocksReasons = await checkTransitionBlocks(supabase, activeTenantId!, id!, prev, next, sm);

        if (blocksReasons.length > 0) {
            setTransitionBlock({ open: true, nextStateName: next, reasons: blocksReasons });
            return;
        }

        try {
            await transitionState(id, prev, next, sm as unknown as StateMachine);
            showSuccess(`Estado alterado para ${getStateLabel(journeyQ.data as any, next)}`);
        } catch (e: any) { }
    };

    const addCreative = () => {
        const list = [...(meta.creatives || [])];
        const newCreative: MktTechaCreative = {
            id: crypto.randomUUID(),
            channel: "Instagram",
            type: "imagem",
            format: "Post 1080x1080",
            responsible_id: user?.id || null,
            due_at: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
            status: "draft",
            files: [],
            version: 1,
            subtasks: DEFAULT_STAGE_SUBTASKS["criativos"].map((label, i) => ({
                id: `st-${Date.now()}-${i}`,
                label,
                done: false
            }))
        };
        const newMeta = { ...meta, creatives: [...list, newCreative] };
        setMeta(newMeta);
        handleSaveMainCard(newMeta);
    };

    const updateCreative = (id: string, field: keyof MktTechaCreative, value: any) => {
        const list = [...(meta.creatives || [])];
        const idx = list.findIndex(c => c.id === id);
        if (idx === -1) return;
        list[idx] = { ...list[idx], [field]: value };
        setMeta({ ...meta, creatives: list });
    };

    const toggleCreativeSubtask = (creativeId: string, subtaskId: string) => {
        const list = [...(meta.creatives || [])];
        const cIdx = list.findIndex(c => c.id === creativeId);
        if (cIdx === -1) return;
        
        const subtasks = [...list[cIdx].subtasks];
        const sIdx = subtasks.findIndex(s => s.id === subtaskId);
        if (sIdx === -1) return;

        subtasks[sIdx] = { ...subtasks[sIdx], done: !subtasks[sIdx].done };
        list[cIdx] = { ...list[cIdx], subtasks };
        setMeta({ ...meta, creatives: list });
    };

    const removeCreative = (id: string) => {
        const list = (meta.creatives || []).filter((c: any) => c.id !== id);
        const newMeta = { ...meta, creatives: list };
        setMeta(newMeta);
        handleSaveMainCard(newMeta);
    };

    const deleteCase = async () => {
        if (!activeTenantId || !id || deleting) return;
        setDeleting(true);
        try {
            const { error } = await supabase
                .from("cases")
                .update({ deleted_at: new Date().toISOString() })
                .eq("tenant_id", activeTenantId)
                .eq("id", id);
            if (error) throw error;
            showSuccess("Tarefa excluída.");
            nav("/app/mkt-techa", { replace: true });
        } catch (e: any) {
            showError(`Falha ao excluir: ${e?.message ?? "erro"}`);
        } finally {
            setDeleting(false);
        }
    };

    const timelineQ = useQuery({
        queryKey: ["timeline_techa", activeTenantId, id],
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

    const handleSaveMainCard = async (newMeta?: any) => {
        if (!activeTenantId || !id || !caseQ.data) return;
        setSaving(true);
        try {
            const finalMeta = newMeta || meta;
            const { error } = await supabase
                .from("cases")
                .update({ 
                    title: mainTitle, 
                    summary_text: mainSummary,
                    meta_json: finalMeta,
                    updated_at: new Date().toISOString()
                })
                .eq("id", id);
            if (error) throw error;
            showSuccess("Card atualizado.");
            caseQ.refetch();
        } catch (e: any) {
            showError(`Erro ao salvar: ${e?.message}`);
        } finally {
            setSaving(false);
        }
    };

    const toggleSubtask = async (stateKey: string, subtaskId: string) => {
        const checklists = { ...(meta.stage_checklists || {}) };
        const list = [...(checklists[stateKey] || [])];
        const idx = list.findIndex(s => s.id === subtaskId);
        if (idx === -1) return;

        list[idx] = { ...list[idx], done: !list[idx].done };
        checklists[stateKey] = list;
        
        const newMeta = { ...meta, stage_checklists: checklists };
        setMeta(newMeta);
        await handleSaveMainCard(newMeta);
    };

    const updateStageData = (stateKey: string, field: string, value: any) => {
        const stageData = { ...(meta.stage_data || {}) };
        const current = { ...(stageData[stateKey] || {}) };
        current[field] = value;
        stageData[stateKey] = current;
        setMeta({ ...meta, stage_data: stageData });
    };

    const currentChecklist = useMemo(() => {
        if (!caseQ.data?.state) return [];
        const stateKey = caseQ.data.state;
        const saved = meta.stage_checklists?.[stateKey];
        if (saved) return saved;

        const defaults = DEFAULT_STAGE_SUBTASKS[stateKey] || [];
        return defaults.map((label, i) => ({
            id: `def-${stateKey}-${i}`,
            label,
            done: false
        }));
    }, [caseQ.data?.state, meta.stage_checklists]);

    // Ensure checklist exists in meta if it doesn't
    useEffect(() => {
        if (caseQ.data?.state && !meta.stage_checklists?.[caseQ.data.state]) {
            const stateKey = caseQ.data.state;
            const defaults = DEFAULT_STAGE_SUBTASKS[stateKey] || [];
            if (defaults.length > 0) {
                const list = defaults.map((label, i) => ({
                    id: `def-${stateKey}-${i}`,
                    label,
                    done: false
                }));
                const newMeta = {
                    ...meta,
                    stage_checklists: {
                        ...(meta.stage_checklists || {}),
                        [stateKey]: list
                    }
                };
                setMeta(newMeta);
            }
        }
    }, [caseQ.data?.state, meta]);

    if (caseQ.isLoading) {
        return (
            <RequireAuth>
                <AppShell>
                    <div className="flex h-64 items-center justify-center">
                        <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
                    </div>
                </AppShell>
            </RequireAuth>
        );
    }

    const c = caseQ.data!;
    const stateKey = c.state;

    return (
        <RequireAuth>
            <AppShell>
                <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="rounded-[32px] overflow-hidden border-slate-200/60 shadow-xl shadow-slate-200/20">
                        <div className="flex flex-col border-b border-slate-100 bg-white p-6 sm:p-8">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <Link to="/app/mkt-techa">
                                            <Button variant="ghost" size="sm" className="h-8 rounded-full px-2 text-slate-500 hover:bg-slate-50">
                                                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                                            </Button>
                                        </Link>
                                        <Badge variant="secondary" className="rounded-full">MKT Técha</Badge>
                                    </div>
                                    <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                                        {c.title || "Carregando..."}
                                    </h1>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Select value={c.state} onValueChange={updateState} disabled={updatingState}>
                                        <SelectTrigger className="h-10 w-[180px] rounded-2xl bg-white shadow-sm border-slate-200">
                                            <SelectValue placeholder="Estado..." />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-2xl">
                                            {states.map((s) => (
                                                <SelectItem key={s} value={s} className="rounded-xl">
                                                    {getStateLabel(journeyQ.data as any, s)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="secondary" className="h-10 rounded-2xl border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent className="rounded-[24px]">
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
                                                <AlertDialogDescription>Deseja realmente excluir este card de MKT Técha?</AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
                                                <AlertDialogAction onClick={deleteCase} className="rounded-2xl bg-rose-600 text-white hover:bg-rose-700">Excluir</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col lg:flex-row gap-6 p-6 sm:p-8">
                            <div className="flex-1 space-y-8">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <Target className="h-4 w-4" /> ETAPA: {getStateLabel(journeyQ.data as any, stateKey).toUpperCase()}
                                    </h3>
                                    <Button onClick={() => handleSaveMainCard()} disabled={saving} className="h-8 rounded-xl bg-slate-900 text-white font-bold text-[10px] gap-2">
                                        <Save className="h-3 w-3"/> SALVAR TUDO
                                    </Button>
                                </div>

                                {/* STAGE SPECIFIC CONTENT */}
                                <div className="space-y-6">
                                    {stateKey === "ideias" && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Origem</Label>
                                                <Input 
                                                    value={meta.stage_data?.ideias?.origem || ""} 
                                                    onChange={(e) => updateStageData("ideias", "origem", e.target.value)}
                                                    className="h-11 rounded-2xl" placeholder="Ex: Campanha Sazonal"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Prioridade</Label>
                                                <Select 
                                                    value={meta.stage_data?.ideias?.prioridade || "media"}
                                                    onValueChange={(v) => updateStageData("ideias", "prioridade", v)}
                                                >
                                                    <SelectTrigger className="h-11 rounded-2xl">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="rounded-xl">
                                                        <SelectItem value="baixa">Baixa</SelectItem>
                                                        <SelectItem value="media">Média</SelectItem>
                                                        <SelectItem value="alta">Alta</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    )}

                                    {stateKey === "planejamento" && (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Mensagem Central</Label>
                                                    <Input 
                                                        value={meta.stage_data?.planejamento?.mensagem_central || ""} 
                                                        onChange={(e) => updateStageData("planejamento", "mensagem_central", e.target.value)}
                                                        className="h-11 rounded-2xl" placeholder="Slogan ou ideia central"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Duração</Label>
                                                    <Input 
                                                        value={meta.stage_data?.planejamento?.duracao || ""} 
                                                        onChange={(e) => updateStageData("planejamento", "duracao", e.target.value)}
                                                        className="h-11 rounded-2xl" placeholder="Ex: 15 dias"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Canais</Label>
                                                <Input 
                                                    value={meta.stage_data?.planejamento?.canais || ""} 
                                                    onChange={(e) => updateStageData("planejamento", "canais", e.target.value)}
                                                    className="h-11 rounded-2xl" placeholder="Ex: Instagram, WhatsApp, E-mail"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Objetivos Estratégicos</Label>
                                                <Textarea 
                                                    value={meta.stage_data?.planejamento?.objetivo || ""} 
                                                    onChange={(e) => updateStageData("planejamento", "objetivo", e.target.value)}
                                                    className="rounded-2xl min-h-[100px]" placeholder="Defina o que se espera alcançar..."
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {stateKey === "ofertas_definedas" && (
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Produtos Selecionados</Label>
                                                <Textarea 
                                                    value={meta.stage_data?.ofertas_definidas?.produtos || ""} 
                                                    onChange={(e) => updateStageData("ofertas_definidas", "produtos", e.target.value)}
                                                    className="rounded-2xl" placeholder="Liste os SKUs ou nomes dos produtos"
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Preços / Promoção</Label>
                                                    <Input 
                                                        value={meta.stage_data?.ofertas_definidas?.precos || ""} 
                                                        onChange={(e) => updateStageData("ofertas_definidas", "precos", e.target.value)}
                                                        className="h-11 rounded-2xl" 
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Validação de Estoque</Label>
                                                    <Input 
                                                        value={meta.stage_data?.ofertas_definidas?.estoque || ""} 
                                                        onChange={(e) => updateStageData("ofertas_definidas", "estoque", e.target.value)}
                                                        className="h-11 rounded-2xl" 
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {stateKey === "criativos" && (
                                        <div className="space-y-6">
                                            <div className="flex items-center justify-between px-1">
                                                <h4 className="text-sm font-bold text-slate-800">Criativos por Canal</h4>
                                                <Button onClick={addCreative} size="sm" className="rounded-xl h-8 text-[10px] font-bold gap-2 bg-indigo-600 hover:bg-indigo-700">
                                                    <Plus className="h-3.5 w-3.5" /> NOVO CRIATIVO
                                                </Button>
                                            </div>

                                            <div className="space-y-4">
                                                {(meta.creatives || []).map((cr: MktTechaCreative) => (
                                                    <div key={cr.id} className="p-6 rounded-[28px] border border-slate-200 bg-white shadow-sm space-y-6 relative group/card">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => removeCreative(cr.id)}
                                                            className="absolute top-4 right-4 h-8 w-8 rounded-full text-slate-300 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover/card:opacity-100 transition-opacity"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                                            <div className="space-y-2">
                                                                <Label className="text-[10px] font-bold text-slate-500 uppercase">Canal</Label>
                                                                <Select value={cr.channel} onValueChange={(v) => updateCreative(cr.id, "channel", v)}>
                                                                    <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                                                                    <SelectContent className="rounded-xl">
                                                                        {CREATIVE_CHANNELS.map(ch => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label className="text-[10px] font-bold text-slate-500 uppercase">Tipo</Label>
                                                                <Select value={cr.type} onValueChange={(v) => updateCreative(cr.id, "type", v)}>
                                                                    <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                                                                    <SelectContent className="rounded-xl">
                                                                        {CREATIVE_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label className="text-[10px] font-bold text-slate-500 uppercase">Status</Label>
                                                                <Select value={cr.status} onValueChange={(v) => updateCreative(cr.id, "status", v)}>
                                                                    <SelectTrigger className="h-9 rounded-xl text-xs font-bold ring-1 ring-inset ring-slate-100">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent className="rounded-xl">
                                                                        {CREATIVE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label className="text-[10px] font-bold text-slate-500 uppercase">Responsável</Label>
                                                                <Select value={cr.responsible_id || "__none__"} onValueChange={(v) => updateCreative(cr.id, "responsible_id", v === "__none__" ? null : v)}>
                                                                    <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                                                                    <SelectContent className="rounded-xl">
                                                                        <SelectItem value="__none__">Não atribuído</SelectItem>
                                                                        {tenantUsersQ.data?.map(u => <SelectItem key={u.user_id} value={u.user_id}>{u.display_name || "Sem nome"}</SelectItem>)}
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <Label className="text-[10px] font-bold text-slate-500 uppercase">Formato</Label>
                                                                <Input value={cr.format} onChange={(e) => updateCreative(cr.id, "format", e.target.value)} className="h-9 rounded-xl text-xs" />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label className="text-[10px] font-bold text-slate-500 uppercase">Prazo</Label>
                                                                <Input type="date" value={cr.due_at || ""} onChange={(e) => updateCreative(cr.id, "due_at", e.target.value)} className="h-9 rounded-xl text-xs" />
                                                            </div>
                                                        </div>

                                                        <div className="space-y-3 pt-4 border-t border-slate-50">
                                                            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Checklist de Produção</Label>
                                                            <div className="flex flex-wrap gap-2">
                                                                {cr.subtasks.map(st => (
                                                                    <div 
                                                                        key={st.id} 
                                                                        onClick={() => toggleCreativeSubtask(cr.id, st.id)}
                                                                        className={cn(
                                                                            "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-bold transition-all cursor-pointer",
                                                                            st.done ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100"
                                                                        )}
                                                                    >
                                                                        {st.done ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                                                        {st.label}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {(meta.creatives || []).length === 0 && (
                                                    <div className="p-12 border-2 border-dashed border-slate-100 rounded-[32px] bg-slate-50/30 flex flex-col items-center justify-center text-center gap-3">
                                                        <Settings className="h-8 w-8 text-slate-200" />
                                                        <p className="text-xs text-slate-400 font-medium">Nenhum criativo adicionado ainda.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {stateKey === "cadastro_big2be" && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Data de Início (Vigência)</Label>
                                                <Input type="date" value={meta.stage_data?.cadastro_big2be?.inicio || ""} onChange={(e) => updateStageData("cadastro_big2be", "inicio", e.target.value)} className="h-11 rounded-2xl" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Data de Fim (Vigência)</Label>
                                                <Input type="date" value={meta.stage_data?.cadastro_big2be?.fim || ""} onChange={(e) => updateStageData("cadastro_big2be", "fim", e.target.value)} className="h-11 rounded-2xl" />
                                            </div>
                                        </div>
                                    )}

                                    {stateKey === "distribuio" && (
                                        <div className="space-y-4">
                                            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                                                <p className="text-[10px] font-bold text-indigo-700 uppercase mb-2">Criativos Aprovados para Distribuição</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {(meta.creatives || []).filter((cr: any) => cr.status === "approved").map((cr: any) => (
                                                        <Badge key={cr.id} variant="secondary" className="bg-white border-indigo-200 text-indigo-600 rounded-lg">
                                                            {cr.channel} - {cr.type}
                                                        </Badge>
                                                    ))}
                                                    {(meta.creatives || []).filter((cr: any) => cr.status === "approved").length === 0 && (
                                                        <p className="text-[10px] text-indigo-400 italic">Nenhum criativo aprovado ainda.</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Plano de Ativação / Notas de Mídia</Label>
                                                <Textarea 
                                                    value={meta.stage_data?.distribuio?.plano || ""} 
                                                    onChange={(e) => updateStageData("distribuio", "plano", e.target.value)}
                                                    className="rounded-2xl" placeholder="Link do agendador, observações de tráfego, etc."
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {stateKey === "concluido" && (
                                        <div className="p-8 border-2 border-emerald-100 rounded-[32px] bg-emerald-50/30 flex flex-col items-center justify-center text-center gap-4">
                                            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                                            <div className="space-y-1">
                                                <h4 className="text-sm font-bold text-emerald-900">Campanha Finalizada</h4>
                                                <p className="text-xs text-emerald-700/70 max-w-[300px]">Todos os dados foram arquivados e o histórico está preservado como ativo reutilizável.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4 pt-6 border-t border-slate-100">
                                    <div className="flex items-center justify-between px-1">
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <ListChecks className="h-4 w-4" /> CHECKLIST DA ETAPA
                                        </h3>
                                        <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-500">
                                            {currentChecklist.filter(s => s.done).length} / {currentChecklist.length}
                                        </Badge>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {currentChecklist.map((st) => (
                                            <div 
                                                key={st.id} 
                                                onClick={() => toggleSubtask(stateKey, st.id)}
                                                className={cn(
                                                    "flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer group",
                                                    st.done ? "bg-emerald-50 border-emerald-100" : "bg-white border-slate-100 hover:border-slate-200"
                                                )}
                                            >
                                                <Checkbox checked={st.done} className="rounded-full" />
                                                <span className={cn(
                                                    "text-xs font-semibold transition-colors",
                                                    st.done ? "text-emerald-700 line-through opacity-70" : "text-slate-700 group-hover:text-slate-900"
                                                )}>
                                                    {st.label}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4 pt-6 border-t border-slate-100">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <FileText className="h-4 w-4" /> DESCRIÇÃO GERAL
                                        </h3>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Título do Card</Label>
                                            <input 
                                                value={mainTitle} 
                                                onChange={(e) => setMainTitle(e.target.value)} 
                                                className="w-full h-11 rounded-2xl border border-slate-200 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" 
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Resumo Executivo / Notas</Label>
                                            <RichTextEditor value={mainSummary} minHeightClassName="min-h-[200px]" onChange={setMainSummary} />
                                        </div>
                                    </div>
                                </div>

                                <CaseTimeline events={timelineQ.data ?? []} />
                            </div>

                            <div className="w-full lg:w-[320px] space-y-4">
                                <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm space-y-6">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Informações da Campanha</h3>
                                    
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Responsável</Label>
                                            <Select 
                                                value={c.assigned_user_id || "__none__"} 
                                                onValueChange={async (v) => {
                                                    const val = v === "__none__" ? null : v;
                                                    await supabase.from("cases").update({ assigned_user_id: val }).eq("id", id);
                                                    caseQ.refetch();
                                                    showSuccess("Responsável atualizado");
                                                }}
                                            >
                                                <SelectTrigger className="h-11 rounded-2xl border-slate-100 bg-slate-50/50">
                                                    <SelectValue placeholder="Selecionar responsável" />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl">
                                                    <SelectItem value="__none__">Sem responsável</SelectItem>
                                                    {tenantUsersQ.data?.map(u => (
                                                        <SelectItem key={u.user_id} value={u.user_id}>{u.display_name || u.email}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Prazo Final da Campanha</Label>
                                            <Input 
                                                type="date" 
                                                value={meta.due_at || ""} 
                                                onChange={(e) => {
                                                    const newMeta = { ...meta, due_at: e.target.value };
                                                    setMeta(newMeta);
                                                    handleSaveMainCard(newMeta);
                                                }}
                                                className="h-11 rounded-2xl border-slate-100 bg-slate-50/50" 
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-50 space-y-3">
                                        <div className="p-3 rounded-2xl bg-slate-50/50 border border-slate-100/50">
                                            <div className="text-[10px] text-slate-400 font-bold uppercase">ID do Caso</div>
                                            <div className="text-[10px] font-mono text-slate-400 mt-1 truncate">{id}</div>
                                        </div>
                                        <div className="p-3 rounded-2xl bg-slate-50/50 border border-slate-100/50">
                                            <div className="text-[10px] text-slate-400 font-bold uppercase">Início da Jornada</div>
                                            <div className="text-xs font-semibold text-slate-600 mt-1">
                                                {new Date(c.created_at).toLocaleDateString("pt-BR", { day: '2-digit', month: 'long', year: 'numeric' })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
                <TransitionBlockDialog open={transitionBlock.open} onOpenChange={(v) => setTransitionBlock({ ...transitionBlock, open: v })} nextStateName={transitionBlock.nextStateName} blocks={transitionBlock.reasons} />
            </AppShell>
        </RequireAuth>
    );
}
