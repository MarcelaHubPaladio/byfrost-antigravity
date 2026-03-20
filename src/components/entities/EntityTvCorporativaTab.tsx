import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Loader2, UploadCloud, Link as LinkIcon, Youtube, Pencil, Check, X, Image as ImageIcon, Share2, RefreshCw, Copy } from "lucide-react";
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
                // Before activating this one, if isActive is true, let's deactivate ANY OTHER active plan
                if (isActive) {
                    await supabase
                        .from("tv_entity_plans")
                        .update({ is_active: false, deleted_at: new Date().toISOString() })
                        .eq("entity_id", entityId)
                        .is("deleted_at", null)
                        .neq("id", existingRecordId);
                }

                // Toggle existing (could be activating a previously disabled or soft-deleted one)
                const { error } = await supabase
                    .from("tv_entity_plans")
                    .update({ is_active: isActive, deleted_at: isActive ? null : new Date().toISOString() })
                    .eq("id", existingRecordId);
                if (error) throw error;
            } else {
                // Before activating a new one, deactivate ANY OTHER active plan
                if (isActive) {
                    await supabase
                        .from("tv_entity_plans")
                        .update({ is_active: false, deleted_at: new Date().toISOString() })
                        .eq("entity_id", entityId)
                        .is("deleted_at", null);
                }

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
            <Card className="rounded-2xl border-slate-200 p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Mídias do Cliente</h3>
                            <p className="mt-1 text-sm text-slate-600">
                                Adicione vídeos ou links para exibição.
                            </p>
                        </div>
                        <div className="w-full sm:w-auto">
                            {entityQ.data?.magic_token ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full sm:w-auto rounded-xl border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                                    onClick={copyMagicLink}
                                >
                                    <Copy className="mr-2 h-4 w-4" /> Copiar Link de Upload
                                </Button>
                            ) : (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full sm:w-auto rounded-xl"
                                    onClick={handleGenerateMagicToken}
                                >
                                    <Share2 className="mr-2 h-4 w-4" /> Ativar Link de Upload
                                </Button>
                            )}
                        </div>
                    </div>

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
                        <Label className="text-xs text-slate-500 mb-2 block">Nome da Mídia (Opcional)</Label>
                        <Input
                            placeholder="Ex: Campanha de Verão..."
                            className="rounded-xl bg-white"
                            value={mediaName}
                            onChange={e => setMediaName(e.target.value)}
                        />
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
                                <div key={m.id} className={`flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border p-3 gap-3 transition ${m.status === 'inactive' ? 'opacity-50 grayscale bg-slate-50 border-slate-200' : 'border-slate-200 bg-white shadow-sm'}`}>
                                    <div className="flex items-center gap-3 overflow-hidden flex-1">
                                        {m.media_type === 'youtube_link' ? <Youtube className="h-5 w-5 text-rose-500 shrink-0" /> : <LinkIcon className="h-5 w-5 text-indigo-500 shrink-0" />}
                                        <div className="truncate flex-1">
                                            {editingMediaId === m.id ? (
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        size={1}
                                                        className="h-8 rounded-lg text-sm"
                                                        value={editingName}
                                                        onChange={e => setEditingName(e.target.value)}
                                                        onKeyDown={e => e.key === "Enter" && handleUpdateMediaName(m.id)}
                                                        autoFocus
                                                    />
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={() => handleUpdateMediaName(m.id)}>
                                                        <Check className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:bg-slate-100" onClick={() => setEditingMediaId(null)}>
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-2 group/title">
                                                        <p className="text-sm font-medium text-slate-900 truncate">{m.name || "Sem nome"}</p>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 sm:opacity-0 group-hover/title:opacity-100 transition-opacity"
                                                            onClick={() => {
                                                                setEditingMediaId(m.id);
                                                                setEditingName(m.name || "");
                                                            }}
                                                        >
                                                            <Pencil className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                    <a href={m.url} target="_blank" rel="noreferrer" className="text-[10px] text-slate-400 hover:text-blue-600 hover:underline truncate block">
                                                        {m.url}
                                                    </a>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 border-t sm:border-0 pt-2 sm:pt-0">
                                        <div className="flex items-center gap-4">
                                            <div className="relative group/frame">
                                                {m.frame_url ? (
                                                    <div className="flex items-center gap-1">
                                                        <div className="h-8 w-8 rounded-lg border border-slate-200 overflow-hidden bg-white cursor-pointer hover:bg-slate-50 relative group/frameimg">
                                                            <img src={m.frame_url} className="h-full w-full object-contain" alt="Moldura" />
                                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/frameimg:opacity-100 transition-opacity" onClick={() => handleRemoveFrame(m.id)}>
                                                                <Trash2 className="h-3 w-3 text-white" />
                                                            </div>
                                                        </div>
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
                                                            {uploadingFrameId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={m.status === "active"}
                                                    onCheckedChange={() => handleToggleMediaStatus(m.id, m.status)}
                                                    title={m.status === "active" ? "Desativar mídia" : "Ativar mídia"}
                                                />
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteMedia(m.id)} className="text-slate-400 hover:text-rose-600">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Card>

            <Card className="rounded-2xl border-slate-200 p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900">Planos TV Corporativa</h3>
                        <p className="mt-1 text-sm text-slate-600">
                            Selecione quais os planos de TV corporativa que estão ativos para este cliente.
                        </p>
                    </div>
                    {(() => {
                        const hasActive = entityPlansQ.data?.some(ep => ep.is_active && !ep.deleted_at);
                        return hasActive ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm border border-emerald-200 animate-pulse">
                                ● VISÍVEL NA TV
                            </span>
                        ) : (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 border border-slate-200">
                                ○ OCULTO (SEM PLANO ATIVO)
                            </span>
                        );
                    })()}
                </div>

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
                                <div key={plan.id} className={`flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border p-4 gap-4 transition ${isActive ? 'border-primary/50 bg-primary/5' : 'border-slate-200'}`}>
                                    <div>
                                        <p className="font-semibold text-slate-900">{plan.name}</p>
                                        <p className="text-xs text-slate-500">{plan.video_duration_seconds}s de duração • {plan.has_contact_break ? 'Com' : 'Sem'} tela de contato</p>
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-0 pt-3 sm:pt-0">
                                        {isActive && (
                                            <div className="flex items-center gap-2">
                                                {entityPlan.default_frame_url ? (
                                                    <div className="flex items-center gap-2 group/defaultframe">
                                                        <div className="h-10 w-10 rounded-lg border border-slate-200 overflow-hidden bg-white relative group/frameimg">
                                                            <img src={entityPlan.default_frame_url} className="h-full w-full object-contain" alt="Moldura Padrão" />
                                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/frameimg:opacity-100 transition-opacity cursor-pointer" onClick={() => handleRemoveFrame(entityPlan.id, true)}>
                                                                <Trash2 className="h-4 w-4 text-white" />
                                                            </div>
                                                        </div>
                                                        <p className="text-[10px] font-bold text-slate-400 hidden sm:block">Moldura Padrão</p>
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
                                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:text-primary hover:border-primary transition cursor-pointer">
                                                            {uploadingFrameId === entityPlan.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
                                                            <span className="text-[10px] font-bold">MOLDURA PADRÃO</span>
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

function PlusIcon({ className }: { className?: string }) {
    return (
        <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
        </svg>
    );
}
