import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  ClipboardCheck, 
  Home, 
  LayoutDashboard, 
  List, 
  Plus, 
  Search, 
  Filter,
  BarChart3,
  FileText,
  Workflow
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProcessAccordionItem } from "@/components/processes/ProcessAccordionItem";
import { ProcessVisitDashboard } from "@/components/processes/ProcessVisitDashboard";
import { FlowchartViewer } from "@/components/processes/FlowchartViewer";

type ProcessRow = {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  checklists: any;
  flowchart_json: any;
  target_role: string | null;
  is_home_flowchart: boolean;
  created_at: string;
  updated_at: string;
};

export function ProcessRepositoryPanel() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { activeTenantId, activeTenant, isSuperAdmin } = useTenant();
  const roleKey = activeTenant?.role ?? "";
  const isAdmin = roleKey === "admin";
  const [activeTab, setActiveTab] = useState("home");
  const [search, setSearch] = useState("");

  const processesQ = useQuery({
    queryKey: ["processes", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processes")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("title", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProcessRow[];
    },
  });

  const tenantRolesQ = useQuery({
    queryKey: ["tenant_roles_common", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_roles")
        .select("role_id, roles(key, name)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        key: String(r.roles?.key ?? ""),
        name: String(r.roles?.name ?? ""),
      }));
    },
  });

  const filteredProcesses = useMemo(() => {
    let list = processesQ.data ?? [];
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(p => 
        p.title.toLowerCase().includes(s) || 
        (p.description && p.description.toLowerCase().includes(s))
      );
    }
    return list;
  }, [processesQ.data, search]);

  const roleNamesMap = useMemo(() => {
    const m = new Map<string, string>();
    (tenantRolesQ.data ?? []).forEach(r => m.set(r.key, r.name));
    return m;
  }, [tenantRolesQ.data]);

  const homeFlowchart = useMemo(() => {
    return (processesQ.data ?? []).find(p => p.is_home_flowchart);
  }, [processesQ.data]);

  const canManage = isAdmin || isSuperAdmin;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Repositório de Processos</h1>
        <p className="text-sm text-slate-500">Documentação, manuais, checklists e fluxogramas operacionais.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between gap-4 overflow-x-auto pb-1">
          <TabsList className="h-11 rounded-2xl bg-slate-100 p-1">
            <TabsTrigger value="home" className="rounded-xl px-4 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Home className="mr-2 h-4 w-4" /> Início
            </TabsTrigger>
            <TabsTrigger value="list" className="rounded-xl px-4 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <List className="mr-2 h-4 w-4" /> Processos
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="rounded-xl px-4 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
            </TabsTrigger>
          </TabsList>

          {canManage && (
            <Button 
                onClick={() => navigate("/app/processes/new")}
                className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-4 text-white hover:bg-[hsl(var(--byfrost-accent)/0.9)]"
            >
              <Plus className="mr-2 h-4 w-4" /> Novo Processo
            </Button>
          )}
        </div>

        <TabsContent value="home" className="mt-4 outline-none">
          <Card className="min-h-[60vh] rounded-[28px] border-slate-200 bg-white p-6 shadow-sm overflow-hidden flex flex-col">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Mapa de Processos</h2>
              <p className="text-sm text-slate-500">Navegue pelos processos clicando nas áreas do fluxograma.</p>
            </div>
            
            <div className="flex-1 overflow-auto rounded-[22px] border border-slate-200">
              {homeFlowchart ? (
                <FlowchartViewer 
                   data={homeFlowchart.flowchart_json || { nodes: [], edges: [] }} 
                   className="h-full border-0 rounded-none bg-white p-12"
                   onNodeClick={(node) => {
                       if (node.linkedProcessId) {
                           // Navigate or open linked process?
                           // For now, let's search for it or switch to list
                           setActiveTab("list");
                           setSearch(node.label);
                       }
                   }}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center px-6 py-12">
                  <Workflow className="mx-auto h-12 w-12 text-slate-300" />
                  <h3 className="mt-4 text-base font-semibold text-slate-900">Nenhum mapa definido</h3>
                  <p className="mt-1 text-sm text-slate-500">Crie um processo marcado como "Mapa Geral" para aparecer aqui.</p>
                  {canManage && (
                    <Button variant="outline" className="mt-4 rounded-xl" onClick={() => setActiveTab("list")}>
                         Ir para lista
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="list" className="mt-4 outline-none">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input 
                   placeholder="Buscar por título ou descrição..." 
                  className="h-11 rounded-2xl pl-10 border-slate-200 bg-white shadow-sm focus-visible:ring-slate-200"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white">
                <Filter className="mr-2 h-4 w-4" /> Filtros
              </Button>
            </div>

            <div className="grid gap-4">
              {filteredProcesses.length > 0 ? (
                filteredProcesses.map(p => (
                  <ProcessAccordionItem 
                    key={p.id} 
                    process={p} 
                    canManage={canManage}
                    roleName={p.target_role ? roleNamesMap.get(p.target_role) : undefined}
                    onEdit={() => navigate(`/app/processes/${p.id}`)}
                  />
                ))
              ) : (
                <div className="py-20 text-center">
                  <ClipboardCheck className="mx-auto h-12 w-12 text-slate-200" />
                  <h3 className="mt-4 text-base font-semibold text-slate-900">Nenhum processo encontrado</h3>
                  <p className="mt-1 text-sm text-slate-500">Tente ajustar sua busca ou crie um novo processo.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4 outline-none">
          <ProcessVisitDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
