import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
  ArrowLeft,
  User as UserIcon,
  Check,
  X,
  MapPin,
  Phone,
  Trash2,
  PackagePlus,
  Plus,
  ChevronDown,
  ShoppingBag,
  CreditCard,
  Truck,
  ClipboardList,
  CheckCircle2,
  Smartphone
} from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../providers/TenantProvider';
import { useSession } from '../../providers/SessionProvider';

// ─── Helpers & Components ───────────────────────────────────────────────────

function BottomSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode; }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={bs.overlay} onPress={onClose}>
        <Pressable style={bs.sheet}>
          <View style={bs.handle} />
          <View style={bs.header}>
            <Text style={bs.title}>{title}</Text>
            <TouchableOpacity style={bs.closeBtn} onPress={onClose}>
              <X size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          <ScrollView style={bs.scroll}>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const bs = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#141414', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: '#2A2A2A', maxHeight: '75%', paddingBottom: 24 },
  handle: { width: 36, height: 4, backgroundColor: '#2A2A2A', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  title: { fontSize: 16, fontWeight: '700', color: '#F9FAFB' },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 12, paddingTop: 4 },
});

const bs_row = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  rowActive: { backgroundColor: '#1A2A1A' },
  rowText: { fontSize: 15, color: '#D1D5DB', textTransform: 'capitalize' },
  rowTextActive: { color: '#A3FF47', fontWeight: '700' },
});

function SectionCard({ icon, title, action, children }: { icon?: React.ReactNode; title: string; action?: React.ReactNode; children: React.ReactNode; }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderLeft}>
          {icon}
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export function OrderDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { activeTenantId, activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';
  const orderId = route.params?.id;

  const [localState, setLocalState] = useState('');
  const [showStateModal, setShowStateModal] = useState(false);

  // Modals for products
  const [showProductModal, setShowProductModal] = useState(false);
  const [productDesc, setProductDesc] = useState('');
  const [productEntityId, setProductEntityId] = useState<string | null>(null);
  const [productPrice, setProductPrice] = useState('');
  const [productQty, setProductQty] = useState('1');

  // Tabs
  const [activeTab, setActiveTab] = useState<'detalhes' | 'timeline'>('detalhes');

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: orderData, isLoading } = useQuery({
    queryKey: ['order_detail', orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select(`
          *,
          customer:customer_accounts(*),
          users_profile!fk_cases_users_profile(display_name, email),
          vendor:vendors!cases_assigned_vendor_id_fkey(id, display_name, phone_e164),
          journey:journeys!cases_journey_id_fkey(key, name, default_state_machine_json)
        `)
        .eq('id', orderId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: fieldsData } = useQuery({
    queryKey: ['case_fields', orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const { data, error } = await supabase.from('case_fields').select('*').eq('case_id', orderId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: itemsQ } = useQuery({
    queryKey: ['case_items', orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const { data, error } = await supabase.from('case_items').select('*').eq('case_id', orderId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: offeringsQ } = useQuery({
    queryKey: ['crm_offerings_search', activeTenantId, productDesc],
    enabled: Boolean(activeTenantId && productDesc.length > 1),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('core_entities')
        .select('id, display_name, meta_json')
        .eq('tenant_id', activeTenantId!)
        .eq('entity_type', 'offering')
        .is('deleted_at', null)
        .ilike('display_name', `%${productDesc}%`)
        .order('display_name', { ascending: true })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: timelineQ } = useQuery({
    queryKey: ['case_timeline', orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('timeline_events')
        .select('*')
        .eq('case_id', orderId)
        .order('occurred_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: usersQ } = useQuery({
    queryKey: ['tenant_users_profiles', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users_profile')
        .select('user_id, display_name, email')
        .eq('tenant_id', activeTenantId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const getUserName = (userId: string | null) => {
    if (!userId) return '';
    const u = usersQ?.find(x => x.user_id === userId);
    return u?.display_name || u?.email || 'Sistema';
  };

  // Sync state
  useEffect(() => {
    if (orderData) {
      setLocalState(orderData.state);
    }
  }, [orderData]);

  // ── Mutations ────────────────────────────────────────────────────────────

  const updateOrderState = useMutation({
    mutationFn: async (newState: string) => {
      const { error } = await supabase.from('cases').update({ state: newState }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders_mobile'] });
      queryClient.invalidateQueries({ queryKey: ['order_detail', orderId] });
    },
  });

  const addProduct = useMutation({
    mutationFn: async () => {
      const price = parseFloat(productPrice.replace(',', '.')) || 0;
      const qty = parseInt(productQty, 10) || 1;
      const { error } = await supabase.from('case_items').insert({
        tenant_id: activeTenantId,
        case_id: orderId,
        description: productDesc,
        price,
        qty,
        total: price * qty,
        offering_entity_id: productEntityId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case_items', orderId] });
      setShowProductModal(false);
      setProductDesc(''); setProductPrice(''); setProductQty('1'); setProductEntityId(null);
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('case_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case_items', orderId] }),
  });

  const deleteOrder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('cases').update({ deleted_at: new Date().toISOString() }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders_mobile'] });
      navigation.goBack();
    },
  });

  // ── Computed ─────────────────────────────────────────────────────────────

  const getField = (k: string) => fieldsData?.find((f: any) => f.key === k)?.value_text;
  
  const customerName = getField('name') || orderData?.customer?.name || orderData?.title || 'Pedido';
  const customerPhone = getField('phone') || orderData?.customer?.phone_e164 || '';
  const city = getField('city') || getField('cidade') || '';
  const billingStatus = getField('billing_status') || 'Pendente';
  const paymentMethod = getField('payment_method') || '—';

  const stages = useMemo(() => {
    const st = (orderData?.journey?.default_state_machine_json?.states ?? []) as string[];
    const list = Array.from(new Set((st ?? []).map((s) => String(s)).filter(Boolean)));
    if (!list.includes('cancelled')) list.push('cancelled');
    return list;
  }, [orderData]);

  const steps = useMemo(() => {
    const currentState = localState || orderData?.state || "";
    const currentIndex = stages.indexOf(currentState);
    
    const baseSteps = [
      { id: "captura", title: "Captura", states: ["new", "awaiting_ocr", "awaiting_location"], icon: Smartphone },
      { id: "validacao", title: "Validação", states: ["pending_vendor", "ready_for_review"], icon: ClipboardList },
      { id: "confirmado", title: "Confirmado", states: ["confirmed"], icon: CheckCircle2 },
      { id: "logistica", title: "Logística", states: ["in_separation", "in_route"], icon: Truck },
      { id: "entregue", title: "Entregue", states: ["delivered", "finalized"], icon: PackagePlus }
    ];

    return baseSteps.map(step => {
      const stepMaxIndex = Math.max(...step.states.map(s => stages.indexOf(s)));
      const isCurrent = step.states.includes(currentState);
      const isComplete = currentIndex > stepMaxIndex;
      return { ...step, status: isCurrent ? "current" : isComplete ? "complete" : "upcoming" };
    });
  }, [stages, localState, orderData]);

  const totalItems = (itemsQ ?? []).reduce((acc, it) => acc + (it.total || 0), 0);

  // ── Loading ──────────────────────────────────────────────────────────────

  if (isLoading || !orderData) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <ArrowLeft color="#F9FAFB" size={22} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          {isLoading ? <ActivityIndicator size="large" color={neon} /> : <Text style={{color: '#6B7280'}}>Pedido não encontrado.</Text>}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Header ── */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft color="#F9FAFB" size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{customerName}</Text>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => {
          Alert.alert('Excluir', 'Tem certeza que deseja remover este pedido?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Excluir', style: 'destructive', onPress: () => deleteOrder.mutate() }
          ]);
        }}>
          <Trash2 size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        
        {/* Title + ID */}
        <Text style={styles.caseTitle} numberOfLines={2}>{customerName}</Text>
        <View style={styles.idRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>#{orderData.meta_json?.external_id || orderId?.slice(0, 8).toUpperCase()}</Text>
          </View>
          {city && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MapPin size={12} color="#6B7280" />
              <Text style={styles.idText}>{city}</Text>
            </View>
          )}
        </View>

        {/* ── Stepper ── */}
        <View style={styles.stepperCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 16, paddingVertical: 12 }}>
            {steps.map((step, idx) => {
              const isComp = step.status === 'complete';
              const isCurr = step.status === 'current';
              const Icon = step.icon;
              return (
                <View key={step.id} style={{ alignItems: 'center', gap: 6, opacity: step.status === 'upcoming' ? 0.4 : 1 }}>
                  <View style={[
                    styles.stepCircle,
                    isComp && { backgroundColor: '#10B981', borderColor: '#10B981' },
                    isCurr && { backgroundColor: '#1A1A1A', borderColor: '#3B82F6', borderWidth: 2 }
                  ]}>
                    <Icon size={18} color={isComp ? '#000' : isCurr ? '#3B82F6' : '#6B7280'} />
                  </View>
                  <Text style={[styles.stepLabel, isCurr && { color: '#3B82F6', fontWeight: 'bold' }]}>{step.title}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Tabs ── */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity style={styles.tabBtn} onPress={() => setActiveTab('detalhes')}>
            <Text style={[styles.tabBtnText, activeTab === 'detalhes' && styles.tabBtnTextActive]}>Detalhes</Text>
            {activeTab === 'detalhes' && <View style={[styles.tabIndicator, { backgroundColor: neon }]} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabBtn} onPress={() => setActiveTab('timeline')}>
            <Text style={[styles.tabBtnText, activeTab === 'timeline' && styles.tabBtnTextActive]}>Timeline</Text>
            {activeTab === 'timeline' && <View style={[styles.tabIndicator, { backgroundColor: neon }]} />}
          </TouchableOpacity>
        </View>

        {activeTab === 'detalhes' ? (
          <>
            {/* ── Status Dropdown ── */}
            <SectionCard title="Status do Pedido">
              <TouchableOpacity style={styles.selectRow} onPress={() => setShowStateModal(true)}>
                <View style={[styles.stateDot, { backgroundColor: neon }]} />
                <Text style={styles.selectRowText}>{localState.replace(/[_-]+/g, ' ')}</Text>
                <ChevronDown size={16} color="#6B7280" />
              </TouchableOpacity>
            </SectionCard>

            {/* ── Cliente ── */}
            <SectionCard icon={<UserIcon size={14} color={neon} />} title="Dados do Cliente">
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Nome</Text>
                <Text style={styles.infoValue}>{customerName}</Text>
              </View>
              {customerPhone && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Telefone</Text>
                  <Text style={styles.infoValue}>{customerPhone}</Text>
                </View>
              )}
              {city && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Cidade</Text>
                  <Text style={styles.infoValue}>{city}</Text>
                </View>
              )}
            </SectionCard>

            {/* ── Faturamento ── */}
            <SectionCard icon={<CreditCard size={14} color={neon} />} title="Faturamento">
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Forma de Pagamento</Text>
                <Text style={styles.infoValue}>{paymentMethod}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Status Financeiro</Text>
                <Text style={styles.infoValue}>{billingStatus}</Text>
              </View>
            </SectionCard>

            {/* ── Produtos ── */}
            <SectionCard
              icon={<ShoppingBag size={14} color={neon} />}
              title="Itens do Pedido"
              action={
                <TouchableOpacity style={styles.iconRoundBtn} onPress={() => setShowProductModal(true)}>
                  <Plus size={16} color={neon} />
                </TouchableOpacity>
              }
            >
              {(itemsQ ?? []).length === 0 ? (
                <Text style={styles.emptyText}>Nenhum produto adicionado.</Text>
              ) : (
                (itemsQ ?? []).map(it => (
                  <View key={it.id} style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listRowTitle}>{it.description}</Text>
                      <Text style={styles.listRowSub}>{it.qty}x · R$ {Number(it.price).toFixed(2)}</Text>
                    </View>
                    <Text style={[styles.listRowValue, { color: neon }]}>R$ {Number(it.total).toFixed(2)}</Text>
                    <TouchableOpacity onPress={() => deleteProduct.mutate(it.id)} style={styles.trashBtn}>
                      <Trash2 size={15} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
              {totalItems > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total do Pedido</Text>
                  <Text style={[styles.totalValue, { color: neon }]}>R$ {totalItems.toFixed(2)}</Text>
                </View>
              )}
            </SectionCard>
          </>
        ) : (
          /* ── Timeline ── */
          <View style={styles.timelineContainer}>
            {(!timelineQ || timelineQ.length === 0) ? (
              <Text style={styles.emptyText}>Nenhuma atividade registrada.</Text>
            ) : (
              timelineQ.map((ev, i) => (
                <View key={ev.id} style={styles.timelineItem}>
                  <View style={styles.timelineLine} />
                  <View style={[styles.timelineDot, { backgroundColor: neon }]} />
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineText}>{ev.message}</Text>
                    <Text style={styles.timelineDate}>
                      {getUserName(ev.actor_id)} • {new Date(ev.occurred_at).toLocaleDateString('pt-BR')} às {new Date(ev.occurred_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

      </ScrollView>

      {/* ── State Modal ── */}
      <BottomSheet visible={showStateModal} title="Mudar Etapa" onClose={() => setShowStateModal(false)}>
        {stages.map(st => (
          <TouchableOpacity
            key={st}
            style={[bs_row.row, localState === st && bs_row.rowActive]}
            onPress={() => { setLocalState(st); setShowStateModal(false); updateOrderState.mutate(st); }}
          >
            <Text style={[bs_row.rowText, localState === st && { color: neon, fontWeight: '700' }]}>
              {st.replace(/[_-]+/g, ' ')}
            </Text>
            {localState === st && <Check size={16} color={neon} />}
          </TouchableOpacity>
        ))}
      </BottomSheet>

      {/* ── Product Modal ── */}
      <BottomSheet visible={showProductModal} title="Adicionar Produto" onClose={() => setShowProductModal(false)}>
        <View style={{ padding: 8, gap: 16 }}>
          <View>
            <Text style={styles.fieldLabel}>DESCRIÇÃO</Text>
            <TextInput style={styles.modalInput} value={productDesc} onChangeText={t => { setProductDesc(t); setProductEntityId(null); }} placeholder="Ex: Semente de Milho" placeholderTextColor="#4B5563" />
            {productDesc.length > 0 && !productEntityId && (offeringsQ ?? []).length > 0 && (
              <View style={styles.suggestions}>
                {(offeringsQ ?? []).map(o => (
                  <TouchableOpacity
                    key={o.id}
                    style={styles.suggestionRow}
                    onPress={() => {
                      setProductDesc(o.display_name);
                      setProductEntityId(o.id);
                      if (o.meta_json?.base_price) setProductPrice(String(o.meta_json.base_price));
                    }}
                  >
                    <Text style={[styles.suggestionText, { color: neon }]}>{o.display_name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>PREÇO (R$)</Text>
              <TextInput style={styles.modalInput} value={productPrice} onChangeText={setProductPrice} placeholder="0,00" placeholderTextColor="#4B5563" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>QTDE</Text>
              <TextInput style={styles.modalInput} value={productQty} onChangeText={setProductQty} placeholder="1" placeholderTextColor="#4B5563" keyboardType="numeric" />
            </View>
          </View>
          <TouchableOpacity
            style={[styles.submitChip, { backgroundColor: neon }, (!productDesc.trim() || addProduct.isPending) && styles.submitChipDisabled]}
            onPress={() => addProduct.mutate()}
            disabled={!productDesc.trim() || addProduct.isPending}
          >
            {addProduct.isPending
              ? <ActivityIndicator size="small" color="#000" />
              : <Text style={styles.submitChipText}>Adicionar Produto</Text>}
          </TouchableOpacity>
        </View>
      </BottomSheet>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#141414', borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#F9FAFB', flex: 1, textAlign: 'center', marginHorizontal: 12 },
  deleteBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#1A0A0A', borderWidth: 1, borderColor: '#7F1D1D', alignItems: 'center', justifyContent: 'center' },

  caseTitle: { fontSize: 22, fontWeight: '800', color: '#F9FAFB', marginBottom: 8, letterSpacing: -0.5 },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  badge: { backgroundColor: '#1A2A3A', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#60A5FA', fontSize: 11, fontWeight: '800' },
  idText: { fontSize: 12, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase' },

  stepperCard: { backgroundColor: '#141414', borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#2A2A2A', overflow: 'hidden' },
  stepCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' },

  card: { backgroundColor: '#141414', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#2A2A2A' },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8 },

  selectRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', padding: 13, gap: 10 },
  selectRowText: { flex: 1, fontSize: 15, color: '#F9FAFB', textTransform: 'capitalize', fontWeight: '600' },
  stateDot: { width: 10, height: 10, borderRadius: 5 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  infoLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  infoValue: { fontSize: 14, color: '#F9FAFB', fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  iconRoundBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#1A2A1A', borderWidth: 1, borderColor: '#2A3A2A', alignItems: 'center', justifyContent: 'center' },

  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A', gap: 10 },
  listRowTitle: { fontSize: 14, color: '#F9FAFB', fontWeight: '500' },
  listRowSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  listRowValue: { fontSize: 14, color: '#A3FF47', fontWeight: '700' },
  trashBtn: { padding: 6 },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#2A2A2A' },
  totalLabel: { fontSize: 14, fontWeight: '700', color: '#F9FAFB' },
  totalValue: { fontSize: 18, fontWeight: '800', color: '#A3FF47' },

  emptyText: { fontSize: 13, color: '#4B5563', textAlign: 'center', paddingVertical: 10 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.8, marginBottom: 6 },
  modalInput: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 15, color: '#F9FAFB' },
  suggestions: { backgroundColor: '#1A1A1A', borderRadius: 10, borderWidth: 1, borderColor: '#2A2A2A', marginTop: 4, overflow: 'hidden' },
  suggestionRow: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  suggestionText: { fontSize: 14, color: '#A3FF47', fontWeight: '500' },

  submitChip: { backgroundColor: '#A3FF47', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 10 },
  submitChipDisabled: { backgroundColor: '#2A3A1A' },
  submitChipText: { fontSize: 15, fontWeight: '800', color: '#000' },

  tabsContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1A1A1A', marginBottom: 16 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', position: 'relative' },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  tabBtnTextActive: { color: '#F9FAFB' },
  tabIndicator: { position: 'absolute', bottom: -1, width: 40, height: 2, backgroundColor: '#A3FF47', borderRadius: 2 },

  timelineContainer: { paddingLeft: 8 },
  timelineItem: { flexDirection: 'row', paddingBottom: 24, position: 'relative' },
  timelineLine: { position: 'absolute', left: 5, top: 20, bottom: -4, width: 1, backgroundColor: '#2A2A2A' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#A3FF47', marginTop: 5, marginRight: 12, zIndex: 2, borderWidth: 2, borderColor: '#141414' },
  timelineContent: { flex: 1, backgroundColor: '#141414', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#2A2A2A' },
  timelineText: { fontSize: 13, color: '#F9FAFB', fontWeight: '500', lineHeight: 18 },
  timelineDate: { fontSize: 11, color: '#6B7280', marginTop: 4 },
});
