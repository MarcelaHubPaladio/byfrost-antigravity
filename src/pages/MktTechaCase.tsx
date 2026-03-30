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
import { 
    Accordion, 
    AccordionContent, 
    AccordionItem, 
    AccordionTrigger 
} from "@/components/ui/accordion";
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
    Download,
    MoreHorizontal,
    Share2,
    Lock,
    Upload,
    Paperclip,
    Instagram,
    Youtube,
    Smartphone,
    Calendar,
    ArrowRight
} from "lucide-react";
import { format, eachDayOfInterval, startOfDay, endOfDay, addDays, differenceInDays, parseISO, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
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
const STAGES = [
    "ideias",
    "planejamento",
    "ofertas_definidas",
    "cadastro_big2be",
    "criativos",
    "distribuio",
    "analise",
    "relatrio",
    "concluido"
];

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
    share_token: string | null;
};

export default function MktTechaCase() {
    const { id } = useParams();
    const nav = useNavigate();
    const qc = useQueryClient();
    const { activeTenantId, activeTenant } = useTenant();
    const branding = activeTenant?.branding_json;
    const palette = branding?.palette;
    const primaryColor = palette?.primary?.hex || "#4f46e5";
    const primaryText = palette?.primary?.text || "#ffffff";
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
                    "id,tenant_id,journey_id,case_type,title,status,state,created_at,updated_at,assigned_user_id,is_chat,share_token,users_profile:users_profile(display_name,email),meta_json"
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

    const ensureShareAccess = async () => {
        if (!id) return;
        const newToken = caseQ.data?.share_token || crypto.randomUUID();
        const accessCode = meta.share_access_code || Math.floor(1000 + Math.random() * 9000).toString();
        
        if (caseQ.data?.share_token && meta.share_access_code) return caseQ.data.share_token;

        const newMeta = { ...meta, share_access_code: accessCode };
        
        const { error } = await supabase.from("cases").update({ 
            share_token: newToken,
            meta_json: newMeta
        }).eq("id", id);

        if (error) {
            showError("Erro ao configurar acesso compartilhado");
        } else {
            setMeta(newMeta);
            caseQ.refetch();
            return newToken;
        }
    };

    const copyShareLink = async (type: 'approve' | 'summary' | 'planning') => {
        let token = await ensureShareAccess();
        if (!token) return;

        const baseUrl = window.location.origin;
        let path = type === 'summary' ? 'summary' : 'approve';
        let url = `${baseUrl}/public/mkt-techa/${path}/${token}`;
        
        if (type === 'planning') {
            url += '?mode=planning';
        }

        await navigator.clipboard.writeText(url);
        
        let label = 'link de aprovação';
        if (type === 'summary') label = 'link de resumo';
        if (type === 'planning') label = 'link de aprovação estratégica';
        
        showSuccess(`${label.charAt(0).toUpperCase() + label.slice(1)} copiado!`);
    };

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
            caseQ.refetch();
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

    const [isAddingChannel, setIsAddingChannel] = useState(false);
    const [newChannelName, setNewChannelName] = useState("");

    const updateStageData = (st: string, field: string, value: any) => {
        const stageData = { ...(meta.stage_data || {}) };
        const current = { ...(stageData[st] || {}) };
        current[field] = value;
        stageData[st] = current;
        setMeta({ ...meta, stage_data: stageData });
    };

    const handleFileUpload = async (st: string, type: string, file: File) => {
        if (!id || !activeTenantId) return;
        try {
            const fileExt = file.name.split('.').pop();
            const filePath = `${activeTenantId}/${id}/${st}/${type}-${Date.now()}.${fileExt}`;
            
            const { error: uploadError } = await supabase.storage
                .from('cases')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('cases')
                .getPublicUrl(filePath);

            const stageData = { ...(meta.stage_data || {}) };
            const current = { ...(stageData[st] || {}) };
            const evidences = { ...(current.evidences || {}) };
            const list = [...(evidences[type] || [])];
            
            list.push({ name: file.name, url: publicUrl });
            evidences[type] = list;
            current.evidences = evidences;
            stageData[st] = current;
            
            setMeta({ ...meta, stage_data: stageData });
            showSuccess(`Arquivo "${file.name}" anexado com sucesso!`);
        } catch (e: any) {
            showError(`Erro no upload: ${e.message}`);
        }
    };

    const handleCreativeFileUpload = async (creativeId: string, field: "review_files" | "final_files", file: File) => {
        if (!id || !activeTenantId) return;
        try {
            const fileExt = file.name.split('.').pop();
            const filePath = `${activeTenantId}/${id}/creatives/${creativeId}/${field}-${Date.now()}.${fileExt}`;
            
            const { error: uploadError } = await supabase.storage
                .from('cases')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('cases')
                .getPublicUrl(filePath);

            const list = [...(meta.creatives || [])];
            const idx = list.findIndex(c => c.id === creativeId);
            if (idx === -1) return;
            
            const files = [...(list[idx][field] || [])];
            files.push({ name: file.name, url: publicUrl });
            list[idx] = { ...list[idx], [field]: files };
            
            const newMeta = { ...meta, creatives: list };
            setMeta(newMeta);
            handleSaveMainCard(newMeta);
            showSuccess(`Arquivo "${file.name}" anexado em ${field === 'review_files' ? 'Revisão' : 'Material Final'}!`);
        } catch (e: any) {
            showError(`Erro no upload: ${e.message}`);
        }
    };

    const toggleChannel = (channel: string) => {
        const current = [...(meta.selected_channels || [])];
        const idx = current.indexOf(channel);
        if (idx > -1) {
            current.splice(idx, 1);
        } else {
            current.push(channel);
        }
        setMeta({ ...meta, selected_channels: current });
    };

    const addCustomChannel = (name: string) => {
        if (!name.trim()) return;
        const custom = [...(meta.custom_channels || [])];
        if (!custom.includes(name)) {
            custom.push(name);
        }
        const selected = [...(meta.selected_channels || [])];
        if (!selected.includes(name)) {
            selected.push(name);
        }
        setMeta({ ...meta, custom_channels: custom, selected_channels: selected });
        setNewChannelName("");
        setIsAddingChannel(false);
    };

    const allAvailableChannels = [...CREATIVE_CHANNELS, ...(meta.custom_channels || [])];

    const getChecklistForState = (st: string) => {
        const saved = meta.stage_checklists?.[st];
        if (saved) return saved;
        const defaults = DEFAULT_STAGE_SUBTASKS[st] || [];
        return defaults.map((label, i) => ({
            id: `def-${st}-${i}`,
            label,
            done: false
        }));
    };

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
                setMeta((prev: any) => ({
                    ...prev,
                    stage_checklists: {
                        ...(prev.stage_checklists || {}),
                        [stateKey]: list
                    }
                }));
            }
        }
    }, [caseQ.data?.state]);

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
    const currentIndex = STAGES.indexOf(stateKey);

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

                                <div className="flex items-center gap-3">
                                    <Select value={c.state} onValueChange={updateState} disabled={updatingState}>
                                        <SelectTrigger className="h-10 w-[180px] rounded-2xl bg-white shadow-sm border-slate-200 font-bold text-xs">
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

                                    <Button 
                                        variant="outline" 
                                        onClick={() => copyShareLink('approve')}
                                        className="h-10 px-4 rounded-2xl border-slate-200 bg-white shadow-sm text-[10px] font-black gap-2 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-all"
                                        title="Copiar Link de Aprovação"
                                    >
                                        <Share2 className="h-4 w-4" /> LINK
                                    </Button>

                                    {meta.share_access_code && (
                                        <div className="flex items-center gap-2 px-3 h-10 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
                                            <div className="flex flex-col -space-y-1">
                                                <span className="text-[8px] font-black text-amber-500/50 uppercase tracking-widest leading-none">Acesso PIN</span>
                                                <span className="text-xs font-black text-white tracking-widest leading-none mt-0.5">{meta.share_access_code}</span>
                                            </div>
                                            <Lock className="h-3.5 w-3.5 text-amber-500" />
                                        </div>
                                    )}

                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl text-slate-300 hover:text-rose-600 hover:bg-rose-50">
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
                                </div>

                                <Accordion type="multiple" defaultValue={[stateKey]} className="space-y-4">
                                    {STAGES.map((st) => {
                                        const checklist = getChecklistForState(st);
                                        const label = getStateLabel(journeyQ.data as any, st);
                                        const isCurrent = stateKey === st;
                                        const stIndex = STAGES.indexOf(st);
                                        const isLocked = stIndex > currentIndex;

                                        return (
                                            <AccordionItem 
                                                key={st} 
                                                value={st} 
                                                disabled={isLocked}
                                                style={{ 
                                                    borderColor: isCurrent ? `${primaryColor}20` : undefined,
                                                    boxShadow: isCurrent ? `0 20px 25px -5px ${primaryColor}10` : undefined
                                                }}
                                                className={cn(
                                                    "rounded-[32px] border px-6 transition-all duration-300",
                                                    isCurrent ? "bg-white" : "bg-slate-50/30 border-slate-100 opacity-80",
                                                    isLocked ? "opacity-40 cursor-not-allowed bg-slate-100/50" : "hover:opacity-100"
                                                )}
                                            >
                                                <AccordionTrigger className={cn("hover:no-underline group py-6", isLocked && "cursor-not-allowed")}>
                                                    <div className="flex items-center gap-4 text-left">
                                                        <div 
                                                            style={{ 
                                                                backgroundColor: isCurrent ? primaryColor : undefined,
                                                                color: isCurrent ? primaryText : undefined,
                                                                borderColor: !isCurrent ? '#f1f5f9' : undefined
                                                            }}
                                                            className={cn(
                                                                "h-10 w-10 rounded-2xl flex items-center justify-center transition-colors shadow-sm",
                                                                !isCurrent && "bg-white text-slate-400 group-hover:text-indigo-500 border",
                                                                isLocked && "bg-slate-100 text-slate-300 border-none"
                                                            )}
                                                        >
                                                            {isLocked ? <Lock className="h-5 w-5" /> : <Target className="h-5 w-5" />}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Etapa</span>
                                                                {isCurrent && (
                                                                    <Badge 
                                                                        style={{ backgroundColor: `${primaryColor}10`, color: primaryColor }}
                                                                        className="border-none rounded-full h-4 text-[8px] font-black px-2 uppercase"
                                                                    >
                                                                        Atual
                                                                    </Badge>
                                                                )}
                                                                {isLocked && <Badge className="bg-slate-100 text-slate-400 border-none rounded-full h-4 text-[8px] font-black px-2 uppercase">Bloqueada</Badge>}
                                                            </div>
                                                            <h3 className={cn("text-lg font-black tracking-tight", isCurrent ? "text-slate-900" : isLocked ? "text-slate-400" : "text-slate-600")}>
                                                                {label}
                                                            </h3>
                                                        </div>
                                                    </div>
                                                </AccordionTrigger>
                                                <AccordionContent className="pt-2 pb-8">
                                                    <div className="space-y-8 animate-in fade-in slide-in-from-top-2 duration-500">
                                                        <div className="space-y-6">
                                                            {st === "ideias" && (
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

                                                            {st === "planejamento" && (
                                                                <div className="space-y-8">
                                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1 -mb-4">
                                                                        <div className="flex flex-col">
                                                                            <h4 className="text-sm font-black text-slate-800 tracking-tight leading-none">Detalhamento Estratégico</h4>
                                                                            <p className="text-[10px] text-slate-500 font-medium">Configure a mensagem, cronograma e anexe evidências.</p>
                                                                        </div>
                                                                        {meta.stage_data?.planejamento?.approved_at && (
                                                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100">
                                                                                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                                                                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Aprovado pelo Cliente</span>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    <div className="space-y-6 pt-4">
                                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                            <div className="space-y-2">
                                                                                <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Início da Campanha</Label>
                                                                                <Input 
                                                                                    type="date"
                                                                                    value={meta.stage_data?.planejamento?.start_date || ""} 
                                                                                    onChange={(e) => updateStageData("planejamento", "start_date", e.target.value)}
                                                                                    className="h-11 rounded-2xl font-medium"
                                                                                />
                                                                            </div>
                                                                            <div className="space-y-2">
                                                                                <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Fim da Campanha</Label>
                                                                                <Input 
                                                                                    type="date"
                                                                                    value={meta.stage_data?.planejamento?.end_date || ""} 
                                                                                    onChange={(e) => updateStageData("planejamento", "end_date", e.target.value)}
                                                                                    className="h-11 rounded-2xl font-medium"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                            <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Mensagem Central</Label>
                                                                            <Textarea 
                                                                                value={meta.stage_data?.planejamento?.mensagem_central || ""} 
                                                                                onChange={(e) => updateStageData("planejamento", "mensagem_central", e.target.value)}
                                                                                className="rounded-2xl min-h-[80px]" placeholder="Slogan ou ideia central que guia a campanha..."
                                                                            />
                                                                        </div>

                                                                        <div className="space-y-4">
                                                                            <Label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">Estratégia de Canais</Label>
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {allAvailableChannels.map(ch => {
                                                                                    const isSelected = (meta.selected_channels || []).includes(ch);
                                                                                    return (
                                                                                        <Badge 
                                                                                            key={ch}
                                                                                            onClick={() => toggleChannel(ch)}
                                                                                            style={{ 
                                                                                                backgroundColor: isSelected ? primaryColor : 'white',
                                                                                                color: isSelected ? primaryText : undefined,
                                                                                                borderColor: isSelected ? primaryColor : '#f1f5f9'
                                                                                            }}
                                                                                            className={cn(
                                                                                                "px-4 py-2 rounded-2xl cursor-pointer transition-all border-2 text-[11px] font-bold",
                                                                                                !isSelected && "text-slate-500 hover:border-indigo-200 hover:text-indigo-600"
                                                                                            )}
                                                                                        >
                                                                                            {ch.toUpperCase()}
                                                                                        </Badge>
                                                                                    );
                                                                                })}
                                                                                {isAddingChannel ? (
                                                                                    <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-300">
                                                                                        <Input 
                                                                                            autoFocus
                                                                                            value={newChannelName}
                                                                                            onChange={(e) => setNewChannelName(e.target.value)}
                                                                                            onKeyDown={(e) => e.key === 'Enter' && addCustomChannel(newChannelName)}
                                                                                            className="h-9 w-32 rounded-xl text-[10px]"
                                                                                            placeholder="Nome do canal..."
                                                                                        />
                                                                                        <Button size="sm" variant="ghost" className="h-9 w-9 rounded-xl text-green-600" onClick={() => addCustomChannel(newChannelName)}>
                                                                                            <Plus className="h-4 w-4" />
                                                                                        </Button>
                                                                                        <Button size="sm" variant="ghost" className="h-9 w-9 rounded-xl text-slate-400" onClick={() => setIsAddingChannel(false)}>
                                                                                            <X className="h-3 w-3" />
                                                                                        </Button>
                                                                                    </div>
                                                                                ) : (
                                                                                    <Badge onClick={() => setIsAddingChannel(true)} className="px-4 py-2 rounded-2xl cursor-pointer border-2 border-dashed border-slate-200 bg-slate-50/30 text-slate-400 font-bold text-[11px]">
                                                                                        <Plus className="h-3 w-3 mr-2" /> NOVO CANAL
                                                                                    </Badge>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        <div className="space-y-2">
                                                                            <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Objetivos Estratégicos</Label>
                                                                            <Textarea 
                                                                                value={meta.stage_data?.planejamento?.objetivo || ""} 
                                                                                onChange={(e) => updateStageData("planejamento", "objetivo", e.target.value)}
                                                                                className="rounded-2xl min-h-[100px]" placeholder="Defina o que se espera alcançar..."
                                                                            />
                                                                        </div>

                                                                        <div className="space-y-4 pt-4">
                                                                            <Label className="text-[10px] font-black tracking-widest uppercase text-slate-400 px-1">Evidências Técnicas (ERP / CRM)</Label>
                                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                                                <div className="p-4 rounded-3xl border border-slate-100 bg-slate-50/30 space-y-4">
                                                                                    <div className="flex items-center justify-between">
                                                                                        <span className="text-[11px] font-bold text-slate-700">Evidência ERP</span>
                                                                                        <label className="cursor-pointer">
                                                                                            <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload("planejamento", "erp", e.target.files[0])} />
                                                                                            <div className="h-8 w-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-indigo-600 shadow-sm"><Upload className="h-4 w-4" /></div>
                                                                                        </label>
                                                                                    </div>
                                                                                    <div className="space-y-2">
                                                                                        {(meta.stage_data?.planejamento?.evidences?.erp || []).map((f: any, i: number) => (
                                                                                            <a key={i} href={f.url} target="_blank" className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-100 text-[10px] font-medium text-slate-600 truncate"><Paperclip className="h-3 w-3" /> {f.name}</a>
                                                                                        ))}
                                                                                        {!(meta.stage_data?.planejamento?.evidences?.erp?.length) && <p className="text-[9px] text-slate-400 italic">Nenhum documento ERP anexado.</p>}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="p-4 rounded-3xl border border-slate-100 bg-slate-50/30 space-y-4">
                                                                                    <div className="flex items-center justify-between">
                                                                                        <span className="text-[11px] font-bold text-slate-700">Evidência CRM</span>
                                                                                        <label className="cursor-pointer">
                                                                                            <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload("planejamento", "crm", e.target.files[0])} />
                                                                                            <div className="h-8 w-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-indigo-600 shadow-sm"><Upload className="h-4 w-4" /></div>
                                                                                        </label>
                                                                                    </div>
                                                                                    <div className="space-y-2">
                                                                                        {(meta.stage_data?.planejamento?.evidences?.crm || []).map((f: any, i: number) => (
                                                                                            <a key={i} href={f.url} target="_blank" className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-100 text-[10px] font-medium text-slate-600 truncate"><Paperclip className="h-3 w-3" /> {f.name}</a>
                                                                                        ))}
                                                                                        {!(meta.stage_data?.planejamento?.evidences?.crm?.length) && <p className="text-[9px] text-slate-400 italic">Nenhum documento CRM anexado.</p>}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {st === "criativos" && (
                                                                <div className="space-y-8">
                                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1">
                                                                        <div>
                                                                            <h4 className="text-sm font-black text-slate-800 tracking-tight">Gestão de Criativos</h4>
                                                                            <p className="text-[10px] text-slate-500 font-medium">Gerencie o status da produção e envie para aprovação.</p>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <Button variant="outline" onClick={() => copyShareLink('approve')} className="rounded-xl h-8 text-[10px] font-black gap-2 border-indigo-100 text-indigo-600"><Share2 className="h-3.5 w-3.5" /> LINK DE APROVAÇÃO</Button>
                                                                            <Button onClick={addCreative} size="sm" className="rounded-xl h-8 text-[10px] font-bold gap-2 bg-indigo-600"><Plus className="h-3.5 w-3.5" /> NOVO CRIATIVO</Button>
                                                                        </div>
                                                                    </div>

                                                                    {meta.stage_data?.planejamento?.mensagem_central && (
                                                                        <div className="p-6 rounded-[32px] bg-indigo-50 border border-indigo-100 flex items-start gap-4 animate-in fade-in zoom-in duration-500">
                                                                            <div className="h-10 w-10 rounded-2xl bg-white flex items-center justify-center text-indigo-600 shadow-sm shrink-0">
                                                                                <Target className="h-5 w-5" />
                                                                            </div>
                                                                            <div className="space-y-1">
                                                                                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Mensagem Central (Estratégia)</span>
                                                                                <p className="text-sm font-semibold text-indigo-900 leading-relaxed italic">
                                                                                    "{meta.stage_data.planejamento.mensagem_central}"
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    <div className="space-y-8">
                                                                        {(meta.creatives || []).map((cr: MktTechaCreative) => (
                                                                            <div key={cr.id} className="p-8 rounded-[40px] border border-slate-200 bg-white shadow-sm space-y-8 relative group/card overflow-hidden">
                                                                                <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
                                                                                <Button variant="ghost" size="icon" onClick={() => removeCreative(cr.id)} className="absolute top-4 right-4 h-8 w-8 rounded-full text-slate-300 hover:text-rose-600 opacity-0 group-hover/card:opacity-100 transition-opacity"><Trash2 className="h-4 w-4" /></Button>
                                                                                
                                                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                                                                    <div className="space-y-1.5">
                                                                                        <Label className="text-[9px] font-black text-slate-400 uppercase px-1">Canal</Label>
                                                                                        <Select value={cr.channel} onValueChange={(v) => updateCreative(cr.id, "channel", v)}>
                                                                                            <SelectTrigger className="h-11 rounded-2xl text-xs font-bold border-slate-100"><SelectValue /></SelectTrigger>
                                                                                            <SelectContent className="rounded-xl">
                                                                                                {allAvailableChannels.map(ch => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}
                                                                                            </SelectContent>
                                                                                        </Select>
                                                                                    </div>
                                                                                    <div className="space-y-1.5">
                                                                                        <Label className="text-[9px] font-black text-slate-400 uppercase px-1">Tipo</Label>
                                                                                        <Select value={cr.type} onValueChange={(v) => updateCreative(cr.id, "type", v)}>
                                                                                            <SelectTrigger className="h-11 rounded-2xl text-xs font-bold border-slate-100"><SelectValue /></SelectTrigger>
                                                                                            <SelectContent className="rounded-xl">
                                                                                                <SelectItem value="imagem">Imagem</SelectItem>
                                                                                                <SelectItem value="video">Vídeo</SelectItem>
                                                                                                <SelectItem value="audio">Áudio</SelectItem>
                                                                                                <SelectItem value="texto">Texto</SelectItem>
                                                                                            </SelectContent>
                                                                                        </Select>
                                                                                    </div>
                                                                                    <div className="space-y-1.5">
                                                                                        <Label className="text-[9px] font-black text-slate-400 uppercase px-1">Status</Label>
                                                                                        <Select value={cr.status} onValueChange={(v) => updateCreative(cr.id, "status", v)}>
                                                                                            <SelectTrigger className="h-11 rounded-2xl text-xs font-black bg-slate-50/50"><SelectValue /></SelectTrigger>
                                                                                            <SelectContent className="rounded-xl">
                                                                                                {CREATIVE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                                                                                            </SelectContent>
                                                                                        </Select>
                                                                                    </div>
                                                                                </div>

                                                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
                                                                                    <div className="space-y-6">
                                                                                        <div className="space-y-2">
                                                                                            <Label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">Briefing Criativo</Label>
                                                                                            <Textarea 
                                                                                                value={cr.briefing || ""} 
                                                                                                onChange={(e) => updateCreative(cr.id, "briefing", e.target.value)}
                                                                                                placeholder="Detalhes para a criação deste material..."
                                                                                                className="rounded-2xl min-h-[120px] bg-slate-50/30 border-slate-100"
                                                                                            />
                                                                                        </div>

                                                                                        {cr.type === 'video' || cr.type === 'audio' ? (
                                                                                            <div className="space-y-2">
                                                                                                <Label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">Roteiro / Script</Label>
                                                                                                <RichTextEditor value={cr.script || ""} onChange={(v) => updateCreative(cr.id, "script", v)} minHeightClassName="min-h-[150px]" />
                                                                                            </div>
                                                                                        ) : cr.type === 'imagem' ? (
                                                                                            <div className="space-y-2">
                                                                                                <Label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">Referências Visuais</Label>
                                                                                                <RichTextEditor value={cr.references || ""} onChange={(v) => updateCreative(cr.id, "references", v)} minHeightClassName="min-h-[150px]" />
                                                                                            </div>
                                                                                        ) : cr.type === 'texto' ? (
                                                                                            <div className="space-y-2">
                                                                                                <Label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">Conteúdo do Texto / Copy</Label>
                                                                                                <RichTextEditor value={cr.text_content || ""} onChange={(v) => updateCreative(cr.id, "text_content", v)} minHeightClassName="min-h-[150px]" />
                                                                                            </div>
                                                                                        ) : null}
                                                                                    </div>

                                                                                    <div className="space-y-6">
                                                                                        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/20 p-6 space-y-6">
                                                                                            <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                                                                                <RefreshCw className="h-3.5 w-3.5 text-indigo-500" /> APROVAÇÃO DO MATERIAL
                                                                                            </h5>
                                                                                            
                                                                                            <div className="space-y-3">
                                                                                                <Label className="text-[9px] font-bold text-slate-400 uppercase">Link para Revisão (Ex: Drive/Frame.io)</Label>
                                                                                                <Input 
                                                                                                    value={cr.review_link || ""} 
                                                                                                    onChange={(e) => updateCreative(cr.id, "review_link", e.target.value)}
                                                                                                    placeholder="https://..."
                                                                                                    className="h-10 rounded-xl"
                                                                                                />
                                                                                            </div>

                                                                                            <div className="space-y-3">
                                                                                                <div className="flex items-center justify-between">
                                                                                                    <Label className="text-[9px] font-bold text-slate-400 uppercase">Arquivos para Revisão</Label>
                                                                                                    <label className="cursor-pointer">
                                                                                                        <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleCreativeFileUpload(cr.id, "review_files", e.target.files[0])} />
                                                                                                        <div className="text-[9px] font-black text-indigo-600 hover:text-indigo-700 flex items-center gap-1"><Upload className="h-3 w-3" /> ADICIONAR</div>
                                                                                                    </label>
                                                                                                </div>
                                                                                                <div className="grid grid-cols-1 gap-2">
                                                                                                    {(cr.review_files || []).map((f, i) => (
                                                                                                        <a key={i} href={f.url} target="_blank" className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-100 text-[10px] font-bold text-slate-600 hover:text-indigo-600 transition-all">
                                                                                                            <div className="flex items-center gap-2 truncate"><Paperclip className="h-3 w-3" /> {f.name}</div>
                                                                                                            <ExternalLink className="h-3 w-3" />
                                                                                                        </a>
                                                                                                    ))}
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>

                                                                                        <div className="rounded-3xl border border-emerald-100 bg-emerald-50/20 p-6 space-y-4">
                                                                                            <div className="flex items-center justify-between">
                                                                                                <h5 className="text-[11px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-2">
                                                                                                    <CheckCircle2 className="h-3.5 w-3.5" /> MATERIAL FINAL (PRONTO)
                                                                                                </h5>
                                                                                                <label className="cursor-pointer">
                                                                                                    <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleCreativeFileUpload(cr.id, "final_files", e.target.files[0])} />
                                                                                                    <div className="h-8 px-3 rounded-lg bg-emerald-500 text-white flex items-center justify-center text-[9px] font-black shadow-sm shadow-emerald-500/20 hover:bg-emerald-600 transition-all gap-1">
                                                                                                        <Upload className="h-3 w-3" /> SUBIR FINAL
                                                                                                    </div>
                                                                                                </label>
                                                                                            </div>
                                                                                            <div className="grid grid-cols-1 gap-2">
                                                                                                {(cr.final_files || []).map((f, i) => (
                                                                                                    <a key={i} href={f.url} target="_blank" className="flex items-center justify-between p-2 rounded-xl bg-white border border-emerald-100 text-[10px] font-bold text-emerald-700">
                                                                                                        <div className="flex items-center gap-2 truncate"><CheckCircle2 className="h-3 w-3" /> {f.name}</div>
                                                                                                        <Download className="h-3 w-3" />
                                                                                                    </a>
                                                                                                ))}
                                                                                            </div>
                                                                                            {cr.status !== 'approved' && (
                                                                                                <div className="pt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                                                                    <Button 
                                                                                                        onClick={() => updateCreative(cr.id, "status", "approved")} 
                                                                                                        className="w-full h-12 rounded-[22px] bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] uppercase tracking-widest gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
                                                                                                    >
                                                                                                        <CheckCircle2 className="h-4 w-4" /> APROVAR ESTE CRIATIVO
                                                                                                    </Button>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {st === "ofertas_definidas" && (
                                                                <div className="space-y-6">
                                                                    <div className="flex flex-col">
                                                                        <h4 className="text-sm font-black text-slate-800 tracking-tight leading-none">Definição de Produtos e Preços</h4>
                                                                        <p className="text-[10px] text-slate-500 font-medium">Anexe a planilha com a listagem de ofertas aprovadas para esta campanha.</p>
                                                                    </div>

                                                                    <div className="p-4 rounded-3xl border border-slate-100 bg-slate-50/30 space-y-4">
                                                                        <div className="flex items-center justify-between">
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="h-8 w-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                                                                                    <FileText className="h-4 w-4" />
                                                                                </div>
                                                                                <span className="text-[11px] font-bold text-slate-700">Planilha de Produtos / Ofertas</span>
                                                                            </div>
                                                                            <label className="cursor-pointer">
                                                                                <input 
                                                                                    type="file" 
                                                                                    className="hidden" 
                                                                                    accept=".xlsx,.xls,.csv"
                                                                                    onChange={(e) => e.target.files?.[0] && handleFileUpload("ofertas_definidas", "produtos", e.target.files[0])} 
                                                                                />
                                                                                <div className="h-9 px-4 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[10px] font-black text-indigo-600 shadow-sm hover:bg-slate-50 transition-all gap-2">
                                                                                    <Upload className="h-3.5 w-3.5" /> SUBIR PLANILHA
                                                                                </div>
                                                                            </label>
                                                                        </div>
                                                                        
                                                                        <div className="space-y-2">
                                                                            {(meta.stage_data?.ofertas_definidas?.evidences?.produtos || []).map((f: any, i: number) => (
                                                                                <a key={i} href={f.url} target="_blank" className="flex items-center justify-between p-3 rounded-2xl bg-white border border-slate-100 text-[10px] font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-100 transition-all group">
                                                                                    <div className="flex items-center gap-2 truncate">
                                                                                        <Paperclip className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-400" /> 
                                                                                        {f.name}
                                                                                    </div>
                                                                                    <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                                                                                </a>
                                                                            ))}
                                                                            {!(meta.stage_data?.ofertas_definidas?.evidences?.produtos?.length) && (
                                                                                <div className="py-4 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-2xl bg-white/50">
                                                                                    <p className="text-[10px] text-slate-400 font-medium">Nenhuma planilha anexada.</p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {st === "cadastro_big2be" && (
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                    <div className="space-y-2">
                                                                        <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Início (Vigência)</Label>
                                                                        <Input type="date" value={meta.stage_data?.cadastro_big2be?.inicio || ""} onChange={(e) => updateStageData("cadastro_big2be", "inicio", e.target.value)} className="h-11 rounded-2xl" />
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Fim (Vigência)</Label>
                                                                        <Input type="date" value={meta.stage_data?.cadastro_big2be?.fim || ""} onChange={(e) => updateStageData("cadastro_big2be", "fim", e.target.value)} className="h-11 rounded-2xl" />
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {st === "distribuio" && (
                                                                <div className="space-y-10">
                                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1">
                                                                        <div>
                                                                            <h4 className="text-sm font-black text-slate-800 tracking-tight">Cronograma de Distribuição</h4>
                                                                            <p className="text-[10px] text-slate-500 font-medium">Agende a veiculação de cada criativo aprovado.</p>
                                                                        </div>
                                                                        <Badge variant="outline" className="rounded-xl h-7 px-3 text-[9px] font-black border-indigo-100 text-indigo-600 bg-indigo-50/30">
                                                                            {(meta.creatives || []).filter((cr: MktTechaCreative) => cr.status === 'approved').length} CRIATIVOS APROVADOS
                                                                        </Badge>
                                                                    </div>

                                                                    <div className="bg-slate-900 rounded-[32px] p-6 shadow-2xl shadow-slate-900/10 overflow-hidden border border-white/5">
                                                                        <div className="flex items-center gap-3 mb-6 px-2">
                                                                            <div className="h-8 w-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                                                                                <Calendar className="h-4 w-4" />
                                                                            </div>
                                                                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Linha do Tempo de Veiculação</span>
                                                                        </div>

                                                                        <div className="relative overflow-x-auto pb-4 no-scrollbar cursor-grab active:cursor-grabbing scroll-smooth">
                                                                            <div className="min-w-[800px] space-y-4">
                                                                                {/* Timeline Header (Days) */}
                                                                                <div className="flex border-b border-white/5 pb-2 ml-[150px]">
                                                                                    {(() => {
                                                                                        const start = meta.stage_data?.cadastro_big2be?.inicio ? parseISO(meta.stage_data.cadastro_big2be.inicio) : startOfDay(new Date());
                                                                                        const end = meta.stage_data?.cadastro_big2be?.fim ? parseISO(meta.stage_data.cadastro_big2be.fim) : addDays(start, 21);
                                                                                        const days = eachDayOfInterval({ start, end });
                                                                                        return days.map((day, i) => (
                                                                                            <div key={i} className="w-10 flex-shrink-0 flex flex-col items-center gap-1">
                                                                                                <span className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter">{format(day, 'EEE', { locale: ptBR })}</span>
                                                                                                <span className={cn("text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-lg", isWithinInterval(new Date(), { start: startOfDay(day), end: endOfDay(day) }) ? "bg-indigo-500 text-white" : "text-slate-400")}>
                                                                                                    {format(day, 'd')}
                                                                                                </span>
                                                                                            </div>
                                                                                        ));
                                                                                    })()}
                                                                                </div>

                                                                                {/* Timeline Rows */}
                                                                                <div className="space-y-6">
                                                                                    {(meta.creatives || []).filter((cr: MktTechaCreative) => cr.status === 'approved').map((cr: MktTechaCreative) => {
                                                                                        const campaignStart = meta.stage_data?.cadastro_big2be?.inicio ? parseISO(meta.stage_data.cadastro_big2be.inicio) : startOfDay(new Date());
                                                                                        const start = cr.publish_start_date ? parseISO(cr.publish_start_date) : null;
                                                                                        const end = cr.publish_end_date ? parseISO(cr.publish_end_date) : null;
                                                                                        
                                                                                        const offset = start ? differenceInDays(start, campaignStart) : 0;
                                                                                        const duration = (start && end) ? differenceInDays(end, start) + 1 : 0;

                                                                                        return (
                                                                                            <div key={cr.id} className="flex items-center">
                                                                                                <div className="w-[150px] pr-4 flex-shrink-0 space-y-1">
                                                                                                    <div className="flex items-center gap-1.5 ">
                                                                                                        {cr.channel === 'Instagram' && <Instagram className="h-3 w-3 text-pink-500" />}
                                                                                                        {cr.channel === 'TikTok' && <Smartphone className="h-3 w-3 text-white" />}
                                                                                                        {cr.channel === 'YouTube' && <Youtube className="h-3 w-3 text-red-500" />}
                                                                                                        <span className="text-[9px] font-black text-white uppercase truncate">{cr.channel}</span>
                                                                                                    </div>
                                                                                                    <p className="text-[8px] text-slate-500 font-bold truncate tracking-widest">{cr.type.toUpperCase()}</p>
                                                                                                </div>
                                                                                                <div className="flex-grow flex relative h-4 items-center">
                                                                                                    {duration > 0 && (
                                                                                                        <div 
                                                                                                            className={cn(
                                                                                                                "absolute h-3 rounded-full shadow-lg shadow-indigo-500/10 border border-white/10 group/bar flex items-center justify-end px-2",
                                                                                                                cr.channel === 'Instagram' ? "bg-gradient-to-r from-pink-500 to-rose-500" :
                                                                                                                cr.channel === 'YouTube' ? "bg-red-600" : "bg-indigo-500"
                                                                                                            )}
                                                                                                            style={{ 
                                                                                                                left: `${offset * 40}px`, 
                                                                                                                width: `${duration * 40}px` 
                                                                                                            }}
                                                                                                        >
                                                                                                            <div className="h-1.5 w-1.5 rounded-full bg-white/50 animate-pulse" />
                                                                                                        </div>
                                                                                                    )}
                                                                                                    {/* Background Grid */}
                                                                                                    <div className="absolute inset-0 flex pointer-events-none opacity-[0.03]">
                                                                                                        {Array.from({ length: 30 }).map((_, i) => <div key={i} className="w-10 h-full border-l border-white" />)}
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="space-y-6">
                                                                        <div className="flex items-center gap-2 px-1">
                                                                            <Settings className="h-4 w-4 text-slate-400" />
                                                                            <h5 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Configuração de Agendamento</h5>
                                                                        </div>
                                                                        
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                            {(meta.creatives || []).filter((cr: MktTechaCreative) => cr.status === 'approved').map((cr: MktTechaCreative) => (
                                                                                <div key={cr.id} className="p-5 rounded-[24px] border border-slate-100 bg-white hover:border-indigo-100 transition-all flex flex-col gap-4">
                                                                                    <div className="flex items-center justify-between">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                                                                                                {cr.channel === 'Instagram' && <Instagram className="h-4 w-4 text-pink-500" />}
                                                                                                {cr.channel === 'TikTok' && <Smartphone className="h-4 w-4 text-slate-400" />}
                                                                                                {cr.channel === 'YouTube' && <Youtube className="h-4 w-4 text-red-500" />}
                                                                                            </div>
                                                                                            <div>
                                                                                                <p className="text-[11px] font-black text-slate-700 leading-none">{cr.channel}</p>
                                                                                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">{cr.type} - {cr.format}</p>
                                                                                            </div>
                                                                                        </div>
                                                                                        <Badge variant="outline" className="rounded-lg h-5 px-2 text-[8px] font-black border-emerald-100 text-emerald-600 bg-emerald-50/30">APROVADO</Badge>
                                                                                    </div>

                                                                                    <div className="grid grid-cols-2 gap-3">
                                                                                        <div className="space-y-1.5">
                                                                                            <Label className="text-[9px] font-bold text-slate-400 uppercase px-1">Início veiculação</Label>
                                                                                            <Input 
                                                                                                type="date" 
                                                                                                value={cr.publish_start_date || ""} 
                                                                                                onChange={(e) => updateCreative(cr.id, "publish_start_date", e.target.value)} 
                                                                                                className="h-9 rounded-xl text-[11px] font-semibold"
                                                                                            />
                                                                                        </div>
                                                                                        <div className="space-y-1.5">
                                                                                            <Label className="text-[9px] font-bold text-slate-400 uppercase px-1">Fim veiculação</Label>
                                                                                            <Input 
                                                                                                type="date" 
                                                                                                value={cr.publish_end_date || ""} 
                                                                                                onChange={(e) => updateCreative(cr.id, "publish_end_date", e.target.value)} 
                                                                                                className="h-9 rounded-xl text-[11px] font-semibold"
                                                                                            />
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>

                                                                    <div className="space-y-4 pt-6 border-t border-slate-50">
                                                                        <Label className="text-[10px] font-bold text-slate-500 uppercase px-1 flex items-center gap-2"><ArrowRight className="h-3 w-3" /> Notas Adicionais de Mídia</Label>
                                                                        <Textarea value={meta.stage_data?.distribuio?.plano || ""} onChange={(e) => updateStageData("distribuio", "plano", e.target.value)} className="rounded-3xl min-h-[100px] border-slate-100 bg-slate-50/20" placeholder="Especifique detalhes sobre o tráfego, orçamentos ou contas vinculadas..." />
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {st === "concluido" && (
                                                                <div className="p-8 border-2 border-emerald-100 rounded-[32px] bg-emerald-50/30 flex flex-col items-center justify-center text-center gap-4">
                                                                    <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                                                                    <div className="space-y-1">
                                                                        <h4 className="text-sm font-bold text-emerald-900">Campanha Finalizada</h4>
                                                                        <p className="text-xs text-emerald-700/70">Histórico preservado.</p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="space-y-4 pt-6 border-t border-slate-50">
                                                            <div className="flex items-center justify-between px-1">
                                                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ListChecks className="h-4 w-4" /> CHECKLIST</h4>
                                                                <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-500 font-bold text-[9px]">{checklist.filter(s => s.done).length} / {checklist.length}</Badge>
                                                            </div>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                {checklist.map((item) => (
                                                                    <div key={item.id} onClick={() => toggleSubtask(st, item.id)} className={cn("flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer", item.done ? "bg-emerald-50/50 border-emerald-100" : "bg-white border-slate-100")}>
                                                                        <Checkbox checked={item.done} className="rounded-full data-[state=checked]:bg-emerald-500" />
                                                                        <span className={cn("text-xs font-semibold", item.done ? "text-emerald-700 line-through opacity-70" : "text-slate-700")}>{item.label}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </AccordionContent>
                                            </AccordionItem>
                                        );
                                    })}
                                </Accordion>

                                <div className="space-y-4 pt-6 border-t border-slate-100">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><FileText className="h-4 w-4" /> DESCRIÇÃO GERAL</h3>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Título do Card</Label>
                                            <input value={mainTitle} onChange={(e) => setMainTitle(e.target.value)} className="w-full h-11 rounded-2xl border border-slate-200 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Resumo Executivo</Label>
                                            <RichTextEditor value={mainSummary} minHeightClassName="min-h-[200px]" onChange={setMainSummary} />
                                        </div>
                                    </div>
                                </div>

                                <CaseTimeline events={timelineQ.data ?? []} />
                            </div>

                            <div className="w-full lg:w-[320px] space-y-4 lg:sticky lg:top-8 self-start">
                                <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm space-y-6">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Informações</h3>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Responsável</Label>
                                            <Select value={c.assigned_user_id || "__none__"} onValueChange={async (v) => {
                                                const val = v === "__none__" ? null : v;
                                                await supabase.from("cases").update({ assigned_user_id: val }).eq("id", id);
                                                caseQ.refetch();
                                                showSuccess("Responsável atualizado");
                                            }}>
                                                <SelectTrigger className="h-11 rounded-2xl border-slate-100 bg-slate-50/50"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                                                <SelectContent className="rounded-xl">
                                                    <SelectItem value="__none__">Sem responsável</SelectItem>
                                                    {tenantUsersQ.data?.map(u => <SelectItem key={u.user_id} value={u.user_id}>{u.display_name || u.email}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Prazo Final</Label>
                                            <Input type="date" value={meta.due_at || ""} onChange={(e) => {
                                                const newMeta = { ...meta, due_at: e.target.value };
                                                setMeta(newMeta);
                                                handleSaveMainCard(newMeta);
                                            }} className="h-11 rounded-2xl border-slate-100 bg-slate-50/50" />
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-slate-50 space-y-3">
                                        <div className="p-3 rounded-2xl bg-slate-50/50 border border-slate-100/50">
                                            <div className="text-[10px] text-slate-400 font-bold uppercase">ID</div>
                                            <div className="text-[10px] font-mono text-slate-400 mt-1 truncate">{id}</div>
                                        </div>
                                        <div className="p-3 rounded-2xl bg-slate-50/50 border border-slate-100/50">
                                            <div className="text-[10px] text-slate-400 font-bold uppercase">Criado em</div>
                                            <div className="text-xs font-semibold text-slate-600 mt-1">{new Date(c.created_at).toLocaleDateString("pt-BR")}</div>
                                        </div>
                                    </div>
                                </div>
                                <Button onClick={() => handleSaveMainCard()} disabled={saving} style={{ backgroundColor: primaryColor, color: primaryText, boxShadow: `0 10px 20px -5px ${primaryColor}40` }} className="w-full h-14 rounded-2xl font-black text-xs uppercase tracking-widest gap-2 shadow-xl">
                                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4"/>} SALVAR TUDO
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
                <TransitionBlockDialog open={transitionBlock.open} onOpenChange={(v) => setTransitionBlock({ ...transitionBlock, open: v })} nextStateName={transitionBlock.nextStateName} blocks={transitionBlock.reasons} />
            </AppShell>
        </RequireAuth>
    );
}
