import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { useTenant } from '../../../providers/TenantProvider';
import { PiggyBank, TrendingUp, TrendingDown, Coins } from 'lucide-react-native';

export function BiFinanceTab({ period }: { period: string }) {
  const { activeTenantId, activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';

  const getDateRange = () => {
    const now = new Date();
    if (period === 'mes_atual') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date() };
    if (period === 'mes_passado') return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
    return { from: new Date(now.getFullYear(), now.getMonth() - 5, 1), to: new Date() };
  };

  const dateRange = getDateRange();

  const { data: finData, isLoading } = useQuery({
    queryKey: ['bi_extrato_completo', activeTenantId, period],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_transactions')
        .select(`id, amount, type, transaction_date, financial_categories(name), core_entities(display_name)`)
        .eq('tenant_id', activeTenantId!)
        .gte('transaction_date', dateRange.from.toISOString())
        .lte('transaction_date', dateRange.to.toISOString());

      if (error) throw error;
      return data || [];
    }
  });

  const { totalReceitas, totalDespesas, saldoPeriodo } = useMemo(() => {
    if (!finData) return { totalReceitas: 0, totalDespesas: 0, saldoPeriodo: 0 };
    let recSum = 0;
    let despSum = 0;
    finData.forEach(t => {
      const val = Number(t.amount || 0);
      if (t.type === 'credit') recSum += val;
      else despSum += val;
    });
    return { totalReceitas: recSum, totalDespesas: despSum, saldoPeriodo: recSum - despSum };
  }, [finData]);

  const margem = totalReceitas > 0 ? (saldoPeriodo / totalReceitas) * 100 : 0;
  const defaults = { currency: 'BRL', style: 'currency' };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={neon} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.sectionHeader}>
        <PiggyBank color={neon} size={18} />
        <Text style={styles.sectionTitle}>Análise Financeira</Text>
      </View>

      <View style={styles.grid}>
        <KpiCard 
          title="Saldo do Período" 
          value={new Intl.NumberFormat('pt-BR', defaults).format(saldoPeriodo)} 
          icon={<PiggyBank size={16} color={saldoPeriodo >= 0 ? '#10B981' : '#EF4444'} />} 
          color={saldoPeriodo >= 0 ? '#10B981' : '#EF4444'} 
        />
        <KpiCard 
          title="Total Entradas" 
          value={new Intl.NumberFormat('pt-BR', defaults).format(totalReceitas)} 
          icon={<TrendingUp size={16} color="#3B82F6" />} 
          color="#3B82F6" 
        />
        <KpiCard 
          title="Total Saídas" 
          value={new Intl.NumberFormat('pt-BR', defaults).format(totalDespesas)} 
          icon={<TrendingDown size={16} color="#F43F5E" />} 
          color="#F43F5E" 
        />
        <KpiCard 
          title="Margem Livre" 
          value={`${margem.toFixed(1)}%`} 
          icon={<Coins size={16} color={margem >= 0 ? '#10B981' : '#F59E0B'} />} 
          color={margem >= 0 ? '#10B981' : '#F59E0B'} 
        />
      </View>
      
      {/* TODO: Add react-native-gifted-charts bar/line chart for Fluxo de Caixa later */}
      <View style={styles.placeholderCard}>
        <Text style={styles.placeholderTitle}>Fluxo de Caixa Mensal</Text>
        <Text style={styles.placeholderText}>O gráfico detalhado está disponível na versão Web.</Text>
      </View>

    </ScrollView>
  );
}

function KpiCard({ title, value, icon, color }: { title: string, value: string, icon: any, color: string }) {
  return (
    <View style={styles.kpiCard}>
      <View style={styles.kpiHeader}>
        <Text style={styles.kpiTitle}>{title}</Text>
        {icon}
      </View>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
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
  placeholderCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderTitle: { fontSize: 14, fontWeight: '700', color: '#F9FAFB', marginBottom: 6 },
  placeholderText: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
});
