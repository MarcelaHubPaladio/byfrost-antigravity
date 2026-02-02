import { supabase } from "@/lib/supabase";

export type CandidateRoute = {
  key: string;
  path: string;
  label: string;
};

// Ordered by what we consider the best "landing" options.
export const CANDIDATE_ROUTES: CandidateRoute[] = [
  { key: "app.dashboard", path: "/app", label: "Dashboard" },
  { key: "app.chat", path: "/app/chat", label: "Chat" },
  { key: "app.crm", path: "/app/crm", label: "CRM" },
  { key: "app.content", path: "/app/content", label: "Conteúdo" },
  { key: "app.presence", path: "/app/presence", label: "Ponto" },
  { key: "app.simulator", path: "/app/simulator", label: "Simulador" },
  { key: "app.me", path: "/app/me", label: "Meu usuário" },
  { key: "app.settings", path: "/app/settings", label: "Config" },
];

export async function checkRouteAccess(params: {
  tenantId: string;
  roleKey: string;
  routeKey: string;
}) {
  const { tenantId, roleKey, routeKey } = params;
  const { data, error } = await supabase.rpc("check_route_access", {
    p_tenant_id: tenantId,
    p_role_key: roleKey,
    p_route_key: routeKey,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function findFirstAllowedRoute(params: {
  tenantId: string;
  roleKey: string;
  excludeRouteKey?: string;
}) {
  const { tenantId, roleKey, excludeRouteKey } = params;

  for (const r of CANDIDATE_ROUTES) {
    if (excludeRouteKey && r.key === excludeRouteKey) continue;
    const allowed = await checkRouteAccess({ tenantId, roleKey, routeKey: r.key });
    if (allowed) return r;
  }

  return null;
}
