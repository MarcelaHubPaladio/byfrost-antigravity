import React from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../providers/TenantProvider';
import { FileText, ChevronRight } from 'lucide-react-native';
import { useSession } from '../../providers/SessionProvider';

export function M30ClientHomeScreen() {
  const { activeTenantId } = useTenant();
  const { user } = useSession();

  const m30DeliverablesQ = useQuery({
    queryKey: ['m30_client_deliverables', activeTenantId, user?.id],
    enabled: Boolean(activeTenantId && user?.id),
    queryFn: async () => {
      const { data: contracts, error: errC } = await supabase
        .from('m30_client_users')
        .select('commitment_id')
        .eq('tenant_id', activeTenantId!)
        .eq('user_id', user!.id);
      
      if (errC) throw errC;
      if (!contracts || contracts.length === 0) return [];

      const commitmentIds = contracts.map(c => c.commitment_id);

      const { data: journey, error: errJ } = await supabase
        .from('journeys')
        .select('id')
        .eq('key', 'operacao_m30')
        .eq('tenant_id', activeTenantId!)
        .maybeSingle();

      if (errJ || !journey) throw errJ || new Error('Jornada M30 não encontrada');

      const { data: cases, error: errCases } = await supabase
        .from('cases')
        .select(`
          id, title, state, created_at, updated_at, meta_json,
          customer:core_entities!cases_customer_id_fkey(display_name)
        `)
        .eq('tenant_id', activeTenantId!)
        .eq('journey_id', journey.id)
        .in('meta_json->>commitment_id', commitmentIds)
        .order('updated_at', { ascending: false });

      if (errCases) throw errCases;
      return cases || [];
    }
  });

  const getStatusColor = (state: string) => {
    const s = state?.toLowerCase() || '';
    if (s.includes('conclui') || s.includes('finaliz')) return '#10b981'; // emerald-500
    if (s.includes('aprov')) return '#3b82f6'; // blue-500
    if (s.includes('grav')) return '#a855f7'; // purple-500
    if (s.includes('edi')) return '#f97316'; // orange-500
    if (s.includes('cancel')) return '#ef4444'; // red-500
    return '#94a3b8'; // slate-400
  };

  if (m30DeliverablesQ.isLoading && !m30DeliverablesQ.data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Carregando entregáveis...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Olá!</Text>
        <Text style={styles.headerSubtitle}>Acompanhe o andamento dos seus entregáveis.</Text>
      </View>

      <FlatList
        style={styles.list}
        data={m30DeliverablesQ.data}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={m30DeliverablesQ.isFetching} onRefresh={() => m30DeliverablesQ.refetch()} />}
        contentContainerStyle={(!m30DeliverablesQ.data || m30DeliverablesQ.data.length === 0) ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyView}>
            <FileText size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>
              Nenhum entregável encontrado para os seus contratos.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.7}>
            <View style={[styles.cardIndicator, { backgroundColor: getStatusColor(item.state) }]} />
            
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title || 'Entregável sem título'}
              </Text>
              
              <View style={styles.cardFooter}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.state || 'Pendente'}</Text>
                </View>
                <Text style={styles.dateText}>
                  {new Date(item.updated_at).toLocaleDateString()}
                </Text>
              </View>
            </View>
            
            <ChevronRight size={20} color="#94a3b8" />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f8fafc', // slate-50
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#64748b', // slate-500
    marginTop: 16,
    fontWeight: '500',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc', // slate-50
  },
  header: {
    backgroundColor: '#0f172a', // slate-900
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
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#94a3b8', // slate-400
    fontSize: 14,
    marginTop: 4,
  },
  list: {
    flex: 1,
    marginTop: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
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
    color: '#64748b', // slate-500
    textAlign: 'center',
    fontWeight: '500',
    marginTop: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#f1f5f9', // slate-100
    overflow: 'hidden',
  },
  cardIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  cardBody: {
    flex: 1,
    paddingLeft: 4,
  },
  cardTitle: {
    color: '#0f172a', // slate-900
    fontWeight: 'bold',
    fontSize: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  badge: {
    backgroundColor: '#f1f5f9', // slate-100
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#334155', // slate-700
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateText: {
    fontSize: 12,
    color: '#94a3b8', // slate-400
    fontWeight: '500',
  },
});
