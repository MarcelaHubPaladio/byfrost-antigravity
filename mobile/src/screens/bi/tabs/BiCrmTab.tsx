import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { useTenant } from '../../../providers/TenantProvider';
import { Users, Target, UserX, UserCheck } from 'lucide-react-native';

export function BiCrmTab({ period }: { period: string }) {
  const { activeTenantId, activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';

  const getDateRange = () => {
    const now = new Date();
    if (period === 'mes_atual') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date() };
    if (period === 'mes_passado') return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
    return { from: new Date(now.getFullYear(), now.getMonth() - 5, 1), to: new Date() };
  };

  const dateRange = getDateRange();

  const { data: crmData, isLoading } = useQuery({
    queryKey: ['bi_crm_cases', activeTenantId, period],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select(`id, title, state, created_at, journeys!inner(is_crm)`)
        .eq('tenant_id', activeTenantId!)
        .eq('journeys.is_crm', true)
        .is('deleted_at', null);

      if (error) throw error;
      return data ?? [];
    }
  });

  const { totalLeads, novosCadastros, taxaDescarte, taxaConversao } = useMemo(() => {
    if (!crmData) return { totalLeads: 0, novosCadastros: 0, taxaDescarte: 0, taxaConversao: 0 };

    let total = 0;
    let novos = 0;
    let demitidos = 0;
    let carteira = 0;

    crmData.forEach(c => {
      total++;
      const st = (c.state || '').toLowerCase();
      if (st.includes('demitido') || st.includes('descarte') || st.includes('perdido')) demitidos++;
      if (st.includes('carteira') || st.includes('ganho') || st.includes('cliente')) carteira++;

      const createdAt = new Date(c.created_at);
      let inRange = true;
      if (createdAt < dateRange.from) inRange = false;
      if (createdAt > dateRange.to) inRange = false;
      if (inRange) novos++;
    });

    return {
      totalLeads: total,
      novosCadastros: novos,
      taxaDescarte: total > 0 ? (demitidos / total) * 100 : 0,
      taxaConversao: total > 0 ? (carteira / total) * 100 : 0,
    };
  }, [crmData]);

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
        <Users color={neon} size={18} />
        <Text style={styles.sectionTitle}>Análise de Vendas (CRM)</Text>
      </View>

      <View style={styles.grid}>
        <KpiCard title="Total de Leads" value={String(totalLeads)} icon={<Users size={16} color="#9CA3AF" />} neon={neon} />
        <KpiCard title="Novos (Período)" value={String(novosCadastros)} icon={<Target size={16} color="#9CA3AF" />} neon={neon} />
        <KpiCard title="Taxa Conversão" value={`${taxaConversao.toFixed(1)}%`} icon={<UserCheck size={16} color="#10B981" />} neon="#10B981" />
        <KpiCard title="Taxa Descarte" value={`${taxaDescarte.toFixed(1)}%`} icon={<UserX size={16} color="#EF4444" />} neon="#EF4444" />
      </View>

      <View style={styles.placeholderCard}>
        <Text style={styles.placeholderTitle}>Gráfico de Funil</Text>
        <Text style={styles.placeholderText}>Análises detalhadas do funil de vendas e produtos mais vendidos estão disponíveis no painel Web.</Text>
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
