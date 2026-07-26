import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTenant } from '../../../providers/TenantProvider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { Save } from 'lucide-react-native';

export function BeeIAConfigTab() {
  const { activeTenantId, activeTenant } = useTenant();
  const queryClient = useQueryClient();
  const neon = activeTenant?.neon_primary || '#A3FF47';

  const [isActive, setIsActive] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [targetStage, setTargetStage] = useState('morno');

  const { data: config, isLoading } = useQuery({
    queryKey: ['beeia_config', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('beeia_configs')
        .select('system_prompt, target_stage, is_active')
        .eq('tenant_id', activeTenantId!)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (config) {
      setIsActive(config.is_active ?? true);
      setSystemPrompt(config.system_prompt || '');
      setTargetStage(config.target_stage || '');
    }
  }, [config]);

  const saveConfig = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('beeia_configs')
        .upsert(
          {
            tenant_id: activeTenantId!,
            system_prompt: systemPrompt,
            target_stage: targetStage,
            is_active: isActive,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id' }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      Alert.alert('Sucesso', 'Configurações salvas!');
      queryClient.invalidateQueries({ queryKey: ['beeia_config', activeTenantId] });
    },
    onError: (err: any) => {
      Alert.alert('Erro', 'Não foi possível salvar: ' + err.message);
    },
  });

  if (isLoading) {
    return <ActivityIndicator size="large" color={neon} style={styles.loader} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={styles.cardTitle}>Status Global</Text>
            <Text style={styles.cardDesc}>Ativa ou desativa a IA para todas as conexões.</Text>
          </View>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ false: '#374151', true: neon }}
            thumbColor={'#fff'}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Estágio Alvo (Target Stage)</Text>
        <Text style={styles.desc}>Fase ideal em que a IA deve classificar o cliente se a venda for fechada.</Text>
        <TextInput
          style={styles.input}
          value={targetStage}
          onChangeText={setTargetStage}
          placeholder="Ex: fechado_ganho"
          placeholderTextColor="#4B5563"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Prompt de Sistema</Text>
        <Text style={styles.desc}>Instruções primárias de comportamento da Inteligência Artificial.</Text>
        <TextInput
          style={styles.textArea}
          value={systemPrompt}
          onChangeText={setSystemPrompt}
          placeholder="Você é um assistente virtual..."
          placeholderTextColor="#4B5563"
          multiline
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: neon }]}
        onPress={() => saveConfig.mutate()}
        disabled={saveConfig.isPending}
      >
        {saveConfig.isPending ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <>
            <Save color="#000" size={18} />
            <Text style={styles.saveBtnText}>Salvar Configurações</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  loader: { marginTop: 60 },
  card: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: { color: '#F9FAFB', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardDesc: { color: '#6B7280', fontSize: 13, paddingRight: 20 },
  label: { color: '#F9FAFB', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  desc: { color: '#6B7280', fontSize: 13, marginBottom: 12 },
  input: {
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    color: '#F9FAFB',
    fontSize: 14,
  },
  textArea: {
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 8,
    padding: 12,
    minHeight: 180,
    color: '#F9FAFB',
    fontSize: 14,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
  },
  saveBtnText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
});
