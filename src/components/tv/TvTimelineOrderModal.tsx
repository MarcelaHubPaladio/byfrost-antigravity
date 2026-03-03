import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Save, Loader2, Play, Image as ImageIcon, Pause, MonitorPlay, X } from "lucide-react";
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
    const [selectedMediaIdx, setSelectedMediaIdx] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState(false);

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

    const handlePreviewClick = (idx: number) => {
        setSelectedMediaIdx(idx);
        setIsPlaying(true);
    };

    const renderPreview = () => {
        if (orderedMedias.length === 0) return <div className="flex h-full items-center justify-center text-slate-500">Nenhuma mídia</div>;

        const media = orderedMedias[selectedMediaIdx];
        if (!media) return null;

        if (media.media_type === "supabase_storage" || media.url.endsWith(".mp4")) {
            return (
                <video
                    src={media.url}
                    controls
                    autoPlay={isPlaying}
                    className="h-full w-full object-contain bg-black"
                    key={media.id}
                />
            );
        } else if (media.media_type === "youtube_link") {
            let videoId = "";
            if (media.url.includes("watch?v=")) videoId = media.url.split("watch?v=")[1].split("&")[0];
            else if (media.url.includes("/shorts/")) videoId = media.url.split("/shorts/")[1].split("?")[0];
            else if (media.url.includes("youtu.be/")) videoId = media.url.split("youtu.be/")[1].split("?")[0];

            return (
                <iframe
                    src={`https://www.youtube.com/embed/${videoId}?autoplay=${isPlaying ? 1 : 0}&mute=1`}
                    className="h-full w-full border-0"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                    key={media.id}
                />
            );
        } else if (media.media_type === "google_drive_link") {
            const match = media.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
            const driveId = match ? match[1] : null;
            if (driveId) {
                return (
                    <iframe
                        src={`https://drive.google.com/file/d/${driveId}/preview?autoplay=${isPlaying ? 1 : 0}&mute=1`}
                        className="h-full w-full border-0"
                        allow="autoplay"
                        key={media.id}
                    />
                );
            }
        }

        return <div className="flex h-full items-center justify-center text-slate-500 bg-slate-900"><ImageIcon className="h-12 w-12 opacity-20" /></div>;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 flex flex-col overflow-hidden bg-slate-950 border-slate-800 rounded-2xl g-0">

                {/* Header Navbar */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg">
                            <MonitorPlay className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-white font-semibold text-lg">Editor de Timeline</h2>
                            <p className="text-slate-400 text-xs">Organize a sequência exata de reprodução do Ponto de TV</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            className="text-slate-400 hover:text-white hover:bg-slate-800"
                            onClick={() => onOpenChange(false)}
                        >
                            <X className="w-5 h-5" />
                        </Button>
                        <Button
                            onClick={() => saveOrderM.mutate()}
                            disabled={saveOrderM.isPending || orderedMedias.length === 0}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
                        >
                            {saveOrderM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Salvar Alterações
                        </Button>
                    </div>
                </div>

                {/* Main Editor Body */}
                <div className="flex-1 flex flex-col min-h-0 bg-slate-900">

                    {/* Top: Video Preview */}
                    <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                        {renderPreview()}
                    </div>

                    {/* Bottom: Horizontal Timeline Track */}
                    <div className="h-64 bg-slate-950 border-t border-slate-800 flex flex-col shrink-0">
                        {/* Track Header / Controls */}
                        <div className="px-6 py-3 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="rounded-full bg-indigo-600 hover:bg-indigo-700 text-white border-0"
                                    onClick={() => setIsPlaying(!isPlaying)}
                                >
                                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                                </Button>
                                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Trilha de Mídia ({orderedMedias.length})</span>
                            </div>
                        </div>

                        {/* Horizontal Track Area */}
                        <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 relative select-none">
                            {/* Time markers decoration */}
                            <div className="absolute top-2 left-6 right-6 flex justify-between text-[10px] text-slate-600 font-mono">
                                <span>00:00</span>
                                <span>00:15</span>
                                <span>00:30</span>
                                <span>00:45</span>
                                <span>01:00</span>
                                <span>01:15</span>
                                <span>01:30</span>
                            </div>

                            <div className="flex h-full gap-2 mt-2">
                                {activeMediasQ.isLoading ? (
                                    <div className="flex w-full items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
                                ) : orderedMedias.length === 0 ? (
                                    <div className="flex w-full items-center justify-center text-slate-500 text-sm">Nenhuma mídia ativa.</div>
                                ) : (
                                    orderedMedias.map((media, idx) => {
                                        const isSelected = selectedMediaIdx === idx;
                                        return (
                                            <div
                                                key={media.id}
                                                className={`
                                                    relative flex flex-col justify-between p-3 rounded-xl min-w-[200px] w-[200px] border-2 transition-all cursor-pointer
                                                    ${isSelected ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}
                                                `}
                                                onClick={() => handlePreviewClick(idx)}
                                            >
                                                <div className="flex items-start justify-between gap-2 overflow-hidden">
                                                    <div className="p-1.5 bg-slate-800 rounded-lg shrink-0">
                                                        {media.media_type === 'youtube_link' ? <Play className="w-3 h-3 text-rose-500" /> : <ImageIcon className="w-3 h-3 text-emerald-500" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-xs font-semibold truncate ${isSelected ? 'text-indigo-400' : 'text-slate-300'}`}>
                                                            {media.media_type.replace('_link', '').replace('_storage', '').toUpperCase()}
                                                        </p>
                                                        <p className="text-[10px] text-slate-500 truncate" title={media.url}>
                                                            {media.url.split('/').pop() || media.url}
                                                        </p>
                                                    </div>
                                                    <div className="text-[10px] font-mono font-bold text-slate-600 bg-slate-950 px-1.5 py-0.5 rounded shrink-0">
                                                        Pos {idx + 1}
                                                    </div>
                                                </div>

                                                {/* Reorder Controls (Only show on hover or if selected) */}
                                                <div className="flex justify-between items-center mt-4">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                                                        disabled={idx === 0}
                                                        onClick={(e) => { e.stopPropagation(); moveUp(idx); }}
                                                    >
                                                        <ArrowLeft className="w-3 h-3" />
                                                    </Button>

                                                    <div className="h-1 flex-1 mx-2 bg-slate-800 rounded-full overflow-hidden">
                                                        <div className={`h-full ${isSelected ? 'bg-indigo-500' : 'bg-slate-700'}`} style={{ width: '100%' }}></div>
                                                    </div>

                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                                                        disabled={idx === orderedMedias.length - 1}
                                                        onClick={(e) => { e.stopPropagation(); moveDown(idx); }}
                                                    >
                                                        <ArrowRight className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>

            </DialogContent>
        </Dialog>
    );
}
