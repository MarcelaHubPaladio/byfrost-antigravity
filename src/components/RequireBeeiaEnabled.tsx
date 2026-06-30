import { useTenant } from "@/providers/TenantProvider";
import { Navigate } from "react-router-dom";

export function isBeeiaEnabled(modulesJson: any) {
  return Boolean(modulesJson?.beeia_enabled === true);
}

export function RequireBeeiaEnabled({ children }: { children: React.ReactNode }) {
  const { activeTenant, isLoading } = useTenant();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-yellow-500 dark:border-slate-800" />
      </div>
    );
  }

  if (!isBeeiaEnabled(activeTenant?.modules_json)) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}
