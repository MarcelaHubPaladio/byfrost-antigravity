import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

// Helper to extract Google Drive file ID
function getDriveFileId(url: string) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}

// Helper to format YouTube URLs for embed
function getYouTubeEmbedUrl(url: string) {
    let videoId = "";
    if (url.includes("watch?v=")) {
        videoId = url.split("watch?v=")[1].split("&")[0];
    } else if (url.includes("/shorts/")) {
        videoId = url.split("/shorts/")[1].split("?")[0];
    } else if (url.includes("youtu.be/")) {
        videoId = url.split("youtu.be/")[1].split("?")[0];
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}` : url;
}

export default function TvPlayer() {
    const { pointId } = useParams();
    const [currentIndex, setCurrentIndex] = useState(0);

    const pointQ = useQuery({
        queryKey: ["tv_point_player", pointId],
        enabled: Boolean(pointId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tv_points")
                .select("*, tenants(name)")
                .eq("id", pointId!)
                .is("deleted_at", null)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
    });

    const timelineQ = useQuery({
        queryKey: ["tv_timeline_player", pointId],
        enabled: Boolean(pointId && pointQ.data?.tenant_id),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tv_timelines")
                .select("*")
                .eq("tv_point_id", pointId!)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
    });

    const activeMediasQ = useQuery({
        queryKey: ["tv_active_medias", pointQ.data?.tenant_id],
        enabled: Boolean(pointQ.data?.tenant_id && timelineQ.data?.is_active),
        queryFn: async () => {
            // 1. Get all active entity plans for this tenant
            const { data: activePlans, error: plansErr } = await supabase
                .from("tv_entity_plans")
                .select("entity_id, tv_plans(video_duration_seconds, frame_layout)")
                .eq("tenant_id", pointQ.data!.tenant_id)
                .eq("is_active", true)
                .is("deleted_at", null);
            if (plansErr) throw plansErr;

            if (!activePlans || activePlans.length === 0) return [];

            const entityIds = activePlans.map(ap => ap.entity_id);

            // 2. Get media for those entities
            const { data: medias, error: mediaErr } = await supabase
                .from("tv_media")
                .select("id, entity_id, media_type, url")
                .eq("tenant_id", pointQ.data!.tenant_id)
                .in("entity_id", entityIds)
                .eq("status", "active")
                .is("deleted_at", null);
            if (mediaErr) throw mediaErr;

            // 3. Map medias to their duration based on the plan
            const mappedMedias = medias.map(m => {
                const plan = activePlans.find(ap => ap.entity_id === m.entity_id)?.tv_plans as any;
                return {
                    ...m,
                    duration: plan?.video_duration_seconds || 15,
                };
            });

            // 4. Sort medias based on manual_order if it exists and has items
            const manualOrderIds = timelineQ.data?.manual_order || [];
            if (manualOrderIds.length > 0) {
                mappedMedias.sort((a, b) => {
                    let idxA = manualOrderIds.indexOf(a.id);
                    let idxB = manualOrderIds.indexOf(b.id);
                    // Push unsorted/new medias to the end
                    if (idxA === -1) idxA = 999999;
                    if (idxB === -1) idxB = 999999;
                    return idxA - idxB;
                });
            }

            return mappedMedias;
        },
    });

    const medias = activeMediasQ.data || [];

    useEffect(() => {
        if (medias.length === 0) return;

        const currentMedia = medias[currentIndex];
        const durationMs = currentMedia.duration * 1000;

        const timer = setTimeout(() => {
            setCurrentIndex((prev) => (prev + 1) % medias.length);
        }, durationMs);

        return () => clearTimeout(timer);
    }, [currentIndex, medias]);

    if (pointQ.isLoading || timelineQ.isLoading || activeMediasQ.isLoading) {
        return (
            <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="mt-4 text-sm font-medium">Carregando Player TV Corporativa...</p>
            </div>
        );
    }

    if (!pointQ.data) {
        return (
            <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-slate-400">
                <p>Ponto de TV não encontrado.</p>
            </div>
        );
    }

    if (!timelineQ.data?.is_active) {
        return (
            <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-slate-400">
                <p className="text-xl font-bold text-white mb-2">{pointQ.data.name}</p>
                <p>A timeline deste ponto está inativa.</p>
            </div>
        );
    }

    if (medias.length === 0) {
        return (
            <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-slate-400">
                <p className="text-xl font-bold text-white mb-2">{pointQ.data.name}</p>
                <p>Nenhuma mídia ativa na fila de reprodução.</p>
            </div>
        );
    }

    const currentMedia = medias[currentIndex];
    const isPortrait = pointQ.data.orientation === "portrait";

    return (
        <div className={`relative flex bg-black overflow-hidden ${isPortrait ? 'h-screen w-screen flex-row' : 'h-screen w-screen flex-col'}`}>
            <style>{`
                /* Wrapper styles so that portrait content plays natively rotated or fit within vertical displays */
                .portrait-player {
                    transform: rotate(-90deg);
                    transform-origin: top left;
                    width: 100vh;
                    height: 100vw;
                    position: absolute;
                    top: 100%;
                    left: 0;
                }
                
                @media (orientation: portrait) {
                   .portrait-player {
                       transform: none;
                       width: 100vw;
                       height: 100vh;
                       position: relative;
                       top: 0;
                   }
                }
            `}</style>

            {/* Player de Fundo */}
            <div className={`absolute inset-0 ${isPortrait ? 'portrait-player' : ''}`}>
                {currentMedia.media_type === "supabase_storage" || currentMedia.url.endsWith(".mp4") ? (
                    <video
                        src={currentMedia.url}
                        autoPlay
                        muted
                        className="h-full w-full object-cover"
                        onEnded={() => setCurrentIndex((prev) => (prev + 1) % medias.length)}
                        onError={(e) => {
                            console.error("Erro ao carregar video da TV:", currentMedia.url, e);
                            setCurrentIndex((prev) => (prev + 1) % medias.length);
                        }}
                        key={currentMedia.id} // forces reload
                    />
                ) : currentMedia.media_type === "youtube_link" ? (
                    <iframe
                        src={getYouTubeEmbedUrl(currentMedia.url)}
                        className="h-full w-full border-0 pointer-events-none"
                        allow="autoplay"
                        key={currentMedia.id}
                    />
                ) : currentMedia.media_type === "google_drive_link" && getDriveFileId(currentMedia.url) ? (
                    <iframe
                        src={`https://drive.google.com/file/d/${getDriveFileId(currentMedia.url)}/preview?autoplay=1&mute=1`}
                        className="h-full w-full border-0 pointer-events-none"
                        allow="autoplay"
                        key={currentMedia.id}
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-500 bg-slate-900">
                        <p>Mídia não suportada ou URL inválida.</p>
                    </div>
                )}
            </div>

            {/* Frame / Overlay Dinâmico */}
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end">
                <div className="p-6 pb-4">
                    <h2 className="text-white font-bold text-2xl truncate">{(pointQ.data.tenants as any)?.name ?? "Tenant"}</h2>
                    <p className="text-slate-300 text-sm">{pointQ.data.name}</p>
                </div>
                {/* Progress Bar */}
                <div className="w-full h-1 bg-white/20">
                    <div
                        key={currentMedia.id + currentIndex} // Forces animation restart
                        className="h-full bg-primary"
                        style={{
                            animation: `progressBar ${currentMedia.duration}s linear forwards`
                        }}
                    />
                </div>
            </div>

            <style>{`
                @keyframes progressBar {
                    0% { width: 0%; }
                    100% { width: 100%; }
                }
            `}</style>
        </div>
    );
}
