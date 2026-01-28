import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/SessionProvider";

type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  branding_json?: any;
  role: "admin" | "supervisor" | "manager";
};

type TenantState = {
  tenants: TenantInfo[];
  activeTenantId: string | null;
  activeTenant: TenantInfo | null;
  loading: boolean;
  setActiveTenantId: (id: string) => void;
  refresh: () => Promise<void>;
  isSuperAdmin: boolean;
};

const Ctx = createContext<TenantState | null>(null);

const LS_KEY = "byfrost.activeTenantId";

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [activeTenantId, setActiveTenantIdState] = useState<string | null>(
    localStorage.getItem(LS_KEY)
  );
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = Boolean((user as any)?.app_metadata?.byfrost_super_admin);

  const setActiveTenantId = (id: string) => {
    localStorage.setItem(LS_KEY, id);
    setActiveTenantIdState(id);
  };

  const refresh = async () => {
    if (!user) {
      setTenants([]);
      setActiveTenantIdState(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Super-admin can see *all* tenants (via RLS bypass claim).
    if (isSuperAdmin) {
      const { data, error } = await supabase
        .from("tenants")
        .select("id,name,slug,branding_json")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        console.warn("Failed to load tenants (super-admin)", error);
        setTenants([]);
        setLoading(false);
        return;
      }

      const mapped: TenantInfo[] = (data ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        branding_json: t.branding_json ?? {},
        role: "admin",
      }));

      setTenants(mapped);

      if (mapped.length === 1) {
        setActiveTenantId(mapped[0].id);
      } else if (mapped.length > 1) {
        if (activeTenantId && !mapped.some((t) => t.id === activeTenantId)) {
          localStorage.removeItem(LS_KEY);
          setActiveTenantIdState(null);
        }
      }

      setLoading(false);
      return;
    }

    // Regular users: tenant list comes from users_profile membership.
    const { data, error } = await supabase
      .from("users_profile")
      .select("tenant_id, role, tenants(id,name,slug,branding_json)")
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (error) {
      console.warn("Failed to load tenants", error);
      setTenants([]);
      setLoading(false);
      return;
    }

    const mapped: TenantInfo[] = (data ?? [])
      .map((row: any) => ({
        id: row.tenants?.id ?? row.tenant_id,
        name: row.tenants?.name ?? "Tenant",
        slug: row.tenants?.slug ?? "tenant",
        branding_json: row.tenants?.branding_json ?? {},
        role: row.role,
      }))
      .filter((t: any) => Boolean(t.id));

    setTenants(mapped);

    if (mapped.length === 1) {
      setActiveTenantId(mapped[0].id);
    } else if (mapped.length > 1) {
      // If stored tenant is no longer accessible, clear it.
      if (activeTenantId && !mapped.some((t) => t.id === activeTenantId)) {
        localStorage.removeItem(LS_KEY);
        setActiveTenantIdState(null);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isSuperAdmin]);

  const activeTenant = useMemo(
    () => tenants.find((t) => t.id === activeTenantId) ?? null,
    [tenants, activeTenantId]
  );

  const value = useMemo<TenantState>(
    () => ({ tenants, activeTenantId, activeTenant, loading, setActiveTenantId, refresh, isSuperAdmin }),
    [tenants, activeTenantId, activeTenant, loading, isSuperAdmin]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenant() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTenant must be used within TenantProvider");
  return v;
}