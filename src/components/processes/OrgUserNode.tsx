import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileText, ChevronRight, User, Plus, Target, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface OrgUserNodeProps {
  data: {
    userName: string;
    userEmail?: string;
    roleName: string;
    roleKey: string;
    processes: any[];
    activities?: { id: string; label: string; subordinateId?: string }[];
    onViewCargo?: () => void;
    onAddActivity?: () => void;
    onEditActivity?: (id: string) => void;
    onDeleteActivity?: (id: string) => void;
    isRoot?: boolean;
  };
  selected?: boolean;
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export const OrgUserNode = ({ data, selected }: OrgUserNodeProps) => {
  return (
    <div className={cn(
      "group relative flex flex-col min-w-[280px] rounded-[24px] border-2 bg-white p-4 shadow-xl transition-all duration-300",
      selected 
        ? "border-[hsl(var(--byfrost-accent))] ring-8 ring-[hsl(var(--byfrost-accent)/0.12)] -translate-y-1" 
        : "border-slate-200 hover:border-slate-300 hover:shadow-2xl"
    )}>
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-3 h-3 bg-slate-300 border-2 border-white shadow-sm" 
      />
      
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            "grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors font-bold",
            selected ? "bg-[hsl(var(--byfrost-accent))] text-white" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
          )}>
            {data.userName ? initials(data.userName) : <User className="h-6 w-6" />}
          </div>
          <div className="flex flex-col min-w-0">
            <h3 className="text-base font-bold text-slate-900 truncate leading-tight">
              {data.userName || 'Usuário'}
            </h3>
            <Badge variant="outline" className="w-fit rounded-full bg-slate-50 text-[9px] font-bold text-slate-400 border-slate-100 uppercase tracking-widest px-2 py-0 mt-1">
              {data.roleName || data.roleKey}
            </Badge>
          </div>
        </div>
        
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 rounded-full hover:bg-[hsl(var(--byfrost-accent)/0.1)] text-[hsl(var(--byfrost-accent))]"
          onClick={(e) => {
            e.stopPropagation();
            data.onAddActivity?.();
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Activities Section */}
      {(data.activities && data.activities.length > 0) && (
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-[0.1em]">
            <Target className="h-3 w-3 text-[hsl(var(--byfrost-accent))]" /> Atividades Chaves
          </div>
          <div className="flex flex-col gap-1.5">
            {data.activities.map((act) => (
              <div 
                key={act.id} 
                className="group/act flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 hover:border-[hsl(var(--byfrost-accent)/0.3)] transition-all cursor-default"
                onClick={(e) => { e.stopPropagation(); data.onEditActivity?.(act.id); }}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-bold text-slate-700 truncate">{act.label}</span>
                  {act.subordinateId && (
                    <span className="text-[9px] text-[hsl(var(--byfrost-accent))] font-medium">↳ Relacionada a subordinado</span>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover/act:opacity-100 transition-opacity">
                  <Trash2 
                    className="h-3 w-3 text-slate-400 hover:text-red-500 cursor-pointer" 
                    onClick={(e) => { e.stopPropagation(); data.onDeleteActivity?.(act.id); }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Processes Section */}
      <div className="flex flex-col gap-2 p-3 rounded-2xl bg-slate-50/50 border border-slate-100 transition-colors group-hover:bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            <FileText className="h-3 w-3" /> Processos
          </div>
          <Badge className="bg-slate-900 text-white text-[9px] h-4 min-w-4 px-1 rounded-md">
            {data.processes.length}
          </Badge>
        </div>
        
        {data.processes.length > 0 ? (
          <div className="space-y-1 mt-1">
            {data.processes.slice(0, 1).map((p, i) => (
              <div key={i} className="text-[10px] text-slate-600 truncate font-medium">
                • {p.title}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-slate-400 italic mt-1 font-medium">
            Nenhum processo.
          </div>
        )}

        <div 
          className="flex items-center gap-1 mt-1 text-[9px] font-bold text-[hsl(var(--byfrost-accent))] cursor-pointer hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            data.onViewCargo?.();
          }}
        >
          VER DETALHES <ChevronRight className="h-3 w-3" />
        </div>
      </div>

      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-3 h-3 bg-slate-900 border-2 border-white shadow-sm" 
      />
    </div>
  );
};
