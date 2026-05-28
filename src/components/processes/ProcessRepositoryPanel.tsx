import { useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
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
  Workflow,
  GitFork,
  UploadCloud,
  Download,
  FileSpreadsheet,
  Printer,
  Check
} from "lucide-react";
import Papa from "papaparse";
import { marked } from "marked";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProcessAccordionItem } from "@/components/processes/ProcessAccordionItem";
import { ProcessVisitDashboard } from "@/components/processes/ProcessVisitDashboard";
import { FlowchartViewer } from "@/components/processes/FlowchartViewer";
import { ProcessOrgChartPanel } from "@/components/processes/ProcessOrgChartPanel";

type ProcessRow = {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  checklists: any;
  flowchart_json: any;
  target_role: string | null;
  is_home_flowchart: boolean;
  process_type: 'roadmap' | 'checkpoint';
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
  const [selectedHomeFlowId, setSelectedHomeFlowId] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportSelectedUser, setExportSelectedUser] = useState("");
  const [exportSelectedProcesses, setExportSelectedProcesses] = useState<string[]>([]);
  const [exportSearch, setExportSearch] = useState("");

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
      })).filter((r) => Boolean(r.key));
    },
  });

  const usersQ = useQuery({
    queryKey: ["repo_users", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id, display_name")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
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

  const deleteProcessM = useMutation({
    mutationFn: async (id: string) => {
        const { error } = await supabase
            .from("processes")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", id);
        if (error) throw error;
    },
    onSuccess: () => {
        showSuccess("Processo excluído com sucesso");
        processesQ.refetch();
    },
    onError: (err: any) => showError(err.message)
  });

  const roleNamesMap = useMemo(() => {
    const m = new Map<string, string>();
    (tenantRolesQ.data ?? []).forEach(r => m.set(r.key, r.name));
    return m;
  }, [tenantRolesQ.data]);

  const roadmaps = useMemo(() => {
    return filteredProcesses.filter(p => p.process_type === 'roadmap');
  }, [filteredProcesses]);

  const standardProcesses = useMemo(() => {
    return filteredProcesses.filter(p => p.process_type !== 'roadmap');
  }, [filteredProcesses]);

  const homeFlowcharts = useMemo(() => {
    return (processesQ.data ?? []).filter(p => p.process_type === 'roadmap' || p.is_home_flowchart);
  }, [processesQ.data]);

  const activeHomeFlowchart = useMemo(() => {
    if (homeFlowcharts.length === 0) return null;
    
    if (selectedHomeFlowId) {
        const found = homeFlowcharts.find(p => p.id === selectedHomeFlowId);
        if (found) return found;
    }
    
    // Auto-select the first roadmap that has actual content
    const withContent = homeFlowcharts.find(p => {
        const flow = p.flowchart_json || {};
        const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
        return nodes.length > 0;
    });

    return withContent || homeFlowcharts[0];
  }, [homeFlowcharts, selectedHomeFlowId]);

  const canManage = isAdmin || isSuperAdmin;

  const handleExportManualPDF = () => {
    if (exportSelectedProcesses.length === 0) {
      showError("Selecione pelo menos um processo para exportar.");
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showError("Navegador bloqueou o pop-up. Permita pop-ups para imprimir.");
      return;
    }

    const roleNamesMap = new Map();
    tenantRolesQ.data?.forEach(r => roleNamesMap.set(r.key, r.name));

    const allProcesses = processesQ.data || [];
    const processesToExport = allProcesses.filter(p => exportSelectedProcesses.includes(p.id));

    if (processesToExport.length === 0) {
      printWindow.close();
      showError("Nenhum processo para exportar.");
      return;
    }

    const content = processesToExport.map(p => `
      <div class="process-page">
        <h1>${p.title}</h1>
        <span class="badge">${p.process_type === 'roadmap' ? 'ROADMAP (MACRO)' : (roleNamesMap.get(p.target_role) || 'TODOS OS CARGOS')}</span>
        
        <div class="meta-info">
          Última atualização: ${new Date(p.updated_at).toLocaleDateString('pt-BR')}
        </div>
        
        ${p.description ? `<div class="description">${p.description}</div>` : '<p class="empty-state">Nenhuma instrução detalhada fornecida.</p>'}
        
        ${Array.isArray(p.checklists) && p.checklists.length > 0 ? `
          <div class="checklists">
            <h3>Checklist Operacional</h3>
            <ul>
              ${p.checklists.map(c => `<li>${typeof c === 'string' ? c : c.label}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `).join('');

    const coverUserText = exportSelectedUser ? `<p class="cover-user">Colaborador: <strong>${exportSelectedUser}</strong></p>` : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Manual de Processos</title>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Inter', -apple-system, sans-serif; color: #0f172a; line-height: 1.6; padding: 40px; margin: 0; background: #fff; }
            .cover-page { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-after: always; }
            .cover-page h1 { font-size: 48px; margin-bottom: 16px; font-weight: 800; letter-spacing: -0.02em; }
            .cover-page p { font-size: 18px; color: #64748b; font-weight: 500; }
            .cover-user { font-size: 24px !important; color: #0f172a !important; margin-top: 32px; padding: 16px 32px; background: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; }
            
            .process-page { page-break-after: always; margin-bottom: 60px; }
            .process-page:last-child { page-break-after: avoid; }
            
            h1 { font-size: 28px; font-weight: 700; margin: 0 0 12px 0; letter-spacing: -0.01em; color: #0f172a; }
            
            .badge { display: inline-block; padding: 6px 14px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 20px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
            
            .meta-info { font-size: 12px; color: #94a3b8; font-weight: 500; margin-bottom: 32px; display: flex; align-items: center; gap: 6px; }
            
            .description { margin-top: 32px; font-size: 14px; color: #334155; }
            .description h1, .description h2, .description h3 { margin-top: 24px; margin-bottom: 12px; font-weight: 600; color: #0f172a; }
            .description p { margin-bottom: 16px; }
            .description ul, .description ol { padding-left: 24px; margin-bottom: 16px; }
            .description li { margin-bottom: 6px; }
            
            .checklists { margin-top: 40px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; }
            .checklists h3 { font-size: 16px; font-weight: 700; margin: 0 0 16px 0; color: #0f172a; display: flex; align-items: center; gap: 8px; }
            .checklists ul { list-style-type: none; padding: 0; margin: 0; }
            .checklists li { margin-bottom: 12px; padding-left: 32px; position: relative; font-size: 14px; color: #334155; font-weight: 500; }
            .checklists li:last-child { margin-bottom: 0; }
            .checklists li::before { content: "☐"; position: absolute; left: 0; top: -2px; color: #cbd5e1; font-size: 20px; font-weight: normal; }
            
            .empty-state { font-style: italic; color: #94a3b8; font-size: 14px; }
            
            @media print {
              @page { margin: 2cm; size: A4; }
              body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .checklists { break-inside: avoid; border: 1px solid #e2e8f0 !important; background: #f8fafc !important; }
              .cover-user { border: 1px solid #e2e8f0 !important; background: #f8fafc !important; }
            }
          </style>
        </head>
        <body>
          <div class="cover-page">
            <h1>Manual de Processos</h1>
            ${coverUserText}
            <p style="margin-top: auto; padding-bottom: 40px;">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
          </div>
          ${content}
          
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
              }, 800);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    setExportModalOpen(false);
  };

  const handleDownloadTemplate = () => {
    const csvContent = `Título,Descrição,Cargo Alvo,Tipo
Processo Exemplo,"**Exemplo com Markdown!**
Você pode usar:
- Listas com traços
  - E identar com espaços
- **Negrito** e *itálico*
- [Links](https://exemplo.com)

A importação vai formatar tudo direitinho!",admin,checkpoint
`;
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'modelo_importacao_processos.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          if (rows.length === 0) {
            showError("O arquivo está vazio.");
            setIsImporting(false);
            return;
          }

          // Use a for...of loop to handle async processing properly for all rows
          const processesToInsert = [];
          
          for (const row of rows) {
            const title = row['Título'] || row['Titulo'] || 'Processo sem título';
            const descriptionRaw = row['Descrição'] || row['Descricao'] || null;
            const targetRoleName = row['Cargo Alvo'] || null;
            let targetRoleKey = null;

            if (targetRoleName) {
                // Tenta achar o role pelo nome ou key
                const roleEntry = tenantRolesQ.data?.find(r => r.name.toLowerCase() === targetRoleName.toLowerCase().trim() || r.key.toLowerCase() === targetRoleName.toLowerCase().trim());
                if (roleEntry) {
                    targetRoleKey = roleEntry.key;
                }
            }

            const tipoRaw = (row['Tipo'] || '').toLowerCase().trim();
            const processType = tipoRaw === 'roadmap' ? 'roadmap' : 'checkpoint';

            let parsedDescription = null;
            if (descriptionRaw) {
               // marked.parse pode ser síncrono ou assíncrono em versões novas, 'await' garante segurança.
               parsedDescription = await marked.parse(descriptionRaw.trim(), { breaks: true });
            }

            processesToInsert.push({
              tenant_id: activeTenantId,
              title: title.trim(),
              description: parsedDescription,
              target_role: targetRoleKey,
              process_type: processType,
              flowchart_json: { nodes: [], edges: [] },
              checklists: [],
              is_home_flowchart: false,
              deleted_at: null
            });
          }

          const { error } = await supabase
            .from('processes')
            .insert(processesToInsert);

          if (error) throw error;

          showSuccess(`${processesToInsert.length} processos importados com sucesso!`);
          setImportModalOpen(false);
          processesQ.refetch();
        } catch (err: any) {
          console.error(err);
          showError("Erro ao importar: " + err.message);
        } finally {
          setIsImporting(false);
          event.target.value = '';
        }
      },
      error: (error: any) => {
        showError("Erro ao ler arquivo: " + error.message);
        setIsImporting(false);
      }
    });
  };

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
            {isAdmin && (
              <TabsTrigger value="organograma" className="rounded-xl px-4 text-xs font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <GitFork className="mr-2 h-4 w-4" /> Organograma
              </TabsTrigger>
            )}
          </TabsList>

          {canManage && (
            <div className="flex items-center gap-2">
              <Button 
                  variant="outline"
                  onClick={() => {
                    setExportSelectedProcesses((processesQ.data || []).map(p => p.id));
                    setExportModalOpen(true);
                  }}
                  className="h-10 rounded-2xl border-slate-200 bg-white px-4 hover:bg-slate-50 text-slate-700"
              >
                <Printer className="mr-2 h-4 w-4 text-slate-500" /> Exportar Manual
              </Button>
              <Button 
                  variant="outline"
                  onClick={() => setImportModalOpen(true)}
                  className="h-10 rounded-2xl border-slate-200 bg-white px-4 hover:bg-slate-50"
              >
                <UploadCloud className="mr-2 h-4 w-4 text-slate-500" /> Importar
              </Button>
              <Button 
                  onClick={() => navigate("/app/processes/new")}
                  className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-4 text-white hover:bg-[hsl(var(--byfrost-accent)/0.9)]"
              >
                <Plus className="mr-2 h-4 w-4" /> Novo Processo
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="home" className="mt-4 outline-none">
          <Card className="min-h-[60vh] rounded-[28px] border-slate-200 bg-white p-6 shadow-sm overflow-hidden flex flex-col">
            {homeFlowcharts.length > 1 && (
              <div className="mb-6 flex flex-wrap gap-2">
                {homeFlowcharts.map(p => (
                  <Button 
                    key={p.id}
                    variant={activeHomeFlowchart?.id === p.id ? "default" : "outline"}
                    size="sm"
                    className="rounded-full h-8 text-[11px] font-bold"
                    onClick={() => setSelectedHomeFlowId(p.id)}
                  >
                    {p.title}
                  </Button>
                ))}
              </div>
            )}
            
            <div className="flex-1 min-h-[500px] border border-slate-200 rounded-[22px] overflow-hidden bg-white">
              {activeHomeFlowchart ? (
                <FlowchartViewer 
                   key={activeHomeFlowchart.id}
                   data={activeHomeFlowchart.flowchart_json || { nodes: [], edges: [] }} 
                   className="h-full border-0 rounded-none bg-white font-sans"
                   onNodeClick={(data) => {
                       if (data.linkedProcessId) {
                           // Find the process title to make search accurate
                           const linkedProcess = processesQ.data?.find(p => p.id === data.linkedProcessId);
                           setSearch(linkedProcess?.title || data.label);
                           setActiveTab("list");
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

            <div className="grid gap-8">
              {roadmaps.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Roadmaps (Macros)</h3>
                    <div className="grid gap-4">
                        {roadmaps.map(p => (
                            <ProcessAccordionItem 
                                key={p.id} 
                                process={p} 
                                canManage={canManage}
                                roleName={p.target_role ? roleNamesMap.get(p.target_role) : undefined}
                                onEdit={() => navigate(`/app/processes/${p.id}`)}
                                onDelete={() => {
                                    if (window.confirm("Deseja realmente excluir este processo?")) {
                                        deleteProcessM.mutate(p.id);
                                    }
                                }}
                            />
                        ))}
                    </div>
                </div>
              )}

              <div className="space-y-4">
                  {roadmaps.length > 0 && <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Procedimentos (Micros)</h3>}
                  <div className="grid gap-4">
                      {standardProcesses.length > 0 ? (
                        standardProcesses.map(p => (
                          <ProcessAccordionItem 
                            key={p.id} 
                            process={p} 
                            canManage={canManage}
                            roleName={p.target_role ? roleNamesMap.get(p.target_role) : undefined}
                            onEdit={() => navigate(`/app/processes/${p.id}`)}
                            onDelete={() => {
                                if (window.confirm("Deseja realmente excluir este processo?")) {
                                    deleteProcessM.mutate(p.id);
                                }
                            }}
                          />
                        ))
                      ) : (
                        !roadmaps.length && (
                            <div className="py-20 text-center">
                              <ClipboardCheck className="mx-auto h-12 w-12 text-slate-200" />
                              <h3 className="mt-4 text-base font-semibold text-slate-900">Nenhum processo encontrado</h3>
                              <p className="mt-1 text-sm text-slate-500">Tente ajustar sua busca ou crie um novo processo.</p>
                            </div>
                        )
                      )}
                  </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4 outline-none">
          <ProcessVisitDashboard />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="organograma" className="mt-4 outline-none">
            <ReactFlowProvider>
              <ProcessOrgChartPanel 
                onViewCargo={(roleName) => {
                  setSearch(roleName);
                  setActiveTab("list");
                }}
              />
            </ReactFlowProvider>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-[32px] border-none shadow-2xl p-8">
            <DialogHeader className="mb-4">
                <div className="bg-[hsl(var(--byfrost-accent)/0.12)] w-fit p-3 rounded-2xl mb-4">
                    <FileSpreadsheet className="h-6 w-6 text-[hsl(var(--byfrost-accent))]" />
                </div>
                <DialogTitle className="text-2xl font-black text-slate-900 leading-tight">
                    Importação Massiva
                </DialogTitle>
                <DialogDescription className="text-slate-500 font-medium mt-2">
                    Crie processos em lote importando uma planilha.
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-2">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                    <p className="text-xs text-slate-600 font-medium">
                        1. Primeiro, baixe nosso modelo CSV para garantir que as colunas estejam corretas.
                    </p>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full rounded-xl bg-white shadow-sm font-bold border-slate-200"
                        onClick={handleDownloadTemplate}
                    >
                        <Download className="mr-2 h-4 w-4" /> Baixar Modelo CSV
                    </Button>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3 relative overflow-hidden">
                    <p className="text-xs text-slate-600 font-medium">
                        2. Faça o upload da planilha preenchida (formato .csv).
                    </p>
                    <div className="relative">
                        <input 
                            type="file" 
                            accept=".csv"
                            onChange={handleFileUpload}
                            disabled={isImporting}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                        />
                        <Button 
                            className="w-full rounded-xl bg-slate-900 text-white hover:bg-slate-800 shadow-lg font-bold relative pointer-events-none"
                            disabled={isImporting}
                        >
                            {isImporting ? "Importando..." : "Selecionar e Importar"}
                            {!isImporting && <UploadCloud className="ml-2 h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </div>

            <DialogFooter className="mt-4 sm:justify-start">
                <Button 
                    variant="ghost" 
                    className="w-full rounded-xl font-bold text-slate-400 hover:text-slate-600"
                    onClick={() => setImportModalOpen(false)}
                    disabled={isImporting}
                >
                    Cancelar
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-[32px] border-none shadow-2xl p-8">
            <DialogHeader className="mb-4">
                <div className="bg-slate-100 w-fit p-3 rounded-2xl mb-4">
                    <Printer className="h-6 w-6 text-slate-700" />
                </div>
                <DialogTitle className="text-2xl font-black text-slate-900 leading-tight">
                    Configurar Manual PDF
                </DialogTitle>
                <DialogDescription className="text-slate-500 font-medium mt-2">
                    Personalize a capa e os processos que farão parte deste manual.
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-2">
                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome na Capa (Colaborador)</label>
                    <Select value={exportSelectedUser || "none"} onValueChange={(v) => setExportSelectedUser(v === "none" ? "" : v)}>
                        <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50 focus:ring-slate-200 transition-colors">
                            <SelectValue placeholder="Sem nome na capa" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-slate-200 shadow-xl max-h-[200px]">
                            <SelectItem value="none" className="italic text-slate-400">Sem nome na capa</SelectItem>
                            {usersQ.data?.map(u => (
                                <SelectItem key={u.user_id} value={u.display_name || u.user_id}>
                                    {u.display_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2 w-full min-w-0">
                    <div className="flex items-center justify-between px-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Processos a Exportar</label>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-[10px] uppercase font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg px-2 transition-colors"
                            onClick={() => {
                                const allIds = (processesQ.data || []).map(p => p.id);
                                if (exportSelectedProcesses.length === allIds.length) {
                                    setExportSelectedProcesses([]);
                                } else {
                                    setExportSelectedProcesses(allIds);
                                }
                            }}
                        >
                            {(processesQ.data || []).length === exportSelectedProcesses.length ? "Desmarcar Todos" : "Marcar Todos"}
                        </Button>
                    </div>
                    <div className="relative mb-2 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input 
                            value={exportSearch}
                            onChange={e => setExportSearch(e.target.value)}
                            placeholder="Buscar processos..."
                            className="h-10 pl-9 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-slate-200 w-full"
                        />
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col w-full min-w-0">
                        <div className="max-h-[240px] overflow-y-auto custom-scrollbar p-1 w-full">
                            {(() => {
                                const list = processesQ.data || [];
                                const filtered = exportSearch.trim() === "" ? list : list.filter(p => p.title.toLowerCase().includes(exportSearch.toLowerCase()) || p.process_type.toLowerCase().includes(exportSearch.toLowerCase()));
                                
                                if (filtered.length === 0) {
                                    return <p className="text-xs text-slate-400 text-center py-6 italic">Nenhum processo encontrado.</p>;
                                }

                                return filtered.map(p => {
                                    const isSelected = exportSelectedProcesses.includes(p.id);
                                    return (
                                        <div 
                                            key={p.id} 
                                            className={cn(
                                                "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border border-transparent w-full min-w-0",
                                                isSelected ? "bg-slate-50 border-slate-200" : "hover:bg-slate-50"
                                            )}
                                            onClick={() => {
                                                setExportSelectedProcesses(prev => 
                                                    isSelected ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                                );
                                            }}
                                        >
                                            <div className={cn(
                                                "h-5 w-5 rounded-[6px] border flex items-center justify-center shrink-0 transition-all",
                                                isSelected ? "bg-[hsl(var(--byfrost-accent))] border-[hsl(var(--byfrost-accent))] text-white shadow-sm" : "bg-white border-slate-300 text-transparent"
                                            )}>
                                                <Check className="h-3.5 w-3.5" />
                                            </div>
                                            <div className="flex-1 min-w-0 overflow-hidden">
                                                <p className="text-sm font-bold text-slate-800 truncate leading-tight block w-full" title={p.title}>{p.title}</p>
                                                <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5 font-medium truncate w-full">{p.process_type}</p>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>
            </div>

            <DialogFooter className="mt-4 sm:justify-start">
                <div className="flex items-center gap-2 w-full">
                    <Button 
                        variant="ghost" 
                        className="w-1/3 rounded-xl font-bold text-slate-400 hover:text-slate-600"
                        onClick={() => setExportModalOpen(false)}
                    >
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleExportManualPDF}
                        disabled={exportSelectedProcesses.length === 0}
                        className={cn(
                            "w-2/3 rounded-xl shadow-lg font-bold transition-all",
                            exportSelectedProcesses.length > 0 
                                ? "bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.9)]" 
                                : "bg-slate-100 text-slate-400 shadow-none pointer-events-none"
                        )}
                    >
                        Gerar PDF ({exportSelectedProcesses.length})
                    </Button>
                </div>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
