import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Target, FileText, Save } from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { showSuccess, showError } from "@/utils/toast";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import { AlertCircle, FileSignature } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { checkRouteAccess } from "@/lib/access";

const ROLES = [
    { id: "admin", name: "Admin", description: "Administrador do sistema" },
    { id: "manager", name: "Gerente", description: "Gerente da operação" },
    { id: "supervisor", name: "Supervisor", description: "Supervisor da equipe" },
    { id: "leader", name: "Líder", description: "Líder de equipe" },
    { id: "vendor", name: "Vendedor", description: "Atendimento e vendas" },
];

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

    const canManage = Boolean(manageAccessQ.data);

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
                            {canManage && (
                                <TabsTrigger value="manage" className="flex items-center gap-2">
                                    <Target className="w-4 h-4" />
                                    Configuração
                                </TabsTrigger>
                            )}
                        </TabsList>

                        <TabsContent value="my-goals">
                            <MyGoalsDashboard />
                        </TabsContent>

                        {canManage && (
                            <TabsContent value="manage">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                                    <div className="border bg-white rounded-lg p-4 shadow-sm h-full max-h-[70vh] flex flex-col">
                                        <div className="flex justify-between items-center mb-4">
                                            <h2 className="font-semibold text-lg">Cargos</h2>
                                        </div>

                                        <div className="flex-1 overflow-y-auto space-y-2">
                                            {ROLES.map((role) => (
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
                                                        <div className="text-xs text-slate-500 truncate mt-0.5">{role.description}</div>
                                                    </div>
                                                </div>
                                            ))}
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
                                                        <TemplatesEditor roleKey={selectedRole} />
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

function TemplatesEditor({ roleKey }: { roleKey: string }) {
    const { activeTenantId } = useTenant();
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTpl, setEditingTpl] = useState<any>(null);

    const [name, setName] = useState("");
    const [metricKey, setMetricKey] = useState("");
    const [targetValue, setTargetValue] = useState("");
    const [frequency, setFrequency] = useState("monthly");

    const tplQuery = useQuery({
        queryKey: ["goal_templates", activeTenantId, roleKey],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("goal_templates")
                .select("*")
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
                    })
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
            const { error } = await supabase.from("goal_templates").delete().eq("id", id);
            if (error) throw error;
            showSuccess("Template excluído!");
            queryClient.invalidateQueries({ queryKey: ["goal_templates"] });
        } catch (e: any) {
            showError(e.message);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-4 pb-4 border-b">
                <div>
                    <h2 className="font-semibold text-lg">Templates de Metas</h2>
                    <p className="text-sm text-slate-500">Defina o que é esperado padrão para este cargo.</p>
                </div>
                <Button
                    onClick={() => {
                        setEditingTpl(null);
                        setName("");
                        setMetricKey("");
                        setTargetValue("");
                        setFrequency("monthly");
                        setIsModalOpen(true);
                    }}
                >
                    <Plus className="w-4 h-4 mr-1" /> Adicionar Meta
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
                {tplQuery.data?.map((tpl) => (
                    <div key={tpl.id} className="p-4 rounded-lg border flex justify-between items-center">
                        <div>
                            <div className="font-medium">{tpl.name}</div>
                            <div className="text-sm text-slate-600 mt-1 flex gap-4">
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-xs">Chave: {tpl.metric_key}</span>
                                <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-medium">Alvo: {tpl.target_value}</span>
                                <span className="text-slate-500 text-xs mt-1">{tpl.frequency === 'monthly' ? 'Mensal' : tpl.frequency === 'weekly' ? 'Semanal' : 'Diário'}</span>
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
        </div>
    );
}

function RoleRulesEditor({ roleKey }: { roleKey: string }) {
    const { activeTenantId } = useTenant();
    const { user } = useSession();
    const queryClient = useQueryClient();

    const [editorHtml, setEditorHtml] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const rulesQ = useQuery({
        queryKey: ["goal_role_rules", activeTenantId, roleKey],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("goal_role_rules")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("role_key", roleKey)
                .order("version", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            return data;
        },
        enabled: !!activeTenantId && !!roleKey,
    });

    useEffect(() => {
        if (rulesQ.data && !isSaving) {
            setEditorHtml(rulesQ.data.content_html || "");
        } else if (!rulesQ.isLoading && !rulesQ.data && !isSaving) {
            setEditorHtml("");
        }
    }, [rulesQ.data, rulesQ.isLoading]);

    const handleSave = async () => {
        if (!activeTenantId || !user) return;
        setIsSaving(true);
        try {
            const currentVersion = rulesQ.data?.version || 0;
            const content = editorHtml.trim();

            if (!content) {
                showError("O conteúdo da regra não pode ser vazio.");
                setIsSaving(false);
                return;
            }

            // Insert new version
            const { error } = await supabase.from("goal_role_rules").insert({
                tenant_id: activeTenantId,
                role_key: roleKey,
                version: currentVersion + 1,
                content_html: content,
                created_by: user.id
            });

            if (error) throw error;

            showSuccess(`Regras salvas! (v${currentVersion + 1})`);
            queryClient.invalidateQueries({ queryKey: ["goal_role_rules", activeTenantId, roleKey] });
        } catch (e: any) {
            showError(`Erro ao salvar regra: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (rulesQ.isLoading) {
        return <div className="p-8 text-center text-slate-500">Carregando regras do cargo...</div>;
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-4 pb-4 border-b">
                <div>
                    <h2 className="font-semibold text-lg">Diretrizes e Regras do Cargo</h2>
                    <p className="text-sm text-slate-500">
                        {rulesQ.data ? `Versão atual ativa: v${rulesQ.data.version}` : 'Nenhuma regra configurada ainda para este cargo.'}
                    </p>
                </div>
                <Button onClick={handleSave} disabled={isSaving || (rulesQ.data?.content_html === editorHtml.trim())}>
                    <Save className="w-4 h-4 mr-2" />
                    Salvar Nova Versão
                </Button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-800">
                <strong>Importante:</strong> Ao salvar uma nova versão aqui, todos os usuários deste cargo
                receberão uma notificação para realizar a Assinatura Digital do termo atualizado no Autentique.
            </div>

            <div className="flex-1 min-h-[400px] border rounded-lg bg-slate-50 overflow-hidden flex flex-col">
                <div className="p-2 border-b bg-white">
                    <span className="text-xs font-bold text-slate-500 uppercase">Editor de Texto Rico (Versão {rulesQ.data ? rulesQ.data.version + 1 : 1} - Rascunho)</span>
                </div>
                <div className="flex-1 overflow-auto p-4 bg-white prose prose-sm max-w-none prose-slate">
                    <RichTextEditor value={editorHtml} onChange={setEditorHtml} />
                </div>
            </div>
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
            const { data: activeRule } = await supabase
                .from("goal_role_rules")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("role_key", roleKey)
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

    if (goalsQ.isLoading) {
        return <div className="p-8 text-center text-slate-500">Carregando metas...</div>;
    }

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
                {goalsQ.data.goals.map((goal: any) => (
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
                                <div className="text-2xl font-black text-indigo-700">{goal.target_value}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-slate-500 mb-0.5">Progresso</div>
                                <div className="text-lg font-bold text-slate-300">--</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
