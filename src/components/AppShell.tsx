import { PropsWithChildren, useEffect, useMemo } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import {
  LayoutGrid,
  FlaskConical,
  Settings,
  LogOut,
  Search,
  ShieldCheck,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";

function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return { r, g, b };
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function tintBgFromHsl(h: number, s: number) {
  // Keep background very light but aligned to tenant primary hue.
  const sat = Math.min(35, Math.max(10, Math.round(s * 0.35)));
  return { h, s: sat, l: 97 };
}

function NavIcon({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: any;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "group flex h-11 w-11 items-center justify-center rounded-2xl border transition",
          isActive
            ? "border-[hsl(var(--byfrost-accent)/0.35)] bg-[hsl(var(--byfrost-accent)/0.10)] text-[hsl(var(--byfrost-accent))]"
            : "border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-white"
        )
      }
      title={label}
    >
      <Icon className="h-5 w-5" />
    </NavLink>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const nav = useNavigate();
  const { activeTenant, isSuperAdmin } = useTenant();
  const { user } = useSession();

  const palettePrimaryHex =
    (activeTenant?.branding_json?.palette?.primary?.hex as string | undefined) ?? null;

  const logoUrl = useMemo(() => {
    const logo = activeTenant?.branding_json?.logo;
    if (!logo?.bucket || !logo?.path) return null;
    try {
      return supabase.storage.from(logo.bucket).getPublicUrl(logo.path).data.publicUrl;
    } catch {
      return null;
    }
  }, [activeTenant?.branding_json?.logo]);

  useEffect(() => {
    const root = document.documentElement;

    // Default
    let accent = { h: 252, s: 86, l: 62 };
    let bg = { h: 220, s: 45, l: 97 };

    if (palettePrimaryHex) {
      const rgb = hexToRgb(palettePrimaryHex);
      if (rgb) {
        accent = rgbToHsl(rgb.r, rgb.g, rgb.b);
        bg = tintBgFromHsl(accent.h, accent.s);
      }
    }

    root.style.setProperty("--byfrost-accent", `${accent.h} ${accent.s}% ${accent.l}%`);
    root.style.setProperty("--byfrost-bg", `${bg.h} ${bg.s}% ${bg.l}%`);
  }, [palettePrimaryHex, activeTenant?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    nav("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--byfrost-bg))]">
      <div className="mx-auto max-w-[1400px] px-3 py-3 md:px-5 md:py-5">
        <div className="grid gap-3 md:grid-cols-[84px_1fr] md:gap-5">
          {/* Sidebar */}
          <aside className="rounded-[28px] border border-slate-200 bg-white/65 p-3 shadow-sm backdrop-blur md:sticky md:top-5 md:h-[calc(100vh-40px)]">
            <div className="flex items-center justify-center">
              <Link
                to="/app"
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white shadow-sm"
                title="Byfrost.ia"
              >
                <ShieldCheck className="h-5 w-5" />
              </Link>
            </div>

            <div className="mt-4 flex flex-col items-center gap-2">
              <NavIcon to="/app" icon={LayoutGrid} label="Dashboard" />
              <NavIcon to="/app/simulator" icon={FlaskConical} label="Simulador" />
              {isSuperAdmin && <NavIcon to="/app/admin" icon={Crown} label="Admin" />}
              <NavIcon to="/app/settings" icon={Settings} label="Configurações" />
            </div>

            <div className="mt-4 border-t border-slate-200/70 pt-4">
              <button
                onClick={signOut}
                className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/70 text-slate-600 transition hover:border-slate-300 hover:bg-white"
                title="Sair"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </aside>

          {/* Main */}
          <div className="min-w-0">
            {/* Top bar */}
            <div className="rounded-[28px] border border-slate-200 bg-white/65 px-4 py-3 shadow-sm backdrop-blur">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 truncate">
                    {logoUrl && (
                      <img
                        src={logoUrl}
                        alt="Logo do tenant"
                        className="h-7 w-7 rounded-xl bg-white p-1 shadow-sm border border-slate-200"
                      />
                    )}
                    <span className="truncate">{activeTenant?.name ?? "Byfrost.ia"}</span>
                    {isSuperAdmin && (
                      <span className="ml-1 rounded-full bg-[hsl(var(--byfrost-accent)/0.10)] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--byfrost-accent))]">
                        super-admin
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    Guardião do Negócio • Proativo (somente sugere/alerta) • Governança ativa
                    {user?.email ? ` • ${user.email}` : ""}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-full md:w-[340px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      placeholder="Buscar casos, vendedores, CPF…"
                      className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-9 text-sm text-slate-700 shadow-sm outline-none ring-0 placeholder:text-slate-400 focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                    />
                  </div>

                  <Link
                    to="/tenants"
                    className="hidden rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-white md:inline-flex"
                    title="Trocar tenant"
                  >
                    Trocar
                  </Link>
                </div>
              </div>
            </div>

            <div className="mt-3 md:mt-5">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}