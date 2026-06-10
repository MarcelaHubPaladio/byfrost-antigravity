import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Modal,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { useSession } from '../providers/SessionProvider';
import { useTenant } from '../providers/TenantProvider';
import { supabase } from '../lib/supabase';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  CheckCircle2,
  Circle,
  Clock,
  ChevronDown,
  ChevronRight,
  Plus,
  User as UserIcon,
  BarChart3,
  ListChecks,
  Zap,
  Check,
  AlertCircle,
  Building2,
  X,
  SlidersHorizontal,
  Calendar,
} from 'lucide-react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

type SuperTask = {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  order_index: number;
  created_at: string;
  created_by: string | null;
  assigned_to: string | null;
  users_profile?: { display_name: string | null; email: string | null } | null;
  subtasks?: SuperTask[];
};

type OrgNode = { user_id: string; parent_user_id: string | null };
type FilterType = 'all' | 'pending' | 'done';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getVisibleUserIds(currentUserId: string, nodes: OrgNode[]): Set<string> {
  const childrenMap = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parent_user_id) {
      const cur = childrenMap.get(n.parent_user_id) ?? [];
      cur.push(n.user_id);
      childrenMap.set(n.parent_user_id, cur);
    }
  }
  const visible = new Set<string>([currentUserId]);
  const stack = [currentUserId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of childrenMap.get(cur) ?? []) {
      if (!visible.has(child)) { visible.add(child); stack.push(child); }
    }
  }
  return visible;
}

function formatDueDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)}d atraso`;
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task, onToggle }: { task: SuperTask; onToggle: (id: string, completed: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasSubtasks = (task.subtasks?.length ?? 0) > 0;
  const completedSubs = task.subtasks?.filter(s => s.is_completed).length ?? 0;
  const totalSubs = task.subtasks?.length ?? 0;
  const progress = totalSubs > 0 ? completedSubs / totalSubs : 0;
  const overdue = isOverdue(task.due_date) && !task.is_completed;

  return (
    <View style={[styles.card, task.is_completed && styles.cardCompleted]}>
      <View style={styles.cardMain}>
        <TouchableOpacity style={styles.checkBtn} onPress={() => onToggle(task.id, !task.is_completed)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {task.is_completed ? <CheckCircle2 size={22} color="#A3FF47" /> : <Circle size={22} color="#3A3A3A" />}
        </TouchableOpacity>

        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, task.is_completed && styles.cardTitleDone]} numberOfLines={2}>
            {task.title}
          </Text>
          {task.description ? <Text style={styles.cardDesc} numberOfLines={1}>{task.description}</Text> : null}

          <View style={styles.cardMeta}>
            {task.users_profile?.display_name ? (
              <View style={styles.metaChip}>
                <UserIcon size={11} color="#6B7280" />
                <Text style={styles.metaText}>{task.users_profile.display_name.split(' ')[0]}</Text>
              </View>
            ) : null}
            {task.due_date ? (
              <View style={[styles.metaChip, overdue && styles.metaChipOverdue]}>
                <Clock size={11} color={overdue ? '#EF4444' : '#6B7280'} />
                <Text style={[styles.metaText, overdue && styles.metaTextOverdue]}>{formatDueDate(task.due_date)}</Text>
              </View>
            ) : null}
          </View>

          {hasSubtasks && (
            <View style={styles.progressRow}>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
              </View>
              <Text style={styles.progressText}>{completedSubs}/{totalSubs}</Text>
            </View>
          )}
        </View>

        {hasSubtasks && (
          <TouchableOpacity style={styles.expandBtn} onPress={() => setExpanded(e => !e)}>
            {expanded ? <ChevronDown size={16} color="#6B7280" /> : <ChevronRight size={16} color="#6B7280" />}
          </TouchableOpacity>
        )}
      </View>

      {hasSubtasks && expanded && (
        <View style={styles.subtasksContainer}>
          {task.subtasks!.map(sub => (
            <TouchableOpacity key={sub.id} style={styles.subtaskRow} onPress={() => onToggle(sub.id, !sub.is_completed)}>
              {sub.is_completed ? <Check size={14} color="#A3FF47" /> : <View style={styles.subtaskCircle} />}
              <Text style={[styles.subtaskText, sub.is_completed && styles.subtaskTextDone]}>{sub.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── New Task Modal ───────────────────────────────────────────────────────────

function NewTaskModal({
  visible,
  onClose,
  activeTenantId,
  userId,
  usersData,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  activeTenantId: string | null;
  userId: string | undefined;
  usersData: any[];
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const assignedUser = usersData.find(u => u.user_id === assignedTo);

  const reset = () => {
    setTitle('');
    setDescription('');
    setAssignedTo(null);
    setShowUserPicker(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Campo obrigatório', 'Informe o título da tarefa.');
      return;
    }
    if (!activeTenantId || !userId) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('super_tasks').insert({
        tenant_id: activeTenantId,
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignedTo || userId,
        created_by: userId,
        is_completed: false,
        order_index: Date.now(),
      });
      if (error) throw error;
      onSuccess();
      handleClose();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível criar a tarefa.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={ntStyles.overlay} onPress={handleClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <Pressable style={ntStyles.sheet}>
            <View style={ntStyles.handle} />
            <View style={ntStyles.header}>
              <Text style={ntStyles.headerTitle}>Nova Tarefa</Text>
              <TouchableOpacity style={ntStyles.closeBtn} onPress={handleClose}>
                <X size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={ntStyles.form} contentContainerStyle={{ gap: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
              {/* Title */}
              <View style={ntStyles.fieldGroup}>
                <Text style={ntStyles.label}>TÍTULO <Text style={{ color: '#EF4444' }}>*</Text></Text>
                <TextInput
                  style={ntStyles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Ex: Ligar para o cliente"
                  placeholderTextColor="#4B5563"
                  autoFocus
                />
              </View>

              {/* Description */}
              <View style={ntStyles.fieldGroup}>
                <Text style={ntStyles.label}>DESCRIÇÃO</Text>
                <TextInput
                  style={[ntStyles.input, { height: 72, paddingTop: 10, textAlignVertical: 'top' }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Detalhes da tarefa..."
                  placeholderTextColor="#4B5563"
                  multiline
                />
              </View>

              {/* Assign */}
              <View style={ntStyles.fieldGroup}>
                <Text style={ntStyles.label}>ATRIBUIR A</Text>
                <TouchableOpacity style={ntStyles.pickerBtn} onPress={() => setShowUserPicker(v => !v)}>
                  <UserIcon size={15} color="#6B7280" />
                  <Text style={[ntStyles.pickerValue, !assignedTo && ntStyles.pickerPlaceholder]}>
                    {assignedUser?.display_name || assignedUser?.email || 'Eu mesmo'}
                  </Text>
                  <ChevronDown size={15} color="#6B7280" />
                </TouchableOpacity>
                {showUserPicker && (
                  <View style={ntStyles.dropdown}>
                    <TouchableOpacity style={ntStyles.dropdownRow} onPress={() => { setAssignedTo(null); setShowUserPicker(false); }}>
                      <Text style={[ntStyles.dropdownText, !assignedTo && ntStyles.dropdownSelected]}>Eu mesmo</Text>
                      {!assignedTo && <Check size={15} color="#A3FF47" />}
                    </TouchableOpacity>
                    {usersData.map(u => (
                      <TouchableOpacity key={u.user_id} style={ntStyles.dropdownRow} onPress={() => { setAssignedTo(u.user_id); setShowUserPicker(false); }}>
                        <Text style={[ntStyles.dropdownText, assignedTo === u.user_id && ntStyles.dropdownSelected]}>
                          {u.display_name || u.email}
                        </Text>
                        {assignedTo === u.user_id && <Check size={15} color="#A3FF47" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={ntStyles.footer}>
              <TouchableOpacity style={ntStyles.cancelBtn} onPress={handleClose}>
                <Text style={ntStyles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ntStyles.submitBtn, (!title.trim() || submitting) && ntStyles.submitDisabled]}
                onPress={handleSubmit}
                disabled={!title.trim() || submitting}
              >
                {submitting ? <ActivityIndicator size="small" color="#000" /> : <Text style={ntStyles.submitText}>Criar Tarefa</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ─── Person Filter Modal ──────────────────────────────────────────────────────

function PersonFilterModal({
  visible,
  onClose,
  usersData,
  selectedId,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  usersData: any[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={pfStyles.overlay} onPress={onClose}>
        <Pressable style={pfStyles.sheet}>
          <View style={pfStyles.handle} />
          <View style={pfStyles.header}>
            <Text style={pfStyles.title}>Filtrar por Pessoa</Text>
            <TouchableOpacity style={pfStyles.closeBtn} onPress={onClose}>
              <X size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 400 }}>
            <TouchableOpacity style={pfStyles.row} onPress={() => { onSelect(null); onClose(); }}>
              <View style={pfStyles.rowLeft}>
                <View style={pfStyles.avatarSmall}>
                  <Text style={pfStyles.avatarText}>T</Text>
                </View>
                <Text style={[pfStyles.rowText, !selectedId && pfStyles.rowSelected]}>Todos</Text>
              </View>
              {!selectedId && <Check size={16} color="#A3FF47" />}
            </TouchableOpacity>
            {usersData.map(u => {
              const name = u.display_name || u.email || 'Usuário';
              const initial = name[0]?.toUpperCase() ?? '?';
              const isSelected = selectedId === u.user_id;
              return (
                <TouchableOpacity key={u.user_id} style={pfStyles.row} onPress={() => { onSelect(u.user_id); onClose(); }}>
                  <View style={pfStyles.rowLeft}>
                    <View style={pfStyles.avatarSmall}>
                      <Text style={pfStyles.avatarText}>{initial}</Text>
                    </View>
                    <Text style={[pfStyles.rowText, isSelected && pfStyles.rowSelected]} numberOfLines={1}>{name}</Text>
                  </View>
                  {isSelected && <Check size={16} color="#A3FF47" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function HomeScreen({ navigation }: any) {
  const { user } = useSession();
  const { activeTenant, activeTenantId, isSuperAdmin, tenants, clearActiveTenant } = useTenant();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<FilterType>('pending');
  const [personFilterId, setPersonFilterId] = useState<string | null>(user?.id || null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showPersonFilter, setShowPersonFilter] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin =
    isSuperAdmin ||
    activeTenant?.role === 'admin' ||
    activeTenant?.role === 'manager' ||
    activeTenant?.role === 'owner';

  const canSwitchTenant = isSuperAdmin || tenants.length > 1;

  // ── Org nodes ──────────────────────────────────────────────────────────────
  const orgNodesQ = useQuery({
    queryKey: ['org_nodes_mobile', activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('org_nodes').select('user_id, parent_user_id').eq('tenant_id', activeTenantId!);
      if (error) throw error;
      return (data ?? []) as OrgNode[];
    },
  });

  const visibleUserIds = useMemo(() => {
    if (isAdmin) return null;
    if (!user?.id || !orgNodesQ.data) return new Set<string>([user?.id ?? '']);
    return getVisibleUserIds(user.id, orgNodesQ.data);
  }, [isAdmin, user?.id, orgNodesQ.data]);

  // ── Users (for filter and new task) ──────────────────────────────────────────
  const usersQ = useQuery({
    queryKey: ['tenant_users_for_tasks', activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from('users_profile').select('user_id, display_name, email').eq('tenant_id', activeTenantId!).is('deleted_at', null);
      if (error) throw error;
      const allUsers = data ?? [];
      if (visibleUserIds === null) return allUsers;
      return allUsers.filter(u => visibleUserIds.has(u.user_id));
    },
  });

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const tasksQ = useQuery({
    queryKey: ['super_tasks_mobile', activeTenantId, isAdmin ? 'admin' : user?.id],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('super_tasks')
        .select('*, users_profile!fk_super_tasks_assigned_user(display_name, email)')
        .eq('tenant_id', activeTenantId!)
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      const all = (data as SuperTask[]) ?? [];
      const parents = all.filter(t => !t.parent_id);
      const children = all.filter(t => t.parent_id);
      return parents.map(p => ({
        ...p,
        subtasks: children.filter(s => s.parent_id === p.id).sort((a, b) => a.order_index - b.order_index),
      }));
    },
  });

  const allTasks = tasksQ.data ?? [];

  // Filter by hierarchy
  const hierarchyFilteredTasks = useMemo(() => {
    if (visibleUserIds === null) return allTasks;
    return allTasks.filter(t => !t.assigned_to || visibleUserIds.has(t.assigned_to));
  }, [allTasks, visibleUserIds]);

  // Filter by person
  const personFilteredTasks = useMemo(() => {
    if (!personFilterId) return hierarchyFilteredTasks;
    return hierarchyFilteredTasks.filter(t => t.assigned_to === personFilterId);
  }, [hierarchyFilteredTasks, personFilterId]);

  // Filter by status
  const filteredTasks = useMemo(() => {
    if (statusFilter === 'pending') return personFilteredTasks.filter(t => !t.is_completed);
    if (statusFilter === 'done') return personFilteredTasks.filter(t => t.is_completed);
    return personFilteredTasks;
  }, [personFilteredTasks, statusFilter]);

  // Stats (based on hierarchy + person filter, but not status filter)
  const totalCount = personFilteredTasks.length;
  const pendingCount = personFilteredTasks.filter(t => !t.is_completed).length;
  const doneCount = personFilteredTasks.filter(t => t.is_completed).length;
  const overdueCount = personFilteredTasks.filter(t => isOverdue(t.due_date) && !t.is_completed).length;

  const selectedPersonName = usersQ.data?.find(u => u.user_id === personFilterId)?.display_name;

  // ── Toggle ─────────────────────────────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { error } = await supabase.from('super_tasks').update({
        is_completed,
        completed_at: is_completed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['super_tasks_mobile'] }),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ['super_tasks_mobile'] });
    setRefreshing(false);
  };

  // Header
  const initials = (user?.email ?? '').slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Top Bar ── */}
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View>
            <Text style={styles.tenantName} numberOfLines={1}>{activeTenant?.name || 'Workspace'}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>{user?.email}</Text>
          </View>
        </View>
        <View style={styles.topRight}>
          {canSwitchTenant && (
            <TouchableOpacity style={styles.iconBtn} onPress={clearActiveTenant}>
              <Building2 size={18} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Page Title ── */}
      <View style={styles.pageTitleRow}>
        <ListChecks size={20} color="#A3FF47" />
        <Text style={styles.pageTitle}>Tarefas</Text>
      </View>

      {/* ── Stats ── */}
      <View style={styles.statsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsScroll}>
          <StatCard label="Total" value={totalCount} accent="#A3FF47" />
          <StatCard label="Pendentes" value={pendingCount} accent="#00E5FF" />
          <StatCard label="Concluídas" value={doneCount} accent="#10B981" />
          {overdueCount > 0 && <StatCard label="Atrasadas" value={overdueCount} accent="#EF4444" />}
        </ScrollView>
      </View>

      {/* ── Filters Row ── */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRowScroll}>
          {/* Status chips */}
        {(['all', 'pending', 'done'] as FilterType[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, statusFilter === f && styles.filterChipActive]}
            onPress={() => setStatusFilter(f)}
          >
            <Text style={[styles.filterChipText, statusFilter === f && styles.filterChipTextActive]}>
              {f === 'all' ? 'Todas' : f === 'pending' ? 'Pendentes' : 'Concluídas'}
            </Text>
            {statusFilter === f && <Check size={11} color="#000" />}
          </TouchableOpacity>
        ))}

        {/* Person filter - always visible if there are users */}
        {(usersQ.data?.length ?? 0) > 0 && (
          <TouchableOpacity
            style={[styles.filterChipPerson, personFilterId && styles.filterChipPersonActive]}
            onPress={() => setShowPersonFilter(true)}
          >
            <UserIcon size={13} color={personFilterId ? '#000' : '#9CA3AF'} />
            <Text style={[styles.filterChipText, personFilterId && styles.filterChipTextActive]} numberOfLines={1}>
              {selectedPersonName ? selectedPersonName.split(' ')[0] : 'Pessoa'}
            </Text>
            {personFilterId && (
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); setPersonFilterId(null); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <X size={11} color="#000" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
        </ScrollView>
      </View>

      {/* ── Task List ── */}
      {tasksQ.isLoading ? (
        <ActivityIndicator size="large" color="#A3FF47" style={{ marginTop: 60 }} />
      ) : filteredTasks.length === 0 ? (
        <View style={styles.emptyState}>
          <Zap size={40} color="#2A2A2A" />
          <Text style={styles.emptyTitle}>Nenhuma tarefa</Text>
          <Text style={styles.emptySubtitle}>
            {statusFilter === 'done' ? 'Sem tarefas concluídas ainda.' : 'Tudo em dia!'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredTasks}
          keyExtractor={t => t.id}
          renderItem={({ item }) => (
            <TaskCard task={item} onToggle={(id, c) => toggleMutation.mutate({ id, is_completed: c })} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A3FF47" />}
        />
      )}

      {/* ── FAB ── */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowNewTask(true)}>
        <Plus size={24} color="#000000" />
      </TouchableOpacity>

      {/* ── New Task Modal ── */}
      <NewTaskModal
        visible={showNewTask}
        onClose={() => setShowNewTask(false)}
        activeTenantId={activeTenantId}
        userId={user?.id}
        usersData={usersQ.data ?? []}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['super_tasks_mobile'] })}
      />

      {/* ── Person Filter Modal ── */}
      <PersonFilterModal
        visible={showPersonFilter}
        onClose={() => setShowPersonFilter(false)}
        usersData={usersQ.data ?? []}
        selectedId={personFilterId}
        onSelect={setPersonFilterId}
      />
    </SafeAreaView>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <View style={[styles.statCard, { borderTopColor: accent }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles (Main) ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0A' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E1E1E', borderWidth: 2, borderColor: '#A3FF47', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: '#A3FF47' },
  tenantName: { fontSize: 14, fontWeight: '700', color: '#F9FAFB', maxWidth: 180 },
  userEmail: { fontSize: 11, color: '#6B7280', maxWidth: 180 },
  iconBtn: { padding: 8, backgroundColor: '#141414', borderRadius: 10, borderWidth: 1, borderColor: '#2A2A2A' },
  pageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#F9FAFB', letterSpacing: -0.5 },

  statsContainer: {
    height: 100,
    marginBottom: 4,
  },
  statsScroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, gap: 10, flexDirection: 'row', alignItems: 'center' },
  statCard: { backgroundColor: '#141414', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, minWidth: 86, alignItems: 'center', gap: 4, borderTopWidth: 3, borderWidth: 1, borderColor: '#2A2A2A' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#F9FAFB' },
  statLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },

  filtersRowScroll: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 8, alignItems: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#141414', borderWidth: 1, borderColor: '#2A2A2A' },
  filterChipActive: { backgroundColor: '#A3FF47', borderColor: '#A3FF47' },
  filterChipPerson: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#141414', borderWidth: 1, borderColor: '#2A2A2A' },
  filterChipPersonActive: { backgroundColor: '#A3FF47', borderColor: '#A3FF47' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  filterChipTextActive: { color: '#000000', fontWeight: '700' },

  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 110, gap: 10 },

  card: { backgroundColor: '#141414', borderRadius: 16, borderWidth: 1, borderColor: '#2A2A2A', overflow: 'hidden' },
  cardCompleted: { opacity: 0.55 },
  cardMain: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 12 },
  checkBtn: { marginTop: 2 },
  cardContent: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#F9FAFB', lineHeight: 20 },
  cardTitleDone: { textDecorationLine: 'line-through', color: '#4B5563' },
  cardDesc: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1F1F1F', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  metaChipOverdue: { backgroundColor: '#1F0A0A', borderWidth: 1, borderColor: '#7F1D1D' },
  metaText: { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  metaTextOverdue: { color: '#EF4444' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  progressBg: { flex: 1, height: 3, backgroundColor: '#2A2A2A', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: '#A3FF47', borderRadius: 2 },
  progressText: { fontSize: 11, color: '#6B7280', fontWeight: '600', minWidth: 28, textAlign: 'right' },
  expandBtn: { padding: 4, marginTop: 2 },

  subtasksContainer: { borderTopWidth: 1, borderTopColor: '#1F1F1F', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12, gap: 8 },
  subtaskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  subtaskCircle: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: '#4B5563' },
  subtaskText: { fontSize: 13, color: '#9CA3AF', flex: 1 },
  subtaskTextDone: { textDecorationLine: 'line-through', color: '#4B5563' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptySubtitle: { fontSize: 14, color: '#4B5563', textAlign: 'center' },

  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#A3FF47', alignItems: 'center', justifyContent: 'center', shadowColor: '#A3FF47', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 10 },
});

// ─── New Task Modal Styles ────────────────────────────────────────────────────

const ntStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#141414', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: '#2A2A2A', paddingBottom: 8 },
  handle: { width: 36, height: 4, backgroundColor: '#2A2A2A', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#F9FAFB' },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
  form: { paddingHorizontal: 20, paddingTop: 16 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.8 },
  input: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 15, color: '#F9FAFB' },
  pickerBtn: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, paddingHorizontal: 14, height: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pickerValue: { flex: 1, fontSize: 15, color: '#F9FAFB' },
  pickerPlaceholder: { color: '#4B5563' },
  dropdown: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, marginTop: 4, overflow: 'hidden' },
  dropdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  dropdownText: { fontSize: 14, color: '#9CA3AF', flex: 1 },
  dropdownSelected: { color: '#A3FF47', fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#2A2A2A', marginTop: 8 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 16 },
  cancelText: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  submitBtn: { backgroundColor: '#A3FF47', paddingVertical: 13, paddingHorizontal: 28, borderRadius: 14, minWidth: 130, alignItems: 'center' },
  submitDisabled: { backgroundColor: '#2A3A1A' },
  submitText: { fontSize: 14, fontWeight: '800', color: '#000000' },
});

// ─── Person Filter Modal Styles ───────────────────────────────────────────────

const pfStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#141414', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: '#2A2A2A', paddingBottom: 24 },
  handle: { width: 36, height: 4, backgroundColor: '#2A2A2A', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  title: { fontSize: 16, fontWeight: '700', color: '#F9FAFB' },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatarSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
  rowText: { fontSize: 15, color: '#D1D5DB', flex: 1 },
  rowSelected: { color: '#A3FF47', fontWeight: '700' },
});
