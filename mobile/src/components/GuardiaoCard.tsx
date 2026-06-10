import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useTenant } from '../providers/TenantProvider';
import { ShieldAlert, Database, Sparkles } from 'lucide-react-native';

type GuardiaoInsight = {
  title: string;
  description: string;
  severity: 'info' | 'warn' | 'error';
};

export default function GuardiaoCard() {
  const { activeTenantId } = useTenant();

  const insightsQ = useQuery({
    queryKey: ['guardiao_insights_global', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('guardiao_insights')
        .select('journey_id, insights_json, created_at')
        .eq('tenant_id', activeTenantId!)
        .is('journey_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  if (!insightsQ.data && !insightsQ.isLoading) {
    return null; // Não há relatórios globais gerados ainda
  }

  const rawJson = insightsQ.data?.insights_json;
  let insights: GuardiaoInsight[] = [];
  let eventsCount: number | null = null;
  let summaryText: string | null = null;

  if (Array.isArray(rawJson)) {
    insights = rawJson;
  } else if (rawJson && typeof rawJson === 'object') {
    insights = Array.isArray((rawJson as any).insights) ? (rawJson as any).insights : [];
    eventsCount = (rawJson as any).events_count ?? null;
    summaryText = (rawJson as any).summary ?? null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ShieldAlert size={20} color="#A3FF47" />
          <Text style={styles.title}>Guardião do Negócio</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>GLOBAL</Text>
        </View>
      </View>

      <View style={styles.content}>
        {insightsQ.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#A3FF47" />
            <Text style={styles.loadingText}>Buscando insights...</Text>
          </View>
        ) : (
          <>
            {summaryText && (
              <View style={styles.summaryBox}>
                {eventsCount !== null && (
                  <View style={styles.eventsBadge}>
                    <Database size={10} color="#A3FF47" />
                    <Text style={styles.eventsText}>{eventsCount} eventos analisados</Text>
                  </View>
                )}
                <Text style={styles.summaryLabel}>PADRÃO DE COMPORTAMENTO</Text>
                <Text style={styles.summaryText}>{summaryText}</Text>
              </View>
            )}

            {insights.length > 0 && (
              <View style={styles.insightsList}>
                <Text style={styles.insightsLabel}>PONTOS DE ATENÇÃO ESTRATÉGICOS</Text>
                {insights.map((insight, index) => {
                  const isError = insight.severity === 'error';
                  const isWarn = insight.severity === 'warn';
                  const dotColor = isError ? '#EF4444' : isWarn ? '#F59E0B' : '#3B82F6';
                  const boxBg = isError ? '#3F1616' : isWarn ? '#3F2C0B' : '#102A4C';
                  const borderColor = isError ? '#7F1D1D' : isWarn ? '#92400E' : '#1E3A8A';
                  
                  return (
                    <View key={index} style={styles.insightItem}>
                      <View style={[styles.dot, { backgroundColor: dotColor }]} />
                      <View style={[styles.insightBox, { backgroundColor: boxBg, borderColor }]}>
                        <Text style={[styles.insightTitle, { color: dotColor }]}>{insight.title}</Text>
                        <Text style={styles.insightDesc}>{insight.description}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            
            <View style={styles.footer}>
              <Text style={styles.dateText}>
                Atualizado: {insightsQ.data?.created_at ? new Date(insightsQ.data.created_at).toLocaleDateString() : '--'}
              </Text>
              <Sparkles size={14} color="#6B7280" />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
    marginHorizontal: 16,
    marginBottom: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: 'rgba(163, 255, 71, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(163, 255, 71, 0.2)',
  },
  badgeText: {
    color: '#A3FF47',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  summaryBox: {
    backgroundColor: '#262626',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 20,
  },
  eventsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1A1A1A',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  eventsText: {
    color: '#A3FF47',
    fontSize: 10,
    fontWeight: '600',
  },
  summaryLabel: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryText: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 20,
  },
  insightsList: {
    marginBottom: 16,
  },
  insightsLabel: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  insightItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
    marginRight: 10,
    borderWidth: 2,
    borderColor: '#1E1E1E',
  },
  insightBox: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  insightTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  insightDesc: {
    color: '#D1D5DB',
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 12,
  },
  dateText: {
    color: '#6B7280',
    fontSize: 11,
  },
});
