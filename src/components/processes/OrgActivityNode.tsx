import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Target, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrgActivityNodeProps {
  data: {
    label: string;
    description?: string;
    onDelete?: () => void;
  };
  selected?: boolean;
}

export const OrgActivityNode = ({ data, selected }: OrgActivityNodeProps) => {
  return (
    <div className={cn(
      "group relative flex flex-col min-w-[200px] rounded-[16px] border-2 bg-[hsl(var(--byfrost-accent)/0.03)] p-3 shadow-md transition-all duration-300",
      selected 
        ? "border-[hsl(var(--byfrost-accent))] ring-4 ring-[hsl(var(--byfrost-accent)/0.1)] -translate-y-0.5" 
        : "border-slate-200 border-dashed hover:border-[hsl(var(--byfrost-accent)/0.5)] hover:shadow-lg"
    )}>
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-2.5 h-2.5 bg-slate-200 border-2 border-white" 
      />
      
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1.5 rounded-lg bg-[hsl(var(--byfrost-accent))] text-white shadow-sm">
          <Target className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-wider truncate">
            Atividade Chave
          </h4>
        </div>
      </div>

      <div className="mt-1">
        <p className="text-xs font-bold text-slate-700 leading-snug">
          {data.label || 'Nova Atividade'}
        </p>
      </div>

      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-2.5 h-2.5 bg-slate-900 border-2 border-white" 
      />
    </div>
  );
};
