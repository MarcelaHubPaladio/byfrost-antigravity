import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { showError, showSuccess } from "@/utils/toast";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, UserX, Copy, KeySquare } from "lucide-react";
import { useSession } from "@/providers/SessionProvider";

interface Props {
  commitmentId: string;
}

export function M30ClientUsersPanel({ commitmentId }: Props) {
  const { activeTenantId } = useTenant();
  const { session } = useSession();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [inviteResult, setInviteResult] = useState<{
    link: string;
    tempPassword?: string;
  } | null>(null);

  const usersQ = useQuery({
    queryKey: ["m30_client_users", activeTenantId, commitmentId],
    enabled: Boolean(activeTenantId && commitmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m30_client_users")
        .select(`
          id,
          user_id,
          created_at,
          users_profile!m30_client_users_user_id_fkey(display_name, email)
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("commitment_id", commitmentId);
      
      if (error) throw error;
      return data;
    }
  });

  const handleInvite = async () => {
    if (!email.trim() || !displayName.trim()) {
      showError("Preencha nome e e-mail.");
      return;
    }
    setLoading(true);
    setInviteResult(null);

    try {
      const res = await fetch("https://pryoirzeghatrgecwrci.supabase.co/functions/v1/admin-invite-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          tenantId: activeTenantId,
          email: email.trim(),
          displayName: displayName.trim(),
          role: "m30_client"
        })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Falha ao convidar usuário");
      }

      // Agora vinculamos o usuário criado ao contrato
      const { error: linkErr } = await supabase
        .from("m30_client_users")
        .upsert({
          tenant_id: activeTenantId!,
          commitment_id: commitmentId,
          user_id: data.userId
        }, { onConflict: "tenant_id,commitment_id,user_id" });

      if (linkErr) throw linkErr;

      showSuccess("Usuário convidado e vinculado com sucesso!");
      
      setInviteResult({
        link: data.passwordResetLink,
        tempPassword: data.tempPassword
      });

      usersQ.refetch();
      setEmail("");
      setDisplayName("");
      
    } catch (e: any) {
      showError(e.message || "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover o acesso deste cliente a este contrato?")) return;
    try {
      const { error } = await supabase.from("m30_client_users").delete().eq("id", id);
      if (error) throw error;
      showSuccess("Acesso removido.");
      usersQ.refetch();
    } catch (e: any) {
      showError(e.message);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between py-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">Acessos do Cliente</CardTitle>
          <CardDescription>Usuários M30 autorizados a ver este contrato via App</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Novo Acesso
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {usersQ.isLoading ? (
          <p className="text-sm text-slate-500 py-4">Carregando acessos...</p>
        ) : usersQ.data?.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">Nenhum acesso configurado para este contrato.</p>
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            {usersQ.data?.map(u => (
              <div key={u.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{(u.users_profile as any)?.display_name || "Sem Nome"}</p>
                  <p className="text-xs text-slate-500">{(u.users_profile as any)?.email}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleRemove(u.id)}>
                  <UserX className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar Cliente M30</DialogTitle>
          </DialogHeader>

          {!inviteResult ? (
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label>Nome Completo</Label>
                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Ex: João Silva" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>E-mail</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="Ex: joao@empresa.com" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-4 bg-green-50 p-4 rounded-xl mt-2 border border-green-100">
              <p className="text-sm font-medium text-green-800">Convite gerado! Compartilhe o link de acesso com o cliente:</p>
              
              {inviteResult.link && (
                <div className="flex gap-2 items-center">
                  <Input readOnly value={inviteResult.link} className="bg-white text-xs h-10" />
                  <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(inviteResult.link!)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {inviteResult.tempPassword && (
                <div className="mt-2 flex flex-col gap-2">
                  <p className="text-xs text-green-700 flex items-center gap-1"><KeySquare className="w-3 h-3"/> Senha Temporária:</p>
                  <div className="flex gap-2 items-center">
                    <Input readOnly value={inviteResult.tempPassword} className="bg-white font-mono text-xs h-10" />
                    <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(inviteResult.tempPassword!)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              <Button className="mt-2 w-full" variant="secondary" onClick={() => { setInviteResult(null); setDialogOpen(false); }}>Concluir</Button>
            </div>
          )}

          {!inviteResult && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleInvite} disabled={loading || !email || !displayName}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Convidar e Vincular
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
