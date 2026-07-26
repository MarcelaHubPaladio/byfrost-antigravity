import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useTenant } from '../../../providers/TenantProvider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { BrainCircuit, Trash2, Plus } from 'lucide-react-native';

export function BeeIALearningsTab() {
  const { activeTenantId, activeTenant } = useTenant();
  const queryClient = useQueryClient();
  const neon = activeTenant?.neon_primary || '#A3FF47';

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newLearning, setNewLearning] = useState('');

  const { data: learnings, isLoading } = useQuery({
    queryKey: ['beeia_learnings', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('beeia_learnings')
        .select('*')
        .eq('tenant_id', activeTenantId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const deleteLearning = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('beeia_learnings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beeia_learnings', activeTenantId] });
    },
    onError: (err: any) => {
      Alert.alert('Erro', 'Não foi possível excluir: ' + err.message);
    },
  });

  const addLearning = useMutation({
    mutationFn: async () => {
      if (!newLearning.trim()) throw new Error('O aprendizado não pode estar vazio');
      const { error } = await supabase.from('beeia_learnings').insert({
        tenant_id: activeTenantId!,
        learning_text: newLearning.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewLearning('');
      setIsModalVisible(false);
      queryClient.invalidateQueries({ queryKey: ['beeia_learnings', activeTenantId] });
    },
    onError: (err: any) => {
      Alert.alert('Erro', 'Não foi possível adicionar: ' + err.message);
    },
  });

  const handleDelete = (id: string) => {
    Alert.alert('Remover', 'Tem certeza que deseja remover esta memória da IA?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => deleteLearning.mutate(id) },
    ]);
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <BrainCircuit color={neon} size={20} style={{ marginTop: 2 }} />
      <Text style={styles.learningText}>{item.learning_text}</Text>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDelete(item.id)}
      >
        <Trash2 color="#EF4444" size={18} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Memória da IA</Text>
          <Text style={styles.desc}>Fatos e regras que a IA aprendeu sobre o seu negócio.</Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: neon }]}
          onPress={() => setIsModalVisible(true)}
        >
          <Plus color="#000" size={20} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={neon} style={styles.loader} />
      ) : (
        <FlatList
          data={learnings}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhum aprendizado registrado.</Text>}
        />
      )}

      {/* Modal Add Learning */}
      <Modal visible={isModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Novo Aprendizado</Text>
            <Text style={styles.modalDesc}>Adicione uma regra, objeção ou fato para a IA decorar.</Text>
            
            <TextInput
              style={styles.input}
              value={newLearning}
              onChangeText={setNewLearning}
              placeholder="Ex: Não fazemos entregas aos domingos."
              placeholderTextColor="#4B5563"
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: neon }]}
                onPress={() => addLearning.mutate()}
                disabled={addLearning.isPending}
              >
                {addLearning.isPending ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={styles.modalSaveText}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  title: { color: '#F9FAFB', fontSize: 18, fontWeight: '700' },
  desc: { color: '#6B7280', fontSize: 13, marginTop: 2, maxWidth: '80%' },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: { marginTop: 60 },
  list: { padding: 20, gap: 12, paddingBottom: 60 },
  card: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  learningText: {
    flex: 1,
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
  },
  deleteBtn: {
    padding: 4,
  },
  emptyText: { color: '#4B5563', textAlign: 'center', marginTop: 40 },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 16,
    padding: 20,
    width: '100%',
  },
  modalTitle: { color: '#F9FAFB', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  modalDesc: { color: '#9CA3AF', fontSize: 13, marginBottom: 16 },
  input: {
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 8,
    padding: 12,
    color: '#F9FAFB',
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalCancelText: { color: '#9CA3AF', fontWeight: '600' },
  modalSaveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: { color: '#000', fontWeight: '700' },
});
