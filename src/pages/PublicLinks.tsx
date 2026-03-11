import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
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
import { Skeleton } from "@/components/ui/skeleton";

export default function PublicLinks() {
    const { tenantSlug, groupSlug } = useParams();
    const [searchParams] = useSearchParams();
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [selectedStoreUrl, setSelectedStoreUrl] = useState<string>("");
    const [autoOpened, setAutoOpened] = useState(false);

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

    useEffect(() => {
        if (publicDataQ.data && !autoOpened) {
            const directItemId = searchParams.get("item");
            if (directItemId) {
                const item = (publicDataQ.data as any).items?.find((i: any) => i.id === directItemId && i.link_type === 'assessment');
                if (item) {
                    setSelectedItem(item);
                    setAutoOpened(true);
                }
            }
        }
    }, [publicDataQ.data, searchParams, autoOpened]);

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
            <div className="min-h-screen bg-slate-50 bg-gradient-to-b from-white to-slate-100 px-6 py-12 dark:from-slate-950 dark:to-slate-900">
                <div className="mx-auto max-w-[480px]">
                    <div className="mb-10 text-center animate-in fade-in duration-500">
                        <Skeleton className="mx-auto mb-4 h-24 w-24 rounded-3xl" />
                        <Skeleton className="mx-auto h-8 w-48 mb-2" />
                        <Skeleton className="mx-auto h-4 w-64" />
                    </div>
                    <div className="space-y-4">
                        {[1, 2, 3, 4].map((i) => (
                            <Card key={i} className="rounded-[24px] border-slate-200 bg-white/80 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <Skeleton className="h-12 w-12 rounded-2xl" />
                                        <div className="space-y-2">
                                            <Skeleton className="h-5 w-32" />
                                            <Skeleton className="h-3 w-20" />
                                        </div>
                                    </div>
                                    <Skeleton className="h-5 w-5" />
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
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
    const palette = theme.palette || {};
    const primaryColor = palette.primary || "#3b82f6";
    const secondaryColor = palette.secondary || "#1e293b";
    const tertiaryColor = palette.tertiary || "#f1f5f9";
    const logoUrl = theme.logo;

    const primaryText = bestTextOnHex(primaryColor);

    function bestTextOnHex(hex: string) {
        if (!hex) return "#0b1220";
        const v = hex.replace("#", "");
        if (v.length !== 6) return "#0b1220";
        const r = parseInt(v.slice(0, 2), 16);
        const g = parseInt(v.slice(2, 4), 16);
        const b = parseInt(v.slice(4, 6), 16);
        const toLin = (c: number) => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        const L = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
        return L > 0.6 ? "#0b1220" : "#fffdf5";
    }

    return (
        <div className="min-h-screen bg-slate-50 bg-gradient-to-b from-white to-slate-100 px-6 py-12 dark:from-slate-950 dark:to-slate-900">
            <div className="mx-auto max-w-[480px]">
                {/* Header */}
                <div className="mb-10 text-center">
                    <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
                        {logoUrl ? (
                            <img src={logoUrl} alt={(data as any).name} className="h-full w-full object-contain p-2" />
                        ) : (
                            <span className="text-3xl font-bold" style={{ color: primaryColor }}>
                                {(data as any).name?.slice(0, 1).toUpperCase()}
                            </span>
                        )}
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{(data as any).name}</h1>
                    {(data as any).description && (
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{(data as any).description}</p>
                    )}
                </div>

                {/* Links */}
                <div className="space-y-4">
                    {(data as any).items?.map((item: any) => (
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
                                        <div className="font-bold text-slate-900 dark:text-white group-hover:opacity-80 transition-opacity">{item.label}</div>
                                        {item.link_type === 'assessment' && (
                                            <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: primaryColor }}>Avaliação Premiada</div>
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

                    <div className="py-6 space-y-4">
                        <div className="grid gap-3">
                            {selectedItem?.redirects?.map((r: any) => (
                                <button
                                    key={r.store_name}
                                    onClick={() => {
                                        setSelectedStoreUrl(r.redirect_url);
                                        window.location.href = r.redirect_url;
                                    }}
                                    className={cn(
                                        "flex items-center gap-4 rounded-[24px] border p-4 text-left transition-all active:scale-[0.98]",
                                        selectedStoreUrl === r.redirect_url
                                            ? "ring-2"
                                            : "border-slate-100 bg-slate-50 hover:bg-white hover:shadow-md"
                                    )}
                                    style={selectedStoreUrl === r.redirect_url ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10`, boxShadow: `0 0 0 2px ${primaryColor}` } : {}}
                                >
                                    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-inner">
                                        {r.image_url ? (
                                            <img src={r.image_url} alt={r.store_name} className="h-full w-full object-cover" />
                                        ) : (
                                            <Store className="h-8 w-8 text-slate-300" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-bold text-slate-900">{r.store_name}</div>
                                        {r.address && (
                                            <div className="mt-0.5 text-xs text-slate-500 line-clamp-2">{r.address}</div>
                                        )}
                                    </div>
                                </button>
                            ))}
                            {(!selectedItem?.redirects || selectedItem.redirects.length === 0) && (
                                <div className="p-4 text-center text-xs text-slate-400 italic">Nenhuma loja configurada.</div>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
