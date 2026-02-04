import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AccessRedirect } from "@/components/AccessRedirect";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { useChatInstanceAccess } from "@/hooks/useChatInstanceAccess";

export function RequireChatInstanceAccess({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const { user } = useSession();
  const { activeTenantId, activeTenant, loading, isSuperAdmin } = useTenant();
  const chatAccess = useChatInstanceAccess();

  if (loading) return <>{children}</>;

  // Tenant or auth missing.
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!activeTenantId || !activeTenant) return <Navigate to="/tenants" replace state={{ from: loc.pathname }} />;

  if (isSuperAdmin) return <>{children}</>;

  if (chatAccess.isLoading) {
    return (
      <div className="min-h-[50vh] rounded-[28px] border border-slate-200 bg-white/60 p-5 text-sm text-slate-700 shadow-sm backdrop-blur">
        Validando acesso ao Chat…
      </div>
    );
  }

  if (!chatAccess.hasAccess) {
    return (
      <AccessRedirect
        title="Chat indisponível"
        description="Seu número de WhatsApp não está vinculado a nenhuma instância ativa deste tenant."
        to="/tenants"
        toLabel="Trocar tenant"
        details={[
          { label: "tenant", value: activeTenantId },
          { label: "usuário", value: user.id },
          { label: "telefone", value: String(chatAccess.userPhone ?? "—") },
        ]}
        autoMs={1400}
      />
    );
  }

  return <>{children}</>;
}
