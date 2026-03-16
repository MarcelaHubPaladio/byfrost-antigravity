import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { supabase, SUPABASE_URL_IN_USE } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Link2, ExternalLink, Star, Trash2, Edit2, GripVertical, Settings2, Share2, Copy, Check, Store, Palette, Image as ImageIcon } from "lucide-react";
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
    image_url: string | null;
    address: string | null;
};

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
        };
        reader.onerror = (error) => reject(error);
    });
}

const PALETTE_EXTRACT_URL = `${SUPABASE_URL_IN_USE}/functions/v1/palette-extract`;
const UPLOAD_ASSET_URL = `${SUPABASE_URL_IN_USE}/functions/v1/upload-tenant-asset`;

function isValidHex(hex: string) {
    return /^#[0-9a-fA-F]{6}$/.test(hex);
}

function hexToRgb(hex: string) {
    if (!isValidHex(hex)) return null;
    const v = hex.replace("#", "");
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return { r, g, b };
}

function bestTextOnHex(hex: string) {
    const rgb = hexToRgb(hex);
    if (!rgb) return "#0b1220";
    const toLin = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const L = 0.2126 * toLin(rgb.r) + 0.7152 * toLin(rgb.g) + 0.0722 * toLin(rgb.b);
    return L > 0.6 ? "#0b1220" : "#fffdf5";
}

function ColorRow({
    label,
    value,
    onChange,
    disabled,
}: {
    label: string;
    value: string;
    onChange: (next: string) => void;
    disabled?: boolean;
}) {
    return (
        <div className="grid grid-cols-[1fr_100px] items-end gap-3">
            <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-slate-500">{label}</Label>
                <div className="flex items-center gap-2">
                    <input
                        type="color"
                        value={value || "#ffffff"}
                        onChange={(e) => onChange(e.target.value)}
                        disabled={disabled}
                        className="h-10 w-12 cursor-pointer rounded-xl border border-slate-200 bg-white p-1 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <Input
                        value={value}
                        onChange={(e) => {
                            const raw = e.target.value.trim();
                            if (raw === "" || raw === "#") return;
                            const next = raw.startsWith("#") ? raw : `#${raw}`;
                            if (isValidHex(next)) onChange(next);
                        }}
                        disabled={disabled}
                        className="h-10 rounded-2xl font-mono text-xs"
                        placeholder="#RRGGBB"
                    />
                </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-2">
                <div
                    className="h-8 w-full rounded-xl border border-slate-200"
                    style={{ background: value }}
                />
                <div className="mt-1 text-[9px] text-center text-slate-400">Texto: {bestTextOnHex(value)}</div>
            </div>
        </div>
    );
}

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
    const [uploading, setUploading] = useState(false);
    const [extracting, setExtracting] = useState(false);

    // Queries
    const groupsQ = useQuery({
        queryKey: ["link_manager_groups", activeTenantId],
        enabled: !!activeTenantId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("link_manager_groups")
                .select("*")
                .eq("tenant_id", activeTenantId)
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
                .eq("tenant_id", activeTenantId)
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
                .eq("tenant_id", activeTenantId)
                .eq("item_id", selectedItemId!)
                .is("deleted_at", null);
            if (error) throw error;
            return data as ItemRedirect[];
        }
    });

    // Actions
    const handleExtractPalette = async () => {
        if (!editingGroup?.theme_config?.logo) {
            showError("Faça o upload de um logo primeiro.");
            return;
        }

        setExtracting(true);
        try {
            const { data: sess } = await supabase.auth.getSession();
            const token = sess.session?.access_token;

            const res = await fetch(PALETTE_EXTRACT_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    tenantId: activeTenantId,
                    logoUrl: editingGroup.theme_config.logo, // Works with Base64 as well
                }),
            });

            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                throw new Error(json?.error || `HTTP ${res.status}`);
            }

            const extracted = json.palette;
            setEditingGroup(prev => ({
                ...prev!,
                theme_config: {
                    ...prev!.theme_config,
                    palette: {
                        primary: extracted.primary.hex,
                        secondary: extracted.secondary?.hex || extracted.primary.hex,
                        tertiary: extracted.tertiary?.hex || extracted.primary.hex,
                        quaternary: extracted.quaternary?.hex || extracted.primary.hex,
                    }
                }
            }));
            showSuccess("Paleta extraída com sucesso!");
        } catch (err: any) {
            showError(`Erro ao extrair paleta: ${err.message}`);
        } finally {
            setExtracting(false);
        }
    };

    const handleLogoUpload = async (file: File) => {
        if (!activeTenantId) return;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("tenantId", activeTenantId);
            fd.append("kind", "branding");
            fd.append("file", file);

            const { data: json, error: upError } = await supabase.functions.invoke("upload-tenant-asset", {
                body: fd,
            });

            if (upError || !json?.ok) {
                throw new Error(upError?.message || json?.error || "Erro no upload");
            }

            setEditingGroup(prev => ({
                ...prev!,
                theme_config: {
                    ...prev!.theme_config,
                    logo: json.publicUrl
                }
            }));
            showSuccess("Logo carregado para o Storage!");
        } catch (err: any) {
            showError(`Erro ao carregar logo: ${err.message}`);
        } finally {
            setUploading(false);
        }
    };

    const handleSaveGroup = async () => {
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
            const { error } = await supabase
                .from("link_manager_groups")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", id)
                .eq("tenant_id", activeTenantId);
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
            const { error } = await supabase
                .from("link_manager_items")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", id)
                .eq("tenant_id", activeTenantId);
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
            const { error } = await supabase
                .from("link_manager_item_redirects")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", id)
                .eq("tenant_id", activeTenantId);
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
                                                                {item.link_type === 'assessment' && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                                                                        title="Copiar Link Direto para Avaliação"
                                                                        onClick={() => {
                                                                            const url = `${window.location.origin}/l/${activeTenant?.slug}/${selectedGroup.slug}?item=${item.id}`;
                                                                            navigator.clipboard.writeText(url);
                                                                            showSuccess("Link direto copiado!");
                                                                        }}
                                                                    >
                                                                        <Share2 className="h-4 w-4" />
                                                                    </Button>
                                                                )}
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
                                                                        {Array.isArray(redirectsQ.data) && redirectsQ.data.map(r => (
                                                                            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 shadow-sm">
                                                                                <div className="flex items-center gap-2 min-w-0">
                                                                                    {r.image_url && (
                                                                                        <img src={r.image_url} alt={r.store_name} className="h-8 w-8 rounded-lg object-cover" />
                                                                                    )}
                                                                                    <div className="min-w-0">
                                                                                        <div className="truncate text-[11px] font-bold text-slate-700">{r.store_name}</div>
                                                                                        <div className="truncate text-[9px] text-slate-400">{r.address || r.redirect_url}</div>
                                                                                    </div>
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
                                                            <Link2 className="mb-2 h-6 w-6 text-slate-300" />
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
                            <Tabs defaultValue="general" className="w-full">
                                <TabsList className="grid w-full grid-cols-2 rounded-2xl p-1 bg-slate-100">
                                    <TabsTrigger value="general" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm">Geral</TabsTrigger>
                                    <TabsTrigger value="branding" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm">Personalização</TabsTrigger>
                                </TabsList>

                                <TabsContent value="general" className="space-y-4 pt-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="gname">Nome do Perfil</Label>
                                        <Input
                                            id="gname"
                                            value={editingGroup?.name || ""}
                                            onChange={e => setEditingGroup(p => ({ ...p!, name: e.target.value }))}
                                            placeholder="Ex: Marketing Digital"
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="gslug">URL Amigável (slug)</Label>
                                        <Input
                                            id="gslug"
                                            value={editingGroup?.slug || ""}
                                            onChange={e => setEditingGroup(p => ({ ...p!, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
                                            placeholder="ex: marketing-social"
                                            className="rounded-xl"
                                        />
                                        <p className="text-[10px] text-slate-500 italic">
                                            URL: /l/{activeTenant?.slug}/<span className="font-bold">{editingGroup?.slug || "..."}</span>
                                        </p>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="gdesc">Breve descrição (opcional)</Label>
                                        <Textarea
                                            id="gdesc"
                                            value={editingGroup?.description || ""}
                                            onChange={e => setEditingGroup(p => ({ ...p!, description: e.target.value }))}
                                            placeholder="Ex: Nossos canais oficiais de atendimento"
                                            className="rounded-xl min-h-[80px]"
                                        />
                                    </div>
                                </TabsContent>

                                <TabsContent value="branding" className="space-y-6 pt-4">
                                    <div className="space-y-3">
                                        <Label className="text-sm font-bold flex items-center gap-2">
                                            <ImageIcon className="h-4 w-4 text-slate-400" />
                                            Logo do Perfil
                                        </Label>
                                        <div className="flex items-center gap-4 p-4 rounded-2xl border bg-slate-50/50">
                                            <div className="relative group">
                                                <div className="h-20 w-20 rounded-2xl border bg-white shadow-sm flex items-center justify-center overflow-hidden">
                                                    {editingGroup?.theme_config?.logo ? (
                                                        <img src={editingGroup.theme_config.logo} alt="Logo" className="h-full w-full object-contain" />
                                                    ) : (
                                                        <ImageIcon className="h-8 w-8 text-slate-200" />
                                                    )}
                                                </div>
                                                <Input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
                                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                                    disabled={uploading}
                                                />
                                            </div>
                                            <div className="flex-1 space-y-2">
                                                <Button
                                                    variant="outline"
                                                    className="w-full rounded-xl gap-2 text-xs h-9"
                                                    disabled={uploading}
                                                    onClick={() => { }} // Handled by Input above
                                                >
                                                    {uploading ? "Aguarde..." : "Trocar Logo"}
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    className="w-full rounded-xl gap-2 text-xs h-9 bg-blue-50 text-blue-600 hover:bg-blue-100 border-none"
                                                    disabled={!editingGroup?.theme_config?.logo || extracting}
                                                    onClick={handleExtractPalette}
                                                >
                                                    {extracting ? "Extraindo..." : <><Palette className="h-3.5 w-3.5" /> Extrair Cores</>}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <Label className="text-sm font-bold flex items-center gap-2">
                                            <Palette className="h-4 w-4 text-slate-400" />
                                            Cores do Perfil
                                        </Label>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <ColorRow
                                                label="Cor Primária"
                                                value={editingGroup?.theme_config?.palette?.primary || "#3b82f6"}
                                                onChange={(v) => setEditingGroup(p => ({
                                                    ...p!,
                                                    theme_config: { ...p!.theme_config, palette: { ...p!.theme_config.palette, primary: v } }
                                                }))}
                                            />
                                            <ColorRow
                                                label="Cor Secundária"
                                                value={editingGroup?.theme_config?.palette?.secondary || "#1e293b"}
                                                onChange={(v) => setEditingGroup(p => ({
                                                    ...p!,
                                                    theme_config: { ...p!.theme_config, palette: { ...p!.theme_config.palette, secondary: v } }
                                                }))}
                                            />
                                            <ColorRow
                                                label="Cor Terciária"
                                                value={editingGroup?.theme_config?.palette?.tertiary || "#f1f5f9"}
                                                onChange={(v) => setEditingGroup(p => ({
                                                    ...p!,
                                                    theme_config: { ...p!.theme_config, palette: { ...p!.theme_config.palette, tertiary: v } }
                                                }))}
                                            />
                                            <ColorRow
                                                label="Cor Quaternária"
                                                value={editingGroup?.theme_config?.palette?.quaternary || "#ffffff"}
                                                onChange={(v) => setEditingGroup(p => ({
                                                    ...p!,
                                                    theme_config: { ...p!.theme_config, palette: { ...p!.theme_config.palette, quaternary: v } }
                                                }))}
                                            />
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>
                            <DialogFooter>
                                <Button variant="outline" className="rounded-xl" onClick={() => setIsGroupDialogOpen(false)}>Cancelar</Button>
                                <Button className="rounded-xl" onClick={handleSaveGroup}>Salvar</Button>
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
                                <div className="grid gap-2">
                                    <Label htmlFor="img">Foto da Loja (URL ou Upload)</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="img"
                                            value={editingRedirect?.image_url || ""}
                                            onChange={e => setEditingRedirect(p => ({ ...p, image_url: e.target.value }))}
                                            placeholder="https://imagens.../loja.jpg"
                                            className="rounded-xl flex-1"
                                        />
                                        <div className="relative">
                                            <Input
                                                type="file"
                                                accept="image/*"
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file || !activeTenantId) return;
                                                    setUploading(true);
                                                    try {
                                                        const fd = new FormData();
                                                        fd.append("tenantId", activeTenantId);
                                                        fd.append("kind", "links");
                                                        fd.append("file", file);

                                                        const { data: json, error: upError } = await supabase.functions.invoke("upload-tenant-asset", {
                                                            body: fd,
                                                        });

                                                        if (upError || !json?.ok) {
                                                            throw new Error(upError?.message || json?.error || "Erro no upload");
                                                        }

                                                        setEditingRedirect(p => ({ ...p, image_url: json.publicUrl }));
                                                        showSuccess("Imagem salva no Storage!");
                                                    } catch (err: any) {
                                                        showError(`Erro ao carregar imagem: ${err.message}`);
                                                    } finally {
                                                        setUploading(false);
                                                    }
                                                }}
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                disabled={uploading}
                                            />
                                            <Button variant="outline" className="rounded-xl" disabled={uploading}>
                                                {uploading ? "..." : "Subir"}
                                            </Button>
                                        </div>
                                    </div>
                                    {editingRedirect?.image_url && (
                                        <div className="mt-2 flex justify-center border rounded-xl p-2 bg-slate-50">
                                            <img src={editingRedirect.image_url} alt="Preview" className="h-20 rounded-lg object-contain" />
                                        </div>
                                    )}
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="address">Endereço (opcional)</Label>
                                    <Input
                                        id="address"
                                        value={editingRedirect?.address || ""}
                                        onChange={e => setEditingRedirect(p => ({ ...p, address: e.target.value }))}
                                        placeholder="Rua Exemplo, 123 - Centro"
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
