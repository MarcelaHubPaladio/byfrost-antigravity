import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { useTenant } from '../../../providers/TenantProvider';
import { DollarSign, BarChart3, MousePointerClick, Users, TrendingUp } from 'lucide-react-native';

export function BiMetaTab({ period }: { period: string }) {
  const { activeTenantId, activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';

  const getDateRange = () => {
    const now = new Date();
    if (period === 'hoje') return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to: new Date() };
    if (period === 'ultimos_7_dias') return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7), to: new Date() };
    if (period === 'mes_atual') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date() };
    if (period === 'mes_passado') return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
    if (period === 'ultimos_3_meses') return { from: new Date(now.getFullYear(), now.getMonth() - 2, 1), to: new Date() };
    if (period === 'este_ano') return { from: new Date(now.getFullYear(), 0, 1), to: new Date() };
    return { from: new Date(now.getFullYear(), now.getMonth() - 5, 1), to: new Date() };
  };

  const dateRange = getDateRange();

  const { data: metricsQ, isLoading, isError } = useQuery({
    queryKey: ['meta_ads_metrics_dashboard', activeTenantId, period],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data: accounts, error: accErr } = await supabase
        .from('meta_ads_accounts')
        .select('id, name')
        .eq('tenant_id', activeTenantId!);
      if (accErr) throw accErr;
      
      if (!accounts || accounts.length === 0) return { accounts: [], campaigns: [], ads: [], metrics: [] };

      const accIds = accounts.map(a => a.id);
      const { data: campaigns, error: campErr } = await supabase
        .from('meta_ads_campaigns')
        .select('id, meta_ads_account_id, name')
        .in('meta_ads_account_id', accIds);
      if (campErr) throw campErr;

      if (!campaigns || campaigns.length === 0) return { accounts, campaigns: [], ads: [], metrics: [] };

      const campIds = campaigns.map(c => c.id);

      const { data: metrics, error: metErr } = await supabase
        .from('meta_ads_metrics_daily')
        .select('*')
        .in('campaign_id', campIds)
        .gte('date', dateRange.from.toISOString().split('T')[0])
        .lte('date', dateRange.to.toISOString().split('T')[0]);

      if (metErr) throw metErr;

      return { accounts, campaigns, ads: [], metrics: metrics || [] };
    }
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={neon} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#EF4444' }}>Erro ao carregar métricas do Meta Ads.</Text>
      </View>
    );
  }

  const { accounts, metrics } = metricsQ || { accounts: [], metrics: [] };

  if (accounts.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <BarChart3 size={48} color="#2A2A2A" style={{ marginBottom: 16 }} />
        <Text style={styles.emptyTitle}>Nenhuma conta conectada</Text>
        <Text style={styles.emptyText}>Conecte suas contas de anúncios no painel Web em Configurações {'>'} Integrações.</Text>
      </View>
    );
  }

  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalLeads = 0;
  let totalPurchases = 0;

  metrics.forEach(m => {
    totalSpend += Number(m.spend || 0);
    totalImpressions += Number(m.impressions || 0);
    totalClicks += Number(m.clicks || 0);
    totalLeads += Number(m.leads || 0);
    totalPurchases += Number(m.purchases || 0);
  });

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.sectionHeader}>
        <DollarSign color={neon} size={18} />
        <Text style={styles.sectionTitle}>Resultados Pagos (Meta Ads)</Text>
      </View>

      <View style={styles.grid}>
        <KpiCard title="Investimento" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSpend)} icon={<DollarSign size={16} color="#10B981" />} neon="#10B981" />
        <KpiCard title="Impressões" value={totalImpressions.toLocaleString()} icon={<BarChart3 size={16} color="#3B82F6" />} neon="#3B82F6" />
        <KpiCard title="Cliques" value={totalClicks.toLocaleString()} icon={<MousePointerClick size={16} color="#F59E0B" />} neon="#F59E0B" />
        <KpiCard title="Leads" value={totalLeads.toLocaleString()} icon={<Users size={16} color="#8B5CF6" />} neon="#8B5CF6" />
        <KpiCard title="Compras" value={totalPurchases.toLocaleString()} icon={<TrendingUp size={16} color="#6366F1" />} neon="#6366F1" />
      </View>

      <View style={styles.placeholderCard}>
        <Text style={styles.placeholderTitle}>Campanhas e Anúncios</Text>
        <Text style={styles.placeholderText}>A quebra detalhada por campanha e resultados orgânicos estão disponíveis na versão Web.</Text>
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
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#6B7280', marginBottom: 8, textAlign: 'center' },
  emptyText: { fontSize: 13, color: '#4B5563', textAlign: 'center' },
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
