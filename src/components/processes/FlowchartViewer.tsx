import React, { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  Position,
  Handle,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Link2 } from "lucide-react";
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';

// --- Custom Nodes (Read-only version) ---

const ProcessNode = ({ data }: any) => {
  return (
    <div className={cn(
      "px-4 py-3 min-w-[150px] rounded-2xl border-2 bg-white shadow-md transition-all",
      data.linkedProcessId ? "border-slate-200 hover:border-blue-300 hover:shadow-blue-100 cursor-pointer" : "border-slate-100"
    )}>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{data.typeLabel || "Etapa"}</span>
            {data.linkedProcessId && <Link2 className="h-3 w-3 text-blue-500 animate-pulse" />}
        </div>
        <p className="text-sm font-bold text-slate-900 leading-tight">{data.label}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
};

const DecisionNode = ({ data }: any) => {
  return (
    <div className="w-[100px] h-[100px] flex items-center justify-center relative">
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="absolute inset-0 rotate-45 border-2 border-amber-100 bg-amber-50/30 rounded-xl shadow-sm" />
      <p className="relative z-10 text-[10px] font-bold text-slate-900 text-center px-4 leading-tight">{data.label}</p>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
};

const nodeTypes = {
  process: ProcessNode,
  decision: DecisionNode,
};

interface FlowchartViewerProps {
  data: any;
  className?: string;
  onNodeClick?: (node: any) => void;
}

export function FlowchartViewer(props: FlowchartViewerProps) {
  return (
    <ReactFlowProvider>
      <FlowchartContent {...props} />
    </ReactFlowProvider>
  );
}

function FlowchartContent({ data, className, onNodeClick }: FlowchartViewerProps) {
  const { fitView } = useReactFlow();
  
  const nodes = useMemo(() => {
    if (!data || !Array.isArray(data.nodes)) return [];
    return data.nodes;
  }, [data]);

  const edges = useMemo(() => {
    if (!data || !Array.isArray(data.edges)) return [];
    return data.edges;
  }, [data]);

  const handleNodeClick = (_: any, node: any) => {
    if (onNodeClick) {
        onNodeClick(node.data);
    }
  };

  // Re-fit view when nodes change OR after a short delay (important for Tabs)
  React.useEffect(() => {
    if (nodes.length > 0) {
        const timer = setTimeout(() => {
            fitView({ duration: 400, padding: 0.2 });
        }, 100);
        return () => clearTimeout(timer);
    }
  }, [nodes, fitView]);

  if (!nodes || nodes.length === 0) {
    return (
        <div className={cn("w-full h-full min-h-[400px] bg-slate-50/50 flex flex-col items-center justify-center p-12 text-center", className)}>
            <Workflow className="h-12 w-12 text-slate-200 mb-4" />
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Fluxograma Vazio</h3>
            <p className="text-xs text-slate-400 mt-1">Este processo não possui etapas desenhadas no momento.</p>
        </div>
    );
  }

  return (
    <div className={cn("w-full h-full min-h-[400px] bg-slate-50 relative", className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        attributionPosition="bottom-right"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />
      </ReactFlow>
    </div>
  );
}

import { Workflow } from 'lucide-react';
