import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/providers/TenantProvider";
import { AccessRedirect } from "@/components/AccessRedirect";
import { checkRouteAccess, findFirstAllowedRoute } from "@/lib/access";

export function RequireRouteAccess({
  routeKey,
  children,
}: {
  routeKey: string;
  children: ReactNode;
}) {
  const { activeTenantId, activeTenant, loading, isSuperAdmin } = useTenant();
  const loc = useLocation();

  const roleKey = activeTenant?.role ?? "";

  const accessQ = useQuery({
    queryKey: ["route_access", activeTenantId, roleKey, routeKey],
    enabled: Boolean(!loading && activeTenantId && roleKey && routeKey && !isSuperAdmin),
    queryFn: async () => {
      const allowed = await checkRouteAccess({ tenantId: activeTenantId!, roleKey, routeKey });
      return allowed;
    },
    staleTime: 10_000,
  });

  const fallbackQ = useQuery({
    queryKey: ["route_fallback", activeTenantId, roleKey, routeKey],
    enabled: Boolean(
      !loading && !isSuperAdmin && activeTenantId && roleKey && routeKey && accessQ.data === false
    ),
    queryFn: async () => {
      const next = await findFirstAllowedRoute({ tenantId: activeTenantId!, roleKey, excludeRouteKey: routeKey });
      return next;
    },
    staleTime: 10_000,
  });

  if (loading) return <>{children}</>;

  if (!activeTenantId || !activeTenant) {
    return <Navigate to="/tenants" replace state={{ from: loc.pathname }} />;
  }

  if (isSuperAdmin) return <>{children}</>;

  if (accessQ.isLoading) {
    return (
      <div className="min-h-[50vh] rounded-[28px] border border-slate-200 bg-white/60 p-5 text-sm text-slate-700 shadow-sm backdrop-blur">
        Carregando permissões…
      </div>
    );
  }

  if (accessQ.isError) {
    return (
      <AccessRedirect
        title="Permissões indisponíveis"
        description="Não consegui validar suas permissões agora (RLS/consulta)."
        to="/tenants"
        toLabel="Voltar para tenants"
        details={[
          { label: "tenant", value: activeTenantId },
          { label: "role", value: String(roleKey || "—") },
          { label: "rota", value: routeKey },
        ]}
      />
    );
  }

  if (accessQ.data) return <>{children}</>;

  if (fallbackQ.isLoading) {
    return (
      <AccessRedirect
        title="Acesso negado"
        description="Seu cargo não tem permissão para esta área. Procurando um destino permitido…"
        to="/tenants"
        toLabel="Ir para tenants"
        details={[
          { label: "tenant", value: activeTenantId },
          { label: "role", value: String(roleKey || "—") },
          { label: "rota", value: routeKey },
        ]}
        autoMs={1400}
      />
    );
  }

  const next = fallbackQ.data;
  if (!next) {
    return (
      <AccessRedirect
        title="Sem rotas liberadas"
        description="Seu usuário está vinculado ao tenant, mas não há nenhuma rota liberada para este cargo. Peça ao admin para ajustar a matriz de acesso."
        to="/tenants"
        toLabel="Trocar tenant"
        details={[
          { label: "tenant", value: activeTenantId },
          { label: "role", value: String(roleKey || "—") },
          { label: "rota solicitada", value: routeKey },
        ]}
        autoMs={1800}
      />
    );
  }

  return (
    <AccessRedirect
      title="Acesso negado"
      description="Seu cargo não tem permissão para esta área. Vou te levar para uma página liberada."
      to={next.path}
      toLabel={`Ir para ${next.label}`}
      details={[
        { label: "tenant", value: activeTenantId },
        { label: "role", value: String(roleKey || "—") },
        { label: "rota solicitada", value: routeKey },
        { label: "destino", value: `${next.key} → ${next.path}` },
      ]}
    />
  );
}