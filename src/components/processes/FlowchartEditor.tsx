import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Handle,
  Position,
  Panel,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Plus, 
  Trash2, 
  MousePointer2, 
  Link2, 
  Circle, 
  Square, 
  Diamond,
  Save,
  Grid3X3,
  Maximize2,
  Minimize2,
  Workflow,
  Search,
  CheckCircle2,
  AlertCircle,
  Settings2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/providers/TenantProvider';
import { cn } from '@/lib/utils';

// --- Custom Nodes ---

const ProcessNode = ({ data, selected }: any) => {
  return (
    <div className={cn(
      "px-4 py-3 min-w-[150px] rounded-2xl border-2 bg-white shadow-lg transition-all",
      selected ? "border-slate-900 ring-4 ring-slate-100" : "border-slate-200 hover:border-slate-300"
    )}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-400 border-2 border-white" />
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{data.typeLabel || "Etapa"}</span>
            {data.linkedProcessId && <Link2 className="h-3 w-3 text-blue-500" />}
        </div>
        <p className="text-sm font-bold text-slate-900 leading-tight">{data.label}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-slate-900 border-2 border-white" />
    </div>
  );
};

const DecisionNode = ({ data, selected }: any) => {
  return (
    <div className={cn(
      "w-[120px] h-[120px] flex items-center justify-center relative transition-all",
      selected ? "scale-105" : ""
    )}>
      <Handle type="target" position={Position.Top} className="z-10 bg-slate-400 w-3 h-3" />
      <div className={cn(
        "absolute inset-0 rotate-45 border-2 bg-amber-50 shadow-md rounded-xl transition-all",
        selected ? "border-slate-900 bg-white" : "border-amber-200"
      )} />
      <p className="relative z-10 text-[11px] font-bold text-slate-900 text-center px-4 leading-tight">{data.label}</p>
      <Handle type="source" position={Position.Bottom} className="z-10 bg-slate-900 w-3 h-3" />
      <Handle type="source" position={Position.Right} id="right" className="z-10 bg-slate-900 w-3 h-3" />
      <Handle type="source" position={Position.Left} id="left" className="z-10 bg-slate-900 w-3 h-3" />
    </div>
  );
};

const nodeTypes = {
  process: ProcessNode,
  decision: DecisionNode,
};

// --- Main Editor ---

interface FlowchartEditorProps {
  value: any;
  onChange: (value: any) => void;
  readOnly?: boolean;
}

export function FlowchartEditor({ value, onChange, readOnly = false }: FlowchartEditorProps) {
  const { activeTenantId } = useTenant();
  
  const initialNodes = useMemo(() => value?.nodes || [], [value]);
  const initialEdges = useMemo(() => value?.edges || [], [value]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#64748b', strokeWidth: 2 } }, eds)),
    [setEdges],
  );

  // Sync with parent
  useEffect(() => {
    if (!readOnly) {
      onChange({ nodes, edges });
    }
  }, [nodes, edges, onChange, readOnly]);

  const addNode = (type: 'process' | 'decision') => {
    const newNode: Node = {
      id: `${type}_${Date.now()}`,
      type,
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: { label: type === 'process' ? 'Nova Etapa' : 'Nova Decisão' },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const deleteSelected = () => {
    if (selectedNode) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
      setSelectedNode(null);
    }
  };

  const updateNodeData = (newData: any) => {
    if (selectedNode) {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === selectedNode.id) {
            return { ...n, data: { ...n.data, ...newData } };
          }
          return n;
        })
      );
    }
  };

  // Fetch processes for linking
  const processesQ = useQuery({
    queryKey: ["processes_for_links", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processes")
        .select("id, title")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("title", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="flex h-full w-full bg-slate-50 relative rounded-[28px] overflow-hidden border border-slate-200 shadow-inner">
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelectedNode(node)}
          onPaneClick={() => setSelectedNode(null)}
          fitView
          className="bg-slate-50/50"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
          <Controls className="bg-white border-slate-200 shadow-sm rounded-xl overflow-hidden" />
          
          <Panel position="top-left" className="flex gap-2 p-2">
            {!readOnly && (
              <div className="flex gap-2 p-1.5 bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl ring-1 ring-slate-100">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => addNode('process')}
                    className="h-9 px-3 rounded-xl hover:bg-slate-100 font-bold text-xs"
                >
                  <Square className="mr-2 h-4 w-4 text-blue-500" /> Etapa
                </Button>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => addNode('decision')}
                    className="h-9 px-3 rounded-xl hover:bg-slate-100 font-bold text-xs"
                >
                  <Diamond className="mr-2 h-4 w-4 text-amber-500" /> Decisão
                </Button>
                <Separator orientation="vertical" className="h-4 my-auto mx-1" />
                <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={deleteSelected}
                    disabled={!selectedNode}
                    className="h-9 w-9 rounded-xl text-rose-500 hover:bg-rose-50 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </Panel>

          <Panel position="bottom-center" className="mb-4">
              <Badge variant="outline" className="bg-white/80 backdrop-blur rounded-full px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase border-slate-200 shadow-sm">
                {nodes.length} NÓS • {edges.length} CONEXÕES
              </Badge>
          </Panel>
        </ReactFlow>
      </div>

      {/* Node Properties Panel */}
      {selectedNode && !readOnly && (
        <Card className="absolute right-4 top-4 bottom-4 w-80 rounded-[28px] border-slate-200 shadow-xl animate-in slide-in-from-right-4 duration-300 overflow-hidden flex flex-col z-20">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-slate-400" /> Propriedades do Nó
            </h3>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">ID: {selectedNode.id}</p>
          </div>
          
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase">Texto do Nó</Label>
                <Input 
                  value={selectedNode.data.label as string}
                  onChange={(e) => updateNodeData({ label: e.target.value })}
                  className="rounded-xl border-slate-200 h-10 text-sm"
                />
              </div>

              {selectedNode.type === 'process' && (
                <>
                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Tipo de Etapa</Label>
                        <Select 
                            value={selectedNode.data.typeLabel || 'Etapa'} 
                            onValueChange={(v) => updateNodeData({ typeLabel: v })}
                        >
                            <SelectTrigger className="rounded-xl border-slate-200 h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                                <SelectItem value="Etapa">Etapa Padrão</SelectItem>
                                <SelectItem value="Ação">Ação Requerida</SelectItem>
                                <SelectItem value="Marco">Marco Importante</SelectItem>
                                <SelectItem value="Início">Início do Fluxo</SelectItem>
                                <SelectItem value="Fim">Fim do Fluxo</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                            <Link2 className="h-3 w-3" /> Vínculo com Processo
                        </Label>
                        <Select 
                            value={selectedNode.data.linkedProcessId || 'none'} 
                            onValueChange={(v) => updateNodeData({ linkedProcessId: v === 'none' ? null : v })}
                        >
                            <SelectTrigger className="rounded-xl border-slate-200 h-10 text-xs">
                                <SelectValue placeholder="Selecione um processo..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl max-h-60 overflow-y-auto">
                                <SelectItem value="none">Nenhum vínculo</SelectItem>
                                {processesQ.data?.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-[10px] text-slate-400 px-1 italic">
                        Ao clicar neste nó no Mapa Geral, o usuário será levado a este processo.
                        </p>
                    </div>
                </>
              )}
            </div>
          </ScrollArea>
          
          <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex justify-end">
            <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedNode(null)}
                className="rounded-xl h-9 px-4 text-xs font-bold"
            >
              Fechar
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
