import React from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../providers/TenantProvider';
import { FileText, ChevronRight } from 'lucide-react-native';
import { useSession } from '../../providers/SessionProvider';

export function M30ClientHomeScreen() {
  const { activeTenantId } = useTenant();
  const { user } = useSession();

  const m30DeliverablesQ = useQuery({
    queryKey: ['m30_client_deliverables', activeTenantId, user?.id],
    enabled: Boolean(activeTenantId && user?.id),
    queryFn: async () => {
      // 1. Acha os contratos do usuário
      const { data: contracts, error: errC } = await supabase
        .from('m30_client_users')
        .select('commitment_id')
        .eq('tenant_id', activeTenantId!)
        .eq('user_id', user!.id);
      
      if (errC) throw errC;
      if (!contracts || contracts.length === 0) return [];

      const commitmentIds = contracts.map(c => c.commitment_id);

      // 2. Acha os cases (entregáveis) da jornada operacao_m30 ligados a esses contratos
      // Vamos buscar a jornada M30 primeiro
      const { data: journey, error: errJ } = await supabase
        .from('journeys')
        .select('id')
        .eq('key', 'operacao_m30')
        .eq('tenant_id', activeTenantId!)
        .maybeSingle();

      if (errJ || !journey) throw errJ || new Error('Jornada M30 não encontrada');

      // Buscar os cases
      const { data: cases, error: errCases } = await supabase
        .from('cases')
        .select(`
          id, title, state, created_at, updated_at, meta_json,
          customer:core_entities!cases_customer_id_fkey(display_name)
        `)
        .eq('tenant_id', activeTenantId!)
        .eq('journey_id', journey.id)
        .in('meta_json->>commitment_id', commitmentIds)
        .order('updated_at', { ascending: false });

      if (errCases) throw errCases;
      return cases || [];
    }
  });

  const getStatusColor = (state: string) => {
    const s = state?.toLowerCase() || '';
    if (s.includes('conclui') || s.includes('finaliz')) return 'bg-emerald-500';
    if (s.includes('aprov')) return 'bg-blue-500';
    if (s.includes('grav')) return 'bg-purple-500';
    if (s.includes('edi')) return 'bg-orange-500';
    if (s.includes('cancel')) return 'bg-red-500';
    return 'bg-slate-400';
  };

  if (m30DeliverablesQ.isLoading && !m30DeliverablesQ.data) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-slate-500 mt-4 font-medium">Carregando entregáveis...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <View className="bg-slate-900 px-6 pt-12 pb-6 rounded-b-3xl shadow-sm">
        <Text className="text-white text-xl font-bold">Olá!</Text>
        <Text className="text-slate-400 text-sm mt-1">Acompanhe o andamento dos seus entregáveis.</Text>
      </View>

      <FlatList
        className="flex-1 px-4 mt-2"
        data={m30DeliverablesQ.data}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={m30DeliverablesQ.isFetching} onRefresh={() => m30DeliverablesQ.refetch()} />}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-16 px-6">
            <FileText size={64} color="#cbd5e1" />
            <Text className="text-slate-500 text-center font-medium mt-4">
              Nenhum entregável encontrado para os seus contratos.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity 
            className="bg-white rounded-2xl p-4 mb-3 shadow-sm border border-slate-100 flex-row items-center"
            activeOpacity={0.7}
          >
            <View className={`w-3 h-full absolute left-0 rounded-l-2xl ${getStatusColor(item.state)}`} />
            
            <View className="flex-1 pl-4">
              <Text className="text-slate-900 font-bold text-base" numberOfLines={2}>
                {item.title || 'Entregável sem título'}
              </Text>
              
              <View className="flex-row items-center mt-2">
                <View className="bg-slate-100 rounded-lg px-2 py-1 mr-2">
                  <Text className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{item.state || 'Pendente'}</Text>
                </View>
                <Text className="text-xs text-slate-400 font-medium">
                  {new Date(item.updated_at).toLocaleDateString()}
                </Text>
              </View>
            </View>
            
            <ChevronRight size={20} color="#94a3b8" />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
