import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  }

  const allStats = data?.stats || [];
  // Filter by selected months
  const stats = allStats.slice(-months);
  const current = allStats[allStats.length - 1] || {};

  const chartConfig = {
    egress: {
      label: "Largura de Banda (GB)",
      color: "hsl(var(--primary))",
    },
  };

  const formatGb = (val: number | undefined) => {
    if (typeof val !== 'number') return "0.000";
    return val.toFixed(3);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Status do Supabase</h2>
          <p className="text-sm text-muted-foreground">
            Monitoramento de infraestrutura e consumo (Project Ref: {data?.projectRef})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/50 p-1 dark:border-slate-800 dark:bg-slate-950/50">
            {[3, 6, 12].map((m) => (
              <button
                key={m}
                onClick={() => setMonths(m)}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold uppercase transition-all rounded-xl",
                  months === m 
                    ? "bg-[hsl(var(--byfrost-accent))] text-white shadow-sm" 
                    : "text-slate-500 hover:bg-slate-100"
                )}
              >
                {m} Meses
              </button>
            ))}
          </div>
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
              Storage
            </CardTitle>
            <HardDrive className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatGb(current.storage_size_gb)} GB</div>
            <p className="text-[10px] text-muted-foreground">Arquivos e mídia</p>
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

        <Card className="overflow-hidden border-none bg-white/50 shadow-sm transition-all hover:shadow-md dark:bg-slate-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Edge Functions
            </CardTitle>
            <Zap className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(current.edge_functions_invocations || 0).toLocaleString()}</div>
            <p className="text-[10px] text-muted-foreground">Chamadas neste período</p>
          </CardContent>
        </Card>
      </div>

      {/* Bandwidth Chart */}
      <Card className="border-none bg-white/50 shadow-sm dark:bg-slate-900/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-500" />
            <div>
              <CardTitle>Consumo de Banda (Egress)</CardTitle>
              <CardDescription>Consumo de saída de dados em GB por período</CardDescription>
            </div>
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
                  tickFormatter={(val) => `${val}GB`}
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

      <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
        <p>
          <strong>Nota:</strong> Os dados de consumo são obtidos diretamente da API de Gerenciamento do Supabase. 
          O gráfico mostra o consumo total acumulado de cada mês (Egress). 
          O consumo pode levar alguns minutos para ser refletido após uma requisição de atualização.
        </p>
      </div>
    </div>
  );
}
