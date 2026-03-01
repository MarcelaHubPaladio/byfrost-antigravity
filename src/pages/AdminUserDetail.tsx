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

export default function AdminUserDetail() {
    const { id } = useParams();
    const nav = useNavigate();
    const { activeTenantId } = useTenant();

    const userQuery = useQuery({
        queryKey: ["tenant_user", activeTenantId, id],
        queryFn: async () => {
            if (!activeTenantId || !id) return null;
            const { data, error } = await supabase
                .from("tenant_users")
                .select(`
          *,
          tenant_job_titles (id, name)
        `)
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
    const [jobId, setJobId] = useState(userData.job_title_id || "");

    const [resetModalOpen, setResetModalOpen] = useState(false);
    const [tempPassword, setTempPassword] = useState("");
    const [isResetting, setIsResetting] = useState(false);

    const jobsQuery = useQuery({
        queryKey: ["tenant_job_titles", activeTenantId],
        queryFn: async () => {
            const { data, error } = await supabase.from("tenant_job_titles").select("*").eq("tenant_id", activeTenantId);
            if (error) throw error;
            return data;
        },
    });

    const save = async () => {
        try {
            const { error } = await supabase
                .from("tenant_users")
                .update({
                    display_name: name,
                    phone_e164: phone,
                    role,
                    job_title_id: jobId || null,
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
                <div className="space-y-2">
                    <label className="text-sm font-medium">Cargo (Central de Metas)</label>
                    <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={jobId}
                        onChange={(e) => setJobId(e.target.value)}
                    >
                        <option value="">Sem cargo vinculado</option>
                        {jobsQuery.data?.map((j) => (
                            <option key={j.id} value={j.id}>{j.name}</option>
                        ))}
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
    return (
        <div className="bg-white p-6 rounded-lg border shadow-sm">
            <h2 className="text-lg font-bold mb-4">Metas do Usuário</h2>
            <p className="text-sm text-slate-500 mb-6">Em breve: Listagem e CRUD de metas individuais baseadas no cargo '{userData.tenant_job_titles?.name || "Nenhum"}'.</p>
        </div>
    );
}
