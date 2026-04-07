import { useState, useMemo, useCallback, useRef } from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Mail, Plus } from "lucide-react";
import { SuperTask } from "@/hooks/useSuperTasks";
import { EntityTaskGroup } from "./EntityTaskGroup";
import { TaskItem } from "./TaskItem";
import { useSuperTasks } from "@/hooks/useSuperTasks";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";

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
  tenantId,
}: UserTaskGroupProps) {
  const { upsertTask } = useSuperTasks();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const addTaskInputRef = useRef<HTMLTextAreaElement>(null);
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);

  const filteredTasks = useMemo(
    () =>
      tasks.filter((t) =>
        !activeTab
          ? true
          : activeTab === "active"
          ? !t.is_completed
          : t.is_completed
      ),
    [tasks, activeTab]
  );

  // Use local ordering when available, fall back to server order
  const mainTasks = useMemo(() => {
    const base = filteredTasks.filter((t) => !t.entity_id);
    if (!orderedIds) return base;
    const map = new Map(base.map((t) => [t.id, t]));
    return orderedIds.map((id) => map.get(id)).filter(Boolean) as SuperTask[];
  }, [filteredTasks, orderedIds]);

  const entityIds = Array.from(
    new Set(filteredTasks.filter((t) => t.entity_id).map((t) => t.entity_id!))
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldList = mainTasks;
      const oldIndex = oldList.findIndex((t) => t.id === active.id);
      const newIndex = oldList.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(oldList, oldIndex, newIndex);
      // Optimistic update
      setOrderedIds(reordered.map((t) => t.id));

      // Persist new order_index for each task
      await Promise.all(
        reordered.map((task, idx) =>
          upsertTask.mutateAsync({ id: task.id, order_index: idx })
        )
      );
    },
    [mainTasks, upsertTask]
  );

  const handleAddTask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newTaskTitle.trim()) return;
    await upsertTask.mutateAsync({
      tenant_id: tenantId,
      assigned_to: userId === "unassigned" ? null : userId,
      title: newTaskTitle.trim(),
      is_completed: false,
      order_index: tasks.length,
    });
    setNewTaskTitle("");
    if (addTaskInputRef.current) addTaskInputRef.current.style.height = "auto";
    setOrderedIds(null); // Reset local order so server order takes effect
  };

  if (activeTab === "completed" && filteredTasks.length === 0) return null;

  return (
    <AccordionItem
      value={userId}
      className="border-none rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden dark:bg-slate-900 dark:ring-slate-800"
    >
      <AccordionTrigger className="px-4 py-2.5 hover:no-underline hover:bg-slate-50 transition dark:hover:bg-slate-800/50">
        <div className="flex items-center gap-3 text-left">
          <Avatar className="h-10 w-10 shrink-0 rounded-2xl">
            <AvatarFallback className="rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
              {userId === "unassigned"
                ? "?"
                : (userName?.slice(0, 1) ?? "U").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
              {userName}
            </div>
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
            <Badge
              variant="secondary"
              className="ml-2 rounded-full h-5 text-[10px] px-1.5 min-w-[20px] justify-center"
            >
              {filteredTasks.length}
            </Badge>
          )}
        </div>
      </AccordionTrigger>

      <AccordionContent className="px-4 pb-3 pt-2 space-y-4">
        {/* Main tasks with drag-and-drop */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={mainTasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {mainTasks.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Quick Add Task */}
        <form
          onSubmit={handleAddTask}
          className="flex items-center gap-2 mt-2 group px-2 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
        >
          <Plus className="h-4 w-4 text-slate-400 group-hover:text-indigo-500 mt-0.5" />
          <textarea
            ref={addTaskInputRef}
            placeholder={`Adicionar tarefa para ${userName}...`}
            className="flex-1 bg-transparent border-none outline-none text-sm text-slate-600 placeholder:text-slate-400 resize-none py-0.5 block leading-relaxed"
            value={newTaskTitle}
            onChange={(e) => {
              setNewTaskTitle(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAddTask();
              }
            }}
            rows={1}
          />
        </form>

        {/* Entity Groups if any */}
        {entityIds.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            {entityIds.map((entityId) => (
              <EntityTaskGroup
                key={entityId}
                tenantId={tenantId}
                entityId={entityId}
                tasks={filteredTasks.filter((t) => t.entity_id === entityId)}
              />
            ))}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
