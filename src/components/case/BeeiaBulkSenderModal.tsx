import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUpload } from "@/components/portal/ImageUpload";
import { Loader2, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { showSuccess, showError } from "@/utils/toast";

interface BeeiaBulkSenderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCaseIds: string[];
  instances: any[];
  onSuccess?: () => void;
}

export function BeeiaBulkSenderModal({
  open,
  onOpenChange,
  selectedCaseIds,
  instances,
  onSuccess
}: BeeiaBulkSenderModalProps) {
  const { activeTenantId } = useTenant();
  const [loading, setLoading] = useState(false);
  const [instanceId, setInstanceId] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("Olá {{nome}}, tudo bem?");
  const [imageUrl, setImageUrl] = useState("");
  
  // Rate limit
  const [rateLimitQty, setRateLimitQty] = useState("5");
  const [rateLimitMins, setRateLimitMins] = useState("10");

  const handleSubmit = async () => {
    if (!instanceId) return showError("Selecione um número remetente.");
    if (!messageTemplate.trim()) return showError("A mensagem não pode ser vazia.");
    if (!rateLimitQty || Number(rateLimitQty) <= 0) return showError("Quantidade inválida.");
    if (!rateLimitMins || Number(rateLimitMins) <= 0) return showError("Intervalo inválido.");
    if (selectedCaseIds.length === 0) return showError("Nenhum contato selecionado.");

    setLoading(true);
    try {
      // 1. Fetch cases to get customer data
      const { data: cases, error: casesError } = await supabase
        .from("cases")
        .select("id, customer_id, customer_accounts(name, phone_e164)")
        .in("id", selectedCaseIds);
        
      if (casesError) throw casesError;
      
      const validCases = cases?.filter(c => c.customer_accounts?.phone_e164) || [];
      if (validCases.length === 0) {
        throw new Error("Nenhum dos casos selecionados possui número de telefone válido.");
      }

      // 2. Create smart_campaign
      const audienceConfig = {
        rate_limit: {
          qty: Number(rateLimitQty),
          interval_mins: Number(rateLimitMins)
        }
      };

      const attachments = imageUrl ? [{ type: 'image', url: imageUrl }] : [];

      const { data: campaign, error: campError } = await supabase
        .from("smart_campaigns")
        .insert({
          tenant_id: activeTenantId!,
          wa_instance_id: instanceId,
          name: `Disparo em Massa BeeIA - ${new Date().toLocaleDateString()}`,
          campaign_type: "comunicado",
          status: "processing", // Ready to be picked up by processor
          message_template: messageTemplate,
          audience_config_json: audienceConfig,
          attachments_json: attachments
        })
        .select("id")
        .single();

      if (campError) throw campError;

      // 3. Create recipients
      const recipients = validCases.map(c => ({
        tenant_id: activeTenantId!,
        campaign_id: campaign.id,
        customer_id: c.customer_id,
        phone_e164: c.customer_accounts!.phone_e164,
        status: "pending",
        variables_json: { nome: c.customer_accounts!.name?.split(" ")[0] || "Cliente" }
      }));

      const { error: recError } = await supabase
        .from("smart_campaign_recipients")
        .insert(recipients);

      if (recError) throw recError;

      showSuccess(`Disparo programado para ${validCases.length} contatos!`);
      onOpenChange(false);
      if (onSuccess) onSuccess();
      
    } catch (e: any) {
      showError("Erro ao agendar disparo: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Disparo em Massa</DialogTitle>
          <DialogDescription>
            Configure uma rotina de disparos controlada para os contatos selecionados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Info */}
          <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm flex gap-2 items-center">
            <span className="font-semibold text-base">{selectedCaseIds.length}</span>
            <span>conversas selecionadas para envio.</span>
          </div>

          <div className="grid gap-2">
            <Label>Número Remetente (WhatsApp)</Label>
            <Select value={instanceId} onValueChange={setInstanceId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {instances.map(inst => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name} {inst.phone_number ? `(${inst.phone_number})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Mensagem</Label>
            <div className="text-[11px] text-slate-500 mb-1">
              Dica: Use <code className="bg-slate-100 px-1 rounded">{"{{nome}}"}</code> para inserir o primeiro nome do contato.
            </div>
            <Textarea 
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              placeholder="Olá {{nome}}, tudo bem?"
              rows={4}
            />
          </div>

          <div className="grid gap-2">
            <Label>Imagem (Opcional)</Label>
            <ImageUpload 
              value={imageUrl} 
              onChange={setImageUrl} 
            />
          </div>

          <div className="bg-slate-50 border rounded-lg p-4 space-y-3">
            <Label className="text-slate-700">Controle de Fluxo (Rate Limit)</Label>
            <div className="flex items-center gap-3">
              <span>Enviar</span>
              <Input 
                type="number" 
                className="w-20 text-center" 
                value={rateLimitQty}
                onChange={e => setRateLimitQty(e.target.value)}
                min="1"
              />
              <span>mensagens a cada</span>
              <Input 
                type="number" 
                className="w-20 text-center" 
                value={rateLimitMins}
                onChange={e => setRateLimitMins(e.target.value)}
                min="1"
              />
              <span>minutos.</span>
            </div>
            <p className="text-xs text-slate-500">
              Isso evita banimentos no WhatsApp e permite que a equipe atenda as respostas gradualmente.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !instanceId}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Iniciar Disparo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
