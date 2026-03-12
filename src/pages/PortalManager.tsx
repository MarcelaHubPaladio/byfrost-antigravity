import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Globe, Settings, Trash2, Edit3, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageUpload } from "@/components/portal/ImageUpload";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PortalManager() {
    const { activeTenantId, activeTenant } = useTenant();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newPageTitle, setNewPageTitle] = useState("");
    const [newPageSlug, setNewPageSlug] = useState("");
    const [editPage, setEditPage] = useState<any>(null);

    const { data: pages, isLoading } = useQuery({
        queryKey: ["portal_pages", activeTenantId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("portal_pages")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        },
        enabled: !!activeTenantId,
    });
    const createPageM = useMutation({
        mutationFn: async (payload: { title: string; slug: string; tenant_id: string }) => {
            const { data, error } = await supabase
                .from("portal_pages")
                .insert([payload])
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["portal_pages", activeTenantId] });
            toast.success("Página criada com sucesso!");
            setIsCreateOpen(false);
            navigate(`/app/portal/edit/${data.id}`);
        },
        onError: (err: any) => {
            toast.error(err.message || "Erro ao criar página");
        }
    });

    const updatePageM = useMutation({
        mutationFn: async ({ id, ...payload }: any) => {
            const { error } = await supabase
                .from("portal_pages")
                .update(payload)
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["portal_pages", activeTenantId] });
            toast.success("Configurações salvas!");
            setEditPage(null);
        },
        onError: (err: any) => {
            toast.error(err.message || "Erro ao salvar");
        }
    });

    const deletePageM = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("portal_pages")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["portal_pages", activeTenantId] });
            toast.success("Página removida");
        }
    });

    const handleCreate = () => {
        if (!newPageTitle || !newPageSlug) {
            toast.error("Preencha título e slug");
            return;
        }
        createPageM.mutate({
            title: newPageTitle,
            slug: newPageSlug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
            tenant_id: activeTenantId!,
        });
    };

    if (isLoading) {
        return (
            <div className="p-8 space-y-4">
                <Skeleton className="h-10 w-48" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-3xl" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Portal & Sites</h1>
                    <p className="text-slate-500 dark:text-slate-400">Gerencie suas páginas públicas e domínios.</p>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button className="rounded-2xl gap-2 shadow-lg hover:shadow-xl transition-all h-12 px-6">
                            <Plus className="h-5 w-5" />
                            Nova Página
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="rounded-3xl border-none shadow-2xl">
                        <DialogHeader>
                            <DialogTitle>Criar Nova Página</DialogTitle>
                            <DialogDescription>
                                Defina o título e o endereço (URL) da sua página.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="title">Título da Página</Label>
                                <Input 
                                    id="title" 
                                    placeholder="Ex: Minha Landing Page" 
                                    className="rounded-xl border-slate-200"
                                    value={newPageTitle}
                                    onChange={(e) => setNewPageTitle(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="slug">Caminho (slug)</Label>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-slate-400">/l/tenant/</span>
                                    <Input 
                                        id="slug" 
                                        placeholder="url-da-pagina" 
                                        className="rounded-xl border-slate-200"
                                        value={newPageSlug}
                                        onChange={(e) => setNewPageSlug(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCreateOpen(false)} className="rounded-xl">Cancelar</Button>
                            <Button onClick={handleCreate} disabled={createPageM.isPending} className="rounded-xl">
                                {createPageM.isPending ? "Criando..." : "Criar e Editar"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pages?.map((page) => (
                    <Card key={page.id} className="group overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm transition-all hover:shadow-xl dark:border-slate-800 dark:bg-slate-950">
                        <div className="p-6">
                            <div className="flex items-start justify-between mb-4">
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl text-blue-600 dark:text-blue-400">
                                    <Globe className="h-6 w-6" />
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => setEditPage(page)}>
                                        <Settings className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => navigate(`/app/portal/edit/${page.id}`)}>
                                        <Edit3 className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="ghost" size="icon" className="h-9 w-9 rounded-full text-red-500 hover:text-red-600 hover:bg-red-50"
                                        onClick={() => {
                                            if (confirm("Deseja realmente excluir esta página?")) {
                                                deletePageM.mutate(page.id);
                                            }
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <h3 className="text-xl font-semibold mb-2 text-slate-900 dark:text-white line-clamp-1">{page.title}</h3>
                            <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
                                <span className={`h-2 w-2 rounded-full ${page.is_published ? 'bg-green-500' : 'bg-slate-300'}`} />
                                {page.is_published ? "Publicado" : "Rascunho"}
                                <span className="mx-1">•</span>
                                /l/{activeTenant?.slug}/p/{page.slug}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Button variant="secondary" className="rounded-xl w-full gap-2 h-10 text-sm" onClick={() => navigate(`/app/portal/edit/${page.id}`)}>
                                    Editar
                                </Button>
                                <Button variant="outline" className="rounded-xl w-full gap-2 h-10 text-sm" onClick={() => window.open(`/l/${page.slug}`, '_blank')}>
                                    <ExternalLink className="h-3 w-3" />
                                    Ver site
                                </Button>
                            </div>
                        </div>
                    </Card>
                ))}

                {pages?.length === 0 && (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[40px]">
                        <Globe className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white">Nenhuma página criada</h3>
                        <p className="text-slate-500">Comece criando sua primeira página para o portal.</p>
                        <Button variant="link" onClick={() => setIsCreateOpen(true)} className="mt-2 text-blue-600">
                            Criar minha primeira página
                        </Button>
                    </div>
                )}
            </div>

            <PageSettingsDialog 
                page={editPage} 
                open={!!editPage} 
                onOpenChange={(open) => !open && setEditPage(null)}
                onSave={(updates) => updatePageM.mutate({ id: editPage.id, ...updates })}
                isPending={updatePageM.isPending}
            />
        </div>
    );
}

function PageSettingsDialog({ page, open, onOpenChange, onSave, isPending }: any) {
    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [settings, setSettings] = useState<any>({});

    useEffect(() => {
        if (page) {
            setTitle(page.title || "");
            setSlug(page.slug || "");
            setSettings(page.page_settings || {});
        }
    }, [page]);

    const handleSave = () => {
        onSave({
            title,
            slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
            page_settings: settings
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-[32px] border-none shadow-2xl">
                <DialogHeader>
                    <DialogTitle>Configurações da Página</DialogTitle>
                    <DialogDescription>
                        Ajuste as configurações gerais, SEO e domínio da sua página.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-400">Geral</Label>
                            <div className="space-y-4">
                                <div>
                                    <Label htmlFor="edit-title">Título da Página</Label>
                                    <Input 
                                        id="edit-title" 
                                        className="rounded-xl mt-1" 
                                        value={title} 
                                        onChange={(e) => setTitle(e.target.value)} 
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="edit-slug">Caminho (slug)</Label>
                                    <Input 
                                        id="edit-slug" 
                                        className="rounded-xl mt-1" 
                                        value={slug} 
                                        onChange={(e) => setSlug(e.target.value)} 
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="custom-domain">Domínio Personalizado</Label>
                                    <Input 
                                        id="custom-domain" 
                                        placeholder="ex: site.empresa.com" 
                                        className="rounded-xl mt-1" 
                                        value={settings.custom_domain || ""} 
                                        onChange={(e) => setSettings({ ...settings, custom_domain: e.target.value })} 
                                    />
                                    <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 dark:bg-slate-900 dark:border-slate-800">
                                        <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Instruções de Apontamento</p>
                                        <div className="space-y-2 text-[11px]">
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">Tipo A (@):</span>
                                                <code className="text-blue-600 font-mono">76.76.21.21</code>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-500">CNAME:</span>
                                                <code className="text-blue-600 font-mono">cname.vercel-dns.com</code>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-400">Imagens</Label>
                            <div className="grid grid-cols-1 gap-4">
                                <ImageUpload 
                                    label="Favicon"
                                    value={settings.favicon_url}
                                    onChange={(url) => setSettings({ ...settings, favicon_url: url })}
                                />
                                <ImageUpload 
                                    label="Imagem OG (Social)"
                                    value={settings.og_image_url}
                                    onChange={(url) => setSettings({ ...settings, og_image_url: url })}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-400">SEO</Label>
                            <div className="space-y-4">
                                <div>
                                    <Label htmlFor="seo-title">Título SEO</Label>
                                    <Input 
                                        id="seo-title" 
                                        placeholder="Título da aba" 
                                        className="rounded-xl mt-1" 
                                        value={settings.seo_title || ""} 
                                        onChange={(e) => setSettings({ ...settings, seo_title: e.target.value })} 
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="seo-desc">Descrição SEO</Label>
                                    <textarea 
                                        id="seo-desc" 
                                        className="w-full text-sm p-3 rounded-xl border border-slate-200 mt-1 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                        placeholder="Descrição para Google e Redes Sociais"
                                        value={settings.seo_description || ""} 
                                        onChange={(e) => setSettings({ ...settings, seo_description: e.target.value })} 
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">Cancelar</Button>
                    <Button onClick={handleSave} disabled={isPending} className="rounded-xl px-8">
                        {isPending ? "Salvando..." : "Salvar Configurações"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
