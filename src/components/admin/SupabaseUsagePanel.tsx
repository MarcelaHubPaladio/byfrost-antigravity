import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Activity,
  Database,
  HardDrive,
  Users,
  Zap,
  RefreshCcw,
  AlertCircle,
  BarChart3,
} from "lucide-react";
import { showError } from "@/utils/toast";

export function SupabaseUsagePanel() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [months, setMonths] = useState(6);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin_supabase_usage"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-supabase-usage");
      if (error) throw error;
      if (!data.ok) throw new Error(data.error || "Erro ao buscar dados");
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } catch (e: any) {
      showError(e.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCcw className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-rose-100 bg-rose-50/30 p-12 text-center">
        <AlertCircle className="h-12 w-12 text-rose-500" />
        <div className="space-y-1">
          <h3 className="font-semibold text-rose-900">Falha ao carregar métricas</h3>
          <p className="text-sm text-rose-700">
            {(error as any).message || "Verifique se a Edge Function está implantada e o token configurado."}
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh}>
          Tentar novamente
        </Button>
      </div>
    );
  }  const allStats = data?.stats || [];
  const dailyEgress = data?.daily_egress || [];
  
  // Filter by selected months
  const stats = allStats.slice(-months);
  const current = allStats[allStats.length - 1] || {};

  const chartConfig = {
    egress: {
      label: "Largura de Banda (GB)",
      color: "hsl(var(--primary))",
    },
    daily: {
      label: "Consumo Diário (GB)",
      color: "hsl(var(--byfrost-accent))",
    }
  };

  const formatGb = (val: number | undefined) => {
    if (typeof val !== 'number') return "0.000";
    return val.toFixed(3);
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Status do Supabase</h2>
          <p className="text-sm text-muted-foreground">
            Monitoramento de infraestrutura e consumo (Project Ref: {data?.projectRef})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2 h-9 rounded-2xl"
          >
            <RefreshCcw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="overflow-hidden border-none bg-white/50 shadow-sm transition-all hover:shadow-md dark:bg-slate-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Banco de Dados
            </CardTitle>
            <Database className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatGb(current.db_size_gb)} GB</div>
            <p className="text-[10px] text-muted-foreground">Tamanho atual do banco</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-none bg-white/50 shadow-sm transition-all hover:shadow-md dark:bg-slate-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Storage (Total)
            </CardTitle>
            <HardDrive className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatGb(current.storage_size_gb)} GB</div>
            <p className="text-[10px] text-muted-foreground">Arquivos e mídia armazenados</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-none bg-white/50 shadow-sm transition-all hover:shadow-md dark:bg-slate-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Usuários (Auth)
            </CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{current.auth_users || 0}</div>
            <p className="text-[10px] text-muted-foreground">Total de contas criadas</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-none bg-[hsl(var(--byfrost-accent)/0.05)] border-[hsl(var(--byfrost-accent)/0.1)] shadow-sm transition-all hover:shadow-md dark:bg-slate-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--byfrost-accent))]">
              Egress Hoje (Logs)
            </CardTitle>
            <Activity className="h-4 w-4 text-[hsl(var(--byfrost-accent))]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(var(--byfrost-accent))]">
              {formatGb(dailyEgress[0]?.egress_gb)} GB
            </div>
            <p className="text-[10px] text-muted-foreground">{dailyEgress[0]?.requests || 0} requisições de storage</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Monitoring Chart */}
        <Card className="border-none bg-white/50 shadow-sm dark:bg-slate-900/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[hsl(var(--byfrost-accent))]" />
              <div>
                <CardTitle>Monitoramento Diário</CardTitle>
                <CardDescription>Consumo de banda (Storage) nos últimos 7 dias</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full pt-4">
              <ChartContainer config={chartConfig}>
                <BarChart data={[...dailyEgress].reverse()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
                    tickFormatter={formatDate}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
                    tickFormatter={(val) => `${val.toFixed(2)}GB`}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="egress_gb"
                    radius={[4, 4, 0, 0]}
                    fill="hsl(var(--byfrost-accent))"
                    barSize={40}
                  />
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Bandwidth Chart */}
        <Card className="border-none bg-white/50 shadow-sm dark:bg-slate-900/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-500" />
              <div>
                <CardTitle>Consumo Mensal (Oficial)</CardTitle>
                <CardDescription>Banda total acumulada por mês</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-950">
              {[3, 6, 12].map((m) => (
                <button
                  key={m}
                  onClick={() => setMonths(m)}
                  className={cn(
                    "px-2 py-1 text-[9px] font-bold uppercase transition-all rounded-lg",
                    months === m 
                      ? "bg-slate-100 text-slate-900 shadow-sm" 
                      : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  {m}M
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full pt-4">
              <ChartContainer config={chartConfig}>
                <BarChart data={stats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="periodLabel"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
                    tickFormatter={(val) => `${val.toFixed(1)}GB`}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="egress_gb"
                    radius={[4, 4, 0, 0]}
                    fill="var(--color-egress)"
                    barSize={40}
                  >
                    {stats.map((entry: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fillOpacity={index === stats.length - 1 ? 1 : 0.6}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
        <p className="flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          <strong>Nota sobre o Monitoramento:</strong> 
          O gráfico diário é calculado em tempo real a partir dos logs de borda (Edge Logs) do Supabase. 
          Isso permite identificar picos de consumo de arquivos do Storage imediatamente. 
          O gráfico mensal depende da API de Gerenciamento do Supabase e pode ter atrasos de até 24h.
        </p>
      </div>
    </div>
  );
}
