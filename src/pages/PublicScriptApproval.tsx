import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileText, ListChecks, Loader2, AlertCircle, Rocket, ChevronDown } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export default function PublicScriptApproval() {
    const { token } = useParams();
    const [loading, setLoading] = useState(true);
    const [approving, setApproving] = useState(false);
    const [caseData, setCaseData] = useState<any>(null);
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
                // In M30 flow, once it leaves 'aprovar_roteiro', it means it was approved
                if (c.state !== "aprovar_roteiro" && c.journey_name?.includes("M30")) {
                    setAlreadyApproved(true);
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
                fetchCase(); // Refresh to show approved state
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
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-10 w-10 text-indigo-600 animate-spin" />
                    <p className="text-sm font-bold text-slate-500 animate-pulse">Carregando roteiro...</p>
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
                    <h1 className="text-xl font-black text-slate-900">Link não encontrado</h1>
                    <p className="text-sm text-slate-500 leading-relaxed">O link que você seguiu pode estar incorreto ou não estar mais disponível.</p>
                </div>
            </div>
        );
    }

    if (alreadyApproved) {
        return (
            <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-6 text-center animate-in fade-in duration-700">
                <div className="max-w-xs space-y-6">
                    <div className="h-24 w-24 bg-white rounded-[40px] flex items-center justify-center text-emerald-500 mx-auto shadow-xl shadow-emerald-200/50 scale-110">
                        <CheckCircle2 className="h-12 w-12" />
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-2xl font-black text-slate-900">Roteiro Aprovado!</h1>
                        <p className="text-sm text-slate-600 leading-relaxed font-medium">Este roteiro já foi validado e enviado para a produção. Fique atento às próximas atualizações!</p>
                    </div>
                    <div className="pt-4">
                         <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">Powered by Byfrost M30</p>
                    </div>
                </div>
            </div>
        );
    }

    const subtasks = (caseData.meta_json?.pending_subtasks || []) as any[];
    const hasSubtasks = subtasks.length > 0;

    return (
        <div className="min-h-screen bg-slate-50 pb-24 font-sans">
            <header className="bg-white border-b border-slate-100 px-6 py-8 text-center sticky top-0 z-10 shadow-sm shadow-slate-200/20">
                <div className="mx-auto max-w-2xl">
                    <Badge variant="outline" className="mb-4 bg-indigo-50 text-indigo-600 border-indigo-100 px-3 py-1 text-[10px] uppercase font-black tracking-widest">
                        Aprovação de Roteiro
                    </Badge>
                    <h1 className="text-2xl font-black text-slate-900 leading-tight">
                        {caseData.title || "Roteiro M30"}
                    </h1>
                    <p className="mt-2 text-sm text-slate-400 font-medium">
                        Cliente: <span className="text-slate-900">{caseData.customer_name || "M30 Client"}</span>
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
                                        "border-none rounded-[32px] bg-white shadow-xl shadow-slate-200/40 overflow-hidden transition-all",
                                        st.is_approved && "ring-2 ring-emerald-500/30 bg-emerald-50/10"
                                    )}
                                >
                                    <AccordionTrigger className="px-8 py-6 hover:no-underline hover:bg-slate-50/50 transition-all [&[data-state=open]>div>svg]:rotate-180">
                                        <div className="flex items-center gap-4 text-left w-full justify-between pr-4">
                                            <div className="flex items-center gap-4">
                                                <div className={cn(
                                                    "h-10 w-10 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 transition-colors",
                                                    st.is_approved ? "bg-emerald-100 text-emerald-600" : "bg-indigo-50 text-indigo-600"
                                                )}>
                                                    {st.is_approved ? <CheckCircle2 className="h-5 w-5" /> : idx + 1}
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5 flex items-center gap-2">
                                                        {st.type === 'arte_estatica' ? 'Design/Arte' : 'Vídeo/Roteiro'}
                                                        {st.is_approved && <Badge className="bg-emerald-500 text-white border-none h-4 px-1.5 text-[8px]">APROVADO</Badge>}
                                                    </div>
                                                    <div className="text-base font-black text-slate-900 truncate max-w-[180px] sm:max-w-xs">{st.title}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-8 pb-8 pt-0 space-y-8 animate-in slide-in-from-top-2 duration-300 border-t border-slate-50">
                                        {/* sub-briefing */}
                                        <div className="space-y-3 mt-6">
                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <FileText className="h-3 w-3" /> Briefing da Pauta
                                            </div>
                                            <div 
                                                className="prose prose-slate prose-sm max-w-none prose-p:leading-relaxed prose-p:text-slate-600 bg-slate-50/50 p-6 rounded-3xl"
                                                dangerouslySetInnerHTML={{ __html: st.description || "<p className='italic text-slate-400'>Nenhum detalhe adicional informado.</p>" }}
                                            />
                                        </div>

                                        {/* sub-script */}
                                        <div className="space-y-3">
                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <ListChecks className="h-3 w-3" /> Roteiro Completo
                                            </div>
                                            <div className="rounded-3xl bg-slate-900 p-8 text-slate-100 relative overflow-hidden">
                                                <div className="absolute top-0 right-0 p-6 opacity-5">
                                                    <Rocket className="h-20 w-20" />
                                                </div>
                                                <div className="relative z-10 whitespace-pre-wrap leading-relaxed text-sm font-medium font-sans">
                                                    {st.script_raw || "O roteiro deste vídeo está sendo finalizado..."}
                                                </div>
                                            </div>
                                        </div>

                                        {/* checklist items (Itens do Roteiro) */}
                                        {st.script_items && st.script_items.length > 0 && (
                                            <div className="space-y-3">
                                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                    <ListChecks className="h-3 w-3 text-indigo-500" /> Itens do Roteiro (Checklist)
                                                </div>
                                                <div className="grid gap-2">
                                                    {st.script_items.map((item: any, i: number) => (
                                                        <div key={i} className="flex gap-3 p-4 bg-white border border-slate-100 rounded-2xl social-item shadow-sm">
                                                            <div className="h-5 w-5 rounded-full border-2 border-slate-200 mt-0.5 shrink-0" />
                                                            <span className="text-sm font-medium text-slate-700 leading-relaxed">{item.text}</span>
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
                                                    className="w-full h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs shadow-lg shadow-emerald-100 transition-all active:scale-95 gap-3"
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
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <FileText className="h-4 w-4" /> Briefing da Pauta
                            </h3>
                            <Card className="rounded-[32px] border-none shadow-xl shadow-slate-200/40 p-8 bg-white">
                                <div 
                                    className="prose prose-slate prose-sm max-w-none prose-p:leading-relaxed prose-p:text-slate-600"
                                    dangerouslySetInnerHTML={{ __html: caseData.summary_text || "<p className='italic text-slate-400'>Nenhuma descrição adicional.</p>" }}
                                />
                            </Card>
                        </section>

                        <section className="space-y-4">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <ListChecks className="h-4 w-4" /> Roteiro Completo
                            </h3>
                            <Card className="rounded-[32px] border-none shadow-xl shadow-slate-200/40 p-8 bg-slate-900 text-slate-100 overflow-hidden relative">
                                <div className="absolute top-0 right-0 p-8 opacity-5">
                                    <Rocket className="h-24 w-24" />
                                </div>
                                <div className="relative z-10 whitespace-pre-wrap leading-relaxed text-sm font-medium font-sans">
                                    {caseData.meta_json?.script_raw || "O roteiro está sendo finalizado..."}
                                </div>
                            </Card>
                        </section>
                    </>
                )}

                {/* Terms Note */}
                <p className="text-[11px] text-slate-400 text-center px-10 leading-relaxed font-medium">
                    Ao aprovar este roteiro, você concorda com os termos de produção e autoriza o início da gravação/edição.
                </p>
            </main>

            <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-100 p-6 z-20">
                <div className="mx-auto max-w-2xl">
                    <Button 
                        onClick={handleApprove}
                        disabled={approving}
                        className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-base shadow-2xl shadow-indigo-200 transition-all active:scale-95 gap-3"
                    >
                        {approving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                        APROVAR ROTEIRO AGORA
                    </Button>
                </div>
            </footer>
        </div>
    );
}
