import React from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, StyleSheet, Dimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../providers/TenantProvider';
import { Package, CheckCircle2 } from 'lucide-react-native';
import { useSession } from '../../providers/SessionProvider';

const { width } = Dimensions.get('window');

export function M30ClientHomeScreen() {
  const { activeTenantId } = useTenant();
  const { user } = useSession();

  const m30DeliverablesQ = useQuery({
    queryKey: ['m30_client_deliverables_grouped', activeTenantId, user?.id],
    enabled: Boolean(activeTenantId && user?.id),
    queryFn: async () => {
      // 1. Encontra os contratos
      const { data: contracts, error: errC } = await supabase
        .from('m30_client_users')
        .select('commitment_id')
        .eq('tenant_id', activeTenantId!)
        .eq('user_id', user!.id);
      
      if (errC) throw errC;
      if (!contracts || contracts.length === 0) return [];

      const commitmentIds = contracts.map(c => c.commitment_id);

      // 2. Busca os entregáveis macros (deliverables) 
      const { data: deliverables, error: errD } = await supabase
        .from('deliverables')
        .select('id, name, status, created_at, updated_at')
        .eq('tenant_id', activeTenantId!)
        .in('commitment_id', commitmentIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (errD) throw errD;
      
      const items = deliverables || [];
      
      // 3. Agrupa por "name"
      const groups: Record<string, typeof items> = {};
      items.forEach(d => {
        const key = d.name || 'Outros';
        if (!groups[key]) groups[key] = [];
        groups[key].push(d);
      });

      // Transforma em array e ordena por nome
      return Object.entries(groups)
        .map(([name, groupItems]) => ({ name, items: groupItems }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  });

  if (m30DeliverablesQ.isLoading && !m30DeliverablesQ.data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Carregando entregáveis...</Text>
      </View>
    );
  }

  const groupedData = m30DeliverablesQ.data || [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Olá!</Text>
        <Text style={styles.headerSubtitle}>Acompanhe o andamento da sua operação.</Text>
      </View>

      <FlatList
        style={styles.list}
        data={groupedData}
        keyExtractor={item => item.name}
        refreshControl={<RefreshControl refreshing={m30DeliverablesQ.isFetching} onRefresh={() => m30DeliverablesQ.refetch()} />}
        contentContainerStyle={groupedData.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyView}>
            <Package size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>
              Nenhum entregável encontrado para os seus contratos.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const total = item.items.length;
          const completed = item.items.filter(d => d.status === 'completed').length;
          const isFullyDone = completed === total && total > 0;
          const progressPct = total > 0 ? (completed / total) * 100 : 0;

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconBox, isFullyDone ? styles.iconBoxDone : {}]}>
                  <Package size={20} color={isFullyDone ? "#059669" : "#3b82f6"} />
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.cardSubtitle}>
                    {total} {total === 1 ? 'INSTÂNCIA' : 'INSTÂNCIAS'}
                  </Text>
                </View>
                <View style={styles.progressCounter}>
                  <Text style={[styles.progressText, isFullyDone ? styles.textDone : {}]}>
                    {completed}/{total}
                  </Text>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, isFullyDone ? styles.bgDone : {}, { width: `${progressPct}%` }]} />
                  </View>
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#64748b',
    marginTop: 16,
    fontWeight: '500',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 4,
  },
  list: {
    flex: 1,
    marginTop: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyView: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 24,
  },
  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '500',
    marginTop: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#eff6ff', // blue-50
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconBoxDone: {
    backgroundColor: '#d1fae5', // emerald-100
  },
  cardHeaderText: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitle: {
    color: '#0f172a',
    fontWeight: 'bold',
    fontSize: 15,
  },
  cardSubtitle: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  progressCounter: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
  },
  textDone: {
    color: '#059669',
  },
  progressBarBg: {
    width: 64,
    height: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 3,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 3,
  },
  bgDone: {
    backgroundColor: '#10b981',
  },
});
