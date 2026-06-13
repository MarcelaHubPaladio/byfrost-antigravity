import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from "../lib/supabase";
import { useSession } from "./SessionProvider";

type TenantRole = string;

export type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  branding_json?: any;
  modules_json?: any;
  primary_color?: string;
  neon_primary?: string;
  logo_url?: string;
  role: TenantRole;
};

type TenantState = {
  tenants: TenantInfo[];
  activeTenantId: string | null;
  activeTenant: TenantInfo | null;
  loading: boolean;
  setActiveTenantId: (id: string) => Promise<void>;
  clearActiveTenant: () => Promise<void>;
  refresh: () => Promise<void>;
  isSuperAdmin: boolean;
};

const Ctx = createContext<TenantState | null>(null);
const LS_KEY = "byfrost.activeTenantId";

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [activeTenantId, setActiveTenantIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep this aligned with database RLS helpers
  const isSuperAdmin = Boolean(
    (user as any)?.app_metadata?.byfrost_super_admin || (user as any)?.app_metadata?.super_admin
  );

  // Load initial cached tenant
  useEffect(() => {
    AsyncStorage.getItem(LS_KEY).then(val => {
      if (val) setActiveTenantIdState(val);
    });
  }, []);

  const setActiveTenantId = async (id: string) => {
    await AsyncStorage.setItem(LS_KEY, id);
    setActiveTenantIdState(id);
  };

  const clearActiveTenant = async () => {
    await AsyncStorage.removeItem(LS_KEY);
    setActiveTenantIdState(null);
  };

  const refresh = React.useCallback(async () => {
    if (!user) {
      setTenants([]);
      setActiveTenantIdState(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      if (isSuperAdmin) {
        const { data, error } = await supabase
          .from("tenants")
          .select("id,name,slug,branding_json,modules_json")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(500);

        if (error) throw error;

        const mapped: TenantInfo[] = (data ?? []).map((t: any) => {
          const bj = t.branding_json ?? {};
          const logoObj = bj.logo;
          let publicLogoUrl = t.logo_url;
          if (logoObj?.bucket && logoObj?.path) {
            publicLogoUrl = supabase.storage.from(logoObj.bucket).getPublicUrl(logoObj.path).data.publicUrl;
          }
          return {
            ...t,
            branding_json: bj,
            modules_json: t.modules_json ?? {},
            primary_color: bj.palette?.primary?.hex || t.primary_color,
            neon_primary: bj.palette?.neonPrimary?.hex || bj.palette?.primary?.hex || "#A3FF47",
            logo_url: publicLogoUrl,
            role: "admin",
          };
        });

        setTenants(mapped);
        
        // Auto select if only 1 tenant
        if (mapped.length === 1) {
          await setActiveTenantId(mapped[0].id);
        } else if (mapped.length > 1) {
          if (activeTenantId && !mapped.some((t) => t.id === activeTenantId)) {
            await AsyncStorage.removeItem(LS_KEY);
            setActiveTenantIdState(null);
          }
        }
        return;
      }

      // Regular users: tenant list comes from users_profile
      const { data, error } = await supabase
        .from("users_profile")
        .select("tenant_id, role, tenants(id,name,slug,branding_json,modules_json)")
        .eq("user_id", user.id)
        .is("deleted_at", null);

      if (error) throw error;

      const mapped: TenantInfo[] = (data ?? [])
        .map((row: any) => {
          const t = row.tenants || {};
          const bj = t.branding_json ?? {};
          const logoObj = bj.logo;
          let publicLogoUrl = t.logo_url;
          if (logoObj?.bucket && logoObj?.path) {
            publicLogoUrl = supabase.storage.from(logoObj.bucket).getPublicUrl(logoObj.path).data.publicUrl;
          }
          return {
            id: t.id ?? row.tenant_id,
            name: t.name ?? "Tenant",
            slug: t.slug ?? "tenant",
            branding_json: bj,
            modules_json: t.modules_json ?? {},
            primary_color: bj.palette?.primary?.hex || t.primary_color,
            neon_primary: bj.palette?.neonPrimary?.hex || bj.palette?.primary?.hex || "#A3FF47",
            logo_url: publicLogoUrl,
            role: String(row.role ?? "vendor"),
          };
        })
        .filter((t: any) => Boolean(t.id));

      setTenants(mapped);

      if (mapped.length === 1) {
        await setActiveTenantId(mapped[0].id);
      } else if (mapped.length > 1) {
        if (activeTenantId && !mapped.some((t) => t.id === activeTenantId)) {
          await AsyncStorage.removeItem(LS_KEY);
          setActiveTenantIdState(null);
        }
      }
    } catch (e) {
      console.warn("[TenantProvider] Failed to load tenants", e);
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isSuperAdmin, activeTenantId]);

  useEffect(() => {
    refresh();
  }, [user?.id, isSuperAdmin]);

  const activeTenant = useMemo(
    () => tenants.find((t) => t.id === activeTenantId) ?? null,
    [tenants, activeTenantId]
  );

  const value = useMemo<TenantState>(
    () => ({
      tenants,
      activeTenantId,
      activeTenant,
      loading,
      setActiveTenantId,
      clearActiveTenant,
      refresh,
      isSuperAdmin,
    }),
    [tenants, activeTenantId, activeTenant, loading, isSuperAdmin, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenant() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTenant must be used within TenantProvider");
  return v;
}
