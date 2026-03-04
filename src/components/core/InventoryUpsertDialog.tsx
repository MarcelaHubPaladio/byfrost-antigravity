import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { showError, showSuccess } from "@/utils/toast";
import { Loader2, Package, Image as ImageIcon, Info } from "lucide-react";

const formSchema = z.object({
    display_name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
    subtype: z.string().optional(),
    description: z.string().optional(),
    photo_url: z.string().url("URL de imagem inválida").or(z.literal("")).optional(),
    internal_code: z.string().optional(),
    stock_quantity: z.coerce.number().min(0, "Estoque não pode ser negativo"),
    price_sale: z.coerce.number().min(0, "Preço não pode ser negativo"),
    price_cost: z.coerce.number().min(0, "Custo não pode ser negativo"),
});

type FormValues = z.infer<typeof formSchema>;

interface InventoryUpsertDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: any | null;
    onSaved: () => void;
}

export function InventoryUpsertDialog({
    open,
    onOpenChange,
    item,
    onSaved,
}: InventoryUpsertDialogProps) {
    const { activeTenantId } = useTenant();
    const [loading, setLoading] = useState(false);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            display_name: "",
            subtype: "",
            description: "",
            photo_url: "",
            internal_code: "",
            stock_quantity: 0,
            price_sale: 0,
            price_cost: 0,
        },
    });

    useEffect(() => {
        if (open) {
            if (item) {
                form.reset({
                    display_name: item.display_name || "",
                    subtype: item.subtype || "",
                    description: item.metadata?.description || "",
                    photo_url: item.metadata?.photo_url || "",
                    internal_code: item.metadata?.internal_code || "",
                    stock_quantity: item.metadata?.stock_quantity || 0,
                    price_sale: item.metadata?.price_sale || 0,
                    price_cost: item.metadata?.price_cost || 0,
                });
            } else {
                form.reset({
                    display_name: "",
                    subtype: "Geral",
                    description: "",
                    photo_url: "",
                    internal_code: "",
                    stock_quantity: 0,
                    price_sale: 0,
                    price_cost: 0,
                });
            }
        }
    }, [open, item, form]);

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

            if (item?.id) {
                const { error } = await supabase
                    .from("core_entities")
                    .update({
                        display_name: values.display_name,
                        subtype: values.subtype,
                        metadata,
                    })
                    .eq("id", item.id)
                    .eq("tenant_id", activeTenantId);

                if (error) throw error;
                showSuccess("Produto atualizado com sucesso!");
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
                showSuccess("Produto cadastrado com sucesso!");
            }

            onSaved();
            onOpenChange(false);
        } catch (e: any) {
            showError(e?.message || "Erro ao salvar produto");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-0 border-none shadow-2xl">
                <DialogHeader className="p-6 bg-slate-50 border-b">
                    <DialogTitle className="flex items-center gap-2 text-xl font-black text-slate-800">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                            <Package className="w-5 h-5" />
                        </div>
                        {item ? "Editar Produto" : "Novo Produto"}
                    </DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="display_name"
                                render={({ field }) => (
                                    <FormItem className="md:col-span-2">
                                        <FormLabel className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nome do Produto</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Ex: Cerveja Artesanal 600ml" {...field} className="h-11 rounded-xl bg-white border-slate-200 focus:ring-indigo-500" />
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
                                        <FormLabel className="text-xs font-bold text-slate-400 uppercase tracking-widest">Categoria / Subtipo</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Ex: Bebidas" {...field} className="h-11 rounded-xl bg-white border-slate-200 focus:ring-indigo-500" />
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
                                            <Input placeholder="Ex: BEB-001" {...field} className="h-11 rounded-xl bg-white border-slate-200 focus:ring-indigo-500" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-bold text-slate-400 uppercase tracking-widest">Descrição</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="Detalhes sobre o produto..."
                                            {...field}
                                            className="min-h-[100px] rounded-xl bg-white border-slate-200 focus:ring-indigo-500"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="photo_url"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-bold text-slate-400 uppercase tracking-widest">Link da Foto (URL)</FormLabel>
                                    <div className="flex gap-2">
                                        <FormControl>
                                            <Input placeholder="https://..." {...field} className="h-11 rounded-xl bg-white border-slate-200 focus:ring-indigo-500" />
                                        </FormControl>
                                        <div className="h-11 w-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden flex-shrink-0 border">
                                            {field.value ? <img src={field.value} className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5" />}
                                        </div>
                                    </div>
                                    <FormDescription className="text-[10px] leading-tight">Insira um link direto para a imagem do produto.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <FormField
                                control={form.control}
                                name="stock_quantity"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estoque Atual</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} className="h-10 rounded-lg bg-white border-slate-200 focus:ring-indigo-500" />
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
                                        <FormLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Preço de Custo</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" {...field} className="h-10 rounded-lg bg-white border-slate-200 focus:ring-indigo-500" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="price_sale"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-indigo-600">Preço de Venda</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" {...field} className="h-10 rounded-lg bg-white border-indigo-200 focus:ring-indigo-500 focus:border-indigo-500" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <DialogFooter className="md:justify-end gap-2 pt-4 border-t">
                            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl font-bold text-slate-500">
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={loading} className="rounded-xl h-11 px-8 font-black bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {item ? "Salvar Alterações" : "Criar Produto"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
