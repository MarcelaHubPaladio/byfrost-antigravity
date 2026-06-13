import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../providers/TenantProvider';
import { useSession } from '../../providers/SessionProvider';
import { TrendingUp, ShoppingCart, Calendar, BarChart3, AlertCircle } from 'lucide-react-native';

const { width } = Dimensions.get('window');

type EntityReport = {
  id: string;
  period_name: string;
  visualizations: number;
  profile_visits: number;
  initiated_conversations: number;
  tracked_sales: number;
  sales_percentage: number;
  ad_spend: number;
  advertised_products: string | null;
  production_notes: string | null;
  unit_name: string;
};

export function M30ClientReportsScreen() {
  const { activeTenantId, activeTenant } = useTenant();
  const { user } = useSession();
  
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  const neonColor = activeTenant?.neon_primary || '#A3FF47';

  // Fetch the M30 Client contracts — same query pattern as M30ClientHomeScreen
  const profileQ = useQuery({
    queryKey: ['m30_client_profile_reports', user?.id, activeTenantId],
    enabled: Boolean(user?.id && activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('m30_client_users')
        .select('commitment_id')
        .eq('tenant_id', activeTenantId!)
        .eq('user_id', user!.id);
      if (error) throw error;
      return data; // returns array of { commitment_id }
    },
    staleTime: 60_000,
  });

  const commitmentIds = (profileQ.data || []).map(r => r.commitment_id).filter(Boolean);

  // Fetch all entity_reports for all commitments of this client
  const reportsQ = useQuery({
    queryKey: ['entity_reports_mobile', commitmentIds],
    enabled: commitmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entity_reports')
        .select('*')
        .in('contract_id', commitmentIds)
        .is('deleted_at', null)
        .order('start_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EntityReport[];
    },
  });

  const reports = reportsQ.data || [];
  
  const selectedReport = useMemo(() => {
    if (selectedPeriodId) {
      return reports.find(r => r.id === selectedPeriodId) || reports[0];
    }
    return reports[reports.length - 1]; // Default to the most recent report (end of array)
  }, [reports, selectedPeriodId]);

  const metrics = useMemo(() => {
    if (!selectedReport) return { cpv: 0, cpl: 0, cac: 0 };
    const adSpend = Number(selectedReport.ad_spend) || 0;
    return {
      cpv: adSpend / (selectedReport.profile_visits || 1),
      cpl: adSpend / (selectedReport.initiated_conversations || 1),
      cac: adSpend / (selectedReport.tracked_sales || 1)
    };
  }, [selectedReport]);

  const funnelData = useMemo(() => {
    if (!selectedReport) return [];
    const v = Number(selectedReport.visualizations) || 0;
    const pv = Number(selectedReport.profile_visits) || 0;
    const ic = Number(selectedReport.initiated_conversations) || 0;
    const ts = Number(selectedReport.tracked_sales) || 0;
    
    return [
      { name: "Visualizações", value: v, ratio: 100, color: "#6366f1" },
      { name: "Visitas Perfil", value: pv, ratio: v > 0 ? (pv/v)*100 : 0, color: "#8b5cf6" },
      { name: "Conversas", value: ic, ratio: pv > 0 ? (ic/pv)*100 : 0, color: "#ec4899" },
      { name: "Vendas", value: ts, ratio: ic > 0 ? (ts/ic)*100 : 0, color: "#f59e0b" },
    ];
  }, [selectedReport]);

  const onRefresh = () => {
    profileQ.refetch();
    reportsQ.refetch();
  };

  if (profileQ.isLoading || reportsQ.isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={neonColor} />
      </View>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <ScrollView 
        contentContainerStyle={[styles.container, styles.centered]}
        refreshControl={<RefreshControl refreshing={reportsQ.isFetching} onRefresh={onRefresh} tintColor={neonColor} />}
      >
        <BarChart3 size={48} color="#334155" style={{ marginBottom: 16 }} />
        <Text style={styles.emptyTitle}>Nenhum relatório</Text>
        <Text style={styles.emptySubtitle}>Ainda não há relatórios de performance para o seu contrato.</Text>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Relatórios de Performance</Text>
      </View>

      {/* Tabs para Períodos */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {reports.map((report) => {
            const isSelected = selectedReport?.id === report.id;
            return (
              <TouchableOpacity
                key={report.id}
                style={[
                  styles.tabItem,
                  isSelected && { backgroundColor: neonColor, borderColor: neonColor }
                ]}
                onPress={() => setSelectedPeriodId(report.id)}
              >
                <Text style={[
                  styles.tabText,
                  isSelected && { color: '#000000', fontWeight: 'bold' }
                ]}>
                  {report.period_name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={reportsQ.isFetching} onRefresh={onRefresh} tintColor={neonColor} />}
      >
        {/* Funil Visual */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <TrendingUp size={20} color={neonColor} />
            <Text style={styles.cardTitle}>Funil de Conversão</Text>
          </View>
          
          <View style={styles.funnelContainer}>
            {funnelData.map((item, index) => {
              const prevValue = index === 0 ? item.value : funnelData[index - 1].value;
              const dropPercent = prevValue > 0 ? ((prevValue - item.value) / prevValue) * 100 : 0;
              const isFirst = index === 0;

              return (
                <View key={item.name} style={styles.funnelRow}>
                  <View style={styles.funnelLabels}>
                    <Text style={styles.funnelName}>{item.name}</Text>
                    <Text style={styles.funnelValue}>{item.value.toLocaleString('pt-BR')}</Text>
                  </View>
                  
                  <View style={styles.funnelBarContainer}>
                    <View 
                      style={[
                        styles.funnelBar, 
                        { backgroundColor: item.color, width: `${Math.max(item.ratio, 5)}%` }
                      ]} 
                    />
                  </View>
                  
                  {!isFirst && (
                    <View style={styles.funnelMeta}>
                      <Text style={styles.funnelRatioText}>{item.ratio.toFixed(1)}% de retenção</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Indicadores Grid */}
        <Text style={styles.sectionTitle}>Indicadores Principais</Text>
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Text style={styles.gridItemLabel}>Investimento</Text>
            <Text style={styles.gridItemValue}>
              {selectedReport?.ad_spend ? `R$ ${Number(selectedReport.ad_spend).toLocaleString('pt-BR')}` : "R$ 0"}
            </Text>
          </View>
          
          <View style={styles.gridItem}>
            <Text style={styles.gridItemLabel}>ROI (1%)</Text>
            <Text style={[styles.gridItemValue, { color: neonColor }]}>
              {Number(selectedReport?.sales_percentage || 0).toFixed(1)}%
            </Text>
          </View>

          <View style={styles.gridItem}>
            <Text style={styles.gridItemLabel}>CPV</Text>
            <Text style={styles.gridItemValue}>R$ {metrics.cpv.toFixed(2)}</Text>
          </View>

          <View style={styles.gridItem}>
            <Text style={styles.gridItemLabel}>CPL</Text>
            <Text style={styles.gridItemValue}>R$ {metrics.cpl.toFixed(2)}</Text>
          </View>

          <View style={styles.gridItem}>
            <Text style={styles.gridItemLabel}>CAC</Text>
            <Text style={styles.gridItemValue}>R$ {metrics.cac.toFixed(2)}</Text>
          </View>

          <View style={styles.gridItem}>
            <Text style={styles.gridItemLabel}>Conversão</Text>
            <Text style={styles.gridItemValue}>
              {((Number(selectedReport?.tracked_sales) / (Number(selectedReport?.initiated_conversations) || 1)) * 100).toFixed(1)}%
            </Text>
          </View>
        </View>

        {/* Informações Extras */}
        <View style={styles.notesContainer}>
          <View style={styles.noteCard}>
            <View style={styles.noteCardHeader}>
              <ShoppingCart size={16} color="#A78BFA" />
              <Text style={styles.noteCardTitle}>Produtos Anunciados</Text>
            </View>
            <Text style={styles.noteCardText}>
              {selectedReport?.advertised_products || "Nenhum produto detalhado para este período."}
            </Text>
          </View>

          <View style={[styles.noteCard, { backgroundColor: '#312E81' }]}>
            <View style={styles.noteCardHeader}>
              <Calendar size={16} color="#C4B5FD" />
              <Text style={[styles.noteCardTitle, { color: '#EDE9FE' }]}>Produção do Período</Text>
            </View>
            <Text style={[styles.noteCardText, { color: '#DDD6FE' }]}>
              {selectedReport?.production_notes || "Nenhuma nota de produção detalhada para este período."}
            </Text>
          </View>
        </View>
        
        <View style={styles.footerSpace} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    color: '#F9FAFB',
    fontSize: 24,
    fontWeight: '900',
  },
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    paddingBottom: 12,
  },
  tabsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1E293B',
  },
  tabText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    gap: 24,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  cardTitle: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: 'bold',
  },
  funnelContainer: {
    gap: 16,
  },
  funnelRow: {
    gap: 6,
  },
  funnelLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  funnelName: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  funnelValue: {
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '900',
  },
  funnelBarContainer: {
    height: 12,
    backgroundColor: '#1F2937',
    borderRadius: 6,
    overflow: 'hidden',
  },
  funnelBar: {
    height: '100%',
    borderRadius: 6,
  },
  funnelMeta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  funnelRatioText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: -8,
    paddingHorizontal: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridItem: {
    width: (width - 44) / 2, // 2 columns, accounting for padding and gap
    backgroundColor: '#111827',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridItemLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  gridItemValue: {
    color: '#F9FAFB',
    fontSize: 20,
    fontWeight: '900',
  },
  notesContainer: {
    gap: 12,
  },
  noteCard: {
    backgroundColor: '#1E1B4B',
    padding: 20,
    borderRadius: 24,
    gap: 8,
  },
  noteCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noteCardTitle: {
    color: '#DDD6FE',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noteCardText: {
    color: '#A78BFA',
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  footerSpace: {
    height: 40,
  }
});
