import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Users, FileText, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface OrgRoleNodeProps {
  data: {
    label: string;
    users: any[];
    processes: any[];
    roleKey: string;
    isRoot?: boolean;
  };
  selected?: boolean;
}

export const OrgRoleNode = ({ data, selected }: OrgRoleNodeProps) => {
  return (
    <div className={cn(
      "group relative flex flex-col min-w-[280px] rounded-[24px] border-2 bg-white p-5 shadow-xl transition-all duration-300",
      selected 
        ? "border-[hsl(var(--byfrost-accent))] ring-8 ring-[hsl(var(--byfrost-accent)/0.12)] -translate-y-1" 
        : "border-slate-200 hover:border-slate-300 hover:shadow-2xl"
    )}>
      {/* Hierarchy Handles */}
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-3 h-3 bg-slate-300 border-2 border-white shadow-sm" 
      />
      
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex flex-col gap-1 min-w-0">
          <Badge variant="outline" className="w-fit rounded-full bg-slate-50 text-[10px] font-bold text-slate-400 border-slate-100 uppercase tracking-widest px-2 py-0">
            {data.roleKey}
          </Badge>
          <h3 className="text-lg font-bold text-slate-900 truncate leading-tight mt-1">
            {data.label}
          </h3>
        </div>
        <div className={cn(
          "grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors",
          selected ? "bg-[hsl(var(--byfrost-accent))] text-white" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
        )}>
          <Users className="h-6 w-6" />
        </div>
      </div>

      {/* Content Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2 p-3 rounded-2xl bg-slate-50/50 border border-slate-100 transition-colors group-hover:bg-white">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <Users className="h-3 w-3" /> Equipe
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xl font-black text-slate-900 leading-none">{data.users.length}</span>
            <span className="text-[10px] font-bold text-slate-400">MEMBROS</span>
          </div>
          {/* User Avatars Placeholder */}
          <div className="flex -space-x-2 mt-1">
            {data.users.slice(0, 3).map((u, i) => (
              <div key={i} className="h-6 w-6 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-500 overflow-hidden">
                {u.display_name?.slice(0, 1) || 'U'}
              </div>
            ))}
            {data.users.length > 3 && (
              <div className="h-6 w-6 rounded-full border-2 border-white bg-slate-900 flex items-center justify-center text-[8px] font-bold text-white">
                +{data.users.length - 3}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 p-3 rounded-2xl bg-slate-50/50 border border-slate-100 transition-colors group-hover:bg-white">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <FileText className="h-3 w-3" /> Processos
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xl font-black text-slate-900 leading-none">{data.processes.length}</span>
            <span className="text-[10px] font-bold text-slate-400">GUIAS</span>
          </div>
          <div className="flex items-center gap-1 mt-1 text-[9px] font-bold text-[hsl(var(--byfrost-accent))] group-hover:translate-x-1 transition-transform cursor-pointer">
            VER REPOSITÓRIO <ChevronRight className="h-3 w-3" />
          </div>
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
