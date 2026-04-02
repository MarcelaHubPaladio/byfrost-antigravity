import { useState, useMemo } from "react";
import { useTenant } from "@/providers/TenantProvider";
import { useSuperTasks } from "@/hooks/useSuperTasks";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Accordion, 
} from "@/components/ui/accordion";
import { Search, ClipboardList, X, Users as UsersIcon, Building2 } from "lucide-react";
import { UserTaskGroup } from "./UserTaskGroup";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSession } from "@/providers/SessionProvider";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

interface SuperTasksPanelProps {
  onClose?: () => void;
}

export function SuperTasksPanel({ onClose }: SuperTasksPanelProps) {
  const { user } = useSession();
  const { tenants, activeTenantId, activeTenant, isSuperAdmin, setActiveTenantId } = useTenant();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(activeTenantId);
  const { listTasks, listUsers } = useSuperTasks(selectedTenantId);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");

  const tasks = listTasks.data ?? [];
  const tenantUsers = listUsers.data ?? [];

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

  const isModuleEnabled = activeTenant?.modules_json?.tasks_enabled === true;
  const canSeeContent = isModuleEnabled;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-950">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
            <ClipboardList className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {isSuperAdmin ? "Tarefas Master" : "Tarefas"}
          </h2>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {!canSeeContent ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 rounded-full bg-slate-100 p-4 dark:bg-slate-900">
                <ClipboardList className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">Módulo Desativado</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Este módulo não está ativo para o seu tenant. Entre em contato com um administrador para habilitar.
            </p>
        </div>
      ) : (
        <>
            {/* SuperAdmin Tenant Selection */}
            {isSuperAdmin && tenants.length > 1 && (
                <div className="px-4 pt-3">
                    <div className="flex items-center gap-2 mb-1">
                        <Building2 className="h-3 w-3 text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tenant Ativo</span>
                    </div>
                    <Select 
                        value={selectedTenantId || undefined} 
                        onValueChange={(val) => {
                            setSelectedTenantId(val);
                            setActiveTenantId(val);
                        }}
                    >
                        <SelectTrigger className="h-9 text-xs rounded-xl bg-slate-50/50 border-slate-200">
                            <SelectValue placeholder="Selecione um tenant" />
                        </SelectTrigger>
                        <SelectContent>
                            {tenants.map(t => (
                                <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {/* Tabs & Search */}
            <div className="space-y-3 p-4">
                <div className="flex items-center gap-1.5 p-1 bg-slate-100/50 dark:bg-slate-900/50 rounded-xl">
                <button 
                    className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition ${activeTab === 'active' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                    onClick={() => setActiveTab("active")}
                >
                    Pendentes ({totalActive})
                </button>
                <button 
                    className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition ${activeTab === 'completed' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                    onClick={() => setActiveTab("completed")}
                >
                    Concluídas ({totalCompleted})
                </button>
                </div>

                <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input 
                    placeholder="Buscar por usuário ou tarefa..." 
                    className="pl-9 h-9 text-xs rounded-xl bg-slate-50/50 border-slate-200"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                </div>
            </div>

            {/* Content Area */}
            <ScrollArea className="flex-1 px-4 pb-10">
                {listTasks.isLoading || listUsers.isLoading ? (
                <div className="py-10 text-center text-xs text-slate-500">
                    Carregando...
                </div>
                ) : usersWithTasks.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                    Nenhum resultado.
                </div>
                ) : (
                <Accordion type="multiple" defaultValue={[user?.id || ""]} className="space-y-3">
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
            </ScrollArea>
        </>
      )}
    </div>
  );
}
