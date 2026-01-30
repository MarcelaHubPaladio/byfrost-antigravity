import { PropsWithChildren, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { LayoutGrid, FlaskConical, Settings, Search, Crown, ArrowLeftRight, LogOut, User2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

function NavTile({
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
          "group flex w-full flex-col items-center gap-1 rounded-2xl border px-2 py-2 text-center transition",
          isActive
            ? "border-[hsl(var(--byfrost-accent)/0.35)] bg-[hsl(var(--byfrost-accent)/0.10)] text-[hsl(var(--byfrost-accent))]"
            : "border-slate-200 bg-white/70 text-slate-700 hover:border-slate-300 hover:bg-white"
        )
      }
      title={label}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[11px] font-semibold tracking-tight leading-none">{label}</span>
    </NavLink>
  );
}

function getUserDisplayName(user: any) {
  const md = user?.user_metadata ?? {};
  const full = (md.full_name as string | undefined) ?? null;
  const first = (md.first_name as string | undefined) ?? null;
  const last = (md.last_name as string | undefined) ?? null;
  const composed = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (composed) return composed;
  const email = (user?.email as string | undefined) ?? "";
  return email ? email.split("@")[0] : "Usuário";
}

export function AppShell({ children }: PropsWithChildren) {
  const nav = useNavigate();
  const { activeTenant, isSuperAdmin } = useTenant();
  const { user } = useSession();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

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

  const userName = getUserDisplayName(user);
  const userEmail = user?.email ?? "";
  const avatarUrl = (user?.user_metadata as any)?.avatar_url ?? null;

  return (
    <div className="min-h-screen bg-[hsl(var(--byfrost-bg))]">
      {/* Super-admin: floating tenant switch (top-right) */}
      {isSuperAdmin && (
        <Link
          to="/tenants"
          className={cn(
            "fixed right-3 top-3 z-50 inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold text-white shadow-md",
            "bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
          )}
          title="Trocar tenant"
        >
          <ArrowLeftRight className="h-4 w-4" />
          <span>Trocar tenant</span>
        </Link>
      )}

      <div className="w-full px-3 py-3 md:px-5 md:py-5">
        <div className="grid gap-3 md:grid-cols-[96px_1fr] md:gap-5">
          {/* Sidebar */}
          <aside className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/65 shadow-sm backdrop-blur md:sticky md:top-5 md:h-[calc(100vh-40px)]">
            {/* Top brand block */}
            <div className="bg-[hsl(var(--byfrost-accent))] px-2 pb-2 pt-1.5">
              <Link
                to="/app"
                className="mx-auto flex w-fit flex-col items-center"
                title={activeTenant?.name ?? "Byfrost"}
              >
                <div className="flex h-[74px] w-[74px] items-center justify-center overflow-hidden rounded-[22px] bg-white p-1.5 shadow-sm ring-1 ring-white/40">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo do tenant"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-[18px] bg-[hsl(var(--byfrost-accent))] text-2xl font-semibold text-white">
                      {(activeTenant?.name?.slice(0, 1) ?? "B").toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="mt-2 max-w-[84px] truncate text-center text-[11px] font-semibold tracking-tight text-white/95">
                  {activeTenant?.name ?? "Byfrost"}
                </div>
              </Link>
            </div>

            <div className="p-3">
              <div className="grid gap-2">
                <NavTile to="/app" icon={LayoutGrid} label="Dashboard" />
                <NavTile to="/app/simulator" icon={FlaskConical} label="Simulador" />
                {isSuperAdmin && <NavTile to="/app/admin" icon={Crown} label="Admin" />}
                <NavTile to="/app/settings" icon={Settings} label="Config" />
              </div>
            </div>
          </aside>

          {/* Main */}
          <div className="min-w-0">
            {/* Content header (user dropdown) */}
            <div className="rounded-[28px] border border-[hsl(var(--byfrost-accent)/0.35)] bg-white/65 px-4 py-3 shadow-sm backdrop-blur">
              <div className="flex items-center justify-end">
                <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/75 px-2.5 py-2 text-left shadow-sm transition hover:bg-white"
                      onMouseEnter={() => setUserMenuOpen(true)}
                      onMouseLeave={() => setUserMenuOpen(false)}
                      title={userEmail}
                    >
                      <Avatar className="h-8 w-8 rounded-2xl">
                        <AvatarImage src={avatarUrl ?? undefined} alt={userName} />
                        <AvatarFallback className="rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                          {(userName?.slice(0, 1) ?? "U").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="hidden sm:block">
                        <div className="max-w-[180px] truncate text-xs font-semibold text-slate-900">
                          {userName}
                        </div>
                        <div className="max-w-[180px] truncate text-[11px] text-slate-500">{activeTenant?.slug}</div>
                      </div>
                      <User2 className="hidden h-4 w-4 text-slate-400 sm:block" />
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    align="end"
                    className="w-64 rounded-2xl border-slate-200 bg-white p-2"
                    onMouseEnter={() => setUserMenuOpen(true)}
                    onMouseLeave={() => setUserMenuOpen(false)}
                  >
                    <DropdownMenuLabel className="px-2 py-2">
                      <div className="text-xs font-semibold text-slate-900">{userName}</div>
                      <div className="mt-0.5 text-[11px] font-normal text-slate-600">{userEmail}</div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-slate-200" />
                    <DropdownMenuItem
                      className="cursor-pointer rounded-xl px-2 py-2 text-rose-700 focus:bg-rose-50 focus:text-rose-800"
                      onSelect={(e) => {
                        e.preventDefault();
                        setUserMenuOpen(false);
                        signOut();
                      }}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="mt-3 md:mt-5">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}