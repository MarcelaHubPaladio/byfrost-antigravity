import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { toast } from "sonner";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";

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
  audience_config_json: any;
  attachments_json: string[];
  channels_json: string[];
  parent_campaign_id?: string | null;
  scheduled_at: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  wa_instance?: { name: string, phone_number: string };
}

export function useSmartCampaigns() {
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const queryClient = useQueryClient();

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['smart_campaigns', activeTenantId],
    queryFn: async () => {
      if (!activeTenantId) return [];
      const { data, error } = await supabase
        .from('smart_campaigns')
        .select(`
          *,
          wa_instance:wa_instances(name, phone_number)
        `)
        .eq('tenant_id', activeTenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as SmartCampaign[];
    },
    enabled: !!activeTenantId,
  });

  const { data: instances, isLoading: isLoadingInstances } = useQuery({
    queryKey: ['wa_instances', activeTenantId],
    queryFn: async () => {
      if (!activeTenantId) return [];
      const { data, error } = await supabase
        .from('wa_instances')
        .select('*')
        .eq('tenant_id', activeTenantId);
      if (error) throw error;
      return data;
    },
    enabled: !!activeTenantId,
  });

  const createCampaign = useMutation({
    mutationFn: async (payload: Omit<SmartCampaign, "id" | "tenant_id" | "created_at" | "updated_at" | "created_by" | "wa_instance">) => {
      const { data, error } = await supabase
        .from("smart_campaigns")
        .insert({
          ...payload,
          tenant_id: activeTenantId!,
          created_by: user?.id,
          channels_json: payload.channels_json || ["whatsapp"]
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smart_campaigns', activeTenantId] });
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
      queryClient.invalidateQueries({ queryKey: ['smart_campaigns', activeTenantId] });
      queryClient.invalidateQueries({ queryKey: ['smart_campaign', variables.id] });
      toast.success("Disparo atualizado com sucesso.");
    },
    onError: (error) => {
      console.error(error);
      toast.error("Erro ao atualizar disparo.");
    }
  });

  const sendTest = useMutation({
    mutationFn: async (payload: { 
      campaign_id: string; 
      wa_instance_id: string; 
      test_phone_e164?: string; 
      test_email?: string;
      message: string; 
      subject?: string;
      attachments: string[]; 
      channels_json?: string[];
    }) => {
      if (!activeTenantId) throw new Error("No tenant");
      
      const { data: testRecord, error: testError } = await supabase
        .from("smart_campaign_tests")
        .insert({
          tenant_id: activeTenantId,
          campaign_id: payload.campaign_id,
          wa_instance_id: payload.wa_instance_id,
          test_phone_e164: payload.test_phone_e164 || "email_only",
          payload_json: { 
            message: payload.message, 
            attachments: payload.attachments,
            subject: payload.subject,
            test_email: payload.test_email,
            channels: payload.channels_json || ["whatsapp"]
          },
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
