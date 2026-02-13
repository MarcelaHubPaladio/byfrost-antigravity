import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { showError, showSuccess } from "@/utils/toast";

function getFinanceEnabled(modulesJson: any) {
  return Boolean(modulesJson?.finance_enabled === true);
}

function getSimulatorEnabled(modulesJson: any) {
  return Boolean(modulesJson?.simulator_enabled === true);
}

function setModuleFlag(modulesJson: any, key: string, enabled: boolean) {
  const base = (modulesJson ?? {}) as any;
  return { ...base, [key]: enabled };
}

export function TenantModulesPanel() {
  const qc = useQueryClient();
  const { activeTenantId, isSuperAdmin } = useTenant();
  const [saving, setSaving] = useState(false);

  const tenantQ = useQuery({
    queryKey: ["tenant_modules", activeTenantId],
    enabled: Boolean(activeTenantId && isSuperAdmin),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id,name,slug,modules_json")
        .eq("id", activeTenantId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Tenant não encontrado");
      return data as any;
    },
  });

  const financeEnabled = useMemo(() => getFinanceEnabled(tenantQ.data?.modules_json), [tenantQ.data]);
  const simulatorEnabled = useMemo(() => getSimulatorEnabled(tenantQ.data?.modules_json), [tenantQ.data]);

  const toggleModule = async (key: string, next: boolean) => {
    if (!activeTenantId) return;
    setSaving(true);
    try {
      const nextModules = setModuleFlag(tenantQ.data?.modules_json, key, next);
      const { error } = await supabase.from("tenants").update({ modules_json: nextModules }).eq("id", activeTenantId);
      if (error) throw error;
      showSuccess(`${key.replace(/_/g, " ")} ${next ? "habilitado" : "desabilitado"}.`);
      await qc.invalidateQueries({ queryKey: ["tenant_modules", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["nav_access", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["route_access", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["tenants"] });
    } catch (e: any) {
      showError(`Falha ao salvar módulos: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4">
      <Card className="rounded-[22px] border-slate-200 p-4">
        <div className="text-sm font-semibold text-slate-900">Módulos do tenant</div>
        <div className="mt-1 text-xs text-slate-600">
          Ative/desative módulos por tenant. Isso controla a visibilidade no menu e o acesso às rotas.
        </div>

        {!activeTenantId && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Selecione um tenant (botão "Trocar") para configurar módulos.
          </div>
        )}

        {activeTenantId && (
          <div className="mt-4 grid gap-2">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div>
                <div className="text-xs font-semibold text-slate-900">Financeiro</div>
                <div className="mt-0.5 text-[11px] text-slate-600">
                  Habilita Cockpit, Lançamentos, Ingestão, Planejamento, Decisões, Tensões e Quadro.
                </div>
              </div>
              <Switch
                checked={financeEnabled}
                disabled={saving || tenantQ.isLoading}
                onCheckedChange={(v) => toggleModule("finance_enabled", v)}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div>
                <div className="text-xs font-semibold text-slate-900">Simulador</div>
                <div className="mt-0.5 text-[11px] text-slate-600">Habilita a rota /app/simulator.</div>
              </div>
              <Switch
                checked={simulatorEnabled}
                disabled={saving || tenantQ.isLoading}
                onCheckedChange={(v) => toggleModule("simulator_enabled", v)}
              />
            </div>

            {tenantQ.isError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                Erro ao carregar módulos: {(tenantQ.error as any)?.message ?? ""}
              </div>
            )}

            <div className="text-[11px] text-slate-500">
              Obs: apenas super-admin consegue alterar (RLS em <span className="font-mono">tenants</span>).
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}