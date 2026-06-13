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
import { X, Check } from 'lucide-react-native';
import { useTenant } from '../../providers/TenantProvider';
import { useSession } from '../../providers/SessionProvider';
import { supabase } from '../../lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function NewOperacaoM30CaseScreen() {
  const navigation = useNavigation();
  const { activeTenant } = useTenant();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const activeTenantId = activeTenant?.id;
  const neon = activeTenant?.neon_primary || '#A3FF47';
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [searchEntity, setSearchEntity] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(user?.id || null);

  // Fetch M30 journey
  const { data: journey } = useQuery({
    queryKey: ['journey_m30_create', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journeys')
        .select('id')
        .eq('tenant_id', activeTenantId!)
        .eq('key', 'operacao_m30')
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch users for assignment
  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['crm_assignable_users', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from('users_profile').select('user_id,display_name,email').eq('tenant_id', activeTenantId!).is('deleted_at', null);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch entities (clients)
  const { data: entities, isLoading: isLoadingEntities } = useQuery({
    queryKey: ['m30_creation_entities_mobile', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('core_entities')
        .select('id, display_name, commercial_commitments!inner(id, status)')
        .eq('tenant_id', activeTenantId!)
        .in('commercial_commitments.status', ['active', 'pending'])
        .is('deleted_at', null)
        .order('display_name');
      if (error) throw error;

      // Deduplicate entities (in case of multiple contracts)
      const unique = new Map<string, any>();
      for (const e of (data ?? [])) {
        if (!unique.has(e.id)) unique.set(e.id, { id: e.id, display_name: e.display_name });
      }
      const arr = Array.from(unique.values());
      arr.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
      return arr;
    },
  });

  const filteredEntities = React.useMemo(() => {
    if (!entities) return [];
    if (!searchEntity.trim()) return entities;
    const sq = searchEntity.toLowerCase().trim();
    return entities.filter(e => (e.display_name || '').toLowerCase().includes(sq));
  }, [entities, searchEntity]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Título é obrigatório');
      if (!journey?.id) throw new Error('Jornada M30 não encontrada');

      const entityName = entities?.find(e => e.id === selectedEntityId)?.display_name || null;

      const basePayload: any = {
        tenant_id: activeTenantId,
        journey_id: journey.id,
        case_type: 'project',
        is_chat: false,
        created_by_channel: 'panel',
        title: title.trim(),
        summary_text: description.trim() || null,
        state: 'BACKLOG',
        customer_entity_id: selectedEntityId,
        assigned_user_id: selectedUserId,
        meta_json: {
          entity_id: selectedEntityId,
          customer_entity_name: entityName,
        },
      };

      const { error } = await supabase.from('cases').insert(basePayload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_cases', activeTenantId] });
      navigation.goBack();
      Alert.alert('Sucesso', 'Caso criado com sucesso!');
    },
    onError: (error: any) => {
      Alert.alert('Erro', error.message || 'Falha ao criar o caso');
    }
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Criar Caso</Text>
            <Text style={styles.headerSub}>Operação M30</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <X color="#9CA3AF" size={24} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.formContainer} keyboardShouldPersistTaps="handled">
          {/* Título */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>TÍTULO DO CASO *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Entrega 1 - AgroTech"
              placeholderTextColor="#6B7280"
              value={title}
              onChangeText={setTitle}
            />
          </View>

          {/* Descrição */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>DESCRIÇÃO</Text>
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              placeholder="Detalhes adicionais..."
              placeholderTextColor="#6B7280"
              value={description}
              onChangeText={setDescription}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Usuário Responsável */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>RESPONSÁVEL</Text>
            {isLoadingUsers ? (
              <ActivityIndicator size="small" color={neon} style={{ alignSelf: 'flex-start', marginTop: 10 }} />
            ) : (
              <ScrollView style={[styles.entityList, { maxHeight: 160 }]} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                <TouchableOpacity 
                  style={[styles.entityRow, selectedUserId === null && { borderColor: neon, backgroundColor: '#111' }]}
                  onPress={() => setSelectedUserId(null)}
                >
                  <Text style={[styles.entityText, selectedUserId === null && { color: neon, fontWeight: 'bold' }]}>
                    Ninguém (Não atribuir)
                  </Text>
                  {selectedUserId === null && <Check size={16} color={neon} />}
                </TouchableOpacity>

                {users?.map((u) => {
                  const isSelected = selectedUserId === u.user_id;
                  return (
                    <TouchableOpacity 
                      key={u.user_id}
                      style={[styles.entityRow, isSelected && { borderColor: neon, backgroundColor: '#111' }]}
                      onPress={() => setSelectedUserId(u.user_id)}
                    >
                      <Text style={[styles.entityText, isSelected && { color: neon, fontWeight: 'bold' }]}>
                        {u.display_name || u.email || 'Usuário'}
                      </Text>
                      {isSelected && <Check size={16} color={neon} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Cliente */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>CLIENTE (COM CONTRATO ATIVO)</Text>
            
            <TextInput
              style={[styles.input, { marginBottom: 8 }]}
              placeholder="Buscar cliente..."
              placeholderTextColor="#6B7280"
              value={searchEntity}
              onChangeText={setSearchEntity}
            />

            {isLoadingEntities ? (
              <ActivityIndicator size="small" color={neon} style={{ alignSelf: 'flex-start', marginTop: 10 }} />
            ) : (
              <ScrollView style={styles.entityList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {filteredEntities.map((e) => {
                  const isSelected = selectedEntityId === e.id;
                  return (
                    <TouchableOpacity 
                      key={e.id}
                      style={[styles.entityRow, isSelected && { borderColor: neon, backgroundColor: '#111' }]}
                      onPress={() => setSelectedEntityId(isSelected ? null : e.id)}
                    >
                      <Text style={[styles.entityText, isSelected && { color: neon, fontWeight: 'bold' }]}>
                        {e.display_name}
                      </Text>
                      {isSelected && <Check size={16} color={neon} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()} disabled={createMutation.isPending}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.createBtn, { backgroundColor: neon }, (!title.trim() || createMutation.isPending) && { opacity: 0.5 }]} 
            onPress={() => createMutation.mutate()}
            disabled={!title.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.createBtnText}>Criar Caso</Text>
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
  },
  headerSub: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 2,
  },
  formContainer: {
    flex: 1,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6B7280',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 8,
    color: '#ffffff',
    padding: 12,
    fontSize: 16,
  },
  entityList: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 8,
    backgroundColor: '#111111',
  },
  entityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
  },
  entityText: {
    color: '#D1D5DB',
    fontSize: 15,
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  },
  cancelBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  createBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
