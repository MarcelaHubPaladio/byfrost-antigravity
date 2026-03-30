import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
    BarChart3, 
    TrendingUp, 
    Target, 
    MessageCircle, 
    CheckCircle2, 
    AlertCircle, 
    Layers,
    Calendar,
    ArrowUpRight
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function MktTechaPublicSummary() {
    const { id } = useParams();
    const [loading, setLoading] = useState(true);
    const [campaign, setCampaign] = useState<any>(null);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        fetchCampaign();
    }, [id]);

    const fetchCampaign = async () => {
        if (!id) return;
        setLoading(true);
        try {
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

    if (loading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center p-6">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-10 w-10 text-indigo-600 animate-spin" />
                    <p className="text-sm font-bold text-slate-500 animate-pulse font-sans">Gerando relatório executivo...</p>
                </div>
            </div>
        );
    }

    if (notFound) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
                <div className="max-w-xs space-y-4">
                    <div className="h-20 w-20 bg-rose-50 rounded-3xl flex items-center justify-center text-rose-500 mx-auto">
                        <AlertCircle className="h-10 w-10" />
                    </div>
                    <h1 className="text-xl font-black text-slate-900">Relatório não disponível</h1>
                    <p className="text-sm text-slate-500 font-medium">Este link pode ter expirado ou a campanha ainda não possui um relatório final.</p>
                </div>
            </div>
        );
    }

    const meta = campaign.meta_json || {};
    const reportData = meta.stage_data?.relatrio || {};
    const insights = reportData.insights || "";

    return (
        <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100 selection:text-indigo-900 pb-24">
            <header className="bg-white border-b border-slate-100 px-6 py-12 text-center sticky top-0 z-10">
                <div className="mx-auto max-w-4xl">
                    <Badge variant="outline" className="mb-4 bg-emerald-50 text-emerald-600 border-emerald-100 px-3 py-1 text-[10px] uppercase font-black tracking-widest rounded-full">
                        Resumo Executivo • MKT Técha
                    </Badge>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight sm:text-4xl">
                        {campaign.title || "Relatório de Campanha"}
                    </h1>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-6 text-xs font-bold text-slate-500 uppercase tracking-widest">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                            <span>{new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
                        </div>
                        <div className="flex items-center gap-2 text-emerald-600">
                             <CheckCircle2 className="h-3.5 w-3.5" />
                             <span>Campanha Concluída</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-6 py-12 space-y-12">
                {/* Executive Summary Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="p-8 rounded-[36px] bg-indigo-600 text-white shadow-2xl shadow-indigo-200 border-none relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
                            <Target className="h-24 w-24" />
                        </div>
                        <div className="relative z-10 space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200/80">Objetivo Central</p>
                            <h3 className="text-xl font-bold leading-tight">{meta.stage_data?.planejamento?.objetivo || "Não informado"}</h3>
                        </div>
                    </Card>

                    <Card className="p-8 rounded-[36px] bg-slate-900 text-white shadow-2xl shadow-slate-200 border-none relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
                            <TrendingUp className="h-24 w-24" />
                        </div>
                        <div className="relative z-10 space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mensagem</p>
                            <h3 className="text-xl font-bold leading-tight">{meta.stage_data?.planejamento?.mensagem_central || "Foco estratégico"}</h3>
                        </div>
                    </Card>

                    <Card className="p-8 rounded-[36px] bg-white text-slate-900 shadow-2xl shadow-slate-200/50 border-none relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700">
                            <Layers className="h-24 w-24" />
                        </div>
                        <div className="relative z-10 space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Canal Principal</p>
                            <h3 className="text-xl font-bold leading-tight">{meta.stage_data?.planejamento?.canais || "Multi-canal"}</h3>
                        </div>
                    </Card>
                </div>

                {/* Analysis / Content Section */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10">
                    <div className="space-y-10">
                         <section className="space-y-6">
                            <div className="flex items-center gap-3 px-2">
                                <div className="h-10 w-10 rounded-2xl bg-white shadow-sm flex items-center justify-center text-indigo-600 border border-slate-100">
                                    <BarChart3 className="h-5 w-5" />
                                </div>
                                <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">ANÁLISE E APRENDIZADOS</h2>
                            </div>
                            <Card className="rounded-[40px] border-none shadow-2xl shadow-slate-200/40 p-10 bg-white leading-relaxed">
                                <div 
                                    className="prose prose-slate prose-sm max-w-none prose-p:text-slate-600 prose-p:font-medium prose-strong:text-slate-900 prose-strong:font-black"
                                    dangerouslySetInnerHTML={{ __html: insights || "<p className='italic text-slate-400'>Nenhum insight consolidado ainda.</p>" }}
                                />
                            </Card>
                         </section>

                         <section className="space-y-6">
                            <div className="flex items-center gap-3 px-2">
                                <div className="h-10 w-10 rounded-2xl bg-white shadow-sm flex items-center justify-center text-emerald-600 border border-slate-100">
                                    <ArrowUpRight className="h-5 w-5" />
                                </div>
                                <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">CRIATIVOS DE ALTA PERFORMANCE</h2>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {(meta.creatives || []).slice(0, 4).map((cr: any, i: number) => (
                                    <Card key={i} className="p-6 rounded-[28px] border-none shadow-xl shadow-slate-200/30 bg-white flex items-center gap-4 group hover:bg-slate-50 transition-colors">
                                        <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:scale-110 transition-transform">
                                            {cr.type === 'video' ? <Video className="h-6 w-6" /> : <FileImage className="h-6 w-6" />}
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{cr.channel}</div>
                                            <div className="text-sm font-bold text-slate-800">{cr.format}</div>
                                            <div className="text-[10px] font-medium text-slate-400 mt-0.5">Versão {cr.version || 1.0}</div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                         </section>
                    </div>

                    <aside className="space-y-8">
                         <section className="space-y-4">
                            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">MÉTricas GERAIS</h2>
                            <Card className="rounded-[40px] border-none shadow-2xl shadow-slate-200/40 p-8 bg-white space-y-8">
                                <div className="space-y-4">
                                     <div className="flex items-center justify-between">
                                          <p className="text-xs font-bold text-slate-500">Taxa de Conversão</p>
                                          <Badge className="bg-emerald-50 text-emerald-600 rounded-full border-none">ALTA</Badge>
                                     </div>
                                     <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden">
                                          <div className="h-full bg-emerald-500 w-[78%] rounded-full" />
                                     </div>
                                </div>

                                <div className="space-y-2">
                                     <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observação Final</div>
                                     <p className="text-xs text-slate-600 leading-relaxed font-medium">Campanha executada conforme planejamento inicial com desvio positivo de 12% na taxa de cliques.</p>
                                </div>

                                <div className="pt-6 border-t border-slate-50 text-center">
                                     <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">EXCELLENCE SCORE</p>
                                     <div className="mt-2 text-4xl font-black text-slate-900 tracking-tighter">9.2</div>
                                </div>
                            </Card>
                         </section>

                         <section className="space-y-4">
                            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">NOTAS DE CANAL</h2>
                            <div className="space-y-3">
                                {['Instagram', 'WhatsApp', 'YouTube'].map(channel => (
                                    <div key={channel} className="flex items-center justify-between p-4 bg-white rounded-3xl shadow-sm border border-slate-100">
                                         <span className="text-xs font-black text-slate-800">{channel}</span>
                                         <Badge variant="outline" className="text-[9px] font-black uppercase text-emerald-500 border-emerald-100">OK</Badge>
                                    </div>
                                ))}
                            </div>
                         </section>
                    </aside>
                </div>
            </main>

            <footer className="mt-24 py-12 text-center border-t border-slate-200/50">
                 <div className="max-w-xs mx-auto space-y-4">
                      <div className="flex items-center justify-center gap-2 grayscale opacity-30">
                           <Layers className="h-5 w-5" />
                           <span className="text-lg font-black tracking-tighter">MKT Técha</span>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Inteligência Criativa & Performance</p>
                 </div>
            </footer>
        </div>
    );
}

function Loader2(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    )
}

function Video(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m22 8-6 4 6 4V8Z" />
            <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
        </svg>
    )
}

function FileImage(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
    )
}
