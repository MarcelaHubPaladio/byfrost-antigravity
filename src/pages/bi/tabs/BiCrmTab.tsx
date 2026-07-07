import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { KpiCard } from "../components/KpiCard";
import { UsersRound, Target, UserX, Snowflake, Medal, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

interface BiCrmTabProps {
  dateRange?: { from?: Date; to?: Date };
}

export function BiCrmTab({ dateRange }: BiCrmTabProps) {
  const { activeTenant } = useTenant();
  const activeTenantId = activeTenant?.id;

  // Query CRM Cases
  const { data: crmData, isLoading: crmLoading } = useQuery({
    queryKey: ["bi_crm_cases", activeTenantId, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("cases")
        .select(`
          id, title, state, created_at,
          journeys!inner(is_crm),
          case_items(offering_entity_id, qty, core_entities(display_name))
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("journeys.is_crm", true)
        .is("deleted_at", null);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    }
  });

  // Query Sales Order Cases
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["bi_crm_sales_orders", activeTenantId, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("cases")
        .select(`
          id, created_at, assigned_user_id,
          users_profile:users_profile!fk_cases_users_profile(display_name),
          journeys!inner(key),
          case_items(qty, total)
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("journeys.key", "sales_order")
        .is("deleted_at", null);

      if (dateRange?.from) q = q.gte("created_at", dateRange.from.toISOString());
      if (dateRange?.to) {
        const endDay = new Date(dateRange.to);
        endDay.setHours(23, 59, 59, 999);
        q = q.lte("created_at", endDay.toISOString());
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    }
  });

  // Query CRM Usage (Timeline Events)
  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ["bi_crm_usage", activeTenantId, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("timeline_events")
        .select(`
          actor_id, occurred_at,
          cases!inner(journeys!inner(is_crm))
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("actor_type", "user")
        .eq("cases.journeys.is_crm", true);

      if (dateRange?.from) q = q.gte("occurred_at", dateRange.from.toISOString());
      if (dateRange?.to) {
        const endDay = new Date(dateRange.to);
        endDay.setHours(23, 59, 59, 999);
        q = q.lte("occurred_at", endDay.toISOString());
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    }
  });

  // Query Users for Bottom 10 (to include users with 0 events)
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["bi_crm_users", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id, display_name")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    }
  });

  const {
    totalLeads,
    novosCadastros,
    leadsDemitidos,
    leadsCarteira,
    leadsGeladeira,
    taxaDescarte,
    taxaConversao,
    chartData,
    topProducts
  } = useMemo(() => {
    if (!crmData) return {
      totalLeads: 0, novosCadastros: 0, leadsDemitidos: 0, leadsCarteira: 0,
      leadsGeladeira: 0, taxaDescarte: 0, taxaConversao: 0, chartData: [], topProducts: []
    };

    let total = 0;
    let novos = 0;
    let demitidos = 0;
    let carteira = 0;
    let geladeira = 0;

    const daysMap = new Map<string, number>();
    const prodMap = new Map<string, { id: string, name: string, count: number }>();

    crmData.forEach(c => {
      total++;
      const st = (c.state || "").toLowerCase();
      
      if (st.includes("demitido")) demitidos++;
      if (st.includes("carteira")) carteira++;
      if (st.includes("geladeira")) geladeira++;

      // Check if created in date range
      const createdAt = new Date(c.created_at);
      let inRange = true;
      if (dateRange?.from && createdAt < dateRange.from) inRange = false;
      if (dateRange?.to) {
        const endDay = new Date(dateRange.to);
        endDay.setHours(23, 59, 59, 999);
        if (createdAt > endDay) inRange = false;
      }

      if (inRange) {
        novos++;
        const dStr = createdAt.toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit' });
        daysMap.set(dStr, (daysMap.get(dStr) || 0) + 1);
      }

      // Products mapping
      if (c.case_items) {
        c.case_items.forEach((item: any) => {
          if (item.offering_entity_id && item.core_entities) {
            const pid = item.offering_entity_id;
            if (!prodMap.has(pid)) {
              prodMap.set(pid, { id: pid, name: item.core_entities.display_name, count: 0 });
            }
            prodMap.get(pid)!.count += (item.qty || 1);
          }
        });
      }
    });

    const cData = Array.from(daysMap.entries())
      .map(([date, count]) => ({ date, cadastros: count }))
      .sort((a, b) => {
        const [d1, m1] = a.date.split("/");
        const [d2, m2] = b.date.split("/");
        return new Date(2020, Number(m1)-1, Number(d1)).getTime() - new Date(2020, Number(m2)-1, Number(d2)).getTime();
      });

    const tProducts = Array.from(prodMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalLeads: total,
      novosCadastros: novos,
      leadsDemitidos: demitidos,
      leadsCarteira: carteira,
      leadsGeladeira: geladeira,
      taxaDescarte: total > 0 ? (demitidos / total) * 100 : 0,
      taxaConversao: total > 0 ? (carteira / total) * 100 : 0,
      chartData: cData,
      topProducts: tProducts
    };
  }, [crmData, dateRange]);

  const {
    topVendorsOrders,
    topVendorsRevenue,
    topUsage,
    bottomUsage
  } = useMemo(() => {
    if (!salesData) return { topVendorsOrders: [], topVendorsRevenue: [], topUsage: [], bottomUsage: [] };

    // Sales calculations
    const vMap = new Map<string, { id: string, name: string, orders: number, revenue: number }>();

    salesData.forEach(c => {
      const vid = c.assigned_user_id;
      if (!vid) return;

      if (!vMap.has(vid)) {
        vMap.set(vid, { id: vid, name: c.users_profile?.display_name || "Sem nome", orders: 0, revenue: 0 });
      }

      const v = vMap.get(vid)!;
      v.orders++;

      if (c.case_items) {
        c.case_items.forEach((item: any) => {
          v.revenue += Number(item.total || 0);
        });
      }
    });

    const arr = Array.from(vMap.values());
    
    // Usage calculations
    const uMap = new Map<string, { id: string, name: string, events: number, lastUsed: string | null }>();
    
    usersData?.forEach(u => {
      if (u.user_id) {
        uMap.set(u.user_id, { 
          id: u.user_id, 
          name: u.display_name || "Usuário", 
          events: 0, 
          lastUsed: null 
        });
      }
    });

    usageData?.forEach(evt => {
      const uid = evt.actor_id;
      if (!uid) return;
      
      if (!uMap.has(uid)) {
        uMap.set(uid, { id: uid, name: "Usuário Removido", events: 0, lastUsed: null });
      }
      
      const u = uMap.get(uid)!;
      u.events++;
      
      if (!u.lastUsed || new Date(evt.occurred_at) > new Date(u.lastUsed)) {
        u.lastUsed = evt.occurred_at;
      }
    });

    const uArr = Array.from(uMap.values()).filter(u => u.name !== "Usuário Removido");

    return {
      topVendorsOrders: [...arr].sort((a, b) => b.orders - a.orders).slice(0, 10),
      topVendorsRevenue: [...arr].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      topUsage: [...uArr].sort((a, b) => b.events - a.events).slice(0, 10),
      bottomUsage: [...uArr].sort((a, b) => a.events - b.events).slice(0, 10),
    };
  }, [salesData, usageData, usersData]);

  if (crmLoading || salesLoading || usageLoading || usersLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard 
          title="Total de Leads (CRM)" 
          value={totalLeads.toLocaleString("pt-BR")} 
          icon={UsersRound} 
          tooltipContext="Total de casos abertos no CRM, independente do período."
        />
        <KpiCard 
          title="Novos (Período)" 
          value={novosCadastros.toLocaleString("pt-BR")} 
          icon={Target} 
          className="text-indigo-500"
          tooltipContext="Cadastros novos de leads realizados no período selecionado."
        />
        <KpiCard 
          title="Taxa de Descarte" 
          value={`${taxaDescarte.toFixed(1)}%`} 
          icon={UserX} 
          className="text-rose-500"
          tooltipContext="Porcentagem de leads que estão no estado 'demitido'."
        />
        <KpiCard 
          title="Taxa de Conversão" 
          value={`${taxaConversao.toFixed(1)}%`} 
          icon={Medal} 
          className="text-emerald-500"
          tooltipContext="Porcentagem de leads que estão na aba 'Carteira de Clientes'."
        />
        <KpiCard 
          title="Leads na Geladeira" 
          value={leadsGeladeira.toLocaleString("pt-BR")} 
          icon={Snowflake} 
          className="text-sky-500"
          tooltipContext="Contagem de leads que encontram-se no estado 'geladeira'."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Gráfico de Aquisição (Dias de mais cadastros) */}
        <div className="col-span-1 md:col-span-3 rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Dias de Mais Cadastros</h3>
            <p className="text-sm text-slate-500">Volume de novos leads criados agrupados por dia (no período)</p>
          </div>
          <div className="h-[300px] w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 12 }} className="text-slate-500 dark:text-slate-400" dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 12 }} className="text-slate-500 dark:text-slate-400" />
                  <Tooltip 
                    cursor={{fill: 'rgba(0,0,0,0.05)'}}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} 
                    itemStyle={{ color: '#0f172a', fontWeight: 500 }} 
                  />
                  <Bar dataKey="cadastros" name="Novos Leads" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-500">
                Sem dados para o período selecionado.
              </div>
            )}
          </div>
        </div>

        {/* Rankings */}
        <div className="col-span-1 rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Top 10 Vendedores (Pedidos)</h3>
          <div className="space-y-4">
            {topVendorsOrders.length > 0 ? topVendorsOrders.map((v, i) => (
              <div key={v.id} className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">{v.name}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{v.orders} ped.</p>
                </div>
              </div>
            )) : <p className="text-sm text-slate-500">Nenhum pedido no período.</p>}
          </div>
        </div>

        <div className="col-span-1 rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Top 10 Vendedores (Faturado)</h3>
          <div className="space-y-4">
            {topVendorsRevenue.length > 0 ? topVendorsRevenue.map((v, i) => (
              <div key={v.id} className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xs font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">{v.name}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(v.revenue)}
                  </p>
                </div>
              </div>
            )) : <p className="text-sm text-slate-500">Nenhum faturamento no período.</p>}
          </div>
        </div>

        <div className="col-span-1 rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Top 10 Produtos (CRM)</h3>
          <div className="space-y-4">
            {topProducts.length > 0 ? topProducts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-xs font-bold text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">{p.name}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{p.count} un.</p>
                </div>
              </div>
            )) : <p className="text-sm text-slate-500">Nenhum produto em leads.</p>}
          </div>
        </div>

        <div className="col-span-1 rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Top 10 Utilizam o CRM</h3>
          <div className="space-y-4">
            {topUsage.length > 0 ? topUsage.map((u, i) => (
              <div key={u.id} className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xs font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">{u.name}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{u.events} interações</p>
                </div>
              </div>
            )) : <p className="text-sm text-slate-500">Nenhum uso registrado.</p>}
          </div>
        </div>

        <div className="col-span-1 rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Top 10 Menos Utilizam o CRM</h3>
          <div className="space-y-4">
            {bottomUsage.length > 0 ? bottomUsage.map((u, i) => (
              <div key={u.id} className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-xs font-bold text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">{u.name}</p>
                </div>
                <div className="shrink-0 text-right flex flex-col items-end">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{u.events} interações</p>
                  {u.lastUsed ? (
                    <p className="text-[10px] text-slate-400">Último: {new Date(u.lastUsed).toLocaleDateString('pt-BR')}</p>
                  ) : (
                    <p className="text-[10px] text-slate-400">Nunca usou</p>
                  )}
                </div>
              </div>
            )) : <p className="text-sm text-slate-500">Nenhum uso registrado.</p>}
          </div>
        </div>

      </div>
    </div>
  );
}
