import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileText, ListChecks, Loader2, AlertCircle } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { PublicPortalShell, type PublicPalette } from "@/components/public/PublicPortalShell";

export default function PublicScriptApproval() {
    const { token } = useParams();
    const [loading, setLoading] = useState(true);
    const [approving, setApproving] = useState(false);
    const [caseData, setCaseData] = useState<any>(null);
    const [tenant, setTenant] = useState<any>(null);
    const [notFound, setNotFound] = useState(false);
    const [alreadyApproved, setAlreadyApproved] = useState(false);

    useEffect(() => {
        fetchCase();
    }, [token]);

    const fetchCase = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc("get_public_m30_case", { p_token: token });
            if (error || !data || data.length === 0) {
                setNotFound(true);
            } else {
                const c = data[0];
                setCaseData(c);
                if (c.state !== "aprovar_roteiro" && c.journey_name?.includes("M30")) {
                    setAlreadyApproved(true);
                }

                if (c.tenant_id) {
                    const { data: tData } = await supabase
                        .from("tenants")
                        .select("id, name, branding_json")
                        .eq("id", c.tenant_id)
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

    const handleApproveSubtask = async (idx: number) => {
        if (!token) return;
        setApproving(true);
        try {
            const { data, error } = await supabase.rpc("approve_m30_subtask", { 
                p_token: token, 
                p_idx: idx 
            });
            if (error || !data) {
                showError("Não foi possível aprovar este vídeo agora.");
            } else {
                showSuccess("Vídeo aprovado com sucesso!");
                fetchCase();
            }
        } catch (e) {
            showError("Falha na aprovação individual.");
        } finally {
            setApproving(false);
        }
    };

    const handleApprove = async () => {
        if (!token) return;
        setApproving(true);
        try {
            const { data, error } = await supabase.rpc("approve_m30_case", { p_token: token });
            if (error || !data) {
                showError("Não foi possível finalizar a aprovação agora.");
            } else {
                showSuccess("Roteiros Aprovados! O time de produção receberá o sinal imediatamente.");
                setAlreadyApproved(true);
            }
        } catch (e) {
            showError("Ocorreu uma falha inesperada.");
        } finally {
            setApproving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    <p className="text-sm font-bold text-slate-400 animate-pulse">Carregando roteiro...</p>
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
                    <p className="text-sm text-slate-400 leading-relaxed">O link que você seguiu pode estar incorreto ou não estar mais disponível.</p>
                </div>
            </div>
        );
    }

    if (alreadyApproved) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center animate-in fade-in duration-700">
                <div className="max-w-xs space-y-6">
                    <div className="h-24 w-24 bg-emerald-500/10 rounded-[40px] flex items-center justify-center text-emerald-500 mx-auto shadow-xl shadow-emerald-500/20 scale-110 border border-emerald-500/20">
                        <CheckCircle2 className="h-12 w-12" />
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-2xl font-black text-white">Roteiro Aprovado!</h1>
                        <p className="text-sm text-slate-400 leading-relaxed font-medium">Este roteiro já foi validado e enviado para a produção. Fique atento às próximas atualizações!</p>
                    </div>
                    <div className="pt-4">
                         <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-500/50">Powered by Byfrost M30</p>
                    </div>
                </div>
            </div>
        );
    }

    const subtasks = (caseData.meta_json?.pending_subtasks || []) as any[];
    const hasSubtasks = subtasks.length > 0;

    const palette = tenant?.branding_json?.palette as PublicPalette;
    const rawPrimary = (palette as any)?.primary;
    const primaryColor = (typeof rawPrimary === 'string' ? rawPrimary : rawPrimary?.hex) || "#4f46e5";
    const primaryText = palette?.primary?.text || "#ffffff";

    return (
        <PublicPortalShell palette={{ ...palette, primary: { hex: primaryColor, text: primaryText } }}>
        <div className="min-h-screen bg-slate-950 pb-24 font-sans text-slate-300">
            <header className="bg-slate-900/50 backdrop-blur-xl border-b border-white/5 px-6 py-8 text-center sticky top-0 z-10 shadow-sm">
                <div className="mx-auto max-w-2xl">
                    <Badge variant="outline" className="mb-4 bg-primary/10 text-primary border-primary/20 px-3 py-1 text-[10px] uppercase font-black tracking-widest">
                        Aprovação de Roteiro
                    </Badge>
                    <h1 className="text-2xl font-black text-white leading-tight">
                        {caseData.title || "Roteiro M30"}
                    </h1>
                    <p className="mt-2 text-sm text-slate-400 font-medium">
                        Cliente: <span className="text-slate-300">{caseData.customer_name || "M30 Client"}</span>
                    </p>
                </div>
            </header>

            <main className="mx-auto max-w-2xl px-6 py-10 space-y-10">
                {hasSubtasks ? (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between px-2">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <ListChecks className="h-4 w-4" /> Conteúdos para Aprovação
                            </h3>
                            <div className="text-[10px] font-bold text-slate-400">
                                {subtasks.filter(s => s.is_approved).length} de {subtasks.length} aprovados
                            </div>
                        </div>

                        <Accordion type="multiple" defaultValue={[`video-0`]} className="space-y-4">
                            {subtasks.map((st, idx) => (
                                <AccordionItem 
                                    key={idx} 
                                    value={`video-${idx}`}
                                    className={cn(
                                        "border-none rounded-[32px] shadow-xl overflow-hidden transition-all",
                                        st.is_approved ? "ring-2 ring-primary/50 bg-primary/5 shadow-primary/10" : "bg-slate-900 shadow-black/20"
                                    )}
                                >
                                    <AccordionTrigger className="px-8 py-6 hover:no-underline hover:bg-slate-800/50 transition-all [&[data-state=open]>div>svg]:rotate-180">
                                        <div className="flex items-center gap-4 text-left w-full justify-between pr-4">
                                            <div className="flex items-center gap-4">
                                                <div className={cn(
                                                    "h-10 w-10 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 transition-colors",
                                                    st.is_approved ? "bg-primary/20 text-primary" : "bg-slate-800 text-slate-400"
                                                )}>
                                                    {st.is_approved ? <CheckCircle2 className="h-5 w-5" /> : idx + 1}
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-0.5 flex items-center gap-2">
                                                        {st.type === 'arte_estatica' ? 'Design/Arte' : 'Vídeo/Roteiro'}
                                                        {st.is_approved && <Badge className="bg-primary text-primary-foreground border-none h-4 px-1.5 text-[8px]">APROVADO</Badge>}
                                                    </div>
                                                    <div className="text-base font-black text-slate-100 truncate max-w-[180px] sm:max-w-xs">{st.title}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-8 pb-8 pt-0 space-y-8 animate-in slide-in-from-top-2 duration-300 border-t border-slate-800/50">
                                        {/* sub-briefing */}
                                        <div className="space-y-3 mt-6">
                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                <FileText className="h-3 w-3" /> Briefing da Pauta
                                            </div>
                                            <div 
                                                className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-p:text-slate-400 bg-slate-950 border border-slate-800 p-6 rounded-3xl"
                                                dangerouslySetInnerHTML={{ __html: st.description || "<p className='italic text-slate-500'>Nenhum detalhe adicional informado.</p>" }}
                                            />
                                        </div>



                                        {/* checklist items (Itens do Roteiro) */}
                                        {st.script_items && st.script_items.length > 0 && (
                                            <div className="space-y-3">
                                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                    <ListChecks className="h-3 w-3 text-primary" /> Itens do Roteiro (Checklist)
                                                </div>
                                                <div className="grid gap-2">
                                                    {st.script_items.map((item: any, i: number) => (
                                                        <div key={i} className="flex gap-3 p-4 bg-slate-950 border border-slate-800 rounded-2xl social-item shadow-sm">
                                                            <div className="h-5 w-5 rounded-full border-2 border-slate-700 mt-0.5 shrink-0" />
                                                            <span className="text-sm font-medium text-slate-300 leading-relaxed">{item.text}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Individual Approval Button */}
                                        {!st.is_approved && (
                                            <div className="pt-4">
                                                <Button 
                                                    onClick={() => handleApproveSubtask(idx)}
                                                    disabled={approving}
                                                    style={{ backgroundColor: primaryColor, color: primaryText }}
                                                    className="w-full h-12 rounded-2xl font-black text-xs shadow-lg transition-all active:scale-95 gap-3 hover:opacity-90"
                                                >
                                                    {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                                    APROVAR ESTE VÍDEO ✅
                                                </Button>
                                            </div>
                                        )}
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    </div>
                ) : (
                    <>
                        {/* Legacy/Single Case View */}
                        <section className="space-y-4">
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <FileText className="h-4 w-4" /> Briefing da Pauta
                            </h3>
                            <Card className="rounded-[32px] border border-slate-800 shadow-xl shadow-black/20 p-8 bg-slate-900">
                                <div 
                                    className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-p:text-slate-400"
                                    dangerouslySetInnerHTML={{ __html: caseData.summary_text || "<p className='italic text-slate-500'>Nenhuma descrição adicional.</p>" }}
                                />
                            </Card>
                        </section>


                    </>
                )}

                {/* Terms Note */}
                <p className="text-[11px] text-slate-400 text-center px-10 leading-relaxed font-medium">
                    Ao aprovar este roteiro, você concorda com os termos de produção e autoriza o início da gravação/edição.
                </p>
            </main>

            <footer className="fixed bottom-0 left-0 right-0 bg-slate-950/80 backdrop-blur-xl border-t border-white/5 p-6 z-20">
                <div className="mx-auto max-w-2xl">
                    <Button 
                        onClick={handleApprove}
                        disabled={approving}
                        style={{ backgroundColor: primaryColor, color: primaryText }}
                        className="w-full h-14 rounded-2xl font-black text-base shadow-2xl transition-all active:scale-95 gap-3 hover:opacity-90"
                    >
                        {approving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                        APROVAR ROTEIROS AGORA
                    </Button>
                </div>
            </footer>
        </div>
        </PublicPortalShell>
    );
}
