import { useState, useRef, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { SuperTask, useSuperTasks } from "@/hooks/useSuperTasks";
import { Trash2, Plus, ChevronDown, CornerDownRight, Calendar as CalendarIcon, Clock, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { isPast, isToday, startOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { format } from "date-fns";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: isSubtask });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

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
      assigned_to: task.assigned_to,
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
    const val = e.target.value; // "yyyy-MM-ddTHH:mm" in local time
    if (!val) {
      await upsertTask.mutateAsync({ id: task.id, due_date: null });
      return;
    }
    // datetime-local gives local time — convert to UTC for storage
    const utcIso = new Date(val).toISOString();
    await upsertTask.mutateAsync({ id: task.id, due_date: utcIso });
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // Reset height to auto-resize
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [isEditing]);

  // Convert UTC stored value → local "yyyy-MM-ddTHH:mm" for the input
  const inputDatetimeValue = (() => {
    if (!task.due_date) return "";
    const d = new Date(task.due_date);
    const offsetMs = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
  })();

  // Parse deadline in UTC, compare with local day boundaries
  const deadlineDate = task.due_date ? new Date(task.due_date) : null;
  const todayStart = startOfDay(new Date());
  const isOverdue =
    deadlineDate && deadlineDate < new Date() && !task.is_completed;
  const isDeadlineToday =
    deadlineDate && isToday(deadlineDate) && !task.is_completed;

  // Label: show time only if it's not 12:00 UTC (i.e. user set a specific time)
  const deadlineLabel = deadlineDate
    ? (() => {
        const hasTime =
          deadlineDate.getUTCHours() !== 12 ||
          deadlineDate.getUTCMinutes() !== 0;
        return hasTime
          ? format(deadlineDate, "dd 'de' MMM 'às' HH:mm", { locale: ptBR })
          : format(deadlineDate, "dd 'de' MMM", { locale: ptBR });
      })()
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="space-y-1"
    >
      <div
        className={cn(
          "group flex items-center gap-2 px-2 py-2 rounded-xl transition-all",
          "hover:bg-slate-100/80 dark:hover:bg-slate-800/60",
          task.is_completed && "opacity-60",
          isOverdue && !task.is_completed && "bg-rose-50/60 dark:bg-rose-950/20 ring-1 ring-rose-200 dark:ring-rose-900/50"
        )}
      >
        {/* Drag handle – only for parent tasks */}
        {!isSubtask && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-slate-500"
            tabIndex={-1}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        <Checkbox
          checked={task.is_completed}
          onCheckedChange={handleToggle}
          className={cn(
            "h-5 w-5 rounded-full border-slate-300 data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500 flex-shrink-0",
            isOverdue && "border-rose-400"
          )}
        />

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <textarea
              ref={inputRef}
              value={editTitle}
              onChange={(e) => {
                setEditTitle(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onBlur={handleUpdateTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleUpdateTitle();
                }
              }}
              rows={1}
              className="w-full bg-transparent border-none outline-none text-sm font-medium text-slate-800 dark:text-slate-100 resize-none py-0 block leading-relaxed"
            />
          ) : (
            <div className="space-y-0.5">
              <div
                onClick={() => setIsEditing(true)}
                className={cn(
                  "text-sm font-medium cursor-text break-words whitespace-pre-wrap leading-relaxed",
                  task.is_completed
                    ? "line-through text-slate-400 decoration-slate-400"
                    : isOverdue
                    ? "text-rose-700 dark:text-rose-400"
                    : "text-slate-800 dark:text-slate-100"
                )}
              >
                {task.title}
              </div>

              {deadlineLabel && (
                <div
                  className={cn(
                    "flex items-center gap-1 text-[10px] font-bold",
                    isOverdue
                      ? "text-rose-500"
                      : isDeadlineToday
                      ? "text-amber-600"
                      : "text-slate-400"
                  )}
                >
                  <Clock className="h-3 w-3" />
                  <span>
                    {deadlineLabel}
                    {isOverdue && " · Atrasada"}
                    {isDeadlineToday && " · Hoje"}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {/* Due date – proper native input, visible and clickable */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 rounded-lg hover:bg-white shadow-sm",
                deadlineDate && !task.is_completed && "text-indigo-600 bg-indigo-50/50"
              )}
              onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
              type="button"
              title="Definir prazo"
            >
              <CalendarIcon className="h-3.5 w-3.5" />
            </Button>
            <input
              ref={dateInputRef}
              type="datetime-local"
              className="sr-only"
              value={inputDatetimeValue}
              onChange={handleDueDateChange}
            />
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

      {/* Subtasks */}
      {showSubtasks && !isSubtask && (
        <div className="pl-8 space-y-1">
          {task.subtasks?.map((sub) => (
            <TaskItem key={sub.id} task={sub} isSubtask />
          ))}
          <form
            onSubmit={handleAddSubtask}
            className="flex items-center gap-2 group px-2 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
          >
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
