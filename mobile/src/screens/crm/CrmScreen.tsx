import React, { useMemo, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  ActivityIndicator, 
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  TextInput,
  ScrollView,
  Modal,
  Pressable
} from 'react-native';
import { useTenant } from '../../providers/TenantProvider';
import { useSession } from '../../providers/SessionProvider';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { 
  ArrowLeft, 
  MoreVertical, 
  MessageSquare,
  Building2,
  Search,
  User as UserIcon,
  Clock,
  Plus,
  Tag,
  MapPin,
  Package,
  Check,
  X
} from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_WIDTH = SCREEN_WIDTH * 0.85;

function titleizeState(s: string) {
  return (s ?? "")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function toMoney(v: number) {
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
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
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
}

export function CrmScreen({ navigation }: any) {
  const { activeTenantId, isSuperAdmin, activeTenant, tenants, clearActiveTenant } = useTenant();
  const { user } = useSession();

  const [searchQuery, setSearchQuery] = useState("");

  const isAdminOrSuper = isSuperAdmin || activeTenant?.role === "admin";
  const canSwitchTenant = isSuperAdmin || tenants.length > 1;

  // Filters State
  const [activeFilterModal, setActiveFilterModal] = useState<'users' | 'tags' | 'instances' | 'products' | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [instanceFilterId, setInstanceFilterId] = useState<string>("all");
  const [productFilterId, setProductFilterId] = useState<string>("all");

  // 1. Fetch CRM Journeys to get the stages
  const { data: journeys } = useQuery({
    queryKey: ["tenant_crm_journeys_enabled", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("journeys(id,key,name,is_crm,default_state_machine_json)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true);
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => r.journeys)
        .filter((j: any) => j && j.is_crm);
    },
  });

  const selectedJourney = journeys?.[0];
  
  const stages = useMemo(() => {
    const st = (selectedJourney?.default_state_machine_json?.states ?? []) as string[];
    const normalized = (st ?? []).map((s) => String(s)).filter(Boolean);
    return Array.from(new Set(normalized));
  }, [selectedJourney]);

  // 2. Fetch Cases
  const { data: cases, isLoading: casesLoading } = useQuery({
    queryKey: ["crm_cases_by_tenant", activeTenantId, user?.id, isAdminOrSuper],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let q = supabase
        .from("cases")
        .select(`
          id,
          customer_id,
          title,
          status,
          state,
          created_at,
          updated_at,
          assigned_user_id,
          is_chat,
          users_profile!fk_cases_users_profile(display_name, email),
          journeys!cases_journey_id_fkey(key, name, is_crm),
          meta_json
        `)
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .eq("is_chat", false);

      if (!isAdminOrSuper && user?.id) {
        q = q.eq("assigned_user_id", user.id);
      }

      const { data, error } = await q
        .order("updated_at", { ascending: false })
        .limit(800);

      if (error) throw error;
      return data ?? [];
    },
  });

  const journeyRows = useMemo(() => {
    if (!selectedJourney) return [];
    return (cases ?? []).filter(r => {
      const keyFromJoin = r.journeys?.key ?? null;
      const keyFromMeta = r.meta_json?.journey_key ?? null;
      if (keyFromJoin && keyFromJoin === selectedJourney.key) return true;
      if (keyFromMeta && keyFromMeta === selectedJourney.key) return true;
      return false;
    });
  }, [cases, selectedJourney]);

  const caseIds = useMemo(() => journeyRows.map(c => c.id), [journeyRows]);
  const customerIds = useMemo(() => {
    const ids = new Set<string>();
    journeyRows.forEach(c => {
      if (c.customer_id) ids.add(c.customer_id);
    });
    return Array.from(ids);
  }, [journeyRows]);

  // 3. Fetch Customers
  const { data: customersMap } = useQuery({
    queryKey: ["crm_customers", activeTenantId, customerIds.join(",")],
    enabled: Boolean(activeTenantId && customerIds.length > 0),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_accounts")
        .select("id,phone_e164,name,email")
        .eq("tenant_id", activeTenantId!)
        .in("id", customerIds);
      if (error) throw error;
      const m = new Map<string, any>();
      data?.forEach(c => m.set(c.id, c));
      return m;
    },
  });

  // Filters Data Queries
  const { data: usersQ } = useQuery({
    queryKey: ["crm_assignable_users", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("users_profile")
        .select("user_id, display_name, email")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allInstancesQ } = useQuery({
    queryKey: ["wa_instances_all", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("wa_instances")
        .select("id,name,phone_number")
        .eq("tenant_id", activeTenantId!)
        .eq("status", "active")
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: tagsQ } = useQuery({
    queryKey: ["crm_case_tags", activeTenantId, caseIds.join(",")],
    enabled: Boolean(activeTenantId && caseIds.length > 0),
    queryFn: async () => {
      const { data, error } = await supabase.from("case_tags")
        .select("case_id,tag")
        .eq("tenant_id", activeTenantId!)
        .in("case_id", caseIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: caseItemsQ } = useQuery({
    queryKey: ["crm_case_items_batch", activeTenantId, caseIds.join(",")],
    enabled: Boolean(activeTenantId && caseIds.length > 0),
    queryFn: async () => {
      const { data, error } = await supabase.from("case_items")
        .select("case_id, description, qty, price, total, offering_entity_id")
        .eq("tenant_id", activeTenantId!)
        .in("case_id", caseIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Derived Filter Data
  const allTags = useMemo(() => {
    const s = new Set<string>();
    tagsQ?.forEach(t => { if (t.tag) s.add(t.tag); });
    return Array.from(s).sort();
  }, [tagsQ]);

  const tagsByCase = useMemo(() => {
    const m = new Map<string, string[]>();
    tagsQ?.forEach(r => {
      const cid = String(r.case_id);
      const t = String(r.tag);
      const cur = m.get(cid) ?? [];
      if (!cur.includes(t)) cur.push(t);
      m.set(cid, cur);
    });
    return m;
  }, [tagsQ]);

  const itemsByCase = useMemo(() => {
    const m = new Map<string, { total: number; items: any[] }>();
    caseItemsQ?.forEach(r => {
      const cid = String(r.case_id);
      const cur = m.get(cid) ?? { total: 0, items: [] };
      const t = r.total ?? ((r.qty ?? 1) * (r.price ?? 0));
      cur.total += Number(t) || 0;
      cur.items.push(r);
      m.set(cid, cur);
    });
    return m;
  }, [caseItemsQ]);

  const availableProducts = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    caseItemsQ?.forEach(r => {
      const id = r.offering_entity_id || r.description;
      const name = r.description || "Produto Desconhecido";
      if (id && !map.has(id)) {
        map.set(id, { id, name });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [caseItemsQ]);

  // Apply filters logic
  const filteredRows = useMemo(() => {
    return journeyRows.filter(r => {
      // User Filter
      if (selectedUserIds.length > 0) {
        if (!r.assigned_user_id || !selectedUserIds.includes(r.assigned_user_id)) return false;
      }
      
      // Tag Filter
      if (selectedTags.length > 0) {
        const cTags = tagsByCase.get(r.id) ?? [];
        if (!selectedTags.every(t => cTags.includes(t))) return false;
      }

      // Instance Filter
      if (instanceFilterId !== "all") {
        const metaInst = r.meta_json?.instance_id || r.meta_json?.wa_instance_id;
        if (metaInst !== instanceFilterId) return false;
      }

      // Product Filter
      if (productFilterId !== "all") {
        const cData = itemsByCase.get(r.id);
        if (!cData) return false;
        const hasProd = cData.items.some(it => 
          it.offering_entity_id === productFilterId || 
          it.description === productFilterId
        );
        if (!hasProd) return false;
      }

      return true;
    });
  }, [journeyRows, selectedUserIds, selectedTags, instanceFilterId, productFilterId, tagsByCase, itemsByCase]);

  // Search Results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const sq = searchQuery.toLowerCase().trim();
    
    return filteredRows.filter(c => {
      const cust = customersMap?.get(c.customer_id);
      const text = `${c.title} ${c.state} ${cust?.name} ${cust?.email}`.toLowerCase();
      return text.includes(sq);
    });
  }, [filteredRows, searchQuery, customersMap]);

  // Kanban Columns
  const casesByState = useMemo(() => {
    const map = new Map<string, any[]>();
    stages.forEach(st => map.set(st, []));

    filteredRows.forEach(c => {
      const arr = map.get(c.state) || [];
      arr.push(c);
      map.set(c.state, arr);
    });

    return map;
  }, [filteredRows, stages]);

  const renderCard = ({ item }: { item: any }) => {
    const caseData = itemsByCase.get(item.id);
    const val = caseData?.total ?? 0;
    const cust = customersMap?.get(item.customer_id);
    const title = cust?.name || item.title || 'Untitled Project';
    
    const assignedUser = Array.isArray(item.users_profile) ? item.users_profile[0] : item.users_profile;
    const ownerName = assignedUser?.display_name || 'Unassigned';
    const ownerEmail = assignedUser?.email || '';

    return (
      <TouchableOpacity 
        style={styles.card} 
        activeOpacity={0.7} 
        onPress={() => navigation.navigate('CaseDetail', { id: item.id })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{item.status || 'ok'}</Text>
          </View>
        </View>

        <View style={styles.ownerRow}>
          <UserIcon color="#9CA3AF" size={14} />
          <Text style={styles.ownerName} numberOfLines={1}>
            {ownerName} {ownerEmail ? `• ${ownerEmail}` : ''}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.dateRow}>
            <Clock color="#9CA3AF" size={14} />
            <Text style={styles.cardDate}>{formatDate(item.updated_at)}</Text>
          </View>
          {val > 0 && (
             <Text style={styles.cardValue}>{toMoney(val)}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderColumn = ({ item: state }: { item: string }) => {
    const stateCases = casesByState.get(state) || [];
    const stateTotalValue = stateCases.reduce((acc, c) => acc + (itemsByCase.get(c.id)?.total ?? 0), 0);
    const dotColor = stringToColor(state);

    return (
      <View style={styles.columnContainer}>
        <View style={styles.colHeader}>
          <View style={styles.colHeaderLeft}>
            <View style={[styles.colDot, { backgroundColor: dotColor }]} />
            <Text style={styles.colTitle}>{titleizeState(state)} · {stateCases.length}</Text>
          </View>
          {stateTotalValue > 0 && (
            <Text style={styles.colTotalValue}>{toMoney(stateTotalValue)}</Text>
          )}
        </View>

        <FlatList
          data={stateCases}
          keyExtractor={(c) => c.id}
          renderItem={renderCard}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.colListContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No projects.</Text>
          }
        />
      </View>
    );
  };



  const topBarContent = (
    <View style={styles.topBar}>
      <View style={styles.topLeft}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}><ArrowLeft color="#E5E7EB" size={24} /></TouchableOpacity>
      </View>
      
      <View style={styles.topRight}>
        {canSwitchTenant && (
          <TouchableOpacity style={styles.switchTenantBtn} onPress={clearActiveTenant}>
            <Building2 color="#E5E7EB" size={20} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('NewLead')}>
          <Plus color="#00E5FF" size={24} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn}><MoreVertical color="#E5E7EB" size={24} /></TouchableOpacity>
      </View>
    </View>
  );

  if (!selectedJourney && !casesLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {topBarContent}
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateTitle}>CRM não habilitado</Text>
            <Text style={styles.emptyStateSubtitle}>Este workspace não possui uma jornada de CRM ativa no momento.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }
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
                  if (isSelected) {
                    setSelectedUserIds(prev => prev.filter(id => id !== u.user_id));
                  } else {
                    setSelectedUserIds(prev => [...prev, u.user_id]);
                  }
                  setActiveFilterModal(null);
                }}
              >
                <Text style={[styles.modalRowText, isSelected && styles.modalRowTextSelected]}>
                  {u.display_name || u.email || 'Usuário Sem Nome'}
                </Text>
                {isSelected && <Check color="#00E5FF" size={20} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      );
    }
    
    if (activeFilterModal === 'tags') {
      return (
        <ScrollView style={styles.modalScroll}>
          {allTags.map((tag) => {
            const isSelected = selectedTags.includes(tag);
            return (
              <TouchableOpacity 
                key={tag} 
                style={styles.modalRow}
                onPress={() => {
                  if (isSelected) {
                    setSelectedTags(prev => prev.filter(t => t !== tag));
                  } else {
                    setSelectedTags(prev => [...prev, tag]);
                  }
                  setActiveFilterModal(null);
                }}
              >
                <Text style={[styles.modalRowText, isSelected && styles.modalRowTextSelected]}>{tag}</Text>
                {isSelected && <Check color="#00E5FF" size={20} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      );
    }

    if (activeFilterModal === 'instances') {
      return (
        <ScrollView style={styles.modalScroll}>
          <TouchableOpacity 
            style={styles.modalRow}
            onPress={() => {
              setInstanceFilterId("all");
              setActiveFilterModal(null);
            }}
          >
            <Text style={[styles.modalRowText, instanceFilterId === "all" && styles.modalRowTextSelected]}>Todas as Instâncias</Text>
            {instanceFilterId === "all" && <Check color="#00E5FF" size={20} />}
          </TouchableOpacity>
          {allInstancesQ?.map((inst: any) => {
            const isSelected = instanceFilterId === inst.id;
            return (
              <TouchableOpacity 
                key={inst.id} 
                style={styles.modalRow}
                onPress={() => {
                  setInstanceFilterId(inst.id);
                  setActiveFilterModal(null);
                }}
              >
                <Text style={[styles.modalRowText, isSelected && styles.modalRowTextSelected]}>{inst.name} ({inst.phone_number})</Text>
                {isSelected && <Check color="#00E5FF" size={20} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      );
    }

    if (activeFilterModal === 'products') {
      return (
        <ScrollView style={styles.modalScroll}>
          <TouchableOpacity 
            style={styles.modalRow}
            onPress={() => {
              setProductFilterId("all");
              setActiveFilterModal(null);
            }}
          >
            <Text style={[styles.modalRowText, productFilterId === "all" && styles.modalRowTextSelected]}>Todos os Produtos</Text>
            {productFilterId === "all" && <Check color="#00E5FF" size={20} />}
          </TouchableOpacity>
          {availableProducts.map((prod) => {
            const isSelected = productFilterId === prod.id;
            return (
              <TouchableOpacity 
                key={prod.id} 
                style={styles.modalRow}
                onPress={() => {
                  setProductFilterId(prod.id);
                  setActiveFilterModal(null);
                }}
              >
                <Text style={[styles.modalRowText, isSelected && styles.modalRowTextSelected]}>{prod.name}</Text>
                {isSelected && <Check color="#00E5FF" size={20} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        
        {/* Header area */}
        {topBarContent}

        <View style={styles.headerTitles}>
          <Text style={styles.mainTitle} numberOfLines={1}>CRM da {activeTenant?.name || 'Empresa'}</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Search color="#9CA3AF" size={20} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search leads"
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Filters Carousel */}
        <View style={styles.filtersWrapper}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.filtersScroll}
          >
            <TouchableOpacity 
              style={[styles.filterPill, selectedUserIds.length > 0 && styles.filterPillActive]}
              onPress={() => setActiveFilterModal('users')}
            >
              <UserIcon color={selectedUserIds.length > 0 ? "#ffffff" : "#111827"} size={16} />
              <Text style={selectedUserIds.length > 0 ? styles.filterPillTextActive : styles.filterPillText}>
                Usuários {selectedUserIds.length > 0 && `(${selectedUserIds.length})`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.filterPill, selectedTags.length > 0 && styles.filterPillActive]}
              onPress={() => setActiveFilterModal('tags')}
            >
              <Tag color={selectedTags.length > 0 ? "#ffffff" : "#111827"} size={16} />
              <Text style={selectedTags.length > 0 ? styles.filterPillTextActive : styles.filterPillText}>
                Tags {selectedTags.length > 0 && `(${selectedTags.length})`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.filterPill, instanceFilterId !== "all" && styles.filterPillActive]}
              onPress={() => setActiveFilterModal('instances')}
            >
              <MapPin color={instanceFilterId !== "all" ? "#ffffff" : "#111827"} size={16} />
              <Text style={instanceFilterId !== "all" ? styles.filterPillTextActive : styles.filterPillText}>Instância</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.filterPill, productFilterId !== "all" && styles.filterPillActive]}
              onPress={() => setActiveFilterModal('products')}
            >
              <Package color={productFilterId !== "all" ? "#ffffff" : "#111827"} size={16} />
              <Text style={productFilterId !== "all" ? styles.filterPillTextActive : styles.filterPillText}>Produto</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Content Area: Search List OR Kanban */}
        {casesLoading ? (
          <ActivityIndicator size="large" color="#ffffff" style={styles.loader} />
        ) : searchQuery.trim().length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={(c) => c.id}
            renderItem={renderCard}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.searchListContent}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Nenhum caso encontrado na busca.</Text>
            }
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

      {/* Bottom Sheet Modal for Filters */}
      <Modal
        visible={activeFilterModal !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveFilterModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setActiveFilterModal(null)}>
          <Pressable style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeFilterModal === 'users' && 'Filtrar por Usuários'}
                {activeFilterModal === 'tags' && 'Filtrar por Tags'}
                {activeFilterModal === 'instances' && 'Filtrar por Instância'}
                {activeFilterModal === 'products' && 'Filtrar por Produto'}
              </Text>
              <TouchableOpacity onPress={() => setActiveFilterModal(null)}>
                <X color="#9CA3AF" size={24} />
              </TouchableOpacity>
            </View>
            {renderFilterModalContent()}
          </Pressable>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  topLeft: {
    flexDirection: 'row',
  },
  topRight: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  switchTenantBtn: {
    padding: 8,
  },
  iconBtn: {
    padding: 4,
  },
  headerTitles: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyStateTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    marginHorizontal: 20,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    color: '#ffffff',
    fontSize: 16,
  },
  filtersWrapper: {
    height: 60,
  },
  filtersScroll: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    gap: 12,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6', 
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    height: 32,
  },
  filterPillActive: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#00E5FF', // Blue highlight border
  },
  filterPillText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '500',
  },
  filterPillTextActive: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  loader: {
    marginTop: 40,
  },
  searchListContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  kanbanScroll: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  columnContainer: {
    width: COLUMN_WIDTH,
    paddingRight: 16,
  },
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  colHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  colTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  colTotalValue: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  colListContent: {
    paddingBottom: 100,
  },
  emptyText: {
    color: '#4B5563',
    fontSize: 14,
    marginTop: 20,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 10,
  },
  statusPill: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillText: {
    color: '#065F46',
    fontSize: 12,
    fontWeight: 'bold',
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  ownerName: {
    color: '#9CA3AF',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    paddingTop: 12,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardDate: {
    color: '#9CA3AF',
    fontSize: 13,
    marginLeft: 6,
  },
  cardValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalScroll: {
    padding: 16,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  modalRowText: {
    color: '#D1D5DB',
    fontSize: 16,
  },
  modalRowTextSelected: {
    color: '#3B82F6',
    fontWeight: 'bold',
  },
});
