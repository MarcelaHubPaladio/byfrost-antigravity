import { KpiCard } from "../components/KpiCard";
import { DollarSign, Users, Briefcase, Activity, Sparkles, Brain, Loader2, PieChart } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useMemo, useState } from "react";
import { DateRange } from "react-day-picker";
import { eachMonthOfInterval, format, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BiOverviewTabProps {
  dateRange?: DateRange;
}

export function BiOverviewTab({ dateRange }: BiOverviewTabProps) {
  const { activeTenantId } = useTenant();

  // Queries Reais (Orders / Negócios / Clientes vinculados)
  const { data: ordersData } = useQuery({
    queryKey: ["bi_orders_and_customers", activeTenantId, dateRange],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("cases")
        .select(`
          id, status, state, customer_id, created_at, 
          journeys!inner(key)
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("journeys.key", "orders");
      
      if (dateRange?.from) q = q.gte("created_at", dateRange.from.toISOString());
      if (dateRange?.to) {
        const endDay = new Date(dateRange.to);
        endDay.setHours(23, 59, 59, 999);
        q = q.lte("created_at", endDay.toISOString());
      }

      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) return [];

      const caseIds = data.map((c: any) => c.id);
      const CHUNK_SIZE = 100;
      const chunks: string[][] = [];
      for (let i = 0; i < caseIds.length; i += CHUNK_SIZE) {
        chunks.push(caseIds.slice(i, i + CHUNK_SIZE));
      }

      const allFields: any[] = [];
      const allItems: any[] = [];

      await Promise.all(chunks.map(async (chunk) => {
        const [fRes, iRes] = await Promise.all([
          supabase
            .from("case_fields")
            .select("case_id,key,value_text")
            .in("case_id", chunk)
            .in("key", ["billing_status", "partial_paid_value", "total_value_raw"]),
          supabase
            .from("case_items")
            .select("case_id,total")
            .in("case_id", chunk)
        ]);
        if (fRes.data) allFields.push(...fRes.data);
        if (iRes.data) allItems.push(...iRes.data);
      }));

      const fieldMap = new Map<string, any[]>();
      const itemMap = new Map<string, any[]>();
      
      allFields.forEach(f => {
        if (!fieldMap.has(f.case_id)) fieldMap.set(f.case_id, []);
        fieldMap.get(f.case_id)!.push(f);
      });
      
      allItems.forEach(i => {
        if (!itemMap.has(i.case_id)) itemMap.set(i.case_id, []);
        itemMap.get(i.case_id)!.push(i);
      });

      return data.map((c: any) => ({
        ...c,
        case_fields: fieldMap.get(c.id) || [],
        case_items: itemMap.get(c.id) || []
      }));
    }
  });

  // Queries Reais (Finanças)
  const { data: finData } = useQuery({
    queryKey: ["bi_fin_overview", activeTenantId, dateRange],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("financial_transactions")
        .select("id, amount, type, transaction_date, status, category_id")
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

  // Dados financeiros calculados em useMemo já cobrem o resto

  const { revenueSum, expensesSum, monthMap } = useMemo(() => {
    if (!finData) return { revenueSum: 0, expensesSum: 0, monthMap: {} as Record<string, { name: string; revenue: number; expenses: number; invoiced: number }> };

    const monthMap: Record<string, { name: string; revenue: number; expenses: number }> = {};
    
    // Gerar chaves dos meses no intervalo escolhido
    if (dateRange?.from) {
      const start = dateRange.from;
      const end = dateRange.to || new Date();
      
      try {
        const monthsInInterval = eachMonthOfInterval({ start, end });
        monthsInInterval.forEach(m => {
          const k = format(m, "yyyy-MM");
        const name = format(m, "MMM", { locale: ptBR });
        monthMap[k] = { name: name.charAt(0).toUpperCase() + name.slice(1), revenue: 0, expenses: 0, invoiced: 0 };
      });
    } catch (e) {
      console.warn("Invalid interval", e);
    }
  }

  let revenueSum = 0;
  let expensesSum = 0;

  finData.forEach(t => {
    const d = new Date(t.transaction_date || Date.now());
    const k = format(d, "yyyy-MM");

    const isCategorized = t.category_id !== null && t.category_id !== undefined;
    const isConciliated = t.status === "reconciled" || t.status === "conciled" || t.status === "conciliado";

    if (t.type === "credit" && isCategorized && !isConciliated) {
      revenueSum += Number(t.amount);
    }
    if (t.type === "debit" && isCategorized && !isConciliated) {
      expensesSum += Number(t.amount);
    }

    if (!monthMap[k]) {
      const name = format(d, "MMM", { locale: ptBR });
      monthMap[k] = { name: name.charAt(0).toUpperCase() + name.slice(1), revenue: 0, expenses: 0, invoiced: 0 };
    }
    if (t.type === "credit") monthMap[k].revenue += Number(t.amount);
    if (t.type === "debit") monthMap[k].expenses += Number(t.amount);
  });

  return { revenueSum, expensesSum, monthMap };
}, [finData, dateRange]);

const { totalCustomers, totalClosedOrders, totalValueOrders, invoicedValueOrders, monthMapWithOrders } = useMemo(() => {
  const map = { ...monthMap };
  if (!ordersData) return { totalCustomers: 0, totalClosedOrders: 0, totalValueOrders: 0, invoicedValueOrders: 0, monthMapWithOrders: map };
  
  let totalVal = 0;
  let invoicedVal = 0;
  let closedCount = 0;

  const uniqueCustomers = new Set(ordersData.map((o: any) => o.customer_id).filter(Boolean));
  
  ordersData.forEach((o: any) => {
    const d = new Date(o.created_at || Date.now());
    const k = format(d, "yyyy-MM");
    if (!map[k]) {
      const name = format(d, "MMM", { locale: ptBR });
      map[k] = { name: name.charAt(0).toUpperCase() + name.slice(1), revenue: 0, expenses: 0, invoiced: 0 };
    }

    // Calcula o total do case baseado no case_items
    const caseTotal = (o.case_items || []).reduce((acc: number, itm: any) => acc + Number(itm.total || 0), 0);
    totalVal += caseTotal;

    // Acha os fields de billing
    const fields = o.case_fields || [];
    const billingStatusField = fields.find((f: any) => f.key === "billing_status")?.value_text || "Pendente";
    const partialVal = Number(fields.find((f: any) => f.key === "partial_paid_value")?.value_text || 0);

    const bState = billingStatusField.toLowerCase();
    
    let thisCaseInvoiced = 0;
    if (bState.includes("pago") || bState.includes("faturado")) {
      thisCaseInvoiced = caseTotal;
    } else if (bState.includes("parcial")) {
      thisCaseInvoiced = partialVal;
    }
    
    invoicedVal += thisCaseInvoiced;
    map[k].invoiced += thisCaseInvoiced;

    const st = String(o.state || "").toLowerCase();
    const status = String(o.status || "").toLowerCase();
    if (st === "faturado" || st === "concluído" || st === "concluido" || st === "fechado" || status === "won") {
      closedCount++;
    }
  });

  return {
    totalCustomers: uniqueCustomers.size,
    totalClosedOrders: closedCount,
    totalValueOrders: totalVal,
    invoicedValueOrders: invoicedVal,
    monthMapWithOrders: map
  };
}, [ordersData, monthMap]);

const chartData = useMemo(() => {
  return Object.keys(monthMapWithOrders).sort().map(k => monthMapWithOrders[k]);
}, [monthMapWithOrders]);

const totalRevenue = revenueSum || 0;
const totalExpenses = expensesSum || 0;
const ticketMedio = totalClosedOrders > 0 ? (totalRevenue / totalClosedOrders) : 0;
const marginPercent = totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0;

const guardiaoList = Array.isArray(insightsData?.insights_json) 
  ? insightsData.insights_json 
  : [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* VENDAS / CRM */}
      <div className="mb-2">
        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-[hsl(var(--tenant-accent))]" /> Regime de Competência (Vendas & CRM)
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Desempenho e volume de negócios realizados no período.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard 
          title="Total em Pedidos (Vendido)" 
          value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValueOrders)} 
          trend={0} 
          trendLabel="no período" 
          icon={Briefcase} 
          tooltipContext="Somatório de todos os pedidos realizados, faturados ou não."
        />
        <KpiCard 
          title="Faturado (Aprovado)" 
          value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(invoicedValueOrders)} 
          trend={0} 
          trendLabel="no período" 
          icon={Activity} 
          tooltipContext="Parcela do total de vendas que foi confirmada/faturada no sistema."
        />
        <KpiCard 
          title="Ticket Médio" 
          value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ticketMedio)} 
          trend={0} 
          trendLabel="no período" 
          icon={Sparkles} 
          tooltipContext="Receita faturada dividida pela quantidade de negócios fechados."
        />
        <KpiCard 
          title="Clientes Atendidos" 
          value={String(totalCustomers)} 
          trend={0} 
          trendLabel="no período" 
          icon={Users} 
          tooltipContext="Total de clientes únicos com pedidos registrados neste período."
        />
      </div>

      {/* FINANCEIRO / CAIXA */}
      <div className="mt-8 mb-2 pt-4 border-t border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-[hsl(var(--tenant-accent))]" /> Fato de Caixa (Financeiro)
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Entradas e saídas efetivas na conta bancária.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard 
          title="Receita Efetiva" 
          value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRevenue)} 
          trend={0} 
          trendLabel="no período" 
          icon={DollarSign} 
          tooltipContext="Soma de todos os lançamentos de crédito sincronizados (dinheiro em conta)."
        />
        <KpiCard 
          title="Despesas Efetivas" 
          value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalExpenses)} 
          trend={0} 
          trendLabel="no período" 
          icon={Activity} 
          tooltipContext="Soma de todos os lançamentos de débito sincronizados."
        />
        <KpiCard 
          title="Margem Livre" 
          value={`${marginPercent.toFixed(1).replace('.', ',')}%`} 
          trend={0} 
          trendLabel="no período" 
          icon={PieChart} 
          tooltipContext="Relação entre Receita Efetiva e Despesas Efetivas (Lucratividade do mês)."
        />
        <KpiCard 
          title="A Receber (Inadimplência)" 
          value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, invoicedValueOrders - totalRevenue))} 
          trend={0} 
          trendLabel="no período" 
          icon={Brain} 
          tooltipContext="Diferença entre o que foi Faturado nas Vendas e o que efetivamente pingou na conta (Receita Efetiva)."
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
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorInvoiced" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--tenant-accent))" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="hsl(var(--tenant-accent))" stopOpacity={0}/>
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
                <Area 
                  type="monotone" 
                  dataKey="invoiced" 
                  name="Faturamento (Vendas)"
                  stroke="hsl(var(--tenant-accent))" 
                  strokeWidth={3}
                  strokeDasharray="5 5"
                  fillOpacity={1} 
                  fill="url(#colorInvoiced)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  name="Receita (Caixa)"
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="expenses" 
                  name="Despesas"
                  stroke="#f43f5e" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorExpenses)" 
                />
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
