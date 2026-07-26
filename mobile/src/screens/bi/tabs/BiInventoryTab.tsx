import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../src/lib/supabase';
import { useTenant } from '../../../providers/TenantProvider';
import { Package, ShoppingCart, Boxes } from 'lucide-react-native';

export function BiInventoryTab({ period }: { period: string }) {
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

  const { data, isLoading } = useQuery({
    queryKey: ['bi_inventory', activeTenantId, period],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      // 1. Fetch all offerings
      const { data: products, error: pErr } = await supabase
        .from('core_entities')
        .select('id, display_name, metadata')
        .eq('tenant_id', activeTenantId!)
        .eq('entity_type', 'offering')
        .is('deleted_at', null);
      
      if (pErr) throw pErr;

      // 2. Fetch sales orders in range
      let q = supabase
        .from('cases')
        .select(`id, title, created_at, journeys!inner(key)`)
        .eq('tenant_id', activeTenantId!)
        .eq('journeys.key', 'sales_order')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      const { data: casesData, error: cErr } = await q;
      if (cErr) throw cErr;

      let allItems: any[] = [];
      if (casesData && casesData.length > 0) {
        const caseIds = casesData.map(c => c.id);
        const CHUNK_SIZE = 100;
        for (let i = 0; i < caseIds.length; i += CHUNK_SIZE) {
          const chunk = caseIds.slice(i, i + CHUNK_SIZE);
          const { data: iRes } = await supabase
            .from('case_items')
            .select('case_id, offering_entity_id, qty, total')
            .in('case_id', chunk);
          if (iRes) allItems.push(...iRes);
        }
      }

      return {
        products: products || [],
        cases: casesData || [],
        items: allItems
      };
    }
  });

  const {
    totalStock,
    totalProducts,
    totalItemsSold,
  } = useMemo(() => {
    if (!data) return { totalStock: 0, totalProducts: 0, totalItemsSold: 0 };

    let tStock = 0;
    const tProducts = data.products.length;
    let tItemsSold = 0;

    data.products.forEach(p => {
      const stock = Number((p.metadata as any)?.estoque_total || (p.metadata as any)?.estoque_loja || 0);
      tStock += stock;
    });

    data.items.forEach(i => {
      tItemsSold += Number(i.qty || 0);
    });

    return {
      totalStock: tStock,
      totalProducts: tProducts,
      totalItemsSold: tItemsSold,
    };
  }, [data]);

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
        <Package color={neon} size={18} />
        <Text style={styles.sectionTitle}>Análise de Inventário</Text>
      </View>

      <View style={styles.grid}>
        <KpiCard title="Saldo em Estoque" value={totalStock.toLocaleString('pt-BR')} icon={<Boxes size={16} color="#9CA3AF" />} neon={neon} />
        <KpiCard title="Produtos Ativos" value={totalProducts.toLocaleString('pt-BR')} icon={<Package size={16} color="#9CA3AF" />} neon={neon} />
        <KpiCard title="Itens Vendidos" value={totalItemsSold.toLocaleString('pt-BR')} icon={<ShoppingCart size={16} color="#10B981" />} neon="#10B981" />
      </View>

      <View style={styles.placeholderCard}>
        <Text style={styles.placeholderTitle}>Top 10 Produtos</Text>
        <Text style={styles.placeholderText}>O ranqueamento detalhado dos produtos (mais vendidos e sem movimentação) está disponível na Web.</Text>
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
