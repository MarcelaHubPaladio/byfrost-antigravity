import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSession } from "@/providers/SessionProvider";
import { useTenant } from "@/providers/TenantProvider";

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

type OrgNode = { user_id: string; parent_user_id: string | null };

/** Returns the set of all descendant user_ids (inclusive of root) */
function getVisibleUserIds(currentUserId: string, nodes: OrgNode[]): Set<string> {
  const childrenMap = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parent_user_id) {
      const cur = childrenMap.get(n.parent_user_id) ?? [];
      cur.push(n.user_id);
      childrenMap.set(n.parent_user_id, cur);
    }
  }

  const visible = new Set<string>([currentUserId]);
  const stack = [currentUserId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of childrenMap.get(cur) ?? []) {
      if (!visible.has(child)) {
        visible.add(child);
        stack.push(child);
      }
    }
  }
  return visible;
}

export function useSuperTasks(tenantId?: string | null) {
  const qc = useQueryClient();
  const { user } = useSession();
  const { activeTenant, isSuperAdmin } = useTenant();

  const isAdmin = isSuperAdmin || activeTenant?.role === "admin" || activeTenant?.role === "manager" || activeTenant?.role === "owner";

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

  // Fetch org nodes to calculate hierarchy visibility
  const orgNodesQ = useQuery({
    queryKey: ["org_nodes_for_tasks", tenantId],
    enabled: Boolean(tenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_nodes")
        .select("user_id, parent_user_id")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data ?? []) as OrgNode[];
    },
  });

  // Compute the set of user IDs the current user can see based on hierarchy
  const visibleUserIds = useMemo(() => {
    if (isAdmin) return null; // null = see everyone
    if (!user?.id || !orgNodesQ.data) return new Set<string>([user?.id ?? ""]);
    return getVisibleUserIds(user.id, orgNodesQ.data);
  }, [isAdmin, user?.id, orgNodesQ.data]);

  const listUsers = useQuery({
    queryKey: ["tenant_users", tenantId, isAdmin ? "admin" : Array.from(visibleUserIds ?? []).join(",")],
    enabled: Boolean(tenantId) && (isAdmin || orgNodesQ.isFetched),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id, display_name, email")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null);

      if (error) throw error;

      const allUsers = data ?? [];

      // Filter by hierarchy for non-admins
      if (visibleUserIds === null) return allUsers; // admin sees all
      return allUsers.filter((u) => visibleUserIds.has(u.user_id));
    },
  });

  const upsertTask = useMutation({
    mutationFn: async (task: Partial<SuperTask>) => {
      const payload = { ...task, updated_at: new Date().toISOString() };

      if (task.id) {
        // Existing task: only UPDATE the provided fields (no full row needed)
        const { id, ...fields } = payload;
        const { data, error } = await supabase
          .from("super_tasks")
          .update(fields)
          .eq("id", id!)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        // New task: INSERT via upsert (tenant_id and all required fields must be present)
        const { data, error } = await supabase
          .from("super_tasks")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
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
    isAdmin,
    visibleUserIds,
  };
}
