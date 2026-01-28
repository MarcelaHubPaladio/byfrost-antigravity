import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "@/providers/SessionProvider";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="rounded-2xl bg-white/70 backdrop-blur px-5 py-3 text-sm text-slate-600 shadow-sm border border-slate-200">
          Carregando sessão…
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }

  return <>{children}</>;
}
