import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
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
} from 'lucide-react-native';

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
  const isValid = customerName.trim().length >= 2;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!isValid) {
      Alert.alert('Campo obrigatório', 'Informe o nome do cliente para continuar.');
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
      // Parse value
      const rawValue = totalValue
        .replace(/[R$\s]/g, '')
        .replace(',', '.')
        .trim();
      const numericValue = parseFloat(rawValue) || 0;

      // Build title
      const title = customerName.trim();

      // Insert case
      const { data: caseData, error: caseError } = await supabase
        .from('cases')
        .insert({
          tenant_id: activeTenantId,
          journey_id: journeyQ.data.id,
          title,
          status: 'open',
          state: 'new',
          assigned_user_id: user.id,
          is_chat: false,
          meta_json: {
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim(),
            total_value: numericValue > 0 ? numericValue : null,
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
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível criar o pedido.');
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
              <FileText size={14} color="#6B7280" />
              <FieldLabel label="WHATSAPP / TELEFONE" />
            </View>
            <TextFieldInput
              value={customerPhone}
              onChangeText={setCustomerPhone}
              placeholder="+55 (00) 00000-0000"
              keyboardType="phone-pad"
            />
          </View>

          {/* ── Valor ── */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <DollarSign size={14} color="#6B7280" />
              <FieldLabel label="VALOR TOTAL" />
            </View>
            <TextFieldInput
              value={totalValue}
              onChangeText={setTotalValue}
              placeholder="0,00"
              keyboardType="numeric"
            />
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
});
