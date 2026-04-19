import { useState, useEffect } from "react";
import { useSession } from "@/providers/SessionProvider";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { 
  ChevronDown, 
  ChevronUp, 
  FileText, 
  Workflow, 
  ClipboardList, 
  Paperclip,
  Pencil,
  Trash2,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { ProcessFileGallery } from "@/components/processes/ProcessFileGallery";
import { ProcessHistoryTimeline } from "@/components/processes/ProcessHistoryTimeline";
import { FlowchartViewer } from "@/components/processes/FlowchartViewer";
import { History } from "lucide-react";

type ProcessRow = {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  checklists: any[];
  flowchart_json: any;
  target_role: string | null;
  is_home_flowchart: boolean;
  process_type: 'roadmap' | 'checkpoint';
  created_at: string;
  updated_at: string;
};

interface ProcessAccordionItemProps {
  process: ProcessRow;
  canManage?: boolean;
  roleName?: string;
  onEdit?: () => void;
}

export function ProcessAccordionItem({ process, canManage, roleName, onEdit }: ProcessAccordionItemProps) {
  const { user } = useSession();
  const { activeTenantId } = useTenant();
  const [isOpen, setIsOpen] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"desc" | "check" | "flow" | "files" | "history">("desc");

  useEffect(() => {
    if (isOpen && activeTenantId && process.id && user?.id) {
      // Record visit (non-blocking)
      supabase.from("process_visits").insert({
        tenant_id: activeTenantId,
        process_id: process.id,
        user_id: user.id
      }).then();
    }
  }, [isOpen, activeTenantId, process.id, user?.id]);

  const checklists = Array.isArray(process.checklists) ? process.checklists : [];

  return (
    <div className={cn(
      "overflow-hidden rounded-[28px] border border-slate-200 bg-white transition-all duration-300 shadow-sm",
      isOpen ? "ring-1 ring-[hsl(var(--byfrost-accent)/0.2)]" : "hover:border-slate-300"
    )}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-slate-50/50"
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-colors",
            isOpen ? "bg-[hsl(var(--byfrost-accent))] text-white" : "bg-slate-100 text-slate-600"
          )}>
            <ClipboardList className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900">{process.title}</h3>
            <div className="mt-1 flex items-center gap-3">
              <Badge variant="outline" className={cn(
                "rounded-full border-slate-200 bg-slate-50 text-[10px] h-5 px-2",
                process.process_type === 'roadmap' && "border-rose-200 bg-rose-50 text-rose-700 font-bold"
              )}>
                {process.process_type === 'roadmap' ? "ROADMAP" : (roleName || "Todos")}
              </Badge>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Clock className="h-3 w-3" />
                Atualizado {new Date(process.updated_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 rounded-xl text-slate-400 hover:text-slate-900"
                onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.();
                }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {isOpen ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-slate-100 p-5 pt-4 animate-in slide-in-from-top-2 duration-300">
          <div className="flex flex-wrap gap-2 mb-6">
            <button 
              onClick={() => setActiveSubTab("desc")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all",
                activeSubTab === "desc" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <FileText className="h-4 w-4" /> Descrição
            </button>
            <button 
              onClick={() => setActiveSubTab("check")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all",
                activeSubTab === "check" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <ClipboardList className="h-4 w-4" /> Checklists ({checklists.length})
            </button>
            <button 
              onClick={() => setActiveSubTab("flow")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all",
                activeSubTab === "flow" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <Workflow className="h-4 w-4" /> Fluxograma
            </button>
            <button 
              onClick={() => setActiveSubTab("files")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all",
                activeSubTab === "files" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <Paperclip className="h-4 w-4" /> Arquivos
            </button>
            <button 
              onClick={() => setActiveSubTab("history")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all",
                activeSubTab === "history" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <History className="h-4 w-4" /> Histórico
            </button>
          </div>

          <div className="min-h-[200px]">
            {activeSubTab === "desc" && (
              <div className="prose prose-sm max-w-none text-slate-600">
                {process.description ? (
                  <div dangerouslySetInnerHTML={{ __html: process.description }} />
                ) : (
                  <p className="italic text-slate-400">Nenhuma descrição fornecida para este processo.</p>
                )}
              </div>
            )}

            {activeSubTab === "check" && (
              <div className="space-y-3">
                {checklists.length > 0 ? (
                  checklists.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/50 border border-slate-100 hover:bg-slate-50 transition-colors group">
                      <Checkbox id={`check-${process.id}-${idx}`} className="mt-0.5 rounded-lg border-slate-300 data-[state=checked]:bg-[hsl(var(--byfrost-accent))] data-[state=checked]:border-[hsl(var(--byfrost-accent))]" />
                      <label 
                        htmlFor={`check-${process.id}-${idx}`}
                        className="text-sm font-medium text-slate-700 leading-tight cursor-pointer select-none group-hover:text-slate-900"
                      >
                        {typeof item === "string" ? item : item.label || "Item sem nome"}
                      </label>
                    </div>
                  ))
                ) : (
                  <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/20">
                    <p className="text-xs text-slate-400">Este processo não possui checklists.</p>
                  </div>
                )}
              </div>
            )}

            {activeSubTab === "flow" && (
              <div className="h-[400px] w-full rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
                <FlowchartViewer 
                    data={process.flowchart_json || { nodes: [], edges: [] }} 
                    onNodeClick={(data) => {
                        if (data.linkedProcessId) {
                            // In context of accordion, maybe we don't navigate away, 
                            // but we could at least show it's linked
                        }
                    }}
                />
              </div>
            )}

            {activeSubTab === "files" && (
              <ProcessFileGallery processId={process.id} />
            )}

            {activeSubTab === "history" && (
              <ProcessHistoryTimeline processId={process.id} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
