import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView } from 'react-native';
import { Activity, Sparkles, FileText, DollarSign } from 'lucide-react-native';

import { MobileGlobalTimeline } from '../components/guardiao/MobileGlobalTimeline';
import { MobileOracleChat } from '../components/guardiao/MobileOracleChat';
import { MobileGuardiaoReports } from '../components/guardiao/MobileGuardiaoReports';
import { MobileGuardiaoFatura } from '../components/guardiao/MobileGuardiaoFatura';

type Tab = 'timeline' | 'oracle' | 'reports' | 'fatura';

export function GuardiaoScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('timeline');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Guardião do Negócio</Text>
      </View>
      
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScrollContent}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'timeline' && styles.tabActive]}
            onPress={() => setActiveTab('timeline')}
          >
          <Activity size={16} color={activeTab === 'timeline' ? '#A3FF47' : '#6B7280'} />
          <Text style={[styles.tabText, activeTab === 'timeline' && styles.tabTextActive]}>Produtividade</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'oracle' && styles.tabActive]}
          onPress={() => setActiveTab('oracle')}
        >
          <Sparkles size={16} color={activeTab === 'oracle' ? '#A3FF47' : '#6B7280'} />
          <Text style={[styles.tabText, activeTab === 'oracle' && styles.tabTextActive]}>Oráculo</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'reports' && styles.tabActive]}
          onPress={() => setActiveTab('reports')}
        >
          <FileText size={16} color={activeTab === 'reports' ? '#A3FF47' : '#6B7280'} />
          <Text style={[styles.tabText, activeTab === 'reports' && styles.tabTextActive]}>Relatórios</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'fatura' && styles.tabActive]}
          onPress={() => setActiveTab('fatura')}
        >
          <DollarSign size={16} color={activeTab === 'fatura' ? '#A3FF47' : '#6B7280'} />
          <Text style={[styles.tabText, activeTab === 'fatura' && styles.tabTextActive]}>Fatura</Text>
        </TouchableOpacity>
        </ScrollView>
      </View>

      <View style={styles.content}>
        {activeTab === 'timeline' && <MobileGlobalTimeline />}
        {activeTab === 'oracle' && <MobileOracleChat />}
        {activeTab === 'reports' && <MobileGuardiaoReports />}
        {activeTab === 'fatura' && <MobileGuardiaoFatura />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
  },
  tabBar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  tabScrollContent: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#111',
    gap: 6,
    borderWidth: 1,
    borderColor: '#222',
  },
  tabActive: {
    backgroundColor: 'rgba(163, 255, 71, 0.1)',
    borderColor: 'rgba(163, 255, 71, 0.3)',
  },
  tabText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#A3FF47',
  },
  content: {
    flex: 1,
  },
});
