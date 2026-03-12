import { Navigate } from "react-router-dom";
import { useSession } from "@/providers/SessionProvider";
import { useTenant } from "@/providers/TenantProvider";
import { useTheme } from "@/providers/ThemeProvider";
import PublicPortal from "./PublicPortal";

export default function Index() {
  const hostname = window.location.hostname;
  const isMainDomain = hostname.includes('localhost') || 
                      hostname.includes('byfrost') || 
                      hostname.endsWith('.vercel.app');

  if (!isMainDomain) {
    return <PublicPortal />;
  }

  const { user, loading } = useSession();
  const { tenants, activeTenantId, loading: tenantsLoading } = useTenant();
  const { prefs } = useTheme();

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

  if (activeTenantId) {
    const target = prefs.startRoute || "/app";
    return <Navigate to={target} replace />;
  }

  if (tenants.length === 1) {
    const target = prefs.startRoute || "/app";
    return <Navigate to={target} replace />;
  }

  return <Navigate to="/tenants" replace />;
}