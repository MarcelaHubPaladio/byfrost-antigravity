import { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { TransitionBlockReason } from "@/lib/journeys/validation";

interface TransitionBlockDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    nextStateName: string;
    blocks: TransitionBlockReason[];
}

export function TransitionBlockDialog({ open, onOpenChange, nextStateName, blocks }: TransitionBlockDialogProps) {
    if (blocks.length === 0) return null;

    const renderBlocks = (): ReactNode[] => {
        return blocks.map((b, i) => {
            if (b.type === "missing_fields") {
                return (
                    <div key={`block-${i}`}>
                        <strong>Campos Obrigatórios Pendentes:</strong>{" "}
                        {(b.fields || []).map((f) => (
                            <span key={f} className="inline-block bg-slate-100 px-2 py-0.5 rounded text-xs mr-1">
                                {f}
                            </span>
                        ))}
                    </div>
                );
            }
            if (b.type === "open_pendencies") {
                return (
                    <div key={`block-${i}`}>
                        <strong>Tarefas Incompletas:</strong>
                        <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">
                            {b.missingTypes.map((t) => <li key={t}>{t}</li>)}
                        </ul>
                    </div>
                );
            }
            if (b.type === "missing_attachments") {
                return (
                    <div key={`block-${i}`}>
                        <strong>Anexos Faltantes (obrigatório):</strong>
                        <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">
                            {b.missingTypes.map((t) => <li key={t}>{t}</li>)}
                        </ul>
                    </div>
                );
            }
            if (b.type === "missing_justifications") {
                return (
                    <div key={`block-${i}`}>
                        <strong>Justificativas Faltantes (obrigatório):</strong>
                        <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">
                            {b.missingTypes.map((t) => <li key={t}>{t}</li>)}
                        </ul>
                    </div>
                );
            }
            return null;
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="text-red-700 flex items-center gap-2">
                        <LogOut className="w-5 h-5" />
                        Transição Bloqueada
                    </DialogTitle>
                </DialogHeader>
                <DialogDescription asChild>
                    <div className="flex flex-col gap-3 mt-4 text-sm text-slate-700">
                        <p>Não foi possível mover o caso para o status <strong>{nextStateName}</strong> devido às seguintes pendências:</p>
                        <div className="flex flex-col gap-2 p-3 bg-red-50 text-red-900 rounded border border-red-100">
                            {renderBlocks()}
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                            Por favor, abra o caso para preencher os dados ou responda as tarefas pendentes e tente novamente.
                        </p>
                    </div>
                </DialogDescription>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Entendi
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
