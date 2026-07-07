import { KpiCard } from "../components/KpiCard";
import { DollarSign, Users, Briefcase, Activity, Sparkles, Brain, Loader2 } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export function BiOverviewTab() {
  const { activeTenantId } = useTenant();

  // Queries Reais (Casos/Leads)
  const { data: casesData } = useQuery({
    queryKey: ["bi_cases_overview", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, status, created_at")
        .eq("tenant_id", activeTenantId!);
      if (error) throw error;
      return data || [];
    }
  });

  // Queries Reais (Finanças)
  const { data: finData } = useQuery({
    queryKey: ["bi_fin_overview", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("id, amount, type, transaction_date, status")
        .eq("tenant_id", activeTenantId!);
      if (error) throw error;
      return data || [];
    }
  });

  // Insights do Guardião
  const { data: insightsData, isLoading: isLoadingInsights } = useQuery({
    queryKey: ["bi_guardiao_insights", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guardiao_insights")
        .select("insights_json, created_at")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  });

  const { totalLeads, closedLeads } = useMemo(() => {
    if (!casesData) return { totalLeads: 0, closedLeads: 0 }; 
    return {
      totalLeads: casesData.length,
      closedLeads: casesData.filter(c => c.status === "won" || c.status === "fechado").length
    };
  }, [casesData]);

  const { totalRevenue, chartData } = useMemo(() => {
    if (!finData) return { totalRevenue: 0, chartData: [] };

    // Gráfico de Receita vs Despesa Histórico
    const monthMap: Record<string, { name: string; revenue: number; expenses: number }> = {};
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    
    // Inicializar os últimos 6 meses até o atual para ficar bonito
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      monthMap[k] = { name: months[d.getMonth()], revenue: 0, expenses: 0 };
    }

    let revenueSum = 0;

    finData.forEach(t => {
      // KPI de Receita Mensal: somamos apenas as receitas que estão "paid" no mês atual
      const d = new Date(t.transaction_date || Date.now());
      const k = `${d.getFullYear()}-${d.getMonth()}`;

      if (d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()) {
        if (t.type === "credit" && t.status === "paid") {
          revenueSum += Number(t.amount);
        }
      }

      // Adicionamos no chart, independentemente do status para dar volume de fluxo (ou só paid)
      if (monthMap[k]) {
        if (t.type === "credit") monthMap[k].revenue += Number(t.amount);
        if (t.type === "debit") monthMap[k].expenses += Number(t.amount);
      }
    });

    return {
      totalRevenue: revenueSum,
      chartData: Object.values(monthMap)
    };
  }, [finData]);

  const guardiaoList = (insightsData?.insights_json as any[]) || [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard 
          title="Receita Total" 
          value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRevenue)} 
          trend={0} 
          trendLabel="Mês Atual" 
          icon={DollarSign} 
          tooltipContext="Soma real de todos os lançamentos de Crédito (Receitas) com status 'Pago' dentro do mês corrente."
        />
        <KpiCard 
          title="Novos Clientes" 
          value={String(totalLeads)} 
          trend={8.2} 
          trendLabel="vs último mês" 
          icon={Users} 
          tooltipContext="Total de Casos (Leads) capturados neste Tenant somando todos os canais de aquisição."
        />
        <KpiCard 
          title="Negócios Fechados" 
          value={String(closedLeads)} 
          trend={-2.4} 
          trendLabel="vs último mês" 
          icon={Briefcase} 
          tooltipContext="Soma de todos os Casos (Leads) que tiveram o status alterado para 'Fechado' ou 'Ganho'."
        />
        <KpiCard 
          title="Membros Ativos" 
          value="2.405" 
          trend={14.6} 
          trendLabel="vs último mês" 
          icon={Activity} 
          tooltipContext="Usuários que realizaram ao menos 1 login na plataforma nos últimos 30 dias."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        <div className="col-span-1 md:col-span-5 rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Desempenho Geral</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Receitas vs Despesas (Últimos 7 meses)</p>
          </div>
          
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--byfrost-accent))" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="hsl(var(--byfrost-accent))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'currentColor', fontSize: 12 }} 
                  className="text-slate-500 dark:text-slate-400" 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'currentColor', fontSize: 12 }} 
                  className="text-slate-500 dark:text-slate-400"
                  tickFormatter={(val) => `R$ ${val / 1000}k`}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: '#0f172a', fontWeight: 500 }}
                  formatter={(val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)}
                />
                <Area type="monotone" dataKey="revenue" name="Receita" stroke="hsl(var(--byfrost-accent))" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                <Area type="monotone" dataKey="expenses" name="Despesas" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorExpenses)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-1 md:col-span-2 space-y-4 flex flex-col">
           {/* Guardião do Negócio IA */}
           <div className="flex-1 rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40 overflow-hidden flex flex-col">
             <div className="flex items-center gap-2 mb-4">
               <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400">
                  <Brain className="h-5 w-5" />
               </div>
               <div>
                 <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                   Guardião do Negócio
                   <Sparkles className="h-4 w-4 text-amber-500" />
                 </h3>
                 <p className="text-xs text-slate-500">Inteligência Artificial (Insights globais)</p>
               </div>
             </div>

             <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {isLoadingInsights ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mb-2" />
                    <span className="text-sm">Analisando métricas...</span>
                  </div>
                ) : guardiaoList.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center">
                    <p className="text-sm">Nenhuma análise recente do Guardião encontrada.</p>
                  </div>
                ) : (
                  guardiaoList.map((item, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.title}</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{item.description}</p>
                    </div>
                  ))
                )}
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
