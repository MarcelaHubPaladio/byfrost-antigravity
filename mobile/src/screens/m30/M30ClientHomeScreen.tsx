import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, StyleSheet, Dimensions, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../providers/TenantProvider';
import { Package, CheckCircle2, ChevronDown, ChevronUp, KanbanSquare, Circle } from 'lucide-react-native';
import { useSession } from '../../providers/SessionProvider';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function M30ClientHomeScreen() {
  const { activeTenantId, activeTenant } = useTenant();
  const { user } = useSession();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const neon = activeTenant?.neon_primary || '#A3FF47';

  const m30DeliverablesQ = useQuery({
    queryKey: ['m30_client_deliverables_expanded', activeTenantId, user?.id],
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
        .select('id, name, status, created_at, updated_at, due_date')
        .eq('tenant_id', activeTenantId!)
        .in('commitment_id', commitmentIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (errD) throw errD;
      
      const items = deliverables || [];

      // 3. Busca os cases vinculados aos deliverables
      const delIds = items.map(d => d.id);
      let cases: any[] = [];
      if (delIds.length > 0) {
        const { data: casesData, error: errCases } = await supabase
          .from('cases')
          .select('id, title, state, deliverable_id, updated_at')
          .eq('tenant_id', activeTenantId!)
          .in('deliverable_id', delIds)
          .is('deleted_at', null);
        if (!errCases && casesData) {
          cases = casesData;
        }
      }

      // Attach cases to deliverables
      const itemsWithCases = items.map(d => ({
        ...d,
        cases: cases.filter(c => c.deliverable_id === d.id)
      }));

      // 4. Agrupa por "name"
      const groups: Record<string, typeof itemsWithCases> = {};
      itemsWithCases.forEach(d => {
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

  const toggleGroup = (name: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedGroups(prev => ({ ...prev, [name]: !prev[name] }));
  };

  if (m30DeliverablesQ.isLoading && !m30DeliverablesQ.data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={neon} />
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
        refreshControl={<RefreshControl tintColor={neon} refreshing={m30DeliverablesQ.isFetching} onRefresh={() => m30DeliverablesQ.refetch()} />}
        contentContainerStyle={groupedData.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyView}>
            <Package size={64} color="#334155" />
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
          const isExpanded = !!expandedGroups[item.name];

          return (
            <View style={[styles.card, isExpanded && styles.cardExpanded]}>
              <TouchableOpacity 
                activeOpacity={0.7} 
                onPress={() => toggleGroup(item.name)}
                style={styles.cardHeader}
              >
                <View style={[styles.iconBox, isFullyDone ? { backgroundColor: neon + '20' } : {}]}>
                  <Package size={20} color={isFullyDone ? neon : "#64748b"} />
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.cardSubtitle}>
                    {total} {total === 1 ? 'INSTÂNCIA' : 'INSTÂNCIAS'}
                  </Text>
                </View>
                <View style={styles.progressCounter}>
                  <Text style={[styles.progressText, isFullyDone ? { color: neon } : {}]}>
                    {completed}/{total}
                  </Text>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, isFullyDone ? { backgroundColor: neon } : { backgroundColor: '#3b82f6' }, { width: `${progressPct}%` }]} />
                  </View>
                </View>
                <View style={styles.expandIcon}>
                  {isExpanded ? <ChevronUp size={20} color="#64748b" /> : <ChevronDown size={20} color="#64748b" />}
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.expandedContent}>
                  {item.items.map((deliverable, idx) => {
                    const dDone = deliverable.status === 'completed';
                    return (
                      <View key={deliverable.id} style={styles.deliverableItem}>
                        <View style={styles.deliverableTop}>
                          <View style={styles.deliverableLeft}>
                            {dDone ? <CheckCircle2 size={16} color={neon} /> : <Circle size={16} color="#64748b" />}
                            <Text style={[styles.deliverableTitle, dDone && { color: neon }]}>#{idx + 1} — Instância</Text>
                          </View>
                          <View style={[styles.statusBadge, dDone ? { backgroundColor: neon + '20' } : {}]}>
                            <Text style={[styles.statusBadgeText, dDone ? { color: neon } : {}]}>{deliverable.status || 'pendente'}</Text>
                          </View>
                        </View>
                        
                        {deliverable.cases && deliverable.cases.length > 0 ? (
                          <View style={styles.casesList}>
                            {deliverable.cases.map((c: any) => (
                              <View key={c.id} style={styles.caseItem}>
                                <KanbanSquare size={14} color="#3b82f6" />
                                <Text style={styles.caseTitle} numberOfLines={1}>{c.title || 'Tarefa'}</Text>
                                <View style={styles.caseStateBadge}>
                                  <Text style={styles.caseStateText}>{c.state}</Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text style={styles.noCasesText}>Nenhuma tarefa iniciada.</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
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
    backgroundColor: '#0f172a', // dark bg
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 16,
    fontWeight: '500',
  },
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
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
    backgroundColor: '#1e293b',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  cardExpanded: {
    borderColor: '#475569',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardHeaderText: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitle: {
    color: '#f8fafc',
    fontWeight: 'bold',
    fontSize: 15,
  },
  cardSubtitle: {
    color: '#94a3b8',
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
    color: '#cbd5e1',
  },
  progressBarBg: {
    width: 60,
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  expandIcon: {
    marginLeft: 12,
  },
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 12,
  },
  deliverableItem: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  deliverableTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  deliverableLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deliverableTitle: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  statusBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: '#cbd5e1',
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  casesList: {
    marginTop: 4,
    gap: 4,
  },
  caseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 8,
    borderRadius: 8,
  },
  caseTitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
  },
  caseStateBadge: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  caseStateText: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '600',
  },
  noCasesText: {
    color: '#475569',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
