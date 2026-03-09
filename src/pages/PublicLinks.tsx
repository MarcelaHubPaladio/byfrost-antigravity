import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { ExternalLink, Star, Store, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PublicLinks() {
    const { tenantSlug, groupSlug } = useParams();
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [selectedStoreUrl, setSelectedStoreUrl] = useState<string>("");

    const publicDataQ = useQuery({
        queryKey: ["public_link_group", tenantSlug, groupSlug],
        enabled: !!tenantSlug && !!groupSlug,
        queryFn: async () => {
            const { data, error } = await supabase.rpc("get_public_link_group", {
                p_tenant_slug: tenantSlug,
                p_group_slug: groupSlug
            });
            if (error) throw error;
            return data;
        },
        staleTime: 60_000,
    });

    const handleAssessmentClick = (item: any) => {
        setSelectedItem(item);
        setSelectedStoreUrl("");
    };

    const handleRedirect = () => {
        if (selectedStoreUrl) {
            window.location.href = selectedStoreUrl;
        }
    };

    if (publicDataQ.isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
            </div>
        );
    }

    const data = publicDataQ.data;

    if (!data) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
                <h1 className="text-xl font-bold text-slate-900">Perfil não encontrado</h1>
                <p className="mt-2 text-slate-500">O link que você acessou pode estar expirado ou incorreto.</p>
                <Button variant="outline" className="mt-6 rounded-2xl" onClick={() => window.history.back()}>Voltar</Button>
            </div>
        );
    }

    const theme = data.theme_config || {};
    const primaryColor = theme.primary_color || "hsl(var(--byfrost-accent))";

    return (
        <div className="min-h-screen bg-slate-50 bg-gradient-to-b from-white to-slate-100 px-6 py-12 dark:from-slate-950 dark:to-slate-900">
            <div className="mx-auto max-w-[480px]">
                {/* Header */}
                <div className="mb-10 text-center">
                    <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-3xl bg-white shadow-xl ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
                        <span className="text-3xl font-bold" style={{ color: primaryColor }}>
                            {data.name?.slice(0, 1).toUpperCase()}
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{data.name}</h1>
                    {data.description && (
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{data.description}</p>
                    )}
                </div>

                {/* Links */}
                <div className="space-y-4">
                    {data.items?.map((item: any) => (
                        <Card
                            key={item.id}
                            className="group relative overflow-hidden rounded-[24px] border-slate-200 bg-white/80 p-1 shadow-sm transition-all hover:scale-[1.02] hover:shadow-md active:scale-[0.98] dark:border-slate-800 dark:bg-slate-900/80"
                        >
                            <button
                                onClick={() => item.link_type === 'assessment' ? handleAssessmentClick(item) : window.open(item.url, '_blank')}
                                className="flex w-full items-center justify-between px-6 py-5 text-left"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 shadow-inner group-hover:bg-white transition dark:bg-slate-800 dark:group-hover:bg-slate-700">
                                        {item.link_type === 'assessment' ? (
                                            <Star className="h-6 w-6 text-yellow-500" />
                                        ) : (
                                            <ExternalLink className="h-6 w-6 text-slate-400" />
                                        )}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-900 dark:text-white">{item.label}</div>
                                        {item.link_type === 'assessment' && (
                                            <div className="text-[10px] font-medium uppercase tracking-wider text-blue-500">Avaliação Premiada</div>
                                        )}
                                    </div>
                                </div>
                                <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-400" />
                            </button>
                        </Card>
                    ))}
                </div>

                {/* Footer */}
                <div className="mt-16 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">Powered by Byfrost</p>
                </div>
            </div>

            {/* Assessment Dialog */}
            <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
                <DialogContent className="rounded-[32px] sm:max-w-[400px]">
                    <DialogHeader className="items-center text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-blue-600">
                            <Store className="h-8 w-8" />
                        </div>
                        <DialogTitle className="text-xl font-bold">Selecione sua Loja</DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Escolha a unidade onde você realizou sua compra para ser direcionado automaticamente.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-6">
                        <Select onValueChange={setSelectedStoreUrl}>
                            <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-slate-50 px-4 text-slate-700 focus:ring-blue-100">
                                <SelectValue placeholder="Toque para escolher..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-slate-100 shadow-xl">
                                {selectedItem?.redirects?.map((r: any) => (
                                    <SelectItem key={r.store_name} value={r.redirect_url} className="rounded-xl py-3 cursor-pointer">
                                        {r.store_name}
                                    </SelectItem>
                                ))}
                                {(!selectedItem?.redirects || selectedItem.redirects.length === 0) && (
                                    <div className="p-4 text-center text-xs text-slate-400 italic">Nenhuma loja configurada.</div>
                                )}
                            </SelectContent>
                        </Select>

                        <Button
                            className="mt-6 h-14 w-full rounded-2xl bg-blue-600 text-base font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
                            disabled={!selectedStoreUrl}
                            onClick={handleRedirect}
                        >
                            Ir para Avaliação
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
