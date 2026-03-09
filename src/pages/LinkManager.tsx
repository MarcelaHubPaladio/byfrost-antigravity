import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Plus, Link2, ExternalLink, Star, Trash2, Edit2, GripVertical, Settings2, Share2, Copy, Check } from "lucide-react";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";

type LinkGroup = {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    is_active: boolean;
    theme_config: any;
};

type LinkItem = {
    id: string;
    group_id: string;
    label: string;
    url: string | null;
    link_type: 'standard' | 'assessment';
    icon: string | null;
    sort_order: number;
    is_active: boolean;
};

type ItemRedirect = {
    id: string;
    item_id: string;
    store_name: string;
    redirect_url: string;
};

export default function LinkManager() {
    const { activeTenantId, activeTenant } = useTenant();
    const qc = useQueryClient();
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
    const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
    const [isRedirectDialogOpen, setIsRedirectDialogOpen] = useState(false);

    const [editingGroup, setEditingGroup] = useState<Partial<LinkGroup> | null>(null);
    const [editingItem, setEditingItem] = useState<Partial<LinkItem> | null>(null);
    const [editingRedirect, setEditingRedirect] = useState<Partial<ItemRedirect> | null>(null);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

    // Queries
    const groupsQ = useQuery({
        queryKey: ["link_manager_groups", activeTenantId],
        enabled: !!activeTenantId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("link_manager_groups")
                .select("*")
                .is("deleted_at", null)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data as LinkGroup[];
        }
    });

    const selectedGroup = groupsQ.data?.find(g => g.id === selectedGroupId) || groupsQ.data?.[0];

    const itemsQ = useQuery({
        queryKey: ["link_manager_items", selectedGroup?.id],
        enabled: !!selectedGroup?.id,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("link_manager_items")
                .select("*")
                .eq("group_id", selectedGroup!.id)
                .is("deleted_at", null)
                .order("sort_order", { ascending: true });
            if (error) throw error;
            return data as LinkItem[];
        }
    });

    const redirectsQ = useQuery({
        queryKey: ["link_manager_redirects", selectedItemId],
        enabled: !!selectedItemId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("link_manager_item_redirects")
                .select("*")
                .eq("item_id", selectedItemId!)
                .is("deleted_at", null);
            if (error) throw error;
            return data as ItemRedirect[];
        }
    });

    // Actions
    const saveGroup = async () => {
        if (!activeTenantId || !editingGroup?.name || !editingGroup?.slug) return;
        try {
            const payload = {
                ...editingGroup,
                tenant_id: activeTenantId,
            };
            const { data, error } = await supabase.from("link_manager_groups").upsert(payload as any).select().single();
            if (error) throw error;
            showSuccess("Grupo salvo com sucesso!");
            setIsGroupDialogOpen(false);
            qc.invalidateQueries({ queryKey: ["link_manager_groups"] });
            setSelectedGroupId(data.id);
        } catch (e: any) {
            showError(`Erro ao salvar grupo: ${e.message}`);
        }
    };

    const deleteGroup = async (id: string) => {
        if (!confirm("Tem certeza que deseja excluir este grupo?")) return;
        try {
            const { error } = await supabase.from("link_manager_groups").update({ deleted_at: new Date().toISOString() }).eq("id", id);
            if (error) throw error;
            showSuccess("Grupo excluído.");
            qc.invalidateQueries({ queryKey: ["link_manager_groups"] });
        } catch (e: any) {
            showError(`Erro ao excluir: ${e.message}`);
        }
    };

    const saveItem = async () => {
        if (!selectedGroup || !editingItem?.label) return;
        try {
            const payload = {
                ...editingItem,
                group_id: selectedGroup.id,
                tenant_id: activeTenantId,
                sort_order: editingItem.sort_order ?? (itemsQ.data?.length ?? 0) * 10,
            };
            const { error } = await supabase.from("link_manager_items").upsert(payload as any);
            if (error) throw error;
            showSuccess("Link salvo!");
            setIsItemDialogOpen(false);
            qc.invalidateQueries({ queryKey: ["link_manager_items", selectedGroup.id] });
        } catch (e: any) {
            showError(`Erro ao salvar link: ${e.message}`);
        }
    };

    const deleteItem = async (id: string) => {
        if (!confirm("Excluir este link?")) return;
        try {
            const { error } = await supabase.from("link_manager_items").update({ deleted_at: new Date().toISOString() }).eq("id", id);
            if (error) throw error;
            showSuccess("Link removido.");
            qc.invalidateQueries({ queryKey: ["link_manager_items", selectedGroup?.id] });
        } catch (e: any) {
            showError(`Erro: ${e.message}`);
        }
    };

    const saveRedirect = async () => {
        if (!selectedItemId || !editingRedirect?.store_name || !editingRedirect?.redirect_url) return;
        try {
            const payload = {
                ...editingRedirect,
                item_id: selectedItemId,
                tenant_id: activeTenantId,
            };
            const { error } = await supabase.from("link_manager_item_redirects").upsert(payload as any);
            if (error) throw error;
            showSuccess("Redirecionamento salvo!");
            setIsRedirectDialogOpen(false);
            qc.invalidateQueries({ queryKey: ["link_manager_redirects", selectedItemId] });
        } catch (e: any) {
            showError(`Erro: ${e.message}`);
        }
    };

    const deleteRedirect = async (id: string) => {
        if (!confirm("Remover este redirecionamento?")) return;
        try {
            const { error } = await supabase.from("link_manager_item_redirects").update({ deleted_at: new Date().toISOString() }).eq("id", id);
            if (error) throw error;
            showSuccess("Removido.");
            qc.invalidateQueries({ queryKey: ["link_manager_redirects", selectedItemId] });
        } catch (e: any) {
            showError(`Erro: ${e.message}`);
        }
    };

    const copyUrl = (slug: string) => {
        const url = `${window.location.origin}/l/${activeTenant?.slug}/${slug}`;
        navigator.clipboard.writeText(url);
        showSuccess("URL copiada!");
    };

    return (
        <RequireAuth>
            <RequireRouteAccess routeKey="app.link_manager">
                <AppShell>
                    <div className="space-y-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900">Gerenciador de Links</h1>
                                <p className="text-sm text-slate-500">Crie perfis de links estilo LinkTree com redirecionamentos inteligentes.</p>
                            </div>
                            <Button className="rounded-2xl" onClick={() => { setEditingGroup({ is_active: true, theme_config: {} }); setIsGroupDialogOpen(true); }}>
                                <Plus className="mr-2 h-4 w-4" /> Novo Perfil
                            </Button>
                        </div>

                        <div className="grid gap-6 md:grid-cols-[300px_1fr]">
                            {/* Sidebar: Groups */}
                            <div className="space-y-3">
                                <Label className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Meus Perfis</Label>
                                <div className="space-y-1">
                                    {groupsQ.data?.map(g => (
                                        <button
                                            key={g.id}
                                            onClick={() => setSelectedGroupId(g.id)}
                                            className={cn(
                                                "flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition",
                                                selectedGroup?.id === g.id
                                                    ? "bg-[hsl(var(--byfrost-accent)/0.1)] text-[hsl(var(--byfrost-accent))] ring-1 ring-[hsl(var(--byfrost-accent)/0.2)]"
                                                    : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-100 shadow-sm"
                                            )}
                                        >
                                            <div className="min-w-0">
                                                <div className="truncate font-semibold text-sm">{g.name}</div>
                                                <div className="truncate text-[10px] opacity-70">/{g.slug}</div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={(e) => { e.stopPropagation(); setEditingGroup(g); setIsGroupDialogOpen(true); }}>
                                                    <Edit2 className="h-3 w-3" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-red-500 hover:text-red-600 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }}>
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </button>
                                    ))}
                                    {groupsQ.data?.length === 0 && (
                                        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                                            Nenhum perfil criado.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Main: Items */}
                            {selectedGroup ? (
                                <div className="space-y-4">
                                    <Card className="overflow-hidden rounded-[28px] border-slate-200 shadow-sm">
                                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                                                    <Settings2 className="h-5 w-5 text-slate-400" />
                                                </div>
                                                <div>
                                                    <h2 className="font-bold text-slate-900">{selectedGroup.name}</h2>
                                                    <p className="text-xs text-slate-500">Configure os links e redirecionamentos deste perfil.</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button variant="outline" className="rounded-xl h-9 text-xs" onClick={() => copyUrl(selectedGroup.slug)}>
                                                    <Copy className="mr-2 h-3 w-3" /> Copiar Link Público
                                                </Button>
                                                <Button variant="outline" className="rounded-xl h-9 text-xs" asChild>
                                                    <a href={`/l/${activeTenant?.slug}/${selectedGroup.slug}`} target="_blank" rel="noreferrer">
                                                        <ExternalLink className="mr-2 h-3 w-3" /> Ver Público
                                                    </a>
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="p-6">
                                            <div className="mb-4 flex items-center justify-between">
                                                <h3 className="text-sm font-semibold text-slate-900">Links ({itemsQ.data?.length ?? 0})</h3>
                                                <Button size="sm" className="rounded-xl" onClick={() => { setEditingItem({ link_type: 'standard', is_active: true }); setIsItemDialogOpen(true); }}>
                                                    <Plus className="mr-2 h-3 w-3" /> Adicionar Link
                                                </Button>
                                            </div>

                                            <div className="space-y-2">
                                                {itemsQ.data?.map(item => (
                                                    <div key={item.id} className="group relative flex flex-col space-y-3 rounded-2xl border border-slate-100 bg-white p-4 transition hover:border-slate-200 hover:shadow-md">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <div className="cursor-grab text-slate-300 hover:text-slate-400">
                                                                    <GripVertical className="h-5 w-5" />
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-bold text-slate-900">{item.label}</span>
                                                                        {item.link_type === 'assessment' && (
                                                                            <Badge variant="secondary" className="bg-blue-50 text-blue-600 border-blue-100">Avaliação</Badge>
                                                                        )}
                                                                        {!item.is_active && (
                                                                            <Badge variant="outline" className="text-slate-400">Inativo</Badge>
                                                                        )}
                                                                    </div>
                                                                    <div className="mt-0.5 max-w-md truncate text-xs text-slate-500">
                                                                        {item.link_type === 'standard' ? item.url : 'Redirecionamento dinâmico por loja'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingItem(item); setIsItemDialogOpen(true); }}>
                                                                    <Edit2 className="h-4 w-4" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => deleteItem(item.id)}>
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        {item.link_type === 'assessment' && (
                                                            <div className="ml-8 mt-2 space-y-2 rounded-xl border border-slate-50 bg-slate-50/50 p-3">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Redirecionamentos por Loja</span>
                                                                    <Button size="sm" variant="ghost" className="h-6 gap-1.5 rounded-lg border border-slate-200 bg-white text-[10px]" onClick={() => { setSelectedItemId(item.id); setEditingRedirect({}); setIsRedirectDialogOpen(true); }}>
                                                                        <Plus className="h-3 w-3" /> Adicionar Loja
                                                                    </Button>
                                                                </div>

                                                                {selectedItemId === item.id && redirectsQ.data ? (
                                                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                                        {redirectsQ.data.map(r => (
                                                                            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 shadow-sm">
                                                                                <div className="min-w-0">
                                                                                    <div className="truncate text-[11px] font-bold text-slate-700">{r.store_name}</div>
                                                                                    <div className="truncate text-[9px] text-slate-400">{r.redirect_url}</div>
                                                                                </div>
                                                                                <div className="flex items-center">
                                                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingRedirect(r); setSelectedItemId(item.id); setIsRedirectDialogOpen(true); }}>
                                                                                        <Edit2 className="h-3 w-3" />
                                                                                    </Button>
                                                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => { setSelectedItemId(item.id); deleteRedirect(r.id); }}>
                                                                                        <Trash2 className="h-3 w-3" />
                                                                                    </Button>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                        {redirectsQ.data.length === 0 && (
                                                                            <div className="col-span-full py-2 text-center text-[10px] text-slate-400 italic">
                                                                                Nenhuma loja configurada. No link público, o usuário verá um erro ao selecionar.
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <Button variant="ghost" className="h-7 w-full border border-slate-100 bg-white px-3 text-[10px] text-slate-500" onClick={() => setSelectedItemId(item.id)}>
                                                                        Carregar lojas associadas
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                                {itemsQ.data?.length === 0 && (
                                                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-12 text-center">
                                                        <div className="mb-2 rounded-full bg-slate-50 p-3">
                                                            <Link2 className="h-6 w-6 text-slate-300" />
                                                        </div>
                                                        <p className="text-sm text-slate-500">Nenhum link adicionado ainda.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                </div>
                            ) : (
                                <div className="flex h-[400px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white/50 text-center">
                                    <Share2 className="mb-4 h-12 w-12 text-slate-200" />
                                    <h3 className="text-lg font-semibold text-slate-900">Selecione um perfil</h3>
                                    <p className="max-w-xs text-sm text-slate-500">Escolha um perfil de links na barra lateral ou crie um novo para começar.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Group Dialog */}
                    <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
                        <DialogContent className="rounded-3xl">
                            <DialogHeader>
                                <DialogTitle>{editingGroup?.id ? 'Editar Perfil' : 'Novo Perfil'}</DialogTitle>
                                <DialogDescription>Defina o nome e a URL amigável do seu LinkTree.</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="name">Nome do Perfil</Label>
                                    <Input
                                        id="name"
                                        value={editingGroup?.name || ""}
                                        onChange={e => setEditingGroup(p => ({ ...p, name: e.target.value, slug: p?.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-') }))}
                                        placeholder="Ex: Bio Instagram"
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="slug">Slug (URL)</Label>
                                    <div className="flex items-center rounded-xl border px-3 focus-within:ring-2 focus-within:ring-blue-100">
                                        <span className="text-sm text-slate-400 select-none">byfrost.io/l/{activeTenant?.slug}/</span>
                                        <input
                                            id="slug"
                                            value={editingGroup?.slug || ""}
                                            onChange={e => setEditingGroup(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-') }))}
                                            className="ml-0.5 flex-1 bg-transparent py-2 text-sm outline-none"
                                            placeholder="meu-link"
                                        />
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="desc">Descrição (opcional)</Label>
                                    <Input
                                        id="desc"
                                        value={editingGroup?.description || ""}
                                        onChange={e => setEditingGroup(p => ({ ...p, description: e.target.value }))}
                                        className="rounded-xl"
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" className="rounded-xl" onClick={() => setIsGroupDialogOpen(false)}>Cancelar</Button>
                                <Button className="rounded-xl" onClick={saveGroup}>Salvar</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {/* Item Dialog */}
                    <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
                        <DialogContent className="rounded-3xl">
                            <DialogHeader>
                                <DialogTitle>{editingItem?.id ? 'Editar Link' : 'Novo Link'}</DialogTitle>
                                <DialogDescription>Configure os detalhes do seu link.</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="label">Título do Link</Label>
                                    <Input
                                        id="label"
                                        value={editingItem?.label || ""}
                                        onChange={e => setEditingItem(p => ({ ...p, label: e.target.value }))}
                                        placeholder="Ex: Nosso Site Oficial"
                                        className="rounded-xl"
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label>Tipo de Link</Label>
                                    <Select
                                        value={editingItem?.link_type}
                                        onValueChange={v => setEditingItem(p => ({ ...p, link_type: v as any }))}
                                    >
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue placeholder="Selecione o tipo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="standard">Padrão (URL Direta)</SelectItem>
                                            <SelectItem value="assessment">Avaliação (Seletor de Loja)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {editingItem?.link_type === 'standard' && (
                                    <div className="grid gap-2">
                                        <Label htmlFor="url">URL de Destino</Label>
                                        <Input
                                            id="url"
                                            value={editingItem?.url || ""}
                                            onChange={e => setEditingItem(p => ({ ...p, url: e.target.value }))}
                                            placeholder="https://..."
                                            className="rounded-xl"
                                        />
                                    </div>
                                )}

                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="active"
                                        checked={editingItem?.is_active}
                                        onChange={e => setEditingItem(p => ({ ...p, is_active: e.target.checked }))}
                                        className="h-4 w-4 rounded"
                                    />
                                    <Label htmlFor="active" className="text-sm font-normal">Link Ativo</Label>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" className="rounded-xl" onClick={() => setIsItemDialogOpen(false)}>Cancelar</Button>
                                <Button className="rounded-xl" onClick={saveItem}>Salvar Link</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {/* Redirect Dialog */}
                    <Dialog open={isRedirectDialogOpen} onOpenChange={setIsRedirectDialogOpen}>
                        <DialogContent className="rounded-3xl sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>{editingRedirect?.id ? 'Editar Loja' : 'Adicionar Loja'}</DialogTitle>
                                <DialogDescription>Configure para onde o usuário será enviado ao selecionar esta loja.</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="store">Nome da Loja</Label>
                                    <Input
                                        id="store"
                                        value={editingRedirect?.store_name || ""}
                                        onChange={e => setEditingRedirect(p => ({ ...p, store_name: e.target.value }))}
                                        placeholder="Ex: Matriz / Curitiba Shopping"
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="rurl">URL de Avaliação/Venda</Label>
                                    <Input
                                        id="rurl"
                                        value={editingRedirect?.redirect_url || ""}
                                        onChange={e => setEditingRedirect(p => ({ ...p, redirect_url: e.target.value }))}
                                        placeholder="https://google.com/maps/..."
                                        className="rounded-xl"
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" className="rounded-xl" onClick={() => setIsRedirectDialogOpen(false)}>Cancelar</Button>
                                <Button className="rounded-xl" onClick={saveRedirect}>Salvar Redirecionamento</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                </AppShell>
            </RequireRouteAccess>
        </RequireAuth>
    );
}
