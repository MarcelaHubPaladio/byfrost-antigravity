import { useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Target, Trophy } from "lucide-react";

interface GoalCelebrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    goalName: string;
    progress: number;
    target: number;
}

export function GoalCelebrationModal({ isOpen, onClose, goalName, progress, target }: GoalCelebrationModalProps) {
    useEffect(() => {
        if (isOpen) {
            let script = document.getElementById("canvas-confetti-script") as HTMLScriptElement;
            
            const fireConfetti = () => {
                const duration = 3000;
                const end = Date.now() + duration;

                const frame = () => {
                    (window as any).confetti({
                        particleCount: 5,
                        angle: 60,
                        spread: 55,
                        origin: { x: 0 },
                        colors: ['#6366f1', '#a855f7', '#fbbf24']
                    });
                    (window as any).confetti({
                        particleCount: 5,
                        angle: 120,
                        spread: 55,
                        origin: { x: 1 },
                        colors: ['#6366f1', '#a855f7', '#fbbf24']
                    });

                    if (Date.now() < end) {
                        requestAnimationFrame(frame);
                    }
                };
                frame();
            };

            if (!script) {
                script = document.createElement("script");
                script.id = "canvas-confetti-script";
                script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js";
                script.onload = fireConfetti;
                document.body.appendChild(script);
            } else {
                fireConfetti();
            }
        }
    }, [isOpen]);

    const pct = Math.min(100, Math.round((progress / target) * 100)) || 0;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md text-center border-none shadow-2xl overflow-hidden rounded-[2rem]">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 pointer-events-none" />
                <div className="relative flex flex-col items-center justify-center p-6 space-y-4">
                    <div className="w-20 h-20 bg-gradient-to-br from-amber-200 to-amber-400 text-amber-700 rounded-full flex items-center justify-center mb-2 shadow-lg shadow-amber-200/50 animate-bounce">
                        <Trophy className="w-10 h-10" />
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Mandou bem!</h2>
                    <p className="text-slate-500 font-medium">Você concluiu uma tarefa e ela foi contabilizada na meta:</p>
                    
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 w-full text-left space-y-4 mt-6 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                            <Target className="w-24 h-24" />
                        </div>
                        <div className="flex items-center gap-3 font-black text-slate-800 text-lg relative z-10">
                            <Target className="w-5 h-5 text-indigo-500" />
                            {goalName}
                        </div>
                        <div className="space-y-1 relative z-10">
                            <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                                <span className="text-indigo-600">{progress} CONCLUÍDOS</span>
                                <span>ALVO: {target}</span>
                            </div>
                            <Progress value={pct} className="h-3 bg-slate-100 [&>div]:bg-indigo-500" />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
