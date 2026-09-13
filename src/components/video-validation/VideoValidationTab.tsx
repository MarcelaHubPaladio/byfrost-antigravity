import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, AlertCircle, RefreshCw, Sparkles, Play, Settings2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
    onValidationResult?: (result: any) => void
}) {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [processing, setProcessing] = useState(false);
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
        try {
            // Upload to Supabase Storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${tenantId}/${caseId}/${subtaskId}_${Date.now()}.${fileExt}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('video_validations')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

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
            const { error: fnError } = await supabase.functions.invoke('video-validation-ai', {
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

            setProcessing(false);
            loadValidations();
            toast({ title: 'Análise Concluída', description: 'O relatório de IA está disponível.' });

        } catch (error: any) {
            console.error('Upload erro:', error);
            toast({ title: 'Erro', description: error.message || 'Falha ao processar o vídeo', variant: 'destructive' });
            setProcessing(false);
        } finally {
            setUploading(false);
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
                        className="text-xs flex-1 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100 bg-white border border-slate-200 rounded-xl px-2 py-1"
                    />
                    <Button 
                        onClick={handleUploadAndValidate}
                        disabled={!file || uploading || processing}
                        className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs h-9"
                    >
                        {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </Button>
                </div>
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
                                    <pre className="whitespace-pre-wrap font-mono text-[10px] overflow-auto max-h-40">
                                        {JSON.stringify(val.ai_response, null, 2)}
                                    </pre>
                                    
                                    <div className="flex gap-2 mt-4 pt-3 border-t border-slate-200">
                                        <Button size="sm" variant="outline" className="flex-1 text-xs h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                                            Aprovar
                                        </Button>
                                        <Button size="sm" variant="outline" className="flex-1 text-xs h-8 border-rose-200 text-rose-700 hover:bg-rose-50">
                                            Solicitar Ajustes
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
