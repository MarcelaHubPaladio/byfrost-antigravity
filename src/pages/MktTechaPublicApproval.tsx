import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
    CheckCircle2, 
    Loader2, 
    AlertCircle, 
    Instagram, 
    Youtube, 
    Layers,
    FileImage,
    Video,
    Smartphone
} from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { cn } from "@/lib/utils";

export default function MktTechaPublicApproval() {
    const { id } = useParams();
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState<string | null>(null);
    const [campaign, setCampaign] = useState<any>(null);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        fetchCampaign();
    }, [id]);

    const fetchCampaign = async () => {
        if (!id) return;
        setLoading(true);
        try {
            // We use the RPC defined in our SQL to fetch by token/ID
            const { data, error } = await supabase.rpc("get_public_mkt_techa_case", { p_token: id });
            
            if (error || !data || data.length === 0) {
                setNotFound(true);
            } else {
                setCampaign(data[0]);
            }
        } catch (e) {
            setNotFound(true);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (creativeId: string) => {
        if (!id) return;
        setActing(creativeId);
        try {
            const { data, error } = await supabase.rpc("approve_mkt_techa_creative", { 
                p_token: id, 
                p_creative_id: creativeId 
            });
            if (error || !data) {
                showError("Não foi possível aprovar este criativo agora.");
            } else {
                showSuccess("Criativo aprovado! ✅");
                fetchCampaign(); // Refresh to show approved state
            }
        } catch (e) {
            showError("Falha na aprovação.");
        } finally {
            setActing(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center animate-pulse">
                        <Layers className="h-6 w-6 text-indigo-400" />
                    </div>
                    <p className="text-sm font-bold text-slate-400 animate-pulse">Carregando criativos...</p>
                </div>
            </div>
        );
    }

    if (notFound) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
                <div className="max-w-xs space-y-4">
                    <div className="h-20 w-20 bg-rose-500/10 rounded-3xl flex items-center justify-center text-rose-500 mx-auto">
                        <AlertCircle className="h-10 w-10" />
                    </div>
                    <h1 className="text-xl font-black text-white">Link não encontrado</h1>
                    <p className="text-sm text-slate-400 leading-relaxed font-medium">O link da campanha pode estar incorreto ou não estar mais disponível.</p>
                </div>
            </div>
        );
    }

    const creatives = (campaign.meta_json?.creatives || []) as any[];
    const approvedCount = creatives.filter(c => c.status === 'approved').length;

    return (
        <div className="min-h-screen bg-slate-950 pb-24 font-sans selection:bg-indigo-500/30">
            <header className="bg-slate-950/50 backdrop-blur-xl border-b border-white/5 px-6 py-10 text-center sticky top-0 z-20 shadow-2xl">
                <div className="mx-auto max-w-4xl">
                    <Badge variant="outline" className="mb-4 bg-indigo-500/10 text-indigo-400 border-indigo-500/20 px-3 py-1 text-[10px] uppercase font-black tracking-widest rounded-full">
                        Portal de Aprovação • MKT Técha
                    </Badge>
                    <h1 className="text-3xl font-black text-white tracking-tight sm:text-4xl">
                        {campaign.title || "Campanha Digital"}
                    </h1>
                    <div className="mt-4 flex items-center justify-center gap-4 text-xs font-bold text-slate-400">
                        <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            <span>{approvedCount} de {creatives.length} aprovados</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-6 py-12">
                {creatives.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {creatives.map((cr: any) => (
                            <Card 
                                key={cr.id} 
                                className={cn(
                                    "border-none bg-slate-900 shadow-2xl rounded-[32px] overflow-hidden transition-all duration-500 hover:scale-[1.02]",
                                    cr.status === 'approved' ? "ring-2 ring-emerald-500/50" : "ring-1 ring-white/5"
                                )}
                            >
                                <div className="aspect-[4/5] bg-slate-800 relative group overflow-hidden">
                                    {/* Placeholder for creative asset */}
                                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-800 to-slate-900">
                                        {cr.type === 'video' ? <Video className="h-12 w-12 text-slate-600 mb-4" /> : <FileImage className="h-12 w-12 text-slate-600 mb-4" />}
                                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{cr.type}</p>
                                        <p className="text-[10px] text-slate-600 mt-2 font-medium">{cr.format}</p>
                                    </div>
                                    
                                    {/* Overlay for approved items */}
                                    {cr.status === 'approved' && (
                                        <div className="absolute inset-0 bg-emerald-500/10 backdrop-blur-[2px] flex items-center justify-center">
                                            <div className="bg-emerald-500 text-white rounded-full p-4 shadow-2xl shadow-emerald-500/50 scale-125 animate-in zoom-in duration-300">
                                                <CheckCircle2 className="h-8 w-8" />
                                            </div>
                                        </div>
                                    )}

                                    <div className="absolute top-4 left-4">
                                        <Badge className="bg-slate-950/80 backdrop-blur rounded-full px-2.5 py-1 flex items-center gap-1.5 border-none shadow-xl">
                                            {cr.channel === 'Instagram' && <Instagram className="h-3 w-3 text-pink-500" />}
                                            {cr.channel === 'TikTok' && <Smartphone className="h-3 w-3 text-white" />}
                                            {cr.channel === 'YouTube' && <Youtube className="h-3 w-3 text-red-500" />}
                                            <span className="text-[9px] font-black uppercase text-slate-200">{cr.channel}</span>
                                        </Badge>
                                    </div>
                                </div>

                                <div className="p-6 space-y-6">
                                    <div className="space-y-1">
                                        <h3 className="text-base font-black text-white">{cr.type.toUpperCase()} - {cr.format}</h3>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Versão {cr.version || 1.0}</p>
                                    </div>

                                    <div className="space-y-3 pt-4 border-t border-white/5">
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Checklist de Produção</div>
                                        <div className="grid gap-2">
                                            {cr.subtasks?.map((st: any) => (
                                                <div key={st.id} className="flex items-center gap-2">
                                                    <div className={cn(
                                                        "h-4 w-4 rounded-full flex items-center justify-center shrink-0 border",
                                                        st.done ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-500" : "border-slate-700 bg-slate-800"
                                                    )}>
                                                        {st.done && <CheckCircle2 className="h-2.5 w-2.5" />}
                                                    </div>
                                                    <span className={cn("text-[11px] font-medium transition-colors", st.done ? "text-emerald-400/70" : "text-slate-400")}>
                                                        {st.label}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {!cr.status || cr.status !== 'approved' ? (
                                        <Button 
                                            onClick={() => handleApprove(cr.id)}
                                            disabled={acting === cr.id}
                                            className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs shadow-xl shadow-emerald-500/20 transition-all active:scale-95 gap-3 mt-4"
                                        >
                                            {acting === cr.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                                            APROVAR CRIATIVO ✅
                                        </Button>
                                    ) : (
                                        <div className="w-full h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center gap-3 mt-4">
                                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                            <span className="text-[10px] font-black text-emerald-500 uppercase">PEÇA APROVADA</span>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-24 space-y-4">
                        <Layers className="h-12 w-12 text-slate-800 mx-auto" />
                        <p className="text-slate-500 font-medium italic">Nenhum criativo disponível para aprovação no momento.</p>
                    </div>
                )}
            </main>

            <footer className="mt-24 border-t border-white/5 py-12 text-center">
                <div className="mx-auto max-w-2xl px-6 space-y-6">
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-relaxed">
                        Ao aprovar os criativos, você autoriza a distribuição imediata nos canais vinculados.
                    </p>
                    <div className="flex items-center justify-center gap-6 pt-4">
                         <div className="text-[10px] font-bold text-slate-700 uppercase tracking-[0.3em]">Powered by MKT Técha</div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
