import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getClientOperationalContext, M30OperationalContext } from '@/lib/journeys/m30OperationalContext';

export function useClientOperationalContext(tenantId: string | undefined, commitmentId: string | undefined) {
  return useQuery<M30OperationalContext | null>({
    queryKey: ['client-operational-context', tenantId, commitmentId],
    queryFn: async () => {
      if (!tenantId || !commitmentId) return null;
      return getClientOperationalContext(supabase, tenantId, commitmentId);
    },
    enabled: !!tenantId && !!commitmentId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
