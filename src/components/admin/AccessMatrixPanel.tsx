import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { Shield, Route, Plus, RefreshCw } from "lucide-react";

type TenantRoleRow = {
  role_id: string;
  enabled: boolean;
  roles: { key: string; name: string } | null;
};

type RouteRow = {
  key: string;
  name: string;
  category: string | null;
  path_pattern: string | null;
  description: string | null;
};

type PermRow = {
  role_id: string;
  route_key: string;
  allowed: boolean;
};

function slugify(s: string) {
  return (s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-_.]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

const DEFAULT_ROUTES: RouteRow[] = [
  {
    key: "app.dashboard",
    name: "Dashboard",
    category: "App",
    path_pattern: "/app, /app/j/:journeyKey",
    description: "Tela principal com lista de cases por jornada",
  },
  {
    key: "app.trello",
    name: "Tarefas (Trello)",
    category: "App",
    path_pattern: "/app/trello, /app/j/trello",
    description: "Visão de quadros/trello para tarefas",
  },
  { key: "app.chat", name: "Chat", category: "App", path_pattern: "/app/chat", description: "Chat do painel" },
  {
    key: "app.case_detail",
    name: "Detalhe do case",
    category: "App",
    path_pattern: "/app/cases/:id",
    description: "Detalhe do case (WhatsApp + timeline)",
  },
  { key: "app.crm", name: "CRM", category: "App", path_pattern: "/app/crm", description: "Lista/visão CRM" },
  {
    key: "crm.case_detail",
    name: "CRM • Detalhe do case",
    category: "CRM",
    path_pattern: "/crm/cases/:id",
    description: "Detalhe do case com cards de CRM",
  },
  {
    key: "app.settings",
    name: "Configurações",
    category: "App",
    path_pattern: "/app/settings",
    description: "Configurações do tenant",
  },
  {
    key: "app.simulator",
    name: "Simulador",
    category: "App",
    path_pattern: "/app/simulator",
    description: "Simulador de automação",
  },
  {
    key: "app.incentives_events_manage",
    name: "Incentivos • Gestão de eventos",
    category: "Incentivos",
    path_pattern: "/app/incentives/events",
    description: "Tela de gestão para criar/editar/remover eventos",
  },
  {
    key: "app.goals",
    name: "Metas • Dashboard",
    category: "Metas",
    path_pattern: "/app/goals",
    description: "Acesso ao próprio dashboard de metas",
  },
  {
    key: "app.goals.manage",
    name: "Metas • Gestão",
    category: "Metas",
    path_pattern: "/app/goals",
    description: "Permite configurar templates e cargos na Central de Metas",
  },
  {
    key: "app.inventory",
    name: "Inventário",
    category: "App",
    path_pattern: "/app/inventory",
    description: "Lista e gestão de inventário/estoque",
  },
  {
    key: "app.commitments",
    name: "Compromissos",
    category: "App",
    path_pattern: "/app/commitments",
    description: "Lista de compromissos e marcos",
  },
  {
    key: "app.contracts",
    name: "Contratos",
    category: "App",
    path_pattern: "/app/contracts",
    description: "Lista e gestão de contratos",
  },
  {
    key: "app.commitment_detail",
    name: "Detalhe do compromisso",
    category: "App",
    path_pattern: "/app/commitments/:id",
    description: "Visualização detalhada de um compromisso",
  },
  {
    key: "app.communication",
    name: "Comunicação",
    category: "App",
    path_pattern: "/app/communication",
    description: "Módulo de chat interno e canais",
  },
];

const DEFAULT_ROLES = [
  { key: "admin", name: "Admin" },
  { key: "manager", name: "Gerente" },
  { key: "supervisor", name: "Supervisor" },
  { key: "leader", name: "Líder" },
  { key: "vendor", name: "Vendedor" },
];

export function AccessMatrixPanel() {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();

  const rolesQ = useQuery({
    queryKey: ["tenant_roles_enabled", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_roles")
        .select("role_id,enabled,roles(key,name)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true)
        .limit(500);
      if (error) throw error;

      const rows = (data ?? []) as any[];
      const mapped = rows
        .map((r) => ({
          role_id: r.role_id as string,
          enabled: Boolean(r.enabled),
          roles: r.roles ? { key: String(r.roles.key), name: String(r.roles.name) } : null,
        }))
        .filter((r) => Boolean(r.roles?.key));

      mapped.sort((a, b) => (a.roles?.name ?? "").localeCompare(b.roles?.name ?? ""));
      return mapped as TenantRoleRow[];
    },
  });

  const routesQ = useQuery({
    queryKey: ["route_registry"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_registry")
        .select("key,name,category,path_pattern,description")
        .is("deleted_at", null)
        .order("category", { ascending: true })
        .order("name", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as RouteRow[];
    },
  });

  const permsQ = useQuery({
    queryKey: ["tenant_route_permissions", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_route_permissions")
        .select("role_id,route_key,allowed")
        .eq("tenant_id", activeTenantId!)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as PermRow[];
    },
  });

  const roles = rolesQ.data ?? [];
  const routes = routesQ.data ?? [];
  const perms = permsQ.data ?? [];

  const permsByKey = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of perms) m.set(`${p.role_id}:${p.route_key}`, Boolean(p.allowed));
    return m;
  }, [perms]);

  const protectedRoutes = useMemo(() => {
    const s = new Set<string>();
    for (const p of perms) s.add(p.route_key);
    return s;
  }, [perms]);

  const categories = useMemo(() => {
    const map = new Map<string, RouteRow[]>();
    for (const r of routes) {
      const cat = r.category ?? "Outros";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(r);
    }
    return Array.from(map.entries());
  }, [routes]);

  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleKey, setNewRoleKey] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  const [newRouteName, setNewRouteName] = useState("");
  const [newRouteKey, setNewRouteKey] = useState("");
  const [newRoutePattern, setNewRoutePattern] = useState("");
  const [newRouteCategory, setNewRouteCategory] = useState("App");
  const [savingRoute, setSavingRoute] = useState(false);

  const ensureRoleExists = async (key: string, name: string) => {
    const { data: existing, error: selErr } = await supabase
      .from("roles")
      .select("id,key,name")
      .eq("key", key)
      .limit(1)
      .maybeSingle();
    if (selErr) throw selErr;

    if (existing?.id) return existing.id as string;

    const { data: ins, error: insErr } = await supabase
      .from("roles")
      .insert({ key, name })
      .select("id")
      .single();
    if (insErr) throw insErr;
    return ins.id as string;
  };

  const enableRoleForTenant = async (roleId: string) => {
    const { error } = await supabase.from("tenant_roles").insert({
      tenant_id: activeTenantId,
      role_id: roleId,
      enabled: true,
      config_json: {},
    });

    // Se já existir, ignora
    if (error && !String(error.message ?? "").toLowerCase().includes("duplicate")) throw error;
  };

  const initDefaultRoles = async () => {
    if (!activeTenantId) return;
    try {
      setSavingRole(true);
      for (const r of DEFAULT_ROLES) {
        const id = await ensureRoleExists(r.key, r.name);
        await enableRoleForTenant(id);
      }
      showSuccess("Cargos padrão inicializados.");
      await qc.invalidateQueries({ queryKey: ["tenant_roles_enabled", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao inicializar cargos: ${e?.message ?? "erro"}`);
    } finally {
      setSavingRole(false);
    }
  };

  const createRole = async () => {
    if (!activeTenantId) return;
    const key = slugify(newRoleKey || newRoleName);
    const name = newRoleName.trim();
    if (!key || !name) return;

    setSavingRole(true);
    try {
      const roleId = await ensureRoleExists(key, name);
      await enableRoleForTenant(roleId);
      showSuccess("Cargo criado.");
      setNewRoleName("");
      setNewRoleKey("");
      await qc.invalidateQueries({ queryKey: ["tenant_roles_enabled", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao criar cargo: ${e?.message ?? "erro"}`);
    } finally {
      setSavingRole(false);
    }
  };

  const initDefaultRoutes = async () => {
    try {
      const { error } = await supabase
        .from("route_registry")
        .upsert(
          DEFAULT_ROUTES.map((r) => ({ ...r, is_system: true })),
          { onConflict: "key" }
        );
      if (error) throw error;
      showSuccess("Rotas padrão registradas.");
      await qc.invalidateQueries({ queryKey: ["route_registry"] });
    } catch (e: any) {
      showError(`Falha ao registrar rotas: ${e?.message ?? "erro"}`);
    }
  };

  const createRoute = async () => {
    const key = slugify(newRouteKey || newRouteName);
    const name = newRouteName.trim();
    if (!key || !name) return;

    setSavingRoute(true);
    try {
      const { error } = await supabase.from("route_registry").insert({
        key,
        name,
        category: newRouteCategory.trim() || null,
        path_pattern: newRoutePattern.trim() || null,
        description: null,
        is_system: false,
      });
      if (error) throw error;
      showSuccess("Rota cadastrada.");
      setNewRouteName("");
      setNewRouteKey("");
      setNewRoutePattern("");
      await qc.invalidateQueries({ queryKey: ["route_registry"] });
    } catch (e: any) {
      showError(`Falha ao cadastrar rota: ${e?.message ?? "erro"}`);
    } finally {
      setSavingRoute(false);
    }
  };

  const setRouteProtected = async (routeKey: string, next: boolean) => {
    if (!activeTenantId) return;
    try {
      if (!next) {
        const { error } = await supabase
          .from("tenant_route_permissions")
          .delete()
          .eq("tenant_id", activeTenantId)
          .eq("route_key", routeKey);
        if (error) throw error;
      } else {
        const payload = roles.map((r) => ({
          tenant_id: activeTenantId,
          role_id: r.role_id,
          route_key: routeKey,
          allowed: true,
        }));

        const { error } = await supabase
          .from("tenant_route_permissions")
          .upsert(payload, { onConflict: "tenant_id,role_id,route_key" });
        if (error) throw error;
      }

      await qc.invalidateQueries({ queryKey: ["tenant_route_permissions", activeTenantId] });
      showSuccess(next ? "Rota protegida." : "Rota aberta para todos.");
    } catch (e: any) {
      showError(`Falha ao atualizar proteção: ${e?.message ?? "erro"}`);
    }
  };

  const setAllowed = async (routeKey: string, roleId: string, allowed: boolean) => {
    if (!activeTenantId) return;
    try {
      const { error } = await supabase
        .from("tenant_route_permissions")
        .upsert(
          {
            tenant_id: activeTenantId,
            role_id: roleId,
            route_key: routeKey,
            allowed,
          },
          { onConflict: "tenant_id,role_id,route_key" }
        );
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["tenant_route_permissions", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao salvar permissão: ${e?.message ?? "erro"}`);
    }
  };

  if (!activeTenantId) {
    return (
      <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Selecione um tenant (botão "Trocar") para configurar cargos e permissões.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[22px] border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Cargos (Roles)</div>
                <div className="mt-0.5 text-[11px] text-slate-500">Crie cargos e use na matriz de rotas.</div>
              </div>
            </div>
            <Button
              variant="secondary"
              className="h-10 rounded-2xl"
              onClick={initDefaultRoles}
              disabled={savingRole}
              title="Cria admin/manager/supervisor/leader/vendor para o tenant"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Inicializar padrão
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_0.9fr_auto]">
            <div>
              <Label className="text-xs">Nome do cargo</Label>
              <Input
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                className="mt-1 rounded-2xl"
                placeholder="Ex: Operador"
              />
            </div>
            <div>
              <Label className="text-xs">Chave (role key)</Label>
              <Input
                value={newRoleKey}
                onChange={(e) => setNewRoleKey(e.target.value)}
                className="mt-1 rounded-2xl"
                placeholder="Ex: operador"
              />
              <div className="mt-1 text-[11px] text-slate-500">Usada no users_profile.role.</div>
            </div>
            <div className="flex items-end">
              <Button
                onClick={createRole}
                disabled={savingRole || !newRoleName.trim()}
                className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-4 text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
              >
                <Plus className="mr-2 h-4 w-4" />
                Criar
              </Button>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <Badge key={r.role_id} className="rounded-full border-0 bg-slate-100 text-slate-800 hover:bg-slate-100">
                {r.roles?.name}
                <span className="mx-2 text-slate-400">•</span>
                <span className="font-normal text-slate-600">{r.roles?.key}</span>
              </Badge>
            ))}
            {roles.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
                Nenhum cargo habilitado para este tenant. Clique em "Inicializar padrão" ou crie um novo.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-700">
                <Route className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Rotas protegíveis</div>
                <div className="mt-0.5 text-[11px] text-slate-500">Cadastre rotas novas para já existirem na matriz.</div>
              </div>
            </div>
            <Button variant="secondary" className="h-10 rounded-2xl" onClick={initDefaultRoutes}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Registrar rotas do app
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_0.9fr]">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input
                value={newRouteName}
                onChange={(e) => setNewRouteName(e.target.value)}
                className="mt-1 rounded-2xl"
                placeholder="Ex: Relatórios"
              />
            </div>
            <div>
              <Label className="text-xs">Chave (route key)</Label>
              <Input
                value={newRouteKey}
                onChange={(e) => setNewRouteKey(e.target.value)}
                className="mt-1 rounded-2xl"
                placeholder="Ex: app.reports"
              />
            </div>
            <div>
              <Label className="text-xs">Path (opcional)</Label>
              <Input
                value={newRoutePattern}
                onChange={(e) => setNewRoutePattern(e.target.value)}
                className="mt-1 rounded-2xl"
                placeholder="Ex: /app/reports"
              />
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Input
                value={newRouteCategory}
                onChange={(e) => setNewRouteCategory(e.target.value)}
                className="mt-1 rounded-2xl"
                placeholder="Ex: App"
              />
            </div>

            <div className="sm:col-span-2">
              <Button
                onClick={createRoute}
                disabled={savingRoute || !newRouteName.trim()}
                className="h-10 w-full rounded-2xl bg-slate-900 text-white hover:bg-slate-800"
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar rota
              </Button>
            </div>
          </div>

          <div className="mt-4 text-[11px] text-slate-500">
            Dica: uma rota só vira "protegida" quando você liga o switch na matriz.
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Matriz de permissões</div>
            <div className="mt-1 text-[11px] text-slate-600">
              Se a rota estiver <span className="font-medium">desprotegida</span>, todos os cargos do tenant acessam.
            </div>
          </div>
          <Badge className="rounded-full border-0 bg-indigo-100 text-indigo-900 hover:bg-indigo-100">
            tenant_route_permissions
          </Badge>
        </div>

        <Separator className="my-4" />

        {roles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
            Primeiro crie/initialize os cargos.
          </div>
        ) : routes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-600">
            Registre as rotas do app ou adicione uma rota.
          </div>
        ) : (
          <div className="space-y-5">
            {categories.map(([cat, rows]) => (
              <div key={cat}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-700">{cat}</div>
                  <div className="text-[11px] text-slate-500">{rows.length} rota(s)</div>
                </div>

                <div className="overflow-auto rounded-2xl border border-slate-200">
                  <div className="min-w-[860px] bg-slate-50">
                    <div
                      className="grid items-center gap-0 border-b border-slate-200"
                      style={{ gridTemplateColumns: `340px 120px repeat(${roles.length}, minmax(120px, 1fr))` }}
                    >
                      <div className="px-3 py-2 text-[11px] font-semibold text-slate-700">Rota</div>
                      <div className="px-3 py-2 text-[11px] font-semibold text-slate-700">Proteger</div>
                      {roles.map((r) => (
                        <div key={r.role_id} className="px-3 py-2 text-[11px] font-semibold text-slate-700">
                          {r.roles?.name}
                        </div>
                      ))}
                    </div>

                    <div className="divide-y divide-slate-200 bg-white">
                      {rows.map((route) => {
                        const isProtected = protectedRoutes.has(route.key);

                        return (
                          <div
                            key={route.key}
                            className={cn(
                              "grid items-stretch",
                              isProtected ? "bg-white" : "bg-slate-50/30"
                            )}
                            style={{ gridTemplateColumns: `340px 120px repeat(${roles.length}, minmax(120px, 1fr))` }}
                          >
                            <div className="px-3 py-2">
                              <div className="text-xs font-semibold text-slate-900">{route.name}</div>
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                <span className="font-medium text-slate-700">{route.key}</span>
                                {route.path_pattern ? <span className="text-slate-400"> • {route.path_pattern}</span> : null}
                              </div>
                            </div>

                            <div className="flex items-center justify-center px-3 py-2">
                              <Switch
                                checked={isProtected}
                                onCheckedChange={(v) => setRouteProtected(route.key, v)}
                                aria-label={`Proteger ${route.key}`}
                              />
                            </div>

                            {roles.map((r) => {
                              const val = permsByKey.get(`${r.role_id}:${route.key}`);
                              const allowed = isProtected ? Boolean(val) : true;

                              return (
                                <div key={r.role_id} className="flex items-center justify-center px-3 py-2">
                                  <label className={cn("flex items-center gap-2 text-[11px]", !isProtected && "opacity-50")}
                                  >
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-slate-300"
                                      checked={allowed}
                                      disabled={!isProtected}
                                      onChange={(e) => setAllowed(route.key, r.role_id, e.target.checked)}
                                    />
                                    <span className={cn(allowed ? "text-emerald-700" : "text-rose-700")}>
                                      {allowed ? "liberado" : "bloqueado"}
                                    </span>
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(rolesQ.isError || routesQ.isError || permsQ.isError) && (
        <div className="rounded-[22px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          Erro ao carregar dados de permissões. Verifique RLS/tenant.
        </div>
      )}
    </div>
  );
}