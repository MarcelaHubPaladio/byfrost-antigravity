import { useState, useMemo } from "react";
import { 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Building2, Plus, CornerDownRight } from "lucide-react";
import { SuperTask } from "@/hooks/useSuperTasks";
import { EntityTaskGroup } from "./EntityTaskGroup";
import { TaskItem } from "./TaskItem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSuperTasks } from "@/hooks/useSuperTasks";

type TenantInfo = {
  id: string;
  name: string;
  slug: string;
};

interface TenantTaskGroupProps {
  tenant: TenantInfo;
  allTasks: SuperTask[];
  activeTab: "active" | "completed";
}

export function TenantTaskGroup({ tenant, allTasks, activeTab }: TenantTaskGroupProps) {
  const { upsertTask } = useSuperTasks();
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const tenantTasks = useMemo(() => 
    allTasks.filter(t => t.tenant_id === tenant.id && (!activeTab || (activeTab === "active" ? !t.is_completed : t.is_completed))),
    [allTasks, tenant.id, activeTab]
  );

  const mainTasks = tenantTasks.filter(t => !t.entity_id);
  const entityIds = Array.from(new Set(tenantTasks.filter(t => t.entity_id).map(t => t.entity_id!)));

  const handleAddTask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newTaskTitle.trim()) return;

    await upsertTask.mutateAsync({
      tenant_id: tenant.id,
      title: newTaskTitle.trim(),
      is_completed: false,
      order_index: mainTasks.length
    });
    setNewTaskTitle("");
  };

  if (activeTab === "completed" && tenantTasks.length === 0) return null;

  return (
    <AccordionItem 
        value={tenant.id} 
        className="border-none rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden dark:bg-slate-900 dark:ring-slate-800"
    >
      <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-slate-50 transition dark:hover:bg-slate-800/50">
        <div className="flex items-center gap-3 text-left">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-slate-100">{tenant.name}</div>
            <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{tenant.slug}</div>
          </div>
          {tenantTasks.length > 0 && (
            <Badge variant="secondary" className="ml-2 rounded-full h-5 text-[10px] px-1.5 min-w-[20px] justify-center">
              {tenantTasks.length}
            </Badge>
          )}
        </div>
      </AccordionTrigger>
      
      <AccordionContent className="px-6 pb-6 pt-2 space-y-4">
        {/* Main Tenant Tasks */}
        <div className="space-y-1">
          {mainTasks.map(task => (
            <TaskItem key={task.id} task={task} />
          ))}
          
          {/* Quick Add Task */}
          <form onSubmit={handleAddTask} className="flex items-center gap-2 mt-2 group px-2 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
            <Plus className="h-4 w-4 text-slate-400 group-hover:text-indigo-500" />
            <input 
              placeholder="Adicionar uma tarefa para este tenant..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-slate-600 placeholder:text-slate-400"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
            />
          </form>
        </div>

        {/* Entity Groups */}
        {entityIds.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            {entityIds.map(entityId => (
              <EntityTaskGroup 
                key={entityId} 
                tenantId={tenant.id} 
                entityId={entityId} 
                tasks={tenantTasks.filter(t => t.entity_id === entityId)} 
              />
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
