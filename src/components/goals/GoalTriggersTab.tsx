import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Trash2, Zap } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";

export function GoalTriggersTab() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  const [eventType, setEventType] = useState("");
  const [metricKey, setMetricKey] = useState("");
  const [multiplier, setMultiplier] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Fetch unique metric_keys from goal_templates
  const metricKeysQ = useQuery({
    queryKey: ["goal_metric_keys", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goal_templates")
        .select("metric_key, name")
        .eq("tenant_id", activeTenantId!);
        
      if (error) throw error;
      const map = new Map();
      (data || []).forEach(d => {
        map.set(d.metric_key, d.name);
      });
      return Array.from(map.entries()).map(([key, name]) => ({ key, name }));
    }
  });

  const createTrigger = useMutation({
    mutationFn: async () => {
      if (!eventType || !metricKey) throw new Error("Preencha o evento e a métrica");
      const { error } = await supabase.from("goal_triggers").insert({
        tenant_id: activeTenantId!,
        event_type: eventType,
        metric_key: metricKey,
        value_multiplier: Number(multiplier)
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

  const handleCreate = async () => {
    setIsSubmitting(true);
    await createTrigger.mutateAsync();
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6 mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-indigo-500" />
            Novo Gatilho
          </CardTitle>
          <CardDescription>
            Automatize o progresso das suas metas. Sempre que o Guardião rastrear um evento específico na linha do tempo, nós somaremos pontos na métrica vinculada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-end gap-4">
            <div className="flex-1 space-y-2 w-full">
              <Label>Evento do Guardião (Gatilho)</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um evento mapeado" />
                </SelectTrigger>
                <SelectContent>
                  {eventTypesQ.isLoading && <div className="p-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>}
                  {eventTypesQ.data?.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                  {!eventTypesQ.isLoading && eventTypesQ.data?.length === 0 && (
                    <div className="p-4 text-center text-sm text-slate-500">Nenhum evento encontrado na linha do tempo.</div>
                  )}
                </SelectContent>
              </Select>
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

            <div className="w-24 space-y-2">
              <Label>Multiplicador</Label>
              <Input type="number" min="1" value={multiplier} onChange={e => setMultiplier(e.target.value)} />
            </div>

            <Button onClick={handleCreate} disabled={isSubmitting || !eventType || !metricKey} className="bg-indigo-600 hover:bg-indigo-700 text-white w-full md:w-auto">
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Criar
            </Button>
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
              {triggersQ.data?.map(trigger => (
                <div key={trigger.id} className="flex justify-between items-center p-4 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-100 p-2 rounded-lg">
                      <Zap className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">
                        Se {trigger.event_type} <span className="text-slate-400 font-normal mx-1">➜</span> Somar {trigger.value_multiplier} em {trigger.metric_key}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Criado em {new Date(trigger.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteTrigger.mutate(trigger.id)} className="text-rose-500 hover:text-rose-700 hover:bg-rose-50">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
