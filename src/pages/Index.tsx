import { Navigate } from "react-router-dom";
import { useSession } from "@/providers/SessionProvider";
import { useTenant } from "@/providers/TenantProvider";

export default function Index() {
  const { user, loading } = useSession();
  const { tenants, activeTenantId, loading: tenantsLoading } = useTenant();

  if (loading || tenantsLoading) {
    return (
      <div className="min-h-screen bg-[hsl(var(--byfrost-bg))] flex items-center justify-center">
        <div className="rounded-2xl bg-white/70 backdrop-blur px-5 py-3 text-sm text-slate-600 shadow-sm border border-slate-200">
          Carregando…
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (activeTenantId) return <Navigate to="/app" replace />;

  if (tenants.length === 1) return <Navigate to="/app" replace />;

  return <Navigate to="/tenants" replace />;
}