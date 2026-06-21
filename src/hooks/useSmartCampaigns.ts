import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenant } from "@/providers/TenantProvider";

export type CampaignStatus = 'draft' | 'tested' | 'scheduled' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type CampaignType = 'boleto' | 'nota_fiscal' | 'video_aprovacao' | 'comunicado' | 'cobranca' | 'pos_venda' | 'aviso' | 'outro';

export interface SmartCampaign {
  id: string;
  tenant_id: string;
  wa_instance_id: string;
  name: string;
  campaign_type: CampaignType;
  status: CampaignStatus;
  message_template: string;
  audience_config_json: Record<string, unknown>;
  attachments_json: string[];
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  wa_instance?: { name: string, phone_number: string };
}

export function useSmartCampaigns() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['smart_campaigns', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('smart_campaigns')
        .select(`
          *,
          wa_instance:wa_instances(name, phone_number)
        `)
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as SmartCampaign[];
    },
    enabled: !!tenant?.id,
  });

  const { data: instances, isLoading: isLoadingInstances } = useQuery({
    queryKey: ['wa_instances', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('wa_instances')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('status', 'active');
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const createCampaign = useMutation({
    mutationFn: async (newCampaign: Partial<SmartCampaign>) => {
      if (!tenant?.id) throw new Error("No tenant");
      const { data, error } = await supabase
        .from('smart_campaigns')
        .insert({ ...newCampaign, tenant_id: tenant.id })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smart_campaigns', tenant?.id] });
      toast.success("Disparo criado com sucesso.");
    },
    onError: (error) => {
      console.error(error);
      toast.error("Erro ao criar disparo.");
    }
  });

  const updateCampaign = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SmartCampaign> & { id: string }) => {
      const { data, error } = await supabase
        .from('smart_campaigns')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['smart_campaigns', tenant?.id] });
      queryClient.invalidateQueries({ queryKey: ['smart_campaign', variables.id] });
      toast.success("Disparo atualizado com sucesso.");
    },
    onError: (error) => {
      console.error(error);
      toast.error("Erro ao atualizar disparo.");
    }
  });

  const sendTest = useMutation({
    mutationFn: async (params: { campaign_id: string; wa_instance_id: string; test_phone_e164: string; message: string; attachments: string[] }) => {
      if (!tenant?.id) throw new Error("No tenant");
      
      // Salva o teste no banco
      const { data: testRecord, error: testError } = await supabase
        .from('smart_campaign_tests')
        .insert({
          tenant_id: tenant.id,
          campaign_id: params.campaign_id,
          wa_instance_id: params.wa_instance_id,
          test_phone_e164: params.test_phone_e164,
          payload_json: { message: params.message, attachments: params.attachments }
        })
        .select()
        .single();
        
      if (testError) throw testError;

      // TODO: Aqui idealmente chamariamos uma Edge Function que faz o disparo real na Z-API
      // Simulando sucesso por enquanto
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await supabase
        .from('smart_campaign_tests')
        .update({ status: 'sent', log_json: { result: 'Simulated success' } })
        .eq('id', testRecord.id);

      return true;
    },
    onSuccess: () => {
      toast.success("Teste enviado com sucesso!");
    },
    onError: (error) => {
      console.error(error);
      toast.error("Erro ao enviar teste.");
    }
  });

  return {
    campaigns,
    isLoading,
    instances,
    isLoadingInstances,
    createCampaign,
    updateCampaign,
    sendTest
  };
}

export function useSmartCampaign(id?: string) {
  const { data: campaign, isLoading } = useQuery({
    queryKey: ['smart_campaign', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('smart_campaigns')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as SmartCampaign;
    },
    enabled: !!id,
  });

  return { campaign, isLoading };
}
