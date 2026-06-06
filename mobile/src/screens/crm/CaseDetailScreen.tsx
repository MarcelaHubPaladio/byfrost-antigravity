import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  SafeAreaView, 
  ActivityIndicator,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  Pressable
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ArrowLeft, User as UserIcon, Check, X, MapPin, Mail, Phone, Hash, Trash2, MessageSquare, PackagePlus, CheckSquare, NotebookPen, Plus } from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../providers/TenantProvider';
import { useSession } from '../../providers/SessionProvider';

export function CaseDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { activeTenantId } = useTenant();


  const { user } = useSession(); // ADDED session

  // Products State
  const [showProductModal, setShowProductModal] = useState(false);
  const [productDesc, setProductDesc] = useState('');
  const [productEntityId, setProductEntityId] = useState<string | null>(null);
  const [productPrice, setProductPrice] = useState('');
  const [productQty, setProductQty] = useState('1');

  // Tasks State
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Notes State
  const [newNoteBody, setNewNoteBody] = useState('');

  // Queries
  
  const { data: offeringsQ } = useQuery({
    queryKey: ["crm_offerings_search", activeTenantId, productDesc],
    enabled: Boolean(activeTenantId && productDesc.length > 0),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id, display_name, meta_json")
        .eq("tenant_id", activeTenantId!)
        .eq("entity_type", "offering")
        .is("deleted_at", null)
        .ilike("display_name", `%${productDesc}%`)
        .order("display_name", { ascending: true })
        .limit(5);

      if (error) throw error;
      return data ?? [];
    },
  });

const { data: itemsQ } = useQuery({
    queryKey: ['case_items', caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase.from('case_items').select('*').eq('case_id', caseId);
      if (error) throw error;
      return data ?? [];
    }
  });

  const { data: tasksQ } = useQuery({
    queryKey: ['case_tasks', caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*').eq('case_id', caseId).is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    }
  });

  const { data: notesQ } = useQuery({
    queryKey: ['case_notes', caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase.from('case_notes').select('*, users_profile(display_name)').eq('case_id', caseId).is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    }
  });

  // Mutations
  const addProductMutation = useMutation({
    mutationFn: async () => {
      const price = parseFloat(productPrice.replace(',', '.')) || 0;
      const qty = parseInt(productQty, 10) || 1;
      const total = price * qty;
      const { error } = await supabase.from('case_items').insert({
        tenant_id: activeTenantId,
        case_id: caseId,
        description: productDesc,
        price,
        qty,
        total,
        offering_entity_id: productEntityId
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case_items', caseId] });
      setShowProductModal(false);
      setProductDesc('');
      setProductPrice('');
      setProductQty('1');
      setProductEntityId(null);
    }
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('case_items').delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case_items', caseId] })
  });

  const addTaskMutation = useMutation({
    mutationFn: async () => {
      if (!newTaskTitle.trim()) return;
      const { error } = await supabase.from('tasks').insert({
        tenant_id: activeTenantId,
        case_id: caseId,
        title: newTaskTitle.trim(),
        status: 'pending',
        meta_json: {}
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case_tasks', caseId] });
      setNewTaskTitle('');
    }
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      const newStatus = status === 'done' ? 'pending' : 'done';
      const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case_tasks', caseId] })
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case_tasks', caseId] })
  });

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      if (!newNoteBody.trim()) return;
      const { error } = await supabase.from('case_notes').insert({
        tenant_id: activeTenantId,
        case_id: caseId,
        body_text: newNoteBody.trim(),
        created_by_user_id: user?.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case_notes', caseId] });
      setNewNoteBody('');
    }
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('case_notes').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case_notes', caseId] })
  });

  
  const caseId = route.params?.id;

  const [activeTab, setActiveTab] = useState<'dados' | 'chat'>('dados');

  const [localState, setLocalState] = useState('');
  const [localOwnerId, setLocalOwnerId] = useState<string | null>(null);
  
  // Modals for selection
  const [showStateModal, setShowStateModal] = useState(false);
  const [showOwnerModal, setShowOwnerModal] = useState(false);

  // Customer Edit State
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // 1. Fetch Case Data
  const { data: caseData, isLoading } = useQuery({
    queryKey: ['case_detail', caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select(`
          *,
          customer_accounts(*),
          users_profile!fk_cases_users_profile(display_name, email),
          journeys!cases_journey_id_fkey(key, name, is_crm, default_state_machine_json)
        `)
        .eq('id', caseId)
        .single();
        
      if (error) throw error;
      return data;
    }
  });

  // 2. Fetch Users for Owner Selection
  const { data: usersQ } = useQuery({
    queryKey: ["crm_assignable_users", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("users_profile")
        .select("user_id, display_name, email")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Sync local state when caseData loads
  useEffect(() => {
    if (caseData) {
      setLocalState(caseData.state);
      setLocalOwnerId(caseData.assigned_user_id);
      
      if (caseData.customer_accounts) {
        setCustomerName(caseData.customer_accounts.name || '');
        setCustomerEmail(caseData.customer_accounts.email || '');
        setCustomerPhone(caseData.customer_accounts.phone_e164 || '');
      }
    }
  }, [caseData]);

  const stages = useMemo(() => {
    const st = (caseData?.journeys?.default_state_machine_json?.states ?? []) as string[];
    const normalized = (st ?? []).map((s) => String(s)).filter(Boolean);
    return Array.from(new Set(normalized));
  }, [caseData]);

  // Mutations
  const updateCaseMutation = useMutation({
    mutationFn: async (updates: any) => {
      const { error } = await supabase
        .from('cases')
        .update(updates)
        .eq('id', caseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_cases_by_tenant'] });
      queryClient.invalidateQueries({ queryKey: ['case_detail', caseId] });
      Alert.alert('Sucesso', 'Lead atualizado com sucesso.');
    },
    onError: () => {
      Alert.alert('Erro', 'Não foi possível atualizar o lead.');
    }
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async () => {
      if (!caseData?.customer_id) return;
      const { error } = await supabase
        .from('customer_accounts')
        .update({
          name: customerName,
          email: customerEmail,
          phone_e164: customerPhone
        })
        .eq('id', caseData.customer_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_customers'] });
      queryClient.invalidateQueries({ queryKey: ['case_detail', caseId] });
      Alert.alert('Sucesso', 'Dados do cliente salvos.');
    }
  });

  const deleteCaseMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('cases')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', caseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_cases_by_tenant'] });
      Alert.alert('Excluído', 'Lead removido com sucesso.');
      navigation.goBack();
    }
  });

  const handleSaveCustomer = () => {
    updateCustomerMutation.mutate();
  };

  const handleStateChange = (newState: string) => {
    setLocalState(newState);
    setShowStateModal(false);
    updateCaseMutation.mutate({ state: newState });
  };

  const handleOwnerChange = (newOwnerId: string) => {
    setLocalOwnerId(newOwnerId);
    setShowOwnerModal(false);
    updateCaseMutation.mutate({ assigned_user_id: newOwnerId });
  };

  const handleDelete = () => {
    Alert.alert(
      'Excluir Lead', 
      'Tem certeza que deseja excluir permanentemente este caso?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => deleteCaseMutation.mutate() }
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <ArrowLeft color="#ffffff" size={24} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#00E5FF" />
        </View>
      </SafeAreaView>
    );
  }

  if (!caseData) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <ArrowLeft color="#ffffff" size={24} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Text>Caso não encontrado.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const assignedUser = Array.isArray(caseData.users_profile) ? caseData.users_profile[0] : caseData.users_profile;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft color="#ffffff" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Gestão do Lead</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Custom Top Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'dados' && styles.tabBtnActive]} 
          onPress={() => setActiveTab('dados')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'dados' && styles.tabBtnTextActive]}>Dados do Lead</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'chat' && styles.tabBtnActive]} 
          onPress={() => setActiveTab('chat')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'chat' && styles.tabBtnTextActive]}>Chat (WhatsApp)</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'dados' ? (
        <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
          
          {/* Title Section */}
        <Text style={styles.caseTitle}>{caseData.title || caseData.customer_accounts?.name || 'Projeto Sem Título'}</Text>
        <View style={styles.tagIdRow}>
          <Hash color="#9CA3AF" size={14} />
          <Text style={styles.tagIdText}>{caseData.id.split('-')[0]}</Text>
        </View>

        {/* Edit State (Fase) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Fase Atual</Text>
          <TouchableOpacity style={styles.selectBox} onPress={() => setShowStateModal(true)}>
            <View style={[styles.statusDot, { backgroundColor: '#00E5FF' }]} />
            <Text style={styles.selectBoxText}>
              {localState ? localState.replace(/[_-]+/g, " ") : 'Selecione uma fase...'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Edit Owner (Responsável) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Responsável</Text>
          <TouchableOpacity style={styles.selectBox} onPress={() => setShowOwnerModal(true)}>
            <UserIcon color="#6B7280" size={18} />
            <Text style={styles.selectBoxText}>
              {localOwnerId 
                ? (usersQ?.find((u:any) => u.user_id === localOwnerId)?.display_name || 'Usuário Desconhecido')
                : 'Não Atribuído'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Customer Info (Dados do Cliente) */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Dados do Cliente</Text>
            <TouchableOpacity onPress={handleSaveCustomer}>
              <Text style={styles.saveBtnText}>Salvar</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.inputGroup}>
            <View style={styles.inputIcon}><UserIcon color="#9CA3AF" size={16} /></View>
            <TextInput
              style={styles.input}
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Nome do Cliente"
              placeholderTextColor="#6B7280"
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputIcon}><Phone color="#9CA3AF" size={16} /></View>
            <TextInput
              style={styles.input}
              value={customerPhone}
              onChangeText={setCustomerPhone}
              placeholder="+55 (11) 99999-9999"
              placeholderTextColor="#6B7280"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputIcon}><Mail color="#9CA3AF" size={16} /></View>
            <TextInput
              style={styles.input}
              value={customerEmail}
              onChangeText={setCustomerEmail}
              placeholder="cliente@email.com"
              placeholderTextColor="#6B7280"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Produtos */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <PackagePlus color="#9CA3AF" size={18} />
              <Text style={styles.cardTitle}>Produtos & Valores</Text>
            </View>
            <TouchableOpacity onPress={() => setShowProductModal(true)}>
              <Plus color="#00E5FF" size={20} />
            </TouchableOpacity>
          </View>
          
          {itemsQ?.length === 0 ? (
            <Text style={{color: '#6B7280', fontSize: 14}}>Nenhum produto adicionado.</Text>
          ) : (
            itemsQ?.map(item => (
              <View key={item.id} style={styles.listItem}>
                <View style={{flex: 1}}>
                  <Text style={{color: '#ffffff', fontSize: 16, fontWeight: '500'}}>{item.description}</Text>
                  <Text style={{color: '#9CA3AF', fontSize: 12}}>{item.qty}x de R$ {item.price}</Text>
                </View>
                <Text style={{color: '#00E5FF', fontWeight: 'bold'}}>R$ {item.total}</Text>
                <TouchableOpacity onPress={() => deleteProductMutation.mutate(item.id)} style={{padding: 8, marginLeft: 8}}>
                  <Trash2 color="#EF4444" size={16} />
                </TouchableOpacity>
              </View>
            ))
          )}
          
          {itemsQ && itemsQ.length > 0 && (
            <View style={{marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#374151', flexDirection: 'row', justifyContent: 'space-between'}}>
              <Text style={{color: '#ffffff', fontWeight: 'bold'}}>Total do Caso</Text>
              <Text style={{color: '#00E5FF', fontWeight: 'bold', fontSize: 16}}>
                R$ {itemsQ.reduce((acc, curr) => acc + (curr.total || 0), 0).toFixed(2)}
              </Text>
            </View>
          )}
        </View>

        {/* Tarefas */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <CheckSquare color="#9CA3AF" size={18} />
              <Text style={styles.cardTitle}>Tarefas / Checklist</Text>
            </View>
          </View>
          
          <View style={styles.quickInputRow}>
            <TextInput
              style={styles.quickInput}
              placeholder="Nova tarefa..."
              placeholderTextColor="#6B7280"
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
            />
            <TouchableOpacity 
              style={styles.quickAddBtn} 
              onPress={() => addTaskMutation.mutate()}
              disabled={addTaskMutation.isPending}
            >
              <Plus color="#111827" size={20} />
            </TouchableOpacity>
          </View>

          {tasksQ?.map(task => (
            <View key={task.id} style={styles.listItem}>
              <TouchableOpacity onPress={() => toggleTaskMutation.mutate({ id: task.id, status: task.status })}>
                <View style={[styles.checkbox, task.status === 'done' && styles.checkboxChecked]}>
                  {task.status === 'done' && <Check color="#000000" size={12} />}
                </View>
              </TouchableOpacity>
              <Text style={[styles.taskTitle, task.status === 'done' && styles.taskTitleDone]}>
                {task.title}
              </Text>
              <TouchableOpacity onPress={() => deleteTaskMutation.mutate(task.id)} style={{padding: 8}}>
                <Trash2 color="#EF4444" size={16} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Observações */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <NotebookPen color="#9CA3AF" size={18} />
              <Text style={styles.cardTitle}>Observações</Text>
            </View>
          </View>

          <View style={{marginBottom: 16}}>
            <TextInput
              style={styles.textArea}
              placeholder="Digite uma observação..."
              placeholderTextColor="#6B7280"
              multiline
              numberOfLines={3}
              value={newNoteBody}
              onChangeText={setNewNoteBody}
            />
            <TouchableOpacity 
              style={[styles.quickAddBtn, { alignSelf: 'flex-end', marginTop: 8 }]} 
              onPress={() => addNoteMutation.mutate()}
              disabled={addNoteMutation.isPending}
            >
              <Text style={{color: '#111827', fontWeight: 'bold', paddingHorizontal: 8}}>Salvar Nota</Text>
            </TouchableOpacity>
          </View>

          {notesQ?.map(note => (
            <View key={note.id} style={styles.noteItem}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4}}>
                <Text style={{color: '#00E5FF', fontSize: 12, fontWeight: 'bold'}}>
                  {note.users_profile?.display_name || 'Usuário'}
                </Text>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <Text style={{color: '#6B7280', fontSize: 10}}>
                    {new Date(note.created_at).toLocaleString()}
                  </Text>
                  <TouchableOpacity onPress={() => deleteNoteMutation.mutate(note.id)}>
                    <Trash2 color="#EF4444" size={14} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={{color: '#D1D5DB', fontSize: 14}}>{note.body_text}</Text>
            </View>
          ))}
        </View>


        {/* Danger Zone */}
        <View style={styles.dangerZone}>
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Trash2 color="#EF4444" size={20} />
            <Text style={styles.deleteBtnText}>Excluir Lead</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
      ) : (
        <View style={styles.chatContainer}>
          <MessageSquare color="#9CA3AF" size={48} />
          <Text style={styles.chatTitle}>Chat em Breve</Text>
          <Text style={styles.chatSubtitle}>Aqui será renderizada a timeline do WhatsApp.</Text>
        </View>
      )}

      
      {/* Product Modal */}
      <Modal visible={showProductModal} animationType="slide" transparent={true} onRequestClose={() => setShowProductModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowProductModal(false)}>
          <Pressable style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Adicionar Produto</Text>
              <TouchableOpacity onPress={() => setShowProductModal(false)}><X color="#9CA3AF" size={24} /></TouchableOpacity>
            </View>
            <ScrollView style={{padding: 24}}>
              <Text style={styles.label}>DESCRIÇÃO DO PRODUTO</Text>
              <TextInput style={styles.input} value={productDesc} onChangeText={(txt) => { setProductDesc(txt); setProductEntityId(null); }} placeholderTextColor="#6B7280" placeholder="Ex: Consultoria Plena" />

              {productDesc.length > 0 && !productEntityId && offeringsQ && offeringsQ.length > 0 && (
                <View style={styles.suggestionsCard}>
                  {offeringsQ.map((offering) => (
                    <TouchableOpacity 
                      key={offering.id} 
                      style={styles.suggestionItem}
                      onPress={() => {
                        setProductDesc(offering.display_name);
                        setProductEntityId(offering.id);
                        if (offering.meta_json?.base_price) {
                          setProductPrice(String(offering.meta_json.base_price));
                        }
                      }}
                    >
                      <Text style={styles.suggestionText}>{offering.display_name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              
              <View style={{flexDirection: 'row', gap: 16, marginTop: 16}}>
                <View style={{flex: 1}}>
                  <Text style={styles.label}>PREÇO UNITÁRIO (R$)</Text>
                  <TextInput style={styles.input} value={productPrice} onChangeText={setProductPrice} placeholderTextColor="#6B7280" placeholder="0.00" keyboardType="numeric" />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.label}>QUANTIDADE</Text>
                  <TextInput style={styles.input} value={productQty} onChangeText={setProductQty} placeholderTextColor="#6B7280" keyboardType="numeric" />
                </View>
              </View>

              <TouchableOpacity 
                style={[styles.createBtn, {marginTop: 32}]} 
                onPress={() => addProductMutation.mutate()}
                disabled={addProductMutation.isPending}
              >
                <Text style={styles.createBtnText}>Adicionar Produto</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

{/* State Modal */}
      <Modal visible={showStateModal} animationType="slide" transparent={true} onRequestClose={() => setShowStateModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowStateModal(false)}>
          <Pressable style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mudar Fase do Lead</Text>
              <TouchableOpacity onPress={() => setShowStateModal(false)}><X color="#9CA3AF" size={24} /></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              {stages.map((st) => (
                <TouchableOpacity key={st} style={styles.modalRow} onPress={() => handleStateChange(st)}>
                  <Text style={[styles.modalRowText, localState === st && styles.modalRowTextSelected]}>
                    {st.replace(/[_-]+/g, " ")}
                  </Text>
                  {localState === st && <Check color="#00E5FF" size={20} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Owner Modal */}
      <Modal visible={showOwnerModal} animationType="slide" transparent={true} onRequestClose={() => setShowOwnerModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowOwnerModal(false)}>
          <Pressable style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Atribuir a Usuário</Text>
              <TouchableOpacity onPress={() => setShowOwnerModal(false)}><X color="#9CA3AF" size={24} /></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              <TouchableOpacity style={styles.modalRow} onPress={() => handleOwnerChange('')}>
                <Text style={[styles.modalRowText, !localOwnerId && styles.modalRowTextSelected]}>Não Atribuído</Text>
                {!localOwnerId && <Check color="#00E5FF" size={20} />}
              </TouchableOpacity>
              {usersQ?.map((u: any) => (
                <TouchableOpacity key={u.user_id} style={styles.modalRow} onPress={() => handleOwnerChange(u.user_id)}>
                  <Text style={[styles.modalRowText, localOwnerId === u.user_id && styles.modalRowTextSelected]}>
                    {u.display_name || u.email}
                  </Text>
                  {localOwnerId === u.user_id && <Check color="#00E5FF" size={20} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000', 
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#00E5FF',
  },
  tabBtnText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 14,
  },
  tabBtnTextActive: {
    color: '#00E5FF',
  },
  chatContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 16,
    marginBottom: 8,
  },
  chatSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  caseTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  tagIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  tagIdText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  saveBtnText: {
    color: '#00E5FF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  selectBoxText: {
    fontSize: 16,
    color: '#ffffff',
    marginLeft: 8,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#1F2937',
  },
  inputIcon: {
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: '#374151',
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    height: 48,
    color: '#ffffff',
  },
  dangerZone: {
    marginTop: 24,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7F1D1D',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  deleteBtnText: {
    color: '#FCA5A5',
    fontWeight: 'bold',
    fontSize: 16,
  },


  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  quickInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  quickInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    color: '#ffffff',
    backgroundColor: '#1F2937',
  },
  quickAddBtn: {
    backgroundColor: '#00E5FF',
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#6B7280',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#00E5FF',
    borderColor: '#00E5FF',
  },
  taskTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
  },
  taskTitleDone: {
    color: '#6B7280',
    textDecorationLine: 'line-through',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    color: '#ffffff',
    backgroundColor: '#1F2937',
    textAlignVertical: 'top',
  },
  noteItem: {
    backgroundColor: '#1F2937',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9CA3AF',
    marginBottom: 8,
  },
  createBtn: {
    backgroundColor: '#00E5FF', 
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  createBtnText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 14,
  },

  suggestionsCard: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  suggestionText: {
    color: '#00E5FF',
    fontWeight: '500',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalScroll: {
    padding: 16,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  modalRowText: {
    color: '#D1D5DB',
    fontSize: 16,
    textTransform: 'capitalize',
  },
  modalRowTextSelected: {
    color: '#00E5FF',
    fontWeight: 'bold',
  },
});
