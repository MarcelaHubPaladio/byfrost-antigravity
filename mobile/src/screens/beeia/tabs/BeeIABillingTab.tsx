import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTenant } from '../../../providers/TenantProvider';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { Coins, CircleDollarSign, Bot } from 'lucide-react-native';

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${min}`;
}

export function BeeIABillingTab() {
  const { activeTenantId, activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';

  const { data: billing, isLoading } = useQuery({
    queryKey: ['beeia_billing', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usage_events')
        .select('id, qty, ref_id, ref_type, meta_json, occurred_at')
        .eq('tenant_id', activeTenantId!)
        .eq('type', 'ai_token')
        .order('occurred_at', { ascending: false });

      if (error) throw error;
      
      const uniqueCaseIds = Array.from(new Set(
        (data ?? [])
          .filter(row => row.ref_type !== 'beeia_simulation' && row.ref_id)
          .map(row => row.ref_id)
      )) as string[];
      
      const casesMap = new Map<string, { title: string, name: string, phone: string }>();

      if (uniqueCaseIds.length > 0) {
        const { data: casesData } = await supabase
          .from('cases')
          .select('id, title, customer_accounts:customer_id(name, phone_e164)')
          .in('id', uniqueCaseIds);
        
        casesData?.forEach((c: any) => {
          casesMap.set(c.id, {
            title: c.title || '',
            name: c.customer_accounts?.name || '',
            phone: c.customer_accounts?.phone_e164 || '',
          });
        });
      }
      
      const groups: Record<string, {
        totalTokens: number;
        totalCostUsd: number;
        lastOccurred: string;
        description: string;
        title?: string;
        name?: string;
        phone?: string;
      }> = {};

      let grandTotalTokens = 0;
      let grandTotalCostUsd = 0;

      for (const row of (data ?? [])) {
        const description = String(row.meta_json?.description ?? '');
        const isBeeia = description.startsWith('BeeIA:') || description === 'Simulador BeeIA';
        if (!isBeeia) continue;

        const tokens = row.qty || 0;
        const costUsd = Number(row.meta_json?.cost_usd || (tokens * 0.0000003));
        
        grandTotalTokens += tokens;
        grandTotalCostUsd += costUsd;

        const refId = row.ref_id || `unknown_${row.id}`;
        const caseInfo = refId ? casesMap.get(refId) : null;

        if (!groups[refId]) {
          groups[refId] = {
            totalTokens: 0,
            totalCostUsd: 0,
            lastOccurred: row.occurred_at,
            description: row.meta_json?.description || 'Análise',
            title: caseInfo?.title,
            name: caseInfo?.name,
            phone: caseInfo?.phone || (description.match(/Resposta para (\+?\d+)/)?.[1]),
          };
        }

        groups[refId].totalTokens += tokens;
        groups[refId].totalCostUsd += costUsd;
      }

      const details = Object.values(groups).sort((a, b) => b.totalTokens - a.totalTokens);

      return {
        grandTotalTokens,
        grandTotalCostUsd,
        details
      };
    }
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={neon} style={styles.loader} />
      </View>
    );
  }

  const usdToBrl = 5.50; // simple fallback conversion
  const grandTotalBrl = (billing?.grandTotalCostUsd || 0) * usdToBrl;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Coins color={neon} size={24} />
          <Text style={styles.summaryTitle}>Tokens Utilizados</Text>
          <Text style={styles.summaryValue}>{billing?.grandTotalTokens.toLocaleString('pt-BR') || '0'}</Text>
        </View>

        <View style={styles.summaryCard}>
          <CircleDollarSign color="#3B82F6" size={24} />
          <Text style={styles.summaryTitle}>Custo Estimado</Text>
          <Text style={styles.summaryValue}>
            R$ {grandTotalBrl.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
          </Text>
          <Text style={styles.summarySub}>
            ${(billing?.grandTotalCostUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
          </Text>
        </View>
      </View>

      <Text style={styles.listTitle}>Maiores Consumos (Atendimentos)</Text>
      
      <View style={styles.listContainer}>
        {billing?.details.map((item, index) => {
          const itemBrl = item.totalCostUsd * usdToBrl;
          const contactName = item.name || item.title || item.phone || 'Sem Identificação';
          
          return (
            <View key={index} style={styles.listItem}>
              <View style={styles.listItemHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Bot color="#9CA3AF" size={16} />
                  <Text style={styles.itemName} numberOfLines={1}>{contactName}</Text>
                </View>
                <Text style={styles.itemCost}>R$ {itemBrl.toFixed(4)}</Text>
              </View>
              
              <View style={styles.listItemFooter}>
                <Text style={styles.itemDate}>Última interação: {formatDate(item.lastOccurred)}</Text>
                <Text style={styles.itemTokens}>{item.totalTokens.toLocaleString('pt-BR')} tokens</Text>
              </View>
            </View>
          );
        })}

        {(!billing?.details || billing.details.length === 0) && (
          <Text style={styles.emptyText}>Nenhum registro de consumo de IA encontrado.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  content: { padding: 20, gap: 24, paddingBottom: 60 },
  loader: { marginTop: 60 },
  summaryContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  summaryTitle: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  summaryValue: { color: '#F9FAFB', fontSize: 24, fontWeight: '800' },
  summarySub: { color: '#6B7280', fontSize: 11 },
  listTitle: { color: '#F9FAFB', fontSize: 16, fontWeight: '700' },
  listContainer: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 16,
    overflow: 'hidden',
  },
  listItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  listItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemName: { color: '#F9FAFB', fontSize: 14, fontWeight: '600', flex: 1 },
  itemCost: { color: '#3B82F6', fontSize: 14, fontWeight: '700' },
  listItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDate: { color: '#6B7280', fontSize: 12 },
  itemTokens: { color: '#9CA3AF', fontSize: 12, fontWeight: '500' },
  emptyText: { color: '#6B7280', textAlign: 'center', padding: 30, fontSize: 13 },
});
