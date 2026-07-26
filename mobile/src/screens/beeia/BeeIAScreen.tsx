import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTenant } from '../../providers/TenantProvider';
import { Building2 } from 'lucide-react-native';
import { UserMenuButton } from '../../components/UserMenuButton';

// Import Tabs
import { BeeIACrmTab } from './tabs/BeeIACrmTab';
import { BeeIAConfigTab } from './tabs/BeeIAConfigTab';
import { BeeIALearningsTab } from './tabs/BeeIALearningsTab';
import { BeeIAConnectionsTab } from './tabs/BeeIAConnectionsTab';
import { BeeIABillingTab } from './tabs/BeeIABillingTab';

type TabType = 'crm' | 'config' | 'learnings' | 'connections' | 'billing';

export function BeeIAScreen({ navigation }: any) {
  const { activeTenant, tenants, clearActiveTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';
  const canSwitchTenant = tenants.length > 1;

  const [activeTab, setActiveTab] = useState<TabType>('crm');

  const tabs: { key: TabType; label: string }[] = [
    { key: 'crm', label: 'Casos' },
    { key: 'config', label: 'Configuração' },
    { key: 'learnings', label: 'Aprendizados' },
    { key: 'connections', label: 'Conexões' },
    { key: 'billing', label: 'Consumo' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <Text style={styles.mainTitle}>BeeIA</Text>
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
          {activeTab === 'crm' && <BeeIACrmTab navigation={navigation} />}
          {activeTab === 'config' && <BeeIAConfigTab />}
          {activeTab === 'learnings' && <BeeIALearningsTab />}
          {activeTab === 'connections' && <BeeIAConnectionsTab />}
          {activeTab === 'billing' && <BeeIABillingTab />}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
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
  tabsWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    marginBottom: 4,
  },
  tabsScroll: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    gap: 20,
  },
  tabBtn: {
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
});
