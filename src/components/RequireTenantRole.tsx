import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
import { AccessRedirect } from "@/components/AccessRedirect";
import { findFirstAllowedRoute } from "@/lib/access";
import { useTenant } from "@/providers/TenantProvider";

export function RequireTenantRole({
  roles,
  children,
}: {
  roles: string[];
  children: React.ReactNode;
}) {
  const { activeTenantId, activeTenant, loading, isSuperAdmin } = useTenant();
  const loc = useLocation();

  const roleKey = String(activeTenant?.role ?? "");

  const fallbackQ = useQuery({
    queryKey: ["role_guard_fallback", activeTenantId, roleKey, roles.join(",")],
    enabled: Boolean(!loading && !isSuperAdmin && activeTenantId && roleKey && !roles.includes(roleKey)),
    queryFn: async () => {
      const next = await findFirstAllowedRoute({ tenantId: activeTenantId!, roleKey });
      return next;
    },
    staleTime: 10_000,
  });

  if (loading) return <>{children}</>; // SessionProvider already has a loading screen; keep it simple.

  if (!activeTenantId || !activeTenant) {
    return <Navigate to="/tenants" replace state={{ from: loc.pathname }} />;
  }

  if (isSuperAdmin) return <>{children}</>;

  if (roles.includes(roleKey)) return <>{children}</>;

  const next = fallbackQ.data;
  return (
    <AccessRedirect
      title="Acesso restrito"
      description={`Esta área exige um cargo específico (${roles.join(", ")}).`}
      to={next?.path ?? "/tenants"}
      toLabel={next ? `Ir para ${next.label}` : "Trocar tenant"}
      details={[
        { label: "tenant", value: activeTenantId },
        { label: "seu cargo", value: roleKey || "—" },
        { label: "necessário", value: roles.join(", ") },
      ]}
    />
  );
}