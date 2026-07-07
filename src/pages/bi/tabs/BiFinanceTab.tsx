import { KpiCard } from "../components/KpiCard";
import { ArrowDownUp, Coins, PiggyBank, TrendingUp, TrendingDown, Store } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useMemo } from "react";
import { DateRange } from "react-day-picker";
import { Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, ComposedChart, Line } from "recharts";
import { format, eachDayOfInterval, eachMonthOfInterval, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface BiFinanceTabProps {
  dateRange?: DateRange;
}

// Subcomponent for Top 10 lists
function TopList({ title, icon: Icon, data, colorClass, totalValue }: { title: string, icon: any, data: any[], colorClass: string, totalValue: number }) {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-6">
        <div className={`p-2 rounded-xl bg-slate-100 dark:bg-slate-900 ${colorClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
      </div>
      <div className="flex-1 space-y-4">
        {data.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-8">Nenhum dado encontrado no período.</div>
        ) : (
          data.map((item, i) => {
            const percent = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
            return (
              <div key={i} className="group flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200 truncate pr-4" title={item.name}>
                    {i + 1}. {item.name}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div 
                    className={cn("h-full rounded-full transition-all duration-500", colorClass.replace("text-", "bg-").split(" ")[0])}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  );
}

export function BiFinanceTab({ dateRange }: BiFinanceTabProps) {
  const { activeTenantId } = useTenant();

  const { data: finData, isLoading } = useQuery({
    queryKey: ["bi_extrato_completo", activeTenantId, dateRange],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("financial_transactions")
        .select(`
          id, amount, type, transaction_date,
          financial_categories(name),
          core_entities(display_name)
        `)
        .eq("tenant_id", activeTenantId!);

      if (dateRange?.from) q = q.gte("transaction_date", dateRange.from.toISOString());
      if (dateRange?.to) {
        const endDay = new Date(dateRange.to);
        endDay.setHours(23, 59, 59, 999);
        q = q.lte("transaction_date", endDay.toISOString());
      }

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    }
  });

  const {
    totalReceitas,
    totalDespesas,
    saldoPeriodo,
    topEntradas,
    topCustos,
    topFornecedores,
    chartData
  } = useMemo(() => {
    if (!finData) {
      return {
        totalReceitas: 0,
        totalDespesas: 0,
        saldoPeriodo: 0,
        topEntradas: [],
        topCustos: [],
        topFornecedores: [],
        chartData: []
      };
    }

    let recSum = 0;
    let despSum = 0;

    const catEntradasMap = new Map<string, number>();
    const catCustosMap = new Map<string, number>();
    const fornMap = new Map<string, number>();
    
    const isMonthly = dateRange?.from && dateRange?.to ? differenceInDays(dateRange.to, dateRange.from) > 60 : true;
    const timeMap = new Map<string, { name: string, entrada: number, saida: number, saldoAcumulado: number, dt: Date }>();
    
    if (dateRange?.from) {
      const start = dateRange.from;
      const end = dateRange.to || new Date();
      if (isMonthly) {
        eachMonthOfInterval({ start, end }).forEach(m => {
          const k = format(m, "yyyy-MM");
          const name = format(m, "MMM/yy", { locale: ptBR });
          timeMap.set(k, { name: name.charAt(0).toUpperCase() + name.slice(1), entrada: 0, saida: 0, saldoAcumulado: 0, dt: m });
        });
      } else {
        eachDayOfInterval({ start, end }).forEach(d => {
          const k = format(d, "yyyy-MM-dd");
          const name = format(d, "dd MMM", { locale: ptBR });
          timeMap.set(k, { name, entrada: 0, saida: 0, saldoAcumulado: 0, dt: d });
        });
      }
    }

    finData.forEach(t => {
      const val = Number(t.amount || 0);
      const isCredit = t.type === "credit";
      const catName = (t.financial_categories as any)?.name || "Sem Categoria";
      const entName = (t.core_entities as any)?.display_name || "Diversos / Não Informado";

      if (isCredit) {
        recSum += val;
        catEntradasMap.set(catName, (catEntradasMap.get(catName) || 0) + val);
      } else {
        despSum += val;
        catCustosMap.set(catName, (catCustosMap.get(catName) || 0) + val);
        fornMap.set(entName, (fornMap.get(entName) || 0) + val);
      }

      const d = new Date(t.transaction_date || Date.now());
      const k = isMonthly ? format(d, "yyyy-MM") : format(d, "yyyy-MM-dd");
      
      if (dateRange?.from && !timeMap.has(k)) {
        return;
      }
      
      if (!timeMap.has(k)) {
         const name = isMonthly ? format(d, "MMM/yy", { locale: ptBR }) : format(d, "dd MMM", { locale: ptBR });
         timeMap.set(k, { name, entrada: 0, saida: 0, saldoAcumulado: 0, dt: d });
      }
      
      const p = timeMap.get(k)!;
      if (isCredit) p.entrada += val;
      else p.saida += val;
    });

    const saldo = recSum - despSum;

    const toSortedTop10 = (m: Map<string, number>) => {
      return Array.from(m.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
    };

    const chartArr = Array.from(timeMap.values()).sort((a, b) => a.dt.getTime() - b.dt.getTime());
    let runningSaldo = 0;
    chartArr.forEach(c => {
      runningSaldo += (c.entrada - c.saida);
      c.saldoAcumulado = runningSaldo;
    });

    return {
      totalReceitas: recSum,
      totalDespesas: despSum,
      saldoPeriodo: saldo,
      topEntradas: toSortedTop10(catEntradasMap),
      topCustos: toSortedTop10(catCustosMap),
      topFornecedores: toSortedTop10(fornMap),
      chartData: chartArr
    };
  }, [finData, dateRange]);

  const margem = totalReceitas > 0 ? (saldoPeriodo / totalReceitas) * 100 : 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard 
          title="Saldo do Período" 
          value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoPeriodo)} 
          icon={PiggyBank} 
          className={saldoPeriodo >= 0 ? "text-emerald-500" : "text-rose-500"}
          tooltipContext="Soma das Entradas menos a soma das Saídas no período filtrado."
        />
        <KpiCard 
          title="Total Entradas" 
          value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalReceitas)} 
          icon={TrendingUp} 
          className="text-blue-500" 
          tooltipContext="Soma de todas as transações financeiras categorizadas como entrada ou receita no período."
        />
        <KpiCard 
          title="Total Saídas" 
          value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDespesas)} 
          icon={TrendingDown} 
          className="text-rose-500" 
          tooltipContext="Soma de todas as transações financeiras categorizadas como saída ou despesa no período."
        />
        <KpiCard 
          title="Margem Livre (Caixa)" 
          value={`${margem.toFixed(1)}%`} 
          icon={Coins} 
          className={margem >= 0 ? "text-emerald-500" : "text-amber-500"}
          tooltipContext="Percentual do saldo restante em relação ao total de entradas (Saldo / Entradas)."
        />
      </div>

      <div className="rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Fluxo de Caixa (Descasamento)</h3>
            <p className="text-sm text-slate-500">
              Cruza o que entrou contra o que saiu no tempo, revelando picos de despesa e saldo acumulado.
            </p>
          </div>
        </div>
        <div className="h-[350px] w-full mt-6">
          {isLoading ? (
             <div className="w-full h-full flex items-center justify-center text-slate-400">Carregando fluxo...</div>
          ) : chartData.length === 0 ? (
             <div className="w-full h-full flex items-center justify-center text-slate-400">Nenhum dado no período.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 12 }} className="text-slate-500 dark:text-slate-400" dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 12 }} className="text-slate-500 dark:text-slate-400" tickFormatter={(val) => `R$${val/1000}k`} />
                
                <Tooltip 
                  cursor={{ fill: 'currentColor', opacity: 0.05 }} 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} 
                  wrapperClassName="dark:text-slate-800"
                  formatter={(value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                />
                <Legend iconType="circle" />
                
                <Bar yAxisId="left" dataKey="entrada" name="Entradas" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar yAxisId="left" dataKey="saida" name="Saídas" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Line yAxisId="left" type="monotone" dataKey="saldoAcumulado" name="Saldo Acum. (Movimento)" stroke="#10b981" strokeWidth={3} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <TopList 
          title="Top 10 Custos" 
          icon={ArrowDownUp} 
          data={topCustos} 
          colorClass="text-rose-500"
          totalValue={totalDespesas}
        />
        <TopList 
          title="Top 10 Entradas" 
          icon={TrendingUp} 
          data={topEntradas} 
          colorClass="text-blue-500"
          totalValue={totalReceitas}
        />
        <TopList 
          title="Top 10 Fornecedores" 
          icon={Store} 
          data={topFornecedores} 
          colorClass="text-amber-500"
          totalValue={totalDespesas}
        />
      </div>
    </div>
  );
}
