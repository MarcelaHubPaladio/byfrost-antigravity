import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Package, Image as ImageIcon, LayoutGrid, List as ListIcon, MapPin, Download, ClipboardList, User, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useProductPresence } from "@/hooks/useProductPresence";

interface ConsignmentItem {
    user_id: string;
    user_name: string;
    qty: number;
}

interface ConfigurationItem {
    id: string;
    name: string;
    internal_code: string;
    estoque_loja: number;
    estoque_consignado: number;
    estoque_total: number;
    local_prateleira: string;
    price_sale?: number;
    consignments?: ConsignmentItem[];
}

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
        price_rent?: number;
        price_consult?: boolean;
        price_cost?: number;
        location_json?: {
           address?: string;
           lat?: number;
           lng?: number;
        };
        business_type?: 'sale' | 'rent' | 'both';
        has_configurations?: boolean;
        estoque_loja?: number;
        estoque_consignado?: number;
        estoque_total?: number;
        consignments?: ConsignmentItem[];
        configurations?: ConfigurationItem[];
        allow_out_of_stock_sales?: boolean;
    };
    property_type?: string | null;
    total_area?: number | null;
    useful_area?: number | null;
    tags?: string[];
    updated_at: string;
};

type ConsignmentRow = {
    id: string; // unique row id (productId + "-" + (configId || "none") + "-" + userId)
    productId: string;
    productName: string;
    configId: string | null;
    configName: string | null;
    userId: string;
    userName: string;
    qty: number;
    photoUrl?: string;
    allowOutOfStock: boolean;
};

export default function Inventory() {
    const { activeTenantId } = useTenant();
    const { user } = useSession();
    const nav = useNavigate();
    const [q, setQ] = useState("");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [activeTab, setActiveTab] = useState("products");
    
    const locks = useProductPresence(activeTenantId);

    // Consignment Search
    const [consignmentSearch, setConsignmentSearch] = useState("");

    // Modals state
    const [newConsignmentOpen, setNewConsignmentOpen] = useState(false);
    const [selectedOptionValue, setSelectedOptionValue] = useState("");
    const [selectedSellerId, setSelectedSellerId] = useState("");
    const [qtyVal, setQtyVal] = useState("1");
    const [observation, setObservation] = useState("");

    const [adjustOpen, setAdjustOpen] = useState(false);
    const [editingRow, setEditingRow] = useState<ConsignmentRow | null>(null);
    const [adjustType, setAdjustType] = useState<"add" | "subtract">("add");

    const listQ = useQuery({
        queryKey: ["inventory", activeTenantId, q],
        enabled: Boolean(activeTenantId),
        queryFn: async () => {
            let base = supabase
                .from("core_entities")
                .select(`
                    id, 
                    display_name, 
                    subtype, 
                    status, 
                    metadata, 
                    updated_at,
                    property_type,
                    total_area,
                    useful_area,
                    core_entity_tags(tag)
                `)
                .eq("tenant_id", activeTenantId!)
                .eq("entity_type", "offering")
                .is("deleted_at", null)
                .order("display_name", { ascending: true });

            if (q.trim().length >= 2) {
                base = base.ilike("display_name", `%${q.trim()}%`);
            }

            const { data, error } = await base;
            if (error) throw error;
            return (data ?? []).map((r: any) => ({
                ...r,
                tags: (r.core_entity_tags || []).map((t: any) => t.tag)
            })) as InventoryItem[];
        },
    });

    const tenantUsersQ = useQuery({
        queryKey: ["tenant_users_list", activeTenantId],
        enabled: !!activeTenantId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("users_profile")
                .select("user_id, display_name, email")
                .eq("tenant_id", activeTenantId!)
                .is("deleted_at", null);
            if (error) throw error;
            return data || [];
        }
    });

    const items = Array.isArray(listQ.data) ? listQ.data : [];

    // Aggregate Consignment Rows
    const consignmentRows = useMemo(() => {
        const rows: ConsignmentRow[] = [];
        for (const item of items) {
            const allowOutOfStock = !!item.metadata?.allow_out_of_stock_sales;
            if (item.metadata?.has_configurations && Array.isArray(item.metadata?.configurations)) {
                for (const cfg of item.metadata.configurations) {
                    if (Array.isArray(cfg.consignments)) {
                        for (const c of cfg.consignments) {
                            if (c.qty > 0) {
                                rows.push({
                                    id: `${item.id}-${cfg.id}-${c.user_id}`,
                                    productId: item.id,
                                    productName: item.display_name,
                                    configId: cfg.id,
                                    configName: cfg.name,
                                    userId: c.user_id,
                                    userName: c.user_name || "Vendedor",
                                    qty: c.qty,
                                    photoUrl: item.metadata.photo_url,
                                    allowOutOfStock
                                });
                            }
                        }
                    }
                }
            } else if (Array.isArray(item.metadata?.consignments)) {
                for (const c of item.metadata.consignments) {
                    if (c.qty > 0) {
                        rows.push({
                            id: `${item.id}-none-${c.user_id}`,
                            productId: item.id,
                            productName: item.display_name,
                            configId: null,
                            configName: null,
                            userId: c.user_id,
                            userName: c.user_name || "Vendedor",
                            qty: c.qty,
                            photoUrl: item.metadata.photo_url,
                            allowOutOfStock
                        });
                    }
                }
            }
        }
        return rows;
    }, [items]);

    // Filtered Consignments
    const filteredConsignmentRows = useMemo(() => {
        if (!consignmentSearch.trim()) return consignmentRows;
        const term = consignmentSearch.toLowerCase();
        return consignmentRows.filter(r => 
            r.productName.toLowerCase().includes(term) ||
            (r.configName && r.configName.toLowerCase().includes(term)) ||
            r.userName.toLowerCase().includes(term)
        );
    }, [consignmentRows, consignmentSearch]);

    // Product Select Options for New Consignment Modal
    const productOptions = useMemo(() => {
        const options: { value: string; label: string; productId: string; configId: string | null }[] = [];
        for (const item of items) {
            if (item.subtype === 'imovel') continue;
            if (item.metadata?.has_configurations && Array.isArray(item.metadata?.configurations)) {
                for (const cfg of item.metadata.configurations) {
                    options.push({
                        value: `${item.id}:${cfg.id}`,
                        label: `${item.display_name} - ${cfg.name} (Loja: ${cfg.estoque_loja || 0})`,
                        productId: item.id,
                        configId: cfg.id
                    });
                }
            } else {
                options.push({
                    value: `${item.id}:none`,
                    label: `${item.display_name} (Loja: ${item.metadata?.estoque_loja ?? 0})`,
                    productId: item.id,
                    configId: null
                });
            }
        }
        return options;
    }, [items]);

    const handleEdit = (item: InventoryItem) => {
        if (locks[item.id] && locks[item.id].userId !== user?.id) {
            toast.error(`Acesso negado: Sendo editado por ${locks[item.id].userName}`);
            return;
        }
        nav(`/app/inventory/${item.id}`);
    };

    const handleCreate = () => {
        nav("/app/inventory/new");
    };

    const handleExportCSV = () => {
        if (items.length === 0) {
            toast.error("Não há itens para exportar");
            return;
        }

        try {
            const headers = ["Codigo", "Nome", "Estoque", "Link da Foto"];
            const rows = items.map(item => [
                item.metadata?.internal_code || "",
                item.display_name.replace(/,/g, " "),
                item.metadata?.stock_quantity !== undefined ? item.metadata.stock_quantity : "—",
                item.metadata?.photo_url || ""
            ]);

            const csvContent = [
                headers.join(","),
                ...rows.map(row => row.join(","))
            ].join("\n");

            const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            
            const timestamp = new Date().toISOString().split('T')[0];
            link.setAttribute("href", url);
            link.setAttribute("download", `inventario_${timestamp}.csv`);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            toast.success("Exportação concluída!");
        } catch (err) {
            console.error("Erro ao exportar CSV:", err);
            toast.error("Falha ao gerar CSV");
        }
    };

    // CRUD Handlers
    const submitNewConsignment = async () => {
        if (!selectedOptionValue) {
            toast.error("Selecione um produto ou variação.");
            return;
        }
        if (!selectedSellerId) {
            toast.error("Selecione um vendedor.");
            return;
        }
        const quantity = Number(qtyVal);
        if (isNaN(quantity) || quantity <= 0) {
            toast.error("A quantidade deve ser maior que zero.");
            return;
        }
        if (!observation.trim()) {
            toast.error("Por favor, informe uma observação/motivo.");
            return;
        }

        const option = productOptions.find(o => o.value === selectedOptionValue);
        if (!option) return;

        const seller = tenantUsersQ.data?.find(u => u.user_id === selectedSellerId);
        if (!seller) return;
        const sellerName = seller.display_name || seller.email || "Vendedor";

        try {
            const { data: product, error: prodErr } = await supabase
                .from("core_entities")
                .select("*")
                .eq("id", option.productId)
                .single();

            if (prodErr) throw prodErr;
            if (!product) {
                toast.error("Produto não encontrado.");
                return;
            }

            const metadata = { ...product.metadata };
            const allowOutOfStock = !!metadata.allow_out_of_stock_sales;

            let prevLoja = 0;
            let prevConsignado = 0;
            let prevTotal = 0;
            let newLoja = 0;
            let newConsignado = 0;
            let newTotal = 0;
            let configName = "";

            if (option.configId && Array.isArray(metadata.configurations)) {
                const configurations = [...metadata.configurations];
                const idx = configurations.findIndex((c: any) => c.id === option.configId);
                if (idx === -1) {
                    toast.error("Variação não encontrada no produto.");
                    return;
                }
                const cfg = { ...configurations[idx] };
                configName = cfg.name;
                prevLoja = Number(cfg.estoque_loja || 0);
                prevConsignado = Number(cfg.estoque_consignado || 0);
                prevTotal = Number(cfg.estoque_total || 0);

                if (!allowOutOfStock && prevLoja < quantity) {
                    toast.error(`Estoque insuficiente na loja. Disponível: ${prevLoja}`);
                    return;
                }

                newLoja = prevLoja - quantity;
                const consignments = Array.isArray(cfg.consignments) ? [...cfg.consignments] : [];
                const existingSellerIdx = consignments.findIndex((c: any) => c.user_id === selectedSellerId);
                if (existingSellerIdx !== -1) {
                    consignments[existingSellerIdx] = {
                        ...consignments[existingSellerIdx],
                        qty: consignments[existingSellerIdx].qty + quantity
                    };
                } else {
                    consignments.push({ user_id: selectedSellerId, user_name: sellerName, qty: quantity });
                }

                newConsignado = consignments.reduce((acc, c: any) => acc + c.qty, 0);
                newTotal = newLoja + newConsignado;

                cfg.estoque_loja = newLoja;
                cfg.estoque_consignado = newConsignado;
                cfg.estoque_total = newTotal;
                cfg.consignments = consignments;
                configurations[idx] = cfg;
                metadata.configurations = configurations;

                metadata.estoque_loja = configurations.reduce((acc, c: any) => acc + Number(c.estoque_loja || 0), 0);
                metadata.estoque_consignado = configurations.reduce((acc, c: any) => acc + Number(c.estoque_consignado || 0), 0);
                metadata.estoque_total = metadata.estoque_loja + metadata.estoque_consignado;
                metadata.stock_quantity = metadata.estoque_total;
            } else {
                prevLoja = Number(metadata.estoque_loja || 0);
                prevConsignado = Number(metadata.estoque_consignado || 0);
                prevTotal = Number(metadata.estoque_total || 0);

                if (!allowOutOfStock && prevLoja < quantity) {
                    toast.error(`Estoque insuficiente na loja. Disponível: ${prevLoja}`);
                    return;
                }

                newLoja = prevLoja - quantity;
                const consignments = Array.isArray(metadata.consignments) ? [...metadata.consignments] : [];
                const existingSellerIdx = consignments.findIndex((c: any) => c.user_id === selectedSellerId);
                if (existingSellerIdx !== -1) {
                    consignments[existingSellerIdx] = {
                        ...consignments[existingSellerIdx],
                        qty: consignments[existingSellerIdx].qty + quantity
                    };
                } else {
                    consignments.push({ user_id: selectedSellerId, user_name: sellerName, qty: quantity });
                }

                newConsignado = consignments.reduce((acc, c: any) => acc + c.qty, 0);
                newTotal = newLoja + newConsignado;

                metadata.estoque_loja = newLoja;
                metadata.estoque_consignado = newConsignado;
                metadata.estoque_total = newTotal;
                metadata.stock_quantity = newTotal;
                metadata.consignments = consignments;
            }

            const { error: updErr } = await supabase
                .from("core_entities")
                .update({ metadata })
                .eq("id", option.productId);

            if (updErr) throw updErr;

            await supabase.from("core_entity_events").insert({
                tenant_id: product.tenant_id,
                entity_id: option.productId,
                event_type: "stock_change",
                before: {
                    estoque_loja: prevLoja,
                    estoque_consignado: prevConsignado,
                    estoque_total: prevTotal,
                    config_id: option.configId,
                    config_name: configName,
                    consignments: (option.configId ? product.metadata?.configurations?.find((c: any) => c.id === option.configId)?.consignments : product.metadata?.consignments) || []
                },
                after: {
                    estoque_loja: newLoja,
                    estoque_consignado: newConsignado,
                    estoque_total: newTotal,
                    config_id: option.configId,
                    config_name: configName,
                    change_qty: quantity,
                    reason: observation,
                    consignments: (option.configId ? metadata.configurations?.find((c: any) => c.id === option.configId)?.consignments : metadata.consignments) || []
                },
                actor_user_id: user?.id || null,
                created_at: new Date().toISOString()
            });

            toast.success("Nova consignação salva com sucesso!");
            setNewConsignmentOpen(false);
            setSelectedOptionValue("");
            setSelectedSellerId("");
            setQtyVal("1");
            setObservation("");
            listQ.refetch();
        } catch (err: any) {
            console.error(err);
            toast.error("Erro ao salvar consignação: " + err.message);
        }
    };

    const submitAdjustConsignment = async () => {
        if (!editingRow) return;
        const quantity = Number(qtyVal);
        if (isNaN(quantity) || quantity <= 0) {
            toast.error("A quantidade deve ser maior que zero.");
            return;
        }
        if (!observation.trim()) {
            toast.error("Por favor, informe uma observação/motivo.");
            return;
        }

        try {
            const { data: product, error: prodErr } = await supabase
                .from("core_entities")
                .select("*")
                .eq("id", editingRow.productId)
                .single();

            if (prodErr) throw prodErr;
            if (!product) {
                toast.error("Produto não encontrado.");
                return;
            }

            const metadata = { ...product.metadata };
            const allowOutOfStock = !!metadata.allow_out_of_stock_sales;

            let prevLoja = 0;
            let prevConsignado = 0;
            let prevTotal = 0;
            let newLoja = 0;
            let newConsignado = 0;
            let newTotal = 0;
            let configName = "";
            
            const isSubtract = adjustType === "subtract";
            const delta = isSubtract ? -quantity : quantity;

            const currentConsignedQty = editingRow.qty;
            if (isSubtract && currentConsignedQty < quantity) {
                toast.error(`Vendedor possui apenas ${currentConsignedQty} unidades consignadas. Não é possível subtrair ${quantity}.`);
                return;
            }

            if (editingRow.configId && Array.isArray(metadata.configurations)) {
                const configurations = [...metadata.configurations];
                const idx = configurations.findIndex((c: any) => c.id === editingRow.configId);
                if (idx === -1) {
                    toast.error("Variação não encontrada.");
                    return;
                }
                const cfg = { ...configurations[idx] };
                configName = cfg.name;
                prevLoja = Number(cfg.estoque_loja || 0);
                prevConsignado = Number(cfg.estoque_consignado || 0);
                prevTotal = Number(cfg.estoque_total || 0);

                if (!isSubtract && !allowOutOfStock && prevLoja < quantity) {
                    toast.error(`Estoque insuficiente na loja. Disponível: ${prevLoja}`);
                    return;
                }

                newLoja = prevLoja - delta;
                
                const consignments = Array.isArray(cfg.consignments) ? [...cfg.consignments] : [];
                const cIdx = consignments.findIndex((c: any) => c.user_id === editingRow.userId);
                if (cIdx !== -1) {
                    const newQty = consignments[cIdx].qty + delta;
                    if (newQty <= 0) {
                        consignments.splice(cIdx, 1);
                    } else {
                        consignments[cIdx] = { ...consignments[cIdx], qty: newQty };
                    }
                } else if (!isSubtract) {
                    consignments.push({ user_id: editingRow.userId, user_name: editingRow.userName, qty: quantity });
                }

                newConsignado = consignments.reduce((acc, c: any) => acc + c.qty, 0);
                newTotal = newLoja + newConsignado;

                cfg.estoque_loja = newLoja;
                cfg.estoque_consignado = newConsignado;
                cfg.estoque_total = newTotal;
                cfg.consignments = consignments;
                configurations[idx] = cfg;
                metadata.configurations = configurations;

                metadata.estoque_loja = configurations.reduce((acc, c: any) => acc + Number(c.estoque_loja || 0), 0);
                metadata.estoque_consignado = configurations.reduce((acc, c: any) => acc + Number(c.estoque_consignado || 0), 0);
                metadata.estoque_total = metadata.estoque_loja + metadata.estoque_consignado;
                metadata.stock_quantity = metadata.estoque_total;
            } else {
                prevLoja = Number(metadata.estoque_loja || 0);
                prevConsignado = Number(metadata.estoque_consignado || 0);
                prevTotal = Number(metadata.estoque_total || 0);

                if (!isSubtract && !allowOutOfStock && prevLoja < quantity) {
                    toast.error(`Estoque insuficiente na loja. Disponível: ${prevLoja}`);
                    return;
                }

                newLoja = prevLoja - delta;

                const consignments = Array.isArray(metadata.consignments) ? [...metadata.consignments] : [];
                const cIdx = consignments.findIndex((c: any) => c.user_id === editingRow.userId);
                if (cIdx !== -1) {
                    const newQty = consignments[cIdx].qty + delta;
                    if (newQty <= 0) {
                        consignments.splice(cIdx, 1);
                    } else {
                        consignments[cIdx] = { ...consignments[cIdx], qty: newQty };
                    }
                } else if (!isSubtract) {
                    consignments.push({ user_id: editingRow.userId, user_name: editingRow.userName, qty: quantity });
                }

                newConsignado = consignments.reduce((acc, c: any) => acc + c.qty, 0);
                newTotal = newLoja + newConsignado;

                metadata.estoque_loja = newLoja;
                metadata.estoque_consignado = newConsignado;
                metadata.estoque_total = newTotal;
                metadata.stock_quantity = newTotal;
                metadata.consignments = consignments;
            }

            const { error: updErr } = await supabase
                .from("core_entities")
                .update({ metadata })
                .eq("id", editingRow.productId);

            if (updErr) throw updErr;

            await supabase.from("core_entity_events").insert({
                tenant_id: product.tenant_id,
                entity_id: editingRow.productId,
                event_type: "stock_change",
                before: {
                    estoque_loja: prevLoja,
                    estoque_consignado: prevConsignado,
                    estoque_total: prevTotal,
                    config_id: editingRow.configId,
                    config_name: configName,
                    consignments: (editingRow.configId ? product.metadata?.configurations?.find((c: any) => c.id === editingRow.configId)?.consignments : product.metadata?.consignments) || []
                },
                after: {
                    estoque_loja: newLoja,
                    estoque_consignado: newConsignado,
                    estoque_total: newTotal,
                    config_id: editingRow.configId,
                    config_name: configName,
                    change_qty: delta,
                    reason: observation,
                    consignments: (editingRow.configId ? metadata.configurations?.find((c: any) => c.id === editingRow.configId)?.consignments : metadata.consignments) || []
                },
                actor_user_id: user?.id || null,
                created_at: new Date().toISOString()
            });

            toast.success("Consignação ajustada com sucesso!");
            setAdjustOpen(false);
            setEditingRow(null);
            setQtyVal("1");
            setObservation("");
            listQ.refetch();
        } catch (err: any) {
            console.error(err);
            toast.error("Erro ao ajustar consignação: " + err.message);
        }
    };

    const startFullReturn = (row: ConsignmentRow) => {
        setEditingRow(row);
        setAdjustType("subtract");
        setQtyVal(String(row.qty));
        setObservation("Retorno total do estoque consignado para a loja");
        setAdjustOpen(true);
    };

    return (
        <AppShell title="Inventário">
            <div className="space-y-6">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border shadow-sm">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Inventário</h1>
                            <p className="text-sm text-slate-500">Gerenciamento de imóveis, produtos e ativos.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                            <TabsList className="bg-slate-100 p-1 rounded-xl">
                                <TabsTrigger value="products" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                    <Package className="w-4 h-4 mr-2" />
                                    Produtos e Ativos
                                </TabsTrigger>
                                <TabsTrigger value="consignments" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                    <ClipboardList className="w-4 h-4 mr-2" />
                                    Estoque Consignado
                                </TabsTrigger>
                            </TabsList>
                            
                            <div className="flex items-center gap-2">
                                {activeTab === "products" ? (
                                    <>
                                        <div className="flex border rounded-lg overflow-hidden h-10 bg-white">
                                            <button
                                                type="button"
                                                onClick={() => setViewMode("grid")}
                                                className={cn("px-3 transition-colors", viewMode === 'grid' ? "bg-indigo-50 text-indigo-600" : "bg-white text-slate-400 hover:text-slate-600")}
                                            >
                                                <LayoutGrid className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setViewMode("list")}
                                                className={cn("px-3 transition-colors border-l", viewMode === 'list' ? "bg-indigo-50 text-indigo-600" : "bg-white text-slate-400 hover:text-slate-600")}
                                            >
                                                <ListIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                        
                                        <Button 
                                            variant="outline"
                                            onClick={handleExportCSV} 
                                            className="rounded-xl h-10 border-slate-200 text-slate-600 hover:bg-slate-50"
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Exportar CSV
                                        </Button>

                                        <Button onClick={handleCreate} className="rounded-xl h-10 bg-indigo-600 hover:bg-indigo-700">
                                            <Plus className="w-4 h-4 mr-2" />
                                            Novo Ativo
                                        </Button>
                                    </>
                                ) : (
                                    <Button onClick={() => setNewConsignmentOpen(true)} className="rounded-xl h-10 bg-indigo-600 hover:bg-indigo-700">
                                        <Plus className="w-4 h-4 mr-2" />
                                        Nova Consignação
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>

                    <TabsContent value="products" className="space-y-6 m-0 focus-visible:outline-none">
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
                                        className="overflow-hidden border-slate-200 hover:shadow-md transition-shadow cursor-pointer group rounded-2xl bg-white"
                                        onClick={() => handleEdit(item)}
                                    >
                                        <div className="aspect-square bg-slate-100 relative overflow-hidden">
                                            {locks[item.id] && locks[item.id].userId !== user?.id && (
                                                <div className="absolute inset-0 bg-slate-900/60 z-10 flex flex-col items-center justify-center backdrop-blur-sm">
                                                    <Lock className="w-8 h-8 text-white mb-2" />
                                                    <span className="text-white text-xs font-bold text-center px-4">Editado por {locks[item.id].userName}</span>
                                                </div>
                                            )}
                                            {item.metadata?.photo_url ? (
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
                                            {item.metadata?.business_type && (
                                                <Badge
                                                    className={cn(
                                                        "absolute top-3 left-3 shadow-sm border-0",
                                                        item.metadata.business_type === 'sale' ? "bg-emerald-500 text-white" : 
                                                        item.metadata.business_type === 'rent' ? "bg-blue-500 text-white" : 
                                                        "bg-amber-500 text-white"
                                                    )}
                                                >
                                                    {item.metadata.business_type === 'sale' ? "Venda" : 
                                                     item.metadata.business_type === 'rent' ? "Aluguel" : 
                                                     "Venda/Aluguel"}
                                                </Badge>
                                            )}
                                            {item.metadata?.stock_quantity !== undefined && item.subtype !== 'imovel' && (
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
                                            <h3 className="font-bold text-slate-900 line-clamp-1 mb-1">{item.display_name}</h3>
                                            
                                            {item.subtype === 'imovel' && (
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                                    {item.property_type && <span className="capitalize">{item.property_type}</span>}
                                                    {item.useful_area && <span>{item.useful_area} m²</span>}
                                                </div>
                                            )}

                                            {item.metadata?.location_json?.address && (
                                                <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-2 truncate">
                                                    <MapPin className="w-3 h-3 flex-shrink-0" />
                                                    <span className="truncate">{item.metadata.location_json.address}</span>
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between mb-3">
                                                <div className="text-lg font-black text-indigo-600">
                                                    {item.metadata?.price_consult ? (
                                                        <span className="text-sm text-indigo-500 italic">Sob Consulta</span>
                                                    ) : item.metadata?.price_sale ? (
                                                        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.metadata.price_sale)
                                                    ) : item.metadata?.price_rent ? (
                                                        <div className="flex flex-col">
                                                            <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.metadata.price_rent)}</span>
                                                            <span className="text-[10px] opacity-60 font-medium -mt-1">por mês</span>
                                                        </div>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </div>
                                                {item.metadata?.internal_code && (
                                                    <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">#{item.metadata.internal_code}</span>
                                                )}
                                            </div>

                                            {item.tags && item.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {item.tags.slice(0, 3).map(t => (
                                                        <Badge key={t} variant="outline" className="text-[9px] px-1.5 h-4 bg-slate-50 text-slate-500 border-slate-200 uppercase font-bold tracking-tighter">
                                                            {t}
                                                        </Badge>
                                                    ))}
                                                    {item.tags.length > 3 && (
                                                        <span className="text-[9px] text-slate-400">+{item.tags.length - 3}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <Card className="rounded-2xl border-slate-200 overflow-hidden shadow-sm bg-white">
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 text-left border-b border-slate-200">
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest w-16">Foto</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Ativo</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Código</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status / Tags</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Preço</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {items.map(item => (
                                                <tr key={item.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => handleEdit(item)}>
                                                    <td className="px-6 py-3">
                                                        <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden">
                                                            {item.metadata?.photo_url ? (
                                                                <img src={item.metadata.photo_url} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                                    <ImageIcon className="w-4 h-4" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <div className="flex flex-col gap-1 items-start">
                                                            <div className="font-bold text-slate-900 flex items-center gap-2">
                                                                {item.display_name}
                                                                {locks[item.id] && locks[item.id].userId !== user?.id && (
                                                                    <Badge variant="destructive" className="bg-red-500 gap-1 text-[10px]">
                                                                        <Lock className="w-3 h-3" />
                                                                        {locks[item.id].userName}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-slate-500">{item.subtype || "Sem categoria"}</div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 font-mono text-xs text-slate-400">
                                                        {item.metadata?.internal_code || "—"}
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                            {item.metadata?.business_type === 'sale' && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 text-[10px]">Venda</Badge>}
                                                            {item.metadata?.business_type === 'rent' && <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 text-[10px]">Aluguel</Badge>}
                                                            {item.metadata?.business_type === 'both' && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 text-[10px]">Venda/Aluguel</Badge>}
                                                            {item.tags?.map(t => (
                                                                <Badge key={t} variant="outline" className="text-[10px] border-slate-200 text-slate-500 uppercase font-medium">{t}</Badge>
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 font-bold text-indigo-600">
                                                        {item.metadata?.price_consult ? (
                                                            <span className="text-xs italic text-indigo-500">Sob Consulta</span>
                                                        ) : item.metadata?.price_sale ? (
                                                            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.metadata.price_sale)
                                                        ) : item.metadata?.price_rent ? (
                                                            <span className="text-xs">
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.metadata.price_rent)}
                                                                <span className="opacity-50 text-[9px] ml-1">/mês</span>
                                                            </span>
                                                        ) : (
                                                            "—"
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-3 text-right">
                                                        <Button variant="ghost" size="sm" className="text-indigo-600 font-bold" onClick={() => handleEdit(item)}>Editar</Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )}
                    </TabsContent>

                    <TabsContent value="consignments" className="space-y-6 m-0 focus-visible:outline-none">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                value={consignmentSearch}
                                onChange={(e) => setConsignmentSearch(e.target.value)}
                                placeholder="Buscar por vendedor, produto ou variação..."
                                className="pl-10 h-12 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-indigo-500"
                            />
                        </div>

                        {listQ.isLoading ? (
                            <div className="py-20 text-center text-slate-400 italic">Carregando consignações...</div>
                        ) : filteredConsignmentRows.length === 0 ? (
                            <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl bg-slate-50 text-slate-400">
                                <ClipboardList className="w-12 h-12 mb-4 opacity-20" />
                                <p>Nenhuma consignação encontrada.</p>
                                <Button variant="link" onClick={() => setNewConsignmentOpen(true)}>Criar primeira consignação</Button>
                            </div>
                        ) : (
                            <Card className="rounded-2xl border-slate-200 overflow-hidden shadow-sm bg-white">
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 text-left border-b border-slate-200">
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest w-16">Foto</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Produto / Variação</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Vendedor</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Qtd Consignada</th>
                                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredConsignmentRows.map(row => (
                                                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-3">
                                                        <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden">
                                                            {row.photoUrl ? (
                                                                <img src={row.photoUrl} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                                    <ImageIcon className="w-4 h-4" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <div className="font-bold text-slate-900">{row.productName}</div>
                                                        {row.configName && (
                                                            <div className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full inline-block mt-0.5">
                                                                Variação: {row.configName}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-3 text-slate-700 font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <User className="w-4 h-4 text-slate-400" />
                                                            {row.userName}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 font-bold text-xs py-1 px-2.5 rounded-full">
                                                            {row.qty} un
                                                        </Badge>
                                                    </td>
                                                    <td className="px-6 py-3 text-right space-x-2">
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 font-bold" 
                                                            onClick={() => {
                                                                setEditingRow(row);
                                                                setAdjustType("add");
                                                                setQtyVal("1");
                                                                setObservation("");
                                                                setAdjustOpen(true);
                                                            }}
                                                        >
                                                            Ajustar
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold" 
                                                            onClick={() => startFullReturn(row)}
                                                        >
                                                            Retornar Tudo
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            {/* Dialog: Nova Consignação */}
            <Dialog open={newConsignmentOpen} onOpenChange={setNewConsignmentOpen}>
                <DialogContent className="sm:max-w-[450px]">
                    <DialogHeader>
                        <DialogTitle>Nova Consignação</DialogTitle>
                        <DialogDescription>
                            Transfira itens do estoque da loja para o consignado de um vendedor.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-1">
                            <Label className="text-xs font-black text-slate-500 uppercase">Produto / Variação *</Label>
                            <Select value={selectedOptionValue} onValueChange={setSelectedOptionValue}>
                                <SelectTrigger className="h-10 rounded-xl bg-white border-slate-200 text-xs">
                                    <SelectValue placeholder="Selecione o produto..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {productOptions.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs font-black text-slate-500 uppercase">Vendedor *</Label>
                            <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
                                <SelectTrigger className="h-10 rounded-xl bg-white border-slate-200 text-xs">
                                    <SelectValue placeholder="Selecione o vendedor..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {(tenantUsersQ.data || []).map((u) => (
                                        <SelectItem key={u.user_id} value={u.user_id} className="text-xs">
                                            {u.display_name || u.email}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs font-black text-slate-500 uppercase">Quantidade a Consignar *</Label>
                            <Input
                                type="number"
                                min="1"
                                value={qtyVal}
                                onChange={(e) => setQtyVal(e.target.value)}
                                className="h-10 rounded-xl bg-white border-slate-200 text-xs font-mono"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs font-black text-slate-500 uppercase">Observação / Motivo *</Label>
                            <Textarea
                                value={observation}
                                onChange={(e) => setObservation(e.target.value)}
                                placeholder="Ex: Consignado para feira de artesanato no final de semana"
                                className="rounded-xl border-slate-200 text-xs resize-none h-20"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setNewConsignmentOpen(false)} className="rounded-xl">
                            Cancelar
                        </Button>
                        <Button onClick={submitNewConsignment} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl">
                            Salvar Consignação
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog: Ajustar Consignação (Soma / Subtração) */}
            <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
                <DialogContent className="sm:max-w-[450px]">
                    <DialogHeader>
                        <DialogTitle>Ajustar Consignação</DialogTitle>
                        <DialogDescription>
                            Ajuste o saldo consignado para o vendedor selecionado.
                        </DialogDescription>
                    </DialogHeader>

                    {editingRow && (
                        <div className="space-y-4 py-2">
                            <div className="p-3 bg-slate-50 rounded-xl border space-y-1 text-xs">
                                <div><span className="font-bold text-slate-500">Produto:</span> {editingRow.productName}</div>
                                {editingRow.configName && <div><span className="font-bold text-slate-500">Variação:</span> {editingRow.configName}</div>}
                                <div><span className="font-bold text-slate-500">Vendedor:</span> {editingRow.userName}</div>
                                <div><span className="font-bold text-slate-500">Quantidade Atual:</span> {editingRow.qty} un</div>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-black text-slate-500 uppercase">Tipo de Ajuste *</Label>
                                <Select value={adjustType} onValueChange={(val: any) => setAdjustType(val)}>
                                    <SelectTrigger className="h-10 rounded-xl bg-white border-slate-200 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="add" className="text-xs">Somar (Enviar mais para consignado)</SelectItem>
                                        <SelectItem value="subtract" className="text-xs">Subtrair (Retornar do consignado para loja)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-black text-slate-500 uppercase">Quantidade do Ajuste *</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={qtyVal}
                                    onChange={(e) => setQtyVal(e.target.value)}
                                    className="h-10 rounded-xl bg-white border-slate-200 text-xs font-mono"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-black text-slate-500 uppercase">Observação / Motivo *</Label>
                                <Textarea
                                    value={observation}
                                    onChange={(e) => setObservation(e.target.value)}
                                    placeholder="Informe o motivo do ajuste..."
                                    className="rounded-xl border-slate-200 text-xs resize-none h-20"
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAdjustOpen(false)} className="rounded-xl">
                            Cancelar
                        </Button>
                        <Button onClick={submitAdjustConsignment} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl">
                            Confirmar Ajuste
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppShell>
    );
}
