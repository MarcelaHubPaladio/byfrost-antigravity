import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
    ArrowLeft,
    ArrowRight,
    Save,
    Loader2,
    Play,
    Image as ImageIcon,
    Pause,
    MonitorPlay,
    X,
    ChevronLeft,
    Clock
} from "lucide-react";
import { showError, showSuccess } from "@/utils/toast";

export default function TvTimelineEditor() {
    const { id: timelineId } = useParams();
    const navigate = useNavigate();
    const qc = useQueryClient();

    const [orderedMedias, setOrderedMedias] = useState<any[]>([]);
    const [selectedMediaIdx, setSelectedMediaIdx] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const timelineQ = useQuery({
        queryKey: ["tv_timeline_detail", timelineId],
        enabled: Boolean(timelineId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tv_timelines")
                .select("*, tv_points(*)")
                .eq("id", timelineId!)
                .single();
            if (error) throw error;
            return data;
        }
    });

    const tenantId = timelineQ.data?.tv_points?.tenant_id;

    const activeMediasQ = useQuery({
        queryKey: ["tv_active_medias_for_editor", tenantId],
        enabled: Boolean(tenantId),
        queryFn: async () => {
            // 1. Get all active entity plans with their plan details
            const { data: activePlans, error: plansErr } = await supabase
                .from("tv_entity_plans")
                .select("entity_id, default_frame_url, tv_plans(*), core_entities(*)")
                .eq("tenant_id", tenantId)
                .eq("is_active", true)
                .is("deleted_at", null);

            if (plansErr) throw plansErr;
            if (!activePlans?.length) return [];

            const entityIds = activePlans.map(ap => ap.entity_id);

            // 2. Get active media
            const { data: medias, error: mediaErr } = await supabase
                .from("tv_media")
                .select("*, frame_url")
                .eq("tenant_id", tenantId)
                .in("entity_id", entityIds)
                .eq("status", "active")
                .is("deleted_at", null);

            if (mediaErr) throw mediaErr;

            // Merge with plan data
            return medias.map(m => {
                const planInfo = activePlans.find(ap => ap.entity_id === m.entity_id);
                // Supabase joins can sometimes return an array or an object depending on schema detection
                const entityData = Array.isArray(planInfo?.core_entities) ? planInfo.core_entities[0] : planInfo?.core_entities;
                const planData = Array.isArray(planInfo?.tv_plans) ? planInfo.tv_plans[0] : planInfo?.tv_plans;

                return {
                    ...m,
                    entity_name: (entityData as any)?.display_name || (entityData as any)?.name || "Cliente sem nome",
                    plan_name: (planData as any)?.name || "Plano Padrão",
                    duration: (planData as any)?.video_duration_seconds || 15,
                    default_frame_url: (planInfo as any)?.default_frame_url
                };
            });
        }
    });

    useEffect(() => {
        if (!activeMediasQ.data || !timelineQ.data) return;

        const manualOrderIds = timelineQ.data.manual_order || [];
        const medias = [...activeMediasQ.data];

        medias.sort((a, b) => {
            let idxA = manualOrderIds.indexOf(a.id);
            let idxB = manualOrderIds.indexOf(b.id);
            if (idxA === -1) idxA = 999999;
            if (idxB === -1) idxB = 999999;
            return idxA - idxB;
        });

        setOrderedMedias(medias);
    }, [activeMediasQ.data, timelineQ.data]);

    const moveLeft = (index: number) => {
        if (index === 0) return;
        const newOrder = [...orderedMedias];
        const temp = newOrder[index - 1];
        newOrder[index - 1] = newOrder[index];
        newOrder[index] = temp;
        setOrderedMedias(newOrder);
        setSelectedMediaIdx(index - 1);
    };

    const moveRight = (index: number) => {
        if (index === orderedMedias.length - 1) return;
        const newOrder = [...orderedMedias];
        const temp = newOrder[index + 1];
        newOrder[index + 1] = newOrder[index];
        newOrder[index] = temp;
        setOrderedMedias(newOrder);
        setSelectedMediaIdx(index + 1);
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
            qc.invalidateQueries({ queryKey: ["tv_active_medias"] });
        },
        onError: () => showError("Erro ao salvar ordem das mídias.")
    });

    const renderPreview = () => {
        if (orderedMedias.length === 0) return (
            <div className="flex flex-col items-center justify-center text-slate-500 gap-4">
                <MonitorPlay className="w-16 h-16 opacity-20" />
                <p>Nenhuma mídia ativa nesta timeline</p>
            </div>
        );

        const media = orderedMedias[selectedMediaIdx];
        if (!media) return null;

        if (media.media_type === "supabase_storage" || media.url.endsWith(".mp4")) {
            return (
                <div className="h-full w-full relative">
                    <video
                        src={media.url}
                        controls
                        autoPlay={isPlaying}
                        className="h-full w-full object-contain bg-black shadow-2xl"
                        key={media.id}
                    />
                    {media.frame_url || media.default_frame_url ? (
                        <div className="absolute inset-0 pointer-events-none z-10">
                            <img
                                src={media.frame_url || media.default_frame_url}
                                className="h-full w-full object-fill"
                                alt="Frame"
                            />
                        </div>
                    ) : null}
                </div>
            );
        } else if (media.media_type === "youtube_link") {
            let videoId = "";
            if (media.url.includes("watch?v=")) videoId = media.url.split("watch?v=")[1].split("&")[0];
            else if (media.url.includes("/shorts/")) videoId = media.url.split("/shorts/")[1].split("?")[0];
            else if (media.url.includes("youtu.be/")) videoId = media.url.split("youtu.be/")[1].split("?")[0];

            return (
                <div className="h-full w-full relative">
                    <iframe
                        src={`https://www.youtube.com/embed/${videoId}?autoplay=${isPlaying ? 1 : 0}&mute=1`}
                        className="h-full w-full border-0 shadow-2xl"
                        allow="autoplay; encrypted-media"
                        allowFullScreen
                        key={media.id}
                    />
                    {media.frame_url || media.default_frame_url ? (
                        <div className="absolute inset-0 pointer-events-none z-10">
                            <img
                                src={media.frame_url || media.default_frame_url}
                                className="h-full w-full object-fill"
                                alt="Frame"
                            />
                        </div>
                    ) : null}
                </div>
            );
        } else if (media.media_type === "google_drive_link") {
            const match = media.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
            const driveId = match ? match[1] : null;
            if (driveId) {
                return (
                    <div className="h-full w-full relative">
                        <iframe
                            src={`https://drive.google.com/file/d/${driveId}/preview?autoplay=${isPlaying ? 1 : 0}&mute=1`}
                            className="h-full w-full border-0 shadow-2xl"
                            allow="autoplay"
                            key={media.id}
                        />
                        {media.frame_url || media.default_frame_url ? (
                            <div className="absolute inset-0 pointer-events-none z-10">
                                <img
                                    src={media.frame_url || media.default_frame_url}
                                    className="h-full w-full object-fill"
                                    alt="Frame"
                                />
                            </div>
                        ) : null}
                    </div>
                );
            }
        }

        return (
            <div className="flex h-full w-full items-center justify-center text-slate-500 bg-slate-900 relative">
                <ImageIcon className="h-12 w-12 opacity-20" />
                {media.frame_url || media.default_frame_url ? (
                    <div className="absolute inset-0 pointer-events-none z-10">
                        <img
                            src={media.frame_url || media.default_frame_url}
                            className="h-full w-full object-fill"
                            alt="Frame"
                        />
                    </div>
                ) : null}
            </div>
        );
    };

    if (timelineQ.isLoading || activeMediasQ.isLoading) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-white">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-950">
            {/* Navbar */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50 backdrop-blur-md shrink-0 z-10">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-slate-400 hover:text-white hover:bg-slate-800 rounded-full"
                        onClick={() => navigate("/app/tv-corporativa")}
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </Button>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg">
                            <MonitorPlay className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h1 className="text-white font-bold text-lg leading-tight">Editor de Timeline</h1>
                            <p className="text-slate-400 text-xs font-medium">Ponto: <span className="text-indigo-400">{timelineQ.data?.tv_points?.name}</span></p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        onClick={() => saveOrderM.mutate()}
                        disabled={saveOrderM.isPending || orderedMedias.length === 0}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-500/20 px-6"
                    >
                        {saveOrderM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Publicar Alterações
                    </Button>
                </div>
            </header>

            {/* Main Editor Section */}
            <main className="flex-1 flex flex-col min-h-0 bg-slate-900/30">
                {/* Preview Area */}
                <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden p-8">
                    <div
                        className={`max-w-full max-h-full shadow-2xl transition-all duration-500 ring-1 ring-white/10 overflow-hidden ${timelineQ.data?.tv_points?.orientation === 'portrait'
                                ? 'h-full aspect-[9/16]'
                                : 'w-full aspect-video'
                            }`}
                    >
                        {renderPreview()}
                    </div>
                </div>

                {/* Timeline Area */}
                <div className="h-80 bg-slate-950/80 border-t border-slate-800 flex flex-col shrink-0 backdrop-blur-xl">
                    {/* Timeline Controls */}
                    <div className="px-8 py-4 border-b border-slate-800/50 flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <Button
                                variant="secondary"
                                size="icon"
                                className="rounded-full bg-indigo-600 hover:bg-indigo-700 text-white border-0 h-10 w-10 shadow-lg shadow-indigo-500/20"
                                onClick={() => setIsPlaying(!isPlaying)}
                            >
                                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                            </Button>

                            <div className="flex items-center gap-2">
                                <span className="text-white text-xs font-bold uppercase tracking-widest bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                                    Track Principal
                                </span>
                                <span className="text-slate-500 text-[10px] font-medium uppercase tracking-tighter">
                                    {orderedMedias.length} mídias selecionadas
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 text-slate-500 text-xs font-mono">
                            <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3" />
                                <span>{orderedMedias.reduce((acc, m) => acc + m.duration, 0)}s total</span>
                            </div>
                        </div>
                    </div>

                    {/* Timeline Grid / Scrollable Area */}
                    <div className="flex-1 overflow-x-auto overflow-y-hidden px-8 py-6 relative select-none scrollbar-hide">
                        {/* Ruler Decoration */}
                        <div className="absolute top-2 left-8 right-8 flex justify-between text-[10px] text-slate-600 font-mono opacity-50 pointer-events-none">
                            {Array.from({ length: 11 }).map((_, i) => (
                                <span key={i}>{String(i * 15).padStart(2, '0')}:00s</span>
                            ))}
                        </div>

                        <div className="flex h-full gap-3 mt-4">
                            {orderedMedias.map((media, idx) => {
                                const isSelected = selectedMediaIdx === idx;
                                // 1 second = ~10 pixels
                                const baseWidth = 180;
                                const durationWidth = media.duration * 8;
                                const totalWidth = Math.max(baseWidth, durationWidth);

                                return (
                                    <div
                                        key={media.id}
                                        className={`
                                            relative flex flex-col justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer group
                                            ${isSelected
                                                ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_20px_rgba(79,70,229,0.1)] ring-1 ring-indigo-500/50'
                                                : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900'}
                                        `}
                                        style={{ width: `${totalWidth}px`, minWidth: `${totalWidth}px` }}
                                        onClick={() => {
                                            setSelectedMediaIdx(idx);
                                            setIsPlaying(true);
                                        }}
                                    >
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className={`p-1.5 rounded-lg shrink-0 ${isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700'}`}>
                                                    {media.media_type === 'youtube_link' ? <Play className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-500 bg-slate-950/50 px-2 py-0.5 rounded-full border border-slate-800">
                                                    #{idx + 1}
                                                </div>
                                            </div>

                                            <div className="min-w-0">
                                                <h3 className={`text-[10px] font-bold truncate uppercase tracking-tight ${isSelected ? 'text-indigo-300' : 'text-slate-400'}`}>
                                                    {media.entity_name}
                                                </h3>
                                                <h3 className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                                                    {media.name || "Vídeo sem nome"}
                                                </h3>
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    <span className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 truncate">
                                                        {media.plan_name}
                                                    </span>
                                                    <span className="text-[9px] font-bold text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 whitespace-nowrap">
                                                        {media.duration}s
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Drag / Sort Controls */}
                                        <div className="flex justify-between items-center mt-auto pt-4 gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 rounded-full bg-slate-950/50 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
                                                disabled={idx === 0}
                                                onClick={(e) => { e.stopPropagation(); moveLeft(idx); }}
                                            >
                                                <ArrowLeft className="w-3.5 h-3.5" />
                                            </Button>

                                            <div className={`h-1 flex-1 bg-slate-800 rounded-full overflow-hidden`}>
                                                <div className={`h-full transition-all duration-300 ${isSelected ? 'bg-indigo-500' : 'bg-slate-600'}`} style={{ width: '100%' }}></div>
                                            </div>

                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 rounded-full bg-slate-950/50 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
                                                disabled={idx === orderedMedias.length - 1}
                                                onClick={(e) => { e.stopPropagation(); moveRight(idx); }}
                                            >
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
