import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import imageCompression from "browser-image-compression";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Loader2, Package, Image as ImageIcon, Upload, Trash2, Info, CloudUpload } from "lucide-react";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit REMOVED from original, handled by compression.

const formSchema = z.object({
    display_name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
    subtype: z.string().optional(),
    description: z.string().optional(),
    photo_url: z.string().optional(),
    internal_code: z.string().optional(),
    stock_quantity: z.coerce.number().min(0, "Estoque não pode ser negativo"),
    price_sale: z.coerce.number().min(0, "Preço não pode ser negativo"),
    price_cost: z.coerce.number().min(0, "Custo não pode ser negativo"),
});

type FormValues = z.infer<typeof formSchema>;

export default function InventoryDetail() {
    const { id } = useParams();
    const nav = useNavigate();
    const qc = useQueryClient();
    const { activeTenantId } = useTenant();
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadPhase, setUploadPhase] = useState<"compressing" | "uploading" | "idle">("idle");
    const isEdit = Boolean(id && id !== "new");

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

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            display_name: "",
            subtype: "Geral",
            description: "",
            photo_url: "",
            internal_code: "",
            stock_quantity: 0,
            price_sale: 0,
            price_cost: 0,
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
                stock_quantity: itemQ.data.metadata?.stock_quantity || 0,
                price_sale: itemQ.data.metadata?.price_sale || 0,
                price_cost: itemQ.data.metadata?.price_cost || 0,
            });
        }
    }, [itemQ.data, form]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeTenantId) return;

        setUploading(true);
        setUploadProgress(0);
        setUploadPhase("compressing");

        try {
            // Simulated progress for compression
            const compInterval = setInterval(() => {
                setUploadProgress(p => p >= 30 ? 30 : p + 5);
            }, 200);

            const options = {
                maxSizeMB: 1, // Compress to max 1MB
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

            // Simulated quick progress for the actual network upload since it's < 1MB
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
            const metadata = {
                description: values.description,
                photo_url: values.photo_url,
                internal_code: values.internal_code,
                stock_quantity: values.stock_quantity,
                price_sale: values.price_sale,
                price_cost: values.price_cost,
            };

            if (isEdit) {
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
                showSuccess("Produto atualizado!");
            } else {
                const { error } = await supabase.from("core_entities").insert({
                    tenant_id: activeTenantId,
                    entity_type: "offering",
                    subtype: values.subtype,
                    display_name: values.display_name,
                    status: "active",
                    metadata,
                });
                if (error) throw error;
                showSuccess("Produto criado!");
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

    return (
        <AppShell>
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => nav("/app/inventory")} className="rounded-xl">
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

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-20">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Sidebar: Image and Pricing */}
                            <div className="lg:col-span-1 space-y-6">
                                <Card className="p-4 rounded-3xl border-slate-200 overflow-hidden text-center">
                                    <FormLabel className="text-xs font-bold text-slate-400 uppercase mb-4 block">Foto do Produto</FormLabel>
                                    <div className="aspect-square rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center relative overflow-hidden mb-4 group">
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

                                <Card className="p-6 rounded-3xl border-slate-200 bg-indigo-50/30">
                                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                                        <Package className="w-4 h-4 text-indigo-600" />
                                        Valores e Estoque
                                    </h3>
                                    <div className="space-y-4">
                                        <FormField
                                            control={form.control}
                                            name="price_sale"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[10px] font-bold text-slate-400 uppercase">Preço de Venda</FormLabel>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">R$</span>
                                                            <Input type="number" step="0.01" {...field} className="pl-10 h-11 rounded-xl bg-white border-indigo-200 focus:ring-indigo-500 font-bold text-indigo-700" />
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
                                        <FormField
                                            control={form.control}
                                            name="stock_quantity"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[10px] font-bold text-slate-400 uppercase">Estoque Atual</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" {...field} className="h-11 rounded-xl bg-white border-slate-200 font-mono" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </Card>
                            </div>

                            {/* Main Content: Info and Details */}
                            <div className="lg:col-span-2 space-y-6">
                                <Card className="p-6 rounded-3xl border-slate-200">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="display_name"
                                            render={({ field }) => (
                                                <FormItem className="md:col-span-2">
                                                    <FormLabel className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nome do Produto</FormLabel>
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
                                                    <FormLabel className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
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
                                                    <FormLabel className="text-xs font-bold text-slate-400 uppercase tracking-widest">Código Interno (SKU)</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Ex: BEB-001" {...field} className="h-11 rounded-xl font-mono uppercase" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="description"
                                            render={({ field }) => (
                                                <FormItem className="md:col-span-2">
                                                    <FormLabel className="text-xs font-bold text-slate-400 uppercase tracking-widest">Descrição Detalhada</FormLabel>
                                                    <FormControl>
                                                        <Textarea placeholder="Informações adicionais sobre o produto..." {...field} className="min-h-[150px] rounded-2xl p-4" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </Card>

                                <div className="flex flex-col sm:flex-row gap-3">
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
                            </div>
                        </div>
                    </form>
                </Form>
            </div>
        </AppShell>
    );
}
