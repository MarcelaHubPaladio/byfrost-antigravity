import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

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
            return medias.map(m => {
                const plan = activePlans.find(ap => ap.entity_id === m.entity_id)?.tv_plans as any;
                return {
                    ...m,
                    duration: plan?.video_duration_seconds || 15,
                };
            });
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

    return (
        <div className="relative flex h-screen w-screen bg-black overflow-hidden">
            {/* Player de Fundo */}
            {currentMedia.media_type === "supabase_storage" || currentMedia.url.endsWith(".mp4") ? (
                <video
                    src={currentMedia.url}
                    autoPlay
                    muted
                    className="h-full w-full object-cover"
                    onEnded={() => setCurrentIndex((prev) => (prev + 1) % medias.length)}
                    key={currentMedia.id} // forces reload
                />
            ) : currentMedia.media_type === "youtube_link" ? (
                <iframe
                    src={`${currentMedia.url.replace("watch?v=", "embed/")}?autoplay=1&mute=1&controls=0`}
                    className="h-full w-full border-0 pointer-events-none"
                    allow="autoplay"
                    key={currentMedia.id}
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-500">
                    <p>Mídia não suportada: Google Drive / Link genérico.</p>
                </div>
            )}

            {/* Frame / Overlay Dinâmico */}
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/80 to-transparent flex items-end p-6">
                <div>
                    <h2 className="text-white font-bold text-2xl truncate">{(pointQ.data.tenants as any)?.name ?? "Tenant"}</h2>
                    <p className="text-slate-300 text-sm">{pointQ.data.name}</p>
                </div>
            </div>
        </div>
    );
}
