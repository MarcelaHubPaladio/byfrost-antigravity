import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import { CheckCircle2, Paperclip, MessageSquareText } from "lucide-react";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB

async function fileToDataUrl(file: File) {
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo"));
        reader.readAsDataURL(file);
    });
}

export function PendencyResolver({
    tenantId,
    caseId,
    pendency,
    className,
}: {
    tenantId: string;
    caseId: string;
    pendency: any;
    className?: string;
}) {
    const qc = useQueryClient();
    const fileRef = useRef<HTMLInputElement | null>(null);

    const [open, setOpen] = useState(false);
    const [justification, setJustification] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [dataUrl, setDataUrl] = useState<string>("");
    const [reading, setReading] = useState(false);
    const [saving, setSaving] = useState(false);

    const requireJustification = pendency?.metadata_json?.require_justification === true;
    const requireAttachment = pendency?.metadata_json?.require_attachment === true;

    const reset = () => {
        setJustification("");
        setFile(null);
        setDataUrl("");
        setReading(false);
        setSaving(false);
        if (fileRef.current) fileRef.current.value = "";
    };

    const onPick = async (next: File | null) => {
        setFile(next);
        setDataUrl("");
        if (!next) return;

        if (next.size > MAX_IMAGE_BYTES) {
            showError("Arquivo muito grande. Limite: 4MB.");
            reset();
            return;
        }

        setReading(true);
        try {
            const url = await fileToDataUrl(next);
            setDataUrl(url);
        } catch (e: any) {
            showError(`Falha ao ler arquivo: ${e?.message ?? "erro"}`);
            reset();
        } finally {
            setReading(false);
        }
    };

    const save = async () => {
        if (!tenantId || !caseId) return;

        if (requireJustification && !justification.trim()) {
            showError("A justificativa é obrigatória.");
            return;
        }

        if (requireAttachment && !dataUrl) {
            showError("O anexo é obrigatório.");
            return;
        }

        setSaving(true);
        try {
            // 1. Upload attachment if exists
            if (dataUrl) {
                const { error: attErr } = await supabase.from("pendency_attachments").insert({
                    pendency_id: pendency.id,
                    storage_path: dataUrl,
                    // content_type could also be added if the schema supports it, but keeping it minimal
                });
                if (attErr) throw attErr;
            }

            // 2. Mark pendency as answered
            const { error: pendErr } = await supabase
                .from("pendencies")
                .update({
                    status: "answered",
                    answered_text: justification.trim() || null,
                })
                .eq("id", pendency.id);

            if (pendErr) throw pendErr;

            // 3. Log event
            await supabase.from("timeline_events").insert({
                tenant_id: tenantId,
                case_id: caseId,
                event_type: "task_completed",
                actor_type: "admin",
                message: `Pendência respondida: ${pendency.question_text}`,
                meta_json: {
                    pendency_id: pendency.id,
                    has_attachment: !!dataUrl,
                    has_justification: !!justification.trim(),
                },
                occurred_at: new Date().toISOString(),
            });

            await Promise.all([
                qc.invalidateQueries({ queryKey: ["pendencies", tenantId, caseId] }),
                qc.invalidateQueries({ queryKey: ["timeline", tenantId, caseId] }),
            ]);

            showSuccess("Pendência resolvida.");
            setOpen(false);
            reset();
        } catch (e: any) {
            showError(`Falha ao resolver pendência: ${e?.message ?? "erro"}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                setOpen(v);
                if (!v) reset();
            }}
        >
            <DialogTrigger asChild>
                <Button
                    type="button"
                    className={cn("h-8 rounded-xl px-3 text-xs", className)}
                    variant="outline"
                >
                    Responder
                </Button>
            </DialogTrigger>

            <DialogContent className="w-[95vw] max-w-[500px] rounded-[24px] border-slate-200 bg-white p-6 shadow-xl">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold text-slate-900">
                        Resolver Pendência
                    </DialogTitle>
                    <DialogDescription className="mt-1.5 text-sm text-slate-600">
                        {pendency.question_text}
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-6 grid gap-5">
                    {requireJustification && (
                        <div>
                            <Label className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                                <MessageSquareText className="h-4 w-4 text-slate-500" />
                                Justificativa <span className="text-rose-500">*</span>
                            </Label>
                            <Textarea
                                value={justification}
                                onChange={(e) => setJustification(e.target.value)}
                                placeholder="Descreva a conclusão da tarefa..."
                                className="mt-2 min-h-[100px] rounded-2xl resize-none"
                            />
                        </div>
                    )}

                    {!requireJustification && (
                        <div>
                            <Label className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                                <MessageSquareText className="h-4 w-4 text-slate-500" />
                                Justificativa (opcional)
                            </Label>
                            <Textarea
                                value={justification}
                                onChange={(e) => setJustification(e.target.value)}
                                placeholder="Observações adicionais..."
                                className="mt-2 min-h-[80px] rounded-2xl resize-none"
                            />
                        </div>
                    )}

                    {requireAttachment && (
                        <div>
                            <Label className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                                <Paperclip className="h-4 w-4 text-slate-500" />
                                Anexo Comprobatório <span className="text-rose-500">*</span>
                            </Label>
                            <Input
                                ref={fileRef}
                                type="file"
                                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                                className={cn(
                                    "mt-2 rounded-2xl",
                                    "file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700"
                                )}
                            />
                            <div className="mt-1 text-[11px] text-slate-500">
                                {reading
                                    ? "Processando..."
                                    : file
                                        ? `${file.name} (${Math.round(file.size / 1024)} KB)`
                                        : "Anexo obrigatório para esta tarefa. (Até 4MB)"}
                            </div>
                        </div>
                    )}

                    {!requireAttachment && (
                        <div>
                            <Label className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                                <Paperclip className="h-4 w-4 text-slate-500" />
                                Anexo Opcional
                            </Label>
                            <Input
                                ref={fileRef}
                                type="file"
                                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                                className={cn(
                                    "mt-2 rounded-2xl",
                                    "file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700"
                                )}
                            />
                            <div className="mt-1 text-[11px] text-slate-500">
                                {file ? file.name : "Anexe arquivos se necessário. (Até 4MB)"}
                            </div>
                        </div>
                    )}

                    <div className="mt-2 flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            className="h-10 rounded-2xl"
                            onClick={() => setOpen(false)}
                            disabled={saving}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-5 text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                            onClick={save}
                            disabled={
                                saving ||
                                reading ||
                                (requireJustification && !justification.trim()) ||
                                (requireAttachment && !dataUrl)
                            }
                        >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            {saving ? "Salvando..." : "Concluir Tarefa"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
