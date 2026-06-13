import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../providers/TenantProvider';
import { ShieldAlert, Database, Sparkles, Map as MapIcon, Zap, RefreshCw } from 'lucide-react-native';

type GuardiaoInsight = {
  title: string;
  description: string;
  severity: 'info' | 'warn' | 'error';
};

type Journey = {
  id: string;
  name: string;
};

function InsightCard({ row, journeyName, neon }: { row: any; journeyName: string; neon: string }) {
  const rawJson = row.insights_json;
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

  const isGlobal = !row.journey_id || row.journey_id === 'GLOBAL';

  return (
    <View style={styles.cardContainer}>
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          {isGlobal ? <ShieldAlert size={18} color={neon} /> : <MapIcon size={18} color="#00E5FF" />}
          <Text style={styles.title} numberOfLines={1}>{isGlobal ? 'Guardião Global' : `Jornada: ${journeyName}`}</Text>
        </View>
        <View style={[styles.badge, isGlobal ? styles.badgeGlobal : styles.badgeJourney]}>
          <Text style={[styles.badgeText, isGlobal ? [styles.badgeTextGlobal, { color: neon }] : styles.badgeTextJourney]}>
            {isGlobal ? 'GLOBAL' : 'ESPECÍFICO'}
          </Text>
        </View>
      </View>

      <View style={styles.cardContent}>
        {summaryText && (
          <View style={styles.summaryBox}>
            {eventsCount !== null && (
              <View style={styles.eventsBadge}>
                <Database size={10} color={neon} />
                <Text style={[styles.eventsText, { color: neon }]}>{eventsCount} eventos analisados</Text>
              </View>
            )}
            <Text style={styles.summaryLabel}>PADRÃO DE COMPORTAMENTO</Text>
            <Text style={styles.summaryText}>{summaryText}</Text>
          </View>
        )}

        {insights.length > 0 && (
          <View style={styles.insightsList}>
            <Text style={styles.insightsLabel}>PONTOS DE ATENÇÃO</Text>
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
        
        <View style={styles.cardFooter}>
          <Text style={styles.dateText}>
            Atualizado: {row.created_at ? new Date(row.created_at).toLocaleDateString() : '--'}
          </Text>
          <Sparkles size={14} color="#6B7280" />
        </View>
      </View>
    </View>
  );
}

export function MobileGuardiaoReports() {
  const { activeTenantId, activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);

  // 1. Fetch active journeys
  const journeysQ = useQuery({
    queryKey: ['tenant_journeys_mobile', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_journeys')
        .select('journey_id, enabled, journeys(id, name)')
        .eq('tenant_id', activeTenantId!)
        .eq('enabled', true);

      if (error) throw error;
      const mapped = (data || []).map((r: any) => r.journeys).filter(Boolean) as Journey[];
      return mapped;
    },
  });

  // 2. Fetch insights
  const insightsQ = useQuery({
    queryKey: ['guardiao_insights_mobile_all', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('guardiao_insights')
        .select('journey_id, insights_json, created_at')
        .eq('tenant_id', activeTenantId!)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
  });

  const generateReportMut = useMutation({
    mutationFn: async () => {
      const idempotencyKey = `MANUAL_GUARDIAO_INSIGHTS:${activeTenantId}:GLOBAL:${Date.now()}`;
      
      const res = await supabase.from("job_queue").insert({
        tenant_id: activeTenantId!,
        type: "GUARDIAO_INSIGHTS_GENERATE",
        idempotency_key: idempotencyKey,
        payload_json: { journey_id: "GLOBAL", model: "gpt-4o", lookback_days: 7 },
        status: "pending",
        run_after: new Date(Date.now() - 60000).toISOString(),
      }).select();
      
      if (res.error) throw res.error;
      
      const invokeRes = await supabase.functions.invoke("jobs-processor", {
        body: { job_id: res.data[0].id }
      });
      
      if (invokeRes.error) {
        throw new Error(`Falha: ${invokeRes.error.message}`);
      }
      return res.data;
    },
    onSuccess: () => {
      setGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["guardiao_insights_mobile_all"] });
      Alert.alert("Sucesso", "Novo relatório do Guardião Global gerado!");
    },
    onError: (err: any) => {
      setGenerating(false);
      Alert.alert("Erro", err.message || "Erro ao gerar relatório");
    }
  });

  const handleGenerate = () => {
    Alert.alert(
      "Gerar Relatório", 
      "A IA irá analisar toda a operação dos últimos 7 dias e gerar um novo relatório Global. Isso pode levar alguns segundos. Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Gerar", onPress: () => { setGenerating(true); generateReportMut.mutate(); } }
      ]
    );
  };

  // Group latest insight by journey
  const latestInsights = useMemo(() => {
    if (!insightsQ.data) return [];
    
    const latestMap = new Map<string, any>();
    
    for (const row of insightsQ.data) {
      const key = row.journey_id === null ? "GLOBAL" : row.journey_id;
      if (!latestMap.has(key)) {
        latestMap.set(key, row);
      }
    }
    
    return Array.from(latestMap.values());
  }, [insightsQ.data]);

  const loading = journeysQ.isLoading || insightsQ.isLoading;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={neon} />
        <Text style={styles.loadingText}>Carregando relatórios...</Text>
      </View>
    );
  }

  if (latestInsights.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Zap size={40} color="#333" />
        <Text style={styles.emptyText}>Nenhum relatório gerado pelo Guardião.</Text>
      </View>
    );
  }

  // Helper to find journey name
  const getJourneyName = (journeyId: string | null) => {
    if (!journeyId || journeyId === 'GLOBAL') return 'Global';
    const j = journeysQ.data?.find(x => x.id === journeyId);
    return j?.name || journeyId;
  };

  // Sort GLOBAL first
  const sortedInsights = [...latestInsights].sort((a, b) => {
    if (!a.journey_id || a.journey_id === 'GLOBAL') return -1;
    if (!b.journey_id || b.journey_id === 'GLOBAL') return 1;
    return 0;
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerText}>Análise por Jornada</Text>
        <TouchableOpacity style={[styles.generateBtn, { backgroundColor: neon }]} onPress={handleGenerate} disabled={generating}>
          {generating ? <ActivityIndicator size="small" color="#000" /> : <RefreshCw size={14} color="#000" />}
          <Text style={styles.generateBtnText}>{generating ? "Gerando..." : "Novo Relatório"}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {sortedInsights.map((row, idx) => (
          <InsightCard 
            key={row.journey_id || `global-${idx}`} 
            row={row} 
            journeyName={getJourneyName(row.journey_id)} 
            neon={neon}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  headerText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    // dynamic background
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  generateBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 10,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#9CA3AF',
    marginTop: 10,
    fontSize: 14,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  cardContainer: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 20,
    overflow: 'hidden',
  },
  cardHeader: {
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
    flex: 1,
  },
  title: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeGlobal: {
    // We can inject inline styles or keep the hardcoded transparent green for the badge
    backgroundColor: 'rgba(163, 255, 71, 0.1)',
    borderColor: 'rgba(163, 255, 71, 0.2)',
  },
  badgeJourney: {
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderColor: 'rgba(0, 229, 255, 0.2)',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgeTextGlobal: {
    // dynamic color
  },
  badgeTextJourney: {
    color: '#00E5FF',
  },
  cardContent: {
    padding: 16,
  },
  summaryBox: {
    backgroundColor: '#262626',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 16,
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
    // dynamic color
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
    marginBottom: 12,
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
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 12,
  },
  dateText: {
    color: '#6B7280',
    fontSize: 11,
  },
});
