import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { 
  History, 
  User, 
  Calendar, 
  ChevronRight,
  GitBranch,
  MessageSquare
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface ProcessHistoryTimelineProps {
  processId: string;
}

type ProcessVersion = {
  id: string;
  version_number: number;
  change_summary: string | null;
  created_at: string;
  title: string;
  created_by: string;
  users_profile: {
    display_name: string | null;
  } | null;
};

export function ProcessHistoryTimeline({ processId }: ProcessHistoryTimelineProps) {
  const { data: versions, isLoading } = useQuery({
    queryKey: ["process_history", processId],
    enabled: !!processId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_versions")
        .select(`
          *,
          users_profile!created_by (
            display_name
          )
        `)
        .eq("process_id", processId)
        .order("version_number", { ascending: false });
      
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center bg-slate-50/50 rounded-[28px] border border-dashed border-slate-200">
        <History className="h-10 w-10 text-slate-200 mb-2" />
        <p className="text-sm font-medium text-slate-400">Nenhum histórico disponível para este processo.</p>
      </div>
    );
  }

  return (
    <div className="relative pl-8 space-y-8 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
      {versions.map((v, idx) => (
        <div key={v.id} className="relative group animate-in slide-in-from-left-4 duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
          {/* Timeline Dot */}
          <div className={cn(
            "absolute -left-[32px] top-0 flex h-8 w-8 items-center justify-center rounded-full border-4 border-white shadow-sm ring-1 transition-all",
            idx === 0 
                ? "bg-[hsl(var(--byfrost-accent))] ring-[hsl(var(--byfrost-accent)/0.2)]" 
                : "bg-slate-100 ring-slate-200"
          )}>
            <GitBranch className={cn("h-3.5 w-3.5", idx === 0 ? "text-white" : "text-slate-400")} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Badge className={cn(
                    "rounded-full px-2.5 h-6 text-[10px] font-bold tracking-wider",
                    idx === 0 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}>
                  VERSÃO {v.version_number}
                </Badge>
                {idx === 0 && (
                    <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                        ATUAL
                    </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <Calendar className="h-3 w-3" />
                {format(new Date(v.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
              </div>
            </div>

            <div className={cn(
              "rounded-[22px] border p-4 transition-all shadow-sm",
              idx === 0 ? "bg-white border-slate-200 ring-1 ring-slate-100" : "bg-slate-50/50 border-slate-100"
            )}>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <User className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {v.users_profile?.display_name || "Usuário do Sistema"}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-slate-300 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600 italic leading-relaxed">
                      {v.change_summary || "Sem descrição da alteração."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
