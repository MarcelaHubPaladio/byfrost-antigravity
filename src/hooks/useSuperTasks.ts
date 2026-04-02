import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type SuperTask = {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  order_index: number;
  created_at: string;
  created_by: string | null;
  assigned_to: string | null;
  users_profile?: { display_name: string | null; email: string | null } | null;
  subtasks?: SuperTask[];
};

export function useSuperTasks(tenantId?: string | null) {
  const qc = useQueryClient();

  const listTasks = useQuery({
    queryKey: ["super_tasks", tenantId],
    queryFn: async () => {
      let query = supabase
        .from("super_tasks")
        .select("*, users_profile!fk_super_tasks_assigned_user(display_name, email)")
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });

      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Build hierarchy
      const tasks = (data as SuperTask[]) || [];
      const parentTasks = tasks.filter((t) => !t.parent_id);
      const subtasks = tasks.filter((t) => t.parent_id);

      return parentTasks.map((p) => ({
        ...p,
        subtasks: subtasks
          .filter((s) => s.parent_id === p.id)
          .sort((a, b) => a.order_index - b.order_index),
      }));
    },
  });

  const listUsers = useQuery({
    queryKey: ["tenant_users", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id, display_name, email")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null);

      if (error) throw error;
      return data;
    },
  });

  const upsertTask = useMutation({
    mutationFn: async (task: Partial<SuperTask>) => {
      const { data, error } = await supabase
        .from("super_tasks")
        .upsert({
          ...task,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super_tasks"] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("super_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super_tasks"] });
    },
  });

  const toggleTask = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { data, error } = await supabase
        .from("super_tasks")
        .update({
          is_completed,
          completed_at: is_completed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super_tasks"] });
    },
  });

  return {
    listTasks,
    listUsers,
    upsertTask,
    deleteTask,
    toggleTask,
  };
}
