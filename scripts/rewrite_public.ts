import fs from 'fs';

let content = fs.readFileSync('scripts/new_public_script.tsx', 'utf-8');

// Imports
content = content.replace('import { CheckCircle2, FileText, ListChecks, Loader2, AlertCircle } from "lucide-react";', 
'import { CheckCircle2, FileText, ListChecks, Loader2, AlertCircle, Mic, Square, Trash, Image as ImageIcon, Camera } from "lucide-react";\nimport { useRef } from "react";');

// Inside component
const newStates = `
    const [subtaskData, setSubtaskData] = useState<Record<number, any>>({});
    const [recordingIdx, setRecordingIdx] = useState<number | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
`;
content = content.replace('const [alreadyApproved, setAlreadyApproved] = useState(false);', 'const [alreadyApproved, setAlreadyApproved] = useState(false);' + newStates);

// Before return
const helperFunctions = `
    const isGravacaoCase = caseData?.state?.toLowerCase().includes('grava') || caseData?.journey_name?.toLowerCase().includes('grava');

    const handleCheckItem = (subIdx: number, itemIdx: number) => {
        const newData = { ...subtaskData };
        if (!newData[subIdx]) newData[subIdx] = { ...subtasks[subIdx] };
        if (!newData[subIdx].script_items) newData[subIdx].script_items = [];
        
        newData[subIdx].script_items = newData[subIdx].script_items.map((it: any, i: number) => 
            i === itemIdx ? { ...it, checked: !it.checked } : it
        );
        
        setSubtaskData(newData);
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
                const fileName = \`\${caseData.id}/\${Date.now()}.webm\`;
                
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
        const fileName = \`\${caseData.id}/\${Date.now()}_\${file.name}\`;
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
`;

content = content.replace('const palette = tenant?.branding_json?.palette as PublicPalette;', helperFunctions + '\n    const palette = tenant?.branding_json?.palette as PublicPalette;');

// Replace approval button in subtask
content = content.replace('onClick={() => handleApproveSubtask(idx)}', 'onClick={() => saveAndApproveSubtask(idx)}');

// Render Accordion logic inside map
const oldSubtaskRender = `
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
`;

const newSubtaskRender = `
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
                                                            onClick={() => isGravacaoCase && !st.is_approved ? handleCheckItem(idx, i) : null}
                                                            className={\`flex gap-3 p-4 bg-slate-950 border border-slate-800 rounded-2xl social-item shadow-sm \${isGravacaoCase && !st.is_approved ? 'cursor-pointer hover:border-slate-600 transition-colors' : ''} \${isChecked ? 'opacity-60' : ''}\`}
                                                        >
                                                            {isGravacaoCase ? (
                                                                <div className={\`h-5 w-5 rounded border-2 mt-0.5 shrink-0 flex items-center justify-center transition-colors \${isChecked ? 'bg-primary border-primary text-white' : 'border-slate-700'}\`}>
                                                                    {isChecked && <CheckCircle2 className="h-3 w-3" />}
                                                                </div>
                                                            ) : (
                                                                <div className="h-5 w-5 rounded-full border-2 border-slate-700 mt-0.5 shrink-0" />
                                                            )}
                                                            <span className={\`text-sm font-medium text-slate-300 leading-relaxed \${isChecked ? 'line-through text-slate-500' : ''}\`}>{item.text}</span>
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
                                                            <audio key={\`audio-\${i}\`} src={url} controls className="h-10 max-w-[200px]" />
                                                        ))}
                                                        {(subtaskData[idx]?.photo_urls || st.photo_urls || []).map((url: string, i: number) => (
                                                            <img key={\`photo-\${i}\`} src={url} className="h-16 w-16 object-cover rounded-xl border border-slate-800" />
                                                        ))}
                                                    </div>

                                                    {/* Toolbar */}
                                                    {!st.is_approved && (
                                                        <div className="flex items-center gap-2 pt-2 border-t border-slate-800/50">
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
`;

content = content.replace(oldSubtaskRender, newSubtaskRender);

fs.writeFileSync('src/pages/PublicScriptApproval.tsx', content);
