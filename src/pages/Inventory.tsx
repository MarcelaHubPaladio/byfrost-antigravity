import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Package, Image as ImageIcon, LayoutGrid, List as ListIcon } from "lucide-react";
import { InventoryUpsertDialog } from "@/components/core/InventoryUpsertDialog";
import { cn } from "@/lib/utils";

type InventoryItem = {
    id: string;
    display_name: string;
    subtype: string | null;
    status: string | null;
    metadata: {
        description?: string;
        photo_url?: string;
        internal_code?: string;
        stock_quantity?: number;
        price_sale?: number;
        price_cost?: number;
    };
    updated_at: string;
};

export default function Inventory() {
    const { activeTenantId } = useTenant();
    const [q, setQ] = useState("");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [upsertOpen, setUpsertOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

    const listQ = useQuery({
        queryKey: ["inventory", activeTenantId, q],
        enabled: Boolean(activeTenantId),
        queryFn: async () => {
            let base = supabase
                .from("core_entities")
                .select("id, display_name, subtype, status, metadata, updated_at")
                .eq("tenant_id", activeTenantId!)
                .eq("entity_type", "offering")
                .is("deleted_at", null)
                .order("display_name", { ascending: true });

            if (q.trim().length >= 2) {
                base = base.ilike("display_name", `%${q.trim()}%`);
            }

            const { data, error } = await base;
            if (error) throw error;
            return (data ?? []) as InventoryItem[];
        },
    });

    const items = listQ.data ?? [];

    const handleEdit = (item: InventoryItem) => {
        setSelectedItem(item);
        setUpsertOpen(true);
    };

    const handleCreate = () => {
        setSelectedItem(null);
        setUpsertOpen(true);
    };

    return (
        <RequireAuth>
            <RequireRouteAccess routeKey="app.entities">
                <AppShell>
                    <div className="space-y-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border shadow-sm">
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900">Inventário</h1>
                                <p className="text-sm text-slate-500">Gerenciamento de produtos, estoque e preços.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex border rounded-lg overflow-hidden h-10">
                                    <button
                                        onClick={() => setViewMode("grid")}
                                        className={cn("px-3 transition-colors", viewMode === 'grid' ? "bg-indigo-50 text-indigo-600" : "bg-white text-slate-400 hover:text-slate-600")}
                                    >
                                        <LayoutGrid className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setViewMode("list")}
                                        className={cn("px-3 transition-colors border-l", viewMode === 'list' ? "bg-indigo-50 text-indigo-600" : "bg-white text-slate-400 hover:text-slate-600")}
                                    >
                                        <ListIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                <Button onClick={handleCreate} className="rounded-xl h-10 bg-indigo-600 hover:bg-indigo-700">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Novo Produto
                                </Button>
                            </div>
                        </div>

                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Buscar produtos por nome ou código..."
                                className="pl-10 h-12 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-indigo-500"
                            />
                        </div>

                        {listQ.isLoading ? (
                            <div className="py-20 text-center text-slate-400 italic">Carregando inventário...</div>
                        ) : items.length === 0 ? (
                            <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl bg-slate-50 text-slate-400">
                                <Package className="w-12 h-12 mb-4 opacity-20" />
                                <p>Nenhum produto encontrado.</p>
                                <Button variant="link" onClick={handleCreate}>Cadastrar o primeiro</Button>
                            </div>
                        ) : viewMode === "grid" ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {items.map((item) => (
                                    <Card
                                        key={item.id}
                                        className="overflow-hidden border-slate-200 hover:shadow-md transition-shadow cursor-pointer group rounded-2xl"
                                        onClick={() => handleEdit(item)}
                                    >
                                        <div className="aspect-square bg-slate-100 relative overflow-hidden">
                                            {item.metadata.photo_url ? (
                                                <img
                                                    src={item.metadata.photo_url}
                                                    alt={item.display_name}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                    <ImageIcon className="w-12 h-12" />
                                                </div>
                                            )}
                                            {item.metadata.stock_quantity !== undefined && (
                                                <Badge
                                                    variant={item.metadata.stock_quantity > 0 ? "secondary" : "destructive"}
                                                    className="absolute top-3 right-3 shadow-sm bg-white/90 backdrop-blur-sm"
                                                >
                                                    Estoque: {item.metadata.stock_quantity}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="p-4">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                                {item.subtype || "Produto"}
                                            </div>
                                            <h3 className="font-bold text-slate-900 line-clamp-1 mb-2">{item.display_name}</h3>
                                            <div className="flex items-center justify-between">
                                                <div className="text-lg font-black text-indigo-600">
                                                    {item.metadata.price_sale
                                                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.metadata.price_sale)
                                                        : "—"}
                                                </div>
                                                {item.metadata.internal_code && (
                                                    <span className="text-[10px] text-slate-400 font-mono">#{item.metadata.internal_code}</span>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <Card className="rounded-2xl border-slate-200 overflow-hidden shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 text-left border-b border-slate-200">
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest w-16">Foto</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Produto</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Código</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Estoque</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Preço</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {items.map(item => (
                                                <tr key={item.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => handleEdit(item)}>
                                                    <td className="px-6 py-3">
                                                        <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden">
                                                            {item.metadata.photo_url ? (
                                                                <img src={item.metadata.photo_url} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                                    <ImageIcon className="w-4 h-4" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <div className="font-bold text-slate-900">{item.display_name}</div>
                                                        <div className="text-xs text-slate-500">{item.subtype || "Sem categoria"}</div>
                                                    </td>
                                                    <td className="px-6 py-3 font-mono text-xs text-slate-400">
                                                        {item.metadata.internal_code || "—"}
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <span className={cn("font-bold", (item.metadata.stock_quantity ?? 0) > 0 ? "text-slate-700" : "text-red-500")}>
                                                            {item.metadata.stock_quantity ?? "—"}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-3 font-bold text-indigo-600">
                                                        {item.metadata.price_sale
                                                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.metadata.price_sale)
                                                            : "—"}
                                                    </td>
                                                    <td className="px-6 py-3 text-right">
                                                        <Button variant="ghost" size="sm" className="text-indigo-600 font-bold">Editar</Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )}

                        {activeTenantId && (
                            <InventoryUpsertDialog
                                open={upsertOpen}
                                onOpenChange={setUpsertOpen}
                                item={selectedItem}
                                onSaved={() => listQ.refetch()}
                            />
                        )}
                    </div>
                </AppShell>
            </RequireRouteAccess>
        </RequireAuth>
    );
}
