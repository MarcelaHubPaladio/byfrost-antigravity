import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { showError, showSuccess } from "@/utils/toast";
import { ArrowLeft, UserSquare2, Target, KeyRound, Copy, Save, Plus, Library, Trash2, FileSignature, CheckCircle, AlertCircle, Pencil } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

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

            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(json.error || "Falha ao resetar senha");
            }

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
    const [targetType, setTargetType] = useState("quantity");

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

    const activeRuleQ = useQuery({
        queryKey: ["goal_role_rules", "active", activeTenantId, userData.role],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("goal_role_rules")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("role_key", userData.role)
                .eq("status", "published")
                .order("version", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
        enabled: !!activeTenantId && !!userData.role,
    });

    const sigQ = useQuery({
        queryKey: ["user_goal_signatures", activeTenantId, userData.user_id, activeRuleQ.data?.id],
        queryFn: async () => {
            if (!activeRuleQ.data?.id) return null;
            const { data, error } = await supabase
                .from("user_goal_signatures")
                .select("*")
                .eq("tenant_id", activeTenantId)
                .eq("user_id", userData.user_id)
                .eq("goal_role_rule_id", activeRuleQ.data.id)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
        enabled: !!activeTenantId && !!userData.user_id && !!activeRuleQ.data?.id,
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
            target_type: t.target_type || 'quantity',
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
                        target_type: targetType,
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
                    target_type: targetType,
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

    const toggleManualSignature = async () => {
        if (!activeRuleQ.data) return;

        try {
            const isSigned = sigQ.data?.autentique_status === "signed";
            const newStatus = isSigned ? "created" : "signed";

            if (sigQ.data) {
                const { error } = await supabase
                    .from("user_goal_signatures")
                    .update({
                        autentique_status: newStatus,
                        signed_at: newStatus === "signed" ? new Date().toISOString() : null
                    })
                    .eq("id", sigQ.data.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("user_goal_signatures")
                    .insert({
                        tenant_id: activeTenantId,
                        user_id: userData.user_id,
                        goal_role_rule_id: activeRuleQ.data.id,
                        autentique_status: newStatus,
                        signed_at: newStatus === "signed" ? new Date().toISOString() : null
                    });
                if (error) throw error;
            }

            showSuccess(`Assinatura manual ${isSigned ? 'removida' : 'confirmada'} com sucesso!`);
            queryClient.invalidateQueries({ queryKey: ["user_goal_signatures", activeTenantId, userData.user_id, activeRuleQ.data.id] });
        } catch (e: any) {
            showError(`Erro ao alterar assinatura: ${e.message}`);
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
                        setTargetType("quantity");
                        setIsModalOpen(true);
                    }}>
                        <Plus className="w-4 h-4 mr-1" />
                        Nova Meta
                    </Button>
                </div>
            </div>

            {activeRuleQ.data && (
                <div className={`p-4 rounded-lg flex items-center justify-between border ${sigQ.data?.autentique_status === "signed" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                    <div className="flex items-center gap-3">
                        {sigQ.data?.autentique_status === "signed" ? (
                            <CheckCircle className="w-6 h-6 text-emerald-600" />
                        ) : (
                            <AlertCircle className="w-6 h-6 text-amber-600" />
                        )}
                        <div>
                            <h3 className={`font-semibold ${sigQ.data?.autentique_status === "signed" ? "text-emerald-900" : "text-amber-900"}`}>
                                Termos e Diretrizes (Versão {activeRuleQ.data.version})
                            </h3>
                            <p className={`text-sm ${sigQ.data?.autentique_status === "signed" ? "text-emerald-700" : "text-amber-700"}`}>
                                {sigQ.data?.autentique_status === "signed"
                                    ? `Usuário assinou os termos em ${sigQ.data.signed_at ? new Date(sigQ.data.signed_at).toLocaleDateString("pt-BR") : "(data desconhecida)"}.`
                                    : "Usuário ainda não assinou a versão ativa deste termo."}
                            </p>
                        </div>
                    </div>
                    <div>
                        <Button
                            variant="outline"
                            size="sm"
                            className={sigQ.data?.autentique_status === "signed" ? "text-slate-600 hover:bg-slate-200" : "bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-300"}
                            onClick={toggleManualSignature}
                        >
                            <FileSignature className="w-4 h-4 mr-2" />
                            {sigQ.data?.autentique_status === "signed" ? 'Mover para Pendente' : 'Marcar como Assinado Manualmente'}
                        </Button>
                    </div>
                </div>
            )}

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
                            <div className="text-sm text-slate-600 mt-1 flex gap-4 items-center">
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-xs shrink-0">Chave: {g.metric_key}</span>
                                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-xs font-medium shrink-0">
                                    Alvo: {g.target_type === 'money' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(g.target_value) : g.target_value}
                                </span>
                                <span className="text-slate-500 text-xs shrink-0">{g.frequency === 'monthly' ? 'Mensal' : g.frequency === 'weekly' ? 'Semanal' : 'Diário'}</span>
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
