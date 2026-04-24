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
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
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
  Info,
  Target,
  Printer
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
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface ProcessOrgChartPanelProps {
  onViewCargo?: (roleName: string) => void;
}

const nodeTypes = {
  userNode: OrgUserNode,
};

export function ProcessOrgChartPanel({ onViewCargo }: ProcessOrgChartPanelProps) {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();
  const { getNodes, getEdges, fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [search, setSearch] = useState("");
  
  const [activityModal, setActivityModal] = useState<{
    isOpen: boolean;
    nodeId: string;
    activityId?: string;
    label: string;
    subordinateId: string;
  }>({
    isOpen: false,
    nodeId: "",
    label: "",
    subordinateId: "none"
  });

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

  // 2. Fetch Roles
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

  // 5. Fetch Visual Layout
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
      return data?.flowchart_json || { positions: {}, activities: {} };
    },
  });

  const handleAddActivity = useCallback((nodeId: string) => {
    setActivityModal({
        isOpen: true,
        nodeId,
        label: "",
        subordinateId: "none"
    });
  }, []);

  const handleEditActivity = useCallback((nodeId: string, activityId: string) => {
    setNodes((nds) => {
        const node = nds.find(n => n.id === nodeId);
        const activity = node?.data.activities?.find((a: any) => a.id === activityId);
        
        if (activity) {
            setActivityModal({
                isOpen: true,
                nodeId,
                activityId,
                label: activity.label,
                subordinateId: activity.subordinateId || "none"
            });
        }
        return nds;
    });
  }, [setNodes]);

  const handleSaveActivity = () => {
    if (!activityModal.label.trim()) {
        showError("O nome da atividade é obrigatório.");
        return;
    }

    setNodes((nds) => nds.map((n) => {
        if (n.id === activityModal.nodeId) {
            let activities = [...(n.data.activities || [])];
            const subId = activityModal.subordinateId === "none" ? undefined : activityModal.subordinateId;

            if (activityModal.activityId) {
                // Edit
                activities = activities.map(a => a.id === activityModal.activityId 
                    ? { ...a, label: activityModal.label, subordinateId: subId } 
                    : a
                );
            } else {
                // Add
                activities.push({
                    id: crypto.randomUUID(),
                    label: activityModal.label,
                    subordinateId: subId
                });
            }
            return { ...n, data: { ...n.data, activities } };
        }
        return n;
    }));

    setActivityModal(prev => ({ ...prev, isOpen: false }));
    showSuccess(activityModal.activityId ? "Atividade atualizada." : "Atividade adicionada.");
  };

  const handleDeleteActivity = useCallback((nodeId: string, activityId: string) => {
    setNodes((nds) => nds.map((n) => {
      if (n.id === nodeId) {
        const activities = (n.data.activities || []).filter((a: any) => a.id !== activityId);
        return { ...n, data: { ...n.data, activities } };
      }
      return n;
    }));
  }, [setNodes]);

  const allUsers = useMemo(() => {
    return usersQ.data || [];
  }, [usersQ.data]);

  const handlePrint = async () => {
    try {
      showSuccess("Gerando visualização de alta fidelidade...");
      
      const nodes = getNodes();
      if (nodes.length === 0) return;

      // 1. Calculate bounds of all nodes
      const bounds = getNodesBounds(nodes);
      const padding = 100; // Add some breathing room

      const element = document.querySelector('.react-flow__viewport') as HTMLElement;
      if (!element) return;

      // 2. Generate PNG with manual bounds to ensure nothing is cut
      const dataUrl = await toPng(element, { 
        backgroundColor: '#fff',
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
        style: {
          width: `${bounds.width + padding * 2}px`,
          height: `${bounds.height + padding * 2}px`,
          // This transform ensures we capture from the top-left of the structure
          transform: `translate(${-bounds.x + padding}px, ${-bounds.y + padding}px) scale(1)`,
        },
        pixelRatio: 2
      });

      // 3. Create a print-friendly window
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      printWindow.document.write(`
        <html>
          <head>
            <title>Organograma - Byfrost</title>
            <style>
              body { 
                margin: 0; 
                padding: 40px;
                display: flex; 
                flex-direction: column;
                align-items: center; 
                background: #f8fafc; 
                font-family: sans-serif;
              }
              img { 
                max-width: 100%; 
                height: auto; 
                box-shadow: 0 20px 50px rgba(0,0,0,0.1);
                border-radius: 20px;
                background: white;
              }
              .header {
                width: 100%;
                max-width: 1200px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 30px;
              }
              .title { font-weight: 900; font-size: 24px; color: #0f172a; }
              .date { font-weight: 500; font-size: 14px; color: #64748b; }
              
              @media print {
                @page { size: landscape; margin: 0; }
                body { padding: 0; background: white; }
                img { box-shadow: none; border-radius: 0; }
                .header { display: none; }
              }
            </style>
          </head>
          <body>
            <div class="header">
                <span class="title">ORGANOGRAMA CORPORATIVO</span>
                <span class="date">${new Date().toLocaleDateString('pt-BR')}</span>
            </div>
            <img src="${dataUrl}" />
            <script>
              window.onload = () => {
                setTimeout(() => {
                  window.print();
                }, 800);
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err: any) {
      console.error(err);
      showError("Erro ao gerar impressão: " + err.message);
    }
  };

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
        const activities = layout.activities?.[dbNode.user_id] || [];

        return {
          id: dbNode.user_id,
          type: 'userNode',
          position: pos,
          data: {
            userName: user?.display_name || user?.email || 'Desconhecido',
            roleKey: user?.role,
            roleName: role?.name || user?.role,
            processes: roleProcesses,
            activities: activities,
            allUsers: allUsers,
            onViewCargo: () => onViewCargo?.(role?.name || user?.role || ''),
            onAddActivity: () => handleAddActivity(dbNode.user_id),
            onEditActivity: (id: string) => handleEditActivity(dbNode.user_id, id),
            onDeleteActivity: (id: string) => handleDeleteActivity(dbNode.user_id, id),
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

      // 1. Update org_nodes table
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
      const activities: Record<string, any[]> = {};
      
      nodes.forEach(n => {
        positions[n.id] = n.position;
        activities[n.id] = n.data.activities || [];
      });

      const flowchart_json = {
        positions,
        activities
      };

      const { data: existing } = await supabase
        .from("processes")
        .select("id")
        .eq("tenant_id", activeTenantId)
        .eq("title", "__SYSTEM_ORG_CHART_LAYOUT__")
        .maybeSingle();

      const layoutUpdate = existing 
        ? supabase.from("processes").update({ flowchart_json }).eq("id", existing.id)
        : supabase.from("processes").insert({
            tenant_id: activeTenantId,
            title: "__SYSTEM_ORG_CHART_LAYOUT__",
            process_type: 'roadmap',
            flowchart_json,
            deleted_at: new Date().toISOString()
          });

      const results = await Promise.all([...updates, layoutUpdate]);
      const firstError = results.find(r => (r as any).error)?.error;
      if (firstError) throw firstError;
    },
    onSuccess: () => {
      showSuccess("Organograma e Atividades salvos com sucesso!");
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
      showSuccess("Usuário removido.");
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
                        <Plus className="h-4 w-4 text-[hsl(var(--byfrost-accent))]" />
                    </div>
                ))}
            </div>
        </ScrollArea>
        
        <div className="pt-4 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 leading-relaxed italic">
                Clique no "+" de cada card para adicionar atividades específicas e relacioná-las a subordinados.
            </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                <GitFork className="h-5 w-5" />
            </div>
            <div>
                <h2 className="text-sm font-bold text-slate-900">Editor de Organograma</h2>
                <p className="text-[11px] text-slate-500">Mapeie a estrutura e as atividades chaves de cada membro.</p>
            </div>
            </div>
            
            <div className="flex items-center gap-2">
            <Button 
                variant="outline" 
                size="sm" 
                className="rounded-xl h-9 border-slate-200" 
                onClick={handlePrint}
            >
                <Printer className="mr-2 h-3.5 w-3.5" /> PDF / Imprimir
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl h-9" onClick={() => qc.invalidateQueries()}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Atualizar
            </Button>
            <Button 
                size="sm" 
                className="rounded-xl h-9 bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-100"
                onClick={() => saveOrgChartM.mutate()}
                disabled={saveOrgChartM.isPending}
            >
                <Save className="mr-2 h-3.5 w-3.5" />
                {saveOrgChartM.isPending ? "Salvando..." : "Salvar Tudo"}
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
                    <Button 
                        variant="destructive" 
                        size="sm" 
                        className="rounded-xl h-9 shadow-lg opacity-40 hover:opacity-100 transition-opacity"
                        onClick={() => {
                            const selected = nodes.filter(n => n.selected);
                            if (selected.length > 0 && window.confirm(`Remover selecionados?`)) {
                                selected.forEach(n => removeUserFromOrgM.mutate(n.id));
                            }
                        }}
                    >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Remover
                    </Button>
                </Panel>
            </ReactFlow>
        </div>
      </div>

      {/* Activity CRUD Modal */}
      <Dialog open={activityModal.isOpen} onOpenChange={(open) => setActivityModal(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="sm:max-w-[425px] rounded-[32px] border-none shadow-2xl p-8">
            <DialogHeader className="mb-6">
                <div className="bg-[hsl(var(--byfrost-accent)/0.12)] w-fit p-3 rounded-2xl mb-4">
                    <Target className="h-6 w-6 text-[hsl(var(--byfrost-accent))]" />
                </div>
                <DialogTitle className="text-2xl font-black text-slate-900 leading-tight">
                    {activityModal.activityId ? "Editar Atividade" : "Nova Atividade Chave"}
                </DialogTitle>
                <DialogDescription className="text-slate-500 font-medium mt-2">
                    Defina o nome da atividade e vincule a um membro da equipe se necessário.
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-2">
                <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                        NOME DA ATIVIDADE
                    </Label>
                    <Input 
                        placeholder="Ex: Revisão de Contratos" 
                        value={activityModal.label}
                        onChange={e => setActivityModal(prev => ({ ...prev, label: e.target.value }))}
                        className="h-12 rounded-xl bg-slate-50 border-slate-100 focus:bg-white transition-all font-bold text-slate-900"
                    />
                </div>

                <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                        MEMBRO RELACIONADO
                    </Label>
                    <Select 
                        value={activityModal.subordinateId} 
                        onValueChange={val => setActivityModal(prev => ({ ...prev, subordinateId: val }))}
                    >
                        <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-slate-100 font-bold text-slate-700">
                            <SelectValue placeholder="Nenhum (Geral)" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-slate-100 shadow-xl p-1 max-h-[200px]">
                            <SelectItem value="none" className="rounded-lg font-bold text-slate-400">Nenhum (Geral)</SelectItem>
                            {allUsers.map(u => (
                                <SelectItem key={u.user_id} value={u.user_id} className="rounded-lg font-bold text-slate-900">
                                    {u.display_name || u.email}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-[10px] text-slate-400 font-medium italic mt-1 leading-relaxed px-1">
                        Selecione qualquer pessoa da equipe para indicar que esta atividade é executada em conjunto ou sob sua responsabilidade.
                    </p>
                </div>
            </div>

            <DialogFooter className="mt-10 sm:justify-start gap-2">
                <Button 
                    className="flex-1 rounded-[20px] h-12 bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200 font-black tracking-wide"
                    onClick={handleSaveActivity}
                >
                    SALVAR ATIVIDADE
                </Button>
                <Button 
                    variant="ghost" 
                    className="rounded-[20px] h-12 font-bold text-slate-400 hover:text-slate-600"
                    onClick={() => setActivityModal(prev => ({ ...prev, isOpen: false }))}
                >
                    CANCELAR
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
