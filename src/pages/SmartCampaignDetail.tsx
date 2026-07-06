import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Save, Send, Clock, Play, Phone, FileText, Mail, MessageSquare, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AppShell } from "@/components/AppShell";
import { useSmartCampaigns, useSmartCampaign, CampaignType } from "@/hooks/useSmartCampaigns";
import { useSmartCampaignTemplates } from "@/hooks/useSmartCampaignTemplates";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useQuery } from "@tanstack/react-query";

function EntityFileSelector({ tenantId, entityId, currentPath, onSelect }: { tenantId: string; entityId: string; currentPath?: string; onSelect: (path: string) => void }) {
  const { data: files, isLoading } = useQuery({
    queryKey: ["entity_files", tenantId, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entity_files")
        .select("id, original_filename, storage_path, file_type, metadata")
        .eq("tenant_id", tenantId)
        .eq("entity_id", entityId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId && !!entityId
  });

  if (isLoading) return <span className="text-xs text-slate-400">Carregando arquivos...</span>;
  if (!files || files.length === 0) return <span className="text-xs text-amber-500">Nenhum arquivo encontrado nesta entidade.</span>;

  return (
    <Select value={currentPath || ""} onValueChange={onSelect}>
      <SelectTrigger className="h-7 text-xs w-[200px]">
        <SelectValue placeholder="Selecione o arquivo..." />
      </SelectTrigger>
      <SelectContent>
        {files.map(f => {
          const ref = f.metadata?.reference_month ? ` (Ref: ${f.metadata.reference_month})` : "";
          return (
            <SelectItem key={f.id} value={f.storage_path}>
              <span className="truncate block max-w-[200px]">{f.file_type.toUpperCase()}{ref} - {f.original_filename}</span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

export default function SmartCampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cloneId = searchParams.get("clone");
  const isNew = !id || id === 'new';
  const { activeTenantId } = useTenant();

  const { instances, createCampaign, updateCampaign, sendTest } = useSmartCampaigns();
  
  // Se for clone, carrega a campanha a ser clonada, se não carrega a atual (se houver id)
  const queryId = isNew && cloneId ? cloneId : (!isNew ? id : undefined);
  const { campaign, isLoading: isLoadingCampaign } = useSmartCampaign(queryId);
  const { templates, createTemplate } = useSmartCampaignTemplates();

  const [name, setName] = useState("");
  const [type, setType] = useState<CampaignType>("comunicado");
  const [instanceId, setInstanceId] = useState("");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [channels, setChannels] = useState<string[]>(["whatsapp"]);
  
  const [audienceType, setAudienceType] = useState("all_active");
  const [manualNumbersText, setManualNumbersText] = useState("");
  
  // Entities selection
  const [selectedEntities, setSelectedEntities] = useState<any[]>([]);
  const [entitySearch, setEntitySearch] = useState("");
  const [entityResults, setEntityResults] = useState<any[]>([]);
  const [isSearchingEntities, setIsSearchingEntities] = useState(false);

  const [testPhone, setTestPhone] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [newAttachment, setNewAttachment] = useState("");

  const [saveAsTemplateName, setSaveAsTemplateName] = useState("");

  // Search entities
  useEffect(() => {
    if (entitySearch.length < 2) {
      setEntityResults([]);
      return;
    }
    const search = async () => {
      setIsSearchingEntities(true);
      const { data, error } = await supabase
        .from("core_entities")
        .select("id, display_name, metadata")
        .eq("tenant_id", activeTenantId!)
        .eq("entity_type", "party")
        .ilike("display_name", `%${entitySearch}%`)
        .limit(10);
      if (!error && data) {
        setEntityResults(data);
      }
      setIsSearchingEntities(false);
    };
    const to = setTimeout(search, 300);
    return () => clearTimeout(to);
  }, [entitySearch, activeTenantId]);

  useEffect(() => {
    if (campaign) {
      setName(isNew && cloneId ? `${campaign.name} (Cópia)` : campaign.name);
      setType(campaign.campaign_type);
      setInstanceId(campaign.wa_instance_id);
      setMessage(campaign.message_template);
      setChannels(campaign.channels_json || ["whatsapp"]);
      
      const conf = campaign.audience_config_json || {};
      setAudienceType(conf.type || "all_active");
      
      if (conf.type === "manual" && conf.numbers) {
        setManualNumbersText(conf.numbers.join(", "));
      }
      
      if (conf.type === "entities" && conf.entities) {
        setSelectedEntities(conf.entities);
      }

      setAttachments(campaign.attachments_json || []);
    }
  }, [campaign, isNew, cloneId]);

  const insertVariable = (variable: string) => {
    setMessage(prev => prev + ` {{${variable}}} `);
  };

  const getVariablesForType = (t: CampaignType) => {
    const base = ["nome_cliente", "telefone_cliente", "email_cliente", "nome_empresa"];
    switch (t) {
      case 'boleto': return [...base, "valor_boleto", "vencimento_boleto", "link_boleto", "numero_boleto"];
      case 'nota_fiscal': return [...base, "numero_nf", "valor_nf", "data_emissao_nf", "link_nf"];
      case 'video_aprovacao': return [...base, "nome_video", "link_video", "prazo_aprovacao"];
      default: return base;
    }
  };

  const handleSaveDraft = async () => {
    try {
      if (!name || (channels.includes("whatsapp") && !instanceId)) {
        toast.error("Nome e Instância (para WhatsApp) são obrigatórios.");
        return;
      }
      if (channels.length === 0) {
        toast.error("Selecione pelo menos um canal (WhatsApp ou E-mail).");
        return;
      }
      
      let audiencePayload: any = { type: audienceType };
      if (audienceType === "manual") {
        const numbers = manualNumbersText.split(/[\s,;\n]+/).map(n => n.trim()).filter(n => n.length > 0);
        if (numbers.length === 0) {
          toast.error("Insira ao menos um número de telefone no envio avulso.");
          return;
        }
        audiencePayload.numbers = numbers;
      } else if (audienceType === "entities") {
        if (selectedEntities.length === 0) {
          toast.error("Selecione pelo menos uma entidade.");
          return;
        }
        audiencePayload.entities = selectedEntities;
      }

      const payload = {
        name,
        campaign_type: type,
        wa_instance_id: instanceId || instances?.[0]?.id || '', // fallback
        message_template: message,
        audience_config_json: audiencePayload,
        attachments_json: attachments,
        channels_json: channels,
        status: 'draft' as const,
        parent_campaign_id: cloneId || null
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
    if (!message) {
      toast.error("Mensagem é obrigatória.");
      return;
    }
    if (channels.includes("whatsapp") && (!testPhone || !instanceId)) {
      toast.error("Telefone de teste e Instância são obrigatórios para envio de WhatsApp.");
      return;
    }
    if (channels.includes("email") && !testEmail) {
      toast.error("E-mail de teste é obrigatório para envio de E-mail.");
      return;
    }
    
    // Save/update draft first to get an ID and ensure database is synced
    let currentId = id;
    
    let audiencePayload: any = { type: audienceType };
    if (audienceType === "manual") {
      audiencePayload.numbers = manualNumbersText.split(/[\s,;\n]+/).map(n => n.trim()).filter(n => n.length > 0);
    } else if (audienceType === "entities") {
      audiencePayload.entities = selectedEntities;
    }

    const payload = {
      name: name || "Teste de Envio",
      campaign_type: type,
      wa_instance_id: instanceId || instances?.[0]?.id || '',
      message_template: message,
      audience_config_json: audiencePayload,
      attachments_json: attachments,
      channels_json: channels,
      status: 'draft' as const,
      parent_campaign_id: cloneId || null
    };

    try {
      if (isNew) {
        if (!name) { toast.error("Preencha o nome do disparo primeiro."); return; }
        const newCampaign = await createCampaign.mutateAsync(payload);
        currentId = newCampaign.id;
        navigate(`/app/smart-campaigns/${newCampaign.id}`, { replace: true });
      } else {
        await updateCampaign.mutateAsync({ id: currentId!, ...payload });
      }
    } catch (err) {
      console.error("Erro ao salvar rascunho antes do teste:", err);
      toast.error("Erro ao salvar rascunho. O teste não pôde ser enviado.");
      return;
    }

    if (!currentId) return;

    await sendTest.mutateAsync({
      campaign_id: currentId,
      wa_instance_id: instanceId || instances?.[0]?.id || '',
      test_phone_e164: testPhone,
      test_email: testEmail,
      message,
      subject,
      attachments,
      channels_json: channels
    });
  };

  const handleAddAttachment = () => {
    if (newAttachment) {
      setAttachments([...attachments, newAttachment]);
      setNewAttachment("");
    }
  };

  const handleSaveTemplate = async () => {
    if (!saveAsTemplateName) {
      toast.error("Digite um nome para o template.");
      return;
    }
    if (!message) {
      toast.error("A mensagem não pode estar vazia.");
      return;
    }
    await createTemplate.mutateAsync({
      name: saveAsTemplateName,
      channel_type: channels.includes("whatsapp") && channels.includes("email") ? "both" : (channels.includes("whatsapp") ? "whatsapp" : "email"),
      subject_template: subject || null,
      body_template: message
    });
    setSaveAsTemplateName("");
  };

  const applyTemplate = (templateId: string) => {
    const tmpl = templates?.find(t => t.id === templateId);
    if (tmpl) {
      setMessage(tmpl.body_template);
      if (tmpl.subject_template) setSubject(tmpl.subject_template);
      toast.success("Template aplicado.");
    }
  };

  const addEntity = (entity: any) => {
    if (!selectedEntities.find(e => e.id === entity.id)) {
      setSelectedEntities([...selectedEntities, {
        id: entity.id,
        name: entity.display_name,
        email: entity.metadata?.email,
        phone: entity.metadata?.phone || entity.metadata?.whatsapp
      }]);
    }
    setEntitySearch("");
    setEntityResults([]);
  };

  const removeEntity = (id: string) => {
    setSelectedEntities(selectedEntities.filter(e => e.id !== id));
  };

  const updateEntityFile = (id: string, file_path: string) => {
    setSelectedEntities(selectedEntities.map(e => e.id === id ? { ...e, file_path } : e));
  };

  if (!isNew && isLoadingCampaign) return <div className="p-8">Carregando...</div>;

  return (
    <AppShell>
    <div className="flex-1 w-full h-full overflow-auto bg-transparent p-2 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header Options */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/app/smart-campaigns")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {isNew ? (cloneId ? "Duplicar Disparo" : "Novo Disparo") : "Editar Disparo"}
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
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Nome do Disparo / Campanha</Label>
                  <Input 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    placeholder="Ex: Cobrança Junho 2026" 
                  />
                </div>

                <div className="space-y-4">
                  <Label>Canais de Envio</Label>
                  <div className="flex gap-6 border border-slate-200 dark:border-slate-800 p-4 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="channel-wa" 
                        checked={channels.includes("whatsapp")}
                        onCheckedChange={(c) => {
                          if (c) setChannels([...channels, "whatsapp"]);
                          else setChannels(channels.filter(ch => ch !== "whatsapp"));
                        }}
                      />
                      <label htmlFor="channel-wa" className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-green-500" /> WhatsApp
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="channel-email" 
                        checked={channels.includes("email")}
                        onCheckedChange={(c) => {
                          if (c) setChannels([...channels, "email"]);
                          else setChannels(channels.filter(ch => ch !== "email"));
                        }}
                      />
                      <label htmlFor="channel-email" className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2">
                        <Mail className="w-4 h-4 text-blue-500" /> E-mail
                      </label>
                    </div>
                  </div>
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
                  
                  {channels.includes("whatsapp") && (
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
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Público Alvo (Categoria)</Label>
                  <Select value={audienceType} onValueChange={setAudienceType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entities">Selecionar Entidades (Clientes)</SelectItem>
                      <SelectItem value="all_active">Todos os Clientes Ativos</SelectItem>
                      <SelectItem value="boletos_abertos">Clientes com Boletos em Aberto</SelectItem>
                      <SelectItem value="boletos_vencidos">Clientes com Boletos Vencidos</SelectItem>
                      <SelectItem value="manual">Envio Avulso (Inserir Números Manualmente)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {audienceType === "entities" && (
                  <div className="space-y-4 border border-slate-200 dark:border-slate-800 p-4 rounded-lg bg-slate-50 dark:bg-slate-900/30">
                    <div className="space-y-2">
                      <Label>Buscar e Adicionar Entidades</Label>
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                        <Input 
                          placeholder="Digite o nome do cliente..." 
                          value={entitySearch}
                          onChange={e => setEntitySearch(e.target.value)}
                          className="pl-9"
                        />
                        {isSearchingEntities && <div className="absolute right-3 top-3 text-xs text-slate-400">Buscando...</div>}
                        
                        {entityResults.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md shadow-lg max-h-60 overflow-auto">
                            {entityResults.map(ent => (
                              <button
                                key={ent.id}
                                className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm flex justify-between items-center"
                                onClick={() => addEntity(ent)}
                              >
                                <span>{ent.display_name}</span>
                                <Plus className="w-4 h-4 text-slate-400" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {selectedEntities.length > 0 && (
                      <div className="space-y-2">
                        <Label>Entidades Selecionadas ({selectedEntities.length})</Label>
                        <div className="grid gap-2 max-h-60 overflow-y-auto pr-2">
                          {selectedEntities.map(ent => (
                            <div key={ent.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2 rounded-md text-sm gap-2">
                              <div>
                                <div className="font-medium">{ent.name}</div>
                                <div className="text-xs text-slate-500 flex gap-3">
                                  {ent.phone && <span>WhatsApp: {ent.phone}</span>}
                                  {ent.email && <span>E-mail: {ent.email}</span>}
                                  {!ent.phone && !ent.email && <span className="text-red-400">Sem contato válido</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {(type === "comunicado" || type === "boleto") && (
                                  <EntityFileSelector 
                                    tenantId={activeTenantId!} 
                                    entityId={ent.id} 
                                    currentPath={ent.file_path} 
                                    onSelect={(path) => updateEntityFile(ent.id, path)} 
                                  />
                                )}
                                <Button variant="ghost" size="icon" onClick={() => removeEntity(ent.id)}>
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {audienceType === "manual" && (
                  <div className="space-y-2 mt-2">
                    <Label>Números de Telefone (WhatsApp)</Label>
                    <Textarea 
                      placeholder="Ex: 5511999999999, 5511888888888"
                      value={manualNumbersText}
                      onChange={e => setManualNumbersText(e.target.value)}
                      className="min-h-[80px]"
                    />
                    <p className="text-[11px] text-slate-500">
                      Cole ou digite os números de telefone com DDI e DDD (ex: 5511999999999), separados por vírgula, espaço ou quebra de linha.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>Mensagem e Conteúdo</CardTitle>
                    <CardDescription>
                      Escreva a mensagem personalizada. Use os botões abaixo para inserir variáveis.
                    </CardDescription>
                  </div>
                  
                  {templates && templates.length > 0 && (
                    <Select onValueChange={applyTemplate}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Usar Template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
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
                
                {channels.includes("email") && (
                  <div className="space-y-2 pb-4">
                    <Label>Assunto do E-mail</Label>
                    <Input 
                      placeholder="Ex: Seu boleto chegou {{nome_cliente}}" 
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                    />
                  </div>
                )}
                
                <Textarea 
                  className="min-h-[200px] resize-y"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Olá {{nome_cliente}}, tudo bem? ..."
                />
                
                <div className="flex items-center gap-2 pt-2">
                  <Input 
                    placeholder="Nome para salvar como novo template..." 
                    value={saveAsTemplateName}
                    onChange={e => setSaveAsTemplateName(e.target.value)}
                    className="max-w-[300px]"
                  />
                  <Button variant="secondary" onClick={handleSaveTemplate} disabled={!saveAsTemplateName || !message}>
                    Salvar Template
                  </Button>
                </div>
                
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
                  Envie a mensagem para você mesmo antes do disparo oficial.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {channels.includes("whatsapp") && (
                  <div className="space-y-2">
                    <Label>Telefone de Teste</Label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                      <Input 
                        className="pl-9"
                        placeholder="Ex: 5511999999999" 
                        value={testPhone}
                        onChange={e => setTestPhone(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                
                {channels.includes("email") && (
                  <div className="space-y-2">
                    <Label>E-mail de Teste</Label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                      <Input 
                        className="pl-9"
                        placeholder="Ex: seu@email.com" 
                        value={testEmail}
                        onChange={e => setTestEmail(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                
                <Button 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-2"
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
                {subject && channels.includes("email") && (
                  <div className="mb-2 text-sm font-medium">Assunto: {subject}</div>
                )}
                <div className="bg-slate-100 dark:bg-slate-900 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                  {message || "Nenhuma mensagem configurada..."}
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
    </AppShell>
  );
}
