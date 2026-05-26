import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Target, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

interface OrgActivityNodeProps {
  id: string;
  data: {
    label: string;
    onChange?: (id: string, newLabel: string) => void;
    onDelete?: (id: string) => void;
  };
  selected?: boolean;
}

export const OrgActivityNode = ({ id, data, selected }: OrgActivityNodeProps) => {
  const [label, setLabel] = useState(data.label || 'Nova Atividade');
  const [isEditing, setIsEditing] = useState(false);

  const handleBlur = () => {
    setIsEditing(false);
    if (data.onChange) {
      data.onChange(id, label);
    }
  };

  return (
    <div className={cn(
      "group relative flex flex-row items-center gap-3 w-fit min-w-[200px] max-w-[320px] rounded-2xl border-2 bg-gradient-to-r from-amber-50 to-orange-50/50 p-4 shadow-md transition-all duration-300",
      selected 
        ? "border-amber-500 ring-8 ring-amber-500/10 -translate-y-0.5" 
        : "border-amber-200 hover:border-amber-300 hover:shadow-lg"
    )}>
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-3 h-3 bg-amber-400 border-2 border-white shadow-sm !top-[-1.5px]" 
      />
      
      <div className={cn(
        "grid h-10 w-10 place-items-center rounded-xl transition-all shadow-sm bg-white text-amber-500",
        selected && "scale-105 shadow-md"
      )}>
        <Target className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-0.5">Atividade Chave</p>
        {isEditing ? (
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
            className="h-7 text-xs font-bold text-slate-800 bg-white px-1.5 py-0.5 rounded border-slate-200"
            autoFocus
          />
        ) : (
          <h4 
            onClick={() => setIsEditing(true)} 
            className="text-xs font-bold text-slate-800 cursor-pointer truncate"
          >
            {label}
          </h4>
        )}
      </div>

      <button 
        onClick={(e) => {
          e.stopPropagation();
          if (data.onDelete) {
            data.onDelete(id);
          }
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-3 h-3 bg-amber-600 border-2 border-white shadow-sm !bottom-[-1.5px]" 
      />
    </div>
  );
};
