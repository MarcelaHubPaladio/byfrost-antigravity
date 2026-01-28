import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";
import { Switch } from "@/components/ui/switch";

export default function Settings() {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const email = (user?.email ?? "").toLowerCase();
  const isSuperAdmin = env.APP_SUPER_ADMIN_EMAILS.includes(email);

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

  const setFeature = async (key: string, value: boolean) => {
    if (!activeTenantId) return;
    if (!isSuperAdmin) return;

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
      const { error } = await supabase.from("tenants").update({ branding_json: next }).eq("id", activeTenantId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["tenant_settings", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["cases", activeTenantId] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur md:p-5">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Configurações (MVP)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Nesta fase, tenants não editam regras. Apenas o super-admin pode ajustar toggles de governança.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Governança de comunicação</div>
              <div className="mt-1 text-xs text-slate-500">
                A IA nunca envia mensagem ao cliente sem aprovação humana. Além disso, o tenant pode desligar a
                feature “avisar cliente”.
              </div>

              <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">Notificar cliente após aprovação</div>
                  <div className="mt-0.5 text-xs text-slate-600">
                    Quando desligado, o painel registra aprovação mas não prepara envio.
                  </div>
                </div>
                <Switch
                  checked={features.notify_customer}
                  onCheckedChange={(v) => setFeature("notify_customer", v)}
                  disabled={!isSuperAdmin || saving}
                />
              </div>

              {!isSuperAdmin && (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Você não está na allowlist VITE_APP_SUPER_ADMIN_EMAILS. Modo somente leitura.
                </div>
              )}
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Branding JSON</div>
              <div className="mt-1 text-xs text-slate-500">
                Estrutura armazenada em tenants.branding_json (inclui toggles e, futuramente, paleta por logo).
              </div>

              <pre className="mt-4 max-h-[360px] overflow-auto rounded-2xl bg-slate-50 p-3 text-[11px] text-slate-700">
                {JSON.stringify(tenantQ.data?.branding_json ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
