import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AccessRedirect } from "@/components/AccessRedirect";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { useChatInstanceAccess } from "@/hooks/useChatInstanceAccess";
import { supabase } from "@/lib/supabase";

export function RequireChatInstanceAccess({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const { user } = useSession();
  const { activeTenantId, activeTenant, loading, isSuperAdmin } = useTenant();
  const chatAccess = useChatInstanceAccess();

  const isPresenceManagerQ = useQuery({
    queryKey: ["chat_is_presence_manager", activeTenantId, user?.id],
    enabled: Boolean(activeTenantId && user?.id && !isSuperAdmin),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_presence_manager", { p_tenant_id: activeTenantId! });
      if (error) throw error;
      return Boolean(data);
    },
  });

  if (loading) return <>{children}</>;

  // Tenant or auth missing.
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!activeTenantId || !activeTenant) return <Navigate to="/tenants" replace state={{ from: loc.pathname }} />;

  // Super-admin pode abrir o chat mesmo sem número vinculado.
  if (isSuperAdmin) return <>{children}</>;

  const isPresenceManager = Boolean(isPresenceManagerQ.data);

  if (chatAccess.isLoading || isPresenceManagerQ.isLoading) {
    return (
      <div className="min-h-[50vh] rounded-[28px] border border-slate-200 bg-white/60 p-5 text-sm text-slate-700 shadow-sm backdrop-blur">
        Validando acesso ao Chat…
      </div>
    );
  }

  // Gestores podem ver conversas do tenant mesmo sem instância própria.
  if (isPresenceManager) return <>{children}</>;

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