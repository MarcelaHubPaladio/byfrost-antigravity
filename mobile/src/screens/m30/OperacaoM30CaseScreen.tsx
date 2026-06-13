import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  
  ActivityIndicator,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
  ArrowLeft,
  User as UserIcon,
  Check,
  X,
  Mail,
  Phone,
  Hash,
  Trash2,
  MessageSquare,
  PackagePlus,
  CheckSquare,
  NotebookPen,
  Plus,
  ChevronDown,
  ChevronRight,
  Video,
  Link as LinkIcon,
  ListChecks,
} from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../providers/TenantProvider';
import { useSession } from '../../providers/SessionProvider';

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────

function BottomSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={bs.overlay} onPress={onClose}>
        <Pressable style={bs.sheet}>
          <View style={bs.handle} />
          <View style={bs.header}>
            <Text style={bs.title}>{title}</Text>
            <TouchableOpacity style={bs.closeBtn} onPress={onClose}>
              <X size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          <ScrollView style={bs.scroll}>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const bs = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#141414', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: '#2A2A2A', maxHeight: '75%', paddingBottom: 24 },
  handle: { width: 36, height: 4, backgroundColor: '#2A2A2A', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  title: { fontSize: 16, fontWeight: '700', color: '#F9FAFB' },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 12, paddingTop: 4 },
});

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  action,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderLeft}>
          {icon}
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function OperacaoM30CaseScreen({ route: _route, navigation: _navigation }: any) {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { activeTenantId, activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';
  const { user } = useSession();
  const caseId = route.params?.id;

  // Local state
  const [activeTab, setActiveTab] = useState<'dados' | 'chat'>('dados');
  const [localState, setLocalState] = useState('');
  const [localOwnerId, setLocalOwnerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Modals
  const [showStateModal, setShowStateModal] = useState(false);
  const [showOwnerModal, setShowOwnerModal] = useState(false);

  // M30 Specific State
  const [videoUrl, setVideoUrl] = useState('');
  const [importantLinks, setImportantLinks] = useState<any[]>([]);
  const [pendingSubtasks, setPendingSubtasks] = useState<any[]>([]);

  // Task / note
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: tasksQ } = useQuery({
    queryKey: ['case_tasks', caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('case_id', caseId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: notesQ } = useQuery({
    queryKey: ['case_notes', caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_notes')
        .select('*, users_profile(display_name)')
        .eq('case_id', caseId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: caseData, isLoading } = useQuery({
    queryKey: ['case_detail', caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select('*, customer_accounts(*), users_profile!fk_cases_users_profile(display_name, email), journeys!cases_journey_id_fkey(key, name, is_crm, default_state_machine_json)')
        .eq('id', caseId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: usersQ } = useQuery({
    queryKey: ['crm_assignable_users', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users_profile')
        .select('user_id, display_name, email')
        .eq('tenant_id', activeTenantId!)
        .is('deleted_at', null);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (caseData) {
      setLocalState(caseData.state);
      setLocalOwnerId(caseData.assigned_user_id);
      if (caseData.customer_accounts) {
        setCustomerName(caseData.customer_accounts.name || '');
        setCustomerEmail(caseData.customer_accounts.email || '');
        setCustomerPhone(caseData.customer_accounts.phone_e164 || '');
      }
      
      // Parse M30 Meta
      const meta = typeof caseData.meta_json === 'string' ? JSON.parse(caseData.meta_json || '{}') : (caseData.meta_json || {});
      setVideoUrl(meta.video_url || '');
      setImportantLinks(meta.important_links || []);
      setPendingSubtasks(meta.pending_subtasks || []);
    }
  }, [caseData]);

  const stages = useMemo(() => {
    const st = (caseData?.journeys?.default_state_machine_json?.states ?? []) as string[];
    return Array.from(new Set((st ?? []).map((s) => String(s)).filter(Boolean)));
  }, [caseData]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const updateCase = useMutation({
    mutationFn: async (updates: any) => {
      const { error } = await supabase.from('cases').update(updates).eq('id', caseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_cases_by_tenant'] });
      queryClient.invalidateQueries({ queryKey: ['case_detail', caseId] });
    },
    onError: () => Alert.alert('Erro', 'Não foi possível atualizar.'),
  });

  const updateCustomer = useMutation({
    mutationFn: async () => {
      if (!caseData?.customer_id) return;
      const { error } = await supabase
        .from('customer_accounts')
        .update({ name: customerName, email: customerEmail, phone_e164: customerPhone })
        .eq('id', caseData.customer_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case_detail', caseId] });
      Alert.alert('Salvo!', 'Dados do cliente atualizados.');
    },
  });

  const addTask = useMutation({
    mutationFn: async () => {
      if (!newTaskTitle.trim()) return;
      const { error } = await supabase.from('tasks').insert({
        tenant_id: activeTenantId,
        case_id: caseId,
        title: newTaskTitle.trim(),
        status: 'pending',
        meta_json: {},
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case_tasks', caseId] });
      setNewTaskTitle('');
    },
  });

  const toggleTask = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status: status === 'done' ? 'pending' : 'done' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case_tasks', caseId] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case_tasks', caseId] }),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      if (!newNoteBody.trim()) return;
      const { error } = await supabase.from('case_notes').insert({
        tenant_id: activeTenantId,
        case_id: caseId,
        body_text: newNoteBody.trim(),
        created_by_user_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case_notes', caseId] });
      setNewNoteBody('');
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('case_notes').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case_notes', caseId] }),
  });

  const deleteCase = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('cases').update({ deleted_at: new Date().toISOString() }).eq('id', caseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_cases_by_tenant'] });
      navigation.goBack();
    },
  });

  const handleDelete = () => {
    Alert.alert('Excluir Lead', 'Deseja excluir permanentemente este lead?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => deleteCase.mutate() },
    ]);
  };

  // ── Computed ───────────────────────────────────────────────────────────────

  const stateLabel = (localState || '').replace(/[_-]+/g, ' ');
  const ownerName = localOwnerId
    ? usersQ?.find((u: any) => u.user_id === localOwnerId)?.display_name || 'Usuário'
    : 'Não atribuído';

  // ── Loading / Not Found ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <ArrowLeft color="#F9FAFB" size={22} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={neon} />
        </View>
      </SafeAreaView>
    );
  }

  if (!caseData) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <ArrowLeft color="#F9FAFB" size={22} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Text style={{ color: '#6B7280' }}>Lead não encontrado.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Header ── */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft color="#F9FAFB" size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {caseData.title || caseData.customer_accounts?.name || 'Lead'}
        </Text>
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Trash2 size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>

      {/* ── Tabs ── */}
      <View style={styles.tabRow}>
        {(['dados', 'chat'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: neon }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && { color: neon }]}>
              {tab === 'dados' ? 'Dados' : 'Chat'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'dados' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

          {/* Title + ID */}
          <Text style={styles.caseTitle}>
            {caseData.title || caseData.customer_accounts?.name || 'Sem título'}
          </Text>
          <View style={styles.idRow}>
            <Hash size={12} color="#6B7280" />
            <Text style={styles.idText}>{caseId?.split('-')[0]}</Text>
          </View>

          {/* ── Fase ── */}
          <SectionCard title="Fase Atual">
            <TouchableOpacity style={styles.selectRow} onPress={() => setShowStateModal(true)}>
              <View style={[styles.stateDot, { backgroundColor: neon }]} />
              <Text style={styles.selectRowText}>{stateLabel || 'Selecionar fase...'}</Text>
              <ChevronDown size={16} color="#6B7280" />
            </TouchableOpacity>
          </SectionCard>

          {/* ── Responsável ── */}
          <SectionCard title="Responsável">
            <TouchableOpacity style={styles.selectRow} onPress={() => setShowOwnerModal(true)}>
              <UserIcon size={16} color="#6B7280" />
              <Text style={styles.selectRowText}>{ownerName}</Text>
              <ChevronDown size={16} color="#6B7280" />
            </TouchableOpacity>
          </SectionCard>

          {/* ── Cliente ── */}
          <SectionCard
            icon={<UserIcon size={14} color={neon} />}
            title="Dados do Cliente"
            action={
              <TouchableOpacity style={[styles.saveChip, { backgroundColor: neon }]} onPress={() => updateCustomer.mutate()}>
                {updateCustomer.isPending
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Text style={styles.saveChipText}>Salvar</Text>}
              </TouchableOpacity>
            }
          >
            <View style={styles.inputGroup}>
              <UserIcon size={15} color="#6B7280" />
              <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} placeholder="Nome" placeholderTextColor="#4B5563" />
            </View>
            <View style={styles.inputGroup}>
              <Phone size={15} color="#6B7280" />
              <TextInput style={styles.input} value={customerPhone} onChangeText={setCustomerPhone} placeholder="+55 (00) 00000-0000" placeholderTextColor="#4B5563" keyboardType="phone-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Mail size={15} color="#6B7280" />
              <TextInput style={styles.input} value={customerEmail} onChangeText={setCustomerEmail} placeholder="email@exemplo.com" placeholderTextColor="#4B5563" keyboardType="email-address" autoCapitalize="none" />
            </View>
          </SectionCard>

          {/* ── Entrega & Links ── */}
          <SectionCard
            icon={<Video size={14} color={neon} />}
            title="Entrega & Links Importantes"
          >
            {videoUrl ? (
              <View style={styles.inputGroup}>
                <Video size={15} color="#6B7280" />
                <Text style={styles.input} numberOfLines={1}>{videoUrl}</Text>
              </View>
            ) : (
              <Text style={styles.emptyText}>Nenhum vídeo entregue.</Text>
            )}

            {importantLinks.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.fieldLabel}>LINKS ADICIONAIS</Text>
                {importantLinks.map((link, idx) => (
                  <View key={idx} style={styles.listRow}>
                    <LinkIcon size={14} color="#6B7280" />
                    <Text style={styles.listRowTitle}>{link.title || 'Link'}</Text>
                    <Text style={styles.listRowSub} numberOfLines={1}>{link.url}</Text>
                  </View>
                ))}
              </View>
            )}
          </SectionCard>

          {/* ── Subtarefas M30 ── */}
          <SectionCard
            icon={<ListChecks size={14} color={neon} />}
            title="Subtarefas de Produção"
          >
            {pendingSubtasks.length === 0 ? (
              <Text style={styles.emptyText}>Nenhuma subtarefa pendente.</Text>
            ) : (
              pendingSubtasks.map((st, idx) => (
                <View key={idx} style={{ marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
                  <Text style={[styles.listRowTitle, { color: neon, fontWeight: '700' }]}>{st.title || `Subtarefa ${idx + 1}`}</Text>
                  <Text style={styles.listRowSub}>Tipo: {st.type || 'Edição'}</Text>

                  {st.script_items && st.script_items.length > 0 && (
                    <View style={{ marginTop: 12, gap: 8 }}>
                      <Text style={styles.fieldLabel}>CHECKLIST DE ROTEIRO</Text>
                      {st.script_items.map((it: any) => (
                        <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={[styles.checkbox, it.checked && { backgroundColor: neon, borderColor: neon }]}>
                            {it.checked && <Check size={12} color="#000" />}
                          </View>
                          <Text style={[styles.listRowTitle, { flex: 1 }, it.checked && styles.textDone]}>{it.text}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))
            )}
          </SectionCard>

          {/* ── Notas ── */}
          <SectionCard
            icon={<NotebookPen size={14} color={neon} />}
            title="Observações"
          >
            <TextInput
              style={styles.textArea}
              placeholder="Adicione uma observação..."
              placeholderTextColor="#4B5563"
              multiline
              numberOfLines={3}
              value={newNoteBody}
              onChangeText={setNewNoteBody}
            />
            <TouchableOpacity
              style={[styles.saveChip, { backgroundColor: neon, alignSelf: 'flex-end', marginTop: 8 }]}
              onPress={() => addNote.mutate()}
              disabled={!newNoteBody.trim()}
            >
              <Text style={styles.saveChipText}>Salvar nota</Text>
            </TouchableOpacity>

            {(notesQ ?? []).map(note => (
              <View key={note.id} style={styles.noteCard}>
                <View style={styles.noteHeader}>
                  <Text style={styles.noteAuthor}>{note.users_profile?.display_name || 'Usuário'}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Text style={styles.noteDate}>{new Date(note.created_at).toLocaleDateString('pt-BR')}</Text>
                    <TouchableOpacity onPress={() => deleteNote.mutate(note.id)}>
                      <Trash2 size={13} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.noteBody}>{note.body_text}</Text>
              </View>
            ))}
          </SectionCard>

        </ScrollView>
      ) : (
        <View style={styles.center}>
          <MessageSquare size={48} color="#2A2A2A" />
          <Text style={styles.emptyTitle}>Chat em breve</Text>
          <Text style={styles.emptyText}>Timeline do WhatsApp aparecerá aqui.</Text>
        </View>
      )}

      {/* ── State Modal ── */}
      <BottomSheet visible={showStateModal} title="Mudar Fase" onClose={() => setShowStateModal(false)}>
        {stages.map(st => (
          <TouchableOpacity
            key={st}
            style={[bs_row.row, localState === st && bs_row.rowActive]}
            onPress={() => { setLocalState(st); setShowStateModal(false); updateCase.mutate({ state: st }); }}
          >
            <Text style={[bs_row.rowText, localState === st && { color: neon, fontWeight: '700' }]}>
              {st.replace(/[_-]+/g, ' ')}
            </Text>
            {localState === st && <Check size={16} color={neon} />}
          </TouchableOpacity>
        ))}
      </BottomSheet>

      {/* ── Owner Modal ── */}
      <BottomSheet visible={showOwnerModal} title="Atribuir Responsável" onClose={() => setShowOwnerModal(false)}>
        <TouchableOpacity
          style={[bs_row.row, !localOwnerId && bs_row.rowActive]}
          onPress={() => { setLocalOwnerId(null); setShowOwnerModal(false); updateCase.mutate({ assigned_user_id: null }); }}
        >
          <Text style={[bs_row.rowText, !localOwnerId && { color: neon, fontWeight: '700' }]}>Não atribuído</Text>
          {!localOwnerId && <Check size={16} color={neon} />}
        </TouchableOpacity>
        {usersQ?.map((u: any) => (
          <TouchableOpacity
            key={u.user_id}
            style={[bs_row.row, localOwnerId === u.user_id && bs_row.rowActive]}
            onPress={() => { setLocalOwnerId(u.user_id); setShowOwnerModal(false); updateCase.mutate({ assigned_user_id: u.user_id }); }}
          >
            <Text style={[bs_row.rowText, localOwnerId === u.user_id && { color: neon, fontWeight: '700' }]}>
              {u.display_name || u.email}
            </Text>
            {localOwnerId === u.user_id && <Check size={16} color={neon} />}
          </TouchableOpacity>
        ))}
      </BottomSheet>

    </SafeAreaView>
  );
}

const bs_row = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  rowActive: { backgroundColor: '#1A2A1A' },
  rowText: { fontSize: 15, color: '#D1D5DB', textTransform: 'capitalize' },
  rowTextActive: { color: '#A3FF47', fontWeight: '700' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#141414', borderWidth: 1, borderColor: '#2A2A2A',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#F9FAFB', flex: 1, textAlign: 'center', marginHorizontal: 12 },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#1A0A0A', borderWidth: 1, borderColor: '#7F1D1D',
    alignItems: 'center', justifyContent: 'center',
  },

  // Tabs
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#A3FF47' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: '#A3FF47' },

  // Case header
  caseTitle: { fontSize: 22, fontWeight: '800', color: '#F9FAFB', marginBottom: 4, letterSpacing: -0.5 },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20 },
  idText: { fontSize: 12, color: '#6B7280', fontFamily: 'monospace' },

  // Cards
  card: { backgroundColor: '#141414', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#2A2A2A' },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8 },

  // Select row (state / owner)
  selectRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', padding: 13, gap: 10 },
  selectRowText: { flex: 1, fontSize: 15, color: '#F9FAFB', textTransform: 'capitalize' },
  stateDot: { width: 10, height: 10, borderRadius: 5 },

  // Save chip
  saveChip: { backgroundColor: '#A3FF47', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  saveChipText: { fontSize: 13, fontWeight: '700', color: '#000' },

  // Inputs
  inputGroup: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, paddingHorizontal: 14, height: 48, marginBottom: 10 },
  input: { flex: 1, fontSize: 15, color: '#F9FAFB' },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.8, marginBottom: 6 },
  modalInput: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 15, color: '#F9FAFB' },
  textArea: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, padding: 12, minHeight: 72, color: '#F9FAFB', textAlignVertical: 'top', fontSize: 14 },

  // Icon button
  iconRoundBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#1A2A1A', borderWidth: 1, borderColor: '#2A3A2A', alignItems: 'center', justifyContent: 'center' },

  // List rows
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A', gap: 10 },
  listRowTitle: { fontSize: 14, color: '#F9FAFB', fontWeight: '500' },
  listRowSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  listRowValue: { fontSize: 14, color: '#A3FF47', fontWeight: '700' },
  trashBtn: { padding: 6 },

  // Total
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#2A2A2A' },
  totalLabel: { fontSize: 14, fontWeight: '700', color: '#F9FAFB' },
  totalValue: { fontSize: 16, fontWeight: '800', color: '#A3FF47' },

  // Quick row (tasks)
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  quickInput: { flex: 1, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, paddingHorizontal: 14, height: 44, fontSize: 14, color: '#F9FAFB' },
  quickBtn: { width: 44, height: 44, backgroundColor: '#A3FF47', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  // Checkbox
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#4B5563', alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: '#A3FF47', borderColor: '#A3FF47' },
  textDone: { textDecorationLine: 'line-through', color: '#4B5563' },

  // Notes
  noteCard: { backgroundColor: '#1A1A1A', borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#2A2A2A' },
  noteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  noteAuthor: { fontSize: 12, fontWeight: '700', color: '#A3FF47' },
  noteDate: { fontSize: 11, color: '#6B7280' },
  noteBody: { fontSize: 14, color: '#D1D5DB', lineHeight: 20 },

  // Suggestions
  suggestions: { backgroundColor: '#1A1A1A', borderRadius: 10, borderWidth: 1, borderColor: '#2A2A2A', marginTop: 4, overflow: 'hidden' },
  suggestionRow: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  suggestionText: { fontSize: 14, color: '#A3FF47', fontWeight: '500' },

  // Submit chip
  submitChip: { backgroundColor: '#A3FF47', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  submitChipDisabled: { backgroundColor: '#2A3A1A' },
  submitChipText: { fontSize: 15, fontWeight: '800', color: '#000' },

  // Empty
  emptyText: { fontSize: 13, color: '#4B5563', textAlign: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
});
