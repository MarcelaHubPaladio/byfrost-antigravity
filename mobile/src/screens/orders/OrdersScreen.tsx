import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  
  TextInput,
  RefreshControl,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../providers/SessionProvider';
import { useTenant } from '../../providers/TenantProvider';
import { supabase } from '../../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Plus,
  ShoppingBag,
  Package,
  ChevronRight,
  Building2,
  SlidersHorizontal,
  User as UserIcon,
  CreditCard,
  MapPin,
  Layers,
  X,
  Check,
  CloudLightning,
} from 'lucide-react-native';
import { UserMenuButton } from '../../components/UserMenuButton';
import { useNetwork } from '../../providers/NetworkProvider';
import { SyncEngine } from '../../lib/SyncEngine';
import { processSyncJob } from '../../lib/syncProcessor';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderRow = {
  id: string;
  title: string;
  status: string;
  state: string;
  created_at: string;
  updated_at: string;
  assigned_user_id: string | null;
  assigned_vendor_id: string | null;
  meta_json?: any;
  users_profile?: { display_name: string | null; email: string | null } | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATE_LABELS: Record<string, string> = {
  new: 'Pedido',
  em_anlise: 'Em Análise',
  projeto: 'Projeto',
  faturado: 'Faturado',
  in_separation: 'Em Separação',
  in_route: 'Em Rota',
  delivered: 'Expedição',
  finalized: 'Concluído',
  cancelled: 'Cancelado',
};

const STATE_COLORS: Record<string, { bg: string; text: string }> = {
  new: { bg: '#1A2A1A', text: '#A3FF47' },
  em_anlise: { bg: '#1A1A2A', text: '#818CF8' },
  projeto: { bg: '#1A1A2A', text: '#60A5FA' },
  faturado: { bg: '#1A2A1A', text: '#34D399' },
  in_separation: { bg: '#2A2A1A', text: '#FBBF24' },
  in_route: { bg: '#1A2A2A', text: '#22D3EE' },
  delivered: { bg: '#1A2A1A', text: '#4ADE80' },
  finalized: { bg: '#1A2A1A', text: '#10B981' },
  cancelled: { bg: '#2A1A1A', text: '#EF4444' },
};

// Roles that get the admin-level filter panel
const ADMIN_ROLES = ['admin', 'manager', 'owner', 'financeiro', 'expedicao', 'expedition', 'leader', 'lider', 'logistica'];

const ALL_STATES = [
  { key: 'new', label: 'Pedido' },
  { key: 'em_anlise', label: 'Em Análise' },
  { key: 'projeto', label: 'Projeto' },
  { key: 'faturado', label: 'Faturado' },
  { key: 'in_separation', label: 'Em Separação' },
  { key: 'in_route', label: 'Em Rota' },
  { key: 'delivered', label: 'Expedição' },
  { key: 'finalized', label: 'Concluído' },
  { key: 'cancelled', label: 'Cancelado' },
];

const PAYMENT_METHODS = ['PIX', 'Boleto', 'Cartão de Crédito', 'Cartão de Débito', 'À Vista', '30 dias', '60 dias', '30/60/90 dias'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStateLabel(s: string) {
  return STATE_LABELS[s] || STATE_LABELS[s?.toLowerCase()] || s || '—';
}
function getStateColor(s: string) {
  return STATE_COLORS[s] || STATE_COLORS[s?.toLowerCase()] || { bg: '#1A1A1A', text: '#9CA3AF' };
}
function formatDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const parseSafeDate = (input: string | null | undefined, fallback: string | Date): Date => {
  if (!input) return new Date(fallback);
  let s = String(input ?? "").trim().replace(/\s/g, "");
  if (!s || s === "undefined" || s === "null") return new Date(fallback);

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }

  s = s.replace(/\/\/+/g, "/");

  const slashMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (slashMatch) {
    let [_, d, m, y] = slashMatch;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const typoMatch1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})(\d{4})$/);
  if (typoMatch1) {
    const [_, d, m, y] = typoMatch1;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const typoMatch2 = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (typoMatch2) {
    const [_, d, m, y] = typoMatch2;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return new Date(fallback);
};

// ─── Filter Panel ─────────────────────────────────────────────────────────────

type FilterPanelType = 'seller' | 'state' | 'payment' | 'date' | 'product' | 'projetista' | 'city' | null;

type AdminFilters = { 
  sellerIds: string[]; 
  states: string[]; 
  paymentMethods: string[];
  dateRange: 'all' | 'today' | '7days' | 'current_month' | 'last_month' | 'custom';
  customDateStart: string;
  customDateEnd: string;
  productSearch: string;
  projetistaIds: string[];
  cities: string[];
};

// ─── Bottom Sheet Component ───────────────────────────────────────────────────

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

// ─── Order Card ───────────────────────────────────────────────────────────────

function OrderCard({ item, onPress }: { item: OrderRow; onPress: () => void }) {
  const { activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';
  const stateColor = getStateColor(item.state);
  const customerName = item.meta_json?.customer_name || item.title || 'Pedido';
  const totalValue = item.meta_json?.total_value
    ? Number(item.meta_json.total_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null;
  const orderRef = item.meta_json?.order_ref || `#${item.id.slice(0, 8).toUpperCase()}`;
  const assignedUser = Array.isArray(item.users_profile) ? item.users_profile[0] : item.users_profile;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.orderIcon}>
            <Package size={17} color={neon} />
          </View>
          <View>
            <Text style={styles.orderRef}>{orderRef}</Text>
            <Text style={styles.orderDate}>{formatDate(item.created_at)}</Text>
          </View>
        </View>
        <View style={[styles.stateBadge, { backgroundColor: stateColor.bg }]}>
          <Text style={[styles.stateBadgeText, { color: stateColor.text }]}>{getStateLabel(item.state)}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={{ flex: 1 }}>
          <Text style={styles.customerName} numberOfLines={1}>{customerName}</Text>
          {assignedUser?.display_name && (
            <View style={styles.sellerRow}>
              <UserIcon size={11} color="#6B7280" />
              <Text style={styles.sellerName} numberOfLines={1}>{assignedUser.display_name}</Text>
            </View>
          )}
        </View>
        {totalValue && <Text style={[styles.orderValue, { color: neon }]}>{totalValue}</Text>}
      </View>

      {item.meta_json?.payment_method && (
        <View style={styles.cardFooter}>
          <Text style={styles.footerText}>{item.meta_json.payment_method}</Text>
          <ChevronRight size={13} color="#4B5563" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Stats Bar Removed ────────────────────────────────────────────────────────

// ─── Filter Chip ──────────────────────────────────────────────────────────────

function FilterChip({ icon, label, active, count, onPress, onClear }: {
  icon: React.ReactNode; label: string; active: boolean; count?: number; onPress: () => void; onClear?: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.filterPill, active && styles.filterPillActive]} onPress={onPress}>
      {icon}
      <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
        {label}{count ? ` (${count})` : ''}
      </Text>
      {active && onClear && (
        <TouchableOpacity onPress={(e) => { e.stopPropagation(); onClear(); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <X size={11} color="#000" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ─── Admin Dashboard ─────────────────────────────────────────────────────────

function toMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function normalizeBillingStatus(raw: string): string {
  const s = String(raw ?? "Pendente").trim();
  const low = s.toLowerCase();
  if (low === "pago" || low.includes("faturado")) return "Faturado";
  if (low.includes("cancel")) return "Cancelado";
  if (low.includes("parcial")) return "Faturado Parcial";
  if (low.includes("banco") || low.includes("aguardando") || low === "pendente") return "Pendente";
  return s;
}

function AdminDashboard({ orders, totalsMap, fieldsMap }: { orders: OrderRow[], totalsMap?: Map<string, number>, fieldsMap?: Map<string, any> }) {
  const { activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';
  const stats = useMemo(() => {
    let total = 0, faturado = 0, pendente = 0, cancelado = 0;
    let countFaturado = 0;

    orders.forEach(o => {
      const caseTotal = totalsMap?.get(o.id) ?? Number(o.meta_json?.total_value || 0);
      const fields = fieldsMap?.get(o.id) || {};
      const billingStatus = normalizeBillingStatus(fields.billing_status || "Pendente").toLowerCase();
      const partialVal = Number(fields.partial_paid_value || 0);

      total += caseTotal;

      if (billingStatus.includes("pago") || billingStatus.includes("faturado")) {
        faturado += caseTotal;
        countFaturado++;
      } else if (billingStatus.includes("cancel")) {
        cancelado += caseTotal;
      } else if (billingStatus.includes("parcial")) {
        faturado += partialVal;
        pendente += (caseTotal - partialVal);
        countFaturado++;
      } else {
        pendente += caseTotal;
      }
    });

    const avgTicket = countFaturado > 0 ? faturado / countFaturado : 0;
    const pctFaturado = total > 0 ? (faturado / total) * 100 : 0;

    return { total, faturado, pendente, cancelado, avgTicket, pctFaturado, count: orders.length };
  }, [orders, totalsMap, fieldsMap]);

  const stateBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach(o => {
      const lbl = getStateLabel(o.state);
      map.set(lbl, (map.get(lbl) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [orders]);

  const maxCount = Math.max(...stateBreakdown.map(([, c]) => c), 1);

  return (
    <View style={ds.container}>
      {/* Top metrics */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ds.metricsScroll}>
        <View style={[ds.metricCard, { borderTopColor: neon }]}>
          <Text style={ds.metricLabel}>TOTAL VENDAS</Text>
          <Text style={ds.metricValue}>{toMoney(stats.total)}</Text>
          <Text style={ds.metricSub}>{stats.count} pedidos</Text>
        </View>
        <View style={[ds.metricCard, { borderTopColor: '#10B981' }]}>
          <Text style={ds.metricLabel}>FATURADO</Text>
          <Text style={[ds.metricValue, { color: '#10B981' }]}>{toMoney(stats.faturado)}</Text>
        </View>
        <View style={[ds.metricCard, { borderTopColor: '#FBBF24' }]}>
          <Text style={ds.metricLabel}>PENDENTE</Text>
          <Text style={[ds.metricValue, { color: '#FBBF24' }]}>{toMoney(stats.pendente)}</Text>
        </View>
        <View style={[ds.metricCard, { borderTopColor: '#EF4444' }]}>
          <Text style={ds.metricLabel}>CANCELADO</Text>
          <Text style={[ds.metricValue, { color: '#EF4444' }]}>{toMoney(stats.cancelado)}</Text>
        </View>
        <View style={[ds.metricCard, { borderTopColor: '#818CF8' }]}>
          <Text style={ds.metricLabel}>TICKET MÉDIO</Text>
          <Text style={[ds.metricValue, { color: '#818CF8' }]}>{toMoney(stats.avgTicket)}</Text>
        </View>
      </ScrollView>

    </View>
  );
}

const ds = StyleSheet.create({
  container: { marginBottom: 4 },
  metricsScroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 10, flexDirection: 'row' },
  metricCard: { backgroundColor: '#141414', borderRadius: 14, padding: 14, minWidth: 130, borderTopWidth: 3, borderTopColor: '#A3FF47', borderWidth: 1, borderColor: '#2A2A2A', gap: 2 },
  metricLabel: { fontSize: 10, fontWeight: '700', color: '#6B7280', letterSpacing: 0.8 },
  metricValue: { fontSize: 18, fontWeight: '800', color: '#F9FAFB', marginTop: 2 },
  metricSub: { fontSize: 11, color: '#6B7280' },
  breakdown: { marginHorizontal: 16, backgroundColor: '#141414', borderRadius: 14, borderWidth: 1, borderColor: '#2A2A2A', padding: 14, marginBottom: 4 },
  breakdownTitle: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.8, marginBottom: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  barLabel: { fontSize: 12, color: '#9CA3AF', width: 90 },
  barTrack: { flex: 1, height: 6, backgroundColor: '#2A2A2A', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: '#A3FF47', borderRadius: 3 },
  barCount: { fontSize: 12, fontWeight: '700', color: '#F9FAFB', width: 24, textAlign: 'right' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function OrdersScreen({ navigation }: any) {
  const { user } = useSession();
  const { activeTenantId, activeTenant, isSuperAdmin, tenants, clearActiveTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filterPanel, setFilterPanel] = useState<FilterPanelType>(null);
  const [adminFilters, setAdminFilters] = useState<AdminFilters>({ 
    sellerIds: [], states: [], paymentMethods: [], dateRange: 'current_month', customDateStart: '', customDateEnd: '', productSearch: '', projetistaIds: [], cities: [] 
  });
  const network = useNetwork();
  const [pendingJobs, setPendingJobs] = useState(0);
  const [pendingQueue, setPendingQueue] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const checkPendingJobs = async () => {
    const queue = await SyncEngine.getQueue();
    setPendingJobs(queue.length);
    setPendingQueue(queue);
  };

  useEffect(() => {
    checkPendingJobs();
    const interval = setInterval(checkPendingJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await SyncEngine.processQueue(processSyncJob);
      await checkPendingJobs();
      await qc.invalidateQueries({ queryKey: ['orders_mobile'] });
    } finally {
      setIsSyncing(false);
    }
  };

  const isAdmin =
    isSuperAdmin ||
    activeTenant?.role === 'admin' ||
    ADMIN_ROLES.includes(activeTenant?.role ?? '');

  const canSwitchTenant = isSuperAdmin || tenants.length > 1;

  const totalActiveFilters =
    adminFilters.sellerIds.length + adminFilters.states.length + adminFilters.paymentMethods.length +
    adminFilters.projetistaIds.length + adminFilters.cities.length +
    (adminFilters.dateRange !== 'all' ? 1 : 0) + (adminFilters.productSearch ? 1 : 0);

  // ── Users for filter ──────────────────────────────────────────────────────
  const usersQ = useQuery({
    queryKey: ['tenant_users_orders', activeTenantId],
    enabled: Boolean(activeTenantId && isAdmin),
    queryFn: async () => {
      const { data, error } = await supabase.from('users_profile').select('user_id, display_name, email').eq('tenant_id', activeTenantId!).is('deleted_at', null);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Journey ────────────────────────────────────────────────────────────────
  const journeyQ = useQuery({
    queryKey: ['journey_sales_order_mobile', activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 60_000,
    queryFn: async () => {
      const cacheKey = `journey_sales_order_${activeTenantId}`;
      if (network.isConnected) {
        const { data, error } = await supabase.from('journeys').select('id, key, name, default_state_machine_json').eq('key', 'sales_order').single();
        if (data) {
          await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
          return data;
        }
      }
      const cached = await AsyncStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : null;
    },
  });

  // ── Orders ─────────────────────────────────────────────────────────────────
  const ordersQ = useQuery({
    queryKey: ['orders_mobile', activeTenantId, user?.id, journeyQ.data?.id, isAdmin],
    enabled: Boolean(activeTenantId && journeyQ.data?.id),
    queryFn: async () => {
      const cacheKey = `orders_mobile_${activeTenantId}_${user?.id}_${isAdmin}`;
      if (network.isConnected) {
        let q = supabase
          .from('cases')
          .select('id,title,status,state,created_at,updated_at,assigned_user_id,assigned_vendor_id,meta_json,users_profile!fk_cases_users_profile(display_name,email)')
          .eq('tenant_id', activeTenantId!)
          .eq('journey_id', journeyQ.data!.id)
          .is('deleted_at', null)
          .eq('is_chat', false);

        if (!isAdmin && user?.id) {
          q = q.eq('assigned_user_id', user.id);
        }

        const { data, error } = await q.order('created_at', { ascending: false }).limit(500);
        if (data) {
          await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
          return data as unknown as OrderRow[];
        }
      }
      const cached = await AsyncStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : [];
    },
  });

  const allOrders = useMemo(() => {
    const fetched = ordersQ.data ?? [];
    const pendingMapped = pendingQueue.map(job => {
      const payload = job.payload || {};
      return {
        id: `offline-${job.id}`,
        title: payload.title || 'Pedido Offline',
        status: 'open',
        state: 'new',
        created_at: job.createdAt || new Date().toISOString(),
        updated_at: job.createdAt || new Date().toISOString(),
        assigned_user_id: user?.id || null,
        assigned_vendor_id: null,
        meta_json: { ...payload.meta_json, _isOffline: true },
        users_profile: { display_name: 'Aguardando Sincronização', email: null }
      } as OrderRow;
    });
    return [...pendingMapped, ...fetched];
  }, [ordersQ.data, pendingQueue, user?.id]);

  const caseIds = useMemo(() => allOrders.filter(o => !o.id.startsWith('offline-')).map(o => o.id), [allOrders]);

  // ── Extended Fields for filtering ──────────────────────────────────────────
  const caseFieldsQ = useQuery({
    queryKey: ['orders_case_fields_extended', activeTenantId, caseIds.length],
    enabled: Boolean(activeTenantId && caseIds.length > 0 && isAdmin),
    queryFn: async () => {
      const CHUNK_SIZE = 100;
      const chunks: string[][] = [];
      for (let i = 0; i < caseIds.length; i += CHUNK_SIZE) {
        chunks.push(caseIds.slice(i, i + CHUNK_SIZE));
      }

      const allFields: any[] = [];
      await Promise.all(chunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from("case_fields")
          .select("case_id,key,value_text")
          .in("case_id", chunk)
          .in("key", ["payment_method", "city", "projetista_entity_id", "sale_date_text", "billing_status", "partial_paid_value"])
          .limit(1000);
        if (error) throw error;
        if (data) allFields.push(...data);
      }));
      
      const map = new Map<string, any>();
      allFields.forEach(r => {
        if (!map.has(r.case_id)) map.set(r.case_id, {});
        map.get(r.case_id)[r.key] = r.value_text;
      });
      return map;
    }
  });

  const caseItemsQ = useQuery({
    queryKey: ['orders_case_items_extended', activeTenantId, caseIds.length],
    enabled: Boolean(activeTenantId && caseIds.length > 0 && isAdmin),
    queryFn: async () => {
      const CHUNK_SIZE = 100;
      const chunks: string[][] = [];
      for (let i = 0; i < caseIds.length; i += CHUNK_SIZE) {
        chunks.push(caseIds.slice(i, i + CHUNK_SIZE));
      }

      const allItems: any[] = [];
      await Promise.all(chunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from("case_items")
          .select("case_id,description,total")
          .in("case_id", chunk)
          .limit(1000);
        if (error) throw error;
        if (data) allItems.push(...data);
      }));
      
      const descMap = new Map<string, Set<string>>();
      const totalsMap = new Map<string, number>();
      
      allItems.forEach(r => {
        if (!descMap.has(r.case_id)) descMap.set(r.case_id, new Set());
        descMap.get(r.case_id)!.add(r.description?.toLowerCase() || "");
        
        totalsMap.set(r.case_id, (totalsMap.get(r.case_id) || 0) + Number(r.total || 0));
      });
      return { descMap, totalsMap };
    }
  });

  const projetistasQ = useQuery({
    queryKey: ["projetistas_for_filter", activeTenantId],
    enabled: Boolean(activeTenantId && isAdmin),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id, display_name")
        .eq("tenant_id", activeTenantId!)
        .eq("entity_type", "party")
        .eq("subtype", "projetista")
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const uniqueCities = useMemo(() => {
    if (!caseFieldsQ.data) return [];
    const cities = new Set<string>();
    caseFieldsQ.data.forEach((fields) => {
      if (fields.city) cities.add(fields.city);
    });
    return Array.from(cities).sort();
  }, [caseFieldsQ.data]);

  // Apply admin filters
  const filteredOrders = useMemo(() => {
    let rows = allOrders;

    // Data Filter
    if (adminFilters.dateRange !== 'all') {
      const now = new Date();
      let start: Date | null = null;
      let end: Date | null = null;
      
      if (adminFilters.dateRange === 'today') {
        start = new Date(); start.setHours(0,0,0,0);
        end = new Date(); end.setHours(23,59,59,999);
      } else if (adminFilters.dateRange === '7days') {
        start = new Date(); start.setDate(now.getDate() - 7); start.setHours(0,0,0,0);
        end = new Date(); end.setHours(23,59,59,999);
      } else if (adminFilters.dateRange === 'current_month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      } else if (adminFilters.dateRange === 'last_month') {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      } else if (adminFilters.dateRange === 'custom') {
        if (adminFilters.customDateStart) {
          const [d,m,y] = adminFilters.customDateStart.split('/');
          if (y && y.length === 4) start = new Date(Number(y), Number(m)-1, Number(d));
        }
        if (adminFilters.customDateEnd) {
          const [d,m,y] = adminFilters.customDateEnd.split('/');
          if (y && y.length === 4) {
            end = new Date(Number(y), Number(m)-1, Number(d));
            end.setHours(23,59,59,999);
          }
        }
      }
      
      rows = rows.filter(o => {
        const fields = caseFieldsQ.data?.get(o.id) || {};
        const d = parseSafeDate(fields.sale_date_text, o.created_at);
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    }

    if (adminFilters.sellerIds.length > 0) {
      rows = rows.filter(o => o.assigned_user_id && adminFilters.sellerIds.includes(o.assigned_user_id));
    }
    if (adminFilters.states.length > 0) {
      rows = rows.filter(o => adminFilters.states.includes(o.state));
    }
    
    // Payment Method, Projetista, City
    if (adminFilters.paymentMethods.length > 0 || adminFilters.projetistaIds.length > 0 || adminFilters.cities.length > 0) {
      rows = rows.filter(o => {
        const fields = caseFieldsQ.data?.get(o.id) || {};
        let pass = true;
        if (adminFilters.paymentMethods.length > 0 && !adminFilters.paymentMethods.includes(fields.payment_method)) pass = false;
        if (adminFilters.projetistaIds.length > 0 && !adminFilters.projetistaIds.includes(fields.projetista_entity_id)) pass = false;
        if (adminFilters.cities.length > 0 && !adminFilters.cities.includes(fields.city)) pass = false;
        return pass;
      });
    }

    // Product Search
    if (adminFilters.productSearch) {
      const term = adminFilters.productSearch.toLowerCase();
      rows = rows.filter(o => {
        const items = caseItemsQ.data?.descMap?.get(o.id);
        if (!items) return false;
        return Array.from(items).some(desc => desc.includes(term));
      });
    }

    if (!search.trim()) return rows;
    const sq = search.toLowerCase().trim();
    return rows.filter(o => {
      const name = (o.meta_json?.customer_name || o.title || '').toLowerCase();
      const ref = (o.meta_json?.order_ref || '').toLowerCase();
      return name.includes(sq) || ref.includes(sq) || o.id.toLowerCase().includes(sq);
    });
  }, [allOrders, adminFilters, search]);

  const onRefresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ['orders_mobile'] });
    setRefreshing(false);
  };

  const clearFilters = () => setAdminFilters({ sellerIds: [], states: [], paymentMethods: [], dateRange: 'all', customDateStart: '', customDateEnd: '', productSearch: '', projetistaIds: [], cities: [] });

  const toggleFilter = <K extends keyof AdminFilters>(key: K, val: string) => {
    setAdminFilters(f => {
      const arr = f[key] as string[];
      return { ...f, [key]: arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val] };
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <ShoppingBag size={19} color={neon} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Pedidos</Text>
            <Text style={styles.headerSub}>{activeTenant?.name || 'Agroforte'}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {canSwitchTenant && (
            <TouchableOpacity style={styles.iconBtn} onPress={clearActiveTenant}>
              <Building2 size={16} color="#6B7280" />
            </TouchableOpacity>
          )}
          <UserMenuButton />
        </View>
      </View>

      {/* ── Offline Sync Indicator ── */}
      {pendingJobs > 0 && (
        <View style={{ backgroundColor: '#4B5563', paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <CloudLightning size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
              {pendingJobs} pedido(s) pendente(s)
            </Text>
          </View>
          <TouchableOpacity 
            style={{ backgroundColor: neon, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}
            onPress={handleManualSync}
            disabled={isSyncing || !network.isConnected}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={{ color: '#000', fontSize: 11, fontWeight: '700' }}>Sincronizar</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Search ── */}
      <View style={styles.searchBar}>
        <Search size={15} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar pedidos..."
          placeholderTextColor="#4B5563"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <X size={15} color="#6B7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Admin Filters ── */}
      {isAdmin && (
        <View style={styles.filtersWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>

            {totalActiveFilters > 0 && (
              <TouchableOpacity style={styles.clearChip} onPress={clearFilters}>
                <X size={12} color="#EF4444" />
                <Text style={styles.clearChipText}>Limpar ({totalActiveFilters})</Text>
              </TouchableOpacity>
            )}

            <FilterChip
              icon={<UserIcon size={12} color={adminFilters.sellerIds.length > 0 ? '#000' : '#9CA3AF'} />}
              label="Vendedor"
              active={adminFilters.sellerIds.length > 0}
              count={adminFilters.sellerIds.length || undefined}
              onPress={() => setFilterPanel('seller')}
              onClear={() => setAdminFilters(f => ({ ...f, sellerIds: [] }))}
            />
            <FilterChip
              icon={<Layers size={12} color={adminFilters.states.length > 0 ? '#000' : '#9CA3AF'} />}
              label="Status"
              active={adminFilters.states.length > 0}
              count={adminFilters.states.length || undefined}
              onPress={() => setFilterPanel('state')}
              onClear={() => setAdminFilters(f => ({ ...f, states: [] }))}
            />
            <FilterChip
              icon={<CreditCard size={12} color={adminFilters.paymentMethods.length > 0 ? '#000' : '#9CA3AF'} />}
              label="Pagamento"
              active={adminFilters.paymentMethods.length > 0}
              count={adminFilters.paymentMethods.length || undefined}
              onPress={() => setFilterPanel('payment')}
              onClear={() => setAdminFilters(f => ({ ...f, paymentMethods: [] }))}
            />
            <FilterChip
              icon={<Search size={12} color={adminFilters.dateRange !== 'all' ? '#000' : '#9CA3AF'} />}
              label="Data"
              active={adminFilters.dateRange !== 'all'}
              onPress={() => setFilterPanel('date')}
              onClear={() => setAdminFilters(f => ({ ...f, dateRange: 'all' }))}
            />
            <FilterChip
              icon={<Package size={12} color={adminFilters.productSearch ? '#000' : '#9CA3AF'} />}
              label="Produto"
              active={Boolean(adminFilters.productSearch)}
              onPress={() => setFilterPanel('product')}
              onClear={() => setAdminFilters(f => ({ ...f, productSearch: '' }))}
            />
            <FilterChip
              icon={<UserIcon size={12} color={adminFilters.projetistaIds.length > 0 ? '#000' : '#9CA3AF'} />}
              label="Projetista"
              active={adminFilters.projetistaIds.length > 0}
              count={adminFilters.projetistaIds.length || undefined}
              onPress={() => setFilterPanel('projetista')}
              onClear={() => setAdminFilters(f => ({ ...f, projetistaIds: [] }))}
            />
            <FilterChip
              icon={<MapPin size={12} color={adminFilters.cities.length > 0 ? '#000' : '#9CA3AF'} />}
              label="Cidade"
              active={adminFilters.cities.length > 0}
              count={adminFilters.cities.length || undefined}
              onPress={() => setFilterPanel('city')}
              onClear={() => setAdminFilters(f => ({ ...f, cities: [] }))}
            />

          </ScrollView>
        </View>
      )}

      {/* ── Admin Dashboard ── */}
      {isAdmin && allOrders.length > 0 && <AdminDashboard orders={filteredOrders} totalsMap={caseItemsQ.data?.totalsMap} fieldsMap={caseFieldsQ.data} />}

      {/* ── Orders List ── */}
      {ordersQ.isLoading || journeyQ.isLoading ? (
        <ActivityIndicator size="large" color={neon} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={o => o.id}
          renderItem={({ item }) => (
            <OrderCard item={item} onPress={() => navigation.navigate('OrderDetail', { id: item.id })} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={neon} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <ShoppingBag size={48} color="#2A2A2A" />
              <Text style={styles.emptyTitle}>{search || totalActiveFilters > 0 ? 'Nenhum resultado' : 'Sem pedidos ainda'}</Text>
              <Text style={styles.emptySubtitle}>{search || totalActiveFilters > 0 ? 'Tente ajustar os filtros.' : 'Toque em + para cadastrar seu primeiro pedido.'}</Text>
            </View>
          }
        />
      )}

      {/* ── FAB ── */}
      <TouchableOpacity style={[styles.fab, { backgroundColor: neon, shadowColor: neon }]} onPress={() => navigation.navigate('NewOrder')}>
        <Plus size={24} color="#000000" />
      </TouchableOpacity>

      {/* ── Modals / Bottom Sheets ── */}
      <BottomSheet visible={filterPanel === 'seller'} title="Filtrar por Vendedor" onClose={() => setFilterPanel(null)}>
        {usersQ.data?.map(u => {
          const isActive = adminFilters.sellerIds.includes(u.user_id);
          return (
            <TouchableOpacity key={u.user_id} style={[styles.modalOption, isActive && styles.modalOptionActive]} onPress={() => toggleFilter('sellerIds', u.user_id)}>
              <Text style={[styles.modalOptionText, isActive && styles.modalOptionTextActive]}>{u.display_name || u.email}</Text>
              {isActive && <Check size={16} color={neon} />}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>

      <BottomSheet visible={filterPanel === 'state'} title="Filtrar por Status" onClose={() => setFilterPanel(null)}>
        {ALL_STATES.map(({ key: st, label }) => {
          const isActive = adminFilters.states.includes(st);
          return (
            <TouchableOpacity key={st} style={[styles.modalOption, isActive && styles.modalOptionActive]} onPress={() => toggleFilter('states', st)}>
              <Text style={[styles.modalOptionText, isActive && styles.modalOptionTextActive]}>{label}</Text>
              {isActive && <Check size={16} color={neon} />}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>

      <BottomSheet visible={filterPanel === 'payment'} title="Filtrar por Pagamento" onClose={() => setFilterPanel(null)}>
        {['Boleto', 'Cartão', 'Pix', 'Dinheiro', 'Financiamento'].map(pm => {
          const isActive = adminFilters.paymentMethods.includes(pm);
          return (
            <TouchableOpacity key={pm} style={[styles.modalOption, isActive && styles.modalOptionActive]} onPress={() => toggleFilter('paymentMethods', pm)}>
              <Text style={[styles.modalOptionText, isActive && styles.modalOptionTextActive]}>{pm}</Text>
              {isActive && <Check size={16} color={neon} />}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>

      <BottomSheet visible={filterPanel === 'date'} title="Filtrar por Data" onClose={() => setFilterPanel(null)}>
        {[
          { id: 'all', label: 'Todo o período' },
          { id: 'today', label: 'Hoje' },
          { id: '7days', label: 'Últimos 7 dias' },
          { id: 'current_month', label: 'Mês Atual' },
          { id: 'last_month', label: 'Mês Passado' },
          { id: 'custom', label: 'Selecionar período...' }
        ].map(range => {
          const isActive = adminFilters.dateRange === range.id;
          return (
            <TouchableOpacity key={range.id} style={[styles.modalOption, isActive && styles.modalOptionActive]} onPress={() => { setAdminFilters(f => ({ ...f, dateRange: range.id as any })); if (range.id !== 'custom') setFilterPanel(null); }}>
              <Text style={[styles.modalOptionText, isActive && styles.modalOptionTextActive]}>{range.label}</Text>
              {isActive && <Check size={16} color={neon} />}
            </TouchableOpacity>
          );
        })}

        {adminFilters.dateRange === 'custom' && (
          <View style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{color: '#9CA3AF', fontSize: 11, marginBottom: 4, fontWeight: '700'}}>DATA INICIAL</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor="#4B5563"
                  value={adminFilters.customDateStart}
                  onChangeText={t => setAdminFilters(f => ({ ...f, customDateStart: t }))}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{color: '#9CA3AF', fontSize: 11, marginBottom: 4, fontWeight: '700'}}>DATA FINAL</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor="#4B5563"
                  value={adminFilters.customDateEnd}
                  onChangeText={t => setAdminFilters(f => ({ ...f, customDateEnd: t }))}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>
            </View>
            <TouchableOpacity style={[styles.modalOption, { marginTop: 8, backgroundColor: neon, justifyContent: 'center', borderRadius: 12 }]} onPress={() => setFilterPanel(null)}>
              <Text style={{ color: '#000', fontWeight: 'bold' }}>Aplicar Filtro</Text>
            </TouchableOpacity>
          </View>
        )}
      </BottomSheet>

      <BottomSheet visible={filterPanel === 'product'} title="Buscar Produto" onClose={() => setFilterPanel(null)}>
        <View style={{ padding: 16 }}>
          <TextInput
            style={styles.searchInput}
            placeholder="Digite o nome do produto..."
            placeholderTextColor="#6B7280"
            value={adminFilters.productSearch}
            onChangeText={t => setAdminFilters(f => ({ ...f, productSearch: t }))}
          />
          <TouchableOpacity style={[styles.modalOption, { marginTop: 16, backgroundColor: neon, justifyContent: 'center' }]} onPress={() => setFilterPanel(null)}>
            <Text style={{ color: '#000', fontWeight: 'bold' }}>Aplicar</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet visible={filterPanel === 'projetista'} title="Filtrar por Projetista" onClose={() => setFilterPanel(null)}>
        {projetistasQ.data?.map(p => {
          const isActive = adminFilters.projetistaIds.includes(p.id);
          return (
            <TouchableOpacity key={p.id} style={[styles.modalOption, isActive && styles.modalOptionActive]} onPress={() => toggleFilter('projetistaIds', p.id)}>
              <Text style={[styles.modalOptionText, isActive && styles.modalOptionTextActive]}>{p.display_name}</Text>
              {isActive && <Check size={16} color={neon} />}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>

      <BottomSheet visible={filterPanel === 'city'} title="Filtrar por Cidade" onClose={() => setFilterPanel(null)}>
        {uniqueCities.map(city => {
          const isActive = adminFilters.cities.includes(city);
          return (
            <TouchableOpacity key={city} style={[styles.modalOption, isActive && styles.modalOptionActive]} onPress={() => toggleFilter('cities', city)}>
              <Text style={[styles.modalOptionText, isActive && styles.modalOptionTextActive]}>{city}</Text>
              {isActive && <Check size={16} color={neon} />}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0A' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1A2A1A', borderWidth: 1, borderColor: '#2A3A2A', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#F9FAFB', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 8, backgroundColor: '#141414', borderRadius: 10, borderWidth: 1, borderColor: '#2A2A2A' },

  statsBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 12, backgroundColor: '#141414', borderRadius: 14, borderWidth: 1, borderColor: '#2A2A2A', paddingVertical: 14 },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: '#2A2A2A' },
  statNum: { fontSize: 20, fontWeight: '800', color: '#F9FAFB' },
  statLbl: { fontSize: 11, color: '#6B7280', fontWeight: '500' },

  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#141414', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 14, marginHorizontal: 20, marginBottom: 8, paddingHorizontal: 14, height: 44 },
  searchInput: { flex: 1, fontSize: 14, color: '#F9FAFB' },

  filtersWrapper: { height: 48, marginBottom: 4 },
  filtersScroll: { paddingHorizontal: 20, flexDirection: 'row', gap: 8, alignItems: 'center' },
  filterPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141414', borderWidth: 1, borderColor: '#2A2A2A', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, gap: 5 },
  filterPillActive: { backgroundColor: '#A3FF47', borderColor: '#A3FF47' },
  filterPillText: { color: '#9CA3AF', fontSize: 12, fontWeight: '600' },
  filterPillTextActive: { color: '#000000', fontWeight: '700' },
  clearChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A0A0A', borderWidth: 1, borderColor: '#7F1D1D', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, gap: 5 },
  clearChipText: { color: '#EF4444', fontSize: 12, fontWeight: '600' },

  listContent: { paddingHorizontal: 16, paddingBottom: 110, gap: 10 },

  card: { backgroundColor: '#141414', borderRadius: 16, borderWidth: 1, borderColor: '#2A2A2A', overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, paddingBottom: 10 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#1A2A1A', alignItems: 'center', justifyContent: 'center' },
  orderRef: { fontSize: 13, fontWeight: '700', color: '#F9FAFB' },
  orderDate: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  stateBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  stateBadgeText: { fontSize: 11, fontWeight: '700' },
  cardBody: { paddingHorizontal: 14, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customerName: { fontSize: 15, fontWeight: '600', color: '#E5E7EB' },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  sellerName: { fontSize: 11, color: '#6B7280' },
  orderValue: { fontSize: 15, fontWeight: '700', color: '#A3FF47', marginLeft: 8 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 12 },
  footerText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptySubtitle: { fontSize: 14, color: '#4B5563', textAlign: 'center', lineHeight: 20 },

  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#A3FF47', alignItems: 'center', justifyContent: 'center', shadowColor: '#A3FF47', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 10 },

  modalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  modalOptionActive: { backgroundColor: '#1A2A1A' },
  modalOptionText: { fontSize: 15, color: '#F9FAFB' },
  modalOptionTextActive: { color: '#A3FF47', fontWeight: '700' },
});
