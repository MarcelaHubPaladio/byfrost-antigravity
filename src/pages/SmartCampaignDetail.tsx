import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Send, Clock, Play, Phone, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSmartCampaigns, useSmartCampaign, CampaignType } from "@/hooks/useSmartCampaigns";
import { toast } from "sonner";

export default function SmartCampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const { instances, createCampaign, updateCampaign, sendTest } = useSmartCampaigns();
  const { campaign, isLoading: isLoadingCampaign } = useSmartCampaign(isNew ? undefined : id);

  const [name, setName] = useState("");
  const [type, setType] = useState<CampaignType>("comunicado");
  const [instanceId, setInstanceId] = useState("");
  const [message, setMessage] = useState("");
  const [audienceType, setAudienceType] = useState("all_active");
  const [testPhone, setTestPhone] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [newAttachment, setNewAttachment] = useState("");

  useEffect(() => {
    if (campaign && !isNew) {
      setName(campaign.name);
      setType(campaign.campaign_type);
      setInstanceId(campaign.wa_instance_id);
      setMessage(campaign.message_template);
      setAudienceType(campaign.audience_config_json?.type || "all_active");
      setAttachments(campaign.attachments_json || []);
    }
  }, [campaign, isNew]);

  const insertVariable = (variable: string) => {
    setMessage(prev => prev + ` {{${variable}}} `);
  };

  const getVariablesForType = (t: CampaignType) => {
    const base = ["nome_cliente", "telefone_cliente", "empresa_cliente", "nome_empresa"];
    switch (t) {
      case 'boleto': return [...base, "valor_boleto", "vencimento_boleto", "link_boleto", "numero_boleto"];
      case 'nota_fiscal': return [...base, "numero_nf", "valor_nf", "data_emissao_nf", "link_nf"];
      case 'video_aprovacao': return [...base, "nome_video", "link_video", "prazo_aprovacao", "nome_projeto"];
      default: return base;
    }
  };

  const handleSaveDraft = async () => {
    try {
      if (!name || !instanceId) {
        toast.error("Nome e Instância são obrigatórios.");
        return;
      }
      
      const payload = {
        name,
        campaign_type: type,
        wa_instance_id: instanceId,
        message_template: message,
        audience_config_json: { type: audienceType },
        attachments_json: attachments,
        status: 'draft' as const
      };

      if (isNew) {
        await createCampaign.mutateAsync(payload);
        navigate("/app/smart-campaigns");
      } else {
        await updateCampaign.mutateAsync({ id, ...payload });
      }
    } catch (e) {
      // Error handled in hook
    }
  };

  const handleSendTest = async () => {
    if (!testPhone || !instanceId || !message) {
      toast.error("Telefone de teste, Instância e Mensagem são obrigatórios para enviar teste.");
      return;
    }
    
    // Save draft first if new to get an ID
    let currentId = id;
    if (isNew) {
      if (!name) { toast.error("Preencha o nome do disparo primeiro."); return; }
      const newCampaign = await createCampaign.mutateAsync({
        name,
        campaign_type: type,
        wa_instance_id: instanceId,
        message_template: message,
        audience_config_json: { type: audienceType },
        attachments_json: attachments,
        status: 'draft'
      });
      currentId = newCampaign.id;
      // Note: we don't navigate yet, user might want to stay
      // But we'd need to update the URL in a real scenario. For MVP we'll just test.
    }

    if (!currentId) return;

    await sendTest.mutateAsync({
      campaign_id: currentId,
      wa_instance_id: instanceId,
      test_phone_e164: testPhone,
      message,
      attachments
    });
  };

  const handleAddAttachment = () => {
    if (newAttachment) {
      setAttachments([...attachments, newAttachment]);
      setNewAttachment("");
    }
  };

  if (!isNew && isLoadingCampaign) return <div className="p-8">Carregando...</div>;

  return (
    <div className="flex-1 w-full h-screen overflow-auto bg-slate-50 dark:bg-slate-950 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header Options */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/app/smart-campaigns")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {isNew ? "Novo Disparo" : "Editar Disparo"}
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleSaveDraft} disabled={createCampaign.isPending || updateCampaign.isPending}>
              <Save className="w-4 h-4 mr-2" />
              Salvar Rascunho
            </Button>
            <Button variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-200">
              <Clock className="w-4 h-4 mr-2" />
              Agendar
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Send className="w-4 h-4 mr-2" />
              Enviar Oficial
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Config */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Configurações Básicas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome do Disparo / Campanha</Label>
                  <Input 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    placeholder="Ex: Cobrança Junho 2026" 
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo de Disparo</Label>
                    <Select value={type} onValueChange={(v: CampaignType) => setType(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="comunicado">Comunicado Simples</SelectItem>
                        <SelectItem value="boleto">Envio de Boleto</SelectItem>
                        <SelectItem value="nota_fiscal">Envio de Nota Fiscal</SelectItem>
                        <SelectItem value="video_aprovacao">Vídeo para Aprovação</SelectItem>
                        <SelectItem value="cobranca">Cobrança</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Instância Z-API</Label>
                    <Select value={instanceId} onValueChange={setInstanceId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma instância" />
                      </SelectTrigger>
                      <SelectContent>
                        {instances?.map(inst => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name} ({inst.phone_number || 'S/N'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Público Alvo (Categoria)</Label>
                  <Select value={audienceType} onValueChange={setAudienceType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_active">Todos os Clientes Ativos</SelectItem>
                      <SelectItem value="boletos_abertos">Clientes com Boletos em Aberto</SelectItem>
                      <SelectItem value="boletos_vencidos">Clientes com Boletos Vencidos</SelectItem>
                      <SelectItem value="aguardando_aprovacao">Aguardando Aprovação de Vídeo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mensagem e Conteúdo</CardTitle>
                <CardDescription>
                  Escreva a mensagem personalizada. Use os botões abaixo para inserir variáveis.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2 mb-2">
                  {getVariablesForType(type).map(v => (
                    <Badge 
                      key={v} 
                      variant="outline" 
                      className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => insertVariable(v)}
                    >
                      {`{{${v}}}`}
                    </Badge>
                  ))}
                </div>
                
                <Textarea 
                  className="min-h-[200px] resize-y"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Olá {{nome_cliente}}, tudo bem? ..."
                />
                
                <div className="space-y-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Label>Anexos (Links)</Label>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="https://exemplo.com/boleto.pdf" 
                      value={newAttachment}
                      onChange={e => setNewAttachment(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddAttachment()}
                    />
                    <Button variant="outline" onClick={handleAddAttachment}>Adicionar</Button>
                  </div>
                  {attachments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {attachments.map((att, i) => (
                        <li key={i} className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 p-2 rounded text-sm">
                          <span className="truncate max-w-[300px] text-slate-600 dark:text-slate-300">
                            <FileText className="w-4 h-4 inline mr-2" />
                            {att}
                          </span>
                          <button 
                            onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))}
                            className="text-red-500 hover:text-red-700"
                          >
                            Remover
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar / Test */}
          <div className="space-y-6">
            <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900/50 dark:bg-blue-900/10">
              <CardHeader>
                <CardTitle className="text-blue-700 dark:text-blue-400 flex items-center gap-2">
                  <Play className="w-5 h-5" />
                  Teste de Envio
                </CardTitle>
                <CardDescription>
                  Envie a mensagem para um número de teste antes do disparo oficial.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Telefone (WhatsApp)</Label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <Input 
                      className="pl-9"
                      placeholder="Ex: 5511999999999" 
                      value={testPhone}
                      onChange={e => setTestPhone(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    O teste usará dados fictícios para substituir as variáveis.
                  </p>
                </div>
                
                <Button 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleSendTest}
                  disabled={sendTest.isPending}
                >
                  {sendTest.isPending ? "Enviando..." : "Enviar Teste Agora"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Prévia da Mensagem</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-100 dark:bg-slate-900 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                  {message || "Nenhuma mensagem configurada..."}
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}

// Needed Badge component placeholder since it's used in the text. I'll import it correctly above.
