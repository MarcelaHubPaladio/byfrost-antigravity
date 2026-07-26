import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTenant } from '../../providers/TenantProvider';
import { Building2, LineChart, Filter } from 'lucide-react-native';
import { UserMenuButton } from '../../components/UserMenuButton';

// Import Tabs
import { BiOverviewTab } from './tabs/BiOverviewTab';
import { BiFinanceTab } from './tabs/BiFinanceTab';
import { BiCrmTab } from './tabs/BiCrmTab';
import { BiInventoryTab } from './tabs/BiInventoryTab';
import { BiMetaTab } from './tabs/BiMetaTab';

type TabType = 'overview' | 'finance' | 'crm' | 'inventory' | 'meta';

export function BiScreen({ navigation }: any) {
  const { activeTenant, tenants, clearActiveTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';
  const canSwitchTenant = tenants.length > 1;

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [period, setPeriod] = useState<'hoje' | 'ultimos_7_dias' | 'mes_atual' | 'mes_passado' | 'ultimos_3_meses' | 'ultimos_6_meses' | 'este_ano'>('ultimos_6_meses');
  const [showFilterModal, setShowFilterModal] = useState(false);

  const tabs: { key: TabType; label: string }[] = [
    { key: 'overview', label: 'Visão Geral' },
    { key: 'finance', label: 'Financeiro' },
    { key: 'crm', label: 'Vendas & CRM' },
    { key: 'inventory', label: 'Inventário' },
    { key: 'meta', label: 'Painel Meta' },
  ];

  const periodLabels = {
    'hoje': 'Hoje',
    'ultimos_7_dias': 'Últimos 7 dias',
    'mes_atual': 'Mês Atual',
    'mes_passado': 'Mês Passado',
    'ultimos_3_meses': 'Últimos 3 meses',
    'ultimos_6_meses': 'Últimos 6 meses',
    'este_ano': 'Este ano'
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <View style={[styles.iconBox, { borderColor: `${neon}40`, backgroundColor: `${neon}15` }]}>
               <LineChart color={neon} size={18} />
            </View>
            <View>
              <Text style={styles.mainTitle}>B.I.</Text>
              <Text style={styles.subTitle}>Business Intelligence</Text>
            </View>
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

        {/* Filters Bar */}
        <View style={styles.filtersBar}>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFilterModal(true)}>
            <Filter color="#D1D5DB" size={14} style={{ marginRight: 6 }} />
            <Text style={styles.filterBtnText}>
              {periodLabels[period]}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Top Tabs */}
        <View style={styles.tabsWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabBtn, activeTab === tab.key && { borderBottomColor: neon }]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.tabText, activeTab === tab.key && { color: neon, fontWeight: '700' }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Active Tab Content */}
        <View style={styles.content}>
          {activeTab === 'overview' && <BiOverviewTab period={period} />}
          {activeTab === 'finance' && <BiFinanceTab period={period} />}
          {activeTab === 'crm' && <BiCrmTab period={period} />}
          {activeTab === 'inventory' && <BiInventoryTab period={period} />}
          {activeTab === 'meta' && <BiMetaTab period={period} />}
        </View>
      </View>

      {/* Date Filter Modal */}
      <Modal visible={showFilterModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Período de Análise</Text>
            {Object.entries(periodLabels).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.modalOption, period === key && styles.modalOptionActive]}
                onPress={() => {
                  setPeriod(key as any);
                  setShowFilterModal(false);
                }}
              >
                <Text style={[styles.modalOptionText, period === key && { color: neon, fontWeight: '700' }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowFilterModal(false)}>
              <Text style={styles.modalCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0A0A0A' },
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topRight: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  iconBox: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mainTitle: { fontSize: 20, fontWeight: '800', color: '#F9FAFB', letterSpacing: -0.5, lineHeight: 22 },
  subTitle: { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  iconBtn: { padding: 8, backgroundColor: '#141414', borderRadius: 10, borderWidth: 1, borderColor: '#2A2A2A' },
  
  filtersBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  filterBtn: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterBtnText: { color: '#D1D5DB', fontSize: 12, fontWeight: '600' },

  tabsWrapper: { borderBottomWidth: 1, borderBottomColor: '#2A2A2A', marginBottom: 4 },
  tabsScroll: { paddingHorizontal: 20, flexDirection: 'row', gap: 20 },
  tabBtn: { paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { color: '#9CA3AF', fontSize: 14, fontWeight: '600' },
  content: { flex: 1 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#141414', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', marginBottom: 16 },
  modalOption: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  modalOptionActive: { backgroundColor: '#1A2A1A' },
  modalOptionText: { fontSize: 16, color: '#D1D5DB' },
  modalCloseBtn: { marginTop: 20, padding: 16, backgroundColor: '#2A2A2A', borderRadius: 12, alignItems: 'center' },
  modalCloseText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
});
