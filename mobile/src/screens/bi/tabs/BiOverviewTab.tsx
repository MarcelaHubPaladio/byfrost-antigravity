import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { useTenant } from '../../../providers/TenantProvider';
import { Briefcase, DollarSign, Activity, Users, Sparkles, PieChart, Brain } from 'lucide-react-native';

export function BiOverviewTab({ period }: { period: string }) {
  const { activeTenantId, activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';

  // Helper date function based on period (simplified logic)
  const getDateRange = () => {
    const now = new Date();
    if (period === 'mes_atual') {
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date() };
    }
    if (period === 'mes_passado') {
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
    }
    // ultimos_6_meses
    return { from: new Date(now.getFullYear(), now.getMonth() - 5, 1), to: new Date() };
  };

  const dateRange = getDateRange();

  // Queries Reais (Orders / Negócios / Clientes vinculados)
  const { data: ordersData, isLoading: isLoadingOrders } = useQuery({
    queryKey: ['bi_orders_and_customers', activeTenantId, period],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from('cases')
        .select(`id, status, state, customer_id, created_at, journeys!inner(key)`)
        .eq('tenant_id', activeTenantId!)
        .eq('journeys.key', 'sales_order')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) return [];

      const caseIds = data.map((c: any) => c.id);
      const CHUNK_SIZE = 100;
      const chunks: string[][] = [];
      for (let i = 0; i < caseIds.length; i += CHUNK_SIZE) chunks.push(caseIds.slice(i, i + CHUNK_SIZE));

      const allFields: any[] = [];
      const allItems: any[] = [];

      await Promise.all(chunks.map(async (chunk) => {
        const [fRes, iRes] = await Promise.all([
          supabase.from('case_fields').select('case_id,key,value_text').in('case_id', chunk).in('key', ['billing_status', 'partial_paid_value', 'total_value_raw']),
          supabase.from('case_items').select('case_id,total').in('case_id', chunk)
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
  const { data: finData, isLoading: isLoadingFin } = useQuery({
    queryKey: ['bi_fin_overview', activeTenantId, period],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_transactions')
        .select('id, amount, type, transaction_date, status, category_id')
        .eq('tenant_id', activeTenantId!)
        .gte('transaction_date', dateRange.from.toISOString())
        .lte('transaction_date', dateRange.to.toISOString());

      if (error) throw error;
      return data || [];
    }
  });

  const { revenueSum, expensesSum } = useMemo(() => {
    if (!finData) return { revenueSum: 0, expensesSum: 0 };
    let revSum = 0;
    let expSum = 0;

    finData.forEach(t => {
      const isCategorized = t.category_id !== null && t.category_id !== undefined;
      const isConciliated = t.status === 'reconciled' || t.status === 'conciled' || t.status === 'conciliado';
      if (t.type === 'credit' && isCategorized && !isConciliated) revSum += Number(t.amount);
      if (t.type === 'debit' && isCategorized && !isConciliated) expSum += Number(t.amount);
    });

    return { revenueSum: revSum, expensesSum: expSum };
  }, [finData]);

  const { totalCustomers, totalClosedOrders, totalValueOrders, invoicedValueOrders } = useMemo(() => {
    if (!ordersData) return { totalCustomers: 0, totalClosedOrders: 0, totalValueOrders: 0, invoicedValueOrders: 0 };
    
    let totalVal = 0;
    let invoicedVal = 0;
    let closedCount = 0;
    const uniqueCustomers = new Set(ordersData.map((o: any) => o.customer_id).filter(Boolean));
    
    ordersData.forEach((o: any) => {
      const caseTotal = (o.case_items || []).reduce((acc: number, itm: any) => acc + Number(itm.total || 0), 0);
      totalVal += caseTotal;

      const fields = o.case_fields || [];
      const billingStatusField = fields.find((f: any) => f.key === 'billing_status')?.value_text || 'Pendente';
      const partialVal = Number(fields.find((f: any) => f.key === 'partial_paid_value')?.value_text || 0);

      const bState = billingStatusField.toLowerCase();
      let thisCaseInvoiced = 0;
      if (bState.includes('pago') || bState.includes('faturado')) {
        thisCaseInvoiced = caseTotal;
      } else if (bState.includes('parcial')) {
        thisCaseInvoiced = partialVal;
      }
      
      invoicedVal += thisCaseInvoiced;

      const st = String(o.state || '').toLowerCase();
      const status = String(o.status || '').toLowerCase();
      if (st === 'faturado' || st === 'concluído' || st === 'concluido' || st === 'fechado' || status === 'won') {
        closedCount++;
      }
    });

    return {
      totalCustomers: uniqueCustomers.size,
      totalClosedOrders: closedCount,
      totalValueOrders: totalVal,
      invoicedValueOrders: invoicedVal
    };
  }, [ordersData]);

  const totalRevenue = revenueSum || 0;
  const totalExpenses = expensesSum || 0;
  const ticketMedio = totalClosedOrders > 0 ? (totalRevenue / totalClosedOrders) : 0;
  const marginPercent = totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0;
  const defaults = { currency: 'BRL', style: 'currency' };

  if (isLoadingFin || isLoadingOrders) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={neon} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      
      <View style={styles.sectionHeader}>
        <Briefcase color={neon} size={18} />
        <Text style={styles.sectionTitle}>Regime de Competência</Text>
      </View>

      <View style={styles.grid}>
        <KpiCard title="Total Vendido" value={new Intl.NumberFormat('pt-BR', defaults).format(totalValueOrders)} icon={<Briefcase size={16} color="#9CA3AF" />} neon={neon} />
        <KpiCard title="Faturado" value={new Intl.NumberFormat('pt-BR', defaults).format(invoicedValueOrders)} icon={<Activity size={16} color="#9CA3AF" />} neon={neon} />
        <KpiCard title="Ticket Médio" value={new Intl.NumberFormat('pt-BR', defaults).format(ticketMedio)} icon={<Sparkles size={16} color="#9CA3AF" />} neon={neon} />
        <KpiCard title="Clientes Atendidos" value={String(totalCustomers)} icon={<Users size={16} color="#9CA3AF" />} neon={neon} />
      </View>

      <View style={styles.divider} />

      <View style={styles.sectionHeader}>
        <DollarSign color={neon} size={18} />
        <Text style={styles.sectionTitle}>Fato de Caixa</Text>
      </View>

      <View style={styles.grid}>
        <KpiCard title="Receita Efetiva" value={new Intl.NumberFormat('pt-BR', defaults).format(totalRevenue)} icon={<DollarSign size={16} color="#9CA3AF" />} neon={neon} />
        <KpiCard title="Despesas Efetivas" value={new Intl.NumberFormat('pt-BR', defaults).format(totalExpenses)} icon={<Activity size={16} color="#9CA3AF" />} neon={neon} />
        <KpiCard title="Margem Livre" value={`${marginPercent.toFixed(1).replace('.', ',')}%`} icon={<PieChart size={16} color="#9CA3AF" />} neon={neon} />
        <KpiCard title="A Receber" value={new Intl.NumberFormat('pt-BR', defaults).format(Math.max(0, invoicedValueOrders - totalRevenue))} icon={<Brain size={16} color="#9CA3AF" />} neon={neon} />
      </View>

    </ScrollView>
  );
}

function KpiCard({ title, value, icon, neon }: { title: string, value: string, icon: any, neon: string }) {
  return (
    <View style={styles.kpiCard}>
      <View style={styles.kpiHeader}>
        <Text style={styles.kpiTitle}>{title}</Text>
        {icon}
      </View>
      <Text style={[styles.kpiValue, { color: neon }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#F9FAFB' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  divider: { height: 1, backgroundColor: '#2A2A2A', marginVertical: 24 },
  kpiCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 16,
    padding: 16,
    width: '48%',
  },
  kpiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  kpiTitle: { fontSize: 12, color: '#9CA3AF', fontWeight: '500', flex: 1 },
  kpiValue: { fontSize: 18, fontWeight: '800' },
});
