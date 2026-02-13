import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

function formatMoneyBRL(n: number) {
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

function formatPct(n: number) {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function daysBetweenIso(aIso: string, bIso: string) {
  const a = new Date(`${aIso}T00:00:00Z`).getTime();
  const b = new Date(`${bIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function addDaysIso(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type CategoryRow = {
  id: string;
  type: "revenue" | "cost" | "fixed" | "variable" | "other";
};

export function FinanceControlTowerPanel() {
  const { activeTenantId } = useTenant();

  const projectionQ = useQuery({
    queryKey: ["financial_cash_projection", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 8000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("financial_cash_projection", {
        p_tenant_id: activeTenantId!,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const categoriesQ = useQuery({
    queryKey: ["financial_categories_types", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_categories")
        .select("id,type")
        .eq("tenant_id", activeTenantId!)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
  });

  const monthStartIso = useMemo(() => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
  }, []);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const last30Start = useMemo(() => addDaysIso(todayIso, -29), [todayIso]);

  const txQ = useQuery({
    queryKey: ["financial_transactions_control_tower", activeTenantId, last30Start],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("id,amount,type,transaction_date,category_id")
        .eq("tenant_id", activeTenantId!)
        .gte("transaction_date", last30Start)
        .order("transaction_date", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const budgetsQ = useQuery({
    queryKey: ["financial_budgets_control_tower", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_budgets")
        .select("id,category_id,expected_amount,recurrence,scenario")
        .eq("tenant_id", activeTenantId!)
        .eq("scenario", "base")
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const categoryTypeById = useMemo(() => {
    const m = new Map<string, CategoryRow["type"]>();
    for (const c of categoriesQ.data ?? []) m.set(c.id, c.type);
    return m;
  }, [categoriesQ.data]);

  const {
    revenueMonth,
    costsMonth,
    margin,
    budgetRevenueMonth,
    budgetCostsMonth,
    budgetDelta,
  } = useMemo(() => {
    // Realizado (mês): usa somente transações categorizadas
    let rev = 0;
    let cost = 0;

    for (const t of txQ.data ?? []) {
      const d = String(t.transaction_date ?? "");
      if (!d || d < monthStartIso) continue;
      const catId = t.category_id as string | null;
      if (!catId) continue;

      const ctype = categoryTypeById.get(catId) ?? "other";
      const amt = Number(t.amount ?? 0);
      const typ = String(t.type ?? "");

      if (ctype === "revenue" && typ === "credit") rev += amt;
      if (ctype !== "revenue" && typ === "debit") cost += amt;
    }

    const m = rev > 0 ? (rev - cost) / rev : NaN;

    // Orçado (MVP): soma budgets mensais do cenário base
    let bRev = 0;
    let bCost = 0;

    for (const b of budgetsQ.data ?? []) {
      if (String(b.recurrence) !== "monthly") continue;
      const catId = String(b.category_id ?? "");
      if (!catId) continue;
      const ctype = categoryTypeById.get(catId) ?? "other";
      const expected = Number(b.expected_amount ?? 0);
      if (expected <= 0) continue;

      if (ctype === "revenue") bRev += expected;
      else bCost += expected;
    }

    const realizedNet = rev - cost;
    const budgetNet = bRev - bCost;

    return {
      revenueMonth: rev,
      costsMonth: cost,
      margin: m,
      budgetRevenueMonth: bRev,
      budgetCostsMonth: bCost,
      budgetDelta: realizedNet - budgetNet,
    };
  }, [txQ.data, monthStartIso, categoryTypeById, budgetsQ.data]);

  const cashFlowDaily = useMemo(() => {
    const byDay = new Map<string, number>();

    for (const t of txQ.data ?? []) {
      const day = String(t.transaction_date ?? "");
      if (!day) continue;
      const amt = Number(t.amount ?? 0);
      const typ = String(t.type ?? "");
      const net = typ === "credit" ? amt : -amt;
      byDay.set(day, (byDay.get(day) ?? 0) + net);
    }

    const days = daysBetweenIso(last30Start, todayIso);
    const out: Array<{ day: string; net: number }> = [];
    for (let i = 0; i <= days; i++) {
      const d = addDaysIso(last30Start, i);
      out.push({ day: d.slice(5), net: Number((byDay.get(d) ?? 0).toFixed(2)) });
    }
    return out;
  }, [txQ.data, last30Start, todayIso]);

  const runwayDays = useMemo(() => {
    const projected = Number(projectionQ.data?.projected_balance ?? 0);
    if (!Number.isFinite(projected) || projected <= 0) return null;

    // Burn médio (últimos 30 dias): se a média diária for negativa, runway = projected / burn
    const avgDailyNet = cashFlowDaily.length
      ? cashFlowDaily.reduce((s, d) => s + Number(d.net ?? 0), 0) / cashFlowDaily.length
      : 0;

    const burn = avgDailyNet < 0 ? Math.abs(avgDailyNet) : 0;
    if (!burn) return null;

    return Math.floor(projected / burn);
  }, [projectionQ.data, cashFlowDaily]);

  const kpi = useMemo(() => {
    const current = Number(projectionQ.data?.current_balance ?? 0);
    const projected = Number(projectionQ.data?.projected_balance ?? 0);
    const runway = runwayDays;

    return {
      current,
      projected,
      runway,
      margin,
      revenueMonth,
      costsMonth,
    };
  }, [projectionQ.data, runwayDays, margin, revenueMonth, costsMonth]);

  const budgetChartData = useMemo(() => {
    const realizedNet = revenueMonth - costsMonth;
    const budgetNet = budgetRevenueMonth - budgetCostsMonth;

    return [
      { name: "Orçado", value: Number(budgetNet.toFixed(2)) },
      { name: "Realizado", value: Number(realizedNet.toFixed(2)) },
    ];
  }, [revenueMonth, costsMonth, budgetRevenueMonth, budgetCostsMonth]);

  const budgetChartConfig = {
    value: { label: "Valor", color: "hsl(var(--byfrost-accent))" },
  } satisfies ChartConfig;

  const cashFlowConfig = {
    net: { label: "Net", color: "hsl(var(--byfrost-accent))" },
  } satisfies ChartConfig;

  const balanceConfig = {
    current: { label: "Saldo atual", color: "hsl(var(--byfrost-accent))" },
    projected: { label: "Saldo projetado", color: "hsl(var(--byfrost-accent)/0.55)" },
  } satisfies ChartConfig;

  const balanceSeries = useMemo(() => {
    // tiny 2-point chart just for quick visual
    return [
      { name: "Atual", current: kpi.current, projected: null },
      { name: "Projetado", current: null, projected: kpi.projected },
    ];
  }, [kpi.current, kpi.projected]);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-end">
        <Button
          variant="secondary"
          className="h-9 rounded-2xl"
          onClick={() => {
            projectionQ.refetch();
            txQ.refetch();
            budgetsQ.refetch();
          }}
          disabled={!activeTenantId}
        >
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
          <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Saldo atual</div>
          <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {formatMoneyBRL(kpi.current)}
          </div>
        </Card>

        <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
          <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Saldo projetado</div>
          <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {formatMoneyBRL(kpi.projected)}
          </div>
        </Card>

        <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
          <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Runway</div>
          <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {kpi.runway != null ? `${kpi.runway} dias` : "—"}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">(média dos últimos 30 dias)</div>
        </Card>

        <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
          <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Margem (mês)</div>
          <div className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {formatPct(kpi.margin)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Receita {formatMoneyBRL(kpi.revenueMonth)} • Custos {formatMoneyBRL(kpi.costsMonth)}
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Orçado vs Realizado (mês)</div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Neto (receita - custos). Orçado usa budgets mensais do cenário base.
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Delta</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatMoneyBRL(budgetDelta)}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <ChartContainer config={budgetChartConfig} className="h-[220px] w-full">
              <BarChart data={budgetChartData} margin={{ left: 8, right: 8, top: 10 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={68} tickFormatter={(v) => String(v)} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={[10, 10, 10, 10]} />
              </BarChart>
            </ChartContainer>
          </div>
        </Card>

        <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Fluxo de caixa diário</div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Net (créditos - débitos) • últimos 30 dias
            </div>
          </div>

          <div className="mt-3">
            <ChartContainer config={cashFlowConfig} className="h-[220px] w-full">
              <BarChart data={cashFlowDaily} margin={{ left: 8, right: 8, top: 10 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={18} />
                <YAxis tickLine={false} axisLine={false} width={68} tickFormatter={(v) => String(v)} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="net" fill="var(--color-net)" radius={[8, 8, 8, 8]} />
              </BarChart>
            </ChartContainer>
          </div>
        </Card>
      </div>

      <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Saldo (visual rápido)</div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">Atual vs projetado</div>
        </div>
        <div className="mt-3">
          <ChartContainer config={balanceConfig} className="h-[160px] w-full">
            <LineChart data={balanceSeries} margin={{ left: 8, right: 8, top: 10 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={68} tickFormatter={(v) => String(v)} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="current"
                stroke="var(--color-current)"
                strokeWidth={3}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="projected"
                stroke="var(--color-projected)"
                strokeWidth={3}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </div>
      </Card>

      {(projectionQ.isError || txQ.isError || budgetsQ.isError || categoriesQ.isError) && (
        <div className="text-xs text-red-600 dark:text-red-300">
          Falha ao carregar dados do cockpit. Verifique se há transações/categorias/orçamento no tenant.
        </div>
      )}

      <div className="text-[11px] text-slate-500 dark:text-slate-400">
        Observações: margem e orçado x realizado dependem de transações categorizadas (category_id).
      </div>
    </div>
  );
}
