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
import { WhatsAppConversation } from "@/components/case/WhatsAppConversation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import { getStateLabel } from "@/lib/journeyLabels";
import { useJourneyTransition } from "@/hooks/useJourneyTransition";
import { StateMachine } from "@/lib/journeys/types";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Label } from "@/components/ui/label";

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

    useEffect(() => {
        if (caseQ.data) {
            setMainTitle(caseQ.data.title || "");
            setMainSummary(caseQ.data.summary_text || "");
        }
    }, [caseQ.data]);

    const [transitionBlock, setTransitionBlock] = useState<{
        open: boolean;
        nextStateName: string;
        reasons: TransitionBlockReason[];
    }>({ open: false, nextStateName: "", reasons: [] });

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

        const sm = journeyQ.data?.default_state_machine_json as any;
        const blocksReasons = await checkTransitionBlocks(supabase, activeTenantId!, id!, prev, next, sm);

        if (blocksReasons.length > 0) {
            setTransitionBlock({ open: true, nextStateName: next, reasons: blocksReasons });
            return;
        }

        try {
            await transitionState(id, prev, next, sm as unknown as StateMachine);
        } catch (e: any) { }
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

    const handleSaveMainCard = async () => {
        if (!activeTenantId || !id || !caseQ.data) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from("cases")
                .update({ 
                    title: mainTitle, 
                    summary_text: mainSummary,
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

    const c = caseQ.data;

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
                                        {caseQ.data?.title || "Carregando..."}
                                    </h1>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Select value={c?.state} onValueChange={updateState} disabled={updatingState}>
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

                        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_400px]">
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <FileText className="h-4 w-4" /> DETALHES
                                    </h3>
                                    <Button onClick={handleSaveMainCard} disabled={saving} className="h-8 rounded-xl bg-slate-900 text-white font-bold text-[10px] gap-2">
                                        <Save className="h-3 w-3"/> SALVAR
                                    </Button>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Título</Label>
                                        <input value={mainTitle} onChange={(e) => setMainTitle(e.target.value)} className="w-full h-11 rounded-2xl border border-slate-200 px-4 text-sm font-bold outline-none" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Descrição / Briefing</Label>
                                        <RichTextEditor value={mainSummary} minHeightClassName="min-h-[250px]" onChange={setMainSummary} />
                                    </div>
                                </div>

                                {activeTenantId && id && <TrelloCardDetails tenantId={activeTenantId} caseId={id} />}
                                <CaseTimeline events={timelineQ.data ?? []} />
                            </div>

                            <div className="space-y-4">
                                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Informações</h3>
                                    <div className="space-y-3">
                                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                            <div className="text-[10px] text-slate-400 font-bold uppercase">ID do Caso</div>
                                            <div className="text-xs font-mono text-slate-700 mt-1 truncate">{id}</div>
                                        </div>
                                    </div>
                                </div>
                                {id && <div className="h-[500px] overflow-hidden rounded-[28px] border border-slate-200 bg-white/50 shadow-sm"><WhatsAppConversation caseId={id} className="h-full" /></div>}
                            </div>
                        </div>
                    </Card>
                </div>
                <TransitionBlockDialog open={transitionBlock.open} onOpenChange={(v) => setTransitionBlock({ ...transitionBlock, open: v })} nextStateName={transitionBlock.nextStateName} blocks={transitionBlock.reasons} />
            </AppShell>
        </RequireAuth>
    );
}
