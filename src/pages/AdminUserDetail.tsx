import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { showError, showSuccess } from "@/utils/toast";
import { ArrowLeft, UserSquare2, Target, KeyRound } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Library } from "lucide-react";

export default function AdminUserDetail() {
    const { id } = useParams();
    const nav = useNavigate();
    const { activeTenantId } = useTenant();

    const userQuery = useQuery({
        queryKey: ["tenant_user", activeTenantId, id],
        queryFn: async () => {
            if (!activeTenantId || !id) return null;
            const { data, error } = await supabase
                .from("users_profile")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("user_id", id)
                .single();
            if (error) throw error;
            return data;
        },
        enabled: !!activeTenantId && !!id,
    });

    if (userQuery.isLoading) return <AppShell>Carregando...</AppShell>;
    if (!userQuery.data) return <AppShell>Usuário não encontrado.</AppShell>;

    return (
        <RequireAuth>
            <AppShell>
                <div className="max-w-4xl mx-auto space-y-6">
                    <div className="flex items-center gap-4 border-b pb-4">
                        <Button variant="outline" size="icon" onClick={() => nav("/app/admin")}>
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold">Editar Usuário</h1>
                            <p className="text-sm text-slate-500">{userQuery.data.display_name || userQuery.data.email}</p>
                        </div>
                    </div>

                    <Tabs defaultValue="data" className="w-full">
                        <TabsList className="mb-4">
                            <TabsTrigger value="data" className="flex items-center gap-2">
                                <UserSquare2 className="w-4 h-4" />
                                Dados
                            </TabsTrigger>
                            <TabsTrigger value="goals" className="flex items-center gap-2">
                                <Target className="w-4 h-4" />
                                Central de Metas
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="data">
                            <UserDataTab userData={userQuery.data} />
                        </TabsContent>

                        <TabsContent value="goals">
                            <UserGoalsTab userData={userQuery.data} />
                        </TabsContent>
                    </Tabs>
                </div>
            </AppShell>
        </RequireAuth>
    );
}

function UserDataTab({ userData }: { userData: any }) {
    const { activeTenantId } = useTenant();
    const queryClient = useQueryClient();
    const [name, setName] = useState(userData.display_name || "");
    const [email, setEmail] = useState(userData.email || "");
    const [phone, setPhone] = useState(userData.phone_e164 || "");
    const [role, setRole] = useState(userData.role || "member");

    const [resetModalOpen, setResetModalOpen] = useState(false);
    const [tempPassword, setTempPassword] = useState("");
    const [isResetting, setIsResetting] = useState(false);

    const save = async () => {
        try {
            const { error } = await supabase
                .from("users_profile")
                .update({
                    display_name: name,
                    phone_e164: phone,
                    role,
                })
                .eq("tenant_id", activeTenantId)
                .eq("user_id", userData.user_id);

            if (error) throw error;
            showSuccess("Dados atualizados.");
            queryClient.invalidateQueries({ queryKey: ["tenant_user", activeTenantId, userData.user_id] });
        } catch (e: any) {
            showError(e.message);
        }
    };

    const resetPassword = async () => {
        setIsResetting(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Não autenticado");

            const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-reset-pwd`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ targetUserId: userData.user_id })
            });

            if (!res.ok) {
                throw new Error("Falha ao resetar senha");
            }

            const json = await res.json();
            setTempPassword(json.tempPassword);
        } catch (e: any) {
            showError(e.message);
        } finally {
            setIsResetting(false);
        }
    };

    const copyPwd = () => {
        navigator.clipboard.writeText(tempPassword);
        showSuccess("Senha copiada!");
    };

    return (
        <div className="bg-white p-6 rounded-lg border shadow-sm space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Nome</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">E-mail</label>
                    <Input value={email} disabled className="bg-slate-50" />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Telefone</label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Role do Sistema</label>
                    <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                    >
                        <option value="admin">Administrador</option>
                        <option value="manager">Gerente</option>
                        <option value="member">Membro</option>
                    </select>
                </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
                <Button variant="secondary" onClick={() => setResetModalOpen(true)}>
                    <KeyRound className="w-4 h-4 mr-2" /> Resetar Senha
                </Button>
                <Button onClick={save}>Salvar Alterações</Button>
            </div>

            <Dialog open={resetModalOpen} onOpenChange={setResetModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Resetar Senha</DialogTitle>
                        <DialogDescription>
                            Isso irá gerar uma nova senha aleatória. O usuário não poderá mais acessar usando a senha antiga.
                        </DialogDescription>
                    </DialogHeader>

                    {tempPassword ? (
                        <div className="space-y-4 py-4 text-center">
                            <p className="text-sm text-slate-600">A nova senha temporária é:</p>
                            <div className="text-2xl font-mono tracking-widest font-bold text-slate-900 bg-slate-100 p-4 rounded-lg">
                                {tempPassword}
                            </div>
                            <Button onClick={copyPwd} className="w-full">Copiar Senha</Button>
                        </div>
                    ) : (
                        <div className="flex justify-end gap-2 mt-4">
                            <Button variant="outline" onClick={() => setResetModalOpen(false)}>Cancelar</Button>
                            <Button variant="destructive" onClick={resetPassword} disabled={isResetting}>
                                Confirmar Reset
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function UserGoalsTab({ userData }: { userData: any }) {
    const { activeTenantId } = useTenant();
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGoal, setEditingGoal] = useState<any>(null);

    const [name, setName] = useState("");
    const [metricKey, setMetricKey] = useState("");
    const [targetValue, setTargetValue] = useState("");
    const [frequency, setFrequency] = useState("monthly");

    const goalsQ = useQuery({
        queryKey: ["user_goals", activeTenantId, userData.user_id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("user_goals")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("user_id", userData.user_id)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        },
        enabled: !!activeTenantId && !!userData.user_id,
    });

    const templatesQ = useQuery({
        queryKey: ["goal_templates", activeTenantId, userData.role],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("goal_templates")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("role_key", userData.role);
            if (error) throw error;
            return data;
        },
        enabled: !!activeTenantId && !!userData.role,
    });

    const loadFromTemplates = async () => {
        if (!templatesQ.data || templatesQ.data.length === 0) {
            showError("Não há templates disponíveis para esta role.");
            return;
        }

        const existingKeys = new Set(goalsQ.data?.map(g => g.metric_key) || []);
        const toInsert = templatesQ.data.filter(t => !existingKeys.has(t.metric_key)).map(t => ({
            tenant_id: activeTenantId,
            user_id: userData.user_id,
            name: t.name,
            metric_key: t.metric_key,
            target_value: t.target_value,
            frequency: t.frequency,
            template_id: t.id,
        }));

        if (toInsert.length === 0) {
            showSuccess("Todas as metas do cargo já foram importadas.");
            return;
        }

        try {
            const { error } = await supabase.from("user_goals").insert(toInsert);
            if (error) throw error;
            showSuccess(`${toInsert.length} meta(s) importada(s) do template padrão!`);
            queryClient.invalidateQueries({ queryKey: ["user_goals"] });
        } catch (e: any) {
            showError(e.message);
        }
    };

    const saveGoal = async () => {
        if (!name.trim() || !metricKey.trim() || !targetValue) return;
        try {
            if (editingGoal) {
                const { error } = await supabase
                    .from("user_goals")
                    .update({
                        name,
                        metric_key: metricKey,
                        target_value: Number(targetValue),
                        frequency,
                    })
                    .eq("id", editingGoal.id);
                if (error) throw error;
                showSuccess("Meta atualizada!");
            } else {
                const { error } = await supabase.from("user_goals").insert({
                    tenant_id: activeTenantId,
                    user_id: userData.user_id,
                    name,
                    metric_key: metricKey,
                    target_value: Number(targetValue),
                    frequency,
                });
                if (error) throw error;
                showSuccess("Meta criada!");
            }
            setIsModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["user_goals"] });
        } catch (e: any) {
            showError(e.message);
        }
    };

    const deleteGoal = async (id: string) => {
        if (!confirm("Excluir esta meta para o usuário?")) return;
        try {
            const { error } = await supabase.from("user_goals").delete().eq("id", id);
            if (error) throw error;
            showSuccess("Meta removida!");
            queryClient.invalidateQueries({ queryKey: ["user_goals"] });
        } catch (e: any) {
            showError(e.message);
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg border shadow-sm flex flex-col min-h-[500px]">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-lg font-bold">Metas do Usuário</h2>
                    <p className="text-sm text-slate-500">Defina os objetivos de desempenho específicos para esta pessoa.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={loadFromTemplates} disabled={templatesQ.isLoading}>
                        <Library className="w-4 h-4 mr-2" />
                        Importar do Cargo ({userData.role})
                    </Button>
                    <Button onClick={() => {
                        setEditingGoal(null);
                        setName("");
                        setMetricKey("");
                        setTargetValue("");
                        setFrequency("monthly");
                        setIsModalOpen(true);
                    }}>
                        <Plus className="w-4 h-4 mr-1" />
                        Nova Meta
                    </Button>
                </div>
            </div>

            <div className="flex-1 space-y-3">
                {goalsQ.data?.map((g) => (
                    <div key={g.id} className="p-4 rounded-lg border flex justify-between items-center">
                        <div>
                            <div className="font-medium flex items-center gap-2">
                                {g.name}
                                {g.template_id && (
                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
                                        Template
                                    </span>
                                )}
                            </div>
                            <div className="text-sm text-slate-600 mt-1 flex gap-4">
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-xs">Chave: {g.metric_key}</span>
                                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-xs font-medium">Alvo: {g.target_value}</span>
                                <span className="text-slate-500 text-xs mt-1">{g.frequency === 'monthly' ? 'Mensal' : g.frequency === 'weekly' ? 'Semanal' : 'Diário'}</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setEditingGoal(g);
                                    setName(g.name);
                                    setMetricKey(g.metric_key);
                                    setTargetValue(String(g.target_value));
                                    setFrequency(g.frequency);
                                    setIsModalOpen(true);
                                }}
                            >
                                Editar
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => deleteGoal(g.id)}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                ))}

                {goalsQ.data?.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                        <Target className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        Nenhuma meta cadastrada para este usuário.
                    </div>
                )}
            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingGoal ? "Editar Meta do Usuário" : "Nova Meta do Usuário"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nome / Descritivo</label>
                            <Input
                                placeholder="Ex: Vender 20 itens"
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value);
                                    if (!editingGoal) {
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
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Alvo (Valor Meta)</label>
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
                                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                        <Button onClick={saveGoal}>Salvar</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
