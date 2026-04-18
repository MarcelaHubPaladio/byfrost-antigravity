import { useState } from "react";
import { Workflow, MousePointer2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Node = {
  id: string;
  label: string;
  x: number;
  y: number;
  type?: "start" | "end" | "process" | "decision";
  linkedProcessId?: string;
};

type Edge = {
  from: string;
  to: string;
  label?: string;
};

type FlowchartData = {
  nodes: Node[];
  edges: Edge[];
};

interface FlowchartViewerProps {
  data: FlowchartData;
  onNodeClick?: (node: Node) => void;
  className?: string;
}

export function FlowchartViewer({ data, onNodeClick, className }: FlowchartViewerProps) {
  const nodes = data?.nodes || [];
  const edges = data?.edges || [];

  const getNodePos = (id: string) => {
    const node = nodes.find(n => n.id === id);
    return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
  };

  return (
    <div className={cn("relative w-full overflow-auto bg-slate-50/50 rounded-2xl border border-slate-200 p-8 min-h-[400px]", className)}>
      <svg className="absolute inset-0 h-full w-full pointer-events-none">
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#cbd5e1" />
          </marker>
        </defs>
        {edges.map((edge, i) => {
          const from = getNodePos(edge.from);
          const to = getNodePos(edge.to);
          return (
            <line
              key={i}
              x1={from.x + 80}
              y1={from.y + 30}
              x2={to.x + 80}
              y2={to.y + 30}
              stroke="#cbd5e1"
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
            />
          );
        })}
      </svg>

      <div className="relative">
        {nodes.map(node => (
          <button
            key={node.id}
            onClick={() => onNodeClick?.(node)}
            style={{ left: node.x, top: node.y }}
            className={cn(
              "absolute flex h-[60px] w-[160px] items-center justify-center border-2 px-3 text-center transition-all bg-white shadow-sm ring-offset-2 hover:scale-105 active:scale-95 z-10",
              node.type === "start" ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 font-bold" :
              node.type === "end" ? "rounded-full border-rose-200 bg-rose-50 text-rose-700 font-bold" :
              node.type === "decision" ? "rotate-45 border-amber-200 bg-amber-50 text-amber-700" :
              "rounded-xl border-slate-100 bg-white text-slate-700 font-medium hover:border-[hsl(var(--byfrost-accent))]"
            )}
          >
            <div className={cn(node.type === "decision" ? "-rotate-45" : "", "flex items-center gap-1.5")}>
              <span className="text-[11px] leading-tight line-clamp-2">{node.label}</span>
              {node.linkedProcessId && <MousePointer2 className="h-3 w-3 text-blue-500" />}
            </div>
          </button>
        ))}
      </div>

      {nodes.length === 0 && (
        <div className="flex h-[300px] flex-col items-center justify-center text-slate-400">
          <Workflow className="h-10 w-10 mb-2 opacity-20" />
          <p className="text-xs font-medium italic">Nenhum dado de fluxograma disponível.</p>
        </div>
      )}
    </div>
  );
}
