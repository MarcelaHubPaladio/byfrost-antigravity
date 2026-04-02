import { useState, useRef, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { SuperTask, useSuperTasks } from "@/hooks/useSuperTasks";
import { Trash2, Plus, ChevronDown, CornerDownRight, Calendar as CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TaskItemProps {
  task: SuperTask;
  isSubtask?: boolean;
}

export function TaskItem({ task, isSubtask = false }: TaskItemProps) {
  const { toggleTask, deleteTask, upsertTask } = useSuperTasks();
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleToggle = () => {
    toggleTask.mutate({ id: task.id, is_completed: !task.is_completed });
  };

  const handleDelete = () => {
    if (confirm("Tem certeza que deseja excluir esta tarefa?")) {
      deleteTask.mutate(task.id);
    }
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;

    await upsertTask.mutateAsync({
      tenant_id: task.tenant_id,
      entity_id: task.entity_id,
      parent_id: task.id,
      title: newSubtaskTitle.trim(),
      is_completed: false,
      assigned_to: task.assigned_to, // Inherit assignee
      order_index: (task.subtasks?.length || 0)
    });
    setNewSubtaskTitle("");
    setShowSubtasks(true);
  };

  const handleUpdateTitle = async () => {
    if (editTitle.trim() === task.title || !editTitle.trim()) {
        setIsEditing(false);
        return;
    }
    await upsertTask.mutateAsync({ id: task.id, title: editTitle.trim() });
    setIsEditing(false);
  };

  const handleDueDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    await upsertTask.mutateAsync({ 
        id: task.id, 
        due_date: val ? new Date(val).toISOString() : null 
    });
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
        inputRef.current.focus();
    }
  }, [isEditing]);

  const hasDeadline = !!task.due_date;
  const deadlineDate = hasDeadline ? new Date(task.due_date!) : null;
  const isOverdue = deadlineDate && isPast(deadlineDate) && !isToday(deadlineDate) && !task.is_completed;
  const isDeadlineToday = deadlineDate && isToday(deadlineDate) && !task.is_completed;

  return (
    <div className="space-y-1">
      <div className={cn(
        "group flex items-center gap-3 px-3 py-2 rounded-xl transition-all",
        "hover:bg-slate-100/80 dark:hover:bg-slate-800/60",
        task.is_completed && "opacity-60"
      )}>
        <Checkbox 
          checked={task.is_completed} 
          onCheckedChange={handleToggle}
          className="h-5 w-5 rounded-full border-slate-300 data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
        />
        
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input 
              ref={inputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleUpdateTitle}
              onKeyDown={(e) => e.key === "Enter" && handleUpdateTitle()}
              className="w-full bg-transparent border-none outline-none text-sm font-medium text-slate-800 dark:text-slate-100"
            />
          ) : (
            <div className="space-y-0.5">
                <div 
                    onClick={() => setIsEditing(true)}
                    className={cn(
                        "text-sm font-medium text-slate-800 dark:text-slate-100 cursor-text truncate",
                        task.is_completed && "line-through decoration-slate-400"
                    )}
                >
                    {task.title}
                </div>
                
                {hasDeadline && (
                    <div className={cn(
                        "flex items-center gap-1 text-[10px] font-bold",
                        isOverdue ? "text-rose-500" : isDeadlineToday ? "text-amber-600" : "text-slate-500"
                    )}>
                        <Clock className="h-3 w-3" />
                        <span>
                            {format(deadlineDate!, "dd 'de' MMM", { locale: ptBR })}
                            {isOverdue && " (Atrasado)"}
                            {isDeadlineToday && " (Hoje)"}
                        </span>
                    </div>
                )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Due Date Trigger */}
          <div className="relative">
            <input 
                type="date" 
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
                onChange={handleDueDateChange}
                value={task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd") : ""}
            />
            <Button 
                variant="ghost" 
                size="icon" 
                className={cn(
                    "h-7 w-7 rounded-lg hover:bg-white shadow-sm",
                    hasDeadline && "text-indigo-600 bg-indigo-50/50"
                )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
            </Button>
          </div>

          {!isSubtask && (
            <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 rounded-lg hover:bg-white hover:text-indigo-600 shadow-sm"
                onClick={() => setShowSubtasks(!showSubtasks)}
                title="Subtarefas"
            >
              {showSubtasks ? <ChevronDown className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </Button>
          )}
          <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 rounded-lg hover:bg-rose-50 hover:text-rose-600"
              onClick={handleDelete}
              title="Excluir"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Subtasks Section */}
      {showSubtasks && !isSubtask && (
        <div className="pl-8 space-y-1">
          {task.subtasks?.map(sub => (
            <TaskItem key={sub.id} task={sub} isSubtask />
          ))}
          
          <form onSubmit={handleAddSubtask} className="flex items-center gap-2 group px-2 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
            <CornerDownRight className="h-3.5 w-3.5 text-slate-400" />
            <Plus className="h-3.5 w-3.5 text-slate-300 group-hover:text-indigo-400" />
            <input 
              placeholder="Adicionar subtarefa..."
              className="flex-1 bg-transparent border-none outline-none text-xs text-slate-500 placeholder:text-slate-400"
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
            />
          </form>
        </div>
      )}
    </div>
  );
}
