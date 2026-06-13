import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  
  ScrollView,
  TextInput,
  Modal,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTenant } from '../../providers/TenantProvider';
import { useSession } from '../../providers/SessionProvider';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import {
  Search,
  Building2,
  Plus,
  User as UserIcon,
  Clock,
  Tag,
  MapPin,
  Package,
  Check,
  X,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react-native';
import { UserMenuButton } from '../../components/UserMenuButton';

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

function toMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function stringToColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
}

// ─── CRM Screen ───────────────────────────────────────────────────────────────

export function ClientesM30Screen({ navigation }: any) {
  const { activeTenantId, isSuperAdmin, activeTenant, tenants, clearActiveTenant } = useTenant();
  const { user } = useSession();
  const neon = activeTenant?.neon_primary || '#A3FF47';

  const [searchQuery, setSearchQuery] = useState('');
  const isAdminOrSuper = isSuperAdmin || activeTenant?.role === 'admin';
  const canSwitchTenant = isSuperAdmin || tenants.length > 1;

  const [activeFilterModal, setActiveFilterModal] = useState<'users' | 'entities' | 'instances' | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [instanceFilterId, setInstanceFilterId] = useState<string>('all');

  const activeFiltersCount =
    (selectedUserIds.length > 0 ? 1 : 0) +
    (selectedEntities.length > 0 ? 1 : 0) +
    (instanceFilterId !== 'all' ? 1 : 0);

  // ── Journeys ────────────────────────────────────────────────────────────────
  const { data: journeys } = useQuery({
    queryKey: ['tenant_m30_journey', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_journeys')
        .select('journeys(id,key,name,is_crm,default_state_machine_json)')
        .eq('tenant_id', activeTenantId!)
        .eq('enabled', true);
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => r.journeys)
        .filter((j: any) => j && j.key === 'operacao_m30');
    },
  });

  const selectedJourney = journeys?.[0];
  const stages = useMemo(() => {
    const st = (selectedJourney?.default_state_machine_json?.states ?? []) as string[];
    return Array.from(new Set((st ?? []).map((s) => String(s)).filter(Boolean)));
  }, [selectedJourney]);

  // ── Cases ───────────────────────────────────────────────────────────────────
  const { data: cases, isLoading: casesLoading, refetch } = useQuery({
    queryKey: ['crm_cases_by_tenant', activeTenantId, user?.id, isAdminOrSuper],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from('cases')
        .select(`id,customer_entity_id,title,status,state,created_at,updated_at,assigned_user_id,is_chat,users_profile!fk_cases_users_profile(display_name,email),journeys!cases_journey_id_fkey(key,name,is_crm),meta_json`)
        .eq('tenant_id', activeTenantId!)
        .is('deleted_at', null)
        .eq('is_chat', false);
      if (!isAdminOrSuper && user?.id) q = q.eq('assigned_user_id', user.id);
      const { data, error } = await q.order('updated_at', { ascending: false }).limit(800);
      if (error) throw error;
      return data ?? [];
    },
  });

  const journeyRows = useMemo(() => {
    if (!selectedJourney) return [];
    return (cases ?? []).filter((r: any) => {
      const keyFromJoin = r.journeys?.key ?? null;
      const keyFromMeta = r.meta_json?.journey_key ?? null;
      if (keyFromJoin && keyFromJoin === selectedJourney.key) return true;
      if (keyFromMeta && keyFromMeta === selectedJourney.key) return true;
      return false;
    });
  }, [cases, selectedJourney]);

  const caseIds = useMemo(() => journeyRows.map((c: any) => c.id), [journeyRows]);
  const entityIds = useMemo(() => {
    const ids = new Set<string>();
    journeyRows.forEach((c: any) => { if (c.customer_entity_id) ids.add(c.customer_entity_id); });
    return Array.from(ids);
  }, [journeyRows]);

  // ── Entities ───────────────────────────────────────────────────────────────
  const { data: entitiesMap } = useQuery({
    queryKey: ['m30_entities', activeTenantId, entityIds.join(',')],
    enabled: Boolean(activeTenantId && entityIds.length > 0),
    queryFn: async () => {
      const { data, error } = await supabase.from('core_entities').select('id,display_name').eq('tenant_id', activeTenantId!).in('id', entityIds);
      if (error) throw error;
      const m = new Map<string, any>();
      data?.forEach((c) => m.set(c.id, c));
      return m;
    },
  });

  // ── Filter Queries ───────────────────────────────────────────────────────────
  const { data: usersQ } = useQuery({
    queryKey: ['crm_assignable_users', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from('users_profile').select('user_id,display_name,email').eq('tenant_id', activeTenantId!).is('deleted_at', null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allInstancesQ } = useQuery({
    queryKey: ['wa_instances_all', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from('wa_instances').select('id,name,phone_number').eq('tenant_id', activeTenantId!).eq('status', 'active').is('deleted_at', null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: availableEntities = [] } = useQuery({
    queryKey: ['m30_active_entities_filter', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('core_entities')
        .select('id, display_name, commercial_commitments!inner(id, status)')
        .eq('tenant_id', activeTenantId!)
        .in('commercial_commitments.status', ['active', 'pending'])
        .is('deleted_at', null)
        .order('display_name');
      if (error) throw error;
      
      const unique = new Map<string, any>();
      for (const e of (data ?? [])) {
        if (!unique.has(e.id)) unique.set(e.id, { id: e.id, display_name: e.display_name });
      }
      const arr = Array.from(unique.values());
      arr.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
      return arr;
    },
  });

  const filteredRows = useMemo(() => {
    return journeyRows.filter((r: any) => {
      if (selectedUserIds.length > 0) {
        if (!r.assigned_user_id || !selectedUserIds.includes(r.assigned_user_id)) return false;
      }
      if (selectedEntities.length > 0) {
        if (!r.customer_entity_id || !selectedEntities.includes(r.customer_entity_id)) return false;
      }
      if (instanceFilterId !== 'all') {
        const metaInst = r.meta_json?.instance_id || r.meta_json?.wa_instance_id;
        if (metaInst !== instanceFilterId) return false;
      }
      return true;
    });
  }, [journeyRows, selectedUserIds, selectedEntities, instanceFilterId]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const sq = searchQuery.toLowerCase().trim();
    return filteredRows.filter((c: any) => {
      const cust = entitiesMap?.get(c.customer_entity_id);
      const text = `${c.title} ${c.state} ${cust?.display_name || ''}`.toLowerCase();
      return text.includes(sq);
    });
  }, [filteredRows, searchQuery, entitiesMap]);

  const casesByState = useMemo(() => {
    const map = new Map<string, any[]>();
    stages.forEach((st) => map.set(st, []));
    filteredRows.forEach((c: any) => {
      const arr = map.get(c.state) || [];
      arr.push(c);
      map.set(c.state, arr);
    });
    return map;
  }, [filteredRows, stages]);

  // ── Card ─────────────────────────────────────────────────────────────────────
  const renderCard = ({ item }: { item: any }) => {
    const cust = entitiesMap?.get(item.customer_entity_id);
    const title = cust?.display_name || item.title || 'Sem título';
    const assignedUser = Array.isArray(item.users_profile) ? item.users_profile[0] : item.users_profile;
    const ownerName = assignedUser?.display_name || 'Não atribuído';
    const handleCasePress = (item: any) => {
      navigation.navigate('OperacaoM30Case', { id: item.id });
    };

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => handleCasePress(item)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          <View style={[styles.statusPill, { backgroundColor: '#1A2A1A' }]}>
            <Text style={[styles.statusPillText, { color: neon }]}>{item.status || 'ok'}</Text>
          </View>
        </View>

        <View style={styles.ownerRow}>
          <UserIcon color="#6B7280" size={13} />
          <Text style={styles.ownerName} numberOfLines={1}>{ownerName}</Text>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.dateRow}>
            <Clock color="#6B7280" size={13} />
            <Text style={styles.cardDate}>{formatDate(item.updated_at)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Column ───────────────────────────────────────────────────────────────────
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
        />
      </View>
    );
  };

  // ── Filter Modal Content ───────────────────────────────────────────────────
  const renderFilterModalContent = () => {
    if (activeFilterModal === 'users') {
      return (
        <ScrollView style={styles.modalScroll}>
          {usersQ?.map((u: any) => {
            const isSelected = selectedUserIds.includes(u.user_id);
            return (
              <TouchableOpacity
                key={u.user_id}
                style={styles.modalRow}
                onPress={() => {
                  setSelectedUserIds((prev) =>
                    isSelected ? prev.filter((id) => id !== u.user_id) : [...prev, u.user_id]
                  );
                  setActiveFilterModal(null);
                }}
              >
                <Text style={[styles.modalRowText, isSelected && { color: neon, fontWeight: '700' }]}>
                  {u.display_name || u.email || 'Usuário'}
                </Text>
                {isSelected && <Check color={neon} size={18} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      );
    }
    if (activeFilterModal === 'entities') {
      return (
        <ScrollView style={styles.modalScroll}>
          {availableEntities.map((cust) => {
            const isSelected = selectedEntities.includes(cust.id);
            return (
              <TouchableOpacity
                key={cust.id}
                style={styles.modalRow}
                onPress={() => {
                  setSelectedEntities((prev) =>
                    isSelected ? prev.filter((id) => id !== cust.id) : [...prev, cust.id]
                  );
                  setActiveFilterModal(null);
                }}
              >
                <Text style={[styles.modalRowText, isSelected && { color: neon, fontWeight: '700' }]}>{cust.display_name}</Text>
                {isSelected && <Check color={neon} size={18} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      );
    }
    if (activeFilterModal === 'instances') {
      return (
        <ScrollView style={styles.modalScroll}>
          <TouchableOpacity style={styles.modalRow} onPress={() => { setInstanceFilterId('all'); setActiveFilterModal(null); }}>
            <Text style={[styles.modalRowText, instanceFilterId === 'all' && { color: neon, fontWeight: '700' }]}>Todas</Text>
            {instanceFilterId === 'all' && <Check color={neon} size={18} />}
          </TouchableOpacity>
          {allInstancesQ?.map((inst: any) => {
            const isSelected = instanceFilterId === inst.id;
            return (
              <TouchableOpacity key={inst.id} style={styles.modalRow} onPress={() => { setInstanceFilterId(inst.id); setActiveFilterModal(null); }}>
                <Text style={[styles.modalRowText, isSelected && { color: neon, fontWeight: '700' }]}>{inst.name}</Text>
                {isSelected && <Check color={neon} size={18} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      );
    }
    return null;
  };

  const clearFilters = () => {
    setSelectedUserIds([]);
    setSelectedEntities([]);
    setInstanceFilterId('all');
  };

  if (!selectedJourney && !casesLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.topBar}>
            <Text style={styles.mainTitle}>Clientes M30</Text>
          </View>
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateTitle}>Gestão não habilitada</Text>
            <Text style={styles.emptyStateSubtitle}>A jornada "operacao_m30" não está ativa ou não existe neste workspace.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        {/* ── Header ── */}
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <Text style={styles.mainTitle}>Clientes M30</Text>
          </View>
          <View style={styles.topRight}>
            {canSwitchTenant && (
              <TouchableOpacity style={styles.iconBtn} onPress={clearActiveTenant}>
                <Building2 color="#6B7280" size={18} />
              </TouchableOpacity>
            )}
            <UserMenuButton />
          </View>
        </View>

        {/* ── Search ── */}
        <View style={styles.searchContainer}>
          <Search color="#6B7280" size={16} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar casos..."
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

        {/* ── Filter Chips ── */}
        <View style={styles.filtersWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>

            {activeFiltersCount > 0 && (
              <TouchableOpacity style={styles.clearFiltersChip} onPress={clearFilters}>
                <X color="#EF4444" size={13} />
                <Text style={styles.clearFiltersText}>Limpar ({activeFiltersCount})</Text>
              </TouchableOpacity>
            )}

            <FilterChip
              icon={<UserIcon size={13} color={selectedUserIds.length > 0 ? '#000' : '#9CA3AF'} />}
              label={`Usuários${selectedUserIds.length > 0 ? ` (${selectedUserIds.length})` : ''}`}
              active={selectedUserIds.length > 0}
              onPress={() => setActiveFilterModal('users')}
            />
            <FilterChip
              icon={<UserIcon size={13} color={selectedEntities.length > 0 ? '#000' : '#9CA3AF'} />}
              label={`Clientes${selectedEntities.length > 0 ? ` (${selectedEntities.length})` : ''}`}
              active={selectedEntities.length > 0}
              onPress={() => setActiveFilterModal('entities')}
            />
            <FilterChip
              icon={<MapPin size={13} color={instanceFilterId !== 'all' ? '#000' : '#9CA3AF'} />}
              label="Instância"
              active={instanceFilterId !== 'all'}
              onPress={() => setActiveFilterModal('instances')}
            />
          </ScrollView>
        </View>

        {/* ── Content ── */}
        {casesLoading ? (
          <ActivityIndicator size="large" color={neon} style={styles.loader} />
        ) : searchQuery.trim().length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={(c) => c.id}
            renderItem={renderCard}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.searchListContent}
            ListEmptyComponent={<Text style={styles.emptyText}>Nenhum resultado.</Text>}
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

      {/* FAB */}
      <TouchableOpacity style={[styles.fab, { backgroundColor: neon, shadowColor: neon }]} onPress={() => navigation.navigate('NewOperacaoM30Case')}>
        <Plus size={24} color="#000000" />
      </TouchableOpacity>

      {/* ── Filter Bottom Sheet ── */}
      <Modal
        visible={activeFilterModal !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveFilterModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setActiveFilterModal(null)}>
          <Pressable style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeFilterModal === 'users' && 'Filtrar por Usuário'}
                {activeFilterModal === 'tags' && 'Filtrar por Tag'}
                {activeFilterModal === 'instances' && 'Filtrar por Instância'}
                {activeFilterModal === 'products' && 'Filtrar por Produto'}
              </Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setActiveFilterModal(null)}>
                <X color="#9CA3AF" size={20} />
              </TouchableOpacity>
            </View>
            {renderFilterModalContent()}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Filter Chip Component ────────────────────────────────────────────────────

function FilterChip({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.filterPill, active && { backgroundColor: neon, borderColor: neon }]}
      onPress={onPress}
    >
      {icon}
      <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{label}</Text>
      {active && <Check size={11} color="#000" />}
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },

  // Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  topLeft: {},
  topRight: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F9FAFB',
    letterSpacing: -0.5,
  },
  iconBtn: {
    padding: 8,
    backgroundColor: '#141414',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#A3FF47',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#A3FF47',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },

  // Search
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
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#F9FAFB',
  },

  // Filters
  filtersWrapper: {
    height: 52,
    marginBottom: 4,
  },
  filtersScroll: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 5,
  },
  filterPillActive: {
    backgroundColor: '#A3FF47',
    borderColor: '#A3FF47',
  },
  filterPillText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  clearFiltersChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A0A0A',
    borderWidth: 1,
    borderColor: '#7F1D1D',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 5,
  },
  clearFiltersText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },

  // Loader / empty
  loader: { marginTop: 60 },
  emptyStateContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyStateTitle: { color: '#F9FAFB', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyStateSubtitle: { color: '#6B7280', fontSize: 14, textAlign: 'center' },
  emptyText: { color: '#4B5563', fontSize: 13, marginTop: 16, textAlign: 'center' },

  // Kanban
  searchListContent: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  kanbanScroll: { paddingHorizontal: 16, paddingBottom: 20 },
  columnContainer: { width: COLUMN_WIDTH, paddingRight: 16 },
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  colHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colDot: { width: 8, height: 8, borderRadius: 4 },
  colTitle: { color: '#F9FAFB', fontSize: 14, fontWeight: '700' },
  colCountBadge: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  colCountText: { color: '#9CA3AF', fontSize: 11, fontWeight: '600' },
  colTotalValue: { color: '#A3FF47', fontSize: 13, fontWeight: '600' },
  colListContent: { paddingBottom: 100, gap: 10 },

  // Card
  card: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardTitle: { color: '#F9FAFB', fontSize: 15, fontWeight: '700', flex: 1, marginRight: 10 },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  ownerName: { color: '#6B7280', fontSize: 12, flex: 1 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1F1F1F',
    paddingTop: 10,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardDate: { color: '#6B7280', fontSize: 12 },
  cardValue: { color: '#A3FF47', fontSize: 13, fontWeight: '700' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 360,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#2A2A2A',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  modalTitle: { color: '#F9FAFB', fontSize: 16, fontWeight: '700' },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: { padding: 12 },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  modalRowText: { color: '#D1D5DB', fontSize: 15 },
  modalRowTextSelected: { color: '#A3FF47', fontWeight: '700' },
});
