import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Target, Trash2, Pencil, RotateCcw } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";

type UserGoalsEditorProps = {
  userId: string;
  userName: string;
  roleKey: string | null;
};

export function UserGoalsEditor({ userId, userName, roleKey }: UserGoalsEditorProps) {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<any>(null);

  // Form states
  const [name, setName] = useState("");
  const [metricKey, setMetricKey] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [targetType, setTargetType] = useState("quantity");
  const [templateId, setTemplateId] = useState<string | null>(null);

  const goalsQ = useQuery({
    queryKey: ["admin_user_goals_manage", activeTenantId, userId],
    queryFn: async () => {
      // Fetch templates
      let templates: any[] = [];
      if (roleKey) {
        const { data } = await supabase
          .from("goal_templates")
          .select("*")
          .eq("tenant_id", activeTenantId!)
          .eq("role_key", roleKey);
        templates = data || [];
      }

      // Fetch user goals (overrides and exclusives)
      const { data: userGoals } = await supabase
        .from("user_goals")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .eq("user_id", userId);

      const resolved: any[] = [];
      const overriddenTemplateIds = new Set<string>();

      // Apply overrides or exclusives
      for (const ug of (userGoals || [])) {
        if (ug.template_id) {
          overriddenTemplateIds.add(ug.template_id);
          resolved.push({ ...ug, is_template: false, is_overridden: true });
        } else {
          // Exclusive
          resolved.push({ ...ug, is_template: false, is_overridden: false });
        }
      }

      // Add non-overridden templates
      for (const t of templates) {
        if (!overriddenTemplateIds.has(t.id)) {
          resolved.push({ ...t, is_template: true, is_overridden: false });
        }
      }

      return resolved.sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: Boolean(activeTenantId && userId)
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name || !metricKey || !targetValue) throw new Error("Preencha todos os campos obrigatórios");

      if (editingGoal?.is_overridden || (editingGoal && !editingGoal.is_template)) {
        // Update existing user_goal
        const { error } = await supabase.from("user_goals").update({
          name,
          metric_key: metricKey,
          target_value: Number(targetValue),
          frequency,
          target_type: targetType
        }).eq("id", editingGoal.id);
        if (error) throw error;
      } else {
        // Create new user_goal (either overriding a template or completely exclusive)
        const { error } = await supabase.from("user_goals").insert({
          tenant_id: activeTenantId!,
          user_id: userId,
          name,
          metric_key: metricKey,
          target_value: Number(targetValue),
          frequency,
          target_type: targetType,
          template_id: templateId || null
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      showSuccess("Meta salva com sucesso!");
      setIsModalOpen(false);
      qc.invalidateQueries({ queryKey: ["admin_user_goals_manage"] });
      // Invalidate frontend progress queries too
      qc.invalidateQueries({ queryKey: ["my_goals_resolved"] });
      qc.invalidateQueries({ queryKey: ["team_user_goals"] });
      qc.invalidateQueries({ queryKey: ["tenant_global_goals"] });
    },
    onError: (err: any) => showError(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Personalização removida!");
      qc.invalidateQueries({ queryKey: ["admin_user_goals_manage"] });
      qc.invalidateQueries({ queryKey: ["my_goals_resolved"] });
      qc.invalidateQueries({ queryKey: ["team_user_goals"] });
      qc.invalidateQueries({ queryKey: ["tenant_global_goals"] });
    },
    onError: (err: any) => showError(err.message)
  });

  const openNewGoal = () => {
    setEditingGoal(null);
    setName("");
    setMetricKey("");
    setTargetValue("");
    setFrequency("monthly");
    setTargetType("quantity");
    setTemplateId(null);
    setIsModalOpen(true);
  };

  const openOverride = (tpl: any) => {
    setEditingGoal(tpl);
    setName(tpl.name);
    setMetricKey(tpl.metric_key);
    setTargetValue(tpl.target_value.toString());
    setFrequency(tpl.frequency);
    setTargetType(tpl.target_type || "quantity");
    setTemplateId(tpl.id);
    setIsModalOpen(true);
  };

  const openEdit = (ug: any) => {
    setEditingGoal(ug);
    setName(ug.name);
    setMetricKey(ug.metric_key);
    setTargetValue(ug.target_value.toString());
    setFrequency(ug.frequency);
    setTargetType(ug.target_type || "quantity");
    setTemplateId(ug.template_id);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Deseja realmente remover esta meta específica do usuário? Se for uma sobrescrita, ele voltará a herdar a meta padrão do cargo.")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex justify-between items-center mb-4 pb-4 border-b">
        <div>
          <h2 className="font-semibold text-lg text-slate-800">Metas de {userName}</h2>
          <p className="text-sm text-slate-500">
            {roleKey ? `Herdando metas do cargo: ${roleKey}` : 'Usuário sem cargo definido.'}
          </p>
        </div>
        <Button onClick={openNewGoal} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4 mr-2" /> Adicionar Meta Exclusiva
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-3">
        {goalsQ.isLoading ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : goalsQ.data?.length === 0 ? (
          <div className="py-12 text-center text-slate-400">Nenhuma meta configurada.</div>
        ) : (
          goalsQ.data?.map(g => (
            <div key={g.id || g.metric_key} className={`border p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors ${g.is_overridden ? 'bg-amber-50/30 border-amber-200' : !g.is_template ? 'bg-indigo-50/30 border-indigo-200' : 'bg-white'}`}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-bold text-slate-800">{g.name}</h4>
                  {g.is_overridden && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wider">
                      Sobrescrito (Personalizado)
                    </span>
                  )}
                  {!g.is_template && !g.is_overridden && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 uppercase tracking-wider">
                      Exclusivo do Usuário
                    </span>
                  )}
                  {g.is_template && !g.is_overridden && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase tracking-wider">
                      Padrão do Cargo
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-500 flex gap-4">
                  <span>Métrica: <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">{g.metric_key}</code></span>
                  <span>Frequência: {g.frequency === 'daily' ? 'Diária' : g.frequency === 'weekly' ? 'Semanal' : g.frequency === 'yearly' ? 'Anual' : 'Mensal'}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-0 pt-3 sm:pt-0 border-slate-100">
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Alvo ({g.target_type === 'money' ? 'Financeiro' : 'Qtd'})</div>
                  <div className="text-xl font-black text-slate-800">
                    {g.target_type === 'money' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(g.target_value) : g.target_value}
                  </div>
                </div>

                <div className="flex gap-2">
                  {g.is_template && !g.is_overridden ? (
                    <Button variant="outline" size="sm" onClick={() => openOverride(g)}>
                      <Pencil className="w-4 h-4 mr-1" /> Personalizar
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={() => openEdit(g)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-rose-500 hover:bg-rose-50 hover:text-rose-700" onClick={() => handleDelete(g.id)} disabled={deleteMutation.isPending}>
                        {g.is_overridden ? <RotateCcw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center p-4">
          <div className="bg-white border rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-600" />
              {editingGoal?.is_template ? "Personalizar Meta do Cargo" : editingGoal ? "Editar Meta do Usuário" : "Nova Meta Exclusiva"}
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Nome da Meta</Label>
                <Input value={name} onChange={e => setName(e.target.value)} disabled={!!editingGoal?.is_template} />
              </div>
              <div className="space-y-1">
                <Label>Chave da Métrica</Label>
                <Input value={metricKey} onChange={e => setMetricKey(e.target.value)} disabled={!!editingGoal?.is_template} />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Frequência</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Diária</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select value={targetType} onValueChange={setTargetType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quantity">Quantidade (Nº)</SelectItem>
                      <SelectItem value="money">Financeiro (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Valor Alvo ({targetType === 'money' ? 'R$' : 'Nº'})</Label>
                <Input type="number" step="0.01" value={targetValue} onChange={e => setTargetValue(e.target.value)} />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
