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
  const [timeRange, setTimeRange] = useState("week"); // week, day, hour, minute

  const { data, isLoading, isPlaceholderData, error, refetch } = useQuery({
    queryKey: ["admin_supabase_usage", timeRange],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-supabase-usage", {
        queryParams: { range: timeRange }
      });
      if (error) throw error;
      if (!data.ok) throw new Error(data.error || "Erro ao buscar dados");
      return data;
    },
    staleTime: 1000 * 30, // 30 seconds
    placeholderData: (previousData) => previousData,
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
  const egressMetrics = data?.egress_metrics || [];
  
  // Debug to console
  if (egressMetrics.length > 0) {
    console.log("[SupabaseUsage] Egress Metrics Received:", egressMetrics);
  }

  // Filter by selected months
  const stats = allStats.slice(-months);
  const current = allStats[allStats.length - 1] || {};

  const chartConfig = {
    egress: {
      label: "Largura de Banda",
      color: "hsl(var(--primary))",
    },
    daily: {
      label: "Consumo de Banda",
      color: "hsl(var(--byfrost-accent))",
    }
  };

  const formatUsage = (val: number | undefined) => {
    if (val === undefined || val === null || isNaN(val)) return "0.0 MB";
    if (val < 0.1 && val > 0) {
      return `${(val * 1024).toFixed(1)} MB`;
    }
    if (val >= 0.1) {
      return `${val.toFixed(3)} GB`;
    }
    return "0.0 MB";
  };

  const totalEgress = egressMetrics.reduce((acc: number, m: any) => {
    const val = typeof m.egress_gb === 'number' ? m.egress_gb : parseFloat(m.egress_gb || "0");
    return acc + val;
  }, 0);

  const formatTime = (timeStr: string) => {
    try {
      const d = new Date(typeof timeStr === 'number' ? timeStr / 1000 : timeStr);
      if (timeRange === "week") return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (timeRange === "day") return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (timeRange === "hour") return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (timeRange === "minute") return d.toLocaleTimeString('pt-BR', { minute: '2-digit', second: '2-digit' });
      return d.toLocaleString();
    } catch {
      return timeStr;
    }
  };

  const rangeLabels: Record<string, string> = {
    week: "Última Semana",
    day: "Último Dia",
    hour: "Última Hora",
    minute: "Último Minuto"
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
          {data?.timestamp && (
            <span className="text-[10px] text-muted-foreground bg-slate-100 px-2 py-1 rounded-lg">
              Sincronizado: {new Date(data.timestamp).toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="gap-2 h-9 rounded-2xl"
          >
            <RefreshCcw className={`h-4 w-4 ${isRefreshing || isLoading ? "animate-spin" : ""}`} />
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
            <div className="text-2xl font-bold">{formatUsage(current.db_size_gb)}</div>
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
            <div className="text-2xl font-bold">{formatUsage(current.storage_size_gb)}</div>
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
              Egress no Período
            </CardTitle>
            <Activity className="h-4 w-4 text-[hsl(var(--byfrost-accent))]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(var(--byfrost-accent))]">
              {formatUsage(totalEgress)}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Total em {rangeLabels[timeRange]}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Real-time Monitoring Chart */}
        <Card className="border-none bg-white/50 shadow-sm dark:bg-slate-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[hsl(var(--byfrost-accent))]" />
              <div>
                <CardTitle>Monitoramento em Tempo Real</CardTitle>
                <CardDescription>Tráfego de Storage por {timeRange}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-950">
              {["week", "day", "hour", "minute"].map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={cn(
                    "px-2 py-1 text-[9px] font-bold uppercase transition-all rounded-lg",
                    timeRange === r 
                      ? "bg-[hsl(var(--byfrost-accent))] text-white shadow-sm" 
                      : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  {r === "week" ? "Sem" : r === "day" ? "Dia" : r === "hour" ? "Hora" : "Min"}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full pt-4 relative">
              {egressMetrics.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 rounded-xl m-4">
                  <BarChart3 className="h-10 w-10 text-slate-300 mb-2" />
                  <p className="text-sm font-medium text-slate-500">Nenhum dado encontrado</p>
                  <p className="text-[11px] text-slate-400">Não houve tráfego de storage neste período ({rangeLabels[timeRange]}).</p>
                </div>
              ) : (
                <ChartContainer config={chartConfig}>
                  <BarChart data={[...egressMetrics].reverse()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="time"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
                      tickFormatter={formatTime}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
                      tickFormatter={(val) => formatUsage(val)}
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
              )}
            </div>
          </CardContent>
        </Card>


        {/* Monthly Bandwidth Chart */}
        <Card className="border-none bg-white/50 shadow-sm dark:bg-slate-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
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
                    tickFormatter={(val) => formatUsage(val)}
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
          O gráfico em tempo real usa logs de borda. Você pode filtrar por granularidade (Semana, Dia, Hora, Minuto). 
          Isso é essencial para detectar picos repentinos de consumo no Storage.
        </p>
      </div>
    </div>
  );
}
