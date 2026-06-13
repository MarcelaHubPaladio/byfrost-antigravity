import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TextInput, TouchableOpacity, Modal, ScrollView, RefreshControl, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../providers/TenantProvider';
import { Clock, Zap, Users, Activity, Filter, Search, Calendar, ChevronDown, X, RefreshCw } from 'lucide-react-native';

type TimelineEvent = {
  id: string;
  occurred_at: string;
  event_type: string;
  actor_type: string;
  actor_id?: string | null;
  message: string;
  case_id: string | null;
  cases?: { title: string | null } | null;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  automation_executed: "Automação Executada",
  bank_hour_ledger_adjusted: "Ajuste de Banco de Horas",
  bank_hour_ledger_posted: "Lançamento de Banco de Horas",
  card_created: "Cartão Criado",
  case_deleted: "Caso Excluído",
  case_opened: "Caso Aberto",
  case_state_changed: "Etapa Alterada",
  case_updated: "Caso Atualizado",
  presence_punch: "Batida de Ponto",
  task_created: "Tarefa Criada",
  task_completed: "Tarefa Concluída",
  comment_added: "Comentário Adicionado",
  document_uploaded: "Documento Anexado",
  message_sent: "Mensagem Enviada",
  webhook_received: "Webhook Recebido",
  integration_error: "Erro de Integração",
  field_updated: "Campo Atualizado",
  status_changed: "Status Alterado",
  user_assigned: "Usuário Atribuído",
  user_unassigned: "Usuário Removido",
  subtask_updated: "Subtarefa Atualizada",
};

const getEventLabel = (type: string) => EVENT_TYPE_LABELS[type] || type;

export function MobileGlobalTimeline() {
  const { activeTenantId, activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';

  const [filterText, setFilterText] = useState("");
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(new Set());
  const [selectedActors, setSelectedActors] = useState<Set<string>>(new Set());
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'today' | '7days' | 'month'>('7days');

  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const [showActorFilter, setShowActorFilter] = useState(false);
  const [showDateFilter, setShowDateFilter] = useState(false);

  const eventTypesQ = useQuery({
    queryKey: ["timeline_event_types_mobile", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("timeline_events").select("event_type").eq("tenant_id", activeTenantId!).limit(1000);
      if (error) throw error;
      const set = new Set<string>();
      data.forEach(d => { if (d.event_type) set.add(d.event_type); });
      return Array.from(set).sort((a, b) => getEventLabel(a).localeCompare(getEventLabel(b)));
    }
  });

  const timelineQ = useQuery({
    queryKey: ['global_timeline_mobile', activeTenantId, Array.from(selectedEventTypes).join(","), Array.from(selectedActors).join(","), dateRangeFilter],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let query = supabase
        .from('timeline_events')
        .select(`id, occurred_at, event_type, actor_type, actor_id, message, case_id, cases(title)`)
        .eq('tenant_id', activeTenantId!)
        .order('occurred_at', { ascending: false });

      if (selectedEventTypes.size > 0) {
        query = query.in("event_type", Array.from(selectedEventTypes));
      }

      if (selectedActors.size > 0) {
        const arr = Array.from(selectedActors);
        const systemLike = arr.filter(a => a === "system" || a === "unknown");
        const userIds = arr.filter(a => a !== "system" && a !== "unknown");
        
        if (userIds.length > 0 && systemLike.length > 0) {
           query = query.or(`actor_id.in.(${userIds.join(',')}),actor_type.in.(${systemLike.join(',')})`);
        } else if (userIds.length > 0) {
           query = query.in("actor_id", userIds);
        } else if (systemLike.length > 0) {
           query = query.in("actor_type", systemLike);
        }
      }

      if (dateRangeFilter === 'today') {
        const today = new Date();
        today.setHours(0,0,0,0);
        query = query.gte("occurred_at", today.toISOString());
      } else if (dateRangeFilter === '7days') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        d.setHours(0,0,0,0);
        query = query.gte("occurred_at", d.toISOString());
      } else if (dateRangeFilter === 'month') {
        const d = new Date();
        d.setDate(1);
        d.setHours(0,0,0,0);
        query = query.gte("occurred_at", d.toISOString());
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as TimelineEvent[];
    },
  });

  const usersQ = useQuery({
    queryKey: ["users_profile", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("users_profile").select("user_id, display_name, role").eq("tenant_id", activeTenantId!);
      if (error) throw error;
      const map = new Map<string, any>();
      data?.forEach(u => map.set(u.user_id, u));
      return map;
    }
  });

  const getActorName = (evt: TimelineEvent) => {
    let name = evt.actor_type;
    if (evt.actor_id && usersQ.data?.has(evt.actor_id)) {
      const u = usersQ.data.get(evt.actor_id);
      name = u.display_name?.split(' ')[0] || 'Usuário';
    }
    return name === 'system' ? 'Sistema' : name;
  };

  const actorOptions = useMemo(() => {
    const opts = new Map<string, string>();
    opts.set("system", "Sistema");
    if (usersQ.data) {
      usersQ.data.forEach((u, id) => {
        opts.set(id, u.display_name?.split(' ')[0] || "Usuário");
      });
    }
    return Array.from(opts.entries());
  }, [usersQ.data]);

  const filteredData = useMemo(() => {
    if (!timelineQ.data) return [];
    if (!filterText) return timelineQ.data;
    const lower = filterText.toLowerCase();
    return timelineQ.data.filter(evt => 
      evt.message?.toLowerCase().includes(lower) ||
      getEventLabel(evt.event_type).toLowerCase().includes(lower) ||
      getActorName(evt).toLowerCase().includes(lower) ||
      evt.cases?.title?.toLowerCase().includes(lower)
    );
  }, [timelineQ.data, filterText]);

  const getDateFilterLabel = () => {
    if (dateRangeFilter === 'today') return 'Hoje';
    if (dateRangeFilter === '7days') return 'Últimos 7 dias';
    if (dateRangeFilter === 'month') return 'Mês Atual';
    return 'Todo Período';
  };

  const renderHeader = () => (
    <View style={styles.filtersContainer}>
      <View style={styles.searchRow}>
        <Search size={16} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Busque na mensagem..."
          placeholderTextColor="#6B7280"
          value={filterText}
          onChangeText={setFilterText}
        />
        <TouchableOpacity 
          onPress={() => {
            timelineQ.refetch().then(() => {
              // Somente um feedback tátil/visual simples. O ActivityIndicator já mostra que recarregou.
            });
          }}
          disabled={timelineQ.isFetching}
          style={{ padding: 4 }}
        >
          {timelineQ.isFetching ? (
            <ActivityIndicator size="small" color={neon} />
          ) : (
            <RefreshCw size={16} color="#9CA3AF" />
          )}
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
        {(dateRangeFilter !== 'all' || selectedEventTypes.size > 0 || selectedActors.size > 0 || filterText !== '') && (
          <TouchableOpacity 
            style={styles.clearFiltersChip}
            onPress={() => { setDateRangeFilter('all'); setSelectedEventTypes(new Set()); setSelectedActors(new Set()); setFilterText(''); }}
          >
            <Text style={styles.clearFiltersText}>Limpar</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.filterChip, dateRangeFilter !== 'all' && [styles.filterChipActive, { backgroundColor: neon, borderColor: neon }]]} onPress={() => setShowDateFilter(true)}>
          <Calendar size={13} color={dateRangeFilter !== 'all' ? '#000' : '#9CA3AF'} />
          <Text style={[styles.filterChipText, dateRangeFilter !== 'all' && styles.filterChipTextActive]}>Data: {getDateFilterLabel()}</Text>
          <ChevronDown size={12} color={dateRangeFilter !== 'all' ? '#000' : '#6B7280'} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.filterChip, selectedEventTypes.size > 0 && [styles.filterChipActive, { backgroundColor: neon, borderColor: neon }]]} onPress={() => setShowTypeFilter(true)}>
          <Zap size={13} color={selectedEventTypes.size > 0 ? '#000' : '#9CA3AF'} />
          <Text style={[styles.filterChipText, selectedEventTypes.size > 0 && styles.filterChipTextActive]}>
            Funcionalidade: {selectedEventTypes.size === 0 ? 'Todas' : `${selectedEventTypes.size}`}
          </Text>
          <ChevronDown size={12} color={selectedEventTypes.size > 0 ? '#000' : '#6B7280'} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.filterChip, selectedActors.size > 0 && [styles.filterChipActive, { backgroundColor: neon, borderColor: neon }]]} onPress={() => setShowActorFilter(true)}>
          <Users size={13} color={selectedActors.size > 0 ? '#000' : '#9CA3AF'} />
          <Text style={[styles.filterChipText, selectedActors.size > 0 && styles.filterChipTextActive]}>
            Pessoa: {selectedActors.size === 0 ? 'Todas' : `${selectedActors.size}`}
          </Text>
          <ChevronDown size={12} color={selectedActors.size > 0 ? '#000' : '#6B7280'} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderHeader()}
      {timelineQ.isLoading ? (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={neon} />
        <Text style={styles.loadingText}>Carregando linha do tempo...</Text>
        </View>
      ) : (!filteredData || filteredData.length === 0) ? (
        <View style={styles.emptyContainer}>
          <Zap size={40} color="#333" />
          <Text style={styles.emptyText}>Nenhum evento registrado ainda.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
              refreshing={timelineQ.isRefetching} 
              onRefresh={() => timelineQ.refetch()} 
              tintColor={neon} 
              colors={[neon]} 
            />
          }
          renderItem={({ item, index }) => (
            <View style={styles.eventRow}>
              {/* Linha vertical (Timeline line) */}
              <View style={styles.timelineLineContainer}>
                <View style={[styles.line, index === filteredData.length - 1 && styles.lineHidden]} />
            <View style={styles.iconContainer}>
              <Clock size={12} color={neon} />
            </View>
          </View>

          {/* Card de Conteúdo */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.dateText}>
                {new Date(item.occurred_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{getEventLabel(item.event_type)}</Text>
              </View>
            </View>

            <Text style={styles.messageText}>{item.message}</Text>

            <View style={styles.footerTags}>
              <View style={styles.tag}>
                <Users size={10} color="#9CA3AF" />
                <Text style={styles.tagText}>{getActorName(item)}</Text>
              </View>
              {item.cases?.title && (
                <View style={styles.tag}>
                  <Activity size={10} color="#9CA3AF" />
                  <Text style={styles.tagText} numberOfLines={1}>Caso: {item.cases.title}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}
    />
  )}

      {/* Date Filter Modal */}
      <Modal visible={showDateFilter} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Período</Text>
              <TouchableOpacity onPress={() => setShowDateFilter(false)}><X size={20} color="#9CA3AF" /></TouchableOpacity>
            </View>
            {[
              { id: 'all', label: 'Todo Período' },
              { id: 'today', label: 'Hoje' },
              { id: '7days', label: 'Últimos 7 dias' },
              { id: 'month', label: 'Mês Atual' },
            ].map(opt => (
              <TouchableOpacity key={opt.id} style={styles.modalOpt} onPress={() => { setDateRangeFilter(opt.id as any); setShowDateFilter(false); }}>
                <Text style={[styles.modalOptText, dateRangeFilter === opt.id && [styles.modalOptTextActive, { color: neon }]]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Type Filter Modal */}
      <Modal visible={showTypeFilter} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Funcionalidade</Text>
              <TouchableOpacity onPress={() => setShowTypeFilter(false)}><X size={20} color="#9CA3AF" /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {(eventTypesQ.data || []).map(opt => (
                <TouchableOpacity key={opt} style={styles.modalOpt} onPress={() => {
                  const n = new Set(selectedEventTypes);
                  n.has(opt) ? n.delete(opt) : n.add(opt);
                  setSelectedEventTypes(n);
                }}>
                  <View style={[styles.checkbox, selectedEventTypes.has(opt) && [styles.checkboxActive, { backgroundColor: neon, borderColor: neon }]]} />
                  <Text style={styles.modalOptText}>{getEventLabel(opt)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Actor Filter Modal */}
      <Modal visible={showActorFilter} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pessoa</Text>
              <TouchableOpacity onPress={() => setShowActorFilter(false)}><X size={20} color="#9CA3AF" /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {actorOptions.map(([id, label]) => (
                <TouchableOpacity key={id} style={styles.modalOpt} onPress={() => {
                  const n = new Set(selectedActors);
                  n.has(id) ? n.delete(id) : n.add(id);
                  setSelectedActors(n);
                }}>
                  <View style={[styles.checkbox, selectedActors.has(id) && [styles.checkboxActive, { backgroundColor: neon, borderColor: neon }]]} />
                  <Text style={styles.modalOptText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    backgroundColor: '#0A0A0A',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    height: 40,
    color: '#FFF',
    fontSize: 13,
    marginLeft: 8,
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 5,
  },
  filterChipActive: {
    // dynamic bg
    // dynamic border
  },
  filterChipText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  clearFiltersChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  clearFiltersText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 10,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#9CA3AF',
    marginTop: 10,
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  eventRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineLineContainer: {
    width: 30,
    alignItems: 'center',
  },
  line: {
    position: 'absolute',
    top: 24,
    bottom: -30,
    width: 2,
    backgroundColor: '#333',
  },
  lineHidden: {
    display: 'none',
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  card: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    padding: 12,
    marginLeft: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateText: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  badgeText: {
    color: '#D1D5DB',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  messageText: {
    color: '#E5E7EB',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  footerTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    maxWidth: '80%',
  },
  tagText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#111',
    borderRadius: 20,
    width: '100%',
    maxHeight: '80%',
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    gap: 12,
  },
  modalOptText: {
    color: '#D1D5DB',
    fontSize: 14,
  },
  modalOptTextActive: {
    // dynamic color
    fontWeight: 'bold',
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#6B7280',
  },
  checkboxActive: {
    // dynamic bg
  },
});
