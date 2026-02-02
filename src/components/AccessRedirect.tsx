import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ShieldAlert, ArrowRightLeft, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Props = {
  title: string;
  description: string;
  to: string;
  toLabel: string;
  details?: { label: string; value: string }[];
  autoMs?: number;
};

export function AccessRedirect({ title, description, to, toLabel, details = [], autoMs = 900 }: Props) {
  const nav = useNavigate();

  useEffect(() => {
    const t = window.setTimeout(() => {
      nav(to, { replace: true });
    }, autoMs);
    return () => window.clearTimeout(t);
  }, [to, autoMs, nav]);

  return (
    <div className="min-h-[52vh] rounded-[28px] border border-slate-200 bg-white/65 p-5 shadow-sm backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-100 text-amber-900">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-slate-900">{title}</div>
          <div className="mt-1 text-sm text-slate-600">{description}</div>
        </div>
      </div>

      {details.length > 0 && (
        <div className="mt-4 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          {details.map((d) => (
            <div key={d.label} className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-semibold text-slate-600">{d.label}</div>
              <div className={cn("text-[11px] text-slate-800", d.value.length > 18 && "font-mono")}>
                {d.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          onClick={() => nav(to, { replace: true })}
          className="h-10 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
        >
          {toLabel}
        </Button>
        <Button
          variant="secondary"
          className="h-10 rounded-2xl"
          onClick={() => nav("/tenants", { replace: true })}
          title="Trocar tenant"
        >
          <ArrowRightLeft className="mr-2 h-4 w-4" />
          Trocar tenant
        </Button>
        <Button
          variant="secondary"
          className="h-10 rounded-2xl"
          onClick={async () => {
            await supabase.auth.signOut();
            nav("/login", { replace: true });
          }}
          title="Sair"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </div>

      <div className="mt-3 text-[11px] text-slate-500">
        Redirecionando automaticamente em {Math.round(autoMs / 100) / 10}s…
      </div>
    </div>
  );
}
