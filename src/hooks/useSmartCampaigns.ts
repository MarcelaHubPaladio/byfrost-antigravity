import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
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

function replaceVariables(template: string, vars: Record<string, string>): string {
  let message = template;
  for (const [key, val] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    message = message.replace(regex, val || '');
  }
  return message;
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

      const channels = payload.channels_json || ["whatsapp"];
      let waError: any = null;
      let waResult: any = null;

      if (channels.includes("whatsapp") && payload.test_phone_e164 && payload.test_phone_e164 !== "email_only") {
        try {
          // Fetch campaign details to resolve entity files and variables
          const { data: campaign } = await supabase
            .from("smart_campaigns")
            .select("audience_config_json")
            .eq("id", payload.campaign_id)
            .single();

          // Obter dados do Tenant para preencher {{nome_empresa}}
          const { data: tenant } = await supabase
            .from("tenants")
            .select("name")
            .eq("id", activeTenantId)
            .single();
          const nomeEmpresa = tenant?.name || "Empresa de Teste";

          // Obter o primeiro cliente se houver na configuração da campanha
          let nomeCliente = "Fulano de Tal (Teste)";
          let telefoneCliente = "(11) 99999-9999";
          let emailCliente = "teste@cliente.com";

          if (campaign?.audience_config_json?.entities && campaign.audience_config_json.entities.length > 0) {
            const firstEntity = campaign.audience_config_json.entities[0];
            if (firstEntity.name) nomeCliente = firstEntity.name;
            if (firstEntity.phone) telefoneCliente = firstEntity.phone;
            if (firstEntity.email) emailCliente = firstEntity.email;
          }

          // Variáveis padrão para o teste
          const vars: Record<string, string> = {
            nome_empresa: nomeEmpresa,
            nome_cliente: nomeCliente,
            telefone_cliente: telefoneCliente,
            email_cliente: emailCliente,
            valor_boleto: "R$ 2.600,00",
            vencimento_boleto: "25/07/2026",
            link_boleto: "https://exemplo.com/boleto-teste.pdf",
            numero_boleto: "34191.79001 01043.513184 91020.150008 7 97880000260000",
            numero_nf: "12345",
            valor_nf: "R$ 2.600,00",
            data_emissao_nf: "06/07/2026",
            link_nf: "https://exemplo.com/nota-fiscal-teste.pdf",
            nome_video: "Vídeo Institucional M30",
            link_video: "https://exemplo.com/video-teste.mp4",
            prazo_aprovacao: "48 horas",
          };

          const finalMessage = replaceVariables(payload.message, vars);

          // Envia o texto da mensagem
          const { data: zapiData, error: zapiError } = await supabase.functions.invoke("integrations-zapi-send", {
            body: {
              tenantId: activeTenantId,
              instanceId: payload.wa_instance_id,
              to: payload.test_phone_e164,
              type: "text",
              text: finalMessage,
            }
          });

          if (zapiError) throw zapiError;
          if (!zapiData?.ok) throw new Error(zapiData?.error || "Falha no envio da mensagem de texto");
          waResult = zapiData;

          const allAttachments = [...payload.attachments];

          if (campaign?.audience_config_json?.entities) {
            for (const ent of campaign.audience_config_json.entities) {
              if (ent.file_path) {
                const { data: signedData, error: signedError } = await supabase.storage
                  .from("entity-files")
                  .createSignedUrl(ent.file_path, 3600);

                if (!signedError && signedData?.signedUrl) {
                  allAttachments.push(signedData.signedUrl);
                } else {
                  console.error(`Erro ao criar URL assinada para ${ent.file_path}:`, signedError);
                }
              }
            }
          }

          // Envia anexos se houver
          if (allAttachments.length > 0) {
            for (const attUrl of allAttachments) {
              const urlLower = attUrl.toLowerCase();
              let attType = "document";
              if (/\.(png|jpg|jpeg|webp|gif)/i.test(urlLower)) {
                attType = "image";
              } else if (/\.(mp3|wav|ogg|m4a)/i.test(urlLower)) {
                attType = "audio";
              } else if (/\.(mp4|mov|avi|mpeg)/i.test(urlLower)) {
                attType = "video";
              }

              let fileName = "arquivo.pdf";
              try {
                const parsedUrl = new URL(attUrl);
                fileName = parsedUrl.pathname.split("/").pop() || "arquivo.pdf";
              } catch (e) {}

              const ext = fileName.split(".").pop() || "pdf";

              const { data: attData, error: attError } = await supabase.functions.invoke("integrations-zapi-send", {
                body: {
                  tenantId: activeTenantId,
                  instanceId: payload.wa_instance_id,
                  to: payload.test_phone_e164,
                  type: attType,
                  mediaUrl: attUrl,
                  meta: { fileName, extension: ext }
                }
              });

              if (attError) {
                console.error(`Erro ao enviar anexo ${attUrl}:`, attError);
              } else if (!attData?.ok) {
                console.error(`Erro Z-API ao enviar anexo ${attUrl}:`, attData?.error);
              }
            }
          }
        } catch (err: any) {
          waError = err.message || err;
          console.error("Erro no envio do teste de WhatsApp:", err);
        }
      }

      const testStatus = waError ? 'error' : 'sent';
      const logJson = {
        result: waError ? 'Error sending' : 'Success',
        wa_result: waResult,
        wa_error: waError ? String(waError) : null,
        email_simulated: channels.includes("email") ? "Email testing is simulated." : undefined
      };

      await supabase
        .from('smart_campaign_tests')
        .update({ status: testStatus, log_json: logJson })
        .eq('id', testRecord.id);

      if (waError) {
        throw new Error(waError);
      }

      return true;
    },
    onSuccess: () => {
      toast.success("Teste enviado com sucesso!");
    },
    onError: (error: any) => {
      console.error(error);
      toast.error(`Erro ao enviar teste: ${error.message || "Erro desconhecido"}`);
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
