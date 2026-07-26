import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useTenant } from '../../../providers/TenantProvider';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import {
  Search,
  X,
  Bot,
  Clock,
  MessageSquare,
  PauseCircle,
  PlayCircle
} from 'lucide-react-native';

const { width: SCREEN_WIDTH } = require('react-native').Dimensions.get('window');
const COLUMN_WIDTH = SCREEN_WIDTH * 0.85;

function titleizeState(s: string) {
  return (s ?? '')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${min}`;
}

function stringToColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
}

export function BeeIACrmTab({ navigation }: { navigation: any }) {
  const { activeTenantId, activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';
  const [searchQuery, setSearchQuery] = useState('');

  const { data: beeiaJourney } = useQuery({
    queryKey: ['tenant_journey_beeia', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journeys')
        .select('id,key,name,is_crm,default_state_machine_json')
        .eq('key', 'beeia_crm')
        .maybeSingle();
      
      if (error) throw error;
      return data || null;
    },
  });

  const stages = ['contato', 'morno', 'quente', 'frio', 'pausadas'];

  const { data: cases, isLoading: casesLoading, refetch } = useQuery({
    queryKey: ['beeia_cases_mobile', activeTenantId],
    enabled: Boolean(activeTenantId) && Boolean(beeiaJourney),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select(`
          id, customer_id, title, status, state, created_at, updated_at, assigned_user_id, meta_json, beeia_paused,
          customer_accounts:customer_id(name, phone_e164)
        `)
        .eq('tenant_id', activeTenantId!)
        .eq('journey_id', beeiaJourney.id)
        .eq('status', 'open')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredCases = useMemo(() => {
    if (!searchQuery.trim()) return cases ?? [];
    const sq = searchQuery.toLowerCase().trim();
    return (cases ?? []).filter((c: any) => {
      const custName = (c.customer_accounts?.name ?? '').toLowerCase();
      const title = (c.title ?? '').toLowerCase();
      const phone = (c.customer_accounts?.phone_e164 ?? '').toLowerCase();
      return custName.includes(sq) || title.includes(sq) || phone.includes(sq);
    });
  }, [cases, searchQuery]);

  const casesByState = useMemo(() => {
    const map: Record<string, any[]> = {
      contato: [],
      morno: [],
      quente: [],
      frio: [],
      pausadas: [],
    };
    filteredCases.forEach((c: any) => {
      if (c.beeia_paused) {
        map.pausadas.push(c);
      } else if (map[c.state]) {
        map[c.state].push(c);
      } else {
        map.contato.push(c);
      }
    });
    
    // Convert back to Map so the existing renderColumn code works
    const finalMap = new Map<string, any[]>();
    stages.forEach(st => finalMap.set(st, map[st]));
    return finalMap;
  }, [filteredCases]);

  const renderCard = ({ item }: { item: any }) => {
    const isPaused = item.beeia_paused === true;
    const title = item.customer_accounts?.name || item.customer_accounts?.phone_e164 || item.title || 'Sem título';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => navigation.navigate('CaseDetail', { id: item.id })}
      >
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
            <Bot color={isPaused ? "#6B7280" : neon} size={16} />
            <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: isPaused ? '#374151' : '#1A2A1A' }]}>
            {isPaused ? <PauseCircle color="#D1D5DB" size={12} /> : <PlayCircle color={neon} size={12} />}
            <Text style={[styles.statusPillText, { color: isPaused ? '#D1D5DB' : neon, marginLeft: 4 }]}>
              {isPaused ? 'Pausado' : 'Ativo'}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.dateRow}>
            <Clock color="#6B7280" size={13} />
            <Text style={styles.cardDate}>{formatDate(item.updated_at)}</Text>
          </View>
          <View style={styles.dateRow}>
            <MessageSquare color="#6B7280" size={13} />
            <Text style={styles.cardDate}>Abrir Chat</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderColumn = ({ item: state }: { item: string }) => {
    const stateCases = casesByState.get(state) || [];
    const dotColor = stringToColor(state);

    return (
      <View style={styles.columnContainer}>
        <View style={styles.colHeader}>
          <View style={styles.colHeaderLeft}>
            <View style={[styles.colDot, { backgroundColor: dotColor }]} />
            <Text style={styles.colTitle}>{titleizeState(state)}</Text>
            <View style={styles.colCountBadge}>
              <Text style={styles.colCountText}>{stateCases.length}</Text>
            </View>
          </View>
        </View>

        <FlatList
          data={stateCases}
          keyExtractor={(c) => c.id}
          renderItem={renderCard}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.colListContent}
          ListEmptyComponent={<Text style={styles.emptyText}>Vazio</Text>}
          refreshControl={<RefreshControl refreshing={casesLoading} onRefresh={refetch} tintColor={neon} />}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Search color="#6B7280" size={16} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar interações..."
          placeholderTextColor="#4B5563"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X color="#6B7280" size={16} />
          </TouchableOpacity>
        )}
      </View>

      {casesLoading && !cases ? (
        <ActivityIndicator size="large" color={neon} style={styles.loader} />
      ) : searchQuery.trim().length > 0 ? (
        <FlatList
          data={filteredCases}
          keyExtractor={(c) => c.id}
          renderItem={renderCard}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.searchListContent}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhum resultado.</Text>}
          refreshControl={<RefreshControl refreshing={casesLoading} onRefresh={refetch} tintColor={neon} />}
        />
      ) : (
        <FlatList
          horizontal
          data={stages}
          keyExtractor={(s) => s}
          renderItem={renderColumn}
          showsHorizontalScrollIndicator={false}
          decelerationRate="normal"
          contentContainerStyle={styles.kanbanScroll}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', paddingTop: 16 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#F9FAFB' },
  loader: { marginTop: 60 },
  emptyText: { color: '#4B5563', fontSize: 13, marginTop: 16, textAlign: 'center' },
  searchListContent: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  kanbanScroll: { paddingHorizontal: 16, paddingBottom: 20 },
  columnContainer: { width: COLUMN_WIDTH, paddingRight: 16 },
  colHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  colHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colDot: { width: 8, height: 8, borderRadius: 4 },
  colTitle: { color: '#F9FAFB', fontSize: 14, fontWeight: '700' },
  colCountBadge: { backgroundColor: '#2A2A2A', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  colCountText: { color: '#9CA3AF', fontSize: 11, fontWeight: '600' },
  colListContent: { paddingBottom: 100, gap: 10 },
  card: { backgroundColor: '#141414', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle: { flex: 1, color: '#F9FAFB', fontSize: 15, fontWeight: '600' },
  statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  statusPillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardDate: { color: '#6B7280', fontSize: 12, fontWeight: '500' },
});
