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
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { Plus, Search, Filter } from "lucide-react";
import { TenantTaskGroup } from "@/components/super-tasks/TenantTaskGroup";
import { Badge } from "@/components/ui/badge";

export default function SuperTasks() {
  const { tenants, isSuperAdmin } = useTenant();
  const { listTasks } = useSuperTasks();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");

  const tasks = listTasks.data ?? [];

  // Filter tenants that have tasks or if searching
  const filteredTenants = useMemo(() => {
    if (!search && activeTab === "active") {
        // Return all tenants for navigation, but maybe only those with tasks?
        // Let's show all tenants that the super-admin can see.
        return tenants;
    }
    
    return tenants.filter(t => {
        const hasMatch = t.name.toLowerCase().includes(search.toLowerCase());
        const hasTasks = tasks.some(task => task.tenant_id === t.id);
        return hasMatch || hasTasks;
    });
  }, [tenants, search, tasks, activeTab]);

  const totalActive = tasks.filter(t => !t.is_completed).length;
  const totalCompleted = tasks.filter(t => t.is_completed).length;

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.super_tasks">
        <AppShell>
          <div className="mx-auto max-w-5xl space-y-6 pb-20">
            {/* Header section */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Tarefas Master
                  <Badge variant="secondary" className="rounded-full font-medium">
                    Checklist Global
                  </Badge>
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Gerencie pendências e checklists transversais entre tenants e entidades.
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

            {/* Filter bar */}
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Buscar por tenant, entidade ou tarefa..." 
                className="pl-10 h-11 rounded-2xl border-slate-200 bg-white/50 backdrop-blur-sm focus-visible:ring-indigo-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Main Content: Tenant Accordions */}
            <div className="space-y-4">
              {listTasks.isLoading ? (
                <div className="py-20 text-center text-slate-500">
                  <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
                  Carregando tarefas...
                </div>
              ) : filteredTenants.length === 0 ? (
                <div className="py-20 text-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                  <p className="text-slate-500">Nenhum tenant encontrado com esses critérios.</p>
                </div>
              ) : (
                <Accordion type="multiple" className="space-y-4">
                  {filteredTenants.map((tenant) => (
                    <TenantTaskGroup 
                        key={tenant.id} 
                        tenant={tenant} 
                        allTasks={tasks}
                        activeTab={activeTab}
                    />
                  ))}
                </Accordion>
              )}
            </div>
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}
