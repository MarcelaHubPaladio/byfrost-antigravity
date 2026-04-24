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
    allUsers?: { user_id: string; display_name: string; email: string }[];
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

function firstName(name: string) {
  return name.split(' ')[0];
}

export const OrgUserNode = ({ data, selected }: OrgUserNodeProps) => {
  return (
    <div className={cn(
      "group relative flex flex-row min-w-[650px] rounded-[32px] border-2 bg-white shadow-xl transition-all duration-300 divide-x divide-slate-100 overflow-hidden",
      selected 
        ? "border-[hsl(var(--byfrost-accent))] ring-8 ring-[hsl(var(--byfrost-accent)/0.1)] -translate-y-1" 
        : "border-slate-200 hover:border-slate-300 hover:shadow-2xl"
    )}>
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-3 h-3 bg-slate-300 border-2 border-white shadow-sm !top-[-1.5px]" 
      />
      
      {/* Column 1: Persona */}
      <div className="flex-[1] flex flex-col items-center justify-center p-6 bg-slate-50/50 min-w-[180px]">
        <div className={cn(
          "grid h-16 w-16 place-items-center rounded-3xl transition-all font-black text-xl mb-4 shadow-sm",
          selected ? "bg-[hsl(var(--byfrost-accent))] text-white scale-110" : "bg-white text-slate-400 group-hover:text-slate-600 border border-slate-100"
        )}>
          {data.userName ? initials(data.userName) : <User className="h-8 w-8" />}
        </div>
        <div className="text-center">
            <h3 className="text-sm font-black text-slate-900 leading-tight">
                {data.userName || 'Usuário'}
            </h3>
            <Badge variant="outline" className="mt-2 rounded-full bg-white text-[8px] font-black text-[hsl(var(--byfrost-accent))] border-[hsl(var(--byfrost-accent)/0.2)] uppercase tracking-widest px-2 py-0">
                {data.roleName || data.roleKey}
            </Badge>
        </div>
      </div>

      {/* Column 2: Key Activities */}
      <div className="flex-[1.8] flex flex-col p-6 min-w-[280px]">
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <Target className="h-3.5 w-3.5 text-[hsl(var(--byfrost-accent))]" /> Atividades Chaves
            </div>
            <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 rounded-full hover:bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]"
                onClick={(e) => { e.stopPropagation(); data.onAddActivity?.(); }}
            >
                <Plus className="h-4 w-4" />
            </Button>
        </div>

        <div className="flex flex-col gap-2">
            {data.activities && data.activities.length > 0 ? (
                data.activities.map((act) => {
                    const relatedUser = data.allUsers?.find(u => u.user_id === act.subordinateId);
                    return (
                        <div 
                            key={act.id} 
                            className="group/act flex items-center justify-between p-2.5 rounded-2xl bg-white border border-slate-100 hover:border-[hsl(var(--byfrost-accent)/0.5)] hover:shadow-md transition-all cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); data.onEditActivity?.(act.id); }}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="flex flex-col min-w-0">
                                    <span className="text-[11px] font-bold text-slate-800 truncate">{act.label}</span>
                                    {relatedUser && (
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <div className="h-4 w-4 rounded-md bg-slate-100 flex items-center justify-center text-[7px] font-black text-slate-500 border border-slate-200">
                                                {initials(relatedUser.display_name || relatedUser.email)}
                                            </div>
                                            <span className="text-[9px] text-[hsl(var(--byfrost-accent))] font-bold italic">
                                                {firstName(relatedUser.display_name || relatedUser.email)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover/act:opacity-100 transition-opacity ml-2">
                                <Trash2 
                                    className="h-3.5 w-3.5 text-slate-300 hover:text-red-500" 
                                    onClick={(e) => { e.stopPropagation(); data.onDeleteActivity?.(act.id); }}
                                />
                            </div>
                        </div>
                    );
                })
            ) : (
                <div className="flex flex-col items-center justify-center py-6 border-2 border-dashed border-slate-50 rounded-2xl">
                    <p className="text-[10px] text-slate-300 font-bold uppercase tracking-tighter">Sem atividades</p>
                </div>
            )}
        </div>
      </div>

      {/* Column 3: Processes */}
      <div className="flex-[1.2] flex flex-col p-6 bg-slate-50/30 min-w-[200px] exclude-from-print">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
            <FileText className="h-3.5 w-3.5 text-slate-300" /> Processos
          </div>
          <Badge className="bg-slate-900 text-white text-[9px] h-5 min-w-5 px-1.5 rounded-lg shadow-sm font-black">
            {data.processes.length}
          </Badge>
        </div>
        
        <div className="flex-1 overflow-hidden">
            {data.processes.length > 0 ? (
                <div className="space-y-2">
                    {data.processes.slice(0, 2).map((p, i) => (
                    <div key={i} className="flex flex-col p-2 rounded-xl bg-white border border-slate-100 text-[10px] text-slate-600 font-bold shadow-sm truncate">
                        {p.title}
                    </div>
                    ))}
                    {data.processes.length > 2 && (
                        <p className="text-[8px] text-slate-300 font-black tracking-widest text-center mt-2">
                            + {data.processes.length - 2} ADICIONAIS
                        </p>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-full opacity-30">
                    <FileText className="h-8 w-8 text-slate-200 mb-1" />
                    <p className="text-[9px] font-black text-slate-300 uppercase">Vazio</p>
                </div>
            )}
        </div>

        <div 
          className="mt-6 flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-white border border-slate-200 text-[10px] font-black text-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent))] hover:text-white hover:border-transparent transition-all cursor-pointer shadow-sm"
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
        className="w-3 h-3 bg-slate-900 border-2 border-white shadow-sm !bottom-[-1.5px]" 
      />
    </div>
  );
};
