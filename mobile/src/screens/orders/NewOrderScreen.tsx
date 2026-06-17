import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useSession } from '../../providers/SessionProvider';
import { useTenant } from '../../providers/TenantProvider';
import { supabase } from '../../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X,
  ShoppingBag,
  User as UserIcon,
  DollarSign,
  CreditCard,
  FileText,
  ChevronDown,
  Check,
  AlertCircle,
  Plus,
  Trash2,
} from 'lucide-react-native';

// ─── Helpers & Components ───────────────────────────────────────────────────

function BottomSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode; }) {
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

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  'PIX',
  'Boleto',
  'Cartão de Crédito',
  'Cartão de Débito',
  'À Vista (Dinheiro)',
  '30 dias',
  '60 dias',
  '30/60/90 dias',
];

// ─── Field Components ─────────────────────────────────────────────────────────

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {required && <Text style={styles.requiredMark}> *</Text>}
    </Text>
  );
}

function TextFieldInput({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  numberOfLines,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: any;
  multiline?: boolean;
  numberOfLines?: number;
}) {
  return (
    <TextInput
      style={[styles.input, multiline && styles.inputMultiline]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#4B5563"
      keyboardType={keyboardType || 'default'}
      multiline={multiline}
      numberOfLines={numberOfLines}
      textAlignVertical={multiline ? 'top' : 'center'}
    />
  );
}

// ─── Payment Picker ───────────────────────────────────────────────────────────

function PaymentPicker({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (v: string) => void;
}) {
  const { activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';
  const [open, setOpen] = useState(false);

  return (
    <View>
      <TouchableOpacity
        style={styles.pickerBtn}
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.75}
      >
        <Text style={[styles.pickerValue, !value && styles.pickerPlaceholder]}>
          {value || 'Selecionar forma de pagamento'}
        </Text>
        <ChevronDown size={16} color="#6B7280" />
      </TouchableOpacity>

      {open && (
        <View style={styles.pickerDropdown}>
          {PAYMENT_METHODS.map(pm => (
            <TouchableOpacity
              key={pm}
              style={styles.pickerOption}
              onPress={() => {
                onSelect(pm);
                setOpen(false);
              }}
            >
              <Text style={[styles.pickerOptionText, value === pm && { color: neon, fontWeight: '600' }]}>
                {pm}
              </Text>
              {value === pm && <Check size={16} color={neon} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function NewOrderScreen() {
  const navigation = useNavigation();
  const { user } = useSession();
  const { activeTenantId, activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';
  const qc = useQueryClient();

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [obs, setObs] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Product state
  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [productDesc, setProductDesc] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productQty, setProductQty] = useState('1');
  const [productEntityId, setProductEntityId] = useState<string | null>(null);

  const totalItemsValue = selectedProducts.reduce((acc, p) => acc + p.total, 0);

  const offeringsQ = useQuery({
    queryKey: ['crm_offerings_search_new_order', activeTenantId, productDesc],
    enabled: Boolean(activeTenantId && productDesc.length > 1),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('core_entities')
        .select('id, display_name, metadata')
        .eq('tenant_id', activeTenantId!)
        .in('entity_type', ['offering', 'product'])
        .is('deleted_at', null)
        .ilike('display_name', `%${productDesc}%`)
        .order('display_name', { ascending: true })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleAddProduct = () => {
    let priceStr = String(productPrice).replace(/\./g, '').replace(',', '.');
    let price = parseFloat(priceStr) || 0;
    const qty = parseInt(productQty, 10) || 1;
    
    if (!productDesc.trim()) {
      Alert.alert("Atenção", "Preencha a descrição do produto.");
      return;
    }
    
    setSelectedProducts(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        description: productDesc,
        price,
        qty,
        total: price * qty,
        offering_entity_id: productEntityId,
      }
    ]);
    
    setShowProductModal(false);
    setProductDesc(''); setProductPrice(''); setProductQty('1'); setProductEntityId(null);
  };

  // Fetch journey ID
  const journeyQ = useQuery({
    queryKey: ['journey_sales_order_mobile', activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journeys')
        .select('id, key, name')
        .eq('key', 'sales_order')
        .single();
      if (error) return null;
      return data;
    },
  });

  // ── Validation ─────────────────────────────────────────────────────────────
  const isValid = customerName.trim().length >= 2 && customerPhone.trim().length >= 8;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!isValid) {
      Alert.alert('Campos obrigatórios', 'Informe o nome e um telefone válido para o cliente.');
      return;
    }
    if (!journeyQ.data?.id) {
      Alert.alert('Erro', 'Jornada de pedidos não encontrada. Contate o suporte.');
      return;
    }
    if (!activeTenantId || !user?.id) {
      Alert.alert('Erro', 'Sessão inválida.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Criar ou aproveitar Cliente
      const { data: customer, error: custErr } = await supabase
        .from('customer_accounts')
        .upsert({
          tenant_id: activeTenantId,
          name: customerName.trim(),
          phone_e164: customerPhone.trim(),
        }, { onConflict: 'tenant_id,phone_e164' })
        .select('id')
        .single();
        
      if (custErr) throw custErr;

      // Parse value (removed since we use totalItemsValue)
      const numericValue = totalItemsValue;

      // Build title
      const title = customerName.trim();

      // 2. Insert case
      const { data: caseData, error: caseError } = await supabase
        .from('cases')
        .insert({
          tenant_id: activeTenantId,
          customer_id: customer.id,
          journey_id: journeyQ.data.id,
          title,
          status: 'open',
          state: 'new',
          assigned_user_id: user.id,
          is_chat: false,
          meta_json: {
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim(),
            total_value: totalItemsValue > 0 ? totalItemsValue : null,
            payment_method: paymentMethod || null,
            obs: obs.trim() || null,
            created_via: 'mobile',
          },
        })
        .select('id')
        .single();

      if (caseError) throw caseError;

      // Save case fields
      const caseId = caseData.id;
      const fieldInserts: any[] = [];

      if (customerPhone.trim()) {
        fieldInserts.push({
          case_id: caseId,
          key: 'whatsapp',
          value_text: customerPhone.trim(),
          confidence: 1,
          source: 'mobile',
        });
      }

      if (paymentMethod) {
        fieldInserts.push({
          case_id: caseId,
          key: 'payment_method',
          value_text: paymentMethod,
          confidence: 1,
          source: 'mobile',
        });
      }

      if (obs.trim()) {
        fieldInserts.push({
          case_id: caseId,
          key: 'obs',
          value_text: obs.trim(),
          confidence: 1,
          source: 'mobile',
        });
      }

      if (numericValue > 0) {
        fieldInserts.push({
          case_id: caseId,
          key: 'total_value_raw',
          value_text: String(numericValue),
          confidence: 1,
          source: 'mobile',
        });
      }

      if (fieldInserts.length > 0) {
        await supabase.from('case_fields').insert(fieldInserts);
      }

      // Insert case_items
      if (selectedProducts.length > 0) {
        const itemsToInsert = selectedProducts.map((p, index) => ({
          tenant_id: activeTenantId,
          case_id: caseId,
          line_no: index + 1,
          description: p.description,
          price: p.price,
          qty: p.qty,
          total: p.total,
          offering_entity_id: p.offering_entity_id,
        }));
        await supabase.from('case_items').insert(itemsToInsert);
      }

      // Generate timeline event
      await supabase.from('timeline_events').insert({
        tenant_id: activeTenantId,
        case_id: caseId,
        event_type: 'case_created',
        actor_type: 'vendor',
        actor_id: user?.id ?? null,
        message: 'Pedido criado via App.',
        occurred_at: new Date().toISOString()
      });

      // Set sale date
      await supabase.from('case_fields').insert({
        case_id: caseId,
        key: 'sale_date_text',
        value_text: new Date().toLocaleDateString('pt-BR'),
        confidence: 1,
        source: 'mobile',
      });

      // Invalidate and go back
      await qc.invalidateQueries({ queryKey: ['orders_mobile'] });
      navigation.goBack();

      Alert.alert('Pedido criado!', `Pedido de ${customerName} registrado com sucesso.`);
    } catch (err: any) {
      console.error(err);
      let msg = 'Não foi possível criar o pedido. Tente novamente ou contate o suporte.';
      const rawMsg = String(err.message || '').toLowerCase();
      
      if (rawMsg.includes('violates unique constraint')) {
        msg = 'Já existe um cliente cadastrado com esse número de WhatsApp neste sistema.';
      } else if (rawMsg.includes('violates check constraint')) {
        msg = 'Alguma informação não atende aos requisitos do sistema. Verifique os dados.';
      } else if (rawMsg.includes('network') || rawMsg.includes('fetch')) {
        msg = 'Problema de conexão. Verifique sua internet.';
      } else if (rawMsg.includes('tenant')) {
        msg = 'Você precisa estar logado e com um workspace ativo.';
      }

      Alert.alert('Ops, algo deu errado', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <ShoppingBag size={18} color={neon} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Novo Pedido</Text>
              <Text style={styles.headerSub}>Cadastro rápido</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <X size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.form}
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Cliente ── */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <UserIcon size={14} color={neon} />
              <FieldLabel label="CLIENTE" required />
            </View>
            <TextFieldInput
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Nome do cliente ou empresa"
            />
          </View>

          {/* ── Telefone ── */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <Phone size={14} color={neon} />
              <FieldLabel label="WHATSAPP / TELEFONE" required />
            </View>
            <TextFieldInput
              value={customerPhone}
              onChangeText={setCustomerPhone}
              placeholder="+55 (00) 00000-0000"
              keyboardType="phone-pad"
            />
          </View>

          {/* ── Itens do Pedido ── */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderLeft}>
                <ShoppingBag size={14} color={neon} />
                <Text style={styles.cardTitle}>Itens do Pedido</Text>
              </View>
              <TouchableOpacity style={styles.iconRoundBtn} onPress={() => setShowProductModal(true)}>
                <Plus size={16} color={neon} />
              </TouchableOpacity>
            </View>
            
            {selectedProducts.length === 0 ? (
              <Text style={styles.emptyText}>Nenhum produto adicionado.</Text>
            ) : (
              selectedProducts.map(it => (
                <View key={it.id} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listRowTitle}>{it.description}</Text>
                    <Text style={styles.listRowSub}>{it.qty}x · R$ {Number(it.price).toFixed(2)}</Text>
                  </View>
                  <Text style={[styles.listRowValue, { color: neon }]}>R$ {Number(it.total).toFixed(2)}</Text>
                  <TouchableOpacity onPress={() => setSelectedProducts(prev => prev.filter(p => p.id !== it.id))} style={styles.trashBtn}>
                    <Trash2 size={15} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))
            )}
            {totalItemsValue > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total do Pedido</Text>
                <Text style={[styles.totalValue, { color: neon }]}>R$ {totalItemsValue.toFixed(2)}</Text>
              </View>
            )}
          </View>

          {/* ── Pagamento ── */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <CreditCard size={14} color="#6B7280" />
              <FieldLabel label="FORMA DE PAGAMENTO" />
            </View>
            <PaymentPicker value={paymentMethod} onSelect={setPaymentMethod} />
          </View>

          {/* ── Observação ── */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <FileText size={14} color="#6B7280" />
              <FieldLabel label="OBSERVAÇÕES" />
            </View>
            <TextFieldInput
              value={obs}
              onChangeText={setObs}
              placeholder="Informações adicionais sobre o pedido..."
              multiline
              numberOfLines={3}
            />
          </View>

          {/* ── Validation hint ── */}
          {!isValid && customerName.length > 0 && (
            <View style={styles.validationRow}>
              <AlertCircle size={14} color="#F59E0B" />
              <Text style={styles.validationText}>Nome do cliente deve ter ao menos 2 caracteres.</Text>
            </View>
          )}
        </ScrollView>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: neon }, (!isValid || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!isValid || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Text style={styles.submitBtnText}>Criar Pedido</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Product Modal ── */}
      <BottomSheet visible={showProductModal} title="Adicionar Produto" onClose={() => setShowProductModal(false)}>
        <View style={{ padding: 8, gap: 16 }}>
          <View>
            <Text style={styles.fieldLabel}>DESCRIÇÃO</Text>
            <TextInput style={styles.modalInput} value={productDesc} onChangeText={t => { setProductDesc(t); setProductEntityId(null); }} placeholder="Ex: Semente de Milho" placeholderTextColor="#4B5563" />
            {productDesc.length > 0 && !productEntityId && (offeringsQ.data ?? []).length > 0 && (
              <View style={styles.suggestions}>
                {(offeringsQ.data ?? []).map(o => (
                  <TouchableOpacity
                    key={o.id}
                    style={styles.suggestionRow}
                    onPress={() => {
                      setProductDesc(o.display_name);
                      setProductEntityId(o.id);
                      if (o.metadata?.base_price) setProductPrice(String(o.metadata.base_price));
                    }}
                  >
                    <Text style={[styles.suggestionText, { color: neon }]}>{o.display_name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>PREÇO (R$)</Text>
              <TextInput style={styles.modalInput} value={productPrice} onChangeText={setProductPrice} placeholder="0,00" placeholderTextColor="#4B5563" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>QTDE</Text>
              <TextInput style={styles.modalInput} value={productQty} onChangeText={setProductQty} placeholder="1" placeholderTextColor="#4B5563" keyboardType="numeric" />
            </View>
          </View>
          <TouchableOpacity
            style={[styles.submitChip, { backgroundColor: neon }, (!productDesc.trim()) && styles.submitChipDisabled]}
            onPress={handleAddProduct}
            disabled={!productDesc.trim()}
          >
            <Text style={styles.submitChipText}>Adicionar Produto</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#1A2A1A',
    borderWidth: 1,
    borderColor: '#2A3A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F9FAFB',
  },
  headerSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Form
  form: {
    flex: 1,
  },
  formContent: {
    padding: 20,
    gap: 20,
    paddingBottom: 40,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
  },
  requiredMark: {
    color: '#EF4444',
  },
  input: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    color: '#F9FAFB',
  },
  inputMultiline: {
    height: 88,
    paddingTop: 12,
  },

  // Picker
  pickerBtn: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerValue: {
    fontSize: 15,
    color: '#F9FAFB',
  },
  pickerPlaceholder: {
    color: '#4B5563',
  },
  pickerDropdown: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  pickerOptionText: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  pickerOptionSelected: {
    color: '#A3FF47',
    fontWeight: '600',
  },

  // Validation
  validationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1A1A0A',
    borderWidth: 1,
    borderColor: '#3A3A1A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  validationText: {
    fontSize: 12,
    color: '#F59E0B',
    flex: 1,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
    backgroundColor: '#0A0A0A',
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cancelBtnText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: '#A3FF47',
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 14,
    minWidth: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#2A3A1A',
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
  },

  // Products Section
  card: { backgroundColor: '#141414', borderRadius: 16, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#2A2A2A' },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8 },
  iconRoundBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13, color: '#4B5563', fontStyle: 'italic', textAlign: 'center', marginVertical: 10 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  listRowTitle: { fontSize: 14, fontWeight: '600', color: '#F9FAFB' },
  listRowSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  listRowValue: { fontSize: 14, fontWeight: '700' },
  trashBtn: { padding: 6, backgroundColor: '#1A0A0A', borderRadius: 8, borderWidth: 1, borderColor: '#7F1D1D' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#2A2A2A' },
  totalLabel: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase' },
  totalValue: { fontSize: 18, fontWeight: '800' },

  // Modal Product
  modalInput: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, height: 48, paddingHorizontal: 14, fontSize: 15, color: '#F9FAFB', marginTop: 6 },
  suggestions: { backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', marginTop: 4, maxHeight: 150 },
  suggestionRow: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  suggestionText: { fontSize: 14, fontWeight: '600' },
  submitChip: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  submitChipDisabled: { backgroundColor: '#2A3A1A', opacity: 0.7 },
  submitChipText: { color: '#000', fontSize: 15, fontWeight: '800' },
});
