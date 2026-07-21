import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import { ArrowLeft, RefreshCw, BarChart, Plus, HelpCircle } from "lucide-react";

export default function IntegrationsMetaAds() {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();
  const { user } = useSession();

  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [adAccountId, setAdAccountId] = useState("");
  const [name, setName] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const accountsQ = useQuery({
    queryKey: ["meta_ads_accounts", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_ads_accounts")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenantId || !adAccountId || !name || !accessToken) {
      showError("Preencha todos os campos.");
      return;
    }

    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão inválida");

      const res = await fetch("https://pryoirzeghatrgecwrci.supabase.co/functions/v1/meta-ads-manual-connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenantId: activeTenantId,
          adAccountId,
          name,
          accessToken,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.details || json?.error || `HTTP ${res.status}`);
      }

      showSuccess("Conta de anúncios conectada com sucesso!");
      setFormOpen(false);
      setAdAccountId("");
      setName("");
      setAccessToken("");
      qc.invalidateQueries({ queryKey: ["meta_ads_accounts", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao salvar conexão: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("meta_ads_accounts")
        .update({ is_active: !isActive })
        .eq("id", id);
      
      if (error) throw error;
      showSuccess(!isActive ? "Conta reativada." : "Conta desativada.");
      qc.invalidateQueries({ queryKey: ["meta_ads_accounts", activeTenantId] });
    } catch (e: any) {
      showError("Erro ao atualizar conta", e);
    }
  };

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                  <BarChart className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-slate-900">Integrações • Meta Ads</h2>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Conecte contas de anúncios para ingestão de dados e BI.
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <Link
                  to="/app/settings"
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar para Configurações
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                onClick={() => accountsQ.refetch()}
                variant="secondary"
                className="h-10 rounded-2xl"
                disabled={accountsQ.isFetching}
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", accountsQ.isFetching ? "animate-spin" : "")} />
                Atualizar
              </Button>
              <Button
                onClick={() => setFormOpen(!formOpen)}
                className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
              >
                <Plus className="mr-2 h-4 w-4" />
                Nova Conexão Manual
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Contas Conectadas</div>
              
              <div className="mt-4 grid gap-3">
                {(accountsQ.data ?? []).map((a: any) => (
                  <div
                    key={a.id}
                    className={cn(
                      "rounded-[20px] border p-4",
                      a.is_active ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50/50"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{a.name}</div>
                        <div className="mt-0.5 text-xs text-slate-600 font-mono">{a.ad_account_id}</div>
                        
                        <div className="mt-3 flex items-center gap-2">
                          <Badge
                            className={cn(
                              "rounded-full border-0",
                              a.is_active
                                ? "bg-emerald-100 text-emerald-900"
                                : "bg-amber-100 text-amber-900"
                            )}
                          >
                            {a.is_active ? "Ativa" : "Desativada"}
                          </Badge>
                          <Badge variant="outline" className="rounded-full">
                            {a.currency} - {a.timezone}
                          </Badge>
                        </div>
                      </div>
                      
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => toggleActive(a.id, a.is_active)}
                        className={cn(
                          "rounded-xl text-xs",
                          a.is_active
                            ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                            : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                        )}
                      >
                        {a.is_active ? "Desativar" : "Reativar"}
                      </Button>
                    </div>
                  </div>
                ))}

                {!accountsQ.isLoading && (accountsQ.data ?? []).length === 0 && (
                  <div className="rounded-[20px] border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600 text-center">
                    Nenhuma conta de anúncios conectada ainda.
                  </div>
                )}
              </div>
            </div>

            {formOpen && (
              <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900 mb-4">Adicionar Conexão Manual</div>
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Nome de Exibição (Interno)</Label>
                    <Input
                      required
                      placeholder="Ex: Cliente X Ads"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label>ID da Conta de Anúncios</Label>
                    <Input
                      required
                      placeholder="Ex: act_123456789"
                      value={adAccountId}
                      onChange={(e) => setAdAccountId(e.target.value)}
                      className="rounded-xl font-mono"
                    />
                    <div className="text-[10px] text-slate-500">Pode conter o prefixo 'act_' ou não.</div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Token de Acesso (System User)</Label>
                    <Input
                      required
                      type="password"
                      placeholder="EAA..."
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      className="rounded-xl font-mono"
                    />
                  </div>

                  <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-3 mt-4">
                    <h4 className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
                      <HelpCircle className="h-3.5 w-3.5" /> 
                      Como gerar o Token Manual (System User)?
                    </h4>
                    <ol className="mt-2 space-y-1 text-[11px] text-blue-800 list-decimal list-inside pl-1">
                      <li>Acesse o <strong>Configurações do Negócio</strong> no Meta.</li>
                      <li>Vá em <strong>Usuários &gt; Usuários do sistema</strong> e adicione um novo usuário do tipo "Funcionário" ou "Administrador".</li>
                      <li>Clique em <strong>Adicionar ativos</strong> e dê permissão de visualização (ou administração) à respectiva <strong>Conta de anúncios</strong>.</li>
                      <li>Clique em <strong>Gerar novo token</strong>, selecione seu App e marque as permissões: <code>ads_read</code>, <code>ads_management</code> e <code>read_insights</code>.</li>
                      <li>Copie o token gerado (que começa com <code>EAA...</code>) e cole aqui. Lembre-se: ele não expira e deve ser mantido em segurança!</li>
                    </ol>
                  </div>

                  <div className="pt-2">
                    <Button type="submit" className="w-full rounded-xl bg-[hsl(var(--byfrost-accent))] text-white" disabled={saving}>
                      {saving ? "Salvando..." : "Salvar Conexão"}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
