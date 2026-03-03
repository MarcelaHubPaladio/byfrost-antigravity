import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Loader2, UploadCloud, Link as LinkIcon, Youtube } from "lucide-react";
import { showError, showSuccess } from "@/utils/toast";

export function EntityTvCorporativaTab({ tenantId, entityId }: { tenantId: string; entityId: string; }) {
    const qc = useQueryClient();
    const [loadingMedia, setLoadingMedia] = useState(false);
    const [mediaType, setMediaType] = useState<"supabase_storage" | "youtube_link" | "google_drive_link">("google_drive_link");
    const [mediaUrl, setMediaUrl] = useState("");
    const [mediaFile, setMediaFile] = useState<File | null>(null);

    const mediaQ = useQuery({
        queryKey: ["tv_media", tenantId, entityId],
        enabled: Boolean(tenantId && entityId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tv_media")
                .select("*")
                .eq("tenant_id", tenantId)
                .eq("entity_id", entityId)
                .is("deleted_at", null)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        },
    });

    const plansQ = useQuery({
        queryKey: ["tv_plans", tenantId],
        enabled: Boolean(tenantId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tv_plans")
                .select("*")
                .eq("tenant_id", tenantId)
                .is("deleted_at", null)
                .order("name");
            if (error) throw error;
            return data;
        },
    });

    const entityPlansQ = useQuery({
        queryKey: ["tv_entity_plans", tenantId, entityId],
        enabled: Boolean(tenantId && entityId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tv_entity_plans")
                .select("*, tv_plans(name, video_duration_seconds)")
                .eq("tenant_id", tenantId)
                .eq("entity_id", entityId);
            if (error) throw error;
            return data;
        },
    });

    const handleAddMedia = async () => {
        if (mediaType === "supabase_storage" && !mediaFile) return showError("Selecione um arquivo de vídeo");
        if (mediaType !== "supabase_storage" && !mediaUrl.trim()) return showError("Informe o link do vídeo");

        setLoadingMedia(true);
        try {
            let finalUrl = mediaUrl.trim();

            if (mediaType === "supabase_storage" && mediaFile) {
                const fileExt = mediaFile.name.split('.').pop();
                const fileName = `${entityId}/${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
                const { error: uploadError, data } = await supabase.storage
                    .from("tv-corporativa-media")
                    .upload(fileName, mediaFile);

                if (uploadError) throw uploadError;

                const { data: publicUrlData } = supabase.storage
                    .from("tv-corporativa-media")
                    .getPublicUrl(data.path);

                finalUrl = publicUrlData.publicUrl;
            }

            const { error } = await supabase
                .from("tv_media")
                .insert({
                    tenant_id: tenantId,
                    entity_id: entityId,
                    media_type: mediaType,
                    url: finalUrl,
                });

            if (error) throw error;

            showSuccess("Mídia adicionada com sucesso!");
            setMediaUrl("");
            setMediaFile(null);
            qc.invalidateQueries({ queryKey: ["tv_media", tenantId, entityId] });
        } catch (e: any) {
            showError(e?.message ?? "Erro ao adicionar mídia");
        } finally {
            setLoadingMedia(false);
        }
    };

    const handleDeleteMedia = async (id: string) => {
        if (!confirm("Remover esta mídia? Ela deixará de aparecer na TV.")) return;
        try {
            const { error } = await supabase
                .from("tv_media")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", id)
                .eq("tenant_id", tenantId);
            if (error) throw error;
            showSuccess("Mídia removida");
            qc.invalidateQueries({ queryKey: ["tv_media", tenantId, entityId] });
        } catch (e: any) {
            showError("Erro ao remover");
        }
    };

    const handleTogglePlan = async (planId: string, isActive: boolean, existingRecordId?: string) => {
        try {
            if (existingRecordId) {
                // Toggle existing (could be activating a previously disabled or soft-deleted one)
                const { error } = await supabase
                    .from("tv_entity_plans")
                    .update({ is_active: isActive, deleted_at: isActive ? null : new Date().toISOString() })
                    .eq("id", existingRecordId);
                if (error) throw error;
            } else {
                // Create new
                const { error } = await supabase
                    .from("tv_entity_plans")
                    .insert({
                        tenant_id: tenantId,
                        entity_id: entityId,
                        plan_id: planId,
                        is_active: isActive
                    });
                if (error) throw error;
            }
            qc.invalidateQueries({ queryKey: ["tv_entity_plans", tenantId, entityId] });
            showSuccess(isActive ? "Plano ativado" : "Plano desativado");
        } catch (e: any) {
            showError("Erro ao alterar assinatura de plano");
        }
    };

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900">Mídias do Cliente</h3>
                <p className="mt-2 text-sm text-slate-600 mb-6">
                    Adicione os vídeos que serão exibidos nas TVs. Você pode colar links ou fazer upload.
                </p>

                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 mb-6">
                    <div>
                        <Label className="text-xs text-slate-500 mb-2 block">Tipo de Mídia</Label>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant={mediaType === "google_drive_link" ? "default" : "outline"}
                                size="sm"
                                className="rounded-xl flex-1"
                                onClick={() => setMediaType("google_drive_link")}
                            >
                                <LinkIcon className="mr-2 h-4 w-4" /> Drive / Link
                            </Button>
                            <Button
                                variant={mediaType === "youtube_link" ? "default" : "outline"}
                                size="sm"
                                className="rounded-xl flex-1"
                                onClick={() => setMediaType("youtube_link")}
                            >
                                <Youtube className="mr-2 h-4 w-4" /> YouTube
                            </Button>
                            <Button
                                variant={mediaType === "supabase_storage" ? "default" : "outline"}
                                size="sm"
                                className="rounded-xl flex-1"
                                onClick={() => setMediaType("supabase_storage")}
                            >
                                <UploadCloud className="mr-2 h-4 w-4" /> Upload
                            </Button>
                        </div>
                    </div>

                    <div>
                        {mediaType === "supabase_storage" ? (
                            <Input
                                type="file"
                                accept="video/mp4,video/webm"
                                className="rounded-xl bg-white"
                                onChange={e => setMediaFile(e.target.files?.[0] || null)}
                            />
                        ) : (
                            <Input
                                placeholder="Cole o link do vídeo aqui..."
                                className="rounded-xl bg-white"
                                value={mediaUrl}
                                onChange={e => setMediaUrl(e.target.value)}
                            />
                        )}
                    </div>

                    <Button
                        className="w-full rounded-xl"
                        disabled={loadingMedia || (mediaType === "supabase_storage" ? !mediaFile : !mediaUrl.trim())}
                        onClick={handleAddMedia}
                    >
                        {loadingMedia ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusIcon className="mr-2 h-4 w-4" />}
                        Adicionar Mídia
                    </Button>
                </div>

                <div className="space-y-3">
                    <Label className="text-sm font-semibold text-slate-900">Mídias Cadastradas</Label>
                    {mediaQ.isLoading ? (
                        <p className="text-sm text-slate-500">Carregando...</p>
                    ) : mediaQ.data?.length === 0 ? (
                        <p className="text-sm text-slate-500">Nenhuma mídia adicionada ainda.</p>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {mediaQ.data?.map(m => (
                                <div key={m.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        {m.media_type === 'youtube_link' ? <Youtube className="h-5 w-5 text-rose-500 shrink-0" /> : <LinkIcon className="h-5 w-5 text-indigo-500 shrink-0" />}
                                        <div className="truncate">
                                            <p className="text-sm font-medium text-slate-900 capitalize">{m.media_type.replace('_link', '').replace('_storage', '')}</p>
                                            <a href={m.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline truncate block">
                                                {m.url}
                                            </a>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteMedia(m.id)} className="shrink-0 text-slate-400 hover:text-rose-600">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Card>

            <Card className="rounded-2xl border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900">Planos TV Corporativa</h3>
                <p className="mt-2 text-sm text-slate-600 mb-6">
                    Selecione quais os planos de TV corporativa que estão ativos para este cliente.
                </p>

                {plansQ.isLoading || entityPlansQ.isLoading ? (
                    <div className="text-sm text-slate-500">Carregando planos...</div>
                ) : plansQ.data?.length === 0 ? (
                    <div className="text-sm text-slate-500">Nenhum plano cadastrado no Tenant.</div>
                ) : (
                    <div className="space-y-4">
                        {plansQ.data?.map(plan => {
                            const entityPlan = entityPlansQ.data?.find(ep => ep.plan_id === plan.id);
                            const isActive = entityPlan ? (entityPlan.is_active && !entityPlan.deleted_at) : false;

                            return (
                                <div key={plan.id} className={`flex items-center justify-between rounded-xl border p-4 transition ${isActive ? 'border-primary/50 bg-primary/5' : 'border-slate-200'}`}>
                                    <div>
                                        <p className="font-semibold text-slate-900">{plan.name}</p>
                                        <p className="text-xs text-slate-500">{plan.video_duration_seconds}s de duração • {plan.has_contact_break ? 'Com' : 'Sem'} tela de contato</p>
                                    </div>
                                    <Switch
                                        checked={isActive}
                                        onCheckedChange={(c) => handleTogglePlan(plan.id, c, entityPlan?.id)}
                                    />
                                </div>
                            )
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
}

function PlusIcon({ className }: { className?: string }) {
    return (
        <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
        </svg>
    );
}
