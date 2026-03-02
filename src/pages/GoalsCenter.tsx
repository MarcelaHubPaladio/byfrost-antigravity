import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Target } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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

                                    <div className="md:col-span-2 border bg-white rounded-lg p-4 shadow-sm max-h-[70vh] flex flex-col">
                                        {selectedRole ? (
                                            <TemplatesEditor roleKey={selectedRole} />
                                        ) : (
                                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                                                <Target className="w-12 h-12 mb-2 opacity-50" />
                                                <p>Selecione um cargo para configurar os templates de metas.</p>
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

function MyGoalsDashboard() {
    const { activeTenantId } = useTenant();
    const { user } = useSession();

    const goalsQ = useQuery({
        queryKey: ["my_goals", activeTenantId, user?.id],
        queryFn: async () => {
            if (!activeTenantId || !user?.id) return null;
            const { data, error } = await supabase
                .from("user_goals")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("user_id", user.id)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        },
        enabled: !!activeTenantId && !!user?.id,
    });

    if (goalsQ.isLoading) {
        return <div className="p-8 text-center text-slate-500">Carregando metas...</div>;
    }

    if (!goalsQ.data || goalsQ.data.length === 0) {
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
            <h2 className="text-lg font-bold mb-6">Minhas Metas</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {goalsQ.data.map((goal: any) => (
                    <div key={goal.id} className="border rounded-xl p-5 shadow-sm bg-white relative overflow-hidden flex flex-col justify-between min-h-[160px]">
                        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 rounded-l-xl"></div>
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                                {goal.frequency === 'monthly' ? 'Meta Mensal' : goal.frequency === 'weekly' ? 'Meta Semanal' : goal.frequency === 'daily' ? 'Meta Diária' : 'Meta Anual'}
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
