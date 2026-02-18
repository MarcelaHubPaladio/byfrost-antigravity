import { PropsWithChildren, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { useChatInstanceAccess } from "@/hooks/useChatInstanceAccess";
import {
  LayoutGrid,
  FlaskConical,
  Settings,
  Crown,
  ArrowLeftRight,
  LogOut,
  User2,
  ShieldCheck,
  LayoutDashboard,
  MessagesSquare,
  Clock3,
  ClipboardCheck,
  Clapperboard,
  Lock,
  Menu,
  CalendarClock,
  Gauge,
  Wallet,
  AlertTriangle,
  ClipboardList,
  ChevronRight,
  ArrowDownUp,
  CalendarRange,
  KanbanSquare,
  Building2,
  Handshake,
  PackageCheck,
  FileSignature,
} from "lucide-react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { checkRouteAccess } from "@/lib/access";

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

function hslFromHexOrFallback(hex: string | null) {
  if (hex) {
    const rgb = hexToRgb(hex);
    if (rgb) return rgbToHsl(rgb.r, rgb.g, rgb.b);
  }
  return { h: 252, s: 86, l: 62 };
}

function setFaviconSvg(svg: string) {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/\"/g, "%22");
  const href = `data:image/svg+xml,${encoded}`;

  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = href;
}

function applyTenantFavicon(primaryHex: string | null) {
  const accent = hslFromHexOrFallback(primaryHex);
  const fill = `hsl(${accent.h} ${accent.s}% ${accent.l}%)`;

  // 64x64 so it's crisp on desktop and mobile.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect x="6" y="6" width="52" height="52" rx="16" fill="${fill}" />
  <text x="32" y="40" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="34" font-weight="800" fill="#ffffff">B</text>
</svg>`;

  setFaviconSvg(svg);
}

function getPageName(pathname: string) {
  if (pathname === "/" || pathname === "/app" || pathname.startsWith("/app/j/")) return "Dashboard";
  if (pathname.startsWith("/app/chat")) return "Chat";
  if (pathname.startsWith("/app/crm")) return "CRM";
  if (pathname.startsWith("/app/content")) return "Conteúdo";
  if (pathname.startsWith("/app/presence/manage")) return "Gestão de Presença";
  if (pathname.startsWith("/app/presence")) return "Ponto";
  if (pathname === "/app/finance" || pathname.startsWith("/app/finance/control")) return "Financeiro • Control Tower";
  if (pathname.startsWith("/app/finance/board")) return "Financeiro • Quadro de Decisões";
  if (pathname.startsWith("/app/finance/ledger")) return "Financeiro • Lançamentos";
  if (pathname.startsWith("/app/finance/tensions")) return "Financeiro • Tensões";
  if (pathname.startsWith("/app/finance/decisions")) return "Financeiro • Decisões";
  if (pathname.startsWith("/app/finance/ingestion")) return "Financeiro • Ingestão";
  if (pathname.startsWith("/app/finance/planning")) return "Financeiro • Planejamento";
  if (pathname.startsWith("/app/incentives/events")) return "Incentivos • Eventos";
  if (pathname.startsWith("/app/settings")) return "Configurações";
  if (pathname.startsWith("/app/me")) return "Meu usuário";
  if (pathname.startsWith("/app/admin")) return "Admin";
  if (pathname.startsWith("/app/simulator")) return "Simulador";
  if (pathname.startsWith("/login")) return "Login";
  if (pathname.startsWith("/tenants")) return "Tenants";
  return "Byfrost";
}

function NavTile({
  to,
  icon: Icon,
  label,
  disabled,
}: {
  to: string;
  icon: any;
  label: string;
  disabled?: boolean;
}) {
  const base = "mx-auto flex w-[78px] flex-col items-center gap-1 rounded-2xl border px-2 py-2 text-center";

  if (disabled) {
    return (
      <div
        className={cn(
          base,
          "border-slate-200 bg-white/40 text-slate-400",
          "dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-500"
        )}
        title={`${label} (sem permissão)`}
      >
        <div className="relative">
          <Icon className="h-5 w-5" />
          <div className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <Lock className="h-2.5 w-2.5" />
          </div>
        </div>
        <span className="text-[11px] font-semibold tracking-tight leading-none">{label}</span>
      </div>
    );
  }

  return (
    <NavLink
      to={to}
      end={to === "/app"}
      className={({ isActive }) =>
        cn(
          base,
          "transition",
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

function MobileNavItem({
  to,
  icon: Icon,
  label,
  disabled,
  onNavigate,
}: {
  to: string;
  icon: any;
  label: string;
  disabled?: boolean;
  onNavigate: () => void;
}) {
  if (disabled) {
    return (
      <div
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3",
          "border-slate-200 bg-white/40 text-slate-400",
          "dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-500"
        )}
        title={`${label} (sem permissão)`}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <Icon className="h-5 w-5" />
            <div className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <Lock className="h-2.5 w-2.5" />
            </div>
          </div>
          <span className="text-sm font-semibold tracking-tight text-slate-500 dark:text-slate-400">{label}</span>
        </div>
        <span className="text-[11px] font-semibold">bloqueado</span>
      </div>
    );
  }

  return (
    <NavLink
      to={to}
      end={to === "/app"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition",
          isActive
            ? "border-[hsl(var(--byfrost-accent)/0.35)] bg-[hsl(var(--byfrost-accent)/0.10)] text-[hsl(var(--byfrost-accent))]"
            : "border-slate-200 bg-white/75 text-slate-800 hover:border-slate-300 hover:bg-white",
          "dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100 dark:hover:bg-slate-950/60"
        )
      }
      title={label}
    >
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5" />
        <span className="text-sm font-semibold tracking-tight">{label}</span>
      </div>
      <div className="h-2 w-2 rounded-full bg-current opacity-30" />
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

function isPresenceManagerRole(role: string | null | undefined) {
  return ["admin", "manager", "supervisor", "leader"].includes(String(role ?? "").toLowerCase());
}

function isActiveFinancePath(pathname: string) {
  return pathname === "/app/finance" || pathname.startsWith("/app/finance/");
}

function isActivePresencePath(pathname: string) {
  return pathname === "/app/presence" || pathname.startsWith("/app/presence/");
}

function isActiveCorePath(pathname: string) {
  return (
    pathname.startsWith("/app/entities") ||
    pathname.startsWith("/app/commitments") ||
    pathname.startsWith("/app/catalog/")
  );
}

function isFinanceEnabled(modulesJson: any) {
  return Boolean(modulesJson?.finance_enabled === true);
}

function isSimulatorEnabled(modulesJson: any) {
  return Boolean(modulesJson?.simulator_enabled === true);
}

type FinanceNavChild = {
  to: string;
  label: string;
  icon: any;
  routeKey: string;
};

const FINANCE_NAV_CHILDREN: FinanceNavChild[] = [
  { to: "/app/finance/ledger", label: "Lançamentos", icon: Wallet, routeKey: "app.finance.ledger" },
  { to: "/app/finance/ingestion", label: "Ingestão", icon: ArrowDownUp, routeKey: "app.finance.ingestion" },
  { to: "/app/finance/decisions", label: "Decisões", icon: ClipboardList, routeKey: "app.finance.decisions" },
  { to: "/app/finance/tensions", label: "Tensões", icon: AlertTriangle, routeKey: "app.finance.tensions" },
  { to: "/app/finance/planning", label: "Planejamento", icon: CalendarRange, routeKey: "app.finance.planning" },
  { to: "/app/finance/board", label: "Quadro", icon: KanbanSquare, routeKey: "app.finance.board" },
];

type PresenceNavChild = {
  to: string;
  label: string;
  icon: any;
  routeKey: string;
  enabled?: (ctx: { hasPresence: boolean; isPresenceManager: boolean }) => boolean;
};

const PRESENCE_NAV_CHILDREN: PresenceNavChild[] = [
  {
    to: "/app/presence/manage",
    label: "Gestão",
    icon: ClipboardCheck,
    routeKey: "app.presence_manage",
    enabled: ({ hasPresence, isPresenceManager }) => hasPresence && isPresenceManager,
  },
];

type CoreNavChild = {
  to: string;
  label: string;
  icon: any;
  routeKey: string;
};

const CORE_NAV_CHILDREN: CoreNavChild[] = [
  { to: "/app/entities", label: "Entidades", icon: Building2, routeKey: "app.entities" },
  {
    to: "/app/catalog/deliverable-templates",
    label: "Templates",
    icon: PackageCheck,
    routeKey: "app.entities",
  },
  {
    to: "/app/catalog/contract-templates",
    label: "Contratos",
    icon: FileSignature,
    routeKey: "app.settings",
  },
  { to: "/app/commitments", label: "Compromissos", icon: Handshake, routeKey: "app.commitments" },
];

function DesktopHoverMenu({
  trigger,
  title,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <HoverCardPrimitive.Root openDelay={80} closeDelay={120}>
      <HoverCardPrimitive.Trigger asChild>{trigger as any}</HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          side="right"
          align="start"
          sideOffset={12}
          className={cn(
            "z-[999] min-w-[220px] rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur",
            "dark:border-slate-800 dark:bg-slate-950/90"
          )}
        >
          <div className="px-2 pb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{title}</div>
          <div className="grid gap-1">{children}</div>
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}

function DesktopHoverMenuLink({
  to,
  label,
  icon: Icon,
  active,
  disabled,
}: {
  to: string;
  label: string;
  icon: any;
  active: boolean;
  disabled: boolean;
}) {
  return (
    <NavLink
      to={to}
      className={cn(
        "flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm font-semibold transition",
        active
          ? "bg-[hsl(var(--byfrost-accent)/0.10)] text-[hsl(var(--byfrost-accent))]"
          : "text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800/60",
        disabled && "pointer-events-none opacity-50 grayscale cursor-not-allowed"
      )}
      title={disabled ? `${label} (sem permissão)` : label}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      {disabled ? <Lock className="h-4 w-4 opacity-70" /> : <ChevronRight className="h-4 w-4 opacity-40" />}
    </NavLink>
  );
}

export function AppShell({
  children,
  hideTopBar,
}: PropsWithChildren<{ hideTopBar?: boolean }>) {
  const nav = useNavigate();
  const loc = useLocation();
  const { activeTenant, isSuperAdmin, activeTenantId } = useTenant();
  const { user } = useSession();
  const chatAccess = useChatInstanceAccess();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileFinanceOpen, setMobileFinanceOpen] = useState(false);
  const [mobilePresenceOpen, setMobilePresenceOpen] = useState(false);
  const [mobileCoreOpen, setMobileCoreOpen] = useState(false);

  const roleKey = String(activeTenant?.role ?? "");
  const financeEnabledForTenant = isSuperAdmin || isFinanceEnabled(activeTenant?.modules_json);
  const simulatorEnabledForTenant = isSuperAdmin || isSimulatorEnabled(activeTenant?.modules_json);

  const navAccessQ = useQuery({
    queryKey: ["nav_access", activeTenantId, roleKey],
    enabled: Boolean(activeTenantId && roleKey && !isSuperAdmin),
    staleTime: 10_000,
    queryFn: async () => {
      const keys = [
        "app.dashboard",
        "app.chat",
        "app.crm",
        "app.content",
        // Core
        "app.entities",
        "app.commitments",
        // Presença
        "app.presence",
        "app.presence_manage",
        // Outros
        "app.incentives_events_manage",
        "app.simulator",
        "app.settings",
        "app.me",
        "app.admin",
        // Finance
        "app.finance.cockpit",
        "app.finance.ledger",
        "app.finance.ingestion",
        "app.finance.decisions",
        "app.finance.tensions",
        "app.finance.planning",
        "app.finance.board",
      ];

      const map: Record<string, boolean> = {};
      for (const k of keys) {
        try {
          map[k] = await checkRouteAccess({ tenantId: activeTenantId!, roleKey, routeKey: k });
        } catch {
          // On error, fail-closed for the menu.
          map[k] = false;
        }
      }

      return map;
    },
  });

  const can = (routeKey: string) => {
    if (isSuperAdmin) return true;
    if (!activeTenantId) return false;
    if (!roleKey) return false;
    // While loading, keep visible to avoid layout jump; the guards will still block.
    if (navAccessQ.isLoading || !navAccessQ.data) return true;
    return Boolean(navAccessQ.data[routeKey]);
  };

  const financeHasAnyAccess = useMemo(() => {
    if (!financeEnabledForTenant) return false;
    if (isSuperAdmin) return true;
    const keys = [
      "app.finance.cockpit",
      "app.finance.ledger",
      "app.finance.ingestion",
      "app.finance.decisions",
      "app.finance.tensions",
      "app.finance.planning",
      "app.finance.board",
    ];
    return keys.some((k) => can(k));
  }, [financeEnabledForTenant, isSuperAdmin, navAccessQ.isLoading, navAccessQ.data, activeTenantId, roleKey]);

  const coreHasAnyAccess = useMemo(() => {
    if (isSuperAdmin) return true;
    return ["app.entities", "app.commitments"].some((k) => can(k));
  }, [isSuperAdmin, navAccessQ.isLoading, navAccessQ.data, activeTenantId, roleKey]);

  const showChatInNav = isSuperAdmin ? true : chatAccess.isLoading ? false : chatAccess.hasAccess;

  const crmEnabledQ = useQuery({
    queryKey: ["nav_has_crm", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("id, journeys(is_crm)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true)
        .limit(50);
      if (error) throw error;
      return Boolean((data ?? []).some((r: any) => Boolean(r?.journeys?.is_crm)));
    },
  });

  const presenceEnabledQ = useQuery({
    queryKey: ["nav_presence_enabled", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("config_json, journeys!inner(key)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true)
        .eq("journeys.key", "presence")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return Boolean((data as any)?.config_json?.flags?.presence_enabled === true);
    },
  });

  const metaContentEnabledQ = useQuery({
    queryKey: ["nav_meta_content_enabled", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("config_json, journeys!inner(key)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true)
        .eq("journeys.key", "meta_content")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return Boolean((data as any)?.config_json?.meta_content_enabled === true);
    },
  });

  const incentivesHasCampaignsQ = useQuery({
    queryKey: ["nav_incentives_has_campaigns", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id")
        .eq("tenant_id", activeTenantId!)
        .limit(1);
      if (error) throw error;
      return Boolean((data ?? []).length > 0);
    },
  });

  const trelloEnabledQ = useQuery({
    queryKey: ["nav_has_trello", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("id, journeys(key)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true)
        .eq("journeys.key", "trello")
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });

  const hasTrello = Boolean(trelloEnabledQ.data);

  const hasCrm = Boolean(crmEnabledQ.data);
  const hasPresence = Boolean(presenceEnabledQ.data);
  const hasMetaContent = Boolean(metaContentEnabledQ.data);
  const hasIncentivesCampaigns = Boolean(incentivesHasCampaignsQ.data);
  const isPresenceManager = isSuperAdmin || isPresenceManagerRole(activeTenant?.role);

  const palettePrimaryHex = (activeTenant?.branding_json?.palette?.primary?.hex as string | undefined) ?? null;

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

    // Tenant palette variables (user theme may override via --user-*).
    root.style.setProperty("--tenant-accent", `${accent.h} ${accent.s}% ${accent.l}%`);
    root.style.setProperty("--tenant-bg", `${bg.h} ${bg.s}% ${bg.l}%`);
  }, [palettePrimaryHex, activeTenant?.id]);

  // Branding: favicon + document title
  useEffect(() => {
    applyTenantFavicon(palettePrimaryHex);

    const pageName = getPageName(loc.pathname);
    document.title = `Byfrost by M30 - ${pageName}`;
  }, [palettePrimaryHex, loc.pathname]);

  const signOut = async () => {
    await supabase.auth.signOut();
    nav("/login", { replace: true });
  };

  const userName = getUserDisplayName(user);
  const userEmail = user?.email ?? "";
  const avatarUrl = (user?.user_metadata as any)?.avatar_url ?? null;

  // Keep mobile submenu in sync with current route
  useEffect(() => {
    if (isActiveFinancePath(loc.pathname)) setMobileFinanceOpen(true);
    if (isActivePresencePath(loc.pathname)) setMobilePresenceOpen(true);
    if (isActiveCorePath(loc.pathname)) setMobileCoreOpen(true);
  }, [loc.pathname]);

  return (
    <div className="min-h-screen bg-[hsl(var(--byfrost-bg))]">
      <div className="w-full px-3 py-3 md:px-5 md:py-4">
        <div className="grid gap-3 md:grid-cols-[96px_1fr] md:gap-5">
          {/* Sidebar (desktop) */}
          <aside className="relative z-20 hidden flex-col overflow-visible rounded-[28px] border border-slate-200 bg-white/65 shadow-sm backdrop-blur md:sticky md:top-4 md:flex md:h-[calc(100vh-32px)] dark:border-slate-800 dark:bg-slate-950/40">
            {/* Top brand block */}
            <div className="bg-[hsl(var(--byfrost-accent))] px-2 pb-2 pt-1.5">
              <Link
                to="/app"
                className="mx-auto flex w-fit flex-col items-center"
                title={activeTenant?.name ?? "Byfrost"}
              >
                <div className="flex h-[74px] w-[74px] items-center justify-center overflow-hidden rounded-full bg-white p-1.5 shadow-sm ring-1 ring-white/40">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo do tenant"
                      className="h-full w-full rounded-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-[hsl(var(--byfrost-accent))] text-2xl font-semibold text-white">
                      {(activeTenant?.name?.slice(0, 1) ?? "B").toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="mt-2 max-w-[84px] truncate text-center text-[11px] font-semibold tracking-tight text-white/95">
                  {activeTenant?.name ?? "Byfrost"}
                </div>
              </Link>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid justify-items-center gap-2">
                <NavTile to="/app" icon={LayoutGrid} label="Dashboard" disabled={!can("app.dashboard")} />
                {showChatInNav && <NavTile to="/app/chat" icon={MessagesSquare} label="Chat" disabled={!can("app.chat")} />}
                {hasTrello && <NavTile to="/app/j/trello" icon={KanbanSquare} label="Tarefas" disabled={!can("app.dashboard")} />}
                {hasCrm && <NavTile to="/app/crm" icon={LayoutDashboard} label="CRM" disabled={!can("app.crm")} />}
                {hasMetaContent && (
                  <NavTile to="/app/content" icon={Clapperboard} label="Conteúdo" disabled={!can("app.content")} />
                )}

                {/* Core (desktop): hover menu */}
                {coreHasAnyAccess && (
                  <DesktopHoverMenu
                    title="Core"
                    trigger={<div className="w-full"><NavTile to="/app/entities" icon={Building2} label="Core" disabled={!can("app.entities")} /></div>}
                  >
                    {CORE_NAV_CHILDREN.map(({ to, label, icon, routeKey }) => (
                      <DesktopHoverMenuLink
                        key={to}
                        to={to}
                        label={label}
                        icon={icon}
                        active={loc.pathname === to || loc.pathname.startsWith(to + "/")}
                        disabled={!can(routeKey)}
                      />
                    ))}
                  </DesktopHoverMenu>
                )}

                {/* Presença (desktop): hover menu */}
                {hasPresence && (
                  <DesktopHoverMenu
                    title="Presença"
                    trigger={<div className="w-full"><NavTile to="/app/presence" icon={Clock3} label="Ponto" disabled={!can("app.presence")} /></div>}
                  >
                    {PRESENCE_NAV_CHILDREN.filter((c) =>
                      c.enabled ? c.enabled({ hasPresence, isPresenceManager }) : true
                    ).map(({ to, label, icon, routeKey }) => (
                      <DesktopHoverMenuLink
                        key={to}
                        to={to}
                        label={label}
                        icon={icon}
                        active={loc.pathname === to || loc.pathname.startsWith(to + "/")}
                        disabled={!can(routeKey)}
                      />
                    ))}
                  </DesktopHoverMenu>
                )}

                {/* Financeiro (desktop): hover menu */}
                {financeHasAnyAccess && (
                  <DesktopHoverMenu
                    title="Financeiro"
                    trigger={<div className="w-full"><NavTile to="/app/finance" icon={Gauge} label="Cockpit" disabled={!can("app.finance.cockpit")} /></div>}
                  >
                    {FINANCE_NAV_CHILDREN.map(({ to, label, icon, routeKey }) => (
                      <DesktopHoverMenuLink
                        key={to}
                        to={to}
                        label={label}
                        icon={icon}
                        active={loc.pathname === to || loc.pathname.startsWith(to + "/")}
                        disabled={!can(routeKey)}
                      />
                    ))}
                  </DesktopHoverMenu>
                )}

                {hasIncentivesCampaigns && (
                  <NavTile
                    to="/app/incentives/events"
                    icon={CalendarClock}
                    label="Eventos"
                    disabled={!can("app.incentives_events_manage")}
                  />
                )}

                {simulatorEnabledForTenant && (
                  <NavTile to="/app/simulator" icon={FlaskConical} label="Simulador" disabled={!can("app.simulator")} />
                )}

                {isSuperAdmin && <NavTile to="/app/admin" icon={Crown} label="Admin" disabled={!can("app.admin")} />}
                <NavTile to="/app/settings" icon={Settings} label="Config" disabled={!can("app.settings")} />
              </div>
            </div>
          </aside>

          {/* Main */}
          <div className="relative z-0 min-w-0">
            {/* Content header (tenant accent border) */}
            {!hideTopBar && (
              <div className="overflow-hidden rounded-[28px] border border-slate-200 border-t-4 border-t-[hsl(var(--byfrost-accent))] bg-white/65 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                      <SheetTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-10 rounded-2xl px-3 md:hidden"
                          title="Abrir menu"
                        >
                          <Menu className="h-5 w-5" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="left" className="w-[92vw] max-w-[420px] p-0">
                        <div className="border-b border-slate-200 bg-[hsl(var(--byfrost-accent))] px-4 pb-4 pt-5 text-white dark:border-slate-800">
                          <div className="flex items-start justify-between gap-3">
                            <Link
                              to="/app"
                              onClick={() => setMobileNavOpen(false)}
                              className="flex min-w-0 items-center gap-3"
                            >
                              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-white/95 p-1 shadow-sm ring-1 ring-white/30">
                                {logoUrl ? (
                                  <img
                                    src={logoUrl}
                                    alt="Logo do tenant"
                                    className="h-full w-full rounded-full object-contain"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center rounded-full bg-white/15 text-lg font-semibold text-white">
                                    {(activeTenant?.name?.slice(0, 1) ?? "B").toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold leading-tight">{activeTenant?.name ?? "Byfrost"}</div>
                                <div className="mt-0.5 truncate text-[11px] text-white/85">{activeTenant?.slug ?? ""}</div>
                              </div>
                            </Link>

                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="secondary"
                                className="h-10 rounded-2xl bg-white/15 text-white hover:bg-white/20"
                                onClick={() => {
                                  setMobileNavOpen(false);
                                  nav("/tenants");
                                }}
                                title="Trocar tenant"
                              >
                                <ArrowLeftRight className="mr-2 h-4 w-4" />
                                Trocar
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="p-4">
                          <SheetHeader className="sr-only">
                            <SheetTitle>Menu</SheetTitle>
                          </SheetHeader>

                          <div className="grid gap-2">
                            <MobileNavItem
                              to="/app"
                              icon={LayoutGrid}
                              label="Dashboard"
                              disabled={!can("app.dashboard")}
                              onNavigate={() => setMobileNavOpen(false)}
                            />
                            {showChatInNav && (
                              <MobileNavItem
                                to="/app/chat"
                                icon={MessagesSquare}
                                label="Chat"
                                disabled={!can("app.chat")}
                                onNavigate={() => setMobileNavOpen(false)}
                              />
                            )}
                            {hasCrm && (
                              <MobileNavItem
                                to="/app/crm"
                                icon={LayoutDashboard}
                                label="CRM"
                                disabled={!can("app.crm")}
                                onNavigate={() => setMobileNavOpen(false)}
                              />
                            )}
                            {hasMetaContent && (
                              <MobileNavItem
                                to="/app/content"
                                icon={Clapperboard}
                                label="Conteúdo"
                                disabled={!can("app.content")}
                                onNavigate={() => setMobileNavOpen(false)}
                              />
                            )}

                            {/* Core (mobile): menu com filhos */}
                            {coreHasAnyAccess && (
                              <Collapsible open={mobileCoreOpen} onOpenChange={setMobileCoreOpen}>
                                <CollapsibleTrigger asChild>
                                  <button
                                    type="button"
                                    className={cn(
                                      "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition",
                                      isActiveCorePath(loc.pathname)
                                        ? "border-[hsl(var(--byfrost-accent)/0.35)] bg-[hsl(var(--byfrost-accent)/0.10)] text-[hsl(var(--byfrost-accent))]"
                                        : "border-slate-200 bg-white/75 text-slate-800 hover:border-slate-300 hover:bg-white",
                                      "dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100 dark:hover:bg-slate-950/60"
                                    )
                                    }
                                    title="Core"
                                  >
                                    <div className="flex items-center gap-3">
                                      <Building2 className="h-5 w-5" />
                                      <span className="text-sm font-semibold tracking-tight">Core</span>
                                    </div>
                                    <ChevronRight
                                      className={cn("h-5 w-5 opacity-70 transition", mobileCoreOpen && "rotate-90")}
                                    />
                                  </button>
                                </CollapsibleTrigger>

                                <CollapsibleContent className="mt-2 grid gap-2 pl-2">
                                  {CORE_NAV_CHILDREN.map(({ to, label, icon, routeKey }) => (
                                    <MobileNavItem
                                      key={to}
                                      to={to}
                                      icon={icon}
                                      label={label}
                                      disabled={!can(routeKey)}
                                      onNavigate={() => setMobileNavOpen(false)}
                                    />
                                  ))}
                                </CollapsibleContent>
                              </Collapsible>
                            )}

                            {/* Presença (mobile): Ponto + abrir filhos ao clicar */}
                            {hasPresence && (
                              <Collapsible open={mobilePresenceOpen} onOpenChange={setMobilePresenceOpen}>
                                <CollapsibleTrigger asChild>
                                  <button
                                    type="button"
                                    className={cn(
                                      "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition",
                                      isActivePresencePath(loc.pathname)
                                        ? "border-[hsl(var(--byfrost-accent)/0.35)] bg-[hsl(var(--byfrost-accent)/0.10)] text-[hsl(var(--byfrost-accent))]"
                                        : "border-slate-200 bg-white/75 text-slate-800 hover:border-slate-300 hover:bg-white",
                                      "dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100 dark:hover:bg-slate-950/60"
                                    )
                                    }
                                    title="Presença"
                                  >
                                    <div className="flex items-center gap-3">
                                      <Clock3 className="h-5 w-5" />
                                      <span className="text-sm font-semibold tracking-tight">Ponto</span>
                                    </div>
                                    <ChevronRight
                                      className={cn(
                                        "h-5 w-5 opacity-70 transition",
                                        mobilePresenceOpen && "rotate-90"
                                      )}
                                    />
                                  </button>
                                </CollapsibleTrigger>

                                <CollapsibleContent className="mt-2 grid gap-2 pl-2">
                                  <MobileNavItem
                                    to="/app/presence"
                                    icon={Clock3}
                                    label="Ponto"
                                    disabled={!can("app.presence")}
                                    onNavigate={() => setMobileNavOpen(false)}
                                  />
                                  {PRESENCE_NAV_CHILDREN.filter((c) => (c.enabled ? c.enabled({ hasPresence, isPresenceManager }) : true)).map(
                                    ({ to, label, icon, routeKey }) => (
                                      <MobileNavItem
                                        key={to}
                                        to={to}
                                        icon={icon}
                                        label={label}
                                        disabled={!can(routeKey)}
                                        onNavigate={() => setMobileNavOpen(false)}
                                      />
                                    )
                                  )}
                                </CollapsibleContent>
                              </Collapsible>
                            )}

                            {/* Financeiro (mobile): Cockpit + abrir filhos ao clicar */}
                            {financeHasAnyAccess && (
                              <Collapsible open={mobileFinanceOpen} onOpenChange={setMobileFinanceOpen}>
                                <CollapsibleTrigger asChild>
                                  <button
                                    type="button"
                                    className={cn(
                                      "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition",
                                      isActiveFinancePath(loc.pathname)
                                        ? "border-[hsl(var(--byfrost-accent)/0.35)] bg-[hsl(var(--byfrost-accent)/0.10)] text-[hsl(var(--byfrost-accent))]"
                                        : "border-slate-200 bg-white/75 text-slate-800 hover:border-slate-300 hover:bg-white",
                                      "dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100 dark:hover:bg-slate-950/60"
                                    )
                                    }
                                    title="Financeiro"
                                  >
                                    <div className="flex items-center gap-3">
                                      <Gauge className="h-5 w-5" />
                                      <span className="text-sm font-semibold tracking-tight">Cockpit</span>
                                    </div>
                                    <ChevronRight
                                      className={cn(
                                        "h-5 w-5 opacity-70 transition",
                                        mobileFinanceOpen && "rotate-90"
                                      )}
                                    />
                                  </button>
                                </CollapsibleTrigger>

                                <CollapsibleContent className="mt-2 grid gap-2 pl-2">
                                  <MobileNavItem
                                    to="/app/finance"
                                    icon={Gauge}
                                    label="Cockpit"
                                    disabled={!can("app.finance.cockpit")}
                                    onNavigate={() => setMobileNavOpen(false)}
                                  />
                                  {FINANCE_NAV_CHILDREN.map(({ to, label, icon, routeKey }) => (
                                    <MobileNavItem
                                      key={to}
                                      to={to}
                                      icon={icon}
                                      label={label}
                                      disabled={!can(routeKey)}
                                      onNavigate={() => setMobileNavOpen(false)}
                                    />
                                  ))}
                                </CollapsibleContent>
                              </Collapsible>
                            )}

                            {hasIncentivesCampaigns && (
                              <MobileNavItem
                                to="/app/incentives/events"
                                icon={CalendarClock}
                                label="Eventos"
                                disabled={!can("app.incentives_events_manage")}
                                onNavigate={() => setMobileNavOpen(false)}
                              />
                            )}

                            {simulatorEnabledForTenant && (
                              <MobileNavItem
                                to="/app/simulator"
                                icon={FlaskConical}
                                label="Simulador"
                                disabled={!can("app.simulator")}
                                onNavigate={() => setMobileNavOpen(false)}
                              />
                            )}

                            {isSuperAdmin && (
                              <MobileNavItem
                                to="/app/admin"
                                icon={Crown}
                                label="Admin"
                                disabled={!can("app.admin")}
                                onNavigate={() => setMobileNavOpen(false)}
                              />
                            )}
                            <MobileNavItem
                              to="/app/settings"
                              icon={Settings}
                              label="Config"
                              disabled={!can("app.settings")}
                              onNavigate={() => setMobileNavOpen(false)}
                            />
                          </div>

                          <div className="mt-3 rounded-2xl border border-slate-200 bg-white/70 p-3 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                            Dica: itens com cadeado aparecem, mas ficam <span className="font-semibold">bloqueados</span> conforme sua matriz de acesso.
                          </div>
                        </div>
                      </SheetContent>
                    </Sheet>

                    {isSuperAdmin && (
                      <div className="hidden sm:inline-flex items-center gap-1 rounded-full bg-[hsl(var(--byfrost-accent)/0.10)] px-2 py-1 text-[11px] font-semibold text-[hsl(var(--byfrost-accent))]">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        super-admin
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {isSuperAdmin && (
                      <Button
                        type="button"
                        className={cn(
                          "h-10 rounded-2xl px-3 text-xs font-semibold text-white shadow-sm",
                          "bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                        )}
                        onClick={() => nav("/tenants")}
                        title="Trocar tenant"
                      >
                        <ArrowLeftRight className="mr-2 h-4 w-4" />
                        Trocar tenant
                      </Button>
                    )}

                    <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex max-w-full min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white/75 px-2.5 py-2 text-left text-slate-900 shadow-sm transition hover:bg-white dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100 dark:hover:bg-slate-950/60"
                          onMouseEnter={() => setUserMenuOpen(true)}
                          onMouseLeave={() => setUserMenuOpen(false)}
                          title={userEmail}
                        >
                          <Avatar className="h-8 w-8 shrink-0 rounded-2xl">
                            <AvatarImage src={avatarUrl ?? undefined} alt={userName} />
                            <AvatarFallback className="rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                              {(userName?.slice(0, 1) ?? "U").toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="hidden min-w-0 sm:block">
                            <div className="max-w-[180px] truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {userName}
                            </div>
                            <div className="max-w-[180px] truncate text-[11px] text-slate-500 dark:text-slate-400">{activeTenant?.slug}</div>
                          </div>
                          <User2 className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" />
                        </button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent
                        align="end"
                        className="w-64 rounded-2xl border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950"
                        onMouseEnter={() => setUserMenuOpen(true)}
                        onMouseLeave={() => setUserMenuOpen(false)}
                      >
                        <DropdownMenuLabel className="px-2 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{userName}</div>
                              <div className="mt-0.5 truncate text-[11px] font-normal text-slate-600 dark:text-slate-400">{userEmail}</div>
                            </div>
                            {isSuperAdmin && (
                              <div className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900">
                                super-admin
                              </div>
                            )}
                          </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-slate-200 dark:bg-slate-800" />

                        <DropdownMenuItem
                          className="cursor-pointer rounded-xl px-2 py-2 text-sm"
                          onClick={() => nav("/app/me")}
                        >
                          <User2 className="mr-2 h-4 w-4" />
                          Meu usuário
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer rounded-xl px-2 py-2 text-sm"
                          onClick={signOut}
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          Sair
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            )}

            <div className={cn("mt-3 md:mt-5", hideTopBar && "mt-0")}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}