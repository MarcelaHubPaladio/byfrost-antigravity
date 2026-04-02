import { useState } from "react";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { LayoutGrid, Plus, ChevronRight } from "lucide-react";
import { SuperTask, useSuperTasks } from "@/hooks/useSuperTasks";
import { TaskItem } from "./TaskItem";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface EntityTaskGroupProps {
  tenantId: string;
  entityId: string;
  tasks: SuperTask[];
}

export function EntityTaskGroup({ tenantId, entityId, tasks }: EntityTaskGroupProps) {
  const { upsertTask } = useSuperTasks();
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const entityQ = useQuery({
    queryKey: ["entity", entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("display_name, entity_type")
        .eq("id", entityId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const entity = entityQ.data;

  const handleAddTask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newTaskTitle.trim()) return;

    await upsertTask.mutateAsync({
      tenant_id: tenantId,
      entity_id: entityId,
      title: newTaskTitle.trim(),
      is_completed: false,
      order_index: tasks.length
    });
    setNewTaskTitle("");
  };

  return (
    <div className="pl-4 border-l-2 border-indigo-100 dark:border-indigo-900 ml-5 space-y-2">
        <Accordion type="single" collapsible className="w-full">
            <AccordionItem value={entityId} className="border-none bg-slate-50/50 rounded-2xl dark:bg-slate-800/20">
                <AccordionTrigger className="px-4 py-2.5 hover:no-underline hover:bg-indigo-50/50 rounded-2xl transition-all dark:hover:bg-indigo-950/20 group">
                    <div className="flex items-center gap-2 text-left">
                        <LayoutGrid className="h-4 w-4 text-indigo-500" />
                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                            {entity?.display_name || "Carregando entidade..."}
                        </span>
                        {entity?.entity_type && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal uppercase opacity-60">
                                {entity.entity_type}
                            </Badge>
                        )}
                        <Badge variant="secondary" className="rounded-full h-5 text-[10px] px-1.5 min-w-[20px] justify-center ml-auto">
                            {tasks.length}
                        </Badge>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 pt-1 space-y-1">
                    {tasks.map(task => (
                        <TaskItem key={task.id} task={task} />
                    ))}
                    
                    {/* Quick Add Task for Entity */}
                    <form onSubmit={handleAddTask} className="flex items-center gap-2 mt-2 group px-2 py-1.5 rounded-xl hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors">
                        <Plus className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-500" />
                        <input 
                            placeholder="Nova tarefa para esta entidade..."
                            className="flex-1 bg-transparent border-none outline-none text-xs text-slate-600 placeholder:text-slate-400 dark:text-slate-400"
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                        />
                    </form>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    </div>
  );
}
