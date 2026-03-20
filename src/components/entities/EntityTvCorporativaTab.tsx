import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Trash2, Loader2, UploadCloud, Link as LinkIcon, Youtube, Pencil, Check, X, Image as ImageIcon, Share2, RefreshCw, Copy, Plus } from "lucide-react";
import { showError, showSuccess } from "@/utils/toast";

export function EntityTvCorporativaTab({ tenantId, entityId }: { tenantId: string; entityId: string; }) {
    const qc = useQueryClient();
    const [loadingMedia, setLoadingMedia] = useState(false);
    const [mediaType, setMediaType] = useState<"supabase_storage" | "youtube_link" | "google_drive_link">("google_drive_link");
    const [mediaUrl, setMediaUrl] = useState("");
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaName, setMediaName] = useState("");
    const [editingMediaId, setEditingMediaId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const [uploadingFrameId, setUploadingFrameId] = useState<string | null>(null); // 'default' or mediaId

    const entityQ = useQuery({
        queryKey: ["tv_entity_core", tenantId, entityId],
        enabled: Boolean(tenantId && entityId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("core_entities")
                .select("display_name, magic_token")
                .eq("id", entityId)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
    });

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
                    name: mediaName.trim() || (mediaType === "supabase_storage" ? mediaFile?.name : "Nova Mídia"),
                });

            if (error) throw error;

            showSuccess("Mídia adicionada com sucesso!");
            setMediaUrl("");
            setMediaFile(null);
            setMediaName("");
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

    const handleUpdateMediaName = async (id: string) => {
        if (!editingName.trim()) return;
        try {
            const { error } = await supabase
                .from("tv_media")
                .update({ name: editingName.trim() })
                .eq("id", id);
            if (error) throw error;
            showSuccess("Nome da mídia atualizado!");
            setEditingMediaId(null);
            qc.invalidateQueries({ queryKey: ["tv_media", tenantId, entityId] });
        } catch (e: any) {
            showError("Erro ao atualizar nome");
        }
    };

    const handleToggleMediaStatus = async (id: string, currentStatus: string) => {
        const nextStatus = currentStatus === "active" ? "inactive" : "active";
        try {
            const { error } = await supabase
                .from("tv_media")
                .update({ status: nextStatus })
                .eq("id", id);
            if (error) throw error;
            showSuccess(nextStatus === "active" ? "Mídia ativada" : "Mídia desativada");
            qc.invalidateQueries({ queryKey: ["tv_media", tenantId, entityId] });
        } catch (e: any) {
            showError("Erro ao alterar status da mídia");
        }
    };

    const handleTogglePlan = async (planId: string, isActive: boolean, existingRecordId?: string) => {
        try {
            if (existingRecordId) {
                if (isActive) {
                    await supabase
                        .from("tv_entity_plans")
                        .update({ is_active: false, deleted_at: new Date().toISOString() })
                        .eq("entity_id", entityId)
                        .is("deleted_at", null)
                        .neq("id", existingRecordId);
                }

                const { error } = await supabase
                    .from("tv_entity_plans")
                    .update({ is_active: isActive, deleted_at: isActive ? null : new Date().toISOString() })
                    .eq("id", existingRecordId);
                if (error) throw error;
            } else {
                if (isActive) {
                    await supabase
                        .from("tv_entity_plans")
                        .update({ is_active: false, deleted_at: new Date().toISOString() })
                        .eq("entity_id", entityId)
                        .is("deleted_at", null);
                }

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

    const handleUploadFrame = async (file: File, targetId: string, isDefault = false) => {
        setUploadingFrameId(targetId);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `frames/${entityId}/${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
            const { error: uploadError, data } = await supabase.storage
                .from("tv-corporativa-media")
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage
                .from("tv-corporativa-media")
                .getPublicUrl(data.path);

            const frameUrl = publicUrlData.publicUrl;

            if (isDefault) {
                const { error } = await supabase
                    .from("tv_entity_plans")
                    .update({ default_frame_url: frameUrl })
                    .eq("id", targetId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("tv_media")
                    .update({ frame_url: frameUrl })
                    .eq("id", targetId);
                if (error) throw error;
            }

            showSuccess("Moldura salva com sucesso!");
            qc.invalidateQueries({ queryKey: ["tv_entity_plans", tenantId, entityId] });
            qc.invalidateQueries({ queryKey: ["tv_media", tenantId, entityId] });
        } catch (e: any) {
            showError("Erro ao subir moldura: " + (e.message || "Erro desconhecido"));
        } finally {
            setUploadingFrameId(null);
        }
    };

    const handleRemoveFrame = async (targetId: string, isDefault = false) => {
        try {
            if (isDefault) {
                const { error } = await supabase
                    .from("tv_entity_plans")
                    .update({ default_frame_url: null })
                    .eq("id", targetId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("tv_media")
                    .update({ frame_url: null })
                    .eq("id", targetId);
                if (error) throw error;
            }
            showSuccess("Moldura removida");
            qc.invalidateQueries({ queryKey: ["tv_entity_plans", tenantId, entityId] });
            qc.invalidateQueries({ queryKey: ["tv_media", tenantId, entityId] });
        } catch (e: any) {
            showError("Erro ao remover moldura");
        }
    };

    const handleGenerateMagicToken = async () => {
        try {
            const token = crypto.randomUUID();
            const { error } = await supabase
                .from("core_entities")
                .update({ magic_token: token })
                .eq("id", entityId);

            if (error) throw error;
            showSuccess("Link de acesso gerado!");
            qc.invalidateQueries({ queryKey: ["tv_entity_core", tenantId, entityId] });
        } catch (e: any) {
            showError("Erro ao gerar link: " + e.message);
        }
    };

    const copyMagicLink = () => {
        if (!entityQ.data?.magic_token) return;
        const url = `${window.location.origin}/tv-upload/${entityQ.data.magic_token}`;
        navigator.clipboard.writeText(url);
        showSuccess("Link de upload copiado!");
    };

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl border-slate-200 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                    <div className="flex-1">
                        <h3 className="text-base font-bold text-slate-900 leading-tight">Mídias do Cliente</h3>
                        <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                            Vídeos ou links para exibição na TV.
                        </p>
                    </div>
                    <div className="w-full sm:w-auto">
                        {entityQ.data?.magic_token ? (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full sm:w-auto rounded-xl border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 h-9 font-semibold"
                                onClick={copyMagicLink}
                            >
                                <Copy className="mr-2 h-3.5 w-3.5" /> Copiar Link
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full sm:w-auto rounded-xl h-9 font-semibold"
                                onClick={handleGenerateMagicToken}
                            >
                                <Share2 className="mr-2 h-3.5 w-3.5" /> Ativar Link
                            </Button>
                        )}
                    </div>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 mb-5">
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
                        <Button
                            variant={mediaType === "google_drive_link" ? "default" : "outline"}
                            className="h-8 px-3 rounded-lg text-xs font-semibold flex-1 sm:flex-none whitespace-nowrap"
                            onClick={() => setMediaType("google_drive_link")}
                        >
                            <LinkIcon className="mr-1.5 h-3 w-3" /> Drive/Link
                        </Button>
                        <Button
                            variant={mediaType === "youtube_link" ? "default" : "outline"}
                            className="h-8 px-3 rounded-lg text-xs font-semibold flex-1 sm:flex-none whitespace-nowrap"
                            onClick={() => setMediaType("youtube_link")}
                        >
                            <Youtube className="mr-1.5 h-3 w-3" /> YouTube
                        </Button>
                        <Button
                            variant={mediaType === "supabase_storage" ? "default" : "outline"}
                            className="h-8 px-3 rounded-lg text-xs font-semibold flex-1 sm:flex-none whitespace-nowrap"
                            onClick={() => setMediaType("supabase_storage")}
                        >
                            <UploadCloud className="mr-1.5 h-3 w-3" /> Upload
                        </Button>
                    </div>

                    <div className="grid gap-2">
                        <div>
                            <Input
                                placeholder="Nome da mídia (opcional)"
                                className="h-9 rounded-lg bg-white text-xs"
                                value={mediaName}
                                onChange={e => setMediaName(e.target.value)}
                            />
                        </div>

                        <div>
                            {mediaType === "supabase_storage" ? (
                                <Input
                                    type="file"
                                    accept="video/mp4,video/webm"
                                    className="h-9 rounded-lg bg-white text-xs py-1"
                                    onChange={e => setMediaFile(e.target.files?.[0] || null)}
                                />
                            ) : (
                                <Input
                                    placeholder={mediaType === "youtube_link" ? "Cole o link do YouTube aqui..." : "Cole o link do Drive/externo aqui..."}
                                    className="h-9 rounded-lg bg-white text-xs"
                                    value={mediaUrl}
                                    onChange={e => setMediaUrl(e.target.value)}
                                />
                            )}
                        </div>

                        <Button
                            className="w-full h-9 rounded-lg text-xs font-bold"
                            disabled={loadingMedia || (mediaType === "supabase_storage" ? !mediaFile : !mediaUrl.trim())}
                            onClick={handleAddMedia}
                        >
                            {loadingMedia ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
                            Adicionar Mídia
                        </Button>
                    </div>
                </div>

                <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mídias Cadastradas</h4>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-slate-100 text-slate-500">{mediaQ.data?.length ?? 0}</Badge>
                </div>

                <div className="space-y-2">
                    {mediaQ.isLoading ? (
                        <p className="text-xs text-slate-500 py-4 text-center italic">Carregando mídias...</p>
                    ) : mediaQ.data?.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center">
                            <p className="text-xs text-slate-400">Nenhuma mídia adicionada ainda.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {mediaQ.data?.map(m => (
                                <div key={m.id} className={`flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border p-2.5 gap-2.5 transition ${m.status === 'inactive' ? 'opacity-60 grayscale bg-slate-50 border-slate-200' : 'border-slate-200 bg-white shadow-sm'}`}>
                                    <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                                        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", m.media_type === 'youtube_link' ? 'bg-rose-50 text-rose-500' : 'bg-indigo-50 text-indigo-500')}>
                                            {m.media_type === 'youtube_link' ? <Youtube className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
                                        </div>
                                        <div className="truncate flex-1">
                                            {editingMediaId === m.id ? (
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        size={1}
                                                        className="h-7 rounded-md text-xs"
                                                        value={editingName}
                                                        onChange={e => setEditingName(e.target.value)}
                                                        onKeyDown={e => e.key === "Enter" && handleUpdateMediaName(m.id)}
                                                        autoFocus
                                                    />
                                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-50 shrink-0" onClick={() => handleUpdateMediaName(m.id)}>
                                                        <Check className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="group/title relative overflow-hidden pr-6">
                                                    <p className="text-xs font-bold text-slate-900 truncate">{m.name || "Sem nome"}</p>
                                                    <p className="text-[10px] text-slate-400 truncate">{m.url}</p>
                                                    <button
                                                        className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-indigo-600 sm:opacity-0 group-hover/title:opacity-100 transition-opacity"
                                                        onClick={() => {
                                                            setEditingMediaId(m.id);
                                                            setEditingName(m.name || "");
                                                        }}
                                                    >
                                                        <Pencil className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 border-t sm:border-0 pt-2 sm:pt-0">
                                        <div className="flex items-center gap-3">
                                            <div className="relative group/frame">
                                                {m.frame_url ? (
                                                    <div className="relative h-8 w-8 rounded-lg border border-slate-200 overflow-hidden bg-white">
                                                        <img src={m.frame_url} className="h-full w-full object-cover" alt="Moldura" />
                                                        <button 
                                                            className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity" 
                                                            onClick={() => handleRemoveFrame(m.id)}
                                                        >
                                                            <Trash2 className="h-3 w-3 text-white" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="relative">
                                                        <Input
                                                            type="file"
                                                            accept="image/png"
                                                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                                            onChange={(e) => e.target.files?.[0] && handleUploadFrame(e.target.files[0], m.id)}
                                                            disabled={uploadingFrameId === m.id}
                                                        />
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50">
                                                            {uploadingFrameId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                            <Switch
                                                className="scale-75 origin-right"
                                                checked={m.status === "active"}
                                                onCheckedChange={() => handleToggleMediaStatus(m.id, m.status)}
                                            />
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteMedia(m.id)} className="h-8 w-8 text-slate-300 hover:text-rose-600 hover:bg-rose-50">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Card>

            <Card className="rounded-2xl border-slate-200 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 leading-tight">Planos Ativos</h3>
                        <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                            Assinaturas de exibição na TV.
                        </p>
                    </div>
                    {(() => {
                        const hasActive = entityPlansQ.data?.some(ep => ep.is_active && !ep.deleted_at);
                        return (
                            <div className={cn(
                                "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border self-start sm:self-auto",
                                hasActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200"
                            )}>
                                <span className={cn("h-1.5 w-1.5 rounded-full mr-1.5", hasActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400")} />
                                {hasActive ? "VISÍVEL" : "OCULTO"}
                            </div>
                        );
                    })()}
                </div>

                {plansQ.isLoading || entityPlansQ.isLoading ? (
                    <div className="text-xs text-slate-500 py-4 text-center italic">Carregando planos...</div>
                ) : plansQ.data?.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center">
                        <p className="text-xs text-slate-400">Nenhum plano disponível.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {plansQ.data?.map(plan => {
                            const entityPlan = entityPlansQ.data?.find(ep => ep.plan_id === plan.id);
                            const isActive = entityPlan ? (entityPlan.is_active && !entityPlan.deleted_at) : false;

                            return (
                                <div key={plan.id} className={`flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border p-3.5 gap-3.5 transition ${isActive ? 'border-primary/40 bg-primary/5 shadow-sm shadow-primary/5' : 'border-slate-200'}`}>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-900">{plan.name}</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">{plan.video_duration_seconds}s • {plan.has_contact_break ? 'Com' : 'Sem'} tela de contato</p>
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-0 pt-3 sm:pt-0">
                                        {isActive && (
                                            <div className="flex items-center gap-3">
                                                {entityPlan.default_frame_url ? (
                                                    <div className="relative h-9 w-9 rounded-lg border border-slate-200 overflow-hidden bg-white group/frame">
                                                        <img src={entityPlan.default_frame_url} className="h-full w-full object-cover" alt="Moldura Padrão" />
                                                        <button 
                                                            className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/frame:opacity-100 transition-opacity" 
                                                            onClick={() => handleRemoveFrame(entityPlan.id, true)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5 text-white" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="relative group/upload">
                                                        <Input
                                                            type="file"
                                                            accept="image/png"
                                                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                                            onChange={(e) => e.target.files?.[0] && handleUploadFrame(e.target.files[0], entityPlan.id, true)}
                                                            disabled={uploadingFrameId === entityPlan.id}
                                                        />
                                                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:text-primary hover:border-primary transition cursor-pointer bg-white">
                                                            {uploadingFrameId === entityPlan.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                                                            <span className="text-[9px] font-bold uppercase">Moldura</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <Switch
                                            checked={isActive}
                                            onCheckedChange={(c) => handleTogglePlan(plan.id, c, entityPlan?.id)}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
}

function cn(...inputs: any[]) {
    return inputs.filter(Boolean).join(" ");
}
