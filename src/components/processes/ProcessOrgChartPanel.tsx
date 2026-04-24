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
  Search,
  UserPlus,
  Trash2,
  ChevronRight,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/providers/TenantProvider';
import { showError, showSuccess } from "@/utils/toast";
import { OrgUserNode } from './OrgUserNode';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const nodeTypes = {
  userNode: OrgUserNode,
};

export function ProcessOrgChartPanel() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [search, setSearch] = useState("");

  // 1. Fetch Users
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

  // 2. Fetch Roles (to get display names)
  const rolesQ = useQuery({
    queryKey: ["org_chart_roles_ref", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_roles")
        .select("role_id, roles(key, name)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        key: r.roles?.key,
        name: r.roles?.name,
      }));
    },
  });

  // 3. Fetch Org Nodes Table
  const orgNodesQ = useQuery({
    queryKey: ["org_nodes_db", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_nodes")
        .select("*")
        .eq("tenant_id", activeTenantId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 4. Fetch Processes
  const processesQ = useQuery({
    queryKey: ["org_chart_processes_ref", activeTenantId],
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

  // 5. Fetch Visual Layout (Positions) from a special process
  const layoutQ = useQuery({
    queryKey: ["org_chart_layout_storage", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processes")
        .select("flowchart_json")
        .eq("tenant_id", activeTenantId!)
        .eq("title", "__SYSTEM_ORG_CHART_LAYOUT__")
        .maybeSingle();
      if (error) throw error;
      return data?.flowchart_json || { positions: {} };
    },
  });

  // Transform to React Flow
  useEffect(() => {
    if (orgNodesQ.data && usersQ.data && rolesQ.data && processesQ.data && layoutQ.data) {
      const dbNodes = orgNodesQ.data;
      const users = usersQ.data;
      const roles = rolesQ.data;
      const processes = processesQ.data;
      const layout = layoutQ.data;

      const newNodes: Node[] = dbNodes.map((dbNode) => {
        const user = users.find(u => u.user_id === dbNode.user_id);
        const role = roles.find(r => r.key === user?.role);
        const roleProcesses = processes.filter(p => p.target_role === user?.role);
        const pos = layout.positions?.[dbNode.user_id] || { x: Math.random() * 400, y: Math.random() * 400 };

        return {
          id: dbNode.user_id,
          type: 'userNode',
          position: pos,
          data: {
            userName: user?.display_name || user?.email || 'Desconhecido',
            roleKey: user?.role,
            roleName: role?.name || user?.role,
            processes: roleProcesses,
          },
        };
      });

      const newEdges: Edge[] = dbNodes
        .filter(n => n.parent_user_id)
        .map(n => ({
          id: `e-${n.parent_user_id}-${n.user_id}`,
          source: n.parent_user_id!,
          target: n.user_id,
          animated: true,
          style: { stroke: '#64748b', strokeWidth: 2 },
        }));

      setNodes(newNodes);
      setEdges(newEdges);
    }
  }, [orgNodesQ.data, usersQ.data, rolesQ.data, processesQ.data, layoutQ.data]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#64748b', strokeWidth: 2 } }, eds)),
    [setEdges],
  );

  const saveOrgChartM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) return;

      // 1. Update org_nodes table with parent IDs
      const updates = nodes.map(node => {
        const parentEdge = edges.find(e => e.target === node.id);
        const parentId = parentEdge ? parentEdge.source : null;
        
        return supabase
          .from("org_nodes")
          .update({
            parent_user_id: parentId,
            updated_at: new Date().toISOString()
          })
          .eq("tenant_id", activeTenantId)
          .eq("user_id", node.id);
      });

      // 2. Update Layout Storage
      const positions: Record<string, { x: number, y: number }> = {};
      nodes.forEach(n => {
        positions[n.id] = n.position;
      });

      // Check if layout process exists
      const { data: existing } = await supabase
        .from("processes")
        .select("id")
        .eq("tenant_id", activeTenantId)
        .eq("title", "__SYSTEM_ORG_CHART_LAYOUT__")
        .maybeSingle();

      const layoutUpdate = existing 
        ? supabase.from("processes").update({ flowchart_json: { positions } }).eq("id", existing.id)
        : supabase.from("processes").insert({
            tenant_id: activeTenantId,
            title: "__SYSTEM_ORG_CHART_LAYOUT__",
            process_type: 'roadmap',
            flowchart_json: { positions },
            deleted_at: new Date().toISOString() // Hide from list
          });

      const results = await Promise.all([...updates, layoutUpdate]);
      const firstError = results.find(r => (r as any).error)?.error;
      if (firstError) throw firstError;
    },
    onSuccess: () => {
      showSuccess("Organograma salvo com sucesso!");
      orgNodesQ.refetch();
      layoutQ.refetch();
    },
    onError: (err: any) => showError(err.message),
  });

  const addUserToOrgM = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("org_nodes")
        .insert({
          tenant_id: activeTenantId,
          user_id: userId,
          parent_user_id: null
        });
      if (error) throw error;
    },
    onSuccess: () => {
      orgNodesQ.refetch();
      showSuccess("Usuário adicionado ao canvas.");
    },
    onError: (err: any) => showError(err.message),
  });

  const removeUserFromOrgM = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("org_nodes")
        .delete()
        .eq("tenant_id", activeTenantId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      orgNodesQ.refetch();
      showSuccess("Usuário removido do canvas.");
    },
    onError: (err: any) => showError(err.message),
  });

  const availableUsers = useMemo(() => {
    const list = usersQ.data || [];
    const inOrg = new Set(orgNodesQ.data?.map(n => n.user_id) || []);
    return list.filter(u => !inOrg.has(u.user_id) && (
      !search.trim() || 
      (u.display_name?.toLowerCase().includes(search.toLowerCase())) ||
      (u.email?.toLowerCase().includes(search.toLowerCase()))
    ));
  }, [usersQ.data, orgNodesQ.data, search]);

  return (
    <div className="flex gap-6 h-[calc(100vh-200px)] animate-in fade-in duration-500">
      {/* Sidebar: Available Users */}
      <div className="w-80 flex flex-col gap-4 bg-white rounded-[32px] border border-slate-200 shadow-sm p-6 overflow-hidden">
        <div className="flex items-center gap-2 mb-2">
            <Users className="h-5 w-5 text-[hsl(var(--byfrost-accent))]" />
            <h3 className="font-bold text-slate-900">Membros Disponíveis</h3>
        </div>
        
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
                placeholder="Buscar usuário..."
                className="pl-10 h-10 rounded-xl"
                value={search}
                onChange={e => setSearch(e.target.value)}
            />
        </div>

        <ScrollArea className="flex-1 -mx-2 px-2">
            <div className="space-y-2 py-2">
                {availableUsers.map(u => (
                    <div 
                        key={u.user_id}
                        className="group flex items-center justify-between p-3 rounded-2xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all cursor-pointer"
                        onClick={() => addUserToOrgM.mutate(u.user_id)}
                    >
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">{u.display_name || u.email}</p>
                            <Badge variant="outline" className="text-[9px] mt-0.5 px-1.5 py-0 border-slate-200 text-slate-400">
                                {u.role}
                            </Badge>
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 bg-white shadow-sm border border-slate-100">
                            <Plus className="h-4 w-4 text-[hsl(var(--byfrost-accent))]" />
                        </Button>
                    </div>
                ))}
                {availableUsers.length === 0 && (
                    <div className="py-12 text-center">
                        <Info className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                        <p className="text-[11px] text-slate-400 font-medium">Nenhum usuário para adicionar.</p>
                    </div>
                )}
            </div>
        </ScrollArea>

        <div className="pt-4 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 leading-relaxed italic">
                Dica: Clique no usuário para adicioná-lo ao canvas e começar a montar sua hierarquia.
            </p>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                <GitFork className="h-5 w-5" />
            </div>
            <div>
                <h2 className="text-sm font-bold text-slate-900">Visualização por Usuário</h2>
                <p className="text-[11px] text-slate-500">Cada caixa representa um indivíduo real da sua equipe.</p>
            </div>
            </div>
            
            <div className="flex items-center gap-2">
            <Button 
                variant="outline" 
                size="sm" 
                className="rounded-xl h-9"
                onClick={() => {
                    orgNodesQ.refetch();
                    usersQ.refetch();
                    processesQ.refetch();
                    layoutQ.refetch();
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
                {saveOrgChartM.isPending ? "Salvando..." : "Salvar Organograma"}
            </Button>
            </div>
        </div>

        <div className="flex-1 bg-slate-50 rounded-[40px] overflow-hidden border border-slate-200 shadow-inner relative">
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
                
                <Panel position="top-right" className="m-4">
                    <div className="group relative">
                        <Button 
                            variant="destructive" 
                            size="sm" 
                            className="rounded-xl h-9 shadow-lg opacity-40 hover:opacity-100 transition-opacity"
                            onClick={() => {
                                const selected = nodes.filter(n => n.selected);
                                if (selected.length > 0 && window.confirm(`Remover ${selected.length} usuários do organograma?`)) {
                                    selected.forEach(n => removeUserFromOrgM.mutate(n.id));
                                }
                            }}
                        >
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Remover Selecionados
                        </Button>
                    </div>
                </Panel>
            </ReactFlow>
        </div>
      </div>
    </div>
  );
}
