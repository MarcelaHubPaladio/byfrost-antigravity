import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { toast } from "sonner";

export type CampaignTemplate = {
  id: string;
  tenant_id: string;
  name: string;
  channel_type: "whatsapp" | "email" | "both";
  subject_template: string | null;
  body_template: string;
  created_at: string;
};

export function useSmartCampaignTemplates() {
  const { activeTenantId } = useTenant();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["smart_campaign_templates", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("smart_campaign_templates")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as CampaignTemplate[];
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (payload: Omit<CampaignTemplate, "id" | "tenant_id" | "created_at">) => {
      const { data, error } = await supabase
        .from("smart_campaign_templates")
        .insert({
          ...payload,
          tenant_id: activeTenantId!,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CampaignTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart_campaign_templates", activeTenantId] });
      toast.success("Template salvo com sucesso");
    },
    onError: (err) => {
      console.error(err);
      toast.error("Erro ao salvar template");
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async (payload: Partial<CampaignTemplate> & { id: string }) => {
      const { id, ...rest } = payload;
      const { data, error } = await supabase
        .from("smart_campaign_templates")
        .update(rest)
        .eq("id", id)
        .eq("tenant_id", activeTenantId!)
        .select()
        .single();

      if (error) throw error;
      return data as CampaignTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart_campaign_templates", activeTenantId] });
      toast.success("Template atualizado com sucesso");
    },
    onError: (err) => {
      console.error(err);
      toast.error("Erro ao atualizar template");
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("smart_campaign_templates")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", activeTenantId!);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart_campaign_templates", activeTenantId] });
      toast.success("Template removido com sucesso");
    },
    onError: (err) => {
      console.error(err);
      toast.error("Erro ao remover template");
    },
  });

  return {
    templates: query.data,
    isLoading: query.isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
