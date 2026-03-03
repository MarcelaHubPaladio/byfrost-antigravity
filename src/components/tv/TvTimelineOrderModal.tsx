import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, Save, Loader2, PlayCircle } from "lucide-react";
import { showError, showSuccess } from "@/utils/toast";

export function TvTimelineOrderModal({
    tenantId,
    timelineId,
    open,
    onOpenChange
}: {
    tenantId: string;
    timelineId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const qc = useQueryClient();
    const [orderedMedias, setOrderedMedias] = useState<any[]>([]);

    const timelineQ = useQuery({
        queryKey: ["tv_timeline_detail", timelineId],
        enabled: Boolean(timelineId && open),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tv_timelines")
                .select("*")
                .eq("id", timelineId!)
                .single();
            if (error) throw error;
            return data;
        }
    });

    const activeMediasQ = useQuery({
        queryKey: ["tv_active_medias_for_order", tenantId],
        enabled: Boolean(tenantId && open),
        queryFn: async () => {
            // 1. Get all active entity plans
            const { data: activePlans, error: plansErr } = await supabase
                .from("tv_entity_plans")
                .select("entity_id")
                .eq("tenant_id", tenantId)
                .eq("is_active", true)
                .is("deleted_at", null);
            if (plansErr) throw plansErr;
            if (!activePlans?.length) return [];

            const entityIds = activePlans.map(ap => ap.entity_id);

            // 2. Get active media
            const { data: medias, error: mediaErr } = await supabase
                .from("tv_media")
                .select("id, entity_id, media_type, url")
                .eq("tenant_id", tenantId)
                .in("entity_id", entityIds)
                .eq("status", "active")
                .is("deleted_at", null);
            if (mediaErr) throw mediaErr;

            return medias;
        }
    });

    // Initialize the order when data loads
    useEffect(() => {
        if (!activeMediasQ.data || !timelineQ.data) return;

        const manualOrderIds = timelineQ.data.manual_order || [];
        const medias = [...activeMediasQ.data];

        // Sort medias based on manual_order array
        medias.sort((a, b) => {
            let idxA = manualOrderIds.indexOf(a.id);
            let idxB = manualOrderIds.indexOf(b.id);
            // If completely missing from manual_order, push to the end
            if (idxA === -1) idxA = 999999;
            if (idxB === -1) idxB = 999999;
            return idxA - idxB;
        });

        setOrderedMedias(medias);
    }, [activeMediasQ.data, timelineQ.data, open]);

    const moveUp = (index: number) => {
        if (index === 0) return;
        const newOrder = [...orderedMedias];
        const temp = newOrder[index - 1];
        newOrder[index - 1] = newOrder[index];
        newOrder[index] = temp;
        setOrderedMedias(newOrder);
    };

    const moveDown = (index: number) => {
        if (index === orderedMedias.length - 1) return;
        const newOrder = [...orderedMedias];
        const temp = newOrder[index + 1];
        newOrder[index + 1] = newOrder[index];
        newOrder[index] = temp;
        setOrderedMedias(newOrder);
    };

    const saveOrderM = useMutation({
        mutationFn: async () => {
            const newOrderIds = orderedMedias.map(m => m.id);
            const { error } = await supabase
                .from("tv_timelines")
                .update({ manual_order: newOrderIds })
                .eq("id", timelineId!);
            if (error) throw error;
        },
        onSuccess: () => {
            showSuccess("Ordem da reprodução salva com sucesso!");
            qc.invalidateQueries({ queryKey: ["tv_timelines"] });
            qc.invalidateQueries({ queryKey: ["tv_timeline_detail", timelineId] });
            onOpenChange(false);
        },
        onError: () => showError("Erro ao salvar ordem das mídias.")
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Organizar Fila de Reprodução</DialogTitle>
                    <DialogDescription>
                        Esta é a fila de mídias que serão reproduzidas no ponto. Mova os itens para cima ou para baixo para definir a ordem exata.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto pr-2 pb-4 space-y-2">
                    {activeMediasQ.isLoading ? (
                        <div className="flex justify-center p-8 text-slate-500"><Loader2 className="w-6 h-6 animate-spin" /></div>
                    ) : orderedMedias.length === 0 ? (
                        <div className="text-center p-8 text-slate-500 bg-slate-50 rounded-xl">Nenhuma mídia ativa no momento. Adicione planos e mídias aos clientes.</div>
                    ) : (
                        orderedMedias.map((media, idx) => (
                            <div key={media.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                                <div className="text-xl font-bold text-slate-300 w-8 text-center shrink-0">{idx + 1}</div>
                                <div className="p-2 bg-slate-100 rounded-lg shrink-0">
                                    <PlayCircle className="w-5 h-5 text-indigo-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-900 capitalize">{media.media_type.replace('_link', '').replace('_storage', '')}</p>
                                    <p className="text-xs text-slate-500 truncate" title={media.url}>{media.url.split('/').pop() || media.url}</p>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7 rounded-lg"
                                        disabled={idx === 0}
                                        onClick={() => moveUp(idx)}
                                    >
                                        <ArrowUp className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7 rounded-lg"
                                        disabled={idx === orderedMedias.length - 1}
                                        onClick={() => moveDown(idx)}
                                    >
                                        <ArrowDown className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-200 mt-2 gap-3">
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancelar</Button>
                    <Button
                        onClick={() => saveOrderM.mutate()}
                        disabled={saveOrderM.isPending || orderedMedias.length === 0}
                        className="rounded-xl"
                    >
                        {saveOrderM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Salvar Nova Ordem
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
