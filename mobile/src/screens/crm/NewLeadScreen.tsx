import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { X, MapPin, LocateFixed } from 'lucide-react-native';
import * as Location from 'expo-location';
import { useTenant } from '../../providers/TenantProvider';
import { useSession } from '../../providers/SessionProvider';
import { supabase } from '../../lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function NewLeadScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { activeTenant } = useTenant();
  const activeTenantId = activeTenant?.id;
  const neon = activeTenant?.neon_primary || '#A3FF47';

  // Buscar jornada CRM
  const { data: journeys } = useQuery({
    queryKey: ['tenant_crm_journeys_enabled', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_journeys')
        .select('journeys(id,key,name,is_crm,default_state_machine_json)')
        .eq('tenant_id', activeTenantId!)
        .eq('enabled', true);
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => r.journeys)
        .filter((j: any) => j && j.is_crm);
    },
  });

  const createLead = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error('Tenant não selecionado');
      if (!name.trim()) throw new Error('O nome do lead é obrigatório');
      if (!whatsapp.trim() || whatsapp.trim() === '+55') throw new Error('O WhatsApp do lead é obrigatório');

      const journeyId = journeys?.[0]?.id;
      if (!journeyId) throw new Error('Nenhuma jornada CRM ativa encontrada neste workspace.');
      
      const stateMachine = journeys?.[0]?.default_state_machine_json;
      const initialState = stateMachine?.states?.[0] || 'novo';

      // 1. Criar Cliente (ou aproveitar existente)
      const { data: customer, error: custErr } = await supabase
        .from('customer_accounts')
        .upsert({
          tenant_id: activeTenantId,
          name: name.trim(),
          phone_e164: whatsapp.trim(),
          email: email.trim() || null
        }, { onConflict: 'tenant_id,phone_e164' })
        .select('id')
        .single();
      
      if (custErr) throw custErr;

      // 2. Criar Caso (Lead)
      const { data: newCase, error: caseErr } = await supabase
        .from('cases')
        .insert({
          tenant_id: activeTenantId,
          customer_id: customer.id,
          journey_id: journeyId,
          state: initialState,
          assigned_user_id: user?.id,
          title: name.trim(),
          is_chat: false
        })
        .select('id')
        .single();
      
      if (caseErr) throw caseErr;

      // 3. Registrar na Timeline
      await supabase.from('timeline_events').insert({
        tenant_id: activeTenantId,
        case_id: newCase.id,
        event_type: 'card_created',
        actor_type: 'admin',
        actor_id: user?.id || null,
        message: `Lead criado: ${name.trim()}`,
        meta_json: { kind: 'crm', assigned_user_id: user?.id },
        occurred_at: new Date().toISOString()
      });

      return newCase.id;
    },
    onSuccess: (newCaseId) => {
      queryClient.invalidateQueries({ queryKey: ['crm_cases_by_tenant'] });
      // Substitui a tela atual (modal de criação) pela tela de detalhes do lead
      navigation.replace('CaseDetail', { id: newCaseId });
    },
    onError: (err: any) => {
      console.error(err);
      let msg = 'Não foi possível criar o lead. Tente novamente ou contate o suporte.';
      const rawMsg = String(err.message || '').toLowerCase();
      
      if (rawMsg.includes('violates unique constraint')) {
        msg = 'Já existe um lead cadastrado com esse número de WhatsApp neste sistema.';
      } else if (rawMsg.includes('violates check constraint')) {
        msg = 'Alguma informação não atende aos requisitos do sistema. Verifique os dados.';
      } else if (rawMsg.includes('network') || rawMsg.includes('fetch')) {
        msg = 'Problema de conexão. Verifique sua internet.';
      } else if (rawMsg.includes('tenant')) {
        msg = 'Você precisa estar logado e com um workspace ativo.';
      }

      Alert.alert('Ops, algo deu errado', msg);
    }
  });
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('+55');
  const [email, setEmail] = useState('');
  
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  const handleGetLocation = async () => {
    setLoadingLocation(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão negada', 'Precisamos de acesso à sua localização para usar o GPS.');
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
    } catch (e: any) {
      Alert.alert('Erro', 'Não foi possível obter a localização.');
    } finally {
      setLoadingLocation(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Novo lead</Text>
            <Text style={styles.headerSub}>Cria um lead no CRM ativo.</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <X color="#9CA3AF" size={24} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.formContainer}>
          {/* Nome */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>NOME</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Maria Souza"
              placeholderTextColor="#6B7280"
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* WhatsApp */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>WHATSAPP</Text>
            <TextInput
              style={styles.input}
              placeholder="+55"
              placeholderTextColor="#6B7280"
              keyboardType="phone-pad"
              value={whatsapp}
              onChangeText={setWhatsapp}
            />
            <Text style={styles.helpText}>Aceita com ou sem +55 (DDDs brasileiros).</Text>
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>EMAIL (OPCIONAL)</Text>
            <TextInput
              style={styles.input}
              placeholder="maria@exemplo.com"
              placeholderTextColor="#6B7280"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {/* Localização (Placeholder) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>LOCALIZAÇÃO DO LEAD</Text>
            <View style={styles.mapPlaceholder}>
              <View style={styles.mapHeader}>
                <View style={styles.mapHeaderLeft}>
                  <MapPin color="#6B7280" size={16} />
                  <Text style={styles.mapHeaderText}>Mova o pin ou clique no mapa</Text>
                </View>
                <TouchableOpacity style={styles.gpsBtn} onPress={handleGetLocation}>
                  {loadingLocation ? (
                    <ActivityIndicator size="small" color="#374151" />
                  ) : (
                    <>
                      <LocateFixed color="#374151" size={16} />
                      <Text style={styles.gpsBtnText}>GPS</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.mapVisual}>
                {location ? (
                  <>
                    <Text style={[styles.mapVisualText, { color: '#059669', marginBottom: 4 }]}>Localização Encontrada!</Text>
                    <Text style={{ color: '#6B7280', fontSize: 12 }}>
                      Lat: {location.coords.latitude.toFixed(6)}
                    </Text>
                    <Text style={{ color: '#6B7280', fontSize: 12 }}>
                      Lon: {location.coords.longitude.toFixed(6)}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.mapVisualText}>[ Mapa Interativo ]</Text>
                )}
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.createBtn, { backgroundColor: neon }, createLead.isPending && { opacity: 0.7 }]} 
            onPress={() => createLead.mutate()}
            disabled={createLead.isPending}
          >
            {createLead.isPending ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Text style={styles.createBtnText}>Criar lead</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  formContainer: {
    flex: 1,
    padding: 24,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9CA3AF',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 16,
    color: '#F9FAFB',
    backgroundColor: '#1A1A1A',
  },
  helpText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
  },
  mapPlaceholder: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    overflow: 'hidden',
  },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    backgroundColor: '#1A1A1A',
  },
  mapHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapHeaderText: {
    fontSize: 14,
    color: '#D1D5DB',
    fontWeight: '500',
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  gpsBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#D1D5DB',
  },
  mapVisual: {
    height: 120,
    backgroundColor: '#141414',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapVisualText: {
    color: '#4B5563',
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#9CA3AF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  createBtn: {
    flex: 2,
    backgroundColor: '#A3FF47',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  createBtnText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
