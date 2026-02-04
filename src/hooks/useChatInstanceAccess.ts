import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { samePhoneLoose } from "@/lib/phone";

type WaInstanceLite = {
  id: string;
  phone_number: string | null;
  assigned_user_id: string | null;
};

function getUserPhoneFromAuthUser(user: any): string | null {
  const md = user?.user_metadata ?? {};
  const candidates = [md.phone_e164, md.phone, md.whatsapp, md.whatsapp_phone, md.wa_phone, md.phoneNumber];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

export function useChatInstanceAccess() {
  const { activeTenantId, isSuperAdmin } = useTenant();
  const { user } = useSession();

  const userPhoneQ = useQuery({
    queryKey: ["chat_user_phone", activeTenantId, user?.id],
    enabled: Boolean(activeTenantId && user?.id && !isSuperAdmin),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("phone_e164")
        .eq("tenant_id", activeTenantId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.phone_e164 as string | null) ?? null;
    },
  });

  const userPhone = useMemo(() => {
    if (isSuperAdmin) return null;
    return userPhoneQ.data ?? getUserPhoneFromAuthUser(user) ?? null;
  }, [isSuperAdmin, userPhoneQ.data, user]);

  const instancesQ = useQuery({
    queryKey: ["chat_user_instances", activeTenantId, user?.id, userPhone],
    enabled: Boolean(activeTenantId && user?.id && !isSuperAdmin),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_instances")
        .select("id,phone_number,assigned_user_id")
        .eq("tenant_id", activeTenantId!)
        .eq("status", "active")
        .is("deleted_at", null)
        .limit(200);
      if (error) throw error;

      const rows = (data ?? []) as any as WaInstanceLite[];
      const matched = rows.filter((r) => {
        if (r.assigned_user_id && r.assigned_user_id === user!.id) return true;
        if (!userPhone) return false;
        return samePhoneLoose(r.phone_number, userPhone);
      });

      return matched;
    },
  });

  const instances = instancesQ.data ?? [];
  const instanceIds = useMemo(() => instances.map((i) => i.id), [instances]);

  const hasAccess = isSuperAdmin ? true : instanceIds.length > 0;
  const isLoading = isSuperAdmin ? false : userPhoneQ.isLoading || instancesQ.isLoading;

  return {
    userPhone,
    instances,
    instanceIds,
    hasAccess,
    isLoading,
    error: (userPhoneQ.error as any) ?? (instancesQ.error as any) ?? null,
  };
}
