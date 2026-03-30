import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
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
    Hash,
    Lock,
    MessageCircle as LucideMessageCircle
} from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PublicPortalShell, type PublicPalette } from "@/components/public/PublicPortalShell";

export default function MktTechaPublicApproval() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const isPlanningMode = searchParams.get("mode") === "planning";
    
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState<string | null>(null);
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
            // We use the RPC defined in our SQL to fetch by token/ID
            const { data, error } = await supabase.rpc("get_public_mkt_techa_case", { p_token: id });
            
            if (error || !data || data.length === 0) {
                setNotFound(true);
            } else {
                const campaignData = data[0];
                setCampaign(campaignData);
                
                // If there's no access code required, authorize immediately
                if (!campaignData.meta_json?.share_access_code) {
                    setIsAuthorized(true);
                }

                // Fetch tenant branding
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
            showSuccess("Acesso liberado!");
        } else {
            setPinError(true);
            setPin("");
            showError("Código de acesso incorreto.");
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

    const handleApprovePlanning = async () => {
        if (!id) return;
        setActing('planning');
        try {
            // Trying a potential RPC for planning approval
            const { data, error } = await supabase.rpc("approve_mkt_techa_planning", { 
                p_token: id
            });
            
            if (error) {
                // If RPC doesn't exist, we fallback to a message or a more generic update if allowed
                console.error("RPC Error:", error);
                showError("A função de aprovação estratégica ainda não foi configurada no servidor.");
            } else {
                showSuccess("Planejamento Estratégico Aprovado! 🚀");
                fetchCampaign();
            }
        } catch (e) {
            showError("Falha na aprovação do planejamento.");
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

    const palette = tenant?.branding_json?.palette as PublicPalette;
    const primaryColor = palette?.primary?.hex || "#4f46e5";
    const primaryText = palette?.primary?.text || "#ffffff";

    if (campaign && !isAuthorized) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
                <Card className="w-full max-w-sm rounded-[40px] bg-slate-900 border-none shadow-2xl p-8 ring-1 ring-white/5 space-y-8 animate-in fade-in zoom-in duration-500">
                    <div className="text-center space-y-2">
                        <div className="h-16 w-16 bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-4 ring-1 ring-white/10">
                            <Lock className="h-8 w-8 text-amber-500" />
                        </div>
                        <h1 className="text-xl font-black text-white uppercase tracking-tight">Conteúdo Protegido</h1>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed">Insira o código de 4 dígitos enviado por nossa equipe para acessar os detalhes da campanha.</p>
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
                                    pinError && "ring-2 ring-rose-500 animate-shake"
                                )}
                            />
                        </div>
                        <Button 
                            type="submit"
                            style={{ backgroundColor: primaryColor, color: primaryText }}
                            className="w-full h-14 rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all"
                        >
                            ACESSAR PORTAL
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
        <PublicPortalShell palette={{ ...palette, primary: { hex: "#0f172a", text: "#ffffff" } }}>
            <div className="min-h-screen bg-slate-950 pb-24 font-sans selection:bg-indigo-500/30">
                <header className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-[40px] px-6 py-10 text-center sticky top-4 z-20 shadow-2xl mx-auto max-w-5xl">
                    <div className="mx-auto max-w-4xl">
                        <Badge 
                            variant="outline" 
                            style={{ 
                                backgroundColor: `${primaryColor}10`, 
                                color: primaryColor, 
                                borderColor: `${primaryColor}40`,
                                boxShadow: `0 0 20px ${primaryColor}15`
                            }}
                            className="mb-4 px-4 py-1.5 text-[10px] uppercase font-black tracking-widest rounded-full border shadow-lg"
                        >
                            {isPlanningMode ? "Aprovação Estratégica" : "Portal de Aprovação"} • MKT Técha
                        </Badge>
                        <h1 className="text-3xl font-black text-white tracking-tight sm:text-4xl">
                            {campaign.title || "Campanha Digital"}
                        </h1>
                        <div className="mt-4 flex items-center justify-center gap-4 text-xs font-bold text-slate-400">
                            {isPlanningMode ? (
                                <div className="flex items-center gap-1.5">
                                    <Target className="h-3.5 w-3.5" style={{ color: primaryColor }} />
                                    <span>Validação do Planejamento e Estratégia</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    <span>{approvedCount} de {creatives.length} aprovados</span>
                                </div>
                            )}
                            {tenant?.name && (
                                <div className="flex items-center gap-1.5 before:content-['•'] before:mr-2 before:text-slate-700">
                                    <span>{tenant.name}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <main className="mx-auto max-w-5xl px-0 py-12">
                {isPlanningMode ? (
                    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        {/* Planning Stage UI */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Card className="p-8 rounded-[40px] bg-slate-900 border-none shadow-2xl ring-1 ring-white/5 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700">
                                    <Calendar className="h-24 w-24" />
                                </div>
                                <div className="relative z-10 space-y-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Cronograma</p>
                                    <div className="space-y-1">
                                        <div className="text-lg font-black text-white leading-tight">
                                            {campaign.meta_json?.stage_data?.planejamento?.start_date ? format(new Date(campaign.meta_json.stage_data.planejamento.start_date), "dd/MM/yy", { locale: ptBR }) : "--"}
                                            <span className="text-slate-600 mx-2">→</span>
                                            {campaign.meta_json?.stage_data?.planejamento?.end_date ? format(new Date(campaign.meta_json.stage_data.planejamento.end_date), "dd/MM/yy", { locale: ptBR }) : "--"}
                                        </div>
                                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Período de Ativação</p>
                                    </div>
                                </div>
                            </Card>

                            <Card 
                                className="p-8 rounded-[40px] bg-slate-900 border-none shadow-2xl ring-1 ring-white/5 relative overflow-hidden group md:col-span-2"
                                style={{ borderLeft: `6px solid ${primaryColor}` }}
                            >
                                <div 
                                    className="absolute -right-20 -top-20 w-64 h-64 blur-[120px] opacity-20 pointer-events-none transition-all duration-1000 group-hover:opacity-30"
                                    style={{ backgroundColor: primaryColor }}
                                />
                                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700">
                                    <Rocket className="h-24 w-24" style={{ color: primaryColor }} />
                                </div>
                                <div className="relative z-10 space-y-3">
                                    <p 
                                        style={{ color: primaryColor }}
                                        className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60"
                                    >
                                        Objetivo Central
                                    </p>
                                    <h3 
                                        className="text-2xl font-black leading-tight text-white"
                                    >
                                        {campaign.meta_json?.stage_data?.planejamento?.objetivo || "Aceleração de Vendas e Branding"}
                                    </h3>
                                </div>
                            </Card>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8">
                            <div className="space-y-8">
                                <section className="space-y-4">
                                    <div className="flex items-center gap-3 px-2">
                                        <div 
                                            style={{ color: primaryColor }}
                                            className="h-10 w-10 rounded-2xl bg-slate-900 flex items-center justify-center ring-1 ring-white/10"
                                        >
                                            <LucideMessageCircle className="h-5 w-5" />
                                        </div>
                                        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">MENSAGEM CENTRAL</h2>
                                    </div>
                                    <Card className="rounded-[40px] border-none bg-slate-900 shadow-2xl p-10 ring-1 ring-white/5 leading-relaxed">
                                        <p className="text-lg font-medium text-slate-200 whitespace-pre-wrap leading-relaxed italic">
                                            "{campaign.meta_json?.stage_data?.planejamento?.mensagem_central || "Nenhuma mensagem definida."}"
                                        </p>
                                    </Card>
                                </section>

                                <section className="space-y-4">
                                    <div className="flex items-center gap-3 px-2">
                                        <div className="h-10 w-10 rounded-2xl bg-slate-900 flex items-center justify-center text-emerald-400 ring-1 ring-white/10">
                                            <CheckCircle2 className="h-5 w-5" />
                                        </div>
                                        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Canais e Criativos</h2>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {(campaign.meta_json?.selected_channels || []).map((ch: string) => (
                                            <div key={ch} className="p-5 rounded-3xl bg-slate-900 ring-1 ring-white/5 flex items-center justify-between group hover:bg-slate-800/50 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div 
                                                        style={{ color: primaryColor }}
                                                        className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center"
                                                    >
                                                        <Hash className="h-4 w-4" />
                                                    </div>
                                                    <span className="text-sm font-black text-white uppercase tracking-widest">{ch}</span>
                                                </div>
                                                <Badge className="bg-emerald-500/10 text-emerald-500 border-none text-[8px] font-black tracking-widest">ATIVO</Badge>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>

                            <aside className="space-y-8">
                                <section className="space-y-4">
                                    <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-2">EVIDÊNCIAS TÉCNICAS</h2>
                                    <Card className="rounded-[40px] border-none bg-slate-900 shadow-2xl p-8 ring-1 ring-white/5 space-y-6">
                                        <div className="space-y-4">
                                            {/* ERP Evidence */}
                                            <div className="space-y-2">
                                                <LabelPublic title="EVIDÊNCIA ERP" />
                                                {campaign.meta_json?.stage_data?.planejamento?.erp_evidence_url ? (
                                                    <a 
                                                        href={campaign.meta_json.stage_data.planejamento.erp_evidence_url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="flex items-center justify-between p-4 bg-slate-800/50 rounded-2xl group hover:bg-slate-800 transition-all border border-white/5"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <FileText className="h-4 w-4 text-slate-400" />
                                                            <span className="text-[11px] font-bold text-slate-300">Documento ERP</span>
                                                        </div>
                                                        <Download className="h-3.5 w-3.5 text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" />
                                                    </a>
                                                ) : (
                                                    <p className="text-[10px] italic text-slate-600 px-1">Nenhuma evidência ERP anexada.</p>
                                                )}
                                            </div>

                                            {/* CRM Evidence */}
                                            <div className="space-y-2">
                                                <LabelPublic title="EVIDÊNCIA CRM" />
                                                {campaign.meta_json?.stage_data?.planejamento?.crm_evidence_url ? (
                                                    <a 
                                                        href={campaign.meta_json.stage_data.planejamento.crm_evidence_url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="flex items-center justify-between p-4 bg-slate-800/50 rounded-2xl group hover:bg-slate-800 transition-all border border-white/5"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <FileText className="h-4 w-4 text-slate-400" />
                                                            <span className="text-[11px] font-bold text-slate-300">Documento CRM</span>
                                                        </div>
                                                        <Download className="h-3.5 w-3.5 text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" />
                                                    </a>
                                                ) : (
                                                    <p className="text-[10px] italic text-slate-600 px-1">Nenhuma evidência CRM anexada.</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-white/5">
                                            <div 
                                                style={{ color: primaryColor, backgroundColor: `${primaryColor}05`, borderColor: `${primaryColor}15` }}
                                                className="flex items-center gap-2 p-4 rounded-2xl border text-indigo-400"
                                            >
                                                <AlertCircle className="h-4 w-4 shrink-0" />
                                                <p className="text-[9px] font-medium leading-relaxed">
                                                    As evidências técnicas comprovam a viabilidade operacional e comercial da estratégia proposta.
                                                </p>
                                            </div>
                                        </div>
                                    </Card>
                                </section>

                                <div className="space-y-4">
                                    {campaign.meta_json?.stage_data?.planejamento?.approved_at ? (
                                        <div className="w-full h-16 rounded-[24px] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center gap-3">
                                            <Check className="h-5 w-5 text-emerald-500" />
                                            <span className="text-xs font-black text-emerald-500 uppercase tracking-widest leading-none pt-0.5">Planejamento Aprovado</span>
                                        </div>
                                    ) : (
                                        <Button 
                                            onClick={handleApprovePlanning}
                                            disabled={acting === 'planning'}
                                            style={{ 
                                                backgroundColor: primaryColor, 
                                                color: primaryText,
                                                boxShadow: `0 20px 40px -10px ${primaryColor}40`
                                            }}
                                            className="w-full h-16 rounded-[24px] font-black text-xs uppercase tracking-widest shadow-2xl transition-all active:scale-95 gap-3 hover:opacity-90 hover:-translate-y-1"
                                        >
                                            {acting === 'planning' ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                                            APROVAR ESTRATÉGIA AGORA 🚀
                                        </Button>
                                    )}
                                </div>
                            </aside>
                        </div>
                    </div>
                ) : (
                    creatives.length > 0 ? (
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
                )
            )}
            </main>

            <footer className="mt-24 border-t border-white/5 py-12 text-center">
                <div className="mx-auto max-w-2xl px-6 space-y-6">
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-relaxed px-10">
                        {isPlanningMode 
                            ? "A validação do planejamento inicia o processo oficial de produção de criativos." 
                            : "Ao aprovar os criativos, você autoriza a distribuição imediata nos canais vinculados."
                        }
                    </p>
                    <div className="flex items-center justify-center gap-6 pt-4">
                         <div className="text-[10px] font-bold text-slate-700 uppercase tracking-[0.3em]">Powered by MKT Técha</div>
                    </div>
                </div>
            </footer>
            </div>
        </PublicPortalShell>
    );
}

function LabelPublic({ title }: { title: string }) {
    return (
        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 px-1">{title}</div>
    );
}

function MessageCircle(props: any) {
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
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
    )
}
