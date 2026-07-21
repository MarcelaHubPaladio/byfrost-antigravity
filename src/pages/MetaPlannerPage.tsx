import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { MetaPlanner } from "@/components/operacao_m30/MetaPlanner";

export default function MetaPlannerPage() {
  const nav = useNavigate();

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-slate-50/50 dark:bg-[#0B0F19]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--byfrost-accent)/0.15)] blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 h-[400px] w-[400px] translate-x-1/2 translate-y-1/2 rounded-full bg-rose-500/10 blur-[100px] dark:bg-rose-500/5" />
      </div>

      <div className="relative z-10 flex h-full flex-col p-6">
        <div className="mb-8 flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => nav("/app")}
            className="h-10 w-10 shrink-0 rounded-full hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
          >
            <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-300" />
          </Button>
          <div 
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm border" 
            style={{
              backgroundColor: 'hsl(var(--byfrost-accent)/0.1)',
              borderColor: 'hsl(var(--byfrost-accent)/0.2)',
              color: 'hsl(var(--byfrost-accent))'
            }}
          >
            <CalendarClock className="h-6 w-6" />
          </div>
          <div className="ml-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">Agendador Meta</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Agende e publique posts nas suas páginas do Facebook e Instagram</p>
          </div>
        </div>

        <div className="flex-1 overflow-auto rounded-3xl bg-white/60 dark:bg-slate-950/40 p-6 border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur-md">
          <MetaPlanner />
        </div>
      </div>
    </div>
  );
}
