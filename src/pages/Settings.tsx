import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";

const ADMIN_SET_SUPERADMIN_URL =
  "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/admin-set-super-admin";

function ThemeCard({
  selected,
  title,
  description,
  preview,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  preview: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full overflow-hidden rounded-[22px] border text-left transition",
        selected
          ? "border-[hsl(var(--byfrost-accent)/0.55)] bg-[hsl(var(--byfrost-accent)/0.08)]"
          : "border-slate-200 bg-white hover:border-slate-300",
        "dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-950/55"
      )}
    >
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {title}
          </div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{description}</div>
        </div>
        <div className="shrink-0">{preview}</div>
      </div>
    </button>
  );
}

export default function Settings() {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const { prefs, setMode, setCustom, isLoading: themeLoading } = useTheme();

  const email = (user?.email ?? "").toLowerCase();

  // UI gate (email allowlist). Database write gate is enforced by RLS via JWT app_metadata.byfrost_super_admin.
  const isSuperAdminUi = env.APP_SUPER_ADMIN_EMAILS.includes(email);

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
    };
  }, [tenantQ.data]);

  const [saving, setSaving] = useState(false);
  const [enablingRlsSuperAdmin, setEnablingRlsSuperAdmin] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);

  const enableRlsSuperAdmin = async () => {
    if (!isSuperAdminUi) return;
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

  const applyMode = async (mode: "byfrost" | "dark" | "custom") => {
    setThemeBusy(true);
    try {
      await setMode(mode);
      showSuccess("Tema atualizado.");
    } catch (e: any) {
      showError(`Não foi possível salvar seu tema. (${e?.message ?? "erro"})`);
    } finally {
      setThemeBusy(false);
    }
  };

  const saveCustom = async (patch: { accentHex?: string; bgHex?: string }) => {
    setThemeBusy(true);
    try {
      await setCustom({
        accentHex: patch.accentHex ?? prefs.custom.accentHex,
        bgHex: patch.bgHex ?? prefs.custom.bgHex,
      });
      showSuccess("Tema customizado salvo.");
    } catch (e: any) {
      showError(`Não foi possível salvar seu tema. (${e?.message ?? "erro"})`);
    } finally {
      setThemeBusy(false);
    }
  };

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5 dark:border-slate-800 dark:bg-slate-950/40">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Configurações
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Preferências do usuário e toggles de governança.
          </p>

          {/* Theme */}
          <div className="mt-5 rounded-[22px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Tema (por usuário)
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Escolha como o painel vai renderizar (Byfrost, Dark ou Custom).
                </div>
              </div>
              <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200">
                {themeLoading ? "carregando…" : prefs.mode}
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <ThemeCard
                selected={prefs.mode === "byfrost"}
                title="Byfrost"
                description="Tema atual do produto (paleta do tenant + layout claro)."
                onClick={() => applyMode("byfrost")}
                preview={
                  <div className="grid w-[108px] gap-1">
                    <div className="h-9 rounded-xl border border-slate-200 bg-[hsl(var(--byfrost-bg))]" />
                    <div className="h-9 rounded-xl bg-[hsl(var(--byfrost-accent))]" />
                  </div>
                }
              />

              <ThemeCard
                selected={prefs.mode === "dark"}
                title="Dark"
                description="Ativa dark mode. Mantém o accent do tenant."
                onClick={() => applyMode("dark")}
                preview={
                  <div className="grid w-[108px] gap-1">
                    <div className="h-9 rounded-xl border border-slate-800 bg-slate-950" />
                    <div className="h-9 rounded-xl bg-[hsl(var(--byfrost-accent))]" />
                  </div>
                }
              />

              <ThemeCard
                selected={prefs.mode === "custom"}
                title="Custom"
                description="Você escolhe o accent e o background."
                onClick={() => applyMode("custom")}
                preview={
                  <div className="grid w-[108px] gap-1">
                    <div className="h-9 rounded-xl border border-slate-200 bg-[hsl(var(--byfrost-bg))]" />
                    <div className="h-9 rounded-xl bg-[hsl(var(--byfrost-accent))]" />
                  </div>
                }
              />
            </div>

            {prefs.mode === "custom" && (
              <div className="mt-4 grid gap-3 rounded-[22px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40 lg:grid-cols-2">
                <div>
                  <Label className="text-xs text-slate-700 dark:text-slate-200">Cor principal (accent)</Label>
                  <div className="mt-2 flex items-center gap-3">
                    <Input
                      type="color"
                      value={prefs.custom.accentHex ?? "#6D28D9"}
                      onChange={(e) => saveCustom({ accentHex: e.target.value })}
                      disabled={themeBusy}
                      className="h-12 w-16 cursor-pointer rounded-2xl border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950"
                    />
                    <Input
                      value={prefs.custom.accentHex ?? "#6D28D9"}
                      onChange={(e) => saveCustom({ accentHex: e.target.value })}
                      disabled={themeBusy}
                      className="h-12 rounded-2xl border-slate-200 bg-white font-mono text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                      placeholder="#6D28D9"
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Dica: use um hex tipo <span className="font-medium">#6D28D9</span>.
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-slate-700 dark:text-slate-200">Background</Label>
                  <div className="mt-2 flex items-center gap-3">
                    <Input
                      type="color"
                      value={prefs.custom.bgHex ?? "#F7F7FF"}
                      onChange={(e) => saveCustom({ bgHex: e.target.value })}
                      disabled={themeBusy}
                      className="h-12 w-16 cursor-pointer rounded-2xl border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950"
                    />
                    <Input
                      value={prefs.custom.bgHex ?? "#F7F7FF"}
                      onChange={(e) => saveCustom({ bgHex: e.target.value })}
                      disabled={themeBusy}
                      className="h-12 rounded-2xl border-slate-200 bg-white font-mono text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                      placeholder="#F7F7FF"
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Mantemos o fundo claro para legibilidade.
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/50">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">Preview</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-[hsl(var(--byfrost-bg))] p-3 dark:border-slate-800">
                        <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Background</div>
                        <div className="mt-2 h-8 rounded-xl bg-white/70 dark:bg-slate-950/40" />
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Accent</div>
                        <div className="mt-2 h-8 rounded-xl bg-[hsl(var(--byfrost-accent))]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
              Suas preferências ficam salvas no banco e valem em qualquer dispositivo.
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
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
                  Você não está na allowlist VITE_APP_SUPER_ADMIN_EMAILS. Modo somente leitura.
                </div>
              )}

              {isSuperAdminUi && (
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
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Branding JSON</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Estrutura armazenada em tenants.branding_json (inclui toggles e, futuramente, paleta por logo).
              </div>

              <pre className="mt-4 max-h-[360px] overflow-auto rounded-2xl bg-slate-50 p-3 text-[11px] text-slate-700 dark:bg-slate-950/40 dark:text-slate-200">
                {JSON.stringify(tenantQ.data?.branding_json ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}