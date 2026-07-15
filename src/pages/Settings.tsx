import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { showError, showSuccess } from "@/utils/toast";
import { Link2 } from "lucide-react";

const ADMIN_SET_SUPERADMIN_URL =
  "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/admin-set-super-admin";

export default function Settings() {
  const qc = useQueryClient();
  const { activeTenantId, isSuperAdmin } = useTenant();
  const { user } = useSession();
  const email = (user?.email ?? "").toLowerCase();

  // UI gate: allow either the env allowlist (bootstrap) OR the JWT claim (promoted super-admin).
  const isSuperAdminUi = env.APP_SUPER_ADMIN_EMAILS.includes(email) || isSuperAdmin;

  const tenantQ = useQuery({
    queryKey: ["tenant_settings", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id,name,slug,branding_json")
        .eq("id", activeTenantId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Tenant não encontrado");
      return data as any;
    },
  });

  const features = useMemo(() => {
    const bj = tenantQ.data?.branding_json ?? {};
    const f = bj.features ?? {};
    return {
      notify_customer: (f.notify_customer as boolean | undefined) ?? true,
      beeia_auto_pause_manual_msg: (f.beeia_auto_pause_manual_msg as boolean | undefined) ?? true,
    };
  }, [tenantQ.data]);

  const [saving, setSaving] = useState(false);
  const [enablingRlsSuperAdmin, setEnablingRlsSuperAdmin] = useState(false);

  const enableRlsSuperAdmin = async () => {
    // Keep bootstrap button restricted to allowlist only (safer): it updates auth metadata.
    if (!env.APP_SUPER_ADMIN_EMAILS.includes(email)) return;

    setEnablingRlsSuperAdmin(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão inválida");

      const res = await fetch(ADMIN_SET_SUPERADMIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ set: true }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      showSuccess(
        "Super-admin (RLS) ativado. Faça logout/login para o token carregar o novo claim."
      );
    } catch (e: any) {
      showError(
        `Não foi possível ativar super-admin (RLS). Verifique APP_SUPER_ADMIN_EMAILS nos Secrets das Edge Functions. (${e?.message ?? "erro"})`
      );
    } finally {
      setEnablingRlsSuperAdmin(false);
    }
  };

  const setFeature = async (key: string, value: boolean) => {
    if (!activeTenantId) return;
    if (!isSuperAdminUi) return;

    setSaving(true);
    try {
      const current = tenantQ.data?.branding_json ?? {};
      const next = {
        ...current,
        features: {
          ...(current.features ?? {}),
          [key]: value,
        },
      };
      const { error } = await supabase
        .from("tenants")
        .update({ branding_json: next })
        .eq("id", activeTenantId);
      if (error) throw error;

      showSuccess("Configuração salva.");
      await qc.invalidateQueries({ queryKey: ["tenant_settings", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["cases", activeTenantId] });
    } catch (e: any) {
      // Most common: RLS blocked because app_metadata.byfrost_super_admin is not set.
      showError(
        `Não foi possível salvar (RLS). Ative app_metadata.byfrost_super_admin=true. (${e?.message ?? "erro"})`
      );
      throw e;
    } finally {
      setSaving(false);
    }
  };

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5 dark:border-slate-800 dark:bg-slate-950/40">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Configurações (Governança)
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Nesta fase, apenas governança do tenant (somente super-admin).
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/30">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Governança de comunicação
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                A IA nunca envia mensagem ao cliente sem aprovação humana. Além disso, o tenant pode desligar a
                feature "avisar cliente".
              </div>

              <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Notificar cliente após aprovação
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                    Quando desligado, o painel registra aprovação mas não prepara envio.
                  </div>
                </div>
                <Switch
                  checked={features.notify_customer}
                  onCheckedChange={(v) => setFeature("notify_customer", v)}
                  disabled={!isSuperAdminUi || saving}
                />
              </div>

              {!isSuperAdminUi && (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Você não tem permissão de super-admin. Modo somente leitura.
                </div>
              )}

              {env.APP_SUPER_ADMIN_EMAILS.includes(email) && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                  <div className="font-medium text-slate-900 dark:text-slate-100">Super-admin (RLS)</div>
                  <div className="mt-1">
                    Para o banco permitir editar tenants (RLS), seu token precisa ter o claim
                    <span className="font-semibold"> app_metadata.byfrost_super_admin=true</span>.
                  </div>
                  <Button
                    onClick={enableRlsSuperAdmin}
                    disabled={enablingRlsSuperAdmin}
                    variant="secondary"
                    className="mt-3 h-10 rounded-2xl"
                  >
                    {enablingRlsSuperAdmin
                      ? "Ativando…"
                      : "Ativar super-admin (RLS) para meu usuário"}
                  </Button>
                  <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    Requer Secret <span className="font-medium">APP_SUPER_ADMIN_EMAILS</span> nas Edge
                    Functions. Depois de ativar, faça logout/login.
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/30">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                  <Link2 className="h-5 w-5" />
                </div>
                Integrações
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Conexões externas ficam protegidas por Edge Functions e tokens criptografados.
              </div>

              <Link
                to="/app/integrations/meta"
                className="mt-4 block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-white"
              >
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Meta (Instagram Business)</div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Conectar Instagram via Página do Facebook.
                </div>
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}