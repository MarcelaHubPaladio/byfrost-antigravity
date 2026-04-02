import { useState, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { useSuperTasks } from "@/hooks/useSuperTasks";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Accordion, 
} from "@/components/ui/accordion";
import { Search, Building2 } from "lucide-react";
import { UserTaskGroup } from "@/components/super-tasks/UserTaskGroup";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/providers/SessionProvider";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

export default function SuperTasks() {
  const { user } = useSession();
  const { tenants, activeTenantId, activeTenant, isSuperAdmin, setActiveTenantId } = useTenant();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(activeTenantId);
  const { listTasks, listUsers } = useSuperTasks(selectedTenantId);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");

  const tasks = listTasks.data ?? [];
  const tenantUsers = listUsers.data ?? [];

  const isModuleEnabled = activeTenant?.modules_json?.tasks_enabled === true;
  const canSeeContent = isSuperAdmin || isModuleEnabled;

  // Combine users with a "Not Assigned" group
  const usersWithTasks = useMemo(() => {
    // Current user should be first
    const sortedUsers = [...tenantUsers].sort((a, b) => {
        if (a.user_id === user?.id) return -1;
        if (b.user_id === user?.id) return 1;
        return (a.display_name || "").localeCompare(b.display_name || "");
    });

    const groups = sortedUsers.map(u => ({
        id: u.user_id,
        name: u.display_name || u.email || "Usuário",
        email: u.email,
        tasks: tasks.filter(t => t.assigned_to === u.user_id)
    }));

    // Add "Unassigned" if there are any
    const unassignedTasks = tasks.filter(t => !t.assigned_to);
    if (unassignedTasks.length > 0) {
        groups.push({
            id: "unassigned",
            name: "Não Atribuídas",
            email: "Tarefas sem responsável",
            tasks: unassignedTasks
        });
    }

    return groups.filter(g => {
        if (!search) return true;
        const matchesName = g.name.toLowerCase().includes(search.toLowerCase());
        const hasMatchingTasks = g.tasks.some(t => t.title.toLowerCase().includes(search.toLowerCase()));
        return matchesName || hasMatchingTasks;
    });
  }, [tenantUsers, tasks, user?.id, search]);

  const totalActive = tasks.filter(t => !t.is_completed).length;
  const totalCompleted = tasks.filter(t => t.is_completed).length;

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.super_tasks">
        <AppShell>
          <div className="mx-auto max-w-5xl space-y-6 pb-20 px-4 pt-6">
            {/* Header section */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  {isSuperAdmin ? "Tarefas Master" : "Tarefas"}
                  <Badge variant="secondary" className="rounded-full font-medium">
                    Gestão por Tenant
                  </Badge>
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Gerencie pendências e checklists transversais entre usuários e entidades.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button 
                    variant={activeTab === "active" ? "default" : "outline"}
                    size="sm"
                    className="rounded-full"
                    onClick={() => setActiveTab("active")}
                >
                    Pendentes ({totalActive})
                </Button>
                <Button 
                    variant={activeTab === "completed" ? "default" : "outline"}
                    size="sm"
                    className="rounded-full"
                    onClick={() => setActiveTab("completed")}
                >
                    Concluídas ({totalCompleted})
                </Button>
              </div>
            </div>

            {!canSeeContent ? (
              <div className="py-20 text-center rounded-[32px] border-2 border-dashed border-slate-200 bg-white/50 backdrop-blur-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400 mb-4 dark:bg-slate-900">
                  <Building2 className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Módulo Desativado</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto px-6">
                  Este módulo não está ativo para o seu tenant. Se você for um administrador, pode habilitá-lo na aba de Módulos nas configurações do Admin.
                </p>
              </div>
            ) : (
              <>
                {/* SuperAdmin Tenant Selection */}
                {isSuperAdmin && tenants.length > 1 && (
                    <div className="bg-white/50 backdrop-blur-sm p-4 rounded-3xl border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
                        <div className="flex items-center gap-2 mb-2">
                            <Building2 className="h-4 w-4 text-indigo-500" />
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Tenant Ativo</span>
                        </div>
                        <Select 
                            value={selectedTenantId || undefined} 
                            onValueChange={(val) => {
                                setSelectedTenantId(val);
                                setActiveTenantId(val);
                            }}
                        >
                            <SelectTrigger className="h-11 rounded-2xl bg-white border-slate-200 shadow-sm transition-all focus-visible:ring-indigo-500">
                                <SelectValue placeholder="Selecione um tenant para gerenciar" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl shadow-xl border-slate-200">
                                {tenants.map(t => (
                                    <SelectItem key={t.id} value={t.id} className="text-sm py-2.5 rounded-xl">{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Filter bar */}
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="Buscar por usuário ou tarefa..." 
                    className="pl-10 h-11 rounded-2xl border-slate-200 bg-white/50 backdrop-blur-sm focus-visible:ring-indigo-500"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                {/* Main Content: User Accordions */}
                <div className="space-y-4">
                  {listTasks.isLoading || listUsers.isLoading ? (
                    <div className="py-20 text-center text-slate-500">
                      <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
                      Carregando informações...
                    </div>
                  ) : usersWithTasks.length === 0 ? (
                    <div className="py-20 text-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                      <p className="text-slate-500">Nenhum resultado encontrado.</p>
                    </div>
                  ) : (
                    <Accordion type="multiple" defaultValue={[user?.id || ""]} className="space-y-4">
                      {usersWithTasks.map((group) => (
                        <UserTaskGroup 
                            key={group.id} 
                            userId={group.id}
                            userName={group.name}
                            userEmail={group.email}
                            tasks={group.tasks}
                            activeTab={activeTab}
                            allUsers={tenantUsers}
                            tenantId={selectedTenantId!}
                        />
                      ))}
                    </Accordion>
                  )}
                </div>
              </>
            )}
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}
