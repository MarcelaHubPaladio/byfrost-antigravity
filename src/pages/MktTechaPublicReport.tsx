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
    Smartphone,
    Calendar,
    Target,
    Rocket,
    FileText,
    Check,
    Download,
    ExternalLink,
    ArrowRight,
    Lock,
    Paperclip,
    BarChart3,
    TrendingUp,
    TrendingDown,
    Zap,
    Users,
    MousePointer2,
    Share2,
    ArrowUpRight,
    DollarSign,
    ShoppingCart,
    MessageCircle as LucideMessageCircle
} from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PublicPortalShell, type PublicPalette } from "@/components/public/PublicPortalShell";

export default function MktTechaPublicReport() {
    const { id } = useParams();
    
    const [loading, setLoading] = useState(true);
    const [campaign, setCampaign] = useState<any>(null);
    const [tenant, setTenant] = useState<any>(null);
    const [notFound, setNotFound] = useState(false);
    
    // Auth state for access code
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [pin, setPin] = useState("");
    const [pinError, setPinError] = useState(false);

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
                const campaignData = data[0];
                setCampaign(campaignData);
                
                if (!campaignData.meta_json?.share_access_code) {
                    setIsAuthorized(true);
                }

                if (campaignData.tenant_id) {
                    const { data: tData } = await supabase
                        .from("tenants")
                        .select("id, name, branding_json")
                        .eq("id", campaignData.tenant_id)
                        .maybeSingle();
                    if (tData) setTenant(tData);
                }
            }
        } catch (e) {
            setNotFound(true);
        } finally {
            setLoading(false);
        }
    };

    const handlePinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const correctPin = campaign?.meta_json?.share_access_code;
        if (pin === correctPin) {
            setIsAuthorized(true);
            setPinError(false);
            showSuccess("Relatório liberado!");
        } else {
            setPinError(true);
            setPin("");
            showError("Código de acesso incorreto.");
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center animate-pulse">
                        <BarChart3 className="h-6 w-6 text-indigo-400" />
                    </div>
                    <p className="text-sm font-bold text-slate-400 animate-pulse">Consolidando resultados...</p>
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
                    <h1 className="text-xl font-black text-white">Relatório não encontrado</h1>
                    <p className="text-sm text-slate-400 leading-relaxed font-medium">O link do dashboard pode estar incorreto ou não estar disponível.</p>
                </div>
            </div>
        );
    }

    const meta = campaign.meta_json || {};
    const creatives = (meta.creatives || []) as any[];
    const approvedCreatives = creatives.filter(c => c.status === 'approved');
    
    // Aggregates
    const creativeTotals = approvedCreatives.reduce((acc, curr) => {
        const m = curr.metrics || {};
        return {
            views: acc.views + (Number(m.views) || 0),
            likes: acc.likes + (Number(m.likes) || 0),
            comments: acc.comments + (Number(m.comments) || 0),
            shares: acc.shares + (Number(m.shares) || 0),
            clicks: acc.clicks + (Number(m.clicks) || 0),
            sales_count: acc.sales_count + (Number(m.sales_count) || 0),
            sales_amount: acc.sales_amount + (Number(m.sales_amount) || 0),
            spend: acc.spend + (Number(m.spend) || 0)
        };
    }, { views: 0, likes: 0, comments: 0, shares: 0, clicks: 0, sales_count: 0, sales_amount: 0, spend: 0 });

    const analiseData = meta.stage_data?.analise || {};
    const auditedSalesCount = Number(analiseData.erp_sales_count) || 0;
    const auditedSalesAmount = Number(analiseData.erp_sales_amount) || 0;
    const auditedLeadsCount = Number(analiseData.crm_leads_count) || 0;

    const totals = {
        ...creativeTotals,
        sales_count: auditedSalesCount > 0 ? auditedSalesCount : creativeTotals.sales_count,
        sales_amount: auditedSalesAmount > 0 ? auditedSalesAmount : creativeTotals.sales_amount,
        leads_count: auditedLeadsCount
    };

    const palette = tenant?.branding_json?.palette as PublicPalette;
    const rawPrimary = (palette as any)?.primary;
    const primaryColor = (typeof rawPrimary === 'string' ? rawPrimary : rawPrimary?.hex) || "#4f46e5";
    const primaryText = palette?.primary?.text || "#ffffff";

    if (campaign && !isAuthorized) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
                <Card className="w-full max-w-sm rounded-[40px] bg-slate-900 border-none shadow-2xl p-8 ring-1 ring-white/5 space-y-8 animate-in fade-in zoom-in duration-500">
                    <div className="text-center space-y-2">
                        <div className="h-16 w-16 bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-4 ring-1 ring-white/10">
                            <Lock className="h-8 w-8 text-indigo-500" />
                        </div>
                        <h1 className="text-xl font-black text-white uppercase tracking-tight">Relatório Executivo</h1>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed">Insira o código de segurança da campanha para visualizar o dashboard de performance.</p>
                    </div>

                    <form onSubmit={handlePinSubmit} className="space-y-6">
                        <div className="flex justify-center gap-3">
                            <input 
                                type="text"
                                maxLength={4}
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                                placeholder="----"
                                autoFocus
                                className={cn(
                                    "w-full h-16 bg-slate-800 border-none rounded-2xl text-center text-3xl font-black tracking-[0.5em] text-white focus:ring-2 focus:ring-indigo-500 transition-all",
                                    pinError && "ring-2 ring-rose-500"
                                )}
                            />
                        </div>
                        <Button 
                            type="submit"
                            style={{ backgroundColor: primaryColor, color: primaryText }}
                            className="w-full h-14 rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all"
                        >
                            VER RESULTADOS
                        </Button>
                    </form>
                    
                    {tenant?.name && (
                        <p className="text-center text-[10px] font-bold text-slate-700 uppercase tracking-widest pt-4 border-t border-white/5">{tenant.name}</p>
                    )}
                </Card>
            </div>
        );
    }

    return (
        <PublicPortalShell palette={{ ...palette, primary: { hex: primaryColor, text: primaryText } }}>
            <div className="min-h-screen bg-black pb-24 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
                {/* Background effects */}
                <div className="fixed inset-0 overflow-hidden pointer-events-none">
                    <div 
                        className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full blur-[120px] opacity-20"
                        style={{ backgroundColor: primaryColor }}
                    />
                    <div 
                        className="absolute bottom-[10%] -right-[10%] w-[30%] h-[30%] rounded-full blur-[120px] opacity-10"
                        style={{ backgroundColor: primaryColor }}
                    />
                </div>

                <header className="relative z-10 px-4 sm:px-6 pt-12 pb-8 w-full max-w-[1600px] mx-auto">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4">
                        <div className="space-y-4">
                            <Badge 
                                variant="outline" 
                                className="bg-white/5 border-white/10 text-white/60 px-4 py-1.5 text-[10px] uppercase font-black tracking-widest rounded-full"
                            >
                                Relatório de Performance • MKT Técha
                            </Badge>
                            <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight leading-none">
                                {campaign.title || "Dash de Resultados"}
                            </h1>
                            <div className="flex items-center gap-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> Concluído em {meta.stage_data?.analise?.completed_at ? format(new Date(meta.stage_data.analise.completed_at), "dd MMM yyyy", { locale: ptBR }) : "Recente"}</span>
                                <span className="w-1 h-1 rounded-full bg-slate-800" />
                                <span className="text-indigo-400">{approvedCreatives.length} Materiais Analisados</span>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                             <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white p-3">
                                <Share2 className="h-6 w-6" />
                             </div>
                             <div className="px-6 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center gap-4">
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-500 uppercase">Status</p>
                                    <p className="text-xs font-black text-emerald-500 uppercase">Dashboard Ativo</p>
                                </div>
                                <div className="h-8 w-px bg-white/10" />
                                <TrendingUp className="h-5 w-5 text-emerald-500" />
                             </div>
                        </div>
                    </div>
                </header>

                <main className="relative z-10 mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-6 space-y-12">
                    {/* Global Stats Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6">
                        {[
                            { label: 'Alcance Global', value: totals.views.toLocaleString(), sub: 'Impressões Totais', icon: <Users />, color: 'indigo' },
                            { label: 'Engajamento', value: (totals.likes + totals.comments).toLocaleString(), sub: 'Interações', icon: <Zap />, color: 'rose' },
                            { label: 'Investimento', value: `R$ ${totals.spend.toLocaleString()}`, sub: 'Verba Utilizada', icon: <DollarSign />, color: 'slate' },
                            { label: 'Clique / CTA', value: totals.clicks.toLocaleString(), sub: 'Acessos Diretos', icon: <MousePointer2 />, color: 'emerald' },
                            { label: 'Volume Vendas', value: `R$ ${totals.sales_amount.toLocaleString()}`, sub: `${totals.sales_count} Conversões ${totals.leads_count > 0 ? `• ${totals.leads_count} Leads` : ''}`, icon: <ShoppingCart />, color: 'amber' },
                        ].map((stat, i) => (
                            <Card key={i} className="p-8 rounded-[40px] bg-white/5 border-white/5 backdrop-blur-xl shadow-2xl space-y-6 group hover:bg-white/[0.08] transition-all duration-500 hover:-translate-y-1">
                                <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 duration-500", 
                                    stat.color === 'indigo' && "bg-indigo-500/10 text-indigo-400",
                                    stat.color === 'rose' && "bg-rose-500/10 text-rose-400",
                                    stat.color === 'emerald' && "bg-emerald-500/10 text-emerald-400",
                                    stat.color === 'amber' && "bg-amber-500/10 text-amber-400",
                                )}>
                                    {stat.icon}
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</p>
                                    <h3 className="text-2xl md:text-3xl font-black text-white">{stat.value}</h3>
                                    <p className="text-[10px] font-bold text-slate-600">{stat.sub}</p>
                                </div>
                            </Card>
                        ))}
                    </div>

                    {/* Sales Performance & Evidence */}
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8">
                        <section className="space-y-6">
                            <div className="flex items-center gap-3 px-2">
                                <div className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center text-indigo-400 border border-white/10">
                                    <Target className="h-5 w-5" />
                                </div>
                                <h2 className="text-xs font-black text-white uppercase tracking-[0.2em]">Destaques de Performance</h2>
                            </div>
                            <Card className="rounded-[40px] border-none bg-white/5 backdrop-blur-xl shadow-2xl p-10 ring-1 ring-white/5 leading-relaxed overflow-hidden relative group">
                                <div 
                                    className="absolute -right-20 -bottom-20 w-64 h-64 blur-[120px] opacity-10 pointer-events-none transition-all duration-1000 group-hover:opacity-20"
                                    style={{ backgroundColor: primaryColor }}
                                />
                                <div className="relative z-10 space-y-6">
                                    <div className="p-8 rounded-[32px] bg-black/40 border border-white/5 space-y-4">
                                        <p className="text-lg font-medium text-slate-300 leading-relaxed italic">
                                            {meta.stage_data?.analise?.sales_highlights || "Os resultados superaram as expectativas iniciais, com destaque para a conversão direta via stories."}
                                        </p>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        <div className="p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-4">
                                            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                                                <TrendingUp className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1.5">Eficiência</p>
                                                <p className="text-sm font-black text-white uppercase">{Math.round(totals.sales_count / (approvedCreatives.length || 1) * 100) / 100} vendas/peça</p>
                                            </div>
                                        </div>
                                        {totals.leads_count > 0 && (
                                            <div className="p-6 rounded-3xl bg-amber-500/5 border border-amber-500/10 flex items-center gap-4">
                                                <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                                                    <Users className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1.5">Geração de Leads</p>
                                                    <p className="text-sm font-black text-white uppercase">{totals.leads_count} Novos Leads</p>
                                                </div>
                                            </div>
                                        )}
                                        <div className="p-6 rounded-3xl bg-indigo-500/5 border border-indigo-500/10 flex items-center gap-4">
                                            <div className="h-10 w-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                                                <Zap className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1.5">Impacto</p>
                                                <p className="text-sm font-black text-white uppercase">{Math.round(totals.views / (approvedCreatives.length || 1))} views/peça</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </section>

                        <section className="space-y-6">
                            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-2">EVIDÊNCIAS E RELATÓRIOS</h2>
                            <Card className="rounded-[40px] border-none bg-white/5 backdrop-blur-xl shadow-2xl p-8 ring-1 ring-white/5 space-y-6">
                                <div className="space-y-4">
                                    {/* ERP Evidence */}
                                    <div className="space-y-3">
                                        <div className="text-[10px] font-black text-slate-500 uppercase px-1">Relatórios ERP / Faturamento</div>
                                        {(meta.stage_data?.analise?.evidences?.erp_evidence || []).map((f: any, i: number) => (
                                            <a key={i} href={f.url} target="_blank" className="flex items-center justify-between p-4 bg-white/5 rounded-2xl group hover:bg-white/10 transition-all border border-white/5">
                                                <div className="flex items-center gap-3">
                                                    <Paperclip className="h-4 w-4 text-emerald-400" />
                                                    <span className="text-[11px] font-bold text-slate-300 truncate max-w-[200px]">{f.name}</span>
                                                </div>
                                                <Download className="h-3.5 w-3.5 text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" />
                                            </a>
                                        ))}
                                        {(!meta.stage_data?.analise?.evidences?.erp_evidence?.length) && <p className="text-[10px] text-slate-600 px-1 italic">Nenhuma evidência ERP disponível.</p>}
                                    </div>

                                    {/* CRM Evidence */}
                                    <div className="space-y-3">
                                        <div className="text-[10px] font-black text-slate-500 uppercase px-1">Relatórios CRM / Leads</div>
                                        {(meta.stage_data?.analise?.evidences?.crm_evidence || []).map((f: any, i: number) => (
                                            <a key={i} href={f.url} target="_blank" className="flex items-center justify-between p-4 bg-white/5 rounded-2xl group hover:bg-white/10 transition-all border border-white/5">
                                                <div className="flex items-center gap-3">
                                                    <Paperclip className="h-4 w-4 text-indigo-400" />
                                                    <span className="text-[11px] font-bold text-slate-300 truncate max-w-[200px]">{f.name}</span>
                                                </div>
                                                <Download className="h-3.5 w-3.5 text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" />
                                            </a>
                                        ))}
                                        {(!meta.stage_data?.analise?.evidences?.crm_evidence?.length) && <p className="text-[10px] text-slate-600 px-1 italic">Nenhuma evidência CRM disponível.</p>}
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-white/5">
                                    <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest leading-relaxed text-center px-4">
                                        Dados auditados e consolidados conforme o período de ativação.
                                    </p>
                                </div>
                            </Card>
                        </section>
                    </div>

                    {/* Per-Creative Detailed Breakdown */}
                    <section className="space-y-6">
                        <div className="flex items-center justify-between px-2">
                             <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center text-rose-400 border border-white/10">
                                    <Rocket className="h-5 w-5" />
                                </div>
                                <h2 className="text-xs font-black text-white uppercase tracking-[0.2em]">Desempenho por Ativo</h2>
                            </div>
                            <Badge variant="secondary" className="bg-white/5 text-slate-400 border-none rounded-full px-4">{approvedCreatives.length} Peças</Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {approvedCreatives.map((cr: any) => (
                                <Card key={cr.id} className="p-8 rounded-[40px] bg-white/5 border-white/5 backdrop-blur-xl shadow-2xl space-y-6 group hover:bg-white/10 transition-all duration-500">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="h-14 w-14 rounded-2xl bg-black/40 flex items-center justify-center relative group-hover:scale-105 transition-transform">
                                                {cr.channel === 'Instagram' && <Instagram className="h-6 w-6 text-pink-500" />}
                                                {cr.channel === 'TikTok' && <Smartphone className="h-6 w-6 text-white" />}
                                                {cr.channel === 'YouTube' && <Youtube className="h-6 w-6 text-red-500" />}
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-black text-white leading-none mb-2">{cr.channel}</h3>
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{cr.type} • {cr.format}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                             <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{Math.round((cr.metrics?.views || 0) / (totals.views || 1) * 100)}% do Alcance</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-600 uppercase">Visibilidade</p>
                                            <div className="flex items-center gap-1.5">
                                                <Users className="h-3 w-3 text-emerald-400" />
                                                <p className="text-sm font-black text-white">{cr.metrics?.views || 0}</p>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-600 uppercase">Engajamento</p>
                                            <div className="flex items-center gap-1.5">
                                                <CheckCircle2 className="h-3 w-3 text-rose-400" />
                                                <p className="text-sm font-black text-white">{(cr.metrics?.likes || 0) + (cr.metrics?.comments || 0)}</p>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-600 uppercase">Vendas</p>
                                            <div className="flex items-center gap-1.5">
                                                <DollarSign className="h-3 w-3 text-amber-400" />
                                                <p className="text-sm font-black text-white">{cr.metrics?.sales_count || 0}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {cr.metrics?.qualitative_feedback && (
                                        <div className="p-5 rounded-3xl bg-black/20 border border-white/5 space-y-2">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1"><LucideMessageCircle className="h-3 w-3" /> Análise Técnica</p>
                                            <div 
                                                className="text-[11px] text-slate-400 leading-relaxed font-medium prose prose-invert prose-sm"
                                                dangerouslySetInnerHTML={{ __html: cr.metrics.qualitative_feedback }}
                                            />
                                        </div>
                                    )}
                                </Card>
                            ))}
                        </div>
                    </section>

                    {/* Final Executive Insights */}
                    <div className="pt-12 border-t border-white/5">
                        <section className="space-y-8 max-w-4xl mx-auto">
                            <div className="text-center space-y-4">
                                <h2 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.4em]">CONSIDERAÇÕES FINAIS</h2>
                                <h3 className="text-3xl font-black text-white leading-tight">Visão Geral e Insights do Projeto</h3>
                            </div>
                            
                            <Card className="rounded-[50px] border-none bg-white/5 backdrop-blur-2xl shadow-2xl p-12 ring-1 ring-white/10 relative overflow-hidden group">
                                <div 
                                    className="absolute -top-[20%] -right-[20%] w-[50%] h-[50%] blur-[120px] opacity-10 pointer-events-none group-hover:opacity-20 transition-all duration-1000"
                                    style={{ backgroundColor: primaryColor }}
                                />
                                <div 
                                    className="prose prose-invert prose-lg max-w-none prose-p:text-slate-300 prose-p:font-medium prose-strong:text-white prose-strong:font-black prose-p:leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: meta.stage_data?.relatrio?.insights || "<p className='text-center italic opacity-50 uppercase tracking-widest text-xs py-10'>Aguardando consolidação final dos insights pela equipe.</p>" }}
                                />
                            </Card>
                        </section>
                    </div>

                    <div className="flex flex-col items-center gap-8 pt-12 pb-24 text-center">
                        <div className="h-16 w-px bg-gradient-to-b from-white/20 to-transparent" />
                        <div className="h-16 w-16 bg-white/5 rounded-3xl flex items-center justify-center border border-white/10 mb-2">
                             <Layers className="h-8 w-8 text-white" />
                        </div>
                        <div className="space-y-1">
                             <p className="text-lg font-black text-white tracking-widest uppercase">MKT Técha</p>
                             <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.4em]">Propriedade de {tenant?.name || "Parceiro"}</p>
                        </div>
                    </div>
                </main>
            </div>
        </PublicPortalShell>
    );
}
