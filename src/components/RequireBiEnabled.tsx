import { useTenant } from "@/providers/TenantProvider";
import { Navigate } from "react-router-dom";
import { Sparkles } from "lucide-react";

export function isBiEnabled(modulesJson: any) {
  return Boolean(modulesJson?.bi_enabled === true);
}

export function RequireBiEnabled({ children }: { children: React.ReactNode }) {
  const { activeTenant, loading } = useTenant();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Sparkles className="h-10 w-10 text-indigo-500 animate-pulse" />
            <div className="absolute inset-0 h-10 w-10 animate-ping rounded-full border-2 border-indigo-400 opacity-50" />
          </div>
          <span className="text-sm font-medium text-slate-500 animate-pulse">Carregando Inteligência...</span>
        </div>
      </div>
    );
  }

  if (!isBiEnabled(activeTenant?.modules_json)) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}
