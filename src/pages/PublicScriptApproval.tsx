import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileText, ListChecks, Loader2, AlertCircle, Rocket } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";

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
                if (c.state !== "aprovar_roteiro") {
                    setAlreadyApproved(true);
                }
            }
        } catch (e) {
            setNotFound(true);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async () => {
        if (!token) return;
        setApproving(true);
        try {
            const { data, error } = await supabase.rpc("approve_m30_case", { p_token: token });
            if (error || !data) {
                showError("Não foi possível aprovar o roteiro agora.");
            } else {
                showSuccess("Roteiro Aprovado! O time de produção receberá o sinal imediatamente.");
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

    return (
        <div className="min-h-screen bg-slate-50 pb-24">
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
                {/* Briefing Section */}
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

                {/* Script Section */}
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
