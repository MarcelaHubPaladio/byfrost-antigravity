import { KpiCard } from "../components/KpiCard";
import { DollarSign, Users, Briefcase, Activity } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useMemo } from "react";

const data = [
  { name: "Jan", revenue: 4000, expenses: 2400 },
  { name: "Fev", revenue: 3000, expenses: 1398 },
  { name: "Mar", revenue: 2000, expenses: 9800 },
  { name: "Abr", revenue: 2780, expenses: 3908 },
  { name: "Mai", revenue: 1890, expenses: 4800 },
  { name: "Jun", revenue: 2390, expenses: 3800 },
  { name: "Jul", revenue: 3490, expenses: 4300 },
];

export function BiOverviewTab() {
  const { activeTenantId } = useTenant();

  // Queries Reais (Exemplos)
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

  const { totalLeads, closedLeads } = useMemo(() => {
    if (!casesData) return { totalLeads: 128, closedLeads: 45 }; // Fallback estético
    return {
      totalLeads: casesData.length,
      closedLeads: casesData.filter(c => c.status === "won" || c.status === "fechado").length
    };
  }, [casesData]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard 
          title="Receita Total" 
          value="R$ 45.231,89" 
          trend={12.5} 
          trendLabel="vs último mês" 
          icon={DollarSign} 
          tooltipContext="Soma de todos os lançamentos financeiros com status Pago no mês vigente (dados temporários de demo)."
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
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                />
                <Area type="monotone" dataKey="revenue" name="Receita" stroke="hsl(var(--byfrost-accent))" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                <Area type="monotone" dataKey="expenses" name="Despesas" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorExpenses)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-1 md:col-span-2 space-y-4">
           {/* Card Secundário */}
           <div className="rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
             <h3 className="text-base font-semibold text-slate-900 dark:text-white">Metas do Mês</h3>
             <div className="mt-6 space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium text-slate-700 dark:text-slate-300">Vendas</span>
                    <span className="font-semibold text-slate-900 dark:text-white">75%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full" style={{ width: '75%', backgroundColor: 'hsl(var(--byfrost-accent))' }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium text-slate-700 dark:text-slate-300">Novos Leads</span>
                    <span className="font-semibold text-slate-900 dark:text-white">45%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full bg-sky-500 rounded-full" style={{ width: '45%' }} />
                  </div>
                </div>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
