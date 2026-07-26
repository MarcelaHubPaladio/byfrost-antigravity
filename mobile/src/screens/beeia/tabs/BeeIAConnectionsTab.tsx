import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Switch,
  Alert,
} from 'react-native';
import { useTenant } from '../../../providers/TenantProvider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { Smartphone, Bot } from 'lucide-react-native';

export function BeeIAConnectionsTab() {
  const { activeTenantId, activeTenant } = useTenant();
  const queryClient = useQueryClient();
  const neon = activeTenant?.neon_primary || '#A3FF47';

  const { data: instances, isLoading } = useQuery({
    queryKey: ['beeia_instances', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wa_instances')
        .select('id, name, status, phone_number, beeia_enabled, beeia_test_numbers')
        .eq('tenant_id', activeTenantId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const toggleBeeia = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('wa_instances')
        .update({ beeia_enabled: enabled })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beeia_instances', activeTenantId] });
    },
    onError: (err: any) => {
      Alert.alert('Erro', 'Não foi possível alterar a configuração: ' + err.message);
    },
  });

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Smartphone color="#9CA3AF" size={20} />
          <View>
            <Text style={styles.instanceName}>{item.name}</Text>
            <Text style={styles.instancePhone}>{item.phone_number || 'Sem número'}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: item.status === 'active' ? '#1A2A1A' : '#2A1A1A' }]}>
          <Text style={[styles.statusText, { color: item.status === 'active' ? '#4ADE80' : '#EF4444' }]}>
            {item.status === 'active' ? 'Conectado' : 'Desconectado'}
          </Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.beeiaSwitchRow}>
          <Bot color={item.beeia_enabled ? neon : '#6B7280'} size={18} />
          <Text style={styles.beeiaText}>Inteligência Artificial (BeeIA)</Text>
          <View style={{ flex: 1 }} />
          <Switch
            value={item.beeia_enabled}
            onValueChange={(val) => toggleBeeia.mutate({ id: item.id, enabled: val })}
            trackColor={{ false: '#374151', true: neon }}
            thumbColor={'#fff'}
          />
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Conexões e Instâncias</Text>
        <Text style={styles.desc}>Selecione quais números do WhatsApp a IA deve responder automaticamente.</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={neon} style={styles.loader} />
      ) : (
        <FlatList
          data={instances}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhuma instância conectada.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  title: { color: '#F9FAFB', fontSize: 18, fontWeight: '700' },
  desc: { color: '#6B7280', fontSize: 13, marginTop: 4 },
  loader: { marginTop: 60 },
  list: { padding: 20, gap: 16, paddingBottom: 60 },
  card: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    gap: 12,
  },
  instanceName: { color: '#F9FAFB', fontSize: 15, fontWeight: '600' },
  instancePhone: { color: '#6B7280', fontSize: 13, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  cardFooter: {
    padding: 16,
    backgroundColor: '#0F0F0F',
  },
  beeiaSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  beeiaText: { color: '#E5E7EB', fontSize: 14, fontWeight: '500' },
  emptyText: { color: '#4B5563', textAlign: 'center', marginTop: 40 },
});
