import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sparkles,
  Smartphone,
  Save,
  Bot,
  User,
  Clock,
  ArrowRight,
  Plus,
  RefreshCw,
  PlusCircle,
  MessageSquare,
  HelpCircle,
  BookOpen,
  BrainCircuit,
  Trash2,
} from "lucide-react";
import { WhatsAppConversation } from "@/components/case/WhatsAppConversation";
import { BeeIASimulator } from "@/components/case/BeeIASimulator";

type CaseRow = {
  id: string;
  customer_id: string | null;
  title: string | null;
  status: string;
  state: string;
  created_at: string;
  updated_at: string;
  assigned_user_id: string | null;
  meta_json?: any;
  customer_accounts?: {
    name: string | null;
    phone_e164: string;
  } | null;
  wa_messages?: {
    body_text: string | null;
    occurred_at: string;
  }[];
  beeia_paused?: boolean;
};

type WaInstanceRow = {
  id: string;
  name: string;
  status: string;
  phone_number: string | null;
  zapi_instance_id: string;
  beeia_enabled: boolean;
};

type BeeiaConfig = {
  system_prompt: string;
  target_stage: string;
  is_active?: boolean;
};

export default function BeeIA() {
  return (
    <RequireAuth>
      <BeeIAPage />
    </RequireAuth>
  );
}

function BeeIAPage() {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();
  const [activeTab, setActiveTab] = useState("crm");

  // State for config
  const [isActive, setIsActive] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [targetStage, setTargetStage] = useState("morno");
  const [savingConfig, setSavingConfig] = useState(false);

  // State for active case drawer
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Modal to add new Z-API Instance
  const [showAddNumber, setShowAddNumber] = useState(false);
  const [newInstName, setNewInstName] = useState("");
  const [newZapiId, setNewZapiId] = useState("");
  const [newZapiToken, setNewZapiToken] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [addingNumber, setAddingNumber] = useState(false);

  // 1. Fetch BeeIA Config
  const configQ = useQuery({
    queryKey: ["beeia_config", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beeia_configs")
        .select("system_prompt, target_stage, is_active")
        .eq("tenant_id", activeTenantId!)
        .maybeSingle();

      if (error) throw error;
      return data as BeeiaConfig | null;
    },
  });

  useEffect(() => {
    if (configQ.data) {
      setIsActive(configQ.data.is_active ?? true);
      setSystemPrompt(configQ.data.system_prompt);
      setTargetStage(configQ.data.target_stage);
    }
  }, [configQ.data]);

  // Learnings Query
  const learningsQ = useQuery({
    queryKey: ["beeia_learnings", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beeia_learnings")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  // 2. Fetch WhatsApp Instances
  const instancesQ = useQuery({
    queryKey: ["beeia_instances", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_instances")
        .select("id, name, status, phone_number, zapi_instance_id, beeia_enabled")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as WaInstanceRow[];
    },
  });

  // 3. Fetch cases in the beeia_crm journey
  const casesQ = useQuery({
    queryKey: ["beeia_cases", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data: journey } = await supabase
        .from("journeys")
        .select("id")
        .eq("key", "beeia_crm")
        .maybeSingle();

      if (!journey) return [] as CaseRow[];

      const { data, error } = await supabase
        .from("cases")
        .select(`
          id,
          customer_id,
          title,
          status,
          state,
          created_at,
          updated_at,
          assigned_user_id,
          meta_json,
          beeia_paused,
          customer_accounts:customer_id(name, phone_e164)
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("journey_id", journey.id)
        .eq("status", "open")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as any[];
      const enriched: CaseRow[] = await Promise.all(
        rows.map(async (c) => {
          const { data: lastMsg } = await supabase
            .from("wa_messages")
            .select("body_text, occurred_at")
            .eq("case_id", c.id)
            .order("occurred_at", { ascending: false })
            .limit(1);

          return {
            ...c,
            wa_messages: lastMsg ?? [],
          } as CaseRow;
        })
      );

      return enriched;
    },
  });

  const deleteLearningMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("beeia_learnings")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Aprendizado removido com sucesso!");
      qc.invalidateQueries({ queryKey: ["beeia_learnings", activeTenantId] });
    },
    onError: (err: any) => showError("Erro ao remover aprendizado: " + err.message)
  });

  // Toggle BeeIA on Instance
  const toggleBeeiaOnInstance = async (instanceId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from("wa_instances")
        .update({ beeia_enabled: enabled })
        .eq("id", instanceId)
        .eq("tenant_id", activeTenantId!);

      if (error) throw error;
      showSuccess(`BeeIA ${enabled ? "ativada" : "desativada"} no número.`);
      await qc.invalidateQueries({ queryKey: ["beeia_instances", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao alterar estado da IA: ${e.message}`);
    }
  };

  // Add new connection number
  const handleAddNumber = async () => {
    if (!newZapiId.trim() || !newZapiToken.trim()) {
      showError("ID da Instância e Token são obrigatórios.");
      return;
    }
    setAddingNumber(true);
    try {
      const { error } = await supabase.from("wa_instances").insert({
        tenant_id: activeTenantId!,
        name: newInstName.trim() || "Nova Conexão BeeIA",
        status: "active",
        zapi_instance_id: newZapiId.trim(),
        zapi_token_encrypted: newZapiToken.trim(),
        phone_number: newPhone.trim() || null,
        webhook_secret: crypto.randomUUID(),
        beeia_enabled: true,
      });

      if (error) throw error;
      showSuccess("Instância Z-API cadastrada com sucesso!");
      setShowAddNumber(false);
      setNewInstName("");
      setNewZapiId("");
      setNewZapiToken("");
      setNewPhone("");
      await qc.invalidateQueries({ queryKey: ["beeia_instances", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao cadastrar número: ${e.message}`);
    } finally {
      setAddingNumber(false);
    }
  };

  // Save Config
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const { error } = await supabase
        .from("beeia_configs")
        .upsert(
          {
            tenant_id: activeTenantId!,
            system_prompt: systemPrompt,
            target_stage: targetStage,
            is_active: isActive,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id" }
        );

      if (error) throw error;
      showSuccess("Configurações da BeeIA salvas com sucesso!");
      await qc.invalidateQueries({ queryKey: ["beeia_config", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao salvar configurações: ${e.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  // Move manual state
  const handleMoveState = async (caseId: string, nextState: string) => {
    try {
      const { error } = await supabase
        .from("cases")
        .update({ state: nextState, updated_at: new Date().toISOString() })
        .eq("id", caseId);

      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["beeia_cases", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao mover estágio: ${e.message}`);
    }
  };

  // Kanban Columns
  const columns = [
    { key: "contato", label: "1º Contato", color: "border-t-amber-400 bg-amber-500/5" },
    { key: "pausadas", label: "Pausadas", color: "border-t-yellow-600 bg-yellow-500/5" },
    { key: "morno", label: "Morno", color: "border-t-orange-400 bg-orange-500/5" },
    { key: "quente", label: "Quente", color: "border-t-rose-500 bg-rose-500/5" },
    { key: "frio", label: "Frio", color: "border-t-slate-400 bg-slate-500/5" },
  ];

  const casesByColumn = useMemo(() => {
    const list = casesQ.data ?? [];
    const map: Record<string, CaseRow[]> = {
      contato: [],
      pausadas: [],
      morno: [],
      quente: [],
      frio: [],
    };
    list.forEach((c) => {
      if (c.beeia_paused) {
        map.pausadas.push(c);
      } else if (map[c.state]) {
        map[c.state].push(c);
      } else {
        map.contato.push(c);
      }
    });
    return map;
  }, [casesQ.data]);

  return (
    <AppShell>
      <div className="flex flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                <Sparkles className="h-5 w-5" />
              </span>
              BeeIA — Pré-atendimento Inteligente
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Gerencie a IA de pré-atendimento comercial da M30 e acompanhe os contatos qualificados.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                casesQ.refetch();
                instancesQ.refetch();
              }}
              className="rounded-xl"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4 grid w-full max-w-[600px] grid-cols-3 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
            <TabsTrigger value="crm" className="rounded-xl py-2 text-xs font-semibold">
              Fluxo CRM
            </TabsTrigger>
            <TabsTrigger value="simulador" className="rounded-xl py-2 text-xs font-semibold">
              Simulador
            </TabsTrigger>
            <TabsTrigger value="settings" className="rounded-xl py-2 text-xs font-semibold">
              Configurações & Treino
            </TabsTrigger>
          </TabsList>

          {/* Tab Content: Kanban Board */}
          <TabsContent value="crm" className="mt-0">
            {casesQ.isLoading ? (
              <div className="flex h-[400px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-amber-500 dark:border-slate-800" />
              </div>
            ) : (
              <div className="grid h-full min-h-[500px] gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {columns.map((col) => {
                  const colCases = casesByColumn[col.key] ?? [];
                  return (
                    <div
                      key={col.key}
                      className={`flex flex-col rounded-[22px] border border-slate-200/80 border-t-4 p-4 dark:border-slate-800 ${col.color}`}
                    >
                      {/* Column Header */}
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                          {col.label}
                        </span>
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700 dark:bg-slate-850 dark:text-slate-300">
                          {colCases.length}
                        </span>
                      </div>

                      {/* Cases list */}
                      <div className="flex flex-1 flex-col gap-2 overflow-y-auto max-h-[70vh]">
                        {colCases.length === 0 ? (
                          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/50 p-6 text-center text-slate-400 dark:border-slate-800/40">
                            <Bot className="mb-2 h-5 w-5 opacity-40" />
                            <p className="text-[10px]">Sem leads nesta etapa</p>
                          </div>
                        ) : (
                          colCases.map((c) => {
                            const lastMsg = c.wa_messages?.[0];
                            const phone = c.customer_accounts?.phone_e164 ?? "";
                            const name = c.customer_accounts?.name ?? "Contato sem nome";

                            return (
                              <Card
                                key={c.id}
                                className="group relative flex cursor-pointer flex-col rounded-2xl border-slate-200/60 p-3.5 hover:border-amber-200 hover:shadow-sm dark:border-slate-850 dark:hover:border-amber-950/60"
                                onClick={() => setSelectedCaseId(c.id)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                                    {name}
                                  </div>
                                  {c.state === "contato" && (
                                    <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" title="IA ativamente respondendo" />
                                  )}
                                </div>
                                <div className="mt-1 text-[10px] text-slate-400 font-mono">
                                  {phone}
                                </div>

                                {lastMsg ? (
                                  <div className="mt-2 line-clamp-2 text-[11px] text-slate-600 dark:text-slate-400">
                                    {lastMsg.body_text}
                                  </div>
                                ) : (
                                  <div className="mt-2 text-[10px] italic text-slate-400">
                                    Sem mensagens gravadas
                                  </div>
                                )}

                                {/* Card Footer / Movement controls */}
                                <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-850">
                                  <div className="text-[9px] text-slate-400">
                                    {new Date(c.updated_at).toLocaleDateString("pt-BR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                    {col.key === "contato" && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-950/40 hover:text-amber-700"
                                        onClick={() => handleMoveState(c.id, "morno")}
                                        title="Mover para Morno"
                                      >
                                        <ArrowRight className="h-3 w-3" />
                                      </Button>
                                    )}
                                    {col.key === "morno" && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-950/40 hover:text-orange-700"
                                        onClick={() => handleMoveState(c.id, "quente")}
                                        title="Mover para Quente"
                                      >
                                        <ArrowRight className="h-3 w-3" />
                                      </Button>
                                    )}
                                    {col.key === "quente" && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/40 hover:text-rose-700"
                                        onClick={() => handleMoveState(c.id, "frio")}
                                        title="Mover para Frio"
                                      >
                                        <ArrowRight className="h-3 w-3" />
                                      </Button>
                                    )}
                                    {col.key === "frio" && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-950/40 hover:text-amber-700"
                                        onClick={() => handleMoveState(c.id, "contato")}
                                        title="Reiniciar em Contato"
                                      >
                                        <RefreshCw className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </Card>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Tab Content: Settings & Training */}
          <TabsContent value="settings" className="mt-0">
            <div className="grid gap-6 lg:grid-cols-3">
              
              {/* Global Toggle & AI Instructions */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                {/* Master Switch */}
                <Card className="rounded-[22px] border-slate-200/80 p-5 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${isActive ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                        <BrainCircuit className="h-5 w-5" />
                      </span>
                      <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          Status Global da BeeIA
                        </h2>
                        <p className="text-xs text-slate-500">
                          {isActive 
                            ? "A IA está ativa e responderá automaticamente em novas mensagens." 
                            : "A IA está desativada. Nenhuma mensagem automática será enviada."}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={isActive} 
                        onCheckedChange={setIsActive} 
                        className="data-[state=checked]:bg-amber-500" 
                      />
                    </div>
                  </div>
                </Card>

                <Card className="rounded-[22px] border-slate-200/80 p-5 dark:border-slate-800">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-850">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                      <Bot className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Treinamento & Personalidade da IA
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Defina o contexto do negócio, regras de atendimento e como a IA deve qualificar o cliente.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                        Prompt de Sistema (Base de Conhecimento)
                      </label>
                      <Textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        placeholder="Ex: Você é a BeeIA, atendente da M30 Hives. Nós vendemos mel puro de abelhas nativas por R$ 45 o pote..."
                        rows={12}
                        className="rounded-xl border-slate-200 text-xs font-sans placeholder:text-slate-400 focus:border-amber-400 focus:ring-amber-400 dark:border-slate-850"
                      />
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <HelpCircle className="h-3 w-3" />
                        Dica: Descreva detalhadamente seus produtos, preços e o tom de voz desejado.
                      </span>
                    </div>

                    {/* Memória Contínua (Aprendizados do Simulador) */}
                    <div className="flex flex-col gap-2 mt-2 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                      <div className="flex items-center gap-2 mb-1">
                        <BrainCircuit className="h-4 w-4 text-indigo-500" />
                        <label className="text-xs font-bold uppercase text-indigo-700 dark:text-indigo-400 tracking-wider">
                          Memória de Treinamentos (Regras Adicionais)
                        </label>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                        Estes são aprendizados salvos automaticamente pela IA durante as simulações no Modo Treinador.
                        Eles são adicionados ao final do Prompt de Sistema.
                      </p>
                      
                      <div className="flex flex-col gap-2">
                        {learningsQ.isLoading ? (
                          <div className="text-xs text-slate-400">Carregando memória...</div>
                        ) : learningsQ.data?.length === 0 ? (
                          <div className="text-xs text-slate-400 italic">Nenhuma regra extra salva. Use o Simulador (Modo Treinador) para treinar a IA.</div>
                        ) : (
                          learningsQ.data?.map((l: any, i: number) => (
                            <div key={l.id} className="flex items-start gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm group">
                              <span className="text-xs font-semibold text-indigo-400 mt-0.5 min-w-[20px]">{i + 1}.</span>
                              <div className="flex-1 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                                {l.learning_text}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 -mt-1 -mr-1"
                                onClick={() => deleteLearningMut.mutate(l.id)}
                                disabled={deleteLearningMut.isPending}
                                title="Esquecer esta regra"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 mt-2">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                          Etapa de Direcionamento (Próximo Passo)
                        </label>
                        <Select value={targetStage} onValueChange={setTargetStage}>
                          <SelectTrigger className="rounded-xl border-slate-200 text-xs dark:border-slate-850 focus:border-amber-400 focus:ring-amber-400">
                            <SelectValue placeholder="Selecione o estágio" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="morno" className="text-xs">Morno</SelectItem>
                            <SelectItem value="quente" className="text-xs">Quente</SelectItem>
                            <SelectItem value="frio" className="text-xs">Frio</SelectItem>
                          </SelectContent>
                        </Select>
                        <span className="text-[10px] text-slate-400">
                          A etapa do CRM para onde a IA enviará o lead após a qualificação técnica.
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 flex justify-end">
                      <Button
                        onClick={handleSaveConfig}
                        disabled={savingConfig}
                        className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-4"
                      >
                        <Save className="mr-1.5 h-3.5 w-3.5" /> Salvar Configurações
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Connected Numbers (Instances) */}
              <div className="flex flex-col gap-4">
                <Card className="rounded-[22px] border-slate-200/80 p-5 dark:border-slate-800">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-850">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                        <Smartphone className="h-4.5 w-4.5" />
                      </span>
                      <div>
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Zangões (Números)
                        </h2>
                        <p className="text-[11px] text-slate-500">
                          Habilite a BeeIA nos números cadastrados.
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowAddNumber(true)}
                      className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-900 dark:hover:bg-slate-850"
                      title="Cadastrar Novo Número"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-4 flex flex-col gap-3">
                    {instancesQ.isLoading ? (
                      <div className="flex h-20 items-center justify-center">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-amber-500" />
                      </div>
                    ) : (instancesQ.data ?? []).length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400">
                        <Smartphone className="mb-2 h-6 w-6 opacity-30" />
                        <p className="text-xs">Nenhuma instância cadastrada.</p>
                        <Button
                          variant="link"
                          onClick={() => setShowAddNumber(true)}
                          className="mt-1 h-auto p-0 text-xs text-amber-500 font-semibold"
                        >
                          Conectar primeira conta Z-API
                        </Button>
                      </div>
                    ) : (
                      (instancesQ.data ?? []).map((inst) => (
                        <div
                          key={inst.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-150 bg-slate-50/50 p-3 dark:border-slate-850 dark:bg-slate-900/30"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {inst.name}
                            </div>
                            <div className="mt-0.5 font-mono text-[9px] text-slate-400">
                              {inst.phone_number ? inst.phone_number : "Sem número cadastrado"}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  inst.status === "active" ? "bg-emerald-500" : "bg-rose-500"
                                }`}
                              />
                              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                                {inst.status === "active" ? "Conectado" : "Pausado/Erro"}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">
                              BeeIA
                            </span>
                            <Switch
                              checked={inst.beeia_enabled}
                              onCheckedChange={(val) => toggleBeeiaOnInstance(inst.id, val)}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Tab Content: Simulador */}
          <TabsContent value="simulador" className="mt-0">
            <BeeIASimulator />
          </TabsContent>
        </Tabs>

        {/* Modal: Add WhatsApp Number */}
        {showAddNumber && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <Card className="w-full max-w-[450px] rounded-[22px] border-slate-200/80 p-5 shadow-lg animate-in fade-in zoom-in-95 duration-150 dark:border-slate-800">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-850">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Cadastrar Conta WhatsApp (Z-API)
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddNumber(false)}
                  className="h-8 rounded-xl px-2 text-xs text-slate-400 hover:bg-slate-100"
                >
                  Fechar
                </Button>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    Apelido do Número
                  </label>
                  <Input
                    value={newInstName}
                    onChange={(e) => setNewInstName(e.target.value)}
                    placeholder="Ex: Comercial 01, Suporte..."
                    className="rounded-xl border-slate-200 text-xs dark:border-slate-850"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    Z-API Instance ID
                  </label>
                  <Input
                    value={newZapiId}
                    onChange={(e) => setNewZapiId(e.target.value)}
                    placeholder="Instance ID fornecido pela Z-API"
                    className="rounded-xl border-slate-200 text-xs dark:border-slate-850"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    Z-API Token
                  </label>
                  <Input
                    value={newZapiToken}
                    onChange={(e) => setNewZapiToken(e.target.value)}
                    placeholder="Token fornecido pela Z-API"
                    type="password"
                    className="rounded-xl border-slate-200 text-xs dark:border-slate-850"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    Telefone WhatsApp (E.164)
                  </label>
                  <Input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Ex: +5511999999999"
                    className="rounded-xl border-slate-200 text-xs dark:border-slate-850"
                  />
                </div>

                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowAddNumber(false)}
                    className="rounded-xl text-xs font-semibold"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleAddNumber}
                    disabled={addingNumber}
                    className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs"
                  >
                    {addingNumber ? "Salvando…" : "Cadastrar Número"}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Drawer/Sheet: WhatsApp Chat Viewer */}
        <Sheet open={Boolean(selectedCaseId)} onOpenChange={(open) => !open && setSelectedCaseId(null)}>
          <SheetContent side="right" className="w-full sm:max-w-[550px] p-0 flex flex-col h-full rounded-l-[30px] border-slate-200 dark:border-slate-850">
            <div className="flex flex-col h-full">
              <SheetHeader className="p-4 border-b border-slate-100 dark:border-slate-850">
                <div className="flex items-center justify-between">
                  <SheetTitle className="text-sm font-bold text-slate-900 dark:text-slate-50">
                    Conversa em Andamento
                  </SheetTitle>
                </div>
              </SheetHeader>
              
              <div className="flex-1 overflow-hidden">
                {selectedCaseId && (
                  <WhatsAppConversation caseId={selectedCaseId} className="h-full" />
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </AppShell>
  );
}
