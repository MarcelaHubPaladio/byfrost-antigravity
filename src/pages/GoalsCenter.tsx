import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Target, FileText, Save, Library, Users, ChevronRight } from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { showSuccess, showError } from "@/utils/toast";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { AlertCircle, FileSignature } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { checkRouteAccess } from "@/lib/access";

// ROLES are now fetched dynamically from tenant_roles

export default function GoalsCenter() {
    const { activeTenantId } = useTenant();
    const [selectedRole, setSelectedRole] = useState<string | null>(null);

    // Get current user role and access
    const { activeTenant, isSuperAdmin } = useTenant();
    const roleKey = String(activeTenant?.role ?? "");

    const manageAccessQ = useQuery({
        queryKey: ["nav_access_goals_manage", activeTenantId, roleKey],
        enabled: Boolean(activeTenantId),
        queryFn: async () => {
            if (isSuperAdmin) return true;
            return await checkRouteAccess({ tenantId: activeTenantId!, roleKey, routeKey: "app.goals.manage" });
        },
    });

    const tenantRolesQ = useQuery({
        queryKey: ["tenant_roles_goals", activeTenantId],
        enabled: Boolean(activeTenantId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tenant_roles")
                .select("roles(key, name)")
                .eq("tenant_id", activeTenantId!)
                .eq("enabled", true);
            if (error) throw error;
            const list = (data || [])
                .map((r: any) => ({
                    id: String(r.roles?.key ?? ""),
                    name: String(r.roles?.name ?? ""),
                    description: ""
                }))
                .filter(r => !!r.id);

            // Sort to keep a consistent order, admin first then by name
            list.sort((a, b) => {
                if (a.id === 'admin') return -1;
                if (b.id === 'admin') return 1;
                return a.name.localeCompare(b.name);
            });

            return list;
        }
    });

    const isAuthorized = Boolean(manageAccessQ.data);
    const roles = tenantRolesQ.data || [];

    return (
        <RequireAuth>
            <AppShell>
                <div className="max-w-6xl mx-auto space-y-6">
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Target className="w-6 h-6 text-indigo-600" />
                            Central de Metas
                        </h1>
                    </div>

                    <Tabs defaultValue="my-goals" className="w-full">
                        <TabsList className="mb-4">
                            <TabsTrigger value="my-goals" className="flex items-center gap-2">
                                <Target className="w-4 h-4" />
                                Minhas Metas
                            </TabsTrigger>
                            {isAuthorized && (
                                <TabsTrigger value="team" className="flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    Liderança
                                </TabsTrigger>
                            )}
                            {isAuthorized && (
                                <TabsTrigger value="manage" className="flex items-center gap-2">
                                    <Target className="w-4 h-4" />
                                    Configuração
                                </TabsTrigger>
                            )}
                        </TabsList>

                        <TabsContent value="team">
                            <TeamGoalsTab />
                        </TabsContent>

                        <TabsContent value="my-goals">
                            <MyGoalsDashboard />
                        </TabsContent>

                        {isAuthorized && (
                            <TabsContent value="manage">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                                    <div className="border bg-white rounded-lg p-4 shadow-sm h-full max-h-[70vh] flex flex-col">
                                        <div className="flex justify-between items-center mb-4">
                                            <h2 className="font-semibold text-lg">Cargos</h2>
                                        </div>

                                        <div className="flex-1 overflow-y-auto space-y-2">
                                            {tenantRolesQ.isLoading ? (
                                                <div className="text-center py-8 text-sm text-slate-400 italic">Carregando cargos...</div>
                                            ) : roles.map((role) => (
                                                <div
                                                    key={role.id}
                                                    onClick={() => setSelectedRole(role.id)}
                                                    className={`p-3 rounded-md cursor-pointer border flex justify-between items-center transition-colors ${selectedRole === role.id
                                                        ? "border-indigo-600 bg-indigo-50"
                                                        : "hover:bg-slate-50 border-slate-200"
                                                        }`}
                                                >
                                                    <div>
                                                        <div className="font-medium text-sm text-slate-800">{role.name}</div>
                                                        <div className="text-[10px] text-slate-500 font-mono mt-0.5 uppercase tracking-wider">{role.id}</div>
                                                    </div>
                                                </div>
                                            ))}
                                            {!tenantRolesQ.isLoading && roles.length === 0 && (
                                                <div className="text-center py-8 text-sm text-slate-400">Nenhum cargo ativo encontrado.</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="md:col-span-2 border bg-white rounded-lg p-0 shadow-sm max-h-[70vh] flex flex-col h-full overflow-hidden">
                                        {selectedRole ? (
                                            <Tabs defaultValue="templates" className="flex flex-col h-full w-full">
                                                <div className="px-4 pt-4 border-b bg-slate-50/50 flex justify-between items-center">
                                                    <TabsList className="bg-transparent p-0 gap-4 justify-start">
                                                        <TabsTrigger value="templates" className="data-[state=active]:bg-white data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-slate-200 rounded-t-lg rounded-b-none px-4 py-2 flex gap-2">
                                                            <Target className="w-4 h-4" />
                                                            Templates de Objetivos
                                                        </TabsTrigger>
                                                        <TabsTrigger value="rules" className="data-[state=active]:bg-white data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-slate-200 rounded-t-lg rounded-b-none px-4 py-2 flex gap-2">
                                                            <FileText className="w-4 h-4" />
                                                            Regras e Termos (Assinatura)
                                                        </TabsTrigger>
                                                    </TabsList>
                                                </div>

                                                <div className="flex-1 overflow-y-auto p-4 bg-white">
                                                    <TabsContent value="templates" className="mt-0 h-full data-[state=inactive]:hidden">
                                                        <TemplatesEditor roleKey={selectedRole} roles={roles} />
                                                    </TabsContent>
                                                    <TabsContent value="rules" className="mt-0 h-full data-[state=inactive]:hidden">
                                                        <RoleRulesEditor roleKey={selectedRole} />
                                                    </TabsContent>
                                                </div>
                                            </Tabs>
                                        ) : (
                                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
                                                <Target className="w-12 h-12 mb-2 opacity-50" />
                                                <p>Selecione um cargo para configurar as metas e regras.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </TabsContent>
                        )}
                    </Tabs>
                </div>
            </AppShell>
        </RequireAuth>
    );
}

function TemplatesEditor({ roleKey, roles }: { roleKey: string, roles: any[] }) {
    const { activeTenantId } = useTenant();
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [sourceRoleKey, setSourceRoleKey] = useState("");
    const [isImporting, setIsImporting] = useState(false);
    const [editingTpl, setEditingTpl] = useState<any>(null);

    const [name, setName] = useState("");
    const [metricKey, setMetricKey] = useState("");
    const [targetValue, setTargetValue] = useState("");
    const [frequency, setFrequency] = useState("monthly");
    const [targetType, setTargetType] = useState("quantity");

    const tplQuery = useQuery({
        queryKey: ["goal_templates", activeTenantId, roleKey],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("goal_templates")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("role_key", roleKey)
                .order("name");
            if (error) throw error;
            return data;
        },
        enabled: !!roleKey,
    });

    const saveTpl = async () => {
        if (!name.trim() || !metricKey.trim() || !targetValue) return;
        try {
            if (editingTpl) {
                const { error } = await supabase
                    .from("goal_templates")
                    .update({
                        name,
                        metric_key: metricKey,
                        target_value: Number(targetValue),
                        frequency,
                        target_type: targetType,
                    })
                    .eq("tenant_id", activeTenantId)
                    .eq("id", editingTpl.id);
                if (error) throw error;
                showSuccess("Template atualizado!");
            } else {
                const { error } = await supabase.from("goal_templates").insert({
                    tenant_id: activeTenantId,
                    role_key: roleKey,
                    name,
                    metric_key: metricKey,
                    target_value: Number(targetValue),
                    frequency,
                    target_type: targetType,
                });
                if (error) throw error;
                showSuccess("Template criado!");
            }
            setIsModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["goal_templates"] });
        } catch (e: any) {
            showError(e.message);
        }
    };

    const deleteTpl = async (id: string) => {
        if (!confirm("Excluir este template? Isso não afetará metas de usuários já criadas baseado nele.")) return;
        try {
            const { error } = await supabase.from("goal_templates").delete().eq("tenant_id", activeTenantId).eq("id", id);
            if (error) throw error;
            showSuccess("Template excluído!");
            queryClient.invalidateQueries({ queryKey: ["goal_templates"] });
        } catch (e: any) {
            showError(e.message);
        }
    };

    const handleImport = async () => {
        if (!sourceRoleKey || !activeTenantId) return;
        setIsImporting(true);
        try {
            // Fetch source templates
            const { data: sourceTpls, error: fetchErr } = await supabase
                .from("goal_templates")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("role_key", sourceRoleKey);

            if (fetchErr) throw fetchErr;

            if (!sourceTpls || sourceTpls.length === 0) {
                showError("O cargo de origem não possui metas cadastradas.");
                setIsImporting(false);
                return;
            }

            // Get current templates to avoid exact duplicates
            const currentKeys = new Set(tplQuery.data?.map(t => t.metric_key) || []);

            const toInsert = sourceTpls
                .filter(t => !currentKeys.has(t.metric_key))
                .map(t => ({
                    tenant_id: activeTenantId,
                    role_key: roleKey,
                    name: t.name,
                    metric_key: t.metric_key,
                    target_value: t.target_value,
                    frequency: t.frequency,
                    target_type: t.target_type || 'quantity'
                }));

            if (toInsert.length === 0) {
                showSuccess("Todas as metas do cargo de origem já existem aqui.");
                setIsImportModalOpen(false);
                return;
            }

            const { error: insErr } = await supabase.from("goal_templates").insert(toInsert);
            if (insErr) throw insErr;

            showSuccess(`${toInsert.length} metas importadas com sucesso!`);
            setIsImportModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["goal_templates", activeTenantId, roleKey] });
        } catch (e: any) {
            showError(`Erro ao importar: ${e.message}`);
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-4 pb-4 border-b">
                <div>
                    <h2 className="font-semibold text-lg">Templates de Metas</h2>
                    <p className="text-sm text-slate-500">Defina o que é esperado padrão para este cargo.</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => {
                            setSourceRoleKey("");
                            setIsImportModalOpen(true);
                        }}
                    >
                        <Library className="w-4 h-4 mr-1" /> Importar de outro Cargo
                    </Button>
                    <Button
                        onClick={() => {
                            setEditingTpl(null);
                            setName("");
                            setMetricKey("");
                            setTargetValue("");
                            setFrequency("monthly");
                            setTargetType("quantity");
                            setIsModalOpen(true);
                        }}
                    >
                        <Plus className="w-4 h-4 mr-1" /> Adicionar Meta
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
                {tplQuery.data?.map((tpl) => (
                    <div key={tpl.id} className="p-4 rounded-lg border flex justify-between items-center">
                        <div>
                            <div className="font-medium">{tpl.name}</div>
                            <div className="text-sm text-slate-600 mt-1 flex gap-4 items-center">
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-xs shrink-0">Chave: {tpl.metric_key}</span>
                                <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-medium shrink-0">
                                    Alvo: {tpl.target_type === 'money' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tpl.target_value) : tpl.target_value}
                                </span>
                                <span className="text-slate-500 text-xs shrink-0">{tpl.frequency === 'monthly' ? 'Mensal' : tpl.frequency === 'weekly' ? 'Semanal' : 'Diário'}</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setEditingTpl(tpl);
                                    setName(tpl.name);
                                    setMetricKey(tpl.metric_key);
                                    setTargetValue(String(tpl.target_value));
                                    setFrequency(tpl.frequency);
                                    setTargetType(tpl.target_type || "quantity");
                                    setIsModalOpen(true);
                                }}
                            >
                                Editar
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => deleteTpl(tpl.id)}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                ))}
                {tplQuery.data?.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                        Nenhum template cadastrado para este cargo.
                    </div>
                )}
            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingTpl ? "Editar Meta" : "Nova Meta do Cargo"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nome / Descritivo</label>
                            <Input
                                placeholder="Ex: Vender 20 itens"
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value);
                                    if (!editingTpl) {
                                        // Auto-generate slug when creating new
                                        const slug = e.target.value
                                            .toLowerCase()
                                            .normalize("NFD")
                                            .replace(/[\u0300-\u036f]/g, "")
                                            .replace(/[^a-z0-9]+/g, "_")
                                            .replace(/^_+|_+$/g, "");
                                        setMetricKey(slug);
                                    }
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Tipo de Meta</label>
                            <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit">
                                <button
                                    onClick={() => setTargetType("quantity")}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${targetType === "quantity" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                >
                                    QUANTIDADE
                                </button>
                                <button
                                    onClick={() => setTargetType("money")}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${targetType === "money" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                >
                                    FATURAMENTO (R$)
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Chave da Métrica (Sistema)</label>
                            <Input
                                placeholder="Ex: vendas_realizadas"
                                value={metricKey}
                                onChange={(e) => setMetricKey(e.target.value)}
                            />
                            <p className="text-xs text-slate-500">Esta chave conecta com jornadas e eventos (ex: bater o ponto, concluir tarefa).</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Alvo Numérico</label>
                                <Input
                                    type="number"
                                    placeholder="Ex: 20"
                                    value={targetValue}
                                    onChange={(e) => setTargetValue(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Frequência</label>
                                <select
                                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={frequency}
                                    onChange={(e) => setFrequency(e.target.value)}
                                >
                                    <option value="daily">Diário</option>
                                    <option value="weekly">Semanal</option>
                                    <option value="monthly">Mensal</option>
                                    <option value="yearly">Anual</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button onClick={saveTpl}>Salvar</Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Importar Metas de outro Cargo</DialogTitle>
                        <DialogDescription>
                            Escolha um cargo para copiar todos os templates de metas dele para o cargo atual.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Cargo de Origem</label>
                            <select
                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={sourceRoleKey}
                                onChange={(e) => setSourceRoleKey(e.target.value)}
                            >
                                <option value="">Selecione um cargo...</option>
                                {roles.filter(r => r.id !== roleKey).map(role => (
                                    <option key={role.id} value={role.id}>
                                        {role.name} ({role.id})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsImportModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleImport} disabled={!sourceRoleKey || isImporting}>
                            {isImporting ? "Importando..." : "Importar Agora"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function RoleRulesEditor({ roleKey }: { roleKey: string }) {
    const { activeTenantId } = useTenant();
    const { user } = useSession();
    const queryClient = useQueryClient();

    const [editorHtml, setEditorHtml] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);

    const rulesQ = useQuery({
        queryKey: ["goal_role_rules", activeTenantId, roleKey],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("goal_role_rules")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("role_key", roleKey)
                .order("version", { ascending: false });

            if (error) throw error;
            return data || [];
        },
        enabled: !!activeTenantId && !!roleKey,
    });

    useEffect(() => {
        if (rulesQ.data && rulesQ.data.length > 0 && !isSaving) {
            setEditorHtml(rulesQ.data[0].content_html || "");
        } else if (!rulesQ.isLoading && (!rulesQ.data || rulesQ.data.length === 0) && !isSaving) {
            setEditorHtml("");
        }
    }, [rulesQ.data, rulesQ.isLoading]);

    const handleSaveDraft = async () => {
        if (!activeTenantId || !user) return;
        setIsSaving(true);
        try {
            const latestRule = rulesQ.data?.[0];
            const isDraft = latestRule?.status === 'draft';
            const content = editorHtml.trim();

            if (!content) {
                showError("O conteúdo da regra não pode ser vazio.");
                setIsSaving(false);
                return;
            }

            if (isDraft) {
                // Update existing draft
                const { error } = await supabase.from("goal_role_rules").update({
                    content_html: content,
                    created_by: user.id
                }).eq("id", latestRule.id);
                if (error) throw error;
                showSuccess("Rascunho atualizado!");
            } else {
                // Insert new draft (version + 1)
                const nextVersion = (latestRule?.version || 0) + 1;
                const { error } = await supabase.from("goal_role_rules").insert({
                    tenant_id: activeTenantId,
                    role_key: roleKey,
                    version: nextVersion,
                    content_html: content,
                    status: 'draft',
                    created_by: user.id
                });
                if (error) throw error;
                showSuccess(`Rascunho criado (v${nextVersion})!`);
            }

            queryClient.invalidateQueries({ queryKey: ["goal_role_rules", activeTenantId, roleKey] });
        } catch (e: any) {
            showError(`Erro ao salvar rascunho: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handlePublish = async () => {
        const latestRule = rulesQ.data?.[0];
        if (!latestRule || latestRule.status !== 'draft') return;

        if (!confirm("Isso publicará esta versão do termo e exigirá que todos os usuários deste cargo assinem o aceite. Tem certeza?")) return;

        setIsPublishing(true);
        try {
            const content = editorHtml.trim();
            // Salvar rascunho invisivelmente se houver mudanças não salvas
            if (content !== latestRule.content_html) {
                const { error: updErr } = await supabase.from("goal_role_rules").update({
                    content_html: content
                }).eq("id", latestRule.id);
                if (updErr) throw new Error("Erro ao salvar alterações antes de publicar: " + updErr.message);
            }

            const { error } = await supabase.from("goal_role_rules").update({
                status: 'published'
            }).eq("id", latestRule.id);

            if (error) throw error;

            showSuccess(`Termos da Versão ${latestRule.version} publicados aos usuários!`);
            queryClient.invalidateQueries({ queryKey: ["goal_role_rules", activeTenantId, roleKey] });
        } catch (e: any) {
            showError(`Erro ao publicar: ${e.message}`);
        } finally {
            setIsPublishing(false);
        }
    };

    if (rulesQ.isLoading) {
        return <div className="p-8 text-center text-slate-500">Carregando regras do cargo...</div>;
    }

    const latestRule = rulesQ.data?.[0];
    const isDraft = latestRule?.status === 'draft';
    const publishedRule = rulesQ.data?.find(r => r.status === 'published');

    return (
        <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-4 pb-4 border-b">
                <div>
                    <h2 className="font-semibold text-lg">Diretrizes e Regras do Cargo</h2>
                    <p className="text-sm text-slate-500">
                        {publishedRule ? `Versão atual ativa para os usuários: v${publishedRule.version}` : 'Nenhuma regra publicada ainda para este cargo.'}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving || isPublishing || (latestRule?.content_html === editorHtml.trim())}>
                        <Save className="w-4 h-4 mr-2" />
                        Salvar Rascunho
                    </Button>
                    <Button onClick={handlePublish} disabled={isSaving || isPublishing || !isDraft} className="bg-emerald-600 hover:bg-emerald-700">
                        Publicar aos Usuários {isDraft ? `(v${latestRule.version})` : ''}
                    </Button>
                </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-800">
                <strong>Ciclo de Edição:</strong> Você pode salvar múltiplos <b>Rascunhos</b> sem afetar os usuários. Ao clicar em <b>Publicar aos Usuários</b>, a versão do rascunho é congelada e todos no cargo serão notificados para assinar o novo termo no Autentique.
            </div>

            <div className="flex-1 min-h-[300px] border rounded-lg bg-slate-50 flex flex-col mb-4">
                <div className="p-2 border-b bg-white flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase">
                        Editor de Regras {latestRule ? `(Editando v${isDraft ? latestRule.version : latestRule.version + 1})` : `(Criando v1)`}
                    </span>
                    {isDraft && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">RASCUNHO ABERTO</span>}
                </div>
                <div className="flex-1 overflow-auto p-4 bg-white prose prose-sm max-w-none prose-slate">
                    <RichTextEditor value={editorHtml} onChange={setEditorHtml} />
                </div>
            </div>

            {rulesQ.data && rulesQ.data.length > 0 && (
                <div className="mt-4 border-t pt-4">
                    <h3 className="font-semibold text-md mb-2">Histórico de Versões</h3>
                    <Accordion type="single" collapsible className="w-full bg-white border rounded-lg px-2">
                        {rulesQ.data.map((rule) => (
                            <AccordionItem value={`v${rule.version}`} key={rule.id}>
                                <AccordionTrigger className="text-sm hover:no-underline">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-slate-400" />
                                        Versão {rule.version}
                                        {rule.status === 'published' && rule.version === publishedRule?.version && (
                                            <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-semibold ml-2">PÚBLICA (ATIVA)</span>
                                        )}
                                        {rule.status === 'published' && rule.version !== publishedRule?.version && (
                                            <span className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-semibold ml-2">PÚBLICA (ANTIGA)</span>
                                        )}
                                        {rule.status === 'draft' && (
                                            <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-semibold ml-2">RASCUNHO</span>
                                        )}
                                        <span className="text-xs text-slate-400 font-normal ml-2">
                                            {new Date(rule.created_at).toLocaleDateString("pt-BR")} as {new Date(rule.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div
                                        className="prose prose-sm max-w-none prose-slate p-4 bg-slate-50 border rounded-md"
                                        dangerouslySetInnerHTML={{ __html: rule.content_html }}
                                    />
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            )}
        </div>
    );
}

function MyGoalsDashboard() {
    const { activeTenantId, activeTenant } = useTenant();
    const { user } = useSession();
    const [isSigningUrl, setIsSigningUrl] = useState<string | null>(null);

    const roleKey = activeTenant?.role ?? "";

    const goalsQ = useQuery({
        queryKey: ["my_goals_resolved", activeTenantId, user?.id, roleKey],
        queryFn: async () => {
            if (!activeTenantId || !user?.id) return null;

            // Fetch user overrides/custom goals
            const { data: userGoals, error: ugError } = await supabase
                .from("user_goals")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("user_id", user.id);
            if (ugError) throw ugError;

            // Fetch standard templates for role
            const { data: templates, error: tplError } = await supabase
                .from("goal_templates")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("role_key", roleKey);
            if (tplError) throw tplError;

            // Merge logic: user_goals override templates based on metric_key
            const resolved = new Map<string, any>();

            // Add templates first
            for (const t of (templates || [])) {
                resolved.set(t.metric_key, {
                    ...t,
                    is_template: true,
                    is_override: false,
                });
            }

            // Apply overrides or custom goals
            for (const ug of (userGoals || [])) {
                if (resolved.has(ug.metric_key)) {
                    // Override existing template
                    resolved.set(ug.metric_key, {
                        ...ug,
                        is_template: false,
                        is_override: true,
                        template_id: resolved.get(ug.metric_key).id
                    });
                } else {
                    // Custom goal just for this user
                    resolved.set(ug.metric_key, {
                        ...ug,
                        is_template: false,
                        is_override: false,
                    });
                }
            }

            // Fetch active rule for the role
            const { data: activeRule, error: ruleErr } = await supabase
                .from("goal_role_rules")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("role_key", roleKey)
                .eq("status", "published")
                .order("version", { ascending: false })
                .limit(1)
                .maybeSingle();

            // Check if user has signed that specific rule version
            let existingSig = null;
            if (activeRule) {
                const { data: sig } = await supabase
                    .from("user_goal_signatures")
                    .select("*")
                    .eq("user_id", user.id)
                    .eq("goal_role_rule_id", activeRule.id)
                    .maybeSingle();
                existingSig = sig;
            }

            return {
                goals: Array.from(resolved.values()).sort((a, b) => a.name.localeCompare(b.name)),
                activeRule,
                existingSig
            };
        },
        enabled: !!activeTenantId && !!user?.id,
    });

    const progressQ = useQuery({
        queryKey: ["my_goals_progress", activeTenantId, user?.id],
        queryFn: async () => {
            if (!activeTenantId || !user?.id) return {};

            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            // Fetch participant
            const { data: participant } = await supabase
                .from("incentive_participants")
                .select("id")
                .eq("tenant_id", activeTenantId)
                .eq("user_id", user.id)
                .maybeSingle();

            if (!participant) return {};

            const { data: events } = await supabase
                .from("incentive_events")
                .select("event_type, value")
                .eq("tenant_id", activeTenantId)
                .eq("participant_id", participant.id)
                .gte("created_at", startOfMonth.toISOString());

            const progress: Record<string, number> = {};
            for (const event of (events || [])) {
                const key = event.event_type;
                if (!progress[key]) progress[key] = 0;
                progress[key] += 1; // Default count
            }

            // For money types, we need to sum value. But we don't know the type here yet easily.
            // Let's return structured data.
            return events || [];
        },
        enabled: !!activeTenantId && !!user?.id,
    });

    const goalsWithProgress = useMemo(() => {
        const goals = goalsQ.data?.goals || [];
        const events = progressQ.data || [];

        return goals.map(g => {
            const relevantEvents = (events as any[]).filter(e => e.event_type === g.metric_key);
            let achieved = 0;
            if (g.target_type === 'money') {
                achieved = relevantEvents.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
            } else {
                achieved = relevantEvents.length;
            }
            return {
                ...g,
                achieved,
                remaining: Math.max(0, (g.target_value || 0) - achieved)
            };
        });
    }, [goalsQ.data, progressQ.data]);

    const { activeRule, existingSig, showSignatureBanner } = useMemo(() => {
        const activeRule = goalsQ.data?.activeRule;
        const existingSig = goalsQ.data?.existingSig;

        let showSignatureBanner = false;

        // Show banner if there is an active rule but user hasn't signed it yet
        if (activeRule && (!existingSig || existingSig.autentique_status !== "signed")) {
            showSignatureBanner = true;
        }

        return { activeRule, existingSig, showSignatureBanner };
    }, [goalsQ.data]);

    if (goalsQ.isLoading) {
        return <div className="p-8 text-center text-slate-500">Carregando metas...</div>;
    }

    const handleSignTerms = async () => {
        if (!activeRule || !user) return;

        try {
            // First check if a link already exists
            if (existingSig?.signing_link) {
                window.open(existingSig.signing_link, "_blank");
                return;
            }

            // Call Edge Function
            const { data, error } = await supabase.functions.invoke("autentique-goal-rules", {
                body: { activeTenantId, roleKey }
            });

            if (error) throw error;
            if (data?.ok === false) {
                throw new Error(data.error + (data.detail?.message ? ` - ${data.detail.message}` : ""));
            }
            if (data?.signing_link) {
                window.open(data.signing_link, "_blank");
            } else {
                throw new Error("Link de assinatura não retornado.");
            }
        } catch (e: any) {
            showError(`Erro ao gerar link de assinatura: ${e.message}`);
        }
    };

    if (!goalsQ.data?.goals || goalsQ.data.goals.length === 0) {
        return (
            <div className="bg-white p-6 rounded-lg border shadow-sm">
                <h2 className="text-lg font-bold mb-4">Minhas Metas</h2>
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-12 border-2 border-dashed rounded-lg bg-slate-50">
                    <Target className="w-12 h-12 mb-3 text-slate-300" />
                    <p className="text-center max-w-md">
                        Você ainda não possui metas atribuídas para o seu usuário.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-lg border shadow-sm">

            {showSignatureBanner && (
                <div className="mb-6 p-4 rounded-lg bg-orange-50 border border-orange-200 flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex gap-3">
                        <AlertCircle className="w-6 h-6 text-orange-500 shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-bold text-orange-900">Termo de Metas Pendente</h3>
                            <p className="text-orange-800 text-sm mt-1">
                                Para o seu cargo atual (<strong>{roleKey}</strong>), existem novas diretrizes ou regras de metas que precisam do seu aceite eletrônico.
                                Suas metas oficiais ficarão validadas após a assinatura.
                            </p>
                        </div>
                    </div>
                    <Button onClick={handleSignTerms} className="shrink-0 group z-10 relative">
                        <FileSignature className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
                        Assinar Eletronicamente
                    </Button>
                </div>
            )}

            <h2 className="text-lg font-bold mb-6">Minhas Metas</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {goalsWithProgress.map((goal: any) => (
                    <div key={goal.id} className="border rounded-xl p-5 shadow-sm bg-white relative overflow-hidden flex flex-col justify-between min-h-[160px]">
                        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 rounded-l-xl"></div>
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                                <span>
                                    {goal.frequency === 'monthly' ? 'Meta Mensal' : goal.frequency === 'weekly' ? 'Meta Semanal' : goal.frequency === 'daily' ? 'Meta Diária' : 'Meta Anual'}
                                </span>
                                {!goal.is_template && (
                                    <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-2">Personalizada</span>
                                )}
                            </div>
                            <h3 className="font-bold text-lg text-slate-800 leading-tight mb-2">{goal.name}</h3>
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-100 flex items-end justify-between">
                            <div>
                                <div className="text-xs text-slate-500 mb-0.5">Alvo</div>
                                <div className="text-2xl font-black text-indigo-700">
                                    {goal.target_type === 'money' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.target_value) : goal.target_value}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-slate-500 mb-0.5">Progresso</div>
                                <div className="text-lg font-bold text-indigo-600">
                                    {goal.target_type === 'money' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.achieved) : goal.achieved}
                                </div>
                            </div>
                        </div>
                        {goal.target_value > 0 && (
                            <div className="mt-4">
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min(100, (goal.achieved / goal.target_value) * 100)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between items-center mt-1.5">
                                    <span className="text-[10px] font-bold text-slate-400">
                                        {Math.round((goal.achieved / goal.target_value) * 100)}%
                                    </span>
                                    {goal.remaining > 0 ? (
                                        <span className="text-[10px] font-bold text-amber-600">
                                            Faltam {goal.target_type === 'money' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.remaining) : goal.remaining}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-emerald-600">Atingida!</span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function TeamGoalsTab() {
    const { activeTenantId } = useTenant();
    const [selectedUserId, setSelectedUserId] = useState<string>("");
    const [showGlobal, setShowGlobal] = useState(true);

    // Fetch users with hierarchy
    const usersQ = useQuery({
        queryKey: ["team_goals_users", activeTenantId],
        queryFn: async () => {
            if (!activeTenantId) return [];

            // Fetch users with their profiles and org nodes
            const { data: profiles, error: pErr } = await supabase
                .from("users_profile")
                .select("user_id, display_name, email, role")
                .eq("tenant_id", activeTenantId)
                .is("deleted_at", null);
            if (pErr) throw pErr;

            const { data: nodes, error: nErr } = await supabase
                .from("org_nodes")
                .select("user_id, parent_user_id")
                .eq("tenant_id", activeTenantId);
            if (nErr) throw nErr;

            const nodeMap = new Map(nodes?.map(n => [n.user_id, n.parent_user_id]));

            const list = (profiles || []).map(p => ({
                id: p.user_id,
                name: p.display_name || p.email || p.user_id,
                role: p.role,
                parentId: nodeMap.get(p.user_id) || null
            }));

            // Sort: Admin first, then by parent hierarchy
            const admins = list.filter(u => u.role === 'admin').sort((a, b) => a.name.localeCompare(b.name));
            const others = list.filter(u => u.role !== 'admin');

            // Simple tree sort for others
            const sortedOthers: any[] = [];
            const visit = (pid: string | null, depth: number) => {
                const candidates = others
                    .filter(u => u.parentId === pid)
                    .sort((a, b) => a.name.localeCompare(b.name));
                for (const c of candidates) {
                    sortedOthers.push({ ...c, depth });
                    visit(c.id, depth + 1);
                }
            };
            visit(null, 0);

            // Add remaining (orphans not in tree)
            const addedIds = new Set(sortedOthers.map(u => u.id));
            const orphans = others.filter(u => !addedIds.has(u.id));

            return [
                ...admins.map(a => ({ ...a, depth: 0 })),
                ...sortedOthers,
                ...orphans.map(o => ({ ...o, depth: 0 }))
            ];
        },
        enabled: !!activeTenantId
    });

    const selectedUser = usersQ.data?.find(u => u.id === selectedUserId);

    const goalsQ = useQuery({
        queryKey: ["team_user_goals", activeTenantId, selectedUserId],
        queryFn: async () => {
            if (!activeTenantId || !selectedUserId || !selectedUser) return null;

            // Fetch user goals
            const { data: userGoals, error: ugError } = await supabase
                .from("user_goals")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("user_id", selectedUserId);
            if (ugError) throw ugError;

            // Fetch role templates
            const { data: templates, error: tplError } = await supabase
                .from("goal_templates")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("role_key", selectedUser.role);
            if (tplError) throw tplError;

            // Merge
            const resolved = new Map<string, any>();
            for (const t of (templates || [])) resolved.set(t.metric_key, { ...t, is_template: true });
            for (const ug of (userGoals || [])) resolved.set(ug.metric_key, { ...ug, is_template: false });

            const goals = Array.from(resolved.values());

            // Calculate progress for each goal from incentive_events
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const { data: participant } = await supabase
                .from("incentive_participants")
                .select("id")
                .eq("tenant_id", activeTenantId)
                .eq("user_id", selectedUserId)
                .maybeSingle();

            if (!participant) return goals.map(g => ({ ...g, achieved: 0, remaining: g.target_value || 0 }));

            const { data: userEvents, error: eErr } = await supabase
                .from("incentive_events")
                .select("event_type, value, points")
                .eq("tenant_id", activeTenantId)
                .eq("participant_id", participant.id)
                .gte("created_at", startOfMonth.toISOString());

            if (eErr) throw eErr;

            const goalsWithProgress = goals.map(g => {
                const relevantEvents = userEvents.filter(e => e.event_type === g.metric_key);
                let achieved = 0;
                if (g.target_type === 'money') {
                    achieved = relevantEvents.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
                } else {
                    achieved = relevantEvents.length;
                    // Some events might have a value even if quantity, but usually 1 event = 1 count
                    // unless we use sum(points) or sum(value).
                    // For now, let's stick to COUNT for quantity.
                }

                return {
                    ...g,
                    achieved,
                    remaining: Math.max(0, (g.target_value || 0) - achieved)
                };
            });

            return goalsWithProgress;
        },
        enabled: !!activeTenantId && !!selectedUserId && !!selectedUser
    });

    const globalGoalsQ = useQuery({
        queryKey: ["tenant_global_goals", activeTenantId],
        queryFn: async () => {
            if (!activeTenantId || !usersQ.data) return null;

            const allUsers = usersQ.data;
            const userIds = allUsers.map(u => u.id);

            // Fetch all user goals (overrides)
            const { data: allUserGoals } = await supabase
                .from("user_goals")
                .select("*")
                .eq("tenant_id", activeTenantId);

            // Fetch all templates
            const { data: allTemplates } = await supabase
                .from("goal_templates")
                .select("*")
                .eq("tenant_id", activeTenantId);

            // Fetch all participants
            const { data: participants } = await supabase
                .from("incentive_participants")
                .select("id, user_id")
                .eq("tenant_id", activeTenantId);

            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            // Fetch all events for the month
            const { data: allEvents } = await supabase
                .from("incentive_events")
                .select("event_type, value, participant_id")
                .eq("tenant_id", activeTenantId)
                .gte("created_at", startOfMonth.toISOString());

            const participantMap = new Map(participants?.map(p => [p.id, p.user_id]));
            const userToGoals = new Map<string, Map<string, any>>();

            // Map templates by role
            const templatesByRole = new Map<string, any[]>();
            allTemplates?.forEach(t => {
                if (!templatesByRole.has(t.role_key)) templatesByRole.set(t.role_key, []);
                templatesByRole.get(t.role_key)?.push(t);
            });

            // Resolve goals for every user
            const globalMetrics = new Map<string, {
                name: string,
                target: number,
                achieved: number,
                type: string,
                freq: string
            }>();

            allUsers.forEach(u => {
                const resolved = new Map<string, any>();
                // Templates for user role
                templatesByRole.get(u.role)?.forEach(t => {
                    resolved.set(t.metric_key, { ...t });
                });
                // Overrides
                allUserGoals?.filter(ug => ug.user_id === u.id).forEach(ug => {
                    resolved.set(ug.metric_key, { ...ug });
                });

                resolved.forEach(g => {
                    if (!globalMetrics.has(g.metric_key)) {
                        globalMetrics.set(g.metric_key, {
                            name: g.name,
                            target: 0,
                            achieved: 0,
                            type: g.target_type,
                            freq: g.frequency
                        });
                    }
                    const m = globalMetrics.get(g.metric_key)!;
                    m.target += Number(g.target_value) || 0;
                });
            });

            // Sum achieved from events
            allEvents?.forEach(e => {
                if (globalMetrics.has(e.event_type)) {
                    const m = globalMetrics.get(e.event_type)!;
                    if (m.type === 'money') {
                        m.achieved += Number(e.value) || 0;
                    } else {
                        m.achieved += 1;
                    }
                }
            });

            return Array.from(globalMetrics.entries()).map(([key, val]) => ({
                metric_key: key,
                ...val
            })).sort((a, b) => a.name.localeCompare(b.name));
        },
        enabled: !!activeTenantId && !!usersQ.data
    });

    const isGlobalAndSelected = showGlobal && !selectedUserId;

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg border shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <h2 className="text-lg font-bold">Gestão de Metas da Equipe</h2>
                        <div className="flex gap-4 mt-1">
                            <button
                                onClick={() => { setSelectedUserId(""); setShowGlobal(true); }}
                                className={`text-xs font-bold uppercase tracking-wider pb-1 transition-all border-b-2 ${(!selectedUserId && showGlobal) ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}
                            >
                                Visão Geral (Tenant)
                            </button>
                            <button
                                onClick={() => { setShowGlobal(false); }}
                                className={`text-xs font-bold uppercase tracking-wider pb-1 transition-all border-b-2 ${(selectedUserId || !showGlobal) ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}
                            >
                                Por Usuário
                            </button>
                        </div>
                    </div>
                    <div className="w-full md:w-80">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Filtrar por Usuário</label>
                        <select
                            className="w-full h-10 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={selectedUserId}
                            onChange={(e) => {
                                setSelectedUserId(e.target.value);
                                if (e.target.value) setShowGlobal(false);
                            }}
                        >
                            <option value="">Todos os usuários...</option>
                            {usersQ.data?.map(u => (
                                <option key={u.id} value={u.id}>
                                    {"\u00A0\u00A0".repeat(u.depth)}{u.name} ({u.role})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {isGlobalAndSelected ? (
                    globalGoalsQ.isLoading ? (
                        <div className="py-12 text-center text-slate-500 italic">Consolidando dados do tenant...</div>
                    ) : !globalGoalsQ.data || globalGoalsQ.data.length === 0 ? (
                        <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed">
                            Nenhuma meta configurada no tenant.
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {globalGoalsQ.data.map((m: any) => (
                                    <div key={m.metric_key} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">{m.name}</div>
                                        <div className="flex items-end justify-between">
                                            <div className="text-xl font-black text-slate-800">
                                                {m.type === 'money' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(m.achieved) : m.achieved}
                                            </div>
                                            <div className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                                {Math.round((m.achieved / (m.target || 1)) * 100)}%
                                            </div>
                                        </div>
                                        <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-indigo-500 rounded-full"
                                                style={{ width: `${Math.min(100, (m.achieved / (m.target || 1)) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="border-t pt-6">
                                <h3 className="text-sm font-bold text-slate-400 uppercase mb-4 tracking-widest">Detalhamento Global</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {globalGoalsQ.data.map((goal: any) => (
                                        <div key={goal.metric_key} className="border rounded-xl p-5 shadow-sm bg-white border-slate-200">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                                        Meta Consolidada ({goal.freq})
                                                    </div>
                                                    <h3 className="font-bold text-slate-800 leading-tight">{goal.name}</h3>
                                                </div>
                                                <div className="bg-indigo-50 text-indigo-700 p-2 rounded-lg">
                                                    <Users className="w-4 h-4" />
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1.5">
                                                        <span className="text-slate-500">Progresso Geral</span>
                                                        <span className="font-bold text-slate-700">
                                                            {Math.round((goal.achieved / (goal.target || 1)) * 100)}%
                                                        </span>
                                                    </div>
                                                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                                            style={{ width: `${Math.min(100, (goal.achieved / (goal.target || 1)) * 100)}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                                                    <div>
                                                        <div className="text-[10px] text-slate-400 font-bold uppercase uppercase">Alvo Total</div>
                                                        <div className="text-sm font-bold text-slate-600">
                                                            {goal.type === 'money' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.target) : goal.target}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[10px] text-slate-400 font-bold uppercase uppercase">Atingido Total</div>
                                                        <div className="text-sm font-bold text-indigo-600">
                                                            {goal.type === 'money' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.achieved) : goal.achieved}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )
                ) : !selectedUserId ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 border-2 border-dashed rounded-xl bg-slate-50">
                        <Users className="w-12 h-12 mb-3 opacity-20" />
                        <p>Selecione um usuário acima para ver suas metas.</p>
                    </div>
                ) : goalsQ.isLoading ? (
                    <div className="py-12 text-center text-slate-500 italic">Carregando desempenho...</div>
                ) : !goalsQ.data || goalsQ.data.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed">
                        O usuário <strong>{selectedUser?.name}</strong> não possui metas configuradas.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {goalsQ.data.map((goal: any) => (
                            <div key={goal.id} className="border rounded-xl p-5 shadow-sm bg-white border-slate-200">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                            {goal.frequency}
                                        </div>
                                        <h3 className="font-bold text-slate-800 leading-tight">{goal.name}</h3>
                                    </div>
                                    <div className="bg-indigo-50 text-indigo-700 p-2 rounded-lg">
                                        <Target className="w-4 h-4" />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between text-xs mb-1.5">
                                            <span className="text-slate-500">Progresso</span>
                                            <span className="font-bold text-slate-700">
                                                {Math.round((goal.achieved / (goal.target_value || 1)) * 100)}%
                                            </span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                                style={{ width: `${Math.min(100, (goal.achieved / (goal.target_value || 1)) * 100)}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                                        <div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase uppercase">Alvo</div>
                                            <div className="text-sm font-bold text-slate-600">
                                                {goal.target_type === 'money' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.target_value) : goal.target_value}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-slate-400 font-bold uppercase uppercase">Atingido</div>
                                            <div className="text-sm font-bold text-indigo-600">
                                                {goal.target_type === 'money' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.achieved) : goal.achieved}
                                            </div>
                                        </div>
                                    </div>

                                    {goal.remaining > 0 ? (
                                        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded-md font-medium">
                                            <AlertCircle className="w-3 h-3" />
                                            Faltam {goal.target_type === 'money' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.remaining) : goal.remaining}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 p-2 rounded-md font-medium">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            Meta Atingida! 🚀
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
