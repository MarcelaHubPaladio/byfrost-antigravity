import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import imageCompression from "browser-image-compression";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Package, Image as ImageIcon, Upload, Trash2, Info, CloudUpload, Plus, Pencil, ClipboardList, Sliders, MapPin, CheckCircle, RefreshCw, Calendar, User, Lock } from "lucide-react";
import { DeliverableTemplateUpsertDialog } from "@/components/core/DeliverableTemplateUpsertDialog";
import { useAcquireProductLock } from "@/hooks/useProductPresence";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";

const formSchema = z.object({
    display_name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
    subtype: z.string().optional(),
    description: z.string().optional(),
    photo_url: z.string().optional(),
    internal_code: z.string().optional(),
    price_sale: z.coerce.number().min(0, "Preço não pode ser negativo"),
    price_cost: z.coerce.number().min(0, "Custo não pode ser negativo"),
    price_consult: z.boolean().optional().default(false),
    supplier_id: z.string().optional().nullable(),
    local_prateleira: z.string().optional(),
    allow_out_of_stock_sales: z.boolean().optional().default(false),
    has_configurations: z.boolean().optional().default(false),
    estoque_loja: z.coerce.number().min(0, "Estoque não pode ser negativo"),
    estoque_consignado: z.coerce.number().min(0, "Estoque não pode ser negativo"),
    commission_category_id: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

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

export default function InventoryDetail() {
    const { id } = useParams();
    const nav = useNavigate();
    const qc = useQueryClient();
    const { activeTenantId } = useTenant();
    const { user } = useSession();
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadPhase, setUploadPhase] = useState<"compressing" | "uploading" | "idle">("idle");
    const [upsertOpen, setUpsertOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("geral");
    const [selectedConfigForConsignment, setSelectedConfigForConsignment] = useState<string>("product");
    const [editingTemplate, setEditingTemplate] = useState<any>(null);
    const isEdit = Boolean(id && id !== "new");

    const { status: lockStatus, lockedBy } = useAcquireProductLock(activeTenantId, isEdit ? id! : null, user);

    // Configurations State
    const [configurations, setConfigurations] = useState<ConfigurationItem[]>([]);
    const [configDialogOpen, setConfigDialogOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState<ConfigurationItem | null>(null);

    // Configuration Form Fields
    const [configName, setConfigName] = useState("");
    const [configSku, setConfigSku] = useState("");
    const [configEstoqueLoja, setConfigEstoqueLoja] = useState("0");
    const [configEstoqueConsignado, setConfigEstoqueConsignado] = useState("0");
    const [configPrateleira, setConfigPrateleira] = useState("");
    const [configPriceSale, setConfigPriceSale] = useState("");

    // Consignment State
    const [productConsignments, setProductConsignments] = useState<ConsignmentItem[]>([]);
    const [activeConfigConsignments, setActiveConfigConsignments] = useState<ConsignmentItem[]>([]);
    const [consignmentDialogOpen, setConsignmentDialogOpen] = useState(false);
    const [consignmentTarget, setConsignmentTarget] = useState<{ type: "product" | "config", name: string } | null>(null);
    const [activeConsignments, setActiveConsignments] = useState<ConsignmentItem[]>([]);
    
    const [selectedSellerId, setSelectedSellerId] = useState("");
    const [consignmentQty, setConsignmentQty] = useState("1");

    // Auto-update estoque_consignado in form when productConsignments change
    useEffect(() => {
        if (!form.watch("has_configurations")) {
            const sum = productConsignments.reduce((acc, c) => acc + c.qty, 0);
            form.setValue("estoque_consignado", sum);
        }
    }, [productConsignments]);

    const openProductConsignment = () => {
        setConsignmentTarget({ type: "product", name: form.getValues("display_name") || "Produto" });
        setActiveConsignments(productConsignments);
        setSelectedSellerId("");
        setConsignmentQty("1");
        setConsignmentDialogOpen(true);
    };

    const openConfigConsignment = () => {
        setConsignmentTarget({ type: "config", name: configName || "Variação" });
        setActiveConsignments(activeConfigConsignments);
        setSelectedSellerId("");
        setConsignmentQty("1");
        setConsignmentDialogOpen(true);
    };

    
    const handleAddConsignmentTab = () => {
        if (!selectedSellerId) {
            showError("Selecione um vendedor.");
            return;
        }
        const qty = Number(consignmentQty) || 0;
        if (qty <= 0) {
            showError("A quantidade deve ser maior que zero.");
            return;
        }
        const seller = tenantUsersQ.data?.find(u => u.user_id === selectedSellerId);
        if (!seller) return;

        const sellerName = seller.display_name || seller.email || "Vendedor";
        
        if (hasConfigurations && selectedConfigForConsignment !== "product") {
            setConfigurations(prev => prev.map(c => {
                if (c.id === selectedConfigForConsignment) {
                    const currentConsignments = c.consignments || [];
                    const exists = currentConsignments.find(item => item.user_id === selectedSellerId);
                    let newConsignments;
                    if (exists) {
                        newConsignments = currentConsignments.map(item => 
                            item.user_id === selectedSellerId ? { ...item, qty: item.qty + qty } : item
                        );
                    } else {
                        newConsignments = [...currentConsignments, { user_id: selectedSellerId, user_name: sellerName, qty }];
                    }
                    const sum = newConsignments.reduce((acc, x) => acc + x.qty, 0);
                    return { ...c, consignments: newConsignments, estoque_consignado: sum, estoque_total: c.estoque_loja + sum };
                }
                return c;
            }));
        } else {
            setProductConsignments(prev => {
                const exists = prev.find(item => item.user_id === selectedSellerId);
                if (exists) {
                    return prev.map(item => 
                        item.user_id === selectedSellerId ? { ...item, qty: item.qty + qty } : item
                    );
                }
                return [...prev, { user_id: selectedSellerId, user_name: sellerName, qty }];
            });
        }

        setSelectedSellerId("");
        setConsignmentQty("1");
        showSuccess("Consignação adicionada! Salve o produto para persistir.");
    };

    const handleRemoveConsignmentTab = (userId: string, configId?: string) => {
        if (hasConfigurations && configId && configId !== "product") {
            setConfigurations(prev => prev.map(c => {
                if (c.id === configId) {
                    const newConsignments = (c.consignments || []).filter(item => item.user_id !== userId);
                    const sum = newConsignments.reduce((acc, x) => acc + x.qty, 0);
                    return { ...c, consignments: newConsignments, estoque_consignado: sum, estoque_total: c.estoque_loja + sum };
                }
                return c;
            }));
        } else {
            setProductConsignments(prev => prev.filter(item => item.user_id !== userId));
        }
    };

    const handleAddConsignment = () => {
        if (!selectedSellerId) {
            showError("Selecione um vendedor.");
            return;
        }
        const qty = Number(consignmentQty) || 0;
        if (qty <= 0) {
            showError("A quantidade deve ser maior que zero.");
            return;
        }
        const seller = tenantUsersQ.data?.find(u => u.user_id === selectedSellerId);
        if (!seller) return;

        const sellerName = seller.display_name || seller.email || "Vendedor";
        
        setActiveConsignments(prev => {
            const exists = prev.find(item => item.user_id === selectedSellerId);
            if (exists) {
                return prev.map(item => 
                    item.user_id === selectedSellerId 
                        ? { ...item, qty: item.qty + qty } 
                        : item
                );
            }
            return [...prev, { user_id: selectedSellerId, user_name: sellerName, qty }];
        });

        setSelectedSellerId("");
        setConsignmentQty("1");
        showSuccess("Consignação adicionada!");
    };

    const handleRemoveConsignment = (userId: string) => {
        setActiveConsignments(prev => prev.filter(item => item.user_id !== userId));
        showSuccess("Consignação removida!");
    };

    const saveConsignment = () => {
        if (!consignmentTarget) return;

        const sum = activeConsignments.reduce((acc, c) => acc + c.qty, 0);

        if (consignmentTarget.type === "product") {
            setProductConsignments(activeConsignments);
            form.setValue("estoque_consignado", sum);
        } else {
            setActiveConfigConsignments(activeConsignments);
            setConfigEstoqueConsignado(String(sum));
        }

        setConsignmentDialogOpen(false);
        showSuccess("Alterações de consignação aplicadas!");
    };

    const itemQ = useQuery({
        queryKey: ["inventory_item", activeTenantId, id],
        enabled: isEdit && !!activeTenantId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("core_entities")
                .select("*")
                .eq("id", id!)
                .eq("tenant_id", activeTenantId!)
                .single();
            if (error) throw error;
            return data;
        },
    });

    const suppliersQ = useQuery({
        queryKey: ["suppliers", activeTenantId],
        enabled: !!activeTenantId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("core_entities")
                .select("id, display_name")
                .eq("tenant_id", activeTenantId!)
                .eq("entity_type", "party")
                .eq("subtype", "fornecedor")
                .is("deleted_at", null)
                .order("display_name", { ascending: true });
            if (error) throw error;
            return data || [];
        }
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

    const commissionCategoriesQ = useQuery({
        queryKey: ["commission_categories", activeTenantId],
        enabled: !!activeTenantId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("core_entities")
                .select("id, display_name")
                .eq("tenant_id", activeTenantId!)
                .eq("entity_type", "commission_category")
                .is("deleted_at", null)
                .order("display_name", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    const stockHistoryQ = useQuery({
        queryKey: ["stock_history", id],
        enabled: isEdit,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("core_entity_events")
                .select("*")
                .eq("entity_id", id!)
                .eq("event_type", "stock_change")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data || [];
        }
    });

    const stockHistoryEvents = useMemo(() => {
        if (!stockHistoryQ.data) return [];
        return stockHistoryQ.data.map((e: any) => {
            const actor = tenantUsersQ.data?.find(u => u.user_id === e.actor_user_id);
            return {
                ...e,
                actor_name: actor?.display_name || actor?.email || "Sistema"
            };
        });
    }, [stockHistoryQ.data, tenantUsersQ.data]);

    const templatesQ = useQuery({
        queryKey: ["deliverable_templates", activeTenantId, id],
        enabled: isEdit && !!activeTenantId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("deliverable_templates")
                .select("*")
                .eq("offering_entity_id", id!)
                .eq("tenant_id", activeTenantId!)
                .is("deleted_at", null)
                .order("created_at", { ascending: true });
            if (error) throw error;
            return data;
        },
    });

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            display_name: "",
            subtype: "Geral",
            description: "",
            photo_url: "",
            internal_code: "",
            price_sale: 0,
            price_cost: 0,
            price_consult: false,
            supplier_id: "",
            local_prateleira: "",
            allow_out_of_stock_sales: false,
            has_configurations: false,
            estoque_loja: 0,
            estoque_consignado: 0,
            commission_category_id: "",
        },
    });

    useEffect(() => {
        if (itemQ.data) {
            form.reset({
                display_name: itemQ.data.display_name || "",
                subtype: itemQ.data.subtype || "",
                description: itemQ.data.metadata?.description || "",
                photo_url: itemQ.data.metadata?.photo_url || "",
                internal_code: itemQ.data.metadata?.internal_code || "",
                price_sale: itemQ.data.metadata?.price_sale || 0,
                price_cost: itemQ.data.metadata?.price_cost || 0,
                price_consult: !!itemQ.data.metadata?.price_consult,
                supplier_id: itemQ.data.metadata?.supplier_id || "",
                local_prateleira: itemQ.data.metadata?.local_prateleira || "",
                allow_out_of_stock_sales: !!itemQ.data.metadata?.allow_out_of_stock_sales,
                has_configurations: !!itemQ.data.metadata?.has_configurations,
                estoque_loja: itemQ.data.metadata?.estoque_loja || 0,
                estoque_consignado: itemQ.data.metadata?.estoque_consignado || 0,
                commission_category_id: itemQ.data.metadata?.commission_category_id || "none",
            });
            setConfigurations(itemQ.data.metadata?.configurations || []);
            setProductConsignments(itemQ.data.metadata?.consignments || []);
        }
    }, [itemQ.data, form]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeTenantId) return;

        setUploading(true);
        setUploadProgress(0);
        setUploadPhase("compressing");

        try {
            const compInterval = setInterval(() => {
                setUploadProgress(p => p >= 30 ? 30 : p + 5);
            }, 200);

            const options = {
                maxSizeMB: 1,
                maxWidthOrHeight: 1920,
                useWebWorker: true,
                initialQuality: 0.8,
            };

            const compressedFile = await imageCompression(file, options);
            clearInterval(compInterval);

            setUploadPhase("uploading");
            setUploadProgress(40);

            const fileExt = file.name.split('.').pop();
            const fileName = `${activeTenantId}/${crypto.randomUUID()}.${fileExt}`;

            const upInterval = setInterval(() => {
                setUploadProgress(p => p >= 90 ? 90 : p + 10);
            }, 100);

            const { error: uploadError } = await supabase.storage
                .from('inventory')
                .upload(fileName, compressedFile);

            clearInterval(upInterval);

            if (uploadError) throw uploadError;

            setUploadProgress(100);

            const { data: { publicUrl } } = supabase.storage
                .from('inventory')
                .getPublicUrl(fileName);

            form.setValue("photo_url", publicUrl);
            showSuccess("Imagem enviada com sucesso!");
        } catch (e: any) {
            showError(e.message || "Erro ao processar/enviar upload");
        } finally {
            setTimeout(() => {
                setUploading(false);
                setUploadPhase("idle");
                setUploadProgress(0);
            }, 500);
        }
    };

    async function onSubmit(values: FormValues) {
        if (!activeTenantId) return;
        setLoading(true);

        try {
            const stock_quantity = values.has_configurations
                ? configurations.reduce((sum, c) => sum + Number(c.estoque_total || 0), 0)
                : (Number(values.estoque_loja || 0) + Number(values.estoque_consignado || 0));

            const metadata = {
                ...(itemQ.data?.metadata || {}),
                description: values.description,
                photo_url: values.photo_url,
                internal_code: values.internal_code,
                price_sale: values.price_sale,
                price_cost: values.price_cost,
                price_consult: values.price_consult,
                supplier_id: values.supplier_id || null,
                local_prateleira: values.local_prateleira || "",
                allow_out_of_stock_sales: values.allow_out_of_stock_sales,
                has_configurations: values.has_configurations,
                estoque_loja: values.has_configurations ? 0 : values.estoque_loja,
                estoque_consignado: values.has_configurations ? 0 : values.estoque_consignado,
                estoque_total: stock_quantity,
                stock_quantity: stock_quantity,
                commission_category_id: (!values.commission_category_id || values.commission_category_id === "none") ? null : values.commission_category_id,
                configurations: values.has_configurations ? configurations : [],
                consignments: values.has_configurations ? [] : productConsignments
            };

            // Se for novo produto, vamos registrar a entrada inicial no estoque se for maior que zero
            const isNew = !isEdit;

            let offeringId = id!;
            if (isEdit) {
                const prevLoja = Number(itemQ.data?.metadata?.estoque_loja || 0);
                const prevConsignado = Number(itemQ.data?.metadata?.estoque_consignado || 0);
                const prevTotal = Number(itemQ.data?.metadata?.estoque_total || 0);

                const newLoja = values.has_configurations ? 0 : Number(values.estoque_loja || 0);
                const newConsignado = values.has_configurations ? 0 : Number(values.estoque_consignado || 0);

                const { error } = await supabase
                    .from("core_entities")
                    .update({
                        display_name: values.display_name,
                        subtype: values.subtype,
                        metadata,
                    })
                    .eq("id", id!)
                    .eq("tenant_id", activeTenantId);
                if (error) throw error;

                if (!values.has_configurations) {
                    const diffLoja = newLoja - prevLoja;
                    const diffConsignado = newConsignado - prevConsignado;
                    if (diffLoja !== 0 || diffConsignado !== 0) {
                        await supabase.from("core_entity_events").insert({
                            tenant_id: activeTenantId,
                            entity_id: id!,
                            event_type: "stock_change",
                            before: {
                                estoque_loja: prevLoja,
                                estoque_consignado: prevConsignado,
                                estoque_total: prevTotal,
                                consignments: itemQ.data?.metadata?.consignments || []
                            },
                            after: {
                                estoque_loja: newLoja,
                                estoque_consignado: newConsignado,
                                estoque_total: stock_quantity,
                                change_qty: diffLoja + diffConsignado,
                                reason: "Ajuste manual de estoque",
                                consignments: productConsignments
                            },
                            actor_user_id: user?.id || null,
                            created_at: new Date().toISOString()
                        });
                    }
                }

                if (values.photo_url) {
                    await supabase.from("core_entity_photos").upsert({
                        tenant_id: activeTenantId,
                        entity_id: id!,
                        room_type: "Geral",
                        url: values.photo_url,
                        is_main: true,
                    }, { onConflict: 'entity_id, url' });
                }

                showSuccess("Produto atualizado!");
            } else {
                const { data, error } = await supabase.from("core_entities").insert({
                    tenant_id: activeTenantId,
                    entity_type: "offering",
                    subtype: values.subtype,
                    display_name: values.display_name,
                    status: "active",
                    metadata,
                }).select("id").single();
                
                if (error) throw error;
                offeringId = data.id;

                if (values.photo_url && data?.id) {
                    await supabase.from("core_entity_photos").upsert({
                        tenant_id: activeTenantId,
                        entity_id: data.id,
                        room_type: "Geral",
                        url: values.photo_url,
                        is_main: true,
                    }, { onConflict: 'entity_id, url' });
                }

                showSuccess("Produto criado!");
            }

            // Registrar evento de inicialização de estoque para produtos novos
            if (isNew && stock_quantity > 0) {
                await supabase.from("core_entity_events").insert({
                    tenant_id: activeTenantId,
                    entity_id: offeringId,
                    event_type: "stock_change",
                    before: { estoque_loja: 0, estoque_consignado: 0, estoque_total: 0, consignments: [] },
                    after: {
                        estoque_loja: values.has_configurations ? 0 : values.estoque_loja,
                        estoque_consignado: values.has_configurations ? 0 : values.estoque_consignado,
                        estoque_total: stock_quantity,
                        change_qty: stock_quantity,
                        reason: "Cadastro inicial de produto",
                        consignments: values.has_configurations ? [] : productConsignments
                    },
                    actor_user_id: user?.id || null,
                    created_at: new Date().toISOString()
                });
            }

            await qc.invalidateQueries({ queryKey: ["inventory"] });
            nav("/app/inventory");
        } catch (e: any) {
            showError(e.message || "Erro ao salvar");
        } finally {
            setLoading(false);
        }
    }

    const handleDelete = async () => {
        if (!isEdit || !confirm("Deseja realmente excluir este produto?")) return;
        setLoading(true);
        try {
            const { error } = await supabase
                .from("core_entities")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", id!)
                .eq("tenant_id", activeTenantId!);
            if (error) throw error;
            showSuccess("Produto excluído.");
            nav("/app/inventory");
        } catch (e: any) {
            showError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteTemplate = async (templateId: string) => {
        if (!confirm("Remover este template de entrega?")) return;
        try {
            const { error } = await supabase
                .from("deliverable_templates")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", templateId)
                .eq("tenant_id", activeTenantId!);
            if (error) throw error;
            showSuccess("Template removido!");
            qc.invalidateQueries({ queryKey: ["deliverable_templates", activeTenantId, id] });
        } catch (e: any) {
            showError(e.message);
        }
    };

    // Configuration Helpers
    const openConfigModal = (config: ConfigurationItem | null = null) => {
        if (config) {
            setEditingConfig(config);
            setConfigName(config.name);
            setConfigSku(config.internal_code);
            setConfigEstoqueLoja(String(config.estoque_loja));
            setConfigEstoqueConsignado(String(config.estoque_consignado));
            setConfigPrateleira(config.local_prateleira);
            setConfigPriceSale(config.price_sale ? String(config.price_sale) : "");
            setActiveConfigConsignments(config.consignments || []);
        } else {
            setEditingConfig(null);
            setConfigName("");
            setConfigSku("");
            setConfigEstoqueLoja("0");
            setConfigEstoqueConsignado("0");
            setConfigPrateleira("");
            setConfigPriceSale("");
            setActiveConfigConsignments([]);
        }
        setConfigDialogOpen(true);
    };

    const saveConfig = () => {
        if (!configName.trim()) {
            showError("Nome da configuração é obrigatório.");
            return;
        }

        const eLoja = Number(configEstoqueLoja) || 0;
        const eConsignado = Number(configEstoqueConsignado) || 0;
        const total = eLoja + eConsignado;

        const configPayload: ConfigurationItem = {
            id: editingConfig?.id || crypto.randomUUID(),
            name: configName.trim(),
            internal_code: configSku.trim(),
            estoque_loja: eLoja,
            estoque_consignado: eConsignado,
            estoque_total: total,
            local_prateleira: configPrateleira.trim(),
            price_sale: configPriceSale ? Number(configPriceSale) : undefined,
            consignments: activeConfigConsignments
        };

        let updatedConfigs: ConfigurationItem[] = [];
        if (editingConfig) {
            updatedConfigs = configurations.map(c => c.id === editingConfig.id ? configPayload : c);
            showSuccess("Configuração atualizada!");
        } else {
            updatedConfigs = [...configurations, configPayload];
            showSuccess("Configuração adicionada!");
        }

        setConfigurations(updatedConfigs);
        setConfigDialogOpen(false);

        // Se estiver em modo edição, vamos logar a mudança no histórico diretamente (opcional)
        if (isEdit && editingConfig) {
            const diffLoja = eLoja - editingConfig.estoque_loja;
            const diffConsignado = eConsignado - editingConfig.estoque_consignado;
            if (diffLoja !== 0 || diffConsignado !== 0) {
                supabase.from("core_entity_events").insert({
                    tenant_id: activeTenantId,
                    entity_id: id!,
                    event_type: "stock_change",
                    before: {
                        estoque_loja: editingConfig.estoque_loja,
                        estoque_consignado: editingConfig.estoque_consignado,
                        estoque_total: editingConfig.estoque_total,
                        config_id: editingConfig.id,
                        config_name: editingConfig.name,
                        consignments: editingConfig.consignments || []
                    },
                    after: {
                        estoque_loja: eLoja,
                        estoque_consignado: eConsignado,
                        estoque_total: total,
                        config_id: editingConfig.id,
                        config_name: configName,
                        change_qty: diffLoja + diffConsignado,
                        reason: "Ajuste manual da configuração",
                        consignments: activeConfigConsignments
                    },
                    actor_user_id: user?.id || null,
                    created_at: new Date().toISOString()
                }).then(() => stockHistoryQ.refetch());
            }
        }
    };

    const deleteConfig = (configId: string) => {
        if (!confirm("Deseja realmente remover esta variação?")) return;
        setConfigurations(prev => prev.filter(c => c.id !== configId));
        showSuccess("Configuração removida. Lembre-se de salvar o produto para persistir.");
    };

    const hasConfigurations = form.watch("has_configurations");
    const overallTotalStock = useMemo(() => {
        if (hasConfigurations) {
            return configurations.reduce((sum, c) => sum + Number(c.estoque_total || 0), 0);
        }
        return Number(form.watch("estoque_loja") || 0) + Number(form.watch("estoque_consignado") || 0);
    }, [hasConfigurations, configurations, form.watch("estoque_loja"), form.watch("estoque_consignado")]);

    return (
        <AppShell>
            {lockStatus === "checking" && isEdit ? (
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin mb-4" />
                    <p className="font-medium">Sincronizando trava de acesso...</p>
                </div>
            ) : lockStatus === "locked" && isEdit ? (
                <div className="max-w-md mx-auto mt-20 text-center space-y-6">
                    <div className="w-24 h-24 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                        <Lock className="w-12 h-12" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 mb-2">Produto Bloqueado</h2>
                        <p className="text-slate-500">
                            Este produto está sendo editado neste exato momento por <strong className="text-slate-700">{lockedBy?.userName}</strong>.
                        </p>
                    </div>
                    <Button onClick={() => nav("/app/inventory")} variant="outline" className="w-full h-12 rounded-xl">
                        Voltar para o Inventário
                    </Button>
                </div>
            ) : (
                <div className="max-w-4xl mx-auto space-y-6">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border shadow-sm">
                        <div className="flex items-center gap-4">
                            <Button variant="outline" size="icon" type="button" onClick={() => nav("/app/inventory")} className="rounded-xl shrink-0">
                                <ArrowLeft className="w-4 h-4" />
                            </Button>
                            <div>
                                <h1 className="text-2xl font-black text-slate-800">
                                    {isEdit ? "Editar Produto" : "Novo Produto"}
                                </h1>
                                <p className="text-sm text-slate-500">
                                    {isEdit ? `Editando ${itemQ.data?.display_name}` : "Preencha os dados do novo item do inventário."}
                                </p>
                            </div>
                        </div>
                        <TabsList className="bg-slate-100 p-1 rounded-xl shrink-0">
                            <TabsTrigger value="geral" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm px-4">
                                Detalhes Gerais
                            </TabsTrigger>
                            <TabsTrigger value="vendedores" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm px-4">
                                <ClipboardList className="w-4 h-4 mr-2" />
                                Vendedores (Consignado)
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-20">
                            <TabsContent value="geral" className="m-0 focus-visible:outline-none space-y-6">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Sidebar: Image and Pricing */}
                            <div className="lg:col-span-1 space-y-6">
                                <Card className="p-4 rounded-3xl border shadow-sm text-center bg-white">
                                    <FormLabel className="text-xs font-black text-slate-400 uppercase mb-4 block tracking-wider">Foto do Produto</FormLabel>
                                    <div className="aspect-square rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center relative overflow-hidden mb-2 group">
                                        {uploading ? (
                                            <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-6 text-center">
                                                {uploadPhase === "compressing" ? (
                                                    <ImageIcon className="w-8 h-8 text-indigo-500 animate-pulse mb-3" />
                                                ) : (
                                                    <CloudUpload className="w-8 h-8 text-indigo-600 animate-bounce mb-3" />
                                                )}
                                                <div className="w-full bg-slate-100 rounded-full h-2 mb-2 overflow-hidden shadow-inner">
                                                    <div
                                                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-out"
                                                        style={{ width: `${uploadProgress}%` }}
                                                    ></div>
                                                </div>
                                                <p className="text-xs font-bold text-slate-700">
                                                    {uploadPhase === "compressing" ? "Otimizando Imagem..." : "Enviando para Nuvem..."}
                                                </p>
                                                <p className="text-[10px] text-slate-400 mt-1">{uploadProgress}%</p>
                                            </div>
                                        ) : form.watch("photo_url") ? (
                                            <>
                                                <img src={form.watch("photo_url")} className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Button variant="secondary" size="sm" type="button" onClick={() => form.setValue("photo_url", "")}>Substituir imagem</Button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="w-10 h-10 text-slate-300 mb-2 group-hover:text-indigo-400 transition-colors" />
                                                <p className="text-sm font-bold text-slate-600 group-hover:text-indigo-600 transition-colors">Selecionar Foto</p>
                                                <p className="text-[10px] text-slate-400 mt-1 px-4 text-center">A compressão automática garante qualidade sem pesar</p>
                                            </>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                            onChange={handleFileUpload}
                                            disabled={uploading}
                                        />
                                    </div>
                                </Card>

                                <Card className="p-6 rounded-3xl border shadow-sm bg-white">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                                            <Package className="w-4 h-4 text-indigo-600" />
                                            Valores
                                        </h3>
                                        <FormField
                                            control={form.control}
                                            name="price_consult"
                                            render={({ field }) => (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        id="inventoryConsult"
                                                        checked={field.value}
                                                        onChange={field.onChange}
                                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <label htmlFor="inventoryConsult" className="text-[10px] font-bold text-slate-500 uppercase cursor-pointer">Consultar</label>
                                                </div>
                                            )}
                                        />
                                    </div>
                                    <div className="space-y-4">
                                        {!form.watch("price_consult") ? (
                                            <>
                                                <FormField
                                                    control={form.control}
                                                    name="price_sale"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-[10px] font-bold text-slate-400 uppercase">Preço de Venda</FormLabel>
                                                            <FormControl>
                                                                <div className="relative">
                                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">R$</span>
                                                                    <Input type="number" step="0.01" {...field} className="pl-10 h-11 rounded-xl bg-white border-slate-200 font-bold text-indigo-700 focus:ring-indigo-500" />
                                                                </div>
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="price_cost"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-[10px] font-bold text-slate-400 uppercase">Preço de Custo</FormLabel>
                                                            <FormControl>
                                                                <div className="relative">
                                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                                                                    <Input type="number" step="0.01" {...field} className="pl-10 h-11 rounded-xl bg-white border-slate-200" />
                                                                </div>
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </>
                                        ) : (
                                            <div className="py-8 px-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex flex-col items-center justify-center text-center">
                                                <Info className="w-5 h-5 text-indigo-400 mb-2" />
                                                <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Preço sob consulta</p>
                                                <p className="text-[10px] text-indigo-400 mt-1">Os valores estão ocultos para os clientes</p>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            </div>

                            {/* Main Content: Info and Details */}
                            <div className="lg:col-span-2 space-y-6">
                                <Card className="p-6 rounded-3xl border shadow-sm bg-white">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="display_name"
                                            render={({ field }) => (
                                                <FormItem className="md:col-span-2">
                                                    <FormLabel className="text-xs font-black text-slate-400 uppercase tracking-wider">Nome do Produto</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Ex: Cerveja IPA 500ml" {...field} className="h-12 rounded-xl text-lg font-bold border-slate-200" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="subtype"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                                        Categoria
                                                        <Info className="w-3 h-3 cursor-help text-slate-300" />
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Ex: Bebidas" {...field} className="h-11 rounded-xl" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="internal_code"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-black text-slate-400 uppercase tracking-wider">Código Interno (SKU)</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Ex: BEB-001" {...field} className="h-11 rounded-xl font-mono uppercase" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="supplier_id"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-black text-slate-400 uppercase tracking-wider">Fornecedor</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-11 rounded-xl">
                                                                <SelectValue placeholder="Selecione um fornecedor..." />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="rounded-xl">
                                                            <SelectItem value="none" className="rounded-lg">Nenhum fornecedor</SelectItem>
                                                            {suppliersQ.data?.map(s => (
                                                                <SelectItem key={s.id} value={s.id} className="rounded-lg">{s.display_name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="commission_category_id"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-black text-slate-400 uppercase tracking-wider">Categoria de Comissão</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-11 rounded-xl">
                                                                <SelectValue placeholder="Sem flag específica (Usa padrão)" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="rounded-xl">
                                                            <SelectItem value="none" className="rounded-lg">Sem flag específica (Usa padrão)</SelectItem>
                                                            {commissionCategoriesQ.data?.map(s => (
                                                                <SelectItem key={s.id} value={s.id} className="rounded-lg">{s.display_name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="local_prateleira"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-black text-slate-400 uppercase tracking-wider">Local da Prateleira</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Ex: A1-B3" {...field} className="h-11 rounded-xl font-mono" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <div className="md:col-span-2 flex flex-col gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                                            <FormField
                                                control={form.control}
                                                name="allow_out_of_stock_sales"
                                                render={({ field }) => (
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            id="allowOutOfStock"
                                                            checked={field.value}
                                                            onChange={field.onChange}
                                                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        <div>
                                                            <label htmlFor="allowOutOfStock" className="text-xs font-black text-slate-700 uppercase cursor-pointer">Permitir venda sem estoque</label>
                                                            <p className="text-[10px] text-slate-400">Ative para permitir que pedidos sejam fechados mesmo sem saldo em loja.</p>
                                                        </div>
                                                    </div>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="has_configurations"
                                                render={({ field }) => (
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            id="hasConfigurations"
                                                            checked={field.value}
                                                            onChange={field.onChange}
                                                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        <div>
                                                            <label htmlFor="hasConfigurations" className="text-xs font-black text-slate-700 uppercase cursor-pointer">Este produto possui variações/configurações</label>
                                                            <p className="text-[10px] text-slate-400">Controle o estoque e SKU individualmente por variação (ex: tamanho, voltagem, cor).</p>
                                                        </div>
                                                    </div>
                                                )}
                                            />
                                        </div>

                                        <FormField
                                            control={form.control}
                                            name="description"
                                            render={({ field }) => (
                                                <FormItem className="md:col-span-2">
                                                    <FormLabel className="text-xs font-black text-slate-400 uppercase tracking-wider">Descrição Detalhada</FormLabel>
                                                    <FormControl>
                                                        <Textarea placeholder="Informações adicionais sobre o produto..." {...field} className="min-h-[120px] rounded-2xl p-4" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </Card>

                                {/* Stock Levels Section */}
                                {!hasConfigurations ? (
                                    <Card className="p-6 rounded-3xl border shadow-sm bg-white space-y-4">
                                        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                                            <Sliders className="w-4 h-4 text-indigo-600" />
                                            Níveis de Estoque do Produto
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <FormField
                                                control={form.control}
                                                name="estoque_loja"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-[10px] font-bold text-slate-400 uppercase">Estoque na Loja</FormLabel>
                                                        <FormControl>
                                                            <Input type="number" {...field} className="h-11 rounded-xl bg-white border-slate-200 font-mono" />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name="estoque_consignado"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-[10px] font-bold text-slate-400 uppercase">Estoque Consignado</FormLabel>
                                                        <FormControl>
                                                            <Input type="number" {...field} className="h-11 rounded-xl bg-white border-slate-200 font-mono bg-slate-50" disabled />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormItem>
                                                <FormLabel className="text-[10px] font-bold text-slate-400 uppercase">Estoque Total</FormLabel>
                                                <div className="h-11 rounded-xl bg-slate-50 border border-slate-100 flex items-center px-4 font-mono font-bold text-slate-800">
                                                    {overallTotalStock}
                                                </div>
                                            </FormItem>
                                        </div>
                                    </Card>
                                ) : (
                                    <Card className="p-6 rounded-3xl border shadow-sm bg-white space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                                                    <Sliders className="w-4 h-4 text-indigo-600" />
                                                    Configurações / Variações
                                                </h3>
                                                <p className="text-xs text-slate-500">Total geral em estoque: <span className="font-bold">{overallTotalStock}</span></p>
                                            </div>
                                            <Button type="button" size="sm" variant="outline" onClick={() => openConfigModal()} className="rounded-xl h-9">
                                                <Plus className="w-4 h-4 mr-2" /> Nova Variação
                                            </Button>
                                        </div>

                                        <div className="border rounded-2xl overflow-hidden">
                                            <table className="w-full border-collapse text-left text-xs">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500">
                                                        <th className="p-3">Variação</th>
                                                        <th className="p-3">SKU</th>
                                                        <th className="p-3">Local</th>
                                                        <th className="p-3 text-right">Loja</th>
                                                        <th className="p-3 text-right">Consig.</th>
                                                        <th className="p-3 text-right">Total</th>
                                                        <th className="p-3 text-right">Ações</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                                    {configurations.map(c => (
                                                        <tr key={c.id} className="hover:bg-slate-50/50">
                                                            <td className="p-3 font-bold">{c.name}</td>
                                                            <td className="p-3 font-mono">{c.internal_code || "—"}</td>
                                                            <td className="p-3 font-mono">{c.local_prateleira || "—"}</td>
                                                            <td className="p-3 text-right font-mono">{c.estoque_loja}</td>
                                                            <td className="p-3 text-right font-mono">{c.estoque_consignado}</td>
                                                            <td className="p-3 text-right font-mono font-bold text-slate-900">{c.estoque_total}</td>
                                                            <td className="p-3 text-right space-x-1">
                                                                <Button type="button" variant="ghost" size="icon" className="w-7 h-7 rounded-lg" onClick={() => openConfigModal(c)}>
                                                                    <Pencil className="w-3.5 h-3.5" />
                                                                </Button>
                                                                <Button type="button" variant="ghost" size="icon" className="w-7 h-7 text-red-500 rounded-lg hover:text-red-600 hover:bg-red-50" onClick={() => deleteConfig(c.id)}>
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {configurations.length === 0 && (
                                                        <tr>
                                                            <td colSpan={7} className="p-8 text-center text-slate-400 italic">Nenhuma variação cadastrada. Clique em "Nova Variação" para adicionar.</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </Card>
                                )}

                                {/* Stock History Timeline */}
                                {isEdit && (
                                    <Card className="p-6 rounded-3xl border shadow-sm bg-white space-y-4">
                                        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                                            <RefreshCw className="w-4 h-4 text-indigo-600" />
                                            Histórico de Consumo de Estoque
                                        </h3>
                                        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                                            {stockHistoryEvents.map((e: any) => {
                                                const change = Number(e.after?.change_qty || 0);
                                                const isDeduction = change < 0;

                                                return (
                                                    <div key={e.id} className="flex gap-3 border-l-2 border-indigo-100 pl-4 py-1 relative">
                                                        <div className="absolute w-2 h-2 rounded-full bg-indigo-500 -left-[5px] top-2" />
                                                        <div className="flex-1 space-y-1">
                                                            <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                                                                <span className="flex items-center gap-1">
                                                                    <Calendar className="w-3 h-3" />
                                                                    {new Date(e.created_at).toLocaleString("pt-BR")}
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <User className="w-3 h-3" />
                                                                    {e.actor_name}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs font-bold text-slate-800 flex flex-wrap items-center gap-x-2">
                                                                <span>{e.after?.reason || "Ajuste de estoque"}</span>
                                                                {e.after?.config_name && (
                                                                    <Badge variant="secondary" className="px-1.5 py-0 rounded text-[9px] uppercase font-bold">{e.after.config_name}</Badge>
                                                                )}
                                                            </div>
                                                            <div className="text-[11px] text-slate-600 flex items-center gap-3">
                                                                <span className={isDeduction ? "text-red-600 font-bold" : "text-emerald-600 font-bold"}>
                                                                    {isDeduction ? "" : "+"}{change} un
                                                                </span>
                                                                <span>| Saldo Loja: {e.after?.estoque_loja ?? 0}</span>
                                                                <span>| Total: {e.after?.estoque_total ?? 0}</span>
                                                            </div>
                                                            {Array.isArray(e.after?.consignments) && e.after.consignments.length > 0 && (
                                                                <div className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-100 flex flex-wrap items-center gap-1.5 mt-1.5">
                                                                    <span className="font-bold text-slate-600">Distribuição:</span>
                                                                    {e.after.consignments.map((c: any) => (
                                                                        <span key={c.user_id} className="bg-white px-1.5 py-0.5 rounded-md border border-slate-200 shadow-sm shrink-0 font-medium">
                                                                            {c.user_name}: <strong className="text-indigo-600 font-bold">{c.qty} un</strong>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {e.after?.case_id && (
                                                                <Link to={`/app/orders/${e.after.case_id}`} className="text-indigo-600 font-bold hover:underline flex items-center gap-1 mt-1 text-[10px]">
                                                                    Ir para o pedido comercial #{e.after.case_id.slice(0, 8)}
                                                                </Link>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {stockHistoryEvents.length === 0 && (
                                                <p className="text-xs text-slate-400 italic text-center py-6">Nenhuma movimentação registrada.</p>
                                            )}
                                        </div>
                                    </Card>
                                )}



                                {isEdit && (
                                    <Card className="p-6 rounded-3xl border shadow-sm bg-white">
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-indigo-50 p-2 rounded-xl text-indigo-600">
                                                    <ClipboardList className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h3 className="text-base font-bold text-slate-800">Templates de Entregas</h3>
                                                    <p className="text-xs text-slate-500">Etapas padrão de entrega para este produto.</p>
                                                </div>
                                            </div>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="rounded-xl h-9 gap-2"
                                                onClick={() => {
                                                    setEditingTemplate(null);
                                                    setUpsertOpen(true);
                                                }}
                                            >
                                                <Plus className="w-4 h-4" /> Novo Template
                                            </Button>
                                        </div>

                                        <div className="space-y-3">
                                            {Array.isArray(templatesQ.data) && templatesQ.data.map(t => (
                                                <div key={t.id} className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-slate-50/30 group hover:border-indigo-100 hover:bg-white transition-all">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-sm text-slate-700">{t.name}</span>
                                                            {t.required_resource_type && (
                                                                <Badge variant="outline" className="text-[10px] px-1.5 h-4 font-medium border-slate-200 text-slate-500 uppercase">
                                                                    {t.required_resource_type}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                                                            {t.estimated_minutes ? <span>⏱️ {t.estimated_minutes} min</span> : null}
                                                            {t.quantity > 1 ? (
                                                                <>
                                                                    <Separator orientation="vertical" className="h-2 bg-slate-200" />
                                                                    <span>📦 qtd {t.quantity}</span>
                                                                </>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                                            onClick={() => {
                                                                setEditingTemplate(t);
                                                                setUpsertOpen(true);
                                                            }}
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                            onClick={() => handleDeleteTemplate(t.id)}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}

                                            {templatesQ.data?.length === 0 && (
                                                <div className="py-10 text-center rounded-2xl border-2 border-dashed border-slate-100">
                                                    <p className="text-sm text-slate-400 italic">Nenhum template de entrega configurado.</p>
                                                </div>
                                            )}

                                            {templatesQ.isLoading && (
                                                <div className="py-10 flex flex-col items-center gap-2">
                                                    <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                                                    <p className="text-xs text-slate-400">Carregando etapas...</p>
                                                </div>
                                            )}
                                        </div>
                                    </Card>
                                )}
                            </div>
                        </div>
                            </TabsContent>

                            <TabsContent value="vendedores" className="m-0 focus-visible:outline-none space-y-6">
                                <Card className="p-6 rounded-3xl border shadow-sm bg-white space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                                                <ClipboardList className="w-5 h-5 text-indigo-600" />
                                                Gerenciar Estoque Consignado
                                            </h3>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Transfira estoque deste produto (ou variações) para vendedores.
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-wrap md:flex-nowrap gap-3 items-end bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                        {hasConfigurations && (
                                            <div className="flex-1 min-w-[200px] space-y-1.5">
                                                <Label className="text-[10px] font-black text-slate-500 uppercase">Variação *</Label>
                                                <Select value={selectedConfigForConsignment} onValueChange={setSelectedConfigForConsignment}>
                                                    <SelectTrigger className="h-11 rounded-xl bg-white border-slate-200">
                                                        <SelectValue placeholder="Selecione a variação..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="product" disabled>Selecione uma variação...</SelectItem>
                                                        {configurations.map(c => (
                                                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-[200px] space-y-1.5">
                                            <Label className="text-[10px] font-black text-slate-500 uppercase">Vendedor *</Label>
                                            <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
                                                <SelectTrigger className="h-11 rounded-xl bg-white border-slate-200">
                                                    <SelectValue placeholder="Selecione o vendedor..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {(tenantUsersQ.data || []).map(u => (
                                                        <SelectItem key={u.user_id} value={u.user_id}>
                                                            {u.display_name || u.email}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="w-32 space-y-1.5">
                                            <Label className="text-[10px] font-black text-slate-500 uppercase">Qtd *</Label>
                                            <Input
                                                type="number"
                                                min="1"
                                                value={consignmentQty}
                                                onChange={e => setConsignmentQty(e.target.value)}
                                                className="h-11 rounded-xl bg-white border-slate-200 font-mono text-center"
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            onClick={handleAddConsignmentTab}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11 px-6 rounded-xl flex items-center gap-2 shrink-0"
                                        >
                                            <Plus className="w-4 h-4" /> Adicionar
                                        </Button>
                                    </div>

                                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                                        <table className="w-full border-collapse text-left text-sm">
                                            <thead>
                                                <tr className="bg-slate-50/50 border-b border-slate-100 text-xs font-black uppercase text-slate-500 tracking-wider">
                                                    {hasConfigurations && <th className="p-4">Variação</th>}
                                                    <th className="p-4">Vendedor</th>
                                                    <th className="p-4 text-right">Quantidade</th>
                                                    <th className="p-4 text-right w-[100px]">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {!hasConfigurations ? (
                                                    productConsignments.map(item => (
                                                        <tr key={item.user_id} className="border-b border-slate-100 hover:bg-slate-50/40">
                                                            <td className="p-4 font-bold text-slate-800">
                                                                <div className="flex items-center gap-2">
                                                                    <User className="w-4 h-4 text-slate-400" />
                                                                    {item.user_name}
                                                                </div>
                                                            </td>
                                                            <td className="p-4 text-right font-mono font-bold text-indigo-600">{item.qty} un</td>
                                                            <td className="p-4 text-right">
                                                                <Button 
                                                                    type="button" 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                                                    onClick={() => handleRemoveConsignmentTab(item.user_id, "product")}
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    configurations.flatMap(c => 
                                                        (c.consignments || []).map(item => (
                                                            <tr key={`${c.id}-${item.user_id}`} className="border-b border-slate-100 hover:bg-slate-50/40">
                                                                <td className="p-4 font-bold text-slate-800">{c.name}</td>
                                                                <td className="p-4 font-bold text-slate-800">
                                                                    <div className="flex items-center gap-2">
                                                                        <User className="w-4 h-4 text-slate-400" />
                                                                        {item.user_name}
                                                                    </div>
                                                                </td>
                                                                <td className="p-4 text-right font-mono font-bold text-indigo-600">{item.qty} un</td>
                                                                <td className="p-4 text-right">
                                                                    <Button 
                                                                        type="button" 
                                                                        variant="ghost" 
                                                                        size="icon" 
                                                                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                                                        onClick={() => handleRemoveConsignmentTab(item.user_id, c.id)}
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )
                                                )}

                                                {((!hasConfigurations && productConsignments.length === 0) || 
                                                  (hasConfigurations && configurations.every(c => !c.consignments || c.consignments.length === 0))) && (
                                                    <tr>
                                                        <td colSpan={hasConfigurations ? 4 : 3} className="p-8 text-center text-slate-400 italic">
                                                            Nenhuma consignação ativa.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            </TabsContent>

                            {/* Botoes de Salvar agora fora do TabsContent para ficarem visiveis no final da rolagem de ambas as abas */}
                            <div className="flex flex-col sm:flex-row gap-3 mt-8">
                                <Button type="submit" disabled={loading || uploading} className="flex-1 h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 font-black text-lg shadow-xl shadow-indigo-100">
                                    {loading && <Loader2 className="w-5 h-5 animate-spin mr-2" />}
                                    {isEdit ? "Salvar Alterações" : "Criar Produto"}
                                </Button>
                                {isEdit && (
                                    <Button type="button" variant="outline" onClick={handleDelete} className="h-12 rounded-2xl border-red-200 text-red-600 hover:bg-red-50">
                                        <Trash2 className="w-5 h-5 mr-2" />
                                        Excluir
                                    </Button>
                                )}
                            </div>

                        </form>
                    </Form>
                </Tabs>

                {/* Configuration Edit/Create Dialog */}
                <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
                    <DialogContent className="rounded-3xl sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 font-black">
                                <Sliders className="w-5 h-5 text-indigo-600" />
                                {editingConfig ? "Editar Variação" : "Nova Variação"}
                            </DialogTitle>
                            <DialogDescription className="text-xs">
                                Insira os dados específicos para esta configuração do produto.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-xs font-black text-slate-500 uppercase">Nome da Variação *</Label>
                                    <Input
                                        value={configName}
                                        onChange={e => setConfigName(e.target.value)}
                                        placeholder="Ex: Voltagem 110v, Tamanho G, Azul"
                                        className="h-10 rounded-xl"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-black text-slate-500 uppercase">SKU / Código Interno</Label>
                                    <Input
                                        value={configSku}
                                        onChange={e => setConfigSku(e.target.value)}
                                        placeholder="Ex: BEB-001-110"
                                        className="h-10 rounded-xl font-mono uppercase"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-xs font-black text-slate-500 uppercase">Estoque na Loja</Label>
                                    <Input
                                        type="number"
                                        value={configEstoqueLoja}
                                        onChange={e => setConfigEstoqueLoja(e.target.value)}
                                        className="h-10 rounded-xl font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-black text-slate-500 uppercase">Estoque Consignado</Label>
                                    <Input
                                        type="number"
                                        value={configEstoqueConsignado}
                                        className="h-10 rounded-xl font-mono bg-slate-50 w-full"
                                        disabled
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-xs font-black text-slate-500 uppercase">Local da Prateleira</Label>
                                    <Input
                                        value={configPrateleira}
                                        onChange={e => setConfigPrateleira(e.target.value)}
                                        placeholder="Ex: A2-D1"
                                        className="h-10 rounded-xl font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-black text-slate-500 uppercase">Preço Específico (R$)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={configPriceSale}
                                        onChange={e => setConfigPriceSale(e.target.value)}
                                        placeholder="Opcional - ex: 49.90"
                                        className="h-10 rounded-xl font-mono"
                                    />
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="bg-slate-50 p-4 border-t rounded-b-3xl">
                            <Button type="button" variant="ghost" onClick={() => setConfigDialogOpen(false)} className="rounded-xl">
                                Cancelar
                            </Button>
                            <Button type="button" onClick={saveConfig} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6">
                                Salvar
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                

                {isEdit && activeTenantId && (
                    <DeliverableTemplateUpsertDialog
                        open={upsertOpen}
                        onOpenChange={setUpsertOpen}
                        tenantId={activeTenantId}
                        offerings={itemQ.data ? [{
                            id: itemQ.data.id,
                            display_name: itemQ.data.display_name,
                            subtype: itemQ.data.subtype
                        }] : []}
                        initial={editingTemplate}
                        defaultOfferingId={id}
                        onSaved={() => {
                            qc.invalidateQueries({ queryKey: ["deliverable_templates", activeTenantId, id] });
                        }}
                    />
                )}
            </div>
            )}
        </AppShell>
    );
}
