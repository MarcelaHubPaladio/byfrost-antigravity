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

export type UseChatInstanceAccessOptions = {
  /**
   * Quando definido, calcula instâncias como se estivéssemos "vendo como" esse usuário.
   * OBS: para usuários que não são o auth.uid(), normalmente você também deve passar asUserPhone.
   */
  asUserId?: string | null;
  /** Telefone do usuário selecionado (p/ match com wa_instances.phone_number). */
  asUserPhone?: string | null;
};

export function useChatInstanceAccess(opts?: UseChatInstanceAccessOptions) {
  const { activeTenantId, activeTenant, isSuperAdmin } = useTenant();
  const { user } = useSession();

  const effectiveUserId = opts?.asUserId ?? user?.id ?? null;
  const isImpersonatingOtherUser = Boolean(effectiveUserId && user?.id && effectiveUserId !== user.id);

  // Para o próprio usuário (não super-admin), tentamos buscar o telefone no users_profile.
  // Para "ver como" outro usuário, o chamador deve fornecer asUserPhone (via RPC),
  // porque users_profile tem RLS (self-only).
  const userPhoneQ = useQuery({
    queryKey: ["chat_user_phone", activeTenantId, user?.id],
    enabled: Boolean(activeTenantId && user?.id && !isSuperAdmin && !isImpersonatingOtherUser),
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

  const effectiveUserPhone = useMemo(() => {
    if (opts?.asUserPhone !== undefined) return opts.asUserPhone;
    if (isSuperAdmin) return null;
    return userPhoneQ.data ?? getUserPhoneFromAuthUser(user) ?? null;
  }, [opts?.asUserPhone, isSuperAdmin, userPhoneQ.data, user]);

  const instancesQ = useQuery({
    queryKey: ["chat_user_instances", activeTenantId, effectiveUserId, effectiveUserPhone, isSuperAdmin, activeTenant?.role],
    enabled: Boolean(activeTenantId && (isSuperAdmin || effectiveUserId)),
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
      const isTenantAdmin = activeTenant?.role === "admin";

      // Super-admin ou Tenant Admin: por padrão pode ver tudo; se escolheu um usuário para "ver como", filtra.
      if ((isSuperAdmin || isTenantAdmin) && !isImpersonatingOtherUser) {
        return rows;
      }

      if (isSuperAdmin || isTenantAdmin) {
        if (!effectiveUserId) return rows;
        return rows.filter((r) => {
          if (r.assigned_user_id && r.assigned_user_id === effectiveUserId) return true;
          if (!effectiveUserPhone) return false;
          return samePhoneLoose(r.phone_number, effectiveUserPhone);
        });
      }

      // Usuário normal (ou gestor "vendo como"): filtra pelas instâncias vinculadas.
      return rows.filter((r) => {
        if (r.assigned_user_id && effectiveUserId && r.assigned_user_id === effectiveUserId) return true;
        if (!effectiveUserPhone) return false;
        return samePhoneLoose(r.phone_number, effectiveUserPhone);
      });
    },
  });

  const instances = instancesQ.data ?? [];
  const instanceIds = useMemo(() => instances.map((i) => i.id), [instances]);

  const hasAccess = isSuperAdmin ? true : instanceIds.length > 0;
  const isLoading = (isSuperAdmin ? false : userPhoneQ.isLoading) || instancesQ.isLoading;

  return {
    userPhone: effectiveUserPhone,
    instances,
    instanceIds,
    hasAccess,
    isLoading,
    error: (userPhoneQ.error as any) ?? (instancesQ.error as any) ?? null,
  };
}