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
import { ArrowLeft, Trash2, RefreshCw, FileText, PackageCheck, Check, AlertCircle, Plus } from "lucide-react";
import { cn, titleizeState } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import { getStateLabel } from "@/lib/journeyLabels";
import { useJourneyTransition } from "@/hooks/useJourneyTransition";
import { StateMachine } from "@/lib/journeys/types";

type CaseRow = {
    id: string;
    tenant_id: string;
    case_type: string;
    title: string | null;
    status: string;
    state: string;
    created_at: string;
    updated_at: string;
    assigned_user_id: string | null;
    customer_id: string | null;
    customer_entity_id: string | null;
    journey_id: string;
    deliverable_id: string | null;
    is_chat?: boolean;
    users_profile?: { display_name: string | null; email: string | null } | null;
    journeys?: { key: string | null; name: string | null; is_crm?: boolean; default_state_machine_json?: any } | null;
    customer_entity?: { display_name: string | null } | null;
    meta_json?: any;
};

export default function OperacaoM30Case() {
    const { id } = useParams();
    const nav = useNavigate();
    const qc = useQueryClient();
    const { activeTenantId } = useTenant();
    const { user } = useSession();

    const [transitionBlock, setTransitionBlock] = useState<{
        open: boolean;
        nextStateName: string;
        reasons: TransitionBlockReason[];
    }>({ open: false, nextStateName: "", reasons: [] });
    const [deleting, setDeleting] = useState(false);

    const caseQ = useQuery({
        queryKey: ["case", activeTenantId, id],
        enabled: Boolean(activeTenantId && id),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("cases")
                .select(
                    "id,tenant_id,journey_id,case_type,customer_id,customer_entity_id,deliverable_id,title,status,state,created_at,updated_at,assigned_user_id,is_chat,users_profile:users_profile(display_name,email),meta_json"
                )
                .eq("tenant_id", activeTenantId!)
                .eq("id", id!)
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error("Caso não encontrado");
            return data as any as CaseRow;
        },
    });

    const deliverableQ = useQuery({
        queryKey: ["case_deliverable", activeTenantId, caseQ.data?.deliverable_id],
        enabled: Boolean(activeTenantId && caseQ.data?.deliverable_id),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("deliverables")
                .select("id, name, commitment_id, status, due_date")
                .eq("tenant_id", activeTenantId!)
                .eq("id", caseQ.data!.deliverable_id!)
                .maybeSingle();
            if (error) throw error;
            return (data ?? null) as any;
        },
    });

    const journeyQ = useQuery({
        queryKey: ["case_journey", activeTenantId, caseQ.data?.journey_id],
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

    const profileQ = useQuery({
        queryKey: ["current_user_profile", activeTenantId, user?.id],
        enabled: Boolean(activeTenantId && user?.id),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("users_profile")
                .select("role")
                .eq("tenant_id", activeTenantId!)
                .eq("user_id", user!.id)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
    });

    const entityQ = useQuery({
        queryKey: ["case_entity", activeTenantId, caseQ.data?.customer_entity_id, (caseQ.data?.meta_json as any)?.entity_id],
        enabled: Boolean(activeTenantId && (caseQ.data?.customer_entity_id || (caseQ.data?.meta_json as any)?.entity_id)),
        queryFn: async () => {
            const eid = caseQ.data?.customer_entity_id || (caseQ.data?.meta_json as any)?.entity_id;
            if (!eid) return null;

            const { data, error } = await supabase
                .from("core_entities")
                .select("display_name")
                .eq("tenant_id", activeTenantId!)
                .eq("id", eid)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
    });

    const accountEntityQ = useQuery({
        queryKey: ["case_acc_entity", activeTenantId, caseQ.data?.customer_id],
        enabled: Boolean(activeTenantId && caseQ.data?.customer_id && !entityQ.data),
        queryFn: async () => {
            const { data: acc } = await supabase
                .from("customer_accounts")
                .select("entity_id")
                .eq("tenant_id", activeTenantId!)
                .eq("id", caseQ.data!.customer_id!)
                .maybeSingle();
            
            if (!acc?.entity_id) return null;

            const { data } = await supabase
                .from("core_entities")
                .select("display_name")
                .eq("tenant_id", activeTenantId!)
                .eq("id", acc.entity_id)
                .maybeSingle();

            return data;
        },
    });

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
                message: "Tarefa excluída (soft delete).",
                meta_json: {},
                occurred_at: new Date().toISOString(),
            });

            showSuccess("Tarefa excluída.");
            nav("/app/operacao-m30", { replace: true });
        } catch (e: any) {
            showError(`Falha ao excluir: ${e?.message ?? "erro"}`);
        } finally {
            setDeleting(false);
        }
    };

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

    const states = useMemo(() => {
        const st = (journeyQ.data as any)?.default_state_machine_json?.states;
        const arr = Array.isArray(st) ? st.map((x: any) => String(x)).filter(Boolean) : [];
        const fallback = caseQ.data?.state ? [caseQ.data.state] : [];
        return Array.from(new Set([...(arr.length ? arr : fallback)]));
    }, [journeyQ.data, caseQ.data?.state]);

    const { transitionState, updating: updatingState } = useJourneyTransition();

    const updateState = async (next: string) => {
        if (!activeTenantId || !id) return;
        if (updatingState) return;
        const prev = caseQ.data?.state ?? "";
        if (!next || next === prev) return;

        const isAdmin = profileQ.data?.role === 'admin' || (user as any)?.app_metadata?.role === 'super-admin';
        const isFinal = (s: string) => {
            const up = s.toUpperCase();
            return up.includes("CONCLU") || up.includes("FINAL") || up.includes("ENTREG");
        };

        if (isFinal(prev) && !isAdmin) {
            showError("Apenas Admins podem reabrir tarefas concluídas.");
            return;
        }

        const sm = journeyQ.data?.default_state_machine_json as any;
        const blocksReasons = await checkTransitionBlocks(supabase, activeTenantId!, id!, caseQ.data?.state || "", next, sm);

        if (blocksReasons.length > 0) {
            setTransitionBlock({ open: true, nextStateName: next, reasons: blocksReasons });
            return;
        }

        try {
            await transitionState(
                id,
                caseQ.data?.state ?? "",
                next,
                journeyQ.data?.default_state_machine_json as unknown as StateMachine
            );

            // Sincronização com Entregáveis do Contrato
            if (isFinal(next) && caseQ.data?.deliverable_id) {
                await supabase
                    .from("deliverables")
                    .update({ status: "completed" })
                    .eq("id", caseQ.data.deliverable_id);
            }
            // Automação: Planejamento -> Gravação (Criação de Subtarefas)
            if (next === "GRAVACAO" && caseQ.data?.case_type === "planejamento") {
                const subtasks = (caseQ.data?.meta_json as any)?.pending_subtasks || [];
                if (subtasks.length > 0) {
                    for (const st of subtasks) {
                        await supabase.from("cases").insert({
                            tenant_id: activeTenantId,
                            journey_id: caseQ.data.journey_id,
                            parent_case_id: id,
                            case_type: st.type, // 'arte_estatica' ou 'edicao' (vídeo)
                            title: st.title,
                            customer_entity_id: caseQ.data.customer_entity_id,
                            deliverable_id: caseQ.data.deliverable_id,
                            state: "DECUPAGEM_GRAVACAO",
                            meta_json: {
                                customer_entity_name: (caseQ.data.meta_json as any)?.customer_entity_name,
                                commitment_id: (caseQ.data.meta_json as any)?.commitment_id,
                            }
                        });
                    }
                    // Limpar sub-tarefas pendentes se desejar, ou apenas marcar como processadas
                    await supabase.from("cases").update({
                        meta_json: {
                            ...(caseQ.data.meta_json as any),
                            subtasks_created: true
                        }
                    }).eq("id", id);
                }
            }
        } catch (e: any) { }
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
                <div className="space-y-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <Button
                                variant="outline"
                                className="h-10 rounded-2xl"
                                onClick={() => nav("/app/operacao-m30")}
                            >
                                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                            </Button>
                            <div className="min-w-0">
                                <h2 className="line-clamp-1 text-lg font-semibold text-slate-900">
                                    {c?.title || "Tarefa"}
                                </h2>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    {(() => {
                                        const metaName = (c?.meta_json as any)?.customer_entity_name || (c?.meta_json as any)?.entity_name;
                                        const name = metaName || entityQ.data?.display_name || accountEntityQ.data?.display_name;
                                        if (!name) return null;
                                        return (
                                            <Badge variant="outline" className="bg-indigo-50/50 text-indigo-700 border-indigo-100 font-bold px-1.5 h-5">
                                                {name}
                                            </Badge>
                                        );
                                    })()}
                                    <span>ID: {id?.slice(0, 8)}</span>
                                    <Badge variant="secondary" className="rounded-full">Operação M30</Badge>
                                    <Badge variant="outline" className="rounded-full bg-slate-50 text-slate-600 drop-shadow-sm border-slate-200">
                                        {caseQ.data?.case_type?.replace("_", " ").toUpperCase() || "GERAL"}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {(() => {
                                const isFinalState = (s: string) => {
                                    const up = s.toUpperCase();
                                    return up.includes("CONCLU") || up.includes("FINAL") || up.includes("ENTREG");
                                };
                                const alreadyFinal = isFinalState(c?.state ?? "");
                                if (alreadyFinal) return null;

                                const targetFinal = states.find(s => isFinalState(s)) || states[states.length - 1];
                                if (!targetFinal) return null;

                                return (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button 
                                                variant="default" 
                                                className="h-10 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                                            >
                                                <Check className="mr-2 h-4 w-4" /> Concluir tarefa
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent className="rounded-[24px]">
                                            <AlertDialogHeader>
                                                <div className="flex items-center gap-2 text-emerald-600 mb-2">
                                                    <AlertCircle className="h-5 w-5" />
                                                    <span className="font-bold">Ação Irreversível</span>
                                                </div>
                                                <AlertDialogTitle>Concluir esta tarefa?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Uma vez concluída, apenas um **administrador** poderá reabri-la.
                                                    Deseja prosseguir?
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => updateState(targetFinal)}
                                                    className="rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
                                                >
                                                    Sim, concluir
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                );
                            })()}

                            <Select value={c?.state} onValueChange={updateState} disabled={updatingState}>
                                <SelectTrigger className="h-10 w-[180px] rounded-2xl bg-white shadow-sm">
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
                                        <AlertDialogDescription>
                                            Esta ação não pode ser desfeita. A tarefa será marcada como excluída.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={deleteCase}
                                            className="rounded-2xl bg-rose-600 text-white hover:bg-rose-700"
                                        >
                                            Excluir
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
                        <div className="space-y-4">
                            {deliverableQ.data && (
                                <div className="rounded-[22px] border border-blue-200 bg-blue-50/50 p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3">
                                            <div className="rounded-xl bg-blue-100 p-2 text-blue-600">
                                                <PackageCheck className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-blue-900">
                                                    Entregável: {deliverableQ.data.name || "Sem Nome"}
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Badge variant="outline" className="text-[10px] bg-white text-blue-700 border-blue-200">
                                                        Status: {deliverableQ.data.status || 'pending'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                        {deliverableQ.data.commitment_id && profileQ.data?.role === 'admin' && (
                                            <Link 
                                                to={`/app/commitments/${deliverableQ.data.commitment_id}`}
                                                className="flex items-center gap-2 text-xs font-semibold text-blue-700 hover:text-blue-800 transition"
                                            >
                                                <FileText className="h-4 w-4" />
                                                Ver Contrato
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            )}

                                {caseQ.data?.case_type === "planejamento" && (
                                    <div className="rounded-[32px] border border-slate-200 bg-white/60 p-6 backdrop-blur shadow-sm">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                                <PackageCheck className="h-4 w-4 text-indigo-600" />
                                                Subtarefas de Produção
                                            </h3>
                                        </div>
                                        <div className="space-y-2">
                                            {((caseQ.data?.meta_json as any)?.pending_subtasks || []).map((st: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-white border border-slate-100 shadow-sm">
                                                    <div className="flex items-center gap-3">
                                                        <Badge variant="secondary" className="text-[10px] h-5">
                                                            {st.type === "arte_estatica" ? "ARTE" : "VÍDEO"}
                                                        </Badge>
                                                        <span className="text-sm text-slate-700 font-medium">{st.title}</span>
                                                    </div>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="h-8 w-8 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                                        onClick={async () => {
                                                            const current = (caseQ.data?.meta_json as any)?.pending_subtasks || [];
                                                            const next = current.filter((_: any, i: number) => i !== idx);
                                                            await supabase.from("cases").update({
                                                                meta_json: { ...(caseQ.data?.meta_json as any), pending_subtasks: next }
                                                            }).eq("id", id!);
                                                            caseQ.refetch();
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                            
                                            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-dashed border-slate-200">
                                                <input 
                                                    id="new-subtask-title"
                                                    placeholder="Título da subtarefa..."
                                                    className="flex-1 h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                                />
                                                <Button 
                                                    size="sm" 
                                                    className="h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700"
                                                    onClick={async () => {
                                                        const el = document.getElementById("new-subtask-title") as HTMLInputElement;
                                                        if (!el || !el.value.trim()) return;
                                                        const current = (caseQ.data?.meta_json as any)?.pending_subtasks || [];
                                                        const next = [...current, { title: el.value, type: "edicao" }]; // Default to Video/Editing
                                                        await supabase.from("cases").update({
                                                            meta_json: { ...(caseQ.data?.meta_json as any), pending_subtasks: next }
                                                        }).eq("id", id!);
                                                        el.value = "";
                                                        caseQ.refetch();
                                                    }}
                                                >
                                                    <Plus className="h-4 w-4 mr-1" /> Vídeo
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    variant="outline"
                                                    className="h-9 rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                                    onClick={async () => {
                                                        const el = document.getElementById("new-subtask-title") as HTMLInputElement;
                                                        if (!el || !el.value.trim()) return;
                                                        const current = (caseQ.data?.meta_json as any)?.pending_subtasks || [];
                                                        const next = [...current, { title: el.value, type: "arte_estatica" }];
                                                        await supabase.from("cases").update({
                                                            meta_json: { ...(caseQ.data?.meta_json as any), pending_subtasks: next }
                                                        }).eq("id", id!);
                                                        el.value = "";
                                                        caseQ.refetch();
                                                    }}
                                                >
                                                    <Plus className="h-4 w-4 mr-1" /> Arte
                                                </Button>
                                            </div>
                                            <p className="text-[10px] text-slate-400 italic px-1 pt-1">
                                                * Subtarefas serão transformadas em cards reais quando este planejamento for movido para "Gravação".
                                            </p>
                                        </div>
                                    </div>
                                )}

                            {activeTenantId && id && (
                                <TrelloCardDetails tenantId={activeTenantId} caseId={id} />
                            )}
                            <CaseTimeline events={timelineQ.data ?? []} />
                        </div>

                        <div className="space-y-4">
                            {id && (
                                <div className="h-[600px] overflow-hidden rounded-[28px] border border-slate-200 bg-white/50 shadow-sm backdrop-blur-sm">
                                    <WhatsAppConversation caseId={id} className="h-full" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <TransitionBlockDialog
                    open={transitionBlock.open}
                    onOpenChange={(v) => setTransitionBlock({ ...transitionBlock, open: v })}
                    nextStateName={transitionBlock.nextStateName}
                    blocks={transitionBlock.reasons}
                />
            </AppShell>
        </RequireAuth>
    );
}
