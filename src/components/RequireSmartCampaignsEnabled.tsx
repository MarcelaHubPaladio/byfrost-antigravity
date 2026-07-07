import { useTenant } from "@/providers/TenantProvider";
import { Navigate } from "react-router-dom";

export function isSmartCampaignsEnabled(modulesJson: any) {
  return Boolean(modulesJson?.smart_campaigns_enabled === true);
}

export function RequireSmartCampaignsEnabled({ children }: { children: React.ReactNode }) {
  const { activeTenant, loading } = useTenant();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500 dark:border-slate-800" />
      </div>
    );
  }

  if (!isSmartCampaignsEnabled(activeTenant?.modules_json)) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}
