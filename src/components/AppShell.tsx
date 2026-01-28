import { PropsWithChildren } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import {
  LayoutGrid,
  FlaskConical,
  Settings,
  LogOut,
  Search,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  const { activeTenant } = useTenant();

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
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {activeTenant?.name ?? "Byfrost.ia"}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    Guardião do Negócio • Proativo (somente sugere/alerta) • Governança ativa
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
