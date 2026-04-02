import { useState, useMemo } from "react";
import { useTenant } from "@/providers/TenantProvider";
import { useSuperTasks } from "@/hooks/useSuperTasks";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Accordion, 
} from "@/components/ui/accordion";
import { Search, ClipboardList, X } from "lucide-react";
import { TenantTaskGroup } from "./TenantTaskGroup";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SuperTasksPanelProps {
  onClose?: () => void;
}

export function SuperTasksPanel({ onClose }: SuperTasksPanelProps) {
  const { tenants } = useTenant();
  const { listTasks } = useSuperTasks();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");

  const tasks = listTasks.data ?? [];

  const filteredTenants = useMemo(() => {
    if (!search && activeTab === "active") return tenants;
    
    return tenants.filter(t => {
        const hasMatch = t.name.toLowerCase().includes(search.toLowerCase());
        const hasTasks = tasks.some(task => task.tenant_id === t.id);
        return hasMatch || hasTasks;
    });
  }, [tenants, search, tasks, activeTab]);

  const totalActive = tasks.filter(t => !t.is_completed).length;
  const totalCompleted = tasks.filter(t => t.is_completed).length;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-950">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
            <ClipboardList className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Tarefas Master
          </h2>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

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
            placeholder="Buscar..." 
            className="pl-9 h-9 text-xs rounded-xl bg-slate-50/50 border-slate-200"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Content Area */}
      <ScrollArea className="flex-1 px-4 pb-10">
        {listTasks.isLoading ? (
          <div className="py-10 text-center text-xs text-slate-500">
            Carregando...
          </div>
        ) : filteredTenants.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            Nenhum resultado.
          </div>
        ) : (
          <Accordion type="multiple" className="space-y-3">
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
      </ScrollArea>
    </div>
  );
}
