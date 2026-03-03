import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTenant } from "@/providers/TenantProvider";
import { AccessRedirect } from "@/components/AccessRedirect";

export function isTvCorporativaEnabled(modulesJson: any) {
    return Boolean(modulesJson?.tv_corporativa_enabled === true);
}

export function RequireTvCorporativaEnabled({ children }: { children: ReactNode }) {
    const { activeTenantId, activeTenant, loading } = useTenant();
    const loc = useLocation();

    if (loading) return <>{children}</>;

    if (!activeTenantId || !activeTenant) {
        return <Navigate to="/tenants" replace state={{ from: loc.pathname }} />;
    }

    const enabled = isTvCorporativaEnabled(activeTenant.modules_json);
    if (enabled) return <>{children}</>;

    return (
        <AccessRedirect
            title="TV Corporativa desabilitada"
            description="O módulo de TV Corporativa não está habilitado para este tenant. Peça ao admin para ativar em Admin → Módulos."
            to="/app"
            toLabel="Voltar"
            details={[
                { label: "tenant", value: activeTenantId },
                { label: "módulo", value: "tv_corporativa" },
            ]}
        />
    );
}
