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
  Panel,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Plus, 
  Save, 
  RefreshCw,
  GitFork,
  Users,
  FileText,
  Layout
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/providers/TenantProvider';
import { showError, showSuccess } from "@/utils/toast";
import { OrgRoleNode } from './OrgRoleNode';

const nodeTypes = {
  roleNode: OrgRoleNode,
};

export function ProcessOrgChartPanel() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // 1. Fetch Roles
  const rolesQ = useQuery({
    queryKey: ["org_chart_roles", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_roles")
        .select("role_id, config_json, roles(key, name)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.role_id,
        key: r.roles?.key,
        name: r.roles?.name,
        config: r.config_json || {},
      }));
    },
  });

  // 2. Fetch Users
  const usersQ = useQuery({
    queryKey: ["org_chart_users", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id, role, display_name, email")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 3. Fetch Processes
  const processesQ = useQuery({
    queryKey: ["org_chart_processes", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processes")
        .select("id, title, target_role")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Transform data to React Flow
  useEffect(() => {
    if (rolesQ.data && usersQ.data && processesQ.data) {
      const roles = rolesQ.data;
      const users = usersQ.data;
      const processes = processesQ.data;

      const newNodes: Node[] = roles.map((role) => {
        const roleUsers = users.filter(u => u.role === role.key);
        const roleProcesses = processes.filter(p => p.target_role === role.key);
        const pos = role.config.org_pos || { x: Math.random() * 400, y: Math.random() * 400 };

        return {
          id: role.id,
          type: 'roleNode',
          position: pos,
          data: {
            label: role.name,
            roleKey: role.key,
            users: roleUsers,
            processes: roleProcesses,
          },
        };
      });

      const newEdges: Edge[] = [];
      roles.forEach(role => {
        if (role.config.parent_role_id) {
          newEdges.push({
            id: `e-${role.config.parent_role_id}-${role.id}`,
            source: role.config.parent_role_id,
            target: role.id,
            animated: true,
            style: { stroke: '#64748b', strokeWidth: 2 },
          });
        }
      });

      setNodes(newNodes);
      setEdges(newEdges);
    }
  }, [rolesQ.data, usersQ.data, processesQ.data]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#64748b', strokeWidth: 2 } }, eds)),
    [setEdges],
  );

  const saveOrgChartM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) return;

      const updates = nodes.map(node => {
        const parentEdge = edges.find(e => e.target === node.id);
        const parentId = parentEdge ? parentEdge.source : null;
        
        return supabase
          .from("tenant_roles")
          .update({
            config_json: {
              ...rolesQ.data?.find(r => r.id === node.id)?.config,
              parent_role_id: parentId,
              org_pos: node.position,
            }
          })
          .eq("tenant_id", activeTenantId)
          .eq("role_id", node.id);
      });

      const results = await Promise.all(updates);
      const firstError = results.find(r => r.error)?.error;
      if (firstError) throw firstError;
    },
    onSuccess: () => {
      showSuccess("Organograma salvo com sucesso!");
      rolesQ.refetch();
    },
    onError: (err: any) => showError(err.message),
  });

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-200px)] animate-in fade-in duration-500">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
            <GitFork className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Editor de Organograma</h2>
            <p className="text-[11px] text-slate-500">Defina a hierarquia arrastando conexões entre os cargos.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="rounded-xl h-9"
            onClick={() => {
                rolesQ.refetch();
                usersQ.refetch();
                processesQ.refetch();
            }}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Atualizar
          </Button>
          <Button 
            size="sm" 
            className="rounded-xl h-9 bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-100"
            onClick={() => saveOrgChartM.mutate()}
            disabled={saveOrgChartM.isPending}
          >
            <Save className="mr-2 h-3.5 w-3.5" />
            {saveOrgChartM.isPending ? "Salvando..." : "Salvar Layout"}
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-slate-50 rounded-[32px] overflow-hidden border border-slate-200 shadow-inner relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          className="bg-slate-50/50"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#e2e8f0" />
          <Controls className="bg-white border-slate-200 shadow-sm rounded-xl overflow-hidden mb-4 ml-4" />
          
          <Panel position="bottom-right" className="m-4">
            <div className="flex items-center gap-4 px-4 py-2 bg-white/80 backdrop-blur rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <Users className="h-3.5 w-3.5" /> {usersQ.data?.length || 0} Usuários
                </div>
                <div className="w-px h-3 bg-slate-200" />
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <FileText className="h-3.5 w-3.5" /> {processesQ.data?.length || 0} Processos
                </div>
            </div>
          </Panel>

          <Panel position="top-right" className="m-4 p-4 bg-white/90 backdrop-blur rounded-3xl border border-slate-100 shadow-xl max-w-[240px]">
            <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                <Layout className="h-3 w-3" /> Legenda
            </h4>
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[hsl(var(--byfrost-accent))]" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Hierarquia Ativa</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed italic">
                    Conecte o "Handle" inferior de um cargo ao superior de outro para criar o vínculo de gestão.
                </p>
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}
