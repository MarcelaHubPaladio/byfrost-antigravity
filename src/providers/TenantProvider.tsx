import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/SessionProvider";

function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
  if (h.length !== 6) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

type TenantRole = string;

type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  branding_json?: any;
  modules_json?: any;
  role: TenantRole;
};

type MembershipHint =
  | { type: "none" }
  | { type: "soft_deleted" }
  | { type: "error"; message: string };

type TenantState = {
  tenants: TenantInfo[];
  activeTenantId: string | null;
  activeTenant: TenantInfo | null;
  loading: boolean;
  setActiveTenantId: (id: string) => void;
  refresh: () => Promise<void>;
  isSuperAdmin: boolean;
  membershipHint: MembershipHint;
};

const Ctx = createContext<TenantState | null>(null);

const LS_KEY = "byfrost.activeTenantId";

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: sessionLoading } = useSession();
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [activeTenantId, setActiveTenantIdState] = useState<string | null>(
    localStorage.getItem(LS_KEY)
  );
  const [loading, setLoading] = useState(true);
  const [membershipHint, setMembershipHint] = useState<MembershipHint>({ type: "none" });

  // Keep this aligned with database RLS helpers (public.is_super_admin()).
  const isSuperAdmin = Boolean(
    (user as any)?.app_metadata?.byfrost_super_admin || (user as any)?.app_metadata?.super_admin
  );

  const setActiveTenantId = (id: string) => {
    localStorage.setItem(LS_KEY, id);
    setActiveTenantIdState(id);
  };

  const refresh = React.useCallback(async () => {
    if (!user) {
      // Only clear tenant state if session loading has finished and there's genuinely no user
      if (!sessionLoading) {
        setTenants([]);
        setActiveTenantIdState(null);
        setMembershipHint({ type: "none" });
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setMembershipHint({ type: "none" });

    // Fail-safe: if refresh takes more than 10s, force loading(false)
    const timeout = setTimeout(() => {
      console.warn("[TenantProvider] Refresh timed out after 10s");
      setLoading(false);
    }, 10000);

    try {
      // Super-admin can see *all* tenants (via RLS bypass claim).
      if (isSuperAdmin) {
        const { data, error } = await supabase
          .from("tenants")
          .select("id,name,slug,branding_json,modules_json")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(500);

        if (error) {
          console.warn("[TenantProvider] Failed to load tenants (super-admin)", error);
          setTenants([]);
          setMembershipHint({ type: "error", message: error.message });
          return;
        }

        const mapped: TenantInfo[] = (data ?? []).map((t: any) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          branding_json: t.branding_json ?? {},
          modules_json: t.modules_json ?? {},
          role: "admin",
        }));

        setTenants(mapped);

        if (mapped.length === 1) {
          setActiveTenantId(mapped[0].id);
        } else if (mapped.length > 1) {
          const savedTenantId = localStorage.getItem(LS_KEY) || activeTenantId;
          if (savedTenantId) {
            if (mapped.some((t) => t.id === savedTenantId)) {
              if (activeTenantId !== savedTenantId) setActiveTenantIdState(savedTenantId);
            } else {
              localStorage.removeItem(LS_KEY);
              setActiveTenantIdState(null);
            }
          }
        }
        return;
      }

      // Regular users: tenant list comes from users_profile membership.
      const { data, error } = await supabase
        .from("users_profile")
        .select("tenant_id, role, tenants(id,name,slug,branding_json,modules_json)")
        .eq("user_id", user.id)
        .is("deleted_at", null);

      if (error) {
        console.warn("[TenantProvider] Failed to load tenants", error);
        setTenants([]);
        setMembershipHint({ type: "error", message: error.message });
        return;
      }

      const mapped: TenantInfo[] = (data ?? [])
        .map((row: any) => ({
          id: row.tenants?.id ?? row.tenant_id,
          name: row.tenants?.name ?? "Tenant",
          slug: row.tenants?.slug ?? "tenant",
          branding_json: row.tenants?.branding_json ?? {},
          modules_json: row.tenants?.modules_json ?? {},
          role: String(row.role ?? "vendor"),
        }))
        .filter((t: any) => Boolean(t.id));

      setTenants(mapped);

      if (mapped.length === 0) {
        // Distinguish "no membership" vs "membership exists but is soft-deleted".
        const { data: anyRows, error: anyErr } = await supabase
          .from("users_profile")
          .select("tenant_id, deleted_at")
          .eq("user_id", user.id)
          .limit(1);

        if (anyErr) {
          setMembershipHint({ type: "error", message: anyErr.message });
        } else {
          const hasAny = (anyRows ?? []).length > 0;
          const softDeleted = Boolean((anyRows ?? [])[0]?.deleted_at);
          setMembershipHint(hasAny && softDeleted ? { type: "soft_deleted" } : { type: "none" });
        }
      }

      if (mapped.length === 1) {
        setActiveTenantId(mapped[0].id);
      } else if (mapped.length > 1) {
        const savedTenantId = localStorage.getItem(LS_KEY) || activeTenantId;
        if (savedTenantId) {
          if (mapped.some((t) => t.id === savedTenantId)) {
            if (activeTenantId !== savedTenantId) setActiveTenantIdState(savedTenantId);
          } else {
            localStorage.removeItem(LS_KEY);
            setActiveTenantIdState(null);
          }
        }
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [user?.id, isSuperAdmin, activeTenantId]);

  useEffect(() => {
    // Only refresh if session has finished loading
    if (!sessionLoading) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isSuperAdmin, sessionLoading]);

  const activeTenant = useMemo(
    () => tenants.find((t) => t.id === activeTenantId) ?? null,
    [tenants, activeTenantId]
  );

  const palettePrimaryHex = activeTenant?.branding_json?.palette_primary;
  
  useEffect(() => {
    let accent = { h: 252, s: 86, l: 62 };
    
    if (palettePrimaryHex) {
      const rgb = hexToRgb(palettePrimaryHex);
      if (rgb) accent = rgbToHsl(rgb.r, rgb.g, rgb.b);
    }
    
    document.documentElement.style.setProperty("--tenant-accent", `${accent.h} ${accent.s}% ${accent.l}%`);
  }, [palettePrimaryHex]);

  const value = useMemo<TenantState>(
    () => ({
      tenants,
      activeTenantId,
      activeTenant,
      loading: loading || sessionLoading,
      setActiveTenantId,
      refresh,
      isSuperAdmin,
      membershipHint,
    }),
    [tenants, activeTenantId, activeTenant, loading, isSuperAdmin, membershipHint, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenant() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTenant must be used within TenantProvider");
  return v;
}