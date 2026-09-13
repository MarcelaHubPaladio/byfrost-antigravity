import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, AlertCircle, RefreshCw, Sparkles, Play, Settings2, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

export function VideoValidationTab({ 
    subtaskId, 
    caseId, 
    tenantId, 
    roteiro, 
    onValidationResult 
}: { 
    subtaskId: string, 
    caseId: string, 
    tenantId: string, 
    roteiro: string,
    onValidationResult?: (result: any) => void,
    onStatusChange?: (status: string) => void
}) {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [progressValue, setProgressValue] = useState(0);
    const [progressStatus, setProgressStatus] = useState('');
    const [validations, setValidations] = useState<any[]>([]);
    const { toast } = useToast();

    useEffect(() => {
        if (subtaskId) {
            loadValidations();
        }
    }, [subtaskId]);

    const loadValidations = async () => {
        const { data, error } = await supabase
            .from('video_validations')
            .select('*')
            .eq('subtask_id', subtaskId)
            .order('created_at', { ascending: false });
        
        if (data) setValidations(data);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
        }
    };

    const handleUploadAndValidate = async () => {
        if (!file) {
            toast({ title: 'Atenção', description: 'Selecione um arquivo primeiro.', variant: 'destructive' });
            return;
        }

        setUploading(true);
        setProgressValue(5);
        setProgressStatus('Enviando arquivo de vídeo...');
        
        // Simulate progress slowly increasing while waiting
        const progressInterval = setInterval(() => {
            setProgressValue(prev => {
                if (prev < 90) return prev + (90 - prev) * 0.05; // slowly approaches 90
                return prev;
            });
        }, 1000);

        try {
            // Upload to Supabase Storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${tenantId}/${caseId}/${subtaskId}_${Date.now()}.${fileExt}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('video_validations')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            setProgressValue(30);
            setProgressStatus('Processando com a Inteligência Artificial...');

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('video_validations')
                .getPublicUrl(fileName);

            // Create validation record
            const { data: validationData, error: dbError } = await supabase
                .from('video_validations')
                .insert({
                    tenant_id: tenantId,
                    case_id: caseId,
                    subtask_id: subtaskId,
                    video_url: publicUrl,
                    video_path: fileName,
                    status: 'processing'
                })
                .select()
                .single();

            if (dbError) throw dbError;

            toast({ title: 'Upload concluído', description: 'O vídeo foi enviado e está sendo processado pela IA.' });
            setFile(null);
            setProcessing(true);
            loadValidations();
            
            // Call Edge Function to process
            const { data: fnData, error: fnError } = await supabase.functions.invoke('video-validation-ai', {
                body: {
                    validationId: validationData.id,
                    tenantId,
                    caseId,
                    subtaskId,
                    videoPath: fileName,
                    videoUrl: publicUrl,
                    roteiro
                }
            });

            if (fnError) throw fnError;
            if (fnData && fnData.ok === false) throw new Error(fnData.error || "Erro na IA");

            clearInterval(progressInterval);
            setProgressValue(100);
            setProgressStatus('Análise finalizada com sucesso!');

            setProcessing(false);
            loadValidations();
            toast({ title: 'Análise Concluída', description: 'O relatório de IA está disponível.' });

            setTimeout(() => {
                setProgressStatus('');
                setProgressValue(0);
            }, 3000);

        } catch (error: any) {
            console.error('Upload erro:', error);
            clearInterval(progressInterval);
            toast({ title: 'Erro', description: error.message || 'Falha ao processar o vídeo', variant: 'destructive' });
            setProcessing(false);
            setProgressStatus('');
            setProgressValue(0);
        } finally {
            setUploading(false);
        }
    };

    const handleAprovar = async (validationId: string) => {
        try {
            const { error } = await supabase.from('video_validations').update({ decision_status: 'approved' }).eq('id', validationId);
            if (error) throw error;
            
            if (onStatusChange) onStatusChange('concluido');
            toast({ title: 'Vídeo Aprovado', description: 'A subtarefa foi marcada como Concluída.' });
            loadValidations();
        } catch (e: any) {
            console.error(e);
            toast({ title: 'Erro', description: 'Não foi possível aprovar.', variant: 'destructive' });
        }
    };

    const handleRejeitar = async (validationId: string) => {
        try {
            const { error } = await supabase.from('video_validations').update({ decision_status: 'rejected' }).eq('id', validationId);
            if (error) throw error;

            if (onStatusChange) onStatusChange('ajustes'); // Assuming 'ajustes' or 'edicao' will send it back
            toast({ title: 'Ajustes Solicitados', description: 'Status atualizado para ajustes.' });
            loadValidations();
        } catch (e: any) {
            console.error(e);
            toast({ title: 'Erro', description: 'Não foi possível solicitar ajustes.', variant: 'destructive' });
        }
    };

    return (
        <div className="space-y-4">
            {/* Upload Area */}
            <div className="p-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 flex flex-col items-center justify-center space-y-3">
                <div className="p-3 bg-rose-100 text-rose-600 rounded-full">
                    <Sparkles className="h-6 w-6" />
                </div>
                <div className="text-center">
                    <h3 className="text-sm font-bold text-slate-800">Validar Vídeo com IA</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm">
                        Envie o vídeo finalizado. O Guardião irá analisar se ele atende aos padrões do cliente e ao roteiro aprovado.
                    </p>
                </div>
                
                <div className="flex gap-2 w-full max-w-sm mt-2">
                    <input 
                        type="file" 
                        accept="video/mp4,video/quicktime,video/webm"
                        onChange={handleFileChange}
                        disabled={uploading || processing}
                        className="text-xs flex-1 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100 disabled:opacity-50 bg-white border border-slate-200 rounded-xl px-2 py-1"
                    />
                    <Button 
                        onClick={handleUploadAndValidate}
                        disabled={!file || uploading || processing}
                        className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs h-9 px-4"
                    >
                        {uploading || processing ? (
                            <div className="flex items-center gap-2">
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                <span>Processando...</span>
                            </div>
                        ) : (
                            <Upload className="h-4 w-4" />
                        )}
                    </Button>
                </div>

                {(uploading || processing) && progressStatus && (
                    <div className="w-full max-w-sm mt-4 space-y-2">
                        <div className="flex justify-between text-[10px] font-medium text-slate-500">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {progressStatus}</span>
                            <span>{Math.round(progressValue)}%</span>
                        </div>
                        <Progress value={progressValue} className="h-1.5 bg-slate-200" />
                    </div>
                )}
            </div>

            {/* Historico de Validações */}
            {validations.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase px-1">Histórico de Análises</h4>
                    {validations.map((val) => (
                        <div key={val.id} className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    {val.status === 'completed' ? (
                                        <div className="p-1.5 bg-emerald-100 text-emerald-600 rounded-full">
                                            <CheckCircle className="h-4 w-4" />
                                        </div>
                                    ) : val.status === 'processing' ? (
                                        <div className="p-1.5 bg-amber-100 text-amber-600 rounded-full">
                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                        </div>
                                    ) : (
                                        <div className="p-1.5 bg-rose-100 text-rose-600 rounded-full">
                                            <AlertCircle className="h-4 w-4" />
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">
                                            {val.status === 'processing' ? 'Analisando vídeo...' : 'Análise Concluída'}
                                        </p>
                                        <p className="text-[10px] text-slate-500">
                                            {new Date(val.created_at).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                {val.score !== null && (
                                    <div className="text-right">
                                        <span className={`text-xl font-bold ${val.score >= 90 ? 'text-emerald-600' : val.score >= 70 ? 'text-amber-500' : 'text-rose-600'}`}>
                                            {val.score}/100
                                        </span>
                                    </div>
                                )}
                            </div>

                            {val.status === 'completed' && val.ai_response && (
                                <div className="mt-2 bg-slate-50 rounded-lg p-3 border border-slate-100 text-xs text-slate-700">
                                    <p className="font-bold mb-2">Recomendação: {val.recommendation}</p>
                                    
                                    {val.ai_response?.details && (
                                        <div className="space-y-1.5 mt-3">
                                            {val.ai_response.details.map((detail: any, i: number) => (
                                                <div key={i} className="flex items-start gap-2 bg-white p-2 rounded-md border border-slate-100 shadow-sm">
                                                    <span className="text-[10px] mt-0.5">{detail.status === 'approved' ? '✅' : '❌'}</span>
                                                    <div className="flex-1">
                                                        <span className="font-bold">{detail.topic}: </span>
                                                        <span>{detail.note}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {val.decision_status === 'pending' ? (
                                        <div className="flex gap-2 mt-4 pt-3 border-t border-slate-200">
                                            <Button size="sm" variant="outline" onClick={() => handleAprovar(val.id)} className="flex-1 text-xs h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                                                Aprovar
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => handleRejeitar(val.id)} className="flex-1 text-xs h-8 border-rose-200 text-rose-700 hover:bg-rose-50">
                                                Solicitar Ajustes
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="mt-4 pt-3 border-t border-slate-200 flex justify-center">
                                            {val.decision_status === 'approved' ? (
                                                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full flex items-center gap-1">
                                                    <CheckCircle className="h-3 w-3" /> Aprovado pelo Guardião
                                                </span>
                                            ) : (
                                                <span className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-full flex items-center gap-1">
                                                    <AlertCircle className="h-3 w-3" /> Ajustes Solicitados
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
