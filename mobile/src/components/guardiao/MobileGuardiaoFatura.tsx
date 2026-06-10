import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../providers/TenantProvider';
import { DollarSign, Cpu, Calendar as CalendarIcon, Hash } from 'lucide-react-native';

export function MobileGuardiaoFatura() {
  const { activeTenantId } = useTenant();

  const usageEventsQ = useQuery({
    queryKey: ["usage_events_ai_mobile", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usage_events")
        .select("id, type, qty, ref_type, meta_json, occurred_at")
        .eq("tenant_id", activeTenantId!)
        .eq("type", "ai_token")
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    }
  });

  const totalCostBrl = useMemo(() => {
    if (!usageEventsQ.data) return 0;
    const totalUsd = usageEventsQ.data.reduce((acc, evt) => acc + Number((evt.meta_json as any)?.cost_usd || 0), 0);
    return totalUsd * 3 * 5.00; // 3x markup * 5 BRL exchange rate
  }, [usageEventsQ.data]);

  if (usageEventsQ.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#A3FF47" />
        <Text style={styles.loadingText}>Buscando fatura...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>VALOR FINAL FATURADO</Text>
        <Text style={styles.summaryValue}>
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCostBrl)}
        </Text>
      </View>

      <Text style={styles.listTitle}>Detalhamento (Últimos 100 registros)</Text>

      {(!usageEventsQ.data || usageEventsQ.data.length === 0) ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Nenhum uso de tokens registrado.</Text>
        </View>
      ) : (
        <FlatList
          data={usageEventsQ.data}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const meta = item.meta_json as any;
            return (
              <View style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemIcon}>
                    <Cpu size={14} color="#A3FF47" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemService}>{meta?.service || 'Inteligência Artificial'}</Text>
                    <Text style={styles.itemModel}>{meta?.model || 'Desconhecido'}</Text>
                  </View>
                  <View style={styles.itemTokens}>
                    <Text style={styles.itemTokensValue}>{item.qty}</Text>
                    <Text style={styles.itemTokensLabel}>tokens</Text>
                  </View>
                </View>
                
                <View style={styles.itemFooter}>
                  <View style={styles.itemDate}>
                    <CalendarIcon size={12} color="#6B7280" />
                    <Text style={styles.itemDateText}>{new Date(item.occurred_at).toLocaleString('pt-BR')}</Text>
                  </View>
                  <View style={styles.itemDate}>
                    <DollarSign size={12} color="#6B7280" />
                    <Text style={styles.itemDateText}>
                      U$ {Number(meta?.cost_usd || 0).toFixed(4)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 12,
  },
  summaryCard: {
    backgroundColor: 'rgba(163, 255, 71, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(163, 255, 71, 0.3)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  summaryLabel: {
    color: '#A3FF47',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  summaryValue: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '900',
  },
  listTitle: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 40,
  },
  itemCard: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemService: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  itemModel: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  itemTokens: {
    alignItems: 'flex-end',
  },
  itemTokensValue: {
    color: '#A3FF47',
    fontSize: 14,
    fontWeight: '700',
  },
  itemTokensLabel: {
    color: '#6B7280',
    fontSize: 10,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  itemDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemDateText: {
    color: '#6B7280',
    fontSize: 11,
  },
});
