import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { showError, showSuccess } from '@/utils/toast';
import { Plus, Trash2, ChevronRight, ChevronLeft, Calendar as CalendarIcon, PackageCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface PlanCycleWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTenantId: string;
  commitmentId: string;
  journeyId: string;
  customerEntityId: string;
  customerEntityName: string;
  deliverables: any[];
  allTenantCases: any[];
  onSuccess: () => void;
}

type StrategyCaseInput = {
  id: string;
  title: string;
  objective: string;
  context: string;
  allocations: Record<string, number>; // key: deliverable_name, value: quantity
};

export function PlanCycleWizardDialog({
  open,
  onOpenChange,
  activeTenantId,
  commitmentId,
  journeyId,
  customerEntityId,
  customerEntityName,
  deliverables,
  allTenantCases,
  onSuccess
}: PlanCycleWizardDialogProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1: Identificação
  const [cycleName, setCycleName] = useState('');
  const [cycleStart, setCycleStart] = useState('');
  const [cycleEnd, setCycleEnd] = useState('');
  const [cycleObjective, setCycleObjective] = useState('');
  const [cycleContext, setCycleContext] = useState('');

  // Step 3: Cases Estratégicos
  const [strategicCases, setStrategicCases] = useState<StrategyCaseInput[]>([
    { id: crypto.randomUUID(), title: '', objective: '', context: '', allocations: {} }
  ]);

  // Step 4: Datas
  const [datePlanning, setDatePlanning] = useState('');
  const [dateRecording, setDateRecording] = useState('');
  const [dateApproval, setDateApproval] = useState('');
  const [datePosting, setDatePosting] = useState('');
  const [dateReport, setDateReport] = useState('');

  const handleClose = () => {
    setStep(1);
    setCycleName('');
    setCycleStart('');
    setCycleEnd('');
    setCycleObjective('');
    setCycleContext('');
    setStrategicCases([{ id: crypto.randomUUID(), title: '', objective: '', context: '', allocations: {} }]);
    setDatePlanning('');
    setDateRecording('');
    setDateApproval('');
    setDatePosting('');
    setDateReport('');
    onOpenChange(false);
  };

  // Grouped Deliverables
  const balances = useMemo(() => {
    const allocatedIds = new Set(allTenantCases.map(c => c.deliverable_id).filter(Boolean));
    const m = new Map<string, { total: any[], completed: any[], allocated: any[], available: any[] }>();

    for (const d of deliverables) {
      const k = d.name || 'Sem nome';
      if (!m.has(k)) {
        m.set(k, { total: [], completed: [], allocated: [], available: [] });
      }
      const entry = m.get(k)!;
      entry.total.push(d);

      if (d.status === 'completed') {
        entry.completed.push(d);
      } else if (allocatedIds.has(d.id)) {
        entry.allocated.push(d);
      } else {
        entry.available.push(d);
      }
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [deliverables, allTenantCases]);

  // Calculate current allocations across all new strategic cases
  const getTotalAllocated = (deliverableName: string) => {
    return strategicCases.reduce((sum, c) => sum + (c.allocations[deliverableName] || 0), 0);
  };

  const handleAddCase = () => {
    setStrategicCases([...strategicCases, { id: crypto.randomUUID(), title: '', objective: '', context: '', allocations: {} }]);
  };

  const handleRemoveCase = (id: string) => {
    setStrategicCases(strategicCases.filter(c => c.id !== id));
  };

  const handleUpdateCase = (id: string, field: keyof StrategyCaseInput, value: any) => {
    setStrategicCases(strategicCases.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const handleAllocationChange = (caseId: string, deliverableName: string, quantity: number) => {
    const balance = balances.find(b => b[0] === deliverableName)?.[1];
    if (!balance) return;
    const availableTotal = balance.available.length;
    
    setStrategicCases(prev => prev.map(c => {
      if (c.id !== caseId) return c;
      const otherAllocationsSum = prev.filter(pc => pc.id !== caseId).reduce((sum, pc) => sum + (pc.allocations[deliverableName] || 0), 0);
      const maxAllowed = availableTotal - otherAllocationsSum;
      const validQuantity = Math.max(0, Math.min(quantity, maxAllowed));
      return {
        ...c,
        allocations: { ...c.allocations, [deliverableName]: validQuantity }
      };
    }));
  };

  const inferTypeFromName = (name: string) => {
    const low = name.toLowerCase();
    if (low.includes('vídeo') || low.includes('video') || low.includes('edição')) return 'edicao';
    if (low.includes('arte') || low.includes('criativo')) return 'artes';
    if (low.includes('copy') || low.includes('texto')) return 'texto';
    if (low.includes('tráfego') || low.includes('trafego') || low.includes('campanha')) return 'campanhas';
    if (low.includes('planejamento')) return 'planejamento';
    if (low.includes('gravação')) return 'gravacao';
    return 'edicao'; // default fallback
  };

  const handleSave = async () => {
    if (!activeTenantId || !commitmentId || !journeyId) {
      showError("Dados insuficientes para criar o ciclo.");
      return;
    }
    if (!cycleName.trim()) {
      showError("O nome do ciclo é obrigatório.");
      return;
    }

    setSaving(true);
    try {
      const cycleId = crypto.randomUUID();

      // For each strategy case, we need to pick actual deliverable IDs from the available pool
      // So we must keep track of used IDs across cases
      const usedAvailableDeliverables = new Set<string>();

      const casesToInsert = [];

      for (const stCase of strategicCases) {
        if (!stCase.title.trim()) continue;

        // Prepare pending subtasks
        const pendingSubtasks = [];
        for (const [delivName, qty] of Object.entries(stCase.allocations)) {
          if (qty <= 0) continue;
          
          const balanceEntry = balances.find(b => b[0] === delivName)?.[1];
          if (!balanceEntry) continue;

          // Find available deliverables that we haven't used yet in this save operation
          const availableDelivs = balanceEntry.available.filter(d => !usedAvailableDeliverables.has(d.id));
          
          if (availableDelivs.length < qty) {
             throw new Error(`Saldo insuficiente de ${delivName} para o Case ${stCase.title}.`);
          }

          for (let i = 0; i < qty; i++) {
            const chosenD = availableDelivs[i];
            usedAvailableDeliverables.add(chosenD.id);
            
            pendingSubtasks.push({
              id: crypto.randomUUID(),
              title: `${delivName} - ${stCase.title}`,
              type: inferTypeFromName(delivName),
              deliverable_id: chosenD.id,
              status: 'pending',
              priority: false,
              post_date: datePosting || null
            });
          }
        }

        casesToInsert.push({
          tenant_id: activeTenantId,
          journey_id: journeyId,
          case_type: 'strategy',
          customer_entity_id: customerEntityId,
          title: stCase.title,
          status: 'open',
          state: 'planejado',
          meta_json: {
            customer_entity_name: customerEntityName,
            commitment_id: commitmentId,
            
            // Cycle Info
            cycle_id: cycleId,
            cycle_name: cycleName,
            cycle_start: cycleStart || null,
            cycle_end: cycleEnd || null,
            cycle_objective: cycleObjective || null,
            cycle_context: cycleContext || null,
            
            // Strategy Info
            strategy_title: stCase.title,
            strategy_objective: stCase.objective || null,
            strategy_context: stCase.context || null,
            
            // Pending Subtasks generated from deliverables
            pending_subtasks: pendingSubtasks,

            // Global cycle dates
            date_planning: datePlanning || null,
            date_recording: dateRecording || null,
            date_approval: dateApproval || null,
            date_posting: datePosting || null,
            date_report: dateReport || null,
          }
        });
      }

      if (casesToInsert.length === 0) {
        throw new Error("Nenhum case estratégico válido foi configurado.");
      }

      const { error, data: insertedCases } = await supabase.from("cases").insert(casesToInsert).select("id");
      if (error) throw error;

      if (insertedCases && insertedCases.length > 0) {
        const { data: userD } = await supabase.auth.getUser();
        const userId = userD.user?.id ?? null;
        
        const timelineLogs = insertedCases.map(c => ({
          tenant_id: activeTenantId,
          case_id: c.id,
          event_type: "case_created",
          actor_type: "admin",
          actor_id: userId,
          message: `Estratégia "${casesToInsert.find(cti => cti.title === casesToInsert[insertedCases.indexOf(c)].title)?.title || 'Novo ciclo'}" iniciada através do assistente de planejamento.`,
          occurred_at: new Date().toISOString()
        }));
        await supabase.from("timeline_events").insert(timelineLogs);
      }

      showSuccess(`Ciclo "${cycleName}" criado com sucesso! ${casesToInsert.length} Cases Estratégicos gerados.`);
      onSuccess();
      handleClose();
    } catch (e: any) {
      showError(e.message || "Erro ao salvar ciclo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v ? handleClose() : onOpenChange(v)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-slate-800">
            Planejar Ciclo
          </DialogTitle>
          <DialogDescription>
            Etapa {step} de 4
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-6">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Identificação do Ciclo</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Nome do Ciclo</Label>
                  <Input 
                    value={cycleName} 
                    onChange={e => setCycleName(e.target.value)} 
                    placeholder="Ex: Ciclo Setembro" 
                    className="font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data Inicial</Label>
                  <Input type="date" value={cycleStart} onChange={e => setCycleStart(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Data Final</Label>
                  <Input type="date" value={cycleEnd} onChange={e => setCycleEnd(e.target.value)} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Objetivo Principal</Label>
                  <Input value={cycleObjective} onChange={e => setCycleObjective(e.target.value)} placeholder="Ex: Aumentar captação de leads qualificados" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Contexto / Observações</Label>
                  <Textarea value={cycleContext} onChange={e => setCycleContext(e.target.value)} rows={3} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-6">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Saldo do Contrato</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {balances.map(([name, data]) => (
                  <Card key={name} className="p-4 rounded-2xl border-slate-200 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <PackageCheck className="h-4 w-4 text-blue-500" />
                      <h4 className="font-bold text-slate-800 text-sm truncate">{name}</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-50 p-2 rounded-lg text-center">
                        <span className="block text-slate-500 font-semibold mb-1">Contratado</span>
                        <span className="font-black text-slate-900">{data.total.length}</span>
                      </div>
                      <div className="bg-emerald-50 p-2 rounded-lg text-center">
                        <span className="block text-emerald-600 font-semibold mb-1">Concluído</span>
                        <span className="font-black text-emerald-700">{data.completed.length}</span>
                      </div>
                      <div className="bg-amber-50 p-2 rounded-lg text-center">
                        <span className="block text-amber-600 font-semibold mb-1">Já Alocado</span>
                        <span className="font-black text-amber-700">{data.allocated.length}</span>
                      </div>
                      <div className="bg-blue-50 p-2 rounded-lg text-center">
                        <span className="block text-blue-600 font-semibold mb-1">Disponível</span>
                        <span className="font-black text-blue-700 text-lg">{data.available.length}</span>
                      </div>
                    </div>
                  </Card>
                ))}
                {balances.length === 0 && (
                  <div className="col-span-full p-8 text-center text-slate-500">
                    Nenhum entregável encontrado neste contrato.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Cases Estratégicos</h3>
                <Button onClick={handleAddCase} size="sm" variant="outline" className="h-8 rounded-xl font-bold text-xs gap-2">
                  <Plus className="h-3 w-3" /> Adicionar Estratégia
                </Button>
              </div>
              
              <div className="space-y-4">
                {strategicCases.map((stCase, idx) => (
                  <Card key={stCase.id} className="p-4 rounded-2xl border-slate-200">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="font-black text-slate-800">Estratégia {idx + 1}</h4>
                      {strategicCases.length > 1 && (
                        <Button variant="ghost" size="sm" className="text-rose-500 h-6 w-6 p-0" onClick={() => handleRemoveCase(stCase.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label>Nome / Tema da Estratégia</Label>
                        <Input 
                          value={stCase.title} 
                          onChange={e => handleUpdateCase(stCase.id, 'title', e.target.value)}
                          placeholder="Ex: Saúde Felina"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Objetivo</Label>
                        <Input 
                          value={stCase.objective} 
                          onChange={e => handleUpdateCase(stCase.id, 'objective', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Alocação de Entregáveis</Label>
                        <div className="bg-slate-50 p-4 rounded-xl space-y-3">
                          {balances.map(([name, data]) => {
                            if (data.available.length === 0 && (stCase.allocations[name] || 0) === 0) return null;
                            const currentVal = stCase.allocations[name] || 0;
                            const totalAllocated = getTotalAllocated(name);
                            const remaining = data.available.length - totalAllocated + currentVal;
                            
                            return (
                              <div key={name} className="flex items-center justify-between gap-4">
                                <span className="text-sm font-semibold text-slate-700 truncate flex-1">{name}</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] text-slate-500 uppercase font-bold">Saldo Livre: {remaining}</span>
                                  <Input 
                                    type="number"
                                    min={0}
                                    max={remaining}
                                    value={currentVal}
                                    onChange={e => handleAllocationChange(stCase.id, name, parseInt(e.target.value) || 0)}
                                    className="w-20 text-center font-bold"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <div className="space-y-6">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Previsão de Datas (Opcional)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><CalendarIcon className="h-4 w-4" /> Planejamento</Label>
                  <Input type="date" value={datePlanning} onChange={e => setDatePlanning(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><CalendarIcon className="h-4 w-4" /> Gravação</Label>
                  <Input type="date" value={dateRecording} onChange={e => setDateRecording(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><CalendarIcon className="h-4 w-4" /> Previsão de Aprovação</Label>
                  <Input type="date" value={dateApproval} onChange={e => setDateApproval(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><CalendarIcon className="h-4 w-4" /> Datas de Postagem</Label>
                  <Input value={datePosting} onChange={e => setDatePosting(e.target.value)} placeholder="Ex: Tças e Qts" />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><CalendarIcon className="h-4 w-4" /> Relatório</Label>
                  <Input type="date" value={dateReport} onChange={e => setDateReport(e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-100">
          <Button 
            variant="ghost" 
            onClick={() => setStep(prev => prev - 1)} 
            disabled={step === 1 || saving}
            className="gap-2 font-bold"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Button>

          {step < 4 ? (
            <Button 
              onClick={() => {
                if (step === 1 && !cycleName.trim()) {
                  showError("O nome do ciclo é obrigatório.");
                  return;
                }
                setStep(prev => prev + 1);
              }}
              className="bg-slate-900 text-white font-bold gap-2 rounded-xl"
            >
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button 
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2 rounded-xl"
            >
              {saving ? 'Salvando...' : 'Finalizar e Criar Ciclo'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
