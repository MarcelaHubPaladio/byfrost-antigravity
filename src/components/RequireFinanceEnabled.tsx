import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTenant } from "@/providers/TenantProvider";
import { AccessRedirect } from "@/components/AccessRedirect";

function isFinanceEnabled(modulesJson: any) {
  return Boolean(modulesJson?.finance_enabled === true);
}

export function RequireFinanceEnabled({ children }: { children: ReactNode }) {
  const { activeTenantId, activeTenant, loading } = useTenant();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-sm text-slate-500">Validando módulo…</div>
      </div>
    );
  }

  if (!activeTenantId || !activeTenant) {
    return <Navigate to="/tenants" replace state={{ from: loc.pathname }} />;
  }

  const enabled = isFinanceEnabled(activeTenant.modules_json);
  if (enabled) return <>{children}</>;

  return (
    <AccessRedirect
      title="Financeiro desabilitado"
      description="O módulo Financeiro não está habilitado para este tenant. Peça ao admin para ativar em Admin → Módulos."
      to="/app"
      toLabel="Voltar"
      details={[
        { label: "tenant", value: activeTenantId },
        { label: "módulo", value: "finance" },
      ]}
    />
  );
}
