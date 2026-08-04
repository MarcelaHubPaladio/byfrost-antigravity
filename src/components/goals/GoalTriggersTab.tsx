import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Trash2, Zap, Info, Pencil, X } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";

const EVENT_DICTIONARY: Record<string, { label: string; description: string }> = {
  automation_executed: { label: "Automação Executada", description: "Quando uma regra automática de sistema é ativada." },
  bank_hour_ledger_adjusted: { label: "Banco de Horas Ajustado", description: "Ajuste manual feito no banco de horas." },
  bank_hour_ledger_posted: { label: "Banco de Horas Registrado", description: "Nova entrada lançada no banco de horas." },
  card_created: { label: "Card Criado", description: "Um novo card foi adicionado no Kanban." },
  case_created: { label: "Caso/Card Criado", description: "Um novo caso de atendimento foi criado." },
  case_deleted: { label: "Caso Deletado", description: "Um card foi excluído do sistema." },
  case_opened: { label: "Caso Aberto", description: "O card do cliente foi aberto/visualizado." },
  case_state_changed: { label: "Fase Alterada", description: "O card foi movido para outra etapa/coluna." },
  case_updated: { label: "Caso Atualizado", description: "Dados do card foram modificados." },
  contract_sent: { label: "Contrato Enviado", description: "Um contrato foi enviado para o cliente." },
  contract_signed: { label: "Contrato Assinado", description: "O cliente finalizou a assinatura do contrato." },
  customer_reply: { label: "Mensagem do Cliente", description: "O cliente enviou uma resposta no chat." },
  customer_updated: { label: "Cliente Atualizado", description: "Os dados de contato do cliente foram editados." },
  inbound_image: { label: "Imagem Recebida", description: "O cliente enviou uma imagem pelo WhatsApp." },
  late_arrival: { label: "Atraso no Ponto", description: "O colaborador registrou entrada atrasada." },
  lead_created: { label: "Lead Criado", description: "Um novo lead foi criado no sistema." },
  lead_imported: { label: "Lead Importado", description: "Um lead foi importado via planilha/integração." },
  lead_merged: { label: "Lead Mesclado", description: "Dois cadastros de leads foram unificados." },
  lead_reactivated: { label: "Lead Reativado", description: "Um lead antigo voltou a entrar em contato." },
  note_updated: { label: "Anotação Atualizada", description: "Uma nota interna no card foi editada." },
  presence_close_attempt: { label: "Tentativa de Fechar Ponto", description: "Ação de tentar encerrar o expediente." },
  presence_punch: { label: "Batida de Ponto", description: "Registro normal de entrada ou saída." },
  presence_state_manual_override: { label: "Ponto Forçado (Admin)", description: "Status do ponto foi alterado manualmente por gestor." },
  whatsapp_message_sent: { label: "Mensagem Enviada", description: "Uma mensagem saiu via WhatsApp." }
};

export function GoalTriggersTab() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  const [eventType, setEventType] = useState("");
  const [metricKey, setMetricKey] = useState("");
  const [multiplier, setMultiplier] = useState("1");
  const [filterJourneyId, setFilterJourneyId] = useState("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);

  // Fetch configured triggers
  const triggersQ = useQuery({
    queryKey: ["goal_triggers", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goal_triggers")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch tenant journeys
  const journeysQ = useQuery({
    queryKey: ["tenant_journeys_list", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("journey_id, journeys(name)")
        .eq("tenant_id", activeTenantId!);
      if (error) throw error;
      return (data || []).map(d => ({
        id: d.journey_id,
        name: (d.journeys as any)?.name || "Jornada Desconhecida"
      })).sort((a, b) => a.name.localeCompare(b.name));
    }
  });

  // Fetch unique event_types from timeline_events for suggestions
  const eventTypesQ = useQuery({
    queryKey: ["timeline_event_types", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timeline_events")
        .select("event_type")
        .eq("tenant_id", activeTenantId!)
        .limit(1000);
      
      if (error) throw error;
      const types = new Set((data || []).map(d => d.event_type));
      return Array.from(types).sort();
    }
  });

  // Fetch unique metric_keys from goal_templates and user_goals
  const metricKeysQ = useQuery({
    queryKey: ["goal_metric_keys", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      // 1. Fetch from templates
      const { data: templatesData, error: templatesErr } = await supabase
        .from("goal_templates")
        .select("metric_key, name")
        .eq("tenant_id", activeTenantId!);
      if (templatesErr) throw templatesErr;

      // 2. Fetch from user specific goals
      const { data: usersData, error: usersErr } = await supabase
        .from("user_goals")
        .select("metric_key, name")
        .eq("tenant_id", activeTenantId!);
      if (usersErr) throw usersErr;
        
      const map = new Map();
      
      (templatesData || []).forEach(d => {
        map.set(d.metric_key, d.name);
      });
      
      (usersData || []).forEach(d => {
        if (!map.has(d.metric_key) || d.name) {
          map.set(d.metric_key, d.name || map.get(d.metric_key) || d.metric_key);
        }
      });
      
      return Array.from(map.entries()).map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
    }
  });

  const createTrigger = useMutation({
    mutationFn: async () => {
      if (!eventType || !metricKey) throw new Error("Preencha o evento e a métrica");
      const { error } = await supabase.from("goal_triggers").insert({
        tenant_id: activeTenantId!,
        event_type: eventType,
        metric_key: metricKey,
        value_multiplier: Number(multiplier),
        filter_journey_id: filterJourneyId === "all" ? null : filterJourneyId
      });
      if (error) {
        if (error.code === '23505') throw new Error("Este gatilho já existe.");
        throw error;
      }
    },
    onSuccess: () => {
      showSuccess("Gatilho criado com sucesso!");
      setEventType("");
      setMetricKey("");
      setFilterJourneyId("all");
      qc.invalidateQueries({ queryKey: ["goal_triggers"] });
    },
    onError: (err: any) => showError(err.message)
  });

  const updateTrigger = useMutation({
    mutationFn: async () => {
      if (!eventType || !metricKey || !editingTriggerId) throw new Error("Preencha o evento e a métrica");
      const { error } = await supabase.from("goal_triggers").update({
        event_type: eventType,
        metric_key: metricKey,
        value_multiplier: Number(multiplier),
        filter_journey_id: filterJourneyId === "all" ? null : filterJourneyId
      }).eq("id", editingTriggerId);
      if (error) {
        if (error.code === '23505') throw new Error("Já existe um gatilho para esta combinação.");
        throw error;
      }
    },
    onSuccess: () => {
      showSuccess("Gatilho atualizado com sucesso!");
      handleCancelEdit();
      qc.invalidateQueries({ queryKey: ["goal_triggers"] });
    },
    onError: (err: any) => showError(err.message)
  });

  const deleteTrigger = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goal_triggers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Gatilho removido.");
      qc.invalidateQueries({ queryKey: ["goal_triggers"] });
    },
    onError: (err: any) => showError(err.message)
  });

  const handleSubmit = async () => {
    setIsSubmitting(true);
    if (editingTriggerId) {
      await updateTrigger.mutateAsync();
    } else {
      await createTrigger.mutateAsync();
    }
    setIsSubmitting(false);
  };

  const handleEdit = (trigger: any) => {
    setEditingTriggerId(trigger.id);
    setEventType(trigger.event_type);
    setMetricKey(trigger.metric_key);
    setMultiplier(String(trigger.value_multiplier));
    setFilterJourneyId(trigger.filter_journey_id || "all");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingTriggerId(null);
    setEventType("");
    setMetricKey("");
    setMultiplier("1");
    setFilterJourneyId("all");
  };

  return (
    <div className="space-y-6 mt-6">
      <Card className={editingTriggerId ? "border-indigo-300 shadow-md ring-2 ring-indigo-50" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-indigo-500" />
            {editingTriggerId ? "Editar Gatilho" : "Novo Gatilho"}
          </CardTitle>
          <CardDescription>
            {editingTriggerId ? "Modifique as configurações deste gatilho." : "Automatize o progresso das suas metas. Sempre que o Guardião rastrear um evento específico na linha do tempo, nós somaremos pontos na métrica vinculada."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-end gap-4 relative">
            <div className="flex-1 space-y-2 w-full relative">
              <Label>Evento do Guardião (Gatilho)</Label>
              <Input
                type="text"
                value={eventType}
                onChange={(e) => {
                  setEventType(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Ex: case_moved (digite ou selecione da lista)"
              />
              
              {showSuggestions && (
                <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-64 overflow-y-auto z-50">
                  {eventTypesQ.isLoading && <div className="p-3 text-xs text-slate-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Carregando sugestões...</div>}
                  {!eventTypesQ.isLoading && eventTypesQ.data?.filter(t => t.toLowerCase().includes(eventType.toLowerCase())).map(t => {
                    const dict = EVENT_DICTIONARY[t];
                    return (
                      <div 
                        key={t} 
                        className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors"
                        onClick={() => {
                          setEventType(t);
                          setShowSuggestions(false);
                        }}
                      >
                        <div className="font-semibold text-sm text-slate-800">{dict ? dict.label : t}</div>
                        {dict && <div className="text-xs text-slate-500 mt-0.5">{dict.description}</div>}
                        <div className="text-[10px] text-slate-400 font-mono mt-1 opacity-70">{t}</div>
                      </div>
                    );
                  })}
                  {!eventTypesQ.isLoading && eventType && !eventTypesQ.data?.includes(eventType) && (
                    <div 
                      className="p-3 bg-indigo-50/50 hover:bg-indigo-50 cursor-pointer text-indigo-700 transition-colors"
                      onClick={() => setShowSuggestions(false)}
                    >
                      <div className="font-semibold text-sm">Usar evento customizado</div>
                      <div className="text-xs mt-0.5">O sistema escutará pelo evento exato: <code className="font-mono bg-indigo-100 px-1 rounded">{eventType}</code></div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 space-y-2 w-full">
              <Label>Métrica da Meta (Destino)</Label>
              <Select value={metricKey} onValueChange={setMetricKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a métrica que receberá pontos" />
                </SelectTrigger>
                <SelectContent>
                  {metricKeysQ.isLoading && <div className="p-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>}
                  {metricKeysQ.data?.map(m => (
                    <SelectItem key={m.key} value={m.key}>{m.name} ({m.key})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-end gap-4 mt-4">
            <div className="flex-1 space-y-2 w-full">
              <Label>Restringir à Jornada <span className="text-slate-400 font-normal">(Opcional)</span></Label>
              <Select value={filterJourneyId} onValueChange={setFilterJourneyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Aplicar a todas as jornadas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Jornadas</SelectItem>
                  {journeysQ.data?.map(j => (
                    <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-24 space-y-2">
              <Label>Multiplicador</Label>
              <Input type="number" min="1" value={multiplier} onChange={e => setMultiplier(e.target.value)} />
            </div>

            <div className="flex gap-2 w-full md:w-auto">
              {editingTriggerId && (
                <Button onClick={handleCancelEdit} variant="outline" disabled={isSubmitting} className="flex-1 md:flex-none">
                  Cancelar
                </Button>
              )}
              <Button onClick={handleSubmit} disabled={isSubmitting || !eventType || !metricKey} className="bg-indigo-600 hover:bg-indigo-700 text-white flex-1 md:flex-none">
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : (editingTriggerId ? <Pencil className="w-4 h-4 mr-2" /> : null)}
                {editingTriggerId ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gatilhos Ativos</CardTitle>
          <CardDescription>Gerencie as regras automáticas ativas no seu ambiente.</CardDescription>
        </CardHeader>
        <CardContent>
          {triggersQ.isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
            </div>
          ) : triggersQ.data?.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              Nenhum gatilho configurado. Crie um acima.
            </div>
          ) : (
            <div className="divide-y border rounded-xl overflow-hidden">
              {triggersQ.data?.map(trigger => {
                const dict = EVENT_DICTIONARY[trigger.event_type];
                const journeyName = trigger.filter_journey_id ? journeysQ.data?.find(j => j.id === trigger.filter_journey_id)?.name || "Jornada específica" : null;
                
                return (
                  <div key={trigger.id} className="flex justify-between items-center p-4 hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="bg-indigo-100 p-2 rounded-lg">
                        <Zap className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
                          Se <span className="underline decoration-indigo-200 underline-offset-4">{dict ? dict.label : trigger.event_type}</span> 
                          
                          {journeyName && (
                            <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full border border-purple-200">
                              em: {journeyName}
                            </span>
                          )}

                          <span className="text-slate-400 font-normal mx-1">➜</span> 
                          Somar <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold">{trigger.value_multiplier}</span> em <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">{trigger.metric_key}</code>
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                          {dict && <span className="text-slate-400 truncate max-w-xs" title={dict.description}><Info className="w-3 h-3 inline mr-1 opacity-70"/>{dict.description} • </span>}
                          <span className="font-mono text-[10px] opacity-70">({trigger.event_type})</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(trigger)} className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteTrigger.mutate(trigger.id)} className="text-rose-500 hover:text-rose-700 hover:bg-rose-50">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
