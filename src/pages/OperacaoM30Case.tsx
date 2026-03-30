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
    AlertTriangle,
    ArrowLeft,
    Calendar,
    Check,
    CheckCircle2,
    Clock,
    ExternalLink,
    FileText,
    GripVertical,
    Link as LinkIcon,
    ListChecks,
    PackageCheck,
    Pencil,
    Plus,
    PlusCircle,
    RefreshCw,
    Rocket,
    Save,
    Trash2,
    X
} from "lucide-react";

const CheckIcon = Check;
const TrashIcon = Trash2;
const RefreshCwIcon = RefreshCw;
const RocketIcon = Rocket;
const ExternalLinkIcon = ExternalLink;
const CalendarIcon = Calendar;
const PlusIcon = Plus;
import { cn, titleizeState } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import { getStateLabel } from "@/lib/journeyLabels";
import { useJourneyTransition } from "@/hooks/useJourneyTransition";
import { StateMachine } from "@/lib/journeys/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
    customer_id: string | null;
    customer_entity_id: string | null;
    journey_id: string;
    deliverable_id: string | null;
    meta_json: any;
};

function SubtaskItemContent({ st, idx, caseMeta, caseId, onRefetch, caseState, caseData, allDeliverables }: { st: any, idx: number, caseMeta: any, caseId: string, onRefetch: () => void, caseState?: string, caseData?: any, allDeliverables: any[] }) {
    const { user } = useSession();
    const [title, setTitle] = useState(st.title || "");
    const [type, setType] = useState(st.type || "edicao");
    const [postDate, setPostDate] = useState(st.post_date || "");
    const [priority, setPriority] = useState(st.priority || false);
    const [deliverableId, setDeliverableId] = useState(st.deliverable_id || "");
    const [description, setDescription] = useState(st.description || "");
    const [scriptRaw, setScriptRaw] = useState(st.script_raw || "");
    const [scriptItems, setScriptItems] = useState<any[]>(st.script_items || []);
    
    const [saving, setSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    const handleSave = async () => {
        setSaving(true);
        try {
            const currentSubtasks = [...(caseMeta?.pending_subtasks || [])];
            currentSubtasks[idx] = {
                ...currentSubtasks[idx],
                title,
                type,
                post_date: postDate,
                priority,
                deliverable_id: deliverableId,
                description,
                script_raw: scriptRaw,
                script_items: scriptItems
            };

            await supabase.from("cases").update({
                meta_json: { ...caseMeta, pending_subtasks: currentSubtasks }
            }).eq("id", caseId);

            // Log Timeline
            await supabase.from("timeline_events").insert({
                tenant_id: caseData.tenant_id,
                case_id: caseId,
                event_type: "subtask_updated",
                actor_type: "admin",
                actor_id: (user as any)?.id ?? null,
                message: `Subtarefa ${title} atualizada (briefing/roteiro/checklist).`,
                meta_json: {},
                occurred_at: new Date().toISOString(),
            });

            setLastSaved(new Date());
            onRefetch();
            showSuccess("Alterações salvas.");
        } catch (e: any) {
            showError("Erro ao salvar.");
        } finally {
            setSaving(false);
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = scriptItems.findIndex((it) => it.id === active.id);
            const newIndex = scriptItems.findIndex((it) => it.id === over.id);
            const next = arrayMove(scriptItems, oldIndex, newIndex);
            setScriptItems(next);
        }
    };

    function SortableChecklistItem({ it, editingId, editingText, setEditingText, saveEdit, cancelEdit, startEditing, toggleItem, removeItem }: any) {
        const {
            attributes,
            listeners,
            setNodeRef,
            transform,
            transition,
            isDragging,
        } = useSortable({ id: it.id });

        const style = {
            transform: CSS.Transform.toString(transform),
            transition,
            zIndex: isDragging ? 50 : undefined,
        };

        return (
            <div
                ref={setNodeRef}
                style={style}
                className={cn(
                    "flex items-start gap-4 p-4 rounded-2xl border border-slate-100 bg-white transition-all group",
                    isDragging ? "opacity-50 shadow-xl border-indigo-200 z-50 bg-slate-50" : "hover:border-slate-200"
                )}
            >
                <div 
                    {...attributes} 
                    {...listeners}
                    className="mt-1 cursor-grab active:cursor-grabbing p-1 text-slate-300 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    <GripVertical className="h-4 w-4" />
                </div>

                <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                            <Checkbox 
                                id={`check-${it.id}`}
                                checked={it.checked}
                                onCheckedChange={() => toggleItem(it.id)}
                                className="mt-1 rounded-full w-5 h-5 border-2 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                            />
                            {editingId === it.id ? (
                                <Textarea 
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    className="min-h-[80px] text-sm focus:ring-indigo-600 rounded-xl"
                                    autoFocus
                                />
                            ) : (
                                <label 
                                    htmlFor={`check-${it.id}`} 
                                    className={cn(
                                        "text-sm font-medium leading-relaxed cursor-pointer transition-colors pt-0.5",
                                        it.checked ? "text-slate-400 line-through" : "text-slate-700 hover:text-slate-900"
                                    )}
                                >
                                    {it.text}
                                </label>
                            )}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            {editingId === it.id ? (
                                <>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 rounded-full" onClick={saveEdit}>
                                        <CheckIcon className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:bg-slate-100 rounded-full" onClick={cancelEdit}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full" onClick={() => startEditing(it)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full" onClick={() => removeItem(it.id)}>
                                        <TrashIcon className="h-3.5 w-3.5" />
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const generateChecklist = async () => {
        if (!scriptRaw.trim()) return;
        const lines = scriptRaw.split("\n").map(l => l.trim()).filter(Boolean);
        const nextItems = lines.map((text, i) => ({
            id: `line-${i}-${Date.now()}`,
            text,
            checked: false
        }));
        setScriptItems(nextItems);
    };

    const toggleItem = (itemId: string) => {
        const next = scriptItems.map(it => it.id === itemId ? { ...it, checked: !it.checked } : it);
        setScriptItems(next);
    };

    const removeItem = (itemId: string) => {
        const next = scriptItems.filter(it => it.id !== itemId);
        setScriptItems(next);
    };

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState("");

    const startEditing = (it: any) => {
        setEditingId(it.id);
        setEditingText(it.text);
    };

    const saveEdit = () => {
        if (!editingId) return;
        const next = scriptItems.map(it => it.id === editingId ? { ...it, text: editingText } : it);
        setScriptItems(next);
        setEditingId(null);
        setEditingText("");
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditingText("");
    };

    if (st.linked_case_id) {
        return (
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <LinkIcon className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                    <h4 className="text-sm font-bold text-indigo-900">Subtarefa Vinculada</h4>
                    <p className="text-xs text-indigo-700/70 max-w-[280px]">
                        Esta subtarefa já foi transformada em um card de produção individual.
                    </p>
                </div>
                <Link to={`/app/operacao-m30/${st.linked_case_id}`}>
                    <Button size="sm" className="rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold gap-2">
                        <ExternalLink className="h-4 w-4" /> Ver Tarefa de Produção
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Data de Postagem</Label>
                    <input 
                        type="date"
                        value={postDate}
                        className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs focus:ring-indigo-500/20 outline-none shadow-sm"
                        onChange={(e) => setPostDate(e.target.value)}
                    />
                </div>

                <div className="space-y-2 flex flex-col justify-end pb-0.5">
                    <div className="flex items-center justify-between h-9 px-3 rounded-xl border border-slate-200 bg-white shadow-sm">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase cursor-pointer" htmlFor={`priority-${idx}`}>Priorizar</Label>
                        <Switch 
                            id={`priority-${idx}`}
                            checked={priority}
                            onCheckedChange={setPriority}
                        />
                    </div>
                </div>
            </div>

            <Tabs defaultValue="briefing" className="w-full">
                <TabsList className="bg-slate-100/50 p-1 rounded-xl h-10 mb-4">
                    <TabsTrigger value="briefing" className="rounded-lg text-xs font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2">
                        <FileText className="h-3.5 w-3.5" /> Briefing
                    </TabsTrigger>
                    <TabsTrigger value="roteiro" className="rounded-lg text-xs font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2">
                        <ListChecks className="h-3.5 w-3.5" /> Roteiro
                    </TabsTrigger>
                </TabsList>
                
                <TabsContent value="briefing" className="mt-0 focus-visible:ring-0">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Descrição da Pauta</Label>
                        <RichTextEditor 
                            value={description}
                            minHeightClassName="min-h-[150px]"
                            onChange={setDescription}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="roteiro" className="mt-0 focus-visible:ring-0 space-y-4">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Texto do Roteiro</Label>
                        <Textarea 
                            placeholder="Cole o texto do roteiro aqui..."
                            className="min-h-[120px] rounded-2xl border-slate-200 text-xs focus:ring-indigo-500/20"
                            value={scriptRaw}
                            onChange={(e) => setScriptRaw(e.target.value)}
                        />
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="w-full h-8 rounded-xl text-[10px] font-bold gap-2 bg-slate-100 hover:bg-slate-200"
                            onClick={generateChecklist}
                        >
                            <RefreshCw className="h-3 w-3" /> Gerar Checklist de Gravação
                        </Button>
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <ListChecks className="h-4 w-4 text-indigo-600" />
                                CHECKLIST DE GRAVAÇÃO
                            </h3>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-indigo-600 hover:bg-indigo-50 font-bold h-8 gap-1.5"
                                onClick={() => {
                                    const nextId = `manual-${Date.now()}`;
                                    setScriptItems([...scriptItems, { id: nextId, text: "", checked: false }]);
                                    setEditingId(nextId);
                                    setEditingText("");
                                }}
                            >
                                <PlusCircle className="h-4 w-4" />
                                Adicionar Ponto
                            </Button>
                        </div>
                        
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext 
                                items={scriptItems.map(i => i.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="space-y-3">
                                    {scriptItems.map((it) => (
                                        <SortableChecklistItem 
                                            key={it.id}
                                            it={it}
                                            editingId={editingId}
                                            editingText={editingText}
                                            setEditingText={setEditingText}
                                            saveEdit={saveEdit}
                                            cancelEdit={cancelEdit}
                                            startEditing={startEditing}
                                            toggleItem={toggleItem}
                                            removeItem={removeItem}
                                        />
                                    ))}
                                    {scriptItems.length === 0 && (
                                        <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/50">
                                            <ListChecks className="h-10 w-10 text-slate-200 mb-3" />
                                            <p className="text-xs text-slate-400 font-medium">Nenhum item no checklist.</p>
                                        </div>
                                    )}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </div>
                </TabsContent>
            </Tabs>

            <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                <div className="flex items-center gap-2">
                    {lastSaved && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium bg-slate-50 px-2 py-1 rounded-lg">
                            <Clock className="h-3 w-3" /> Salvo às {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                </div>
                <Button 
                    onClick={handleSave} 
                    disabled={saving}
                    className={cn(
                        "h-9 rounded-xl px-6 font-bold text-xs gap-2 transition-all shadow-md",
                        saving ? "bg-slate-400" : (lastSaved ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100" : "bg-slate-900 hover:bg-slate-800")
                    )}
                >
                    {saving ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                        lastSaved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />
                    )}
                    {saving ? "Salvando..." : (lastSaved ? "Salvo" : "Salvar Alterações")}
                </Button>
            </div>
        </div>
    );
}

export default function OperacaoM30Case() {
    const { id } = useParams();
    const nav = useNavigate();
    const qc = useQueryClient();
    const { activeTenantId } = useTenant();
    const { user } = useSession();
    const [creatingTasks, setCreatingTasks] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const [transitionBlock, setTransitionBlock] = useState<{
        open: boolean;
        nextStateName: string;
        reasons: TransitionBlockReason[];
    }>({ open: false, nextStateName: "", reasons: [] });

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

    const allDeliverablesQ = useQuery({
        queryKey: ["case_all_deliverables", activeTenantId, caseQ.data?.meta_json?.commitment_id, deliverableQ.data?.commitment_id],
        enabled: Boolean(activeTenantId && (caseQ.data?.meta_json?.commitment_id || deliverableQ.data?.commitment_id)),
        queryFn: async () => {
            const cid = (caseQ.data?.meta_json as any)?.commitment_id || deliverableQ.data?.commitment_id;
            if (!cid) return [];

            const { data, error } = await supabase
                .from("deliverables")
                .select("id, name, status, due_date")
                .eq("tenant_id", activeTenantId!)
                .eq("commitment_id", cid)
                .order("due_date", { ascending: true });
            
            if (error) throw error;
            return data ?? [];
        },
    });

    const usedDeliverablesQ = useQuery({
        queryKey: ["case_used_deliverables", activeTenantId, caseQ.data?.meta_json?.commitment_id, deliverableQ.data?.commitment_id],
        enabled: Boolean(activeTenantId && (caseQ.data?.meta_json?.commitment_id || deliverableQ.data?.commitment_id) && allDeliverablesQ.data),
        queryFn: async () => {
            const cid = (caseQ.data?.meta_json as any)?.commitment_id || deliverableQ.data?.commitment_id;
            if (!cid) return [];

            const allDelIds = (allDeliverablesQ.data ?? []).map((d: any) => d.id);
            if (allDelIds.length === 0) return [];

            const { data, error } = await supabase
                .from("cases")
                .select("deliverable_id")
                .eq("tenant_id", activeTenantId!)
                .in("deliverable_id", allDelIds)
                .is("deleted_at", null)
                .not("deliverable_id", "is", null);
            
            if (error) throw error;
            return data.map(c => c.deliverable_id);
        }
    });

    const availableDeliverableGroups = useMemo(() => {
        const all = allDeliverablesQ.data || [];
        const usedIds = new Set(usedDeliverablesQ.data || []);
        
        const groups: Record<string, any[]> = {};
        all.forEach(d => {
            if (!groups[d.name]) groups[d.name] = [];
            groups[d.name].push(d);
        });

        return Object.entries(groups).map(([name, items]) => {
            const available = items.filter(d => !usedIds.has(d.id));
            return {
                name,
                nextId: available[0]?.id,
                remaining: available.length,
                total: items.length
            };
        }).sort((a, b) => b.remaining - a.remaining);
    }, [allDeliverablesQ.data, usedDeliverablesQ.data]);

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
    const [creatingIndividualId, setCreatingIndividualId] = useState<number | null>(null);
    const [taskToCreate, setTaskToCreate] = useState<{ st: any, idx: number } | null>(null);

    const handleCreateIndividualTask = async (st: any, idx: number, deliverableId: string, type: string) => {
        if (!activeTenantId || !id || !caseQ.data) return;
        setCreatingIndividualId(idx);
        try {
            const { data: newCase, error: insertError } = await supabase.from("cases").insert({
                tenant_id: activeTenantId,
                journey_id: caseQ.data.journey_id,
                case_type: type || st.type || 'edicao', 
                title: st.title,
                summary_text: st.description || null,
                customer_entity_id: caseQ.data.customer_entity_id,
                deliverable_id: deliverableId || st.deliverable_id || caseQ.data.deliverable_id,
                state: "decupagem__upload",
                meta_json: {
                    parent_case_id: id,
                    customer_entity_name: (caseQ.data.meta_json as any)?.customer_entity_name,
                    commitment_id: (caseQ.data.meta_json as any)?.commitment_id,
                    post_date: st.post_date || null,
                    priority: st.priority || false,
                    script_raw: st.script_raw || null,
                    script_items: st.script_items || null,
                }
            }).select("id").single();

            if (insertError) throw insertError;

            // Vincular no card pai
            const currentSubtasks = [...((caseQ.data.meta_json as any)?.pending_subtasks || [])];
            currentSubtasks[idx] = {
                ...currentSubtasks[idx],
                linked_case_id: newCase.id
            };

            const { error: updateError } = await supabase
                .from("cases")
                .update({
                    meta_json: { ...(caseQ.data.meta_json as any), pending_subtasks: currentSubtasks }
                })
                .eq("id", id);

            if (updateError) throw updateError;
            
            // Log Timeline
            await supabase.from("timeline_events").insert({
                tenant_id: activeTenantId,
                case_id: id,
                event_type: "production_card_created",
                actor_type: "admin",
                actor_id: user?.id ?? null,
                message: `Card de produção criado a partir da subtarefa: ${st.title}`,
                meta_json: { linked_case_id: newCase.id },
                occurred_at: new Date().toISOString(),
            });

            showSuccess("Tarefa de produção criada com sucesso!");
            caseQ.refetch();
        } catch (e: any) {
            showError(`Erro ao criar tarefa: ${e.message}`);
        } finally {
            setCreatingIndividualId(null);
        }
    };

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
        } catch (e: any) { }
    };

    const handleCreateProductionTasks = async () => {
        if (!activeTenantId || !id || !caseQ.data) return;
        const subtasks = (caseQ.data?.meta_json as any)?.pending_subtasks || [];
        if (subtasks.length === 0) {
            showError("Não há subtarefas para criar.");
            return;
        }

        setCreatingTasks(true);
        try {
            for (const st of subtasks) {
                await supabase.from("cases").insert({
                    tenant_id: activeTenantId,
                    journey_id: caseQ.data.journey_id,
                    case_type: st.type, 
                    title: st.title,
                    summary_text: st.description || null,
                    customer_entity_id: caseQ.data.customer_entity_id,
                    deliverable_id: st.deliverable_id || caseQ.data.deliverable_id,
                    status: "open",
                    state: "decupagem__upload",
                    meta_json: {
                        parent_case_id: id,
                        customer_entity_name: (caseQ.data.meta_json as any)?.customer_entity_name,
                        commitment_id: (caseQ.data.meta_json as any)?.commitment_id,
                        post_date: st.post_date || null,
                        priority: st.priority || false,
                        script_raw: st.script_raw || null,
                        script_items: st.script_items || null,
                    }
                });
            }
            
            await supabase.from("cases").update({
                meta_json: {
                    ...(caseQ.data.meta_json as any),
                    pending_subtasks: [],
                    subtasks_created_at: new Date().toISOString()
                }
            }).eq("id", id);
            
            showSuccess("Tarefas de produção criadas com sucesso!");
            caseQ.refetch();
        } catch (e: any) {
            showError(`Erro ao criar: ${e?.message}`);
        } finally {
            setCreatingTasks(false);
        }
    };

    const handleUpdateCaseType = async (newType: string) => {
        if (!activeTenantId || !id) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from("cases")
                .update({ case_type: newType })
                .eq("id", id);
            if (error) throw error;
            showSuccess("Tipo de caso atualizado.");
            caseQ.refetch();
        } catch (e: any) {
            showError(`Erro ao atualizar tipo: ${e?.message}`);
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
                    <Card className={cn(
                        "rounded-[32px] overflow-hidden border-slate-200/60 shadow-xl shadow-slate-200/20 transition-all duration-300",
                        (caseQ.data?.meta_json as any)?.priority ? "ring-2 ring-rose-500 border-rose-500/50" : "border-slate-200/60"
                    )}>
                        <div className="flex flex-col border-b border-slate-100 bg-white p-6 sm:p-8">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <Link to="/app/operacao-m30">
                                            <Button variant="ghost" size="sm" className="h-8 rounded-full px-2 text-slate-500 hover:bg-slate-50">
                                                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                                            </Button>
                                        </Link>
                                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            {(() => {
                                                const eid = (caseQ.data as any).customer_entity_id || (caseQ.data.meta_json as any)?.entity_id;
                                                const metaName = (caseQ.data.meta_json as any)?.customer_entity_name || (caseQ.data.meta_json as any)?.entity_name;
                                                const entityName = metaName || (eid ? "(Vínculo externo)" : null);
                                                return entityName;
                                            })()}
                                            <span>ID: {id?.slice(0, 8)}</span>
                                            <Badge variant="secondary" className="rounded-full">Operação M30</Badge>
                                            {(caseQ.data?.meta_json as any)?.priority && (
                                                <Badge className="rounded-full bg-rose-500 text-white hover:bg-rose-600 border-none shadow-sm animate-pulse">
                                                    PRIORITÁRIO
                                                </Badge>
                                            )}
                                            <Select 
                                                value={caseQ.data?.case_type} 
                                                onValueChange={handleUpdateCaseType}
                                                disabled={updatingState || saving}
                                            >
                                                <SelectTrigger className="h-6 rounded-full bg-slate-50 text-[10px] text-slate-600 drop-shadow-sm border-slate-200 font-bold uppercase px-2 w-auto min-w-[100px]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-2xl">
                                                    <SelectItem value="planejamento" className="rounded-xl text-[10px]">PLANEJAMENTO</SelectItem>
                                                    <SelectItem value="trafego_pago" className="rounded-xl text-[10px]">TRÁFEGO PAGO</SelectItem>
                                                    <SelectItem value="arte_estatica" className="rounded-xl text-[10px]">ARTE ESTÁTICA</SelectItem>
                                                    <SelectItem value="gravacao" className="rounded-xl text-[10px]">GRAVAÇÃO</SelectItem>
                                                    <SelectItem value="relatorio" className="rounded-xl text-[10px]">RELATÓRIO</SelectItem>
                                                    <SelectItem value="edicao" className="rounded-xl text-[10px]">EDIÇÃO</SelectItem>
                                                    <SelectItem value="validacao" className="rounded-xl text-[10px]">VALIDAÇÃO</SelectItem>
                                                    <SelectItem value="aprovacao" className="rounded-xl text-[10px]">APROVAÇÃO</SelectItem>
                                                    <SelectItem value="calendario" className="rounded-xl text-[10px]">CALENDÁRIO</SelectItem>
                                                    <SelectItem value="order" className="rounded-xl text-[10px]">GERAL</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                                        {caseQ.data?.title || "Carregando..."}
                                    </h1>
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
                        </div>

                        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_400px]">
                            <div className="space-y-6">
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
                                    <div className="rounded-[32px] border border-slate-200 bg-slate-50/40 p-6 shadow-inner-sm">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                                <PackageCheck className="h-4 w-4 text-indigo-600" />
                                                Subtarefas de Produção
                                            </h3>

                                            {caseQ.data?.state === "gravao" && (
                                                <Button 
                                                    size="sm" 
                                                    className="h-8 rounded-xl bg-orange-600 hover:bg-orange-700 text-[10px] font-bold shadow-lg shadow-orange-100"
                                                    onClick={handleCreateProductionTasks}
                                                    disabled={creatingTasks}
                                                >
                                                    🚀 Criar Tarefas em Decupagem + Upload
                                                </Button>
                                            )}
                                        </div>
                                        <div className="space-y-4">
                                            <Accordion type="multiple" className="space-y-2">
                                                {((caseQ.data?.meta_json as any)?.pending_subtasks || []).map((st: any, idx: number) => (
                                                    <AccordionItem 
                                                        key={idx} 
                                                        value={`st-${idx}`}
                                                        className={cn(
                                                            "rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden px-0",
                                                            st.priority ? "border-rose-500 ring-1 ring-rose-500/20" : "border-slate-100"
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between p-1 pr-3">
                                                            <AccordionTrigger className="flex-1 hover:no-underline py-2 px-3">
                                                                <div className="flex items-center gap-3">
                                                                    <Badge variant="secondary" className="text-[10px] h-5">
                                                                        {st.type === "arte_estatica" ? "ARTE" : "VÍDEO"}
                                                                    </Badge>
                                                                    <span className="text-sm text-slate-700 font-bold">{st.title}</span>
                                                                    {st.linked_case_id && (
                                                                        <Badge variant="outline" className="text-[9px] border-indigo-200 text-indigo-600 bg-indigo-50/50 flex items-center gap-1 font-bold">
                                                                            <LinkIcon className="h-2.5 w-2.5" /> VINCULADO
                                                                        </Badge>
                                                                    )}
                                                                    {st.post_date && (
                                                                        <span className="text-[10px] text-slate-400 flex items-center gap-1 font-normal">
                                                                            <Calendar className="h-3 w-3" />
                                                                            {new Date(st.post_date).toLocaleDateString()}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </AccordionTrigger>
                                                            
                                                            <div className="flex items-center gap-1">
                                                                {caseQ.data?.state === 'gravao' && !st.linked_case_id && (
                                                                    <Button 
                                                                        size="sm" 
                                                                        variant="ghost"
                                                                        className={cn(
                                                                            "h-9 w-9 rounded-xl flex items-center justify-center p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                                                                        )}
                                                                        disabled={creatingIndividualId === idx}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setTaskToCreate({ st, idx });
                                                                        }}
                                                                        title="Criar card de produção individual"
                                                                    >
                                                                        <Rocket className={cn("h-4 w-4", creatingIndividualId === idx && "animate-spin")} />
                                                                    </Button>
                                                                )}

                                                                {st.linked_case_id && (
                                                                    <Link to={`/app/operacao-m30/${st.linked_case_id}`} onClick={(e) => e.stopPropagation()}>
                                                                        <Button size="sm" variant="ghost" className="h-9 w-9 rounded-xl text-emerald-500 bg-emerald-50 hover:bg-emerald-100/50">
                                                                            <ExternalLink className="h-4 w-4" />
                                                                        </Button>
                                                                    </Link>
                                                                )}

                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="sm" 
                                                                    className="h-9 w-9 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                                                    onClick={async (e) => {
                                                                        e.stopPropagation();
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
                                                        </div>
                                                        <AccordionContent className="px-4 pb-4 space-y-4 pt-1 border-t border-slate-50">
                                                            <SubtaskItemContent 
                                                                st={st} 
                                                                idx={idx} 
                                                                caseMeta={caseQ.data?.meta_json}
                                                                caseId={id!}
                                                                onRefetch={() => caseQ.refetch()}
                                                                caseState={caseQ.data?.state}
                                                                caseData={caseQ.data}
                                                                allDeliverables={allDeliverablesQ.data || []}
                                                            />
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                ))}
                                            </Accordion>
                                            
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
                                                        const next = [...current, { title: el.value, type: "edicao" }];
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
                    </Card>
                </div>

                <TransitionBlockDialog
                    open={transitionBlock.open}
                    onOpenChange={(v) => setTransitionBlock({ ...transitionBlock, open: v })}
                    nextStateName={transitionBlock.nextStateName}
                    blocks={transitionBlock.reasons}
                />

                <AlertDialog open={!!taskToCreate} onOpenChange={(open) => !open && setTaskToCreate(null)}>
                    <AlertDialogContent className="max-w-md rounded-3xl border-slate-200">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-xl font-bold flex items-center gap-2">
                                <Rocket className="h-5 w-5 text-indigo-600" />
                                Criar Card de Produção
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-500 text-sm">
                                Vincule esta subtarefa ao próximo entregável disponível na fila do contrato.
                            </AlertDialogDescription>
                        </AlertDialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Entregável do Contrato</Label>
                                <Select 
                                    value={taskToCreate?.st?.deliverable_id || (availableDeliverableGroups.find(g => g.remaining > 0)?.nextId) || ""}
                                    onValueChange={(val) => {
                                        if (taskToCreate) {
                                            setTaskToCreate({
                                                ...taskToCreate,
                                                st: { ...taskToCreate.st, deliverable_id: val }
                                            });
                                        }
                                    }}
                                >
                                    <SelectTrigger className="h-11 rounded-2xl border-slate-200 focus:ring-indigo-500/20 bg-slate-50/50">
                                        <SelectValue placeholder="Selecione a categoria..." />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-2xl border-slate-200">
                                        {availableDeliverableGroups.map((g) => (
                                            <SelectItem 
                                                key={g.name} 
                                                value={g.nextId || `exhausted-${g.name}`} 
                                                disabled={g.remaining === 0}
                                                className="text-sm focus:bg-indigo-50 focus:text-indigo-900 rounded-xl"
                                            >
                                                <div className="flex items-center justify-between w-full gap-4">
                                                    <span>{g.name}</span>
                                                    <Badge variant={g.remaining > 0 ? "secondary" : "outline"} className="text-[9px] h-4">
                                                        {g.remaining > 0 ? `${g.remaining} restantes` : "ESGOTADO"}
                                                    </Badge>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {taskToCreate?.st?.deliverable_id?.startsWith("exhausted-") && (
                                    <p className="text-[10px] text-rose-500 font-bold px-1 mt-1 flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3" /> Todos os itens desta categoria já foram utilizados.
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold text-slate-500 uppercase px-1">Tipo de Entrega</Label>
                                <Select 
                                    defaultValue={taskToCreate?.st?.type || "edicao"}
                                    onValueChange={(val) => {
                                        if (taskToCreate) {
                                            setTaskToCreate({
                                                ...taskToCreate,
                                                st: { ...taskToCreate.st, type: val }
                                            });
                                        }
                                    }}
                                >
                                    <SelectTrigger className="h-11 rounded-2xl border-slate-200 focus:ring-indigo-500/20 bg-slate-50/50">
                                        <SelectValue placeholder="Selecione o tipo..." />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-2xl border-slate-200">
                                        <SelectItem value="edicao" className="text-sm focus:bg-indigo-50 focus:text-indigo-900 rounded-xl">VÍDEO / EDIÇÃO</SelectItem>
                                        <SelectItem value="artes" className="text-sm focus:bg-indigo-50 focus:text-indigo-900 rounded-xl">ARTES / CRIATIVO</SelectItem>
                                        <SelectItem value="texto" className="text-sm focus:bg-indigo-50 focus:text-indigo-900 rounded-xl">TEXTO / COPY</SelectItem>
                                        <SelectItem value="campanhas" className="text-sm focus:bg-indigo-50 focus:text-indigo-900 rounded-xl">TRÁFEGO / CAMPANHAS</SelectItem>
                                        <SelectItem value="outros" className="text-sm focus:bg-indigo-50 focus:text-indigo-900 rounded-xl">OUTROS</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <AlertDialogFooter className="gap-2 sm:gap-0">
                            <AlertDialogCancel className="rounded-2xl border-slate-200 text-slate-500 text-xs font-bold hover:bg-slate-50">Cancelar</AlertDialogCancel>
                            <AlertDialogAction 
                                className="rounded-2xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-indigo-100 shadow-lg px-6"
                                disabled={!taskToCreate?.st?.deliverable_id || taskToCreate.st.deliverable_id.startsWith("exhausted-")}
                                onClick={() => {
                                    if (taskToCreate) {
                                        const finalDelId = taskToCreate.st.deliverable_id || (availableDeliverableGroups.find(g => g.remaining > 0)?.nextId);
                                        if (finalDelId && !finalDelId.startsWith("exhausted-")) {
                                            handleCreateIndividualTask(
                                                taskToCreate.st, 
                                                taskToCreate.idx,
                                                finalDelId,
                                                taskToCreate.st.type || "edicao"
                                            );
                                            setTaskToCreate(null);
                                        }
                                    }
                                }}
                            >
                                Criar Tarefa 🚀
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </AppShell>
        </RequireAuth>
    );
}
