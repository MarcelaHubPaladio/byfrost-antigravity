import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  trend?: number; // porcentagem (positiva ou negativa)
  trendLabel?: string;
  icon: React.ElementType;
  className?: string;
}

export function KpiCard({ title, value, trend, trendLabel, icon: Icon, className }: KpiCardProps) {
  const isPositive = trend && trend > 0;
  const isNegative = trend && trend < 0;

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md transition-all hover:shadow-md dark:border-slate-800/60 dark:bg-slate-950/40", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</span>
        <div className="rounded-xl bg-indigo-50/50 p-2.5 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-400">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      
      <div className="mt-4 flex items-baseline gap-2">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {value}
        </h2>
      </div>

      {trend !== undefined && (
        <div className="mt-4 flex items-center gap-2">
          <div
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
              isPositive && "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
              isNegative && "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
              !isPositive && !isNegative && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            )}
          >
            {isPositive && <ArrowUpRight className="h-3.5 w-3.5" />}
            {isNegative && <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(trend)}%
          </div>
          {trendLabel && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {trendLabel}
            </span>
          )}
        </div>
      )}
      
      {/* Decorative background flare */}
      <div className="absolute -right-12 -top-12 -z-10 h-32 w-32 rounded-full bg-indigo-500/5 blur-[40px] dark:bg-indigo-500/10" />
    </div>
  );
}
