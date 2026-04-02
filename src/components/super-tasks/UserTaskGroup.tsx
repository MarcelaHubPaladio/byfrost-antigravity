import { useState, useMemo } from "react";
import { 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { User2, Plus, Mail } from "lucide-react";
import { SuperTask } from "@/hooks/useSuperTasks";
import { EntityTaskGroup } from "./EntityTaskGroup";
import { TaskItem } from "./TaskItem";
import { useSuperTasks } from "@/hooks/useSuperTasks";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface UserTaskGroupProps {
  userId: string;
  userName: string;
  userEmail?: string | null;
  tasks: SuperTask[];
  activeTab: "active" | "completed";
  allUsers: any[];
  tenantId: string;
}

export function UserTaskGroup({ 
  userId, 
  userName, 
  userEmail, 
  tasks, 
  activeTab,
  tenantId
}: UserTaskGroupProps) {
  const { upsertTask } = useSuperTasks();
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const filteredTasks = useMemo(() => 
    tasks.filter(t => (!activeTab || (activeTab === "active" ? !t.is_completed : t.is_completed))),
    [tasks, activeTab]
  );

  const mainTasks = filteredTasks.filter(t => !t.entity_id);
  const entityIds = Array.from(new Set(filteredTasks.filter(t => t.entity_id).map(t => t.entity_id!)));

  const handleAddTask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newTaskTitle.trim()) return;

    await upsertTask.mutateAsync({
      tenant_id: tenantId,
      assigned_to: userId === "unassigned" ? null : userId,
      title: newTaskTitle.trim(),
      is_completed: false,
      order_index: tasks.length
    });
    setNewTaskTitle("");
  };

  if (activeTab === "completed" && filteredTasks.length === 0) return null;

  return (
    <AccordionItem 
        value={userId} 
        className="border-none rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden dark:bg-slate-900 dark:ring-slate-800"
    >
      <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-slate-50 transition dark:hover:bg-slate-800/50">
        <div className="flex items-center gap-3 text-left">
          <Avatar className="h-10 w-10 shrink-0 rounded-2xl">
            <AvatarFallback className="rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
              {userId === "unassigned" ? "?" : (userName?.slice(0, 1) ?? "U").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-bold text-slate-900 dark:text-slate-100 truncate">{userName}</div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
              {userEmail ? (
                <>
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{userEmail}</span>
                </>
              ) : (
                <span>Sem atribuição</span>
              )}
            </div>
          </div>
          {filteredTasks.length > 0 && (
            <Badge variant="secondary" className="ml-2 rounded-full h-5 text-[10px] px-1.5 min-w-[20px] justify-center">
              {filteredTasks.length}
            </Badge>
          )}
        </div>
      </AccordionTrigger>
      
      <AccordionContent className="px-6 pb-6 pt-2 space-y-4">
        {/* Main User Tasks */}
        <div className="space-y-1">
          {mainTasks.map(task => (
            <TaskItem key={task.id} task={task} />
          ))}
          
          {/* Quick Add Task */}
          <form onSubmit={handleAddTask} className="flex items-center gap-2 mt-2 group px-2 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
            <Plus className="h-4 w-4 text-slate-400 group-hover:text-indigo-500" />
            <input 
              placeholder={`Adicionar tarefa para ${userName}...`}
              className="flex-1 bg-transparent border-none outline-none text-sm text-slate-600 placeholder:text-slate-400"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
            />
          </form>
        </div>

        {/* Entity Groups if any */}
        {entityIds.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            {entityIds.map(entityId => (
              <EntityTaskGroup 
                key={entityId} 
                tenantId={tenantId} 
                entityId={entityId} 
                tasks={filteredTasks.filter(t => t.entity_id === entityId)} 
              />
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
