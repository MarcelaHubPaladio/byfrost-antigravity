import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { LineChart as LineChartIcon, Calendar, Filter } from "lucide-react";
import { startOfMonth, endOfMonth, subMonths, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

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

  // --- Filter State ---
  const [filterType, setFilterType] = useState<"month" | "period">("month");
  
  // Month filter state
  const [selectedMonth, setSelectedMonth] = useState<string>(() => format(new Date(), "yyyy-MM"));
  
  // Period filter state
  const [startDate, setStartDate] = useState<string>(() => format(subMonths(new Date(), 1), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));

  // Computed range
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (filterType === "month") {
      const baseDate = parseISO(`${selectedMonth}-01`);
      return {
        rangeStart: format(startOfMonth(baseDate), "yyyy-MM-dd"),
        rangeEnd: format(endOfMonth(baseDate), "yyyy-MM-dd"),
      };
    }
    return { rangeStart: startDate, rangeEnd: endDate };
  }, [filterType, selectedMonth, startDate, endDate]);

  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = subMonths(now, i);
      options.push({
        value: format(d, "yyyy-MM"),
        label: format(d, "MMMM yyyy", { locale: ptBR }),
      });
    }
    return options;
  }, []);

  const projectionQ = useQuery({
    queryKey: ["financial_cash_projection", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 120_000,
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

  const txQ = useQuery({
    queryKey: ["financial_transactions_control_tower", activeTenantId, rangeStart, rangeEnd],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("id,amount,type,transaction_date,category_id")
        .eq("tenant_id", activeTenantId!)
        .gte("transaction_date", rangeStart)
        .lte("transaction_date", rangeEnd)
        .order("transaction_date", { ascending: true })
        .limit(50000);
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

  const pendingQ = useQuery({
    queryKey: ["financial_pending_control_tower", activeTenantId, rangeStart, rangeEnd],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const [resP, resR] = await Promise.all([
        supabase
          .from("financial_payables")
          .select("amount, category_id, due_date")
          .eq("tenant_id", activeTenantId!)
          .eq("status", "pending")
          .gte("due_date", rangeStart)
          .lte("due_date", rangeEnd),
        supabase
          .from("financial_receivables")
          .select("amount, category_id, due_date")
          .eq("tenant_id", activeTenantId!)
          .eq("status", "pending")
          .gte("due_date", rangeStart)
          .lte("due_date", rangeEnd),
      ]);
      if (resP.error) throw resP.error;
      if (resR.error) throw resR.error;
      return {
        payables: resP.data ?? [],
        receivables: resR.data ?? [],
      };
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
    let rev = 0;
    let cost = 0;

    // 1. Transactions (Actual Cash Flow)
    for (const t of txQ.data ?? []) {
      const d = String(t.transaction_date ?? "");
      if (!d || d < rangeStart || d > rangeEnd) continue;
      const catId = t.category_id as string | null;
      if (!catId) continue;

      const ctype = categoryTypeById.get(catId) ?? "other";
      const amt = Number(t.amount ?? 0);
      const typ = String(t.type ?? "");

      // Revenue: Credit adds, Debit subtracts. Costs: Debit adds, Credit subtracts.
      if (ctype === "revenue") {
        rev += (typ === "credit" ? amt : -amt);
      } else if (ctype !== "other") {
        cost += (typ === "debit" ? amt : -amt);
      }
    }

    // 2. Pending Items (Forward Projection) - To match DRE "Realized" column
    const pending = pendingQ.data || { payables: [], receivables: [] };
    for (const p of pending.payables) {
      const ctype = categoryTypeById.get(p.category_id) ?? "other";
      const amt = Number(p.amount);
      if (ctype === "revenue") rev -= amt;
      else if (ctype !== "other") cost += amt;
    }
    for (const r of pending.receivables) {
      const ctype = categoryTypeById.get(r.category_id) ?? "other";
      const amt = Number(r.amount);
      if (ctype === "revenue") rev += amt;
      else if (ctype !== "other") cost -= amt;
    }

    const m = rev > 0 ? (rev - cost) / rev : NaN;

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
      else if (ctype !== "other") bCost += expected;
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
  }, [txQ.data, pendingQ.data, rangeStart, rangeEnd, categoryTypeById, budgetsQ.data]);

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

    const days = daysBetweenIso(rangeStart, rangeEnd);
    const out: Array<{ day: string; net: number }> = [];
    for (let i = 0; i <= days; i++) {
      const d = addDaysIso(rangeStart, i);
      out.push({ day: d.slice(5), net: Number((byDay.get(d) ?? 0).toFixed(2)) });
    }
    return out;
  }, [txQ.data, rangeStart, rangeEnd]);

  const runwayDays = useMemo(() => {
    const projected = Number(projectionQ.data?.projected_balance ?? 0);
    if (!Number.isFinite(projected) || projected <= 0) return null;

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
    return [
      { name: "Atual", current: kpi.current, projected: null },
      { name: "Projetado", current: null, projected: kpi.projected },
    ];
  }, [kpi.current, kpi.projected]);

  return (
    <div className="flex flex-col gap-6">
      {/* Filters Toolbar */}
      <Card className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Filtrar por:</span>
          </div>
          
          <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
            <SelectTrigger className="h-10 w-[140px] rounded-2xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Mês</SelectItem>
              <SelectItem value="period">Período personalizado</SelectItem>
            </SelectContent>
          </Select>

          {filterType === "month" ? (
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-10 w-[180px] rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-2">
              <div className="grid gap-1">
                <Input
                  type="date"
                  className="h-10 w-[140px] rounded-2xl"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <span className="text-slate-400">até</span>
              <div className="grid gap-1">
                <Input
                  type="date"
                  className="h-10 w-[140px] rounded-2xl"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            className="h-10 rounded-2xl px-6"
            onClick={() => {
              projectionQ.refetch();
              txQ.refetch();
              budgetsQ.refetch();
            }}
            disabled={!activeTenantId || txQ.isFetching}
          >
            {txQ.isFetching ? "Atualizando..." : "Atualizar"}
          </Button>
          <Link to="/app/finance/ledger?tab=dre">
            <Button variant="outline" className="h-10 rounded-2xl border-[hsl(var(--byfrost-accent)/0.3)] bg-[hsl(var(--byfrost-accent)/0.05)] px-6 text-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.1)]">
              <LineChartIcon className="mr-2 h-4 w-4" />
              DRE-Caixa
            </Button>
          </Link>
        </div>
      </Card>

      <div className="grid gap-4">
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
            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Margem (período)</div>
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
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Orçado vs Realizado</div>
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
                Net (créditos - débitos) • período selecionado
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
      </div>

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
