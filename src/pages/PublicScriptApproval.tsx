import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileText, ListChecks, Loader2, AlertCircle, Mic, Square, Trash, Image as ImageIcon, Camera } from "lucide-react";
import { useRef } from "react";
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
    const [subtaskData, setSubtaskData] = useState<Record<number, any>>({});
    const [recordingIdx, setRecordingIdx] = useState<number | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);


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
                if (c.state !== "aprovar_roteiro" && c.state !== "planejamento" && c.journey_name?.includes("M30")) {
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

    
    const isGravacaoCase = caseData?.case_type === 'gravacao' || caseData?.state?.toLowerCase().includes('grava') || caseData?.journey_name?.toLowerCase().includes('grava');

    const handleCheckItem = (subIdx: number, itemIdx: number) => {
        const newData = { ...subtaskData };
        if (!newData[subIdx]) newData[subIdx] = { ...subtasks[subIdx] };
        if (!newData[subIdx].script_items) newData[subIdx].script_items = [];
        
        newData[subIdx].script_items = newData[subIdx].script_items.map((it: any, i: number) => 
            i === itemIdx ? { ...it, checked: !it.checked } : it
        );
        
        setSubtaskData(newData);
    };

    const handleItemCommentChange = (subIdx: number, itemIdx: number, text: string) => {
        const newData = { ...subtaskData };
        if (!newData[subIdx]) newData[subIdx] = { ...subtasks[subIdx] };
        if (!newData[subIdx].script_items) newData[subIdx].script_items = [];
        
        newData[subIdx].script_items = newData[subIdx].script_items.map((it: any, i: number) => 
            i === itemIdx ? { ...it, comment: text } : it
        );
        
        setSubtaskData(newData);
    };

    const saveSubtaskData = async (subIdx: number) => {
        if (!token) return;
        if (subtaskData[subIdx]) {
            const payload = { ...subtasks[subIdx], ...subtaskData[subIdx] };
            await supabase.rpc('update_public_m30_subtask_meta', { p_token: token, p_idx: subIdx, p_subtask: payload });
        }
    };

    const handleObsChange = (subIdx: number, text: string) => {
        const newData = { ...subtaskData };
        if (!newData[subIdx]) newData[subIdx] = { ...subtasks[subIdx] };
        newData[subIdx].observations = text;
        setSubtaskData(newData);
    };

    const startRecording = async (subIdx: number) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const fileName = `${caseData.id}/${Date.now()}.webm`;
                
                // Upload
                const { data, error } = await supabase.storage.from('tenant-assets').upload(fileName, audioBlob, { contentType: 'audio/webm' });
                if (!error && data) {
                    const publicUrl = supabase.storage.from('tenant-assets').getPublicUrl(fileName).data.publicUrl;
                    const newData = { ...subtaskData };
                    if (!newData[subIdx]) newData[subIdx] = { ...subtasks[subIdx] };
                    if (!newData[subIdx].audio_urls) newData[subIdx].audio_urls = [];
                    newData[subIdx].audio_urls.push(publicUrl);
                    setSubtaskData(newData);
                }
            };

            mediaRecorder.start();
            setRecordingIdx(subIdx);
        } catch (e) {
            showError("Não foi possível acessar o microfone.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
            setRecordingIdx(null);
        }
    };

    const handlePhotoUpload = async (subIdx: number, file: File) => {
        const fileName = `${caseData.id}/${Date.now()}_${file.name}`;
        const { data, error } = await supabase.storage.from('tenant-assets').upload(fileName, file);
        if (!error && data) {
            const publicUrl = supabase.storage.from('tenant-assets').getPublicUrl(fileName).data.publicUrl;
            const newData = { ...subtaskData };
            if (!newData[subIdx]) newData[subIdx] = { ...subtasks[subIdx] };
            if (!newData[subIdx].photo_urls) newData[subIdx].photo_urls = [];
            newData[subIdx].photo_urls.push(publicUrl);
            setSubtaskData(newData);
            showSuccess("Foto anexada com sucesso!");
        } else {
            showError("Erro ao enviar foto.");
        }
    };

    const saveAndApproveSubtask = async (idx: number) => {
        if (!token) return;
        setApproving(true);
        try {
            // Se teve alteracao, salva no meta
            if (subtaskData[idx]) {
                const payload = { ...subtasks[idx], ...subtaskData[idx] };
                await supabase.rpc('update_public_m30_subtask_meta', { p_token: token, p_idx: idx, p_subtask: payload });
            }
            
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

    const palette = tenant?.branding_json?.palette as PublicPalette;
    const rawPrimary = (palette as any)?.primary;
    const primaryColor = (typeof rawPrimary === 'string' ? rawPrimary : rawPrimary?.hex) || "#4f46e5";
    const primaryText = palette?.primary?.text || "#ffffff";

    return (
        <PublicPortalShell palette={{ ...palette, primary: { hex: primaryColor, text: primaryText } }}>
        <div className="min-h-screen bg-slate-950 pb-24 font-sans text-slate-300">
            <header className="bg-slate-900/50 backdrop-blur-xl border-b border-white/5 px-6 py-4 text-center sticky top-0 z-10 shadow-sm">
                <div className="mx-auto max-w-2xl">
                    <Badge variant="outline" className="mb-2 bg-primary/10 text-primary border-primary/20 px-3 py-1 text-[10px] uppercase font-black tracking-widest">
                        Aprovação de Roteiro
                    </Badge>
                    <h1 className="text-xl font-black text-white leading-tight">
                        {caseData.title || "Roteiro M30"}
                    </h1>
                    <p className="mt-1 text-xs text-slate-400 font-medium">
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
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className={cn(
                                                    "h-10 w-10 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 transition-colors",
                                                    st.is_approved ? "bg-primary/20 text-primary" : "bg-slate-800 text-slate-400"
                                                )}>
                                                    {st.is_approved ? <CheckCircle2 className="h-5 w-5" /> : idx + 1}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-0.5 flex flex-wrap items-center gap-2">
                                                        {st.type === 'arte_estatica' ? 'Design/Arte' : 'Vídeo/Roteiro'}
                                                        {st.is_approved && <Badge className="bg-primary text-primary-foreground border-none h-4 px-1.5 text-[8px]">APROVADO</Badge>}
                                                    </div>
                                                    <div className="text-sm font-black text-slate-100 break-words leading-tight pr-2">{st.title}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-8 pb-8 pt-0 space-y-8 animate-in slide-in-from-top-2 duration-300 border-t border-slate-800/50">
                                        
                                        {/* sub-briefing */}
                                        {isGravacaoCase ? (
                                            <Accordion type="single" collapsible className="w-full mt-6">
                                                <AccordionItem value="briefing" className="border-none bg-slate-950 rounded-3xl overflow-hidden border border-slate-800">
                                                    <AccordionTrigger className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 hover:bg-slate-900/50 hover:no-underline">
                                                        <div className="flex items-center gap-2"><FileText className="h-3 w-3" /> Briefing da Pauta</div>
                                                    </AccordionTrigger>
                                                    <AccordionContent className="px-6 pb-6 pt-0">
                                                        <div 
                                                            className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-p:text-slate-400"
                                                            dangerouslySetInnerHTML={{ __html: st.description || "<p className='italic text-slate-500'>Nenhum detalhe adicional informado.</p>" }}
                                                        />
                                                    </AccordionContent>
                                                </AccordionItem>
                                            </Accordion>
                                        ) : (
                                            <div className="space-y-3 mt-6">
                                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                    <FileText className="h-3 w-3" /> Briefing da Pauta
                                                </div>
                                                <div 
                                                    className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-p:text-slate-400 bg-slate-950 border border-slate-800 p-6 rounded-3xl"
                                                    dangerouslySetInnerHTML={{ __html: st.description || "<p className='italic text-slate-500'>Nenhum detalhe adicional informado.</p>" }}
                                                />
                                            </div>
                                        )}

                                        {/* checklist items (Itens do Roteiro) */}
                                        {st.script_items && st.script_items.length > 0 && (() => {
                                            const currentItems = subtaskData[idx]?.script_items || st.script_items;
                                            return (
                                            <div className="space-y-3">
                                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                    <ListChecks className="h-3 w-3 text-primary" /> Itens do Roteiro (Checklist)
                                                </div>
                                                <div className="grid gap-2">
                                                    {currentItems.map((item: any, i: number) => {
                                                        const isChecked = !!item.checked;
                                                        return (
                                                        <div 
                                                            key={i} 
                                                            className={`flex flex-col gap-2 p-4 bg-slate-950 border border-slate-800 rounded-2xl social-item shadow-sm ${isChecked ? 'opacity-60' : ''}`}
                                                        >
                                                            <div 
                                                                onClick={() => isGravacaoCase && !st.is_approved ? handleCheckItem(idx, i) : null}
                                                                className={`flex gap-3 ${isGravacaoCase && !st.is_approved ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                                                            >
                                                                {isGravacaoCase ? (
                                                                    <div className={`h-5 w-5 rounded border-2 mt-0.5 shrink-0 flex items-center justify-center transition-colors ${isChecked ? 'bg-primary border-primary text-white' : 'border-slate-700'}`}>
                                                                        {isChecked && <CheckCircle2 className="h-3 w-3" />}
                                                                    </div>
                                                                ) : (
                                                                    <div className="h-5 w-5 rounded-full border-2 border-slate-700 mt-0.5 shrink-0" />
                                                                )}
                                                                <span className={`text-sm font-medium text-slate-300 leading-relaxed flex-1 ${isChecked ? 'line-through text-slate-500' : ''}`}>{item.text}</span>
                                                            </div>
                                                            
                                                            {!isGravacaoCase && !st.is_approved && (
                                                                <div className="pl-8 pt-1">
                                                                    <textarea
                                                                        className="w-full bg-slate-900 border border-slate-800/80 p-3 rounded-xl text-sm text-slate-300 placeholder:text-slate-600 resize-none outline-none min-h-[60px] focus:border-primary/50 transition-colors"
                                                                        placeholder="O que você gostaria de mudar neste trecho? (Opcional)"
                                                                        value={item.comment || ''}
                                                                        onChange={(e) => handleItemCommentChange(idx, i, e.target.value)}
                                                                        onBlur={() => saveSubtaskData(idx)}
                                                                    />
                                                                </div>
                                                            )}
                                                            {!isGravacaoCase && st.is_approved && item.comment && (
                                                                <div className="pl-8 pt-1">
                                                                    <div className="p-3 bg-slate-900/50 border border-slate-800/80 rounded-xl text-sm text-slate-400 italic">
                                                                        {item.comment}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )})}
                                                </div>
                                            </div>
                                        )})()}

                                        {/* Observacoes */}
                                        {isGravacaoCase && (
                                            <div className="space-y-3">
                                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Observações</div>
                                                <div className="bg-slate-950 border border-slate-800 rounded-3xl p-4 space-y-4">
                                                    <textarea 
                                                        className="w-full bg-transparent text-sm text-slate-300 placeholder:text-slate-600 resize-none outline-none min-h-[80px]"
                                                        placeholder="Adicione notas ou observações da gravação..."
                                                        value={subtaskData[idx]?.observations || st.observations || ''}
                                                        onChange={(e) => handleObsChange(idx, e.target.value)}
                                                        disabled={st.is_approved}
                                                    />
                                                    
                                                    {/* Midias (Fotos / Audios) */}
                                                    <div className="flex flex-wrap gap-2">
                                                        {(subtaskData[idx]?.audio_urls || st.audio_urls || []).map((url: string, i: number) => (
                                                            <audio key={`audio-${i}`} src={url} controls className="h-10 max-w-[200px]" />
                                                        ))}
                                                        {(subtaskData[idx]?.photo_urls || st.photo_urls || []).map((url: string, i: number) => (
                                                            <img key={`photo-${i}`} src={url} className="h-16 w-16 object-cover rounded-xl border border-slate-800" />
                                                        ))}
                                                    </div>

                                                    {/* Toolbar */}
                                                    {!st.is_approved && (
                                                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/50">
                                                            {recordingIdx === idx ? (
                                                                <Button size="sm" variant="destructive" className="rounded-full h-8 px-4 text-xs gap-2 animate-pulse" onClick={stopRecording}>
                                                                    <Square className="h-3 w-3" /> Parar
                                                                </Button>
                                                            ) : (
                                                                <Button size="sm" variant="outline" className="rounded-full h-8 px-4 text-xs gap-2 border-slate-700 bg-slate-900" onClick={() => startRecording(idx)} disabled={recordingIdx !== null}>
                                                                    <Mic className="h-3 w-3" /> Gravar Áudio
                                                                </Button>
                                                            )}
                                                            
                                                            <label className="cursor-pointer">
                                                                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files && handlePhotoUpload(idx, e.target.files[0])} />
                                                                <div className="h-8 px-4 rounded-full border border-slate-700 bg-slate-900 text-slate-300 text-xs font-medium flex items-center gap-2 hover:bg-slate-800 transition-colors">
                                                                    <Camera className="h-3 w-3" /> Adicionar Foto
                                                                </div>
                                                            </label>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Individual Approval Button */}
                                        {!st.is_approved && (
                                            
                                            <div className="pt-4 flex flex-col sm:flex-row gap-3">
                                                <Button 
                                                    onClick={async () => {
                                                        if (!token) return;
                                                        setApproving(true);
                                                        try {
                                                            const payload = { ...subtasks[idx], ...(subtaskData[idx] || {}) };
                                                            await supabase.rpc('update_public_m30_subtask_meta', { p_token: token, p_idx: idx, p_subtask: payload });
                                                            showSuccess("Observações salvas!");
                                                            fetchCase();
                                                        } catch (e) {
                                                            showError("Falha ao salvar.");
                                                        } finally {
                                                            setApproving(false);
                                                        }
                                                    }}
                                                    disabled={approving}
                                                    variant="outline"
                                                    className="w-full sm:w-1/2 h-12 rounded-2xl font-bold text-xs shadow-sm bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                                                >
                                                    SALVAR RASCUNHO 💾
                                                </Button>

                                                <Button 
                                                    onClick={() => saveAndApproveSubtask(idx)}
                                                    disabled={approving}
                                                    style={{ backgroundColor: primaryColor, color: primaryText }}
                                                    className="w-full sm:w-1/2 h-12 rounded-2xl font-black text-xs shadow-lg transition-all active:scale-95 gap-3 hover:opacity-90"
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
