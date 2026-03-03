import { useEffect, useState, useRef } from "react";
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
    const [mediaLoaded, setMediaLoaded] = useState(false);
    const [effectiveDuration, setEffectiveDuration] = useState(15);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    // Reset load state when media changes
    useEffect(() => {
        setMediaLoaded(false);
        setEffectiveDuration(medias[currentIndex]?.duration || 15);
    }, [currentIndex, medias]);

    useEffect(() => {
        if (medias.length === 0) return;

        const currentMedia = medias[currentIndex];
        const durationMs = effectiveDuration * 1000;

        // Clear any previous timeouts
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);

        // 1. Normal duration timer (starts ONLY after media is loaded)
        if (mediaLoaded) {
            timeoutRef.current = setTimeout(() => {
                setCurrentIndex((prev) => (prev + 1) % medias.length);
            }, durationMs);
        } else {
            // 2. Fallback timeout: if media takes too long to load (e.g. 15 seconds), skip it
            fallbackTimeoutRef.current = setTimeout(() => {
                console.warn(`Media timeout to load: ${currentMedia.url}. Skipping.`);
                setCurrentIndex((prev) => (prev + 1) % medias.length);
            }, 10000); // 10 seconds max to load any media
        }

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
        };
    }, [currentIndex, medias, mediaLoaded]);

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
                .stage-container {
                    width: 100vw;
                    height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: black;
                }

                .stage-content {
                    background: black;
                    box-shadow: 0 0 50px rgba(0,0,0,0.5);
                    position: relative;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .aspect-portrait {
                    height: 95vh;
                    aspect-ratio: 9 / 16;
                }

                .aspect-landscape {
                    width: 95vw;
                    aspect-ratio: 16 / 9;
                }
            `}</style>

            {/* Player de Fundo */}
            <div className="stage-container">
                <div className={`stage-content ${isPortrait ? 'aspect-portrait' : 'aspect-landscape'}`}>
                    {currentMedia.media_type === "supabase_storage" || currentMedia.url.endsWith(".mp4") ? (
                        <video
                            src={currentMedia.url}
                            autoPlay
                            muted
                            className="h-full w-full object-contain"
                            onPlay={() => setMediaLoaded(true)}
                            onLoadedMetadata={(e) => {
                                const videoDur = e.currentTarget.duration;
                                const planDur = currentMedia.duration;
                                // 30% tolerance logic: respect video duration within [plan * 0.7, plan * 1.3]
                                const minDur = planDur * 0.7;
                                const maxDur = planDur * 1.3;
                                const clamped = Math.max(minDur, Math.min(maxDur, videoDur));
                                setEffectiveDuration(clamped);
                            }}
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
                            onLoad={() => setMediaLoaded(true)}
                            key={currentMedia.id}
                        />
                    ) : currentMedia.media_type === "google_drive_link" && getDriveFileId(currentMedia.url) ? (
                        <iframe
                            src={`https://drive.google.com/file/d/${getDriveFileId(currentMedia.url)}/preview?autoplay=1&mute=1`}
                            className="h-full w-full border-0 pointer-events-none"
                            allow="autoplay"
                            onLoad={() => setMediaLoaded(true)}
                            key={currentMedia.id}
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-500 bg-slate-900">
                            <p>Mídia não suportada ou URL inválida.</p>
                        </div>
                    )}
                </div>
            </div> {/* Closing the stage-container div */}

            {/* Frame / Overlay Dinâmico */}
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end">
                <div className="p-6 pb-4">
                    <h2 className="text-white font-bold text-2xl truncate">{(pointQ.data.tenants as any)?.name ?? "Tenant"}</h2>
                    <p className="text-slate-300 text-sm">{pointQ.data.name}</p>
                </div>
                {/* Progress Bar (Only animating if loaded) */}
                <div className="w-full h-1 bg-white/20">
                    {mediaLoaded && (
                        <div
                            key={currentMedia.id + currentIndex + effectiveDuration} // Forces animation restart
                            className="h-full bg-primary"
                            style={{
                                animation: `progressBar ${effectiveDuration}s linear forwards`
                            }}
                        />
                    )}
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
