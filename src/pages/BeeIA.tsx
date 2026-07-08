import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
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
  CreditCard,
  Coins,
  Search,
  Calendar,
  ChevronDown,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  X,
  Webhook,
  Bell
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
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
  beeia_test_numbers?: string[] | null;
  allowed_user_ids: string[] | null;
  webhook_secret: string | null;
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
  const { user } = useSession();
  const isSuperAdmin = (user as any)?.app_metadata?.role === "super-admin";
  const [activeTab, setActiveTab] = useState("crm");

  // State for config
  const [isActive, setIsActive] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [targetStage, setTargetStage] = useState("morno");
  const [savingConfig, setSavingConfig] = useState(false);

  // State for active case drawer
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Feature: selection, export and learning extraction
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [extractingLearnings, setExtractingLearnings] = useState(false);
  const [showLearningsDialog, setShowLearningsDialog] = useState(false);
  const [proposedLearnings, setProposedLearnings] = useState<string[]>([]);

  // Modal to add new Z-API Instance
  const [showAddNumber, setShowAddNumber] = useState(false);
  const [newInstName, setNewInstName] = useState("");
  const [newZapiId, setNewZapiId] = useState("");
  const [newZapiToken, setNewZapiToken] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [addingNumber, setAddingNumber] = useState(false);

  // Access control permissions state
  const [permissionsInstance, setPermissionsInstance] = useState<WaInstanceRow | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [savingPermissions, setSavingPermissions] = useState(false);

  // Test numbers state
  const [testNumbersInstance, setTestNumbersInstance] = useState<WaInstanceRow | null>(null);
  const [testNumbersInput, setTestNumbersInput] = useState("");
  const [savingTestNumbers, setSavingTestNumbers] = useState(false);

  // Prompt versioning state
  const [changeDescription, setChangeDescription] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<any | null>(null);

  // Persistent Filter states
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem("beeia_filter_search") || "");
  const [viewMode, setViewMode] = useState<"kanban" | "list">(() => (localStorage.getItem("beeia_filter_view") as "kanban" | "list") || "kanban");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePreset, setDatePreset] = useState<string>(() => localStorage.getItem("beeia_filter_preset") || "todo_periodo");
  const [startDate, setStartDate] = useState<Date | null>(() => {
    const val = localStorage.getItem("beeia_filter_start");
    return val ? new Date(val) : null;
  });
  const [endDate, setEndDate] = useState<Date | null>(() => {
    const val = localStorage.getItem("beeia_filter_end");
    return val ? new Date(val) : null;
  });
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());

  useEffect(() => {
    localStorage.setItem("beeia_filter_search", searchQuery);
    localStorage.setItem("beeia_filter_view", viewMode);
    localStorage.setItem("beeia_filter_preset", datePreset);
    if (startDate) {
      localStorage.setItem("beeia_filter_start", startDate.toISOString());
    } else {
      localStorage.removeItem("beeia_filter_start");
    }
    if (endDate) {
      localStorage.setItem("beeia_filter_end", endDate.toISOString());
    } else {
      localStorage.removeItem("beeia_filter_end");
    }
  }, [searchQuery, viewMode, datePreset, startDate, endDate]);

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

  // Plugs, Journeys, Processes, and Link Groups Queries/Mutations
  const plugsQ = useQuery({
    queryKey: ["beeia_plugs", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beeia_plugs")
        .select("*")
        .eq("tenant_id", activeTenantId!);
      if (error) throw error;
      return data || [];
    }
  });

  const savePlugMut = useMutation({
    mutationFn: async ({ plugKey, isEnabled, configJson }: { plugKey: string, isEnabled: boolean, configJson: any }) => {
      const { error } = await supabase
        .from("beeia_plugs")
        .upsert({
          tenant_id: activeTenantId!,
          plug_key: plugKey,
          is_enabled: isEnabled,
          config_json: configJson,
          updated_at: new Date().toISOString()
        }, { onConflict: "tenant_id,plug_key" });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Configurações do plugue salvas com sucesso!");
      qc.invalidateQueries({ queryKey: ["beeia_plugs", activeTenantId] });
    },
    onError: (err: any) => {
      showError("Erro ao salvar plugue: " + err.message);
    }
  });

  const journeysOptionsQ = useQuery({
    queryKey: ["beeia_journeys_options", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journeys")
        .select("id, name, key")
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  const linkGroupsOptionsQ = useQuery({
    queryKey: ["beeia_link_groups_options", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("link_manager_groups")
        .select("id, name, slug")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  const processesOptionsQ = useQuery({
    queryKey: ["beeia_processes_options", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processes")
        .select("id, title")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("title", { ascending: true });
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
        .select("id, name, status, phone_number, zapi_instance_id, beeia_enabled, beeia_test_numbers, allowed_user_ids, webhook_secret")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as WaInstanceRow[];
    },
  });

  // Fetch tenant users profile
  const tenantUsersQ = useQuery({
    queryKey: ["beeia_tenant_users", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id, display_name, email, role")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    }
  });

  // Handle saving access permissions
  const handleSavePermissions = async () => {
    if (!permissionsInstance) return;
    setSavingPermissions(true);
    try {
      const { error } = await supabase
        .from("wa_instances")
        .update({
          allowed_user_ids: selectedUserIds.length > 0 ? selectedUserIds : null,
          updated_at: new Date().toISOString()
        })
        .eq("id", permissionsInstance.id);

      if (error) throw error;
      showSuccess("Permissões de acesso atualizadas com sucesso!");
      setPermissionsInstance(null);
      await instancesQ.refetch();
    } catch (e: any) {
      showError(`Falha ao salvar permissões: ${e.message}`);
    } finally {
      setSavingPermissions(false);
    }
  };

  const handleSaveTestNumbers = async () => {
    if (!testNumbersInstance) return;
    setSavingTestNumbers(true);
    try {
      const numbers = testNumbersInput
        .split(",")
        .map(n => n.trim().replace(/\D/g, ""))
        .filter(n => n.length >= 10);

      const { error } = await supabase
        .from("wa_instances")
        .update({
          beeia_test_numbers: numbers,
          updated_at: new Date().toISOString()
        })
        .eq("id", testNumbersInstance.id);

      if (error) throw error;
      showSuccess("Números de teste atualizados com sucesso!");
      setTestNumbersInstance(null);
      await instancesQ.refetch();
    } catch (e: any) {
      showError(`Falha ao salvar números de teste: ${e.message}`);
    } finally {
      setSavingTestNumbers(false);
    }
  };

  // 2.5 Fetch Prompt Versions
  const promptVersionsQ = useQuery({
    queryKey: ["beeia_prompt_versions", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beeia_prompt_versions")
        .select("id, version, prompt_text, description, created_at, created_by")
        .eq("tenant_id", activeTenantId!)
        .order("version", { ascending: false });

      if (error) throw error;
      return data ?? [];
    }
  });

  // Bootstrap prompt version 1 if config exists but no versions yet
  useEffect(() => {
    if (
      activeTenantId &&
      configQ.data?.system_prompt &&
      promptVersionsQ.isSuccess &&
      promptVersionsQ.data.length === 0
    ) {
      supabase
        .from("beeia_prompt_versions")
        .insert({
          tenant_id: activeTenantId,
          prompt_text: configQ.data.system_prompt,
          version: 1,
          description: "Prompt inicial (importado automaticamente)",
        })
        .then(() => {
          qc.invalidateQueries({ queryKey: ["beeia_prompt_versions", activeTenantId] });
        });
    }
  }, [activeTenantId, configQ.data?.system_prompt, promptVersionsQ.isSuccess, promptVersionsQ.data?.length]);

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

  // 4. Fetch AI billing logs
  const [selectedSimulatorSessionId, setSelectedSimulatorSessionId] = useState<string | null>(null);

  const billingQ = useQuery({
    queryKey: ["beeia_billing", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usage_events")
        .select("id, qty, ref_id, ref_type, meta_json, occurred_at")
        .eq("tenant_id", activeTenantId!)
        .eq("type", "ai_token")
        .order("occurred_at", { ascending: false });

      if (error) throw error;
      
      const uniqueCaseIds = Array.from(new Set(
        (data ?? [])
          .filter(row => row.ref_type !== "beeia_simulation" && row.ref_id)
          .map(row => row.ref_id)
      )) as string[];
      
      const phoneNumbersToLookup = new Set<string>();
      (data ?? []).forEach(row => {
        if (!row.ref_id && String(row.meta_json?.description ?? "").startsWith("BeeIA: Resposta para")) {
          const match = String(row.meta_json?.description || "").match(/Resposta para (\+?\d+)/);
          if (match) {
            phoneNumbersToLookup.add(match[1]);
          }
        }
      });
      
      const casesMap = new Map<string, { title: string, name: string, phone: string }>();
      const phoneToCaseMap = new Map<string, { caseId: string, name: string, phone: string, title: string }>();

      if (uniqueCaseIds.length > 0) {
        const { data: casesData } = await supabase
          .from("cases")
          .select("id, title, customer_accounts:customer_id(name, phone_e164)")
          .in("id", uniqueCaseIds);
        
        casesData?.forEach((c: any) => {
          casesMap.set(c.id, {
            title: c.title || "",
            name: c.customer_accounts?.name || "",
            phone: c.customer_accounts?.phone_e164 || "",
          });
        });
      }

      if (phoneNumbersToLookup.size > 0) {
        const phoneList = Array.from(phoneNumbersToLookup);
        const { data: customers } = await supabase
          .from("customer_accounts")
          .select("id, name, phone_e164, cases(id, title)")
          .eq("tenant_id", activeTenantId!)
          .in("phone_e164", phoneList);

        customers?.forEach((cust: any) => {
          const latestCase = cust.cases?.[0];
          if (latestCase) {
            phoneToCaseMap.set(cust.phone_e164, {
              caseId: latestCase.id,
              name: cust.name || "",
              phone: cust.phone_e164,
              title: latestCase.title || "",
            });
          }
        });
      }
      
      const groups: Record<string, {
        caseId: string | null;
        totalTokens: number;
        totalCostUsd: number;
        lastOccurred: string;
        description: string;
        title?: string;
        name?: string;
        phone?: string;
        isSimulation: boolean;
      }> = {};

      let grandTotalTokens = 0;
      let grandTotalCostUsd = 0;

      for (const row of (data ?? [])) {
        const description = String(row.meta_json?.description ?? "");
        const isBeeia = description.startsWith("BeeIA:") || description === "Simulador BeeIA";
        if (!isBeeia) continue;

        const isSimulation = row.ref_type === "beeia_simulation" || description === "Simulador BeeIA";
        const tokens = row.qty || 0;
        const costUsd = Number(row.meta_json?.cost_usd || (tokens * 0.0000003));
        
        grandTotalTokens += tokens;
        grandTotalCostUsd += costUsd;

        let refId = row.ref_id;
        let caseInfo = null;

        if (isSimulation) {
          refId = row.ref_id || "simulation_fallback";
        } else {
          if (refId) {
            caseInfo = casesMap.get(refId);
          } else {
            const match = description.match(/Resposta para (\+?\d+)/);
            if (match) {
              const phone = match[1];
              const resolved = phoneToCaseMap.get(phone);
              if (resolved) {
                refId = resolved.caseId;
                caseInfo = {
                  title: resolved.title,
                  name: resolved.name,
                  phone: resolved.phone,
                };
              }
            }
          }
        }

        const groupKey = refId || `unknown_${row.id}`;

        if (!groups[groupKey]) {
          groups[groupKey] = {
            caseId: refId,
            totalTokens: 0,
            totalCostUsd: 0,
            lastOccurred: row.occurred_at,
            description: row.meta_json?.description || "Análise/Outro",
            title: caseInfo?.title,
            name: caseInfo?.name,
            phone: caseInfo?.phone || (description.match(/Resposta para (\+?\d+)/)?.[1]),
            isSimulation,
          };
        }

        groups[groupKey].totalTokens += tokens;
        groups[groupKey].totalCostUsd += costUsd;
      }

      const details = Object.values(groups).sort((a, b) => b.totalTokens - a.totalTokens);

      return {
        grandTotalTokens,
        grandTotalCostUsd,
        details
      };
    }
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

  // Toggle Master Switch instantly
  const handleToggleGlobalSwitch = async (newVal: boolean) => {
    setIsActive(newVal);
    try {
      const { error } = await supabase
        .from("beeia_configs")
        .upsert(
          {
            tenant_id: activeTenantId!,
            system_prompt: systemPrompt,
            target_stage: targetStage,
            is_active: newVal,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id" }
        );
      
      if (error) throw error;
      showSuccess(`IA Global ${newVal ? "Ativada" : "Desativada"}!`);
      await qc.invalidateQueries({ queryKey: ["beeia_config", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao alterar status global: ${e.message}`);
      setIsActive(!newVal); // revert
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

      // Save prompt version
      const currentVersions = promptVersionsQ.data || [];
      const nextVersion = currentVersions.length > 0 ? Math.max(...currentVersions.map((v: any) => v.version)) + 1 : 1;

      const { error: versionErr } = await supabase
        .from("beeia_prompt_versions")
        .insert({
          tenant_id: activeTenantId!,
          prompt_text: systemPrompt,
          version: nextVersion,
          description: changeDescription.trim() || `Alteração da versão ${nextVersion}`,
        });

      if (versionErr) throw versionErr;

      setChangeDescription("");
      showSuccess("Configurações e versão do prompt salvas com sucesso!");
      
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["beeia_config", activeTenantId] }),
        qc.invalidateQueries({ queryKey: ["beeia_prompt_versions", activeTenantId] }),
      ]);
    } catch (e: any) {
      showError(`Falha ao salvar configurações: ${e.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  // Move manual state
  const handleMoveState = async (caseId: string, nextState: string) => {
    try {
      const updatePayload: any = { updated_at: new Date().toISOString() };
      
      if (nextState === "pausadas") {
        updatePayload.beeia_paused = true;
      } else {
        updatePayload.beeia_paused = false;
        updatePayload.state = nextState;
      }

      const { error } = await supabase
        .from("cases")
        .update(updatePayload)
        .eq("id", caseId);

      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["beeia_cases", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao mover estágio: ${e.message}`);
    }
  };

  const handleMassMoveState = async (caseIds: string[], nextState: string) => {
    try {
      if (!caseIds.length) return;
      const updatePayload: any = { updated_at: new Date().toISOString() };
      
      if (nextState === "pausadas") {
        updatePayload.beeia_paused = true;
      } else {
        updatePayload.beeia_paused = false;
        updatePayload.state = nextState;
      }

      const { error } = await supabase
        .from("cases")
        .update(updatePayload)
        .in("id", caseIds);

      if (error) throw error;
      setSelectedCaseIds([]);
      showSuccess(`${caseIds.length} leads movidos com sucesso!`);
      await qc.invalidateQueries({ queryKey: ["beeia_cases", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao mover estágios em massa: ${e.message}`);
    }
  };

  // Kanban Columns
  const columns = [
    { key: "contato", label: "1º Contato", color: "border-t-amber-400 bg-amber-500/5" },
    { key: "morno", label: "Morno", color: "border-t-orange-400 bg-orange-500/5" },
    { key: "quente", label: "Quente", color: "border-t-rose-500 bg-rose-500/5" },
    { key: "frio", label: "Frio", color: "border-t-slate-400 bg-slate-500/5" },
    { key: "pausadas", label: "Pausadas", color: "border-t-yellow-600 bg-yellow-500/5" },
  ];

  // Helper to check if two dates are same calendar day
  const isSameDay = (d1: Date | null, d2: Date | null) => {
    if (!d1 || !d2) return false;
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
  };

  // Helper to check if day is inside date range
  const isBetweenDays = (day: Date, start: Date | null, end: Date | null) => {
    if (!start || !end) return false;
    const dTime = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const sTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const eTime = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
    return dTime >= sTime && dTime <= eTime;
  };

  // Helper to generate calendar days for date picker
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Date[] = [];
    const startOffset = firstDay.getDay();

    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      days.push(new Date(year, month - 1, prevMonthLastDay - i));
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }

    const totalCells = Math.ceil(days.length / 7) * 7;
    const remaining = totalCells - days.length;
    for (let d = 1; d <= remaining; d++) {
      days.push(new Date(year, month + 1, d));
    }
    return days;
  };

  const applyPreset = (preset: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let start: Date | null = null;
    let end: Date | null = null;

    if (preset === "hoje") {
      start = new Date(today);
      end = new Date(today);
      end.setHours(23, 59, 59, 999);
    } else if (preset === "ontem") {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      start = new Date(yesterday);
      end = new Date(yesterday);
      end.setHours(23, 59, 59, 999);
    } else if (preset === "7_dias") {
      start = new Date(today);
      start.setDate(start.getDate() - 6);
      end = new Date(today);
      end.setHours(23, 59, 59, 999);
    } else if (preset === "30_dias") {
      start = new Date(today);
      start.setDate(start.getDate() - 29);
      end = new Date(today);
      end.setHours(23, 59, 59, 999);
    } else if (preset === "mes_atual") {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    } else if (preset === "mes_passado") {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
    } else if (preset === "todo_periodo") {
      start = null;
      end = null;
    }

    setStartDate(start);
    setEndDate(end);
    setDatePreset(preset);
  };

  const getPresetLabel = () => {
    if (datePreset === "hoje") return "Hoje";
    if (datePreset === "ontem") return "Ontem";
    if (datePreset === "7_dias") return "Últimos 7 Dias";
    if (datePreset === "30_dias") return "Últimos 30 Dias";
    if (datePreset === "mes_atual") return "Mês Atual";
    if (datePreset === "mes_passado") return "Mês Passado";
    if (datePreset === "todo_periodo") return "Todo o Período";
    if (startDate && endDate) {
      return `${startDate.toLocaleDateString("pt-BR")} - ${endDate.toLocaleDateString("pt-BR")}`;
    }
    return "Filtrar por Período";
  };

  const prevCalendarMonth = () => {
    const prev = new Date(calendarMonth);
    prev.setMonth(prev.getMonth() - 1);
    setCalendarMonth(prev);
  };

  const nextCalendarMonth = () => {
    const next = new Date(calendarMonth);
    next.setMonth(next.getMonth() + 1);
    setCalendarMonth(next);
  };

  const handleDayClick = (day: Date) => {
    if (!startDate || (startDate && endDate)) {
      setStartDate(day);
      setEndDate(null);
    } else {
      if (day < startDate) {
        setStartDate(day);
      } else {
        const endOfDay = new Date(day);
        endOfDay.setHours(23, 59, 59, 999);
        setEndDate(endOfDay);
        setShowDatePicker(false);
      }
    }
    setDatePreset("custom");
  };

  const renderMonthCalendar = (monthDate: Date) => {
    const days = getDaysInMonth(monthDate);
    const monthName = monthDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const weekDays = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

    return (
      <div className="flex-1 min-w-[220px]">
        <div className="text-center text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-3">
          {monthName}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-bold text-slate-400 mb-1 uppercase">
          {weekDays.map((d, idx) => (
            <div key={idx} className="h-6 w-6 flex items-center justify-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, idx) => {
            const isCurrentMonth = day.getMonth() === monthDate.getMonth();
            const isSelected = isSameDay(day, startDate) || isSameDay(day, endDate);
            const isBetween = isBetweenDays(day, startDate, endDate);
            
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleDayClick(day)}
                className={cn(
                  "h-7 w-7 rounded-lg text-[11px] font-semibold flex items-center justify-center transition-all",
                  !isCurrentMonth 
                    ? "text-slate-355 text-slate-300 dark:text-slate-700 pointer-events-none opacity-45" 
                    : "text-slate-700 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-900/50",
                  isSelected && "bg-amber-500 text-white hover:bg-amber-600 font-bold shadow-xs",
                  isBetween && !isSelected && "bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 font-medium rounded-none"
                )}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Filtered cases list based on search query & date range (last message / session activity)
  const filteredCases = useMemo(() => {
    let list = casesQ.data ?? [];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((c) => {
        const name = (c.customer_accounts?.name || "").toLowerCase();
        const phone = (c.customer_accounts?.phone_e164 || "").toLowerCase();
        const lastMsgText = (c.wa_messages?.[0]?.body_text || "").toLowerCase();
        return name.includes(q) || phone.includes(q) || lastMsgText.includes(q);
      });
    }

    // Date range filter based on last conversation activity
    if (startDate || endDate) {
      list = list.filter((c) => {
        const activityTime = c.wa_messages?.[0]?.occurred_at 
          ? new Date(c.wa_messages[0].occurred_at) 
          : new Date(c.updated_at);
        
        if (startDate && endDate) {
          return activityTime >= startDate && activityTime <= endDate;
        } else if (startDate) {
          return activityTime >= startDate;
        } else if (endDate) {
          return activityTime <= endDate;
        }
        return true;
      });
    }

    return list;
  }, [casesQ.data, searchQuery, startDate, endDate]);

  const casesByColumn = useMemo(() => {
    const list = filteredCases;
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
  }, [filteredCases]);

  const handleExportConversations = async (casesToExport: CaseRow[]) => {
    try {
      if (casesToExport.length === 0) return;
      let text = "EXPORTAÇÃO DE CONVERSAS BEEIA\n\n";

      for (const c of casesToExport) {
        const name = c.customer_accounts?.name || "Sem Nome";
        const phone = c.customer_accounts?.phone_e164 || "Sem Telefone";
        text += `=== LEAD: ${name} (${phone}) - STATUS: ${c.state} ===\n`;
        
        const { data: messages } = await supabase
          .from("wa_messages")
          .select("direction, body_text, occurred_at")
          .eq("case_id", c.id)
          .order("occurred_at", { ascending: true });
        
        if (messages && messages.length > 0) {
          messages.forEach(m => {
            const date = new Date(m.occurred_at).toLocaleString("pt-BR");
            const sender = m.direction === "inbound" ? "Cliente" : "Empresa/IA";
            if (m.body_text) {
              text += `[${date}] ${sender}:\n${m.body_text}\n\n`;
            }
          });
        } else {
          text += "Sem mensagens registradas.\n\n";
        }
        text += "\n-----------------------------------------\n\n";
      }

      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `conversas_beeia_${new Date().getTime()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess("Conversas exportadas com sucesso!");
    } catch (e: any) {
      showError("Erro ao exportar conversas: " + e.message);
    }
  };

  const handleExtractLearning = async (casesToExtract: CaseRow[]) => {
    try {
      if (casesToExtract.length === 0) return;
      setExtractingLearnings(true);

      const caseIds = casesToExtract.map(c => c.id);
      
      const { data, error } = await supabase.functions.invoke("beeia-extract-learnings", {
        body: { tenant_id: activeTenantId, case_ids: caseIds }
      });

      if (error) throw error;

      if (data?.learnings && Array.isArray(data.learnings) && data.learnings.length > 0) {
        setProposedLearnings(data.learnings);
        setShowLearningsDialog(true);
      } else {
        showSuccess("Análise concluída, mas nenhuma nova regra relevante foi extraída.");
      }
    } catch (e: any) {
      showError("Erro ao extrair aprendizados: " + e.message);
    } finally {
      setExtractingLearnings(false);
    }
  };

  const handleSaveProposedLearnings = async () => {
    try {
      const validLearnings = proposedLearnings.filter(l => l.trim().length > 5);
      if (validLearnings.length === 0) {
        showError("Adicione pelo menos um aprendizado válido antes de salvar.");
        return;
      }
      
      const rows = validLearnings.map(l => ({
        tenant_id: activeTenantId,
        learning_text: l.trim()
      }));

      const { error } = await supabase.from("beeia_learnings").insert(rows);
      if (error) throw error;

      showSuccess(`${validLearnings.length} novo(s) aprendizado(s) salvo(s)!`);
      qc.invalidateQueries({ queryKey: ["beeia_learnings", activeTenantId] });
      setShowLearningsDialog(false);
      setSelectedCaseIds([]); // Clear selection on success
    } catch (e: any) {
      showError("Erro ao salvar aprendizados: " + e.message);
    }
  };

  const toggleCaseSelection = (caseId: string) => {
    setSelectedCaseIds(prev => 
      prev.includes(caseId) ? prev.filter(id => id !== caseId) : [...prev, caseId]
    );
  };

  const toggleColumnSelection = (colCases: CaseRow[]) => {
    const colIds = colCases.map(c => c.id);
    const allSelected = colIds.every(id => selectedCaseIds.includes(id));
    if (allSelected) {
      setSelectedCaseIds(prev => prev.filter(id => !colIds.includes(id)));
    } else {
      setSelectedCaseIds(prev => {
        const next = new Set(prev);
        colIds.forEach(id => next.add(id));
        return Array.from(next);
      });
    }
  };

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
          <TabsList className="mb-4 grid w-full max-w-[850px] grid-cols-5 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
            <TabsTrigger value="crm" className="rounded-xl py-2 text-xs font-semibold">
              Fluxo CRM
            </TabsTrigger>
            <TabsTrigger value="simulador" className="rounded-xl py-2 text-xs font-semibold">
              Simulador
            </TabsTrigger>
            <TabsTrigger value="plugues" className="rounded-xl py-2 text-xs font-semibold">
              Plugues
            </TabsTrigger>
            <TabsTrigger value="settings" className="rounded-xl py-2 text-xs font-semibold">
              Configurações & Treino
            </TabsTrigger>
            <TabsTrigger value="fatura" className="rounded-xl py-2 text-xs font-semibold">
              Fatura
            </TabsTrigger>
          </TabsList>

          {/* Tab Content: Kanban Board */}
          <TabsContent value="crm" className="mt-0">
            {casesQ.isLoading ? (
              <div className="flex h-[400px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-amber-500 dark:border-slate-800" />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Filters Row */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900 p-4 rounded-[22px] border border-slate-200/80 dark:border-slate-800 shadow-xs relative">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center flex-1">
                    {/* Search Input */}
                    <div className="relative w-full sm:w-[280px]">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar lead, telefone ou msg..."
                        className="rounded-xl border-slate-200 text-xs dark:border-slate-850 pl-9 focus:border-amber-400 focus:ring-amber-400 w-full"
                      />
                    </div>

                    {/* Date Picker Trigger */}
                    <div className="relative">
                      <Button
                        variant="outline"
                        onClick={() => setShowDatePicker(!showDatePicker)}
                        className="rounded-xl text-xs border-slate-200 dark:border-slate-850 px-3.5 h-9 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 w-full sm:w-auto justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-slate-500" />
                          <span>{getPresetLabel()}</span>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      </Button>

                      {/* Custom Date Range Popover */}
                      {showDatePicker && (
                        <div className="absolute left-0 sm:left-auto top-10 z-50 flex flex-col sm:flex-row bg-white dark:bg-slate-950 p-4 rounded-[22px] border border-slate-200 dark:border-slate-800 shadow-xl min-w-[320px] sm:min-w-[620px] max-w-full overflow-x-auto mt-2">
                          {/* Left Sidebar Presets */}
                          <div className="flex flex-col gap-1 border-b sm:border-b-0 sm:border-r border-slate-100 dark:border-slate-850 pb-3 sm:pb-0 pr-0 sm:pr-4 mr-0 sm:mr-4 min-w-[150px]">
                            {[
                              { key: "todo_periodo", label: "TODO PERÍODO" },
                              { key: "hoje", label: "HOJE" },
                              { key: "ontem", label: "ONTEM" },
                              { key: "7_dias", label: "ÚLTIMOS 7 DIAS" },
                              { key: "30_dias", label: "ÚLTIMOS 30 DIAS" },
                              { key: "mes_atual", label: "MÊS ATUAL" },
                              { key: "mes_passado", label: "MÊS PASSADO" },
                            ].map((preset) => (
                              <button
                                key={preset.key}
                                type="button"
                                onClick={() => {
                                  applyPreset(preset.key);
                                  if (preset.key !== "custom") {
                                    setShowDatePicker(false);
                                  }
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-2 rounded-xl text-[10px] font-bold tracking-wider transition-all",
                                  datePreset === preset.key
                                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400"
                                    : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900"
                                )}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>

                          {/* Right Calendars grid */}
                          <div className="flex-1 flex flex-col gap-3 mt-3 sm:mt-0">
                            {/* Month navigation header */}
                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-850 pb-2 mb-2">
                              <button
                                type="button"
                                onClick={prevCalendarMonth}
                                className="h-7 w-7 rounded-full border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </button>
                              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                                Selecionar Período
                              </span>
                              <button
                                type="button"
                                onClick={nextCalendarMonth}
                                className="h-7 w-7 rounded-full border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>

                            {/* Calendar sheets side-by-side */}
                            <div className="flex flex-col sm:flex-row gap-6">
                              {renderMonthCalendar(calendarMonth)}
                              {renderMonthCalendar(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* View mode toggle: Kanban vs List */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setViewMode("kanban")}
                      className={cn(
                        "h-8 w-8 rounded-xl",
                        viewMode === "kanban" 
                          ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200" 
                          : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850"
                      )}
                      title="Modo Kanban"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setViewMode("list")}
                      className={cn(
                        "h-8 w-8 rounded-xl",
                        viewMode === "list" 
                          ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200" 
                          : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850"
                      )}
                      title="Modo Lista"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Active Filters Warning */}
                {(searchQuery.trim() !== "" || datePreset !== "todo_periodo") && (
                  <div className="flex items-center justify-between rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-2 text-xs text-amber-800 dark:text-amber-400">
                    <div className="flex items-center gap-2">
                      <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                      <span>
                        <strong>Filtros ativos:</strong> {searchQuery && `Busca por "${searchQuery}"`} {datePreset !== "todo_periodo" && `${searchQuery ? " • " : ""}Período (${getPresetLabel()})`}.
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchQuery("");
                        applyPreset("todo_periodo");
                      }}
                      className="h-6 rounded-lg text-[10px] font-bold text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950/20 px-2"
                    >
                      Limpar Filtros
                    </Button>
                  </div>
                )}

                {/* Main Content Area: List View vs Kanban Grid */}
                {viewMode === "list" ? (
                  <Card className="rounded-[22px] border-slate-200/80 p-5 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-150 dark:border-slate-850">
                            <th className="pb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Lead</th>
                            <th className="pb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Estágio</th>
                            <th className="pb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Custo da Conversa</th>
                            <th className="pb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Última Mensagem</th>
                            <th className="pb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Última Atividade</th>
                            <th className="pb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Status IA</th>
                            <th className="pb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                          {filteredCases.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-xs text-slate-400 italic">
                                Nenhum lead encontrado com os filtros ativos.
                              </td>
                            </tr>
                          ) : (
                            filteredCases.map((c) => {
                              const lastMsg = c.wa_messages?.[0];
                              const phone = c.customer_accounts?.phone_e164 ?? "";
                              const name = c.customer_accounts?.name ?? "Contato sem nome";
                              
                              // Calculate conversation cost
                              const caseBilling = (billingQ.data?.details ?? []).find(d => d.caseId === c.id);
                              const costBrl = caseBilling ? caseBilling.totalCostUsd * 5.0 : 0;

                              return (
                                <tr 
                                  key={c.id} 
                                  className="group hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-all cursor-pointer"
                                  onClick={() => setSelectedCaseId(c.id)}
                                >
                                  <td className="py-3.5">
                                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                                      {name}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{phone}</div>
                                  </td>
                                  <td className="py-3.5">
                                    <div onClick={(e) => e.stopPropagation()}>
                                      <Select
                                        value={c.beeia_paused ? "pausadas" : (c.state || "contato")}
                                        onValueChange={(val) => handleMoveState(c.id, val)}
                                      >
                                        <SelectTrigger className="h-7 w-[110px] rounded-lg text-[11px] font-semibold border-slate-200 focus:ring-1 focus:ring-amber-500">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-lg">
                                          <SelectItem value="contato" className="text-[11px] font-sans">1º Contato</SelectItem>
                                          <SelectItem value="morno" className="text-[11px] font-sans">Morno</SelectItem>
                                          <SelectItem value="quente" className="text-[11px] font-sans">Quente</SelectItem>
                                          <SelectItem value="frio" className="text-[11px] font-sans">Frio</SelectItem>
                                          <SelectItem value="pausadas" className="text-[11px] font-sans">Pausadas</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </td>
                                  <td className="py-3.5 font-semibold text-xs text-slate-700 dark:text-slate-350">
                                    R$ {costBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                  </td>
                                  <td className="py-3.5 max-w-[300px]">
                                    {lastMsg ? (
                                      <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                                        {lastMsg.body_text}
                                      </div>
                                    ) : (
                                      <div className="text-[10px] italic text-slate-450">Sem mensagens gravadas</div>
                                    )}
                                  </td>
                                  <td className="py-3.5 text-xs text-slate-500 dark:text-slate-400">
                                    {new Date(c.updated_at).toLocaleString("pt-BR", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit"
                                    })}
                                  </td>
                                  <td className="py-3.5">
                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                      <Switch
                                        checked={!c.beeia_paused}
                                        onCheckedChange={async (checked) => {
                                          try {
                                            const { error } = await supabase
                                              .from("cases")
                                              .update({
                                                beeia_paused: !checked,
                                                updated_at: new Date().toISOString()
                                              })
                                              .eq("id", c.id);
                                            if (error) throw error;
                                            showSuccess(`IA ${checked ? "Ativada" : "Pausada"} para esta conversa!`);
                                            await qc.invalidateQueries({ queryKey: ["beeia_cases", activeTenantId] });
                                          } catch (e: any) {
                                            showError(`Erro ao alterar status da IA: ${e.message}`);
                                          }
                                        }}
                                      />
                                      <span className={cn(
                                        "text-[10px] font-semibold flex items-center gap-1",
                                        c.beeia_paused ? "text-rose-500" : "text-emerald-500"
                                      )}>
                                        {c.beeia_paused ? "Pausada" : "Ativa"}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-3.5 text-right">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs rounded-lg hover:bg-slate-100"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedCaseId(c.id);
                                      }}
                                    >
                                      Abrir Conversa
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ) : (
                  <div className="grid h-full min-h-[500px] gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    {columns.map((col) => {
                      const colCases = casesByColumn[col.key] ?? [];
                      return (
                        <div
                          key={col.key}
                          className={`flex flex-col rounded-[22px] border border-slate-200/80 border-t-4 p-4 dark:border-slate-800 ${col.color}`}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            const cid = e.dataTransfer.getData("text/caseId");
                            if (cid) handleMoveState(cid, col.key);
                          }}
                        >
                          {/* Column Header */}
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={colCases.length > 0 && colCases.every(c => selectedCaseIds.includes(c.id))}
                                onCheckedChange={() => toggleColumnSelection(colCases)}
                                disabled={colCases.length === 0}
                                className="h-4 w-4"
                              />
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                {col.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {colCases.some(c => selectedCaseIds.includes(c.id)) && (
                                <div className="flex items-center gap-1 mr-1 animate-in fade-in zoom-in duration-200">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-slate-500 hover:text-amber-600 dark:hover:text-amber-400"
                                        title="Mover selecionados para outra etapa"
                                      >
                                        <ArrowRight className="h-3.5 w-3.5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                      <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                                        Mover para...
                                      </div>
                                      {columns.filter(c => c.key !== col.key).map(targetCol => (
                                        <DropdownMenuItem
                                          key={targetCol.key}
                                          onClick={() => handleMassMoveState(
                                            colCases.filter(c => selectedCaseIds.includes(c.id)).map(c => c.id),
                                            targetCol.key
                                          )}
                                          className="text-xs cursor-pointer flex items-center gap-2"
                                        >
                                          <div className={`h-2 w-2 rounded-full ${targetCol.color.split(' ')[1]}`} />
                                          {targetCol.label}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleExportConversations(colCases.filter(c => selectedCaseIds.includes(c.id)))}
                                    className="h-6 w-6 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                                    title="Exportar conversas selecionadas"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={extractingLearnings}
                                    onClick={() => handleExtractLearning(colCases.filter(c => selectedCaseIds.includes(c.id)))}
                                    className="h-6 w-6 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                                    title="Aprender contexto (IA)"
                                  >
                                    {extractingLearnings ? (
                                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                                    ) : (
                                      <BrainCircuit className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </div>
                              )}
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700 dark:bg-slate-850 dark:text-slate-300">
                                {colCases.length}
                              </span>
                            </div>
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
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData("text/caseId", c.id);
                                      e.dataTransfer.effectAllowed = "move";
                                    }}
                                    className={cn(
                                      "group relative flex cursor-grab active:cursor-grabbing flex-col rounded-2xl border-slate-200/60 p-3.5 hover:border-amber-200 hover:shadow-sm dark:border-slate-850 dark:hover:border-amber-950/60 transition-colors",
                                      selectedCaseIds.includes(c.id) && "border-amber-300 bg-amber-50/50 dark:border-amber-500/50 dark:bg-amber-950/20 shadow-sm"
                                    )}
                                    onClick={() => setSelectedCaseId(c.id)}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-start gap-2">
                                        <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
                                          <Checkbox
                                            checked={selectedCaseIds.includes(c.id)}
                                            onCheckedChange={() => toggleCaseSelection(c.id)}
                                            className={cn(
                                              "h-3.5 w-3.5 transition-opacity rounded-sm",
                                              !selectedCaseIds.includes(c.id) && "opacity-0 group-hover:opacity-100"
                                            )}
                                          />
                                        </div>
                                        <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                                          {name}
                                        </div>
                                      </div>
                                      {c.state === "contato" && !c.beeia_paused && (
                                        <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" title="IA ativamente respondendo" />
                                      )}
                                    </div>
                                    <div className="mt-1 pl-5 text-[10px] text-slate-400 font-mono">
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
                                            className="h-6 w-6 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700"
                                            onClick={() => handleMoveState(c.id, "pausadas")}
                                            title="Mover para Pausadas"
                                          >
                                            <ArrowRight className="h-3 w-3" />
                                          </Button>
                                        )}
                                        {col.key === "pausadas" && (
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
                        onCheckedChange={handleToggleGlobalSwitch} 
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
                    
                    <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 dark:border-slate-850">
                      <label className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                        O que mudou nesta versão?
                      </label>
                      <div className="flex gap-2 items-center">
                        <Input
                          value={changeDescription}
                          onChange={(e) => setChangeDescription(e.target.value)}
                          placeholder="Ex: Ajustei as regras de precificação / Mudei tom de voz..."
                          className="rounded-xl border-slate-200 text-xs dark:border-slate-850 flex-1 focus:border-amber-400 focus:ring-amber-400"
                        />
                        <Button
                          onClick={handleSaveConfig}
                          disabled={savingConfig}
                          className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-4"
                        >
                          <Save className="mr-1.5 h-3.5 w-3.5" /> Salvar Versão
                        </Button>
                      </div>
                    </div>

                    {/* Histórico de Prompts */}
                    <div className="flex flex-col gap-2 mt-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <BookOpen className="h-4 w-4 text-amber-500" />
                        <label className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300 tracking-wider">
                          Histórico & Versões do Prompt
                        </label>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                        Visualize ou restaure versões anteriores do prompt criadas por sua equipe.
                      </p>

                      <div className="max-h-[220px] overflow-y-auto flex flex-col gap-2">
                        {promptVersionsQ.isLoading ? (
                          <div className="text-xs text-slate-400">Carregando histórico...</div>
                        ) : (promptVersionsQ.data ?? []).length === 0 ? (
                          <div className="text-xs text-slate-400 italic">Nenhuma versão salva no histórico ainda.</div>
                        ) : (
                          (promptVersionsQ.data ?? []).map((v: any) => (
                            <div key={v.id} className="flex items-center justify-between bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                  <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                                    V{v.version}
                                  </span>
                                  <span className="truncate">{v.description}</span>
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {new Date(v.created_at).toLocaleString("pt-BR")}
                                </div>
                              </div>
                              <div className="flex gap-1.5 ml-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedVersion(v)}
                                  className="h-7 px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                                >
                                  Visualizar
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSystemPrompt(v.prompt_text);
                                    showSuccess(`Prompt restaurado da V${v.version} na caixa de texto. Lembre-se de clicar em salvar para publicar!`);
                                  }}
                                  className="h-7 px-2 text-[10px] font-semibold text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/20"
                                >
                                  Restaurar
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
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
                            {/* Copy webhook URL */}
                            <div className="mt-2 flex items-center gap-1 bg-slate-100 dark:bg-slate-850 p-1 px-1.5 rounded-lg border border-slate-150 dark:border-slate-800 max-w-[280px]">
                              <span className="text-[8px] font-bold text-slate-400 uppercase flex-shrink-0">
                                Webhook:
                              </span>
                              <input
                                readOnly
                                value={`https://pryoirzeghatrgecwrci.supabase.co/functions/v1/webhooks-zapi-inbound/${inst.zapi_instance_id}/${inst.webhook_secret || ""}`}
                                className="text-[9px] font-mono bg-transparent outline-none text-slate-500 truncate flex-1 select-all cursor-text"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-4 w-4 p-0 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-500"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(`https://pryoirzeghatrgecwrci.supabase.co/functions/v1/webhooks-zapi-inbound/${inst.zapi_instance_id}/${inst.webhook_secret || ""}`);
                                  showSuccess("Webhook copiado!");
                                }}
                                title="Copiar URL do Webhook"
                              >
                                <Copy className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">
                                Acesso
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-lg px-2 text-[10px] font-semibold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
                                onClick={() => {
                                  setPermissionsInstance(inst);
                                  setSelectedUserIds(inst.allowed_user_ids || []);
                                }}
                                title="Configurar privacidade de acesso"
                              >
                                {inst.allowed_user_ids && inst.allowed_user_ids.length > 0 ? (
                                  <span className="text-rose-500 font-bold flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Restrito ({inst.allowed_user_ids.length})
                                  </span>
                                ) : (
                                  "Público"
                                )}
                              </Button>
                            </div>

                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">
                                BeeIA
                              </span>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[10px] font-semibold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
                                  onClick={() => {
                                    setTestNumbersInstance(inst);
                                    setTestNumbersInput((inst.beeia_test_numbers || []).join(", "));
                                  }}
                                  title="Configurar números de teste real"
                                >
                                  {inst.beeia_test_numbers && inst.beeia_test_numbers.length > 0 ? (
                                    <span className="text-indigo-500 font-bold flex items-center gap-1">
                                      Testes ({inst.beeia_test_numbers.length})
                                    </span>
                                  ) : (
                                    "Sem testes"
                                  )}
                                </Button>
                                <Switch
                                  checked={inst.beeia_enabled}
                                  onCheckedChange={(val) => toggleBeeiaOnInstance(inst.id, val)}
                                />
                              </div>
                            </div>
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
            <BeeIASimulator 
              sessionId={selectedSimulatorSessionId || undefined} 
              onSelectSession={(id) => setSelectedSimulatorSessionId(id)}
            />
          </TabsContent>

          {/* Tab Content: Fatura */}
          <TabsContent value="fatura" className="mt-0">
            <div className="flex flex-col gap-6">
              {/* Summary Cards */}
              <div className={`grid gap-4 ${isSuperAdmin ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                <Card className="rounded-[22px] border-slate-200/80 p-5 bg-white shadow-sm flex items-center gap-4 dark:border-slate-800 dark:bg-slate-900">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
                    <BrainCircuit className="h-6 w-6" />
                  </span>
                  <div>
                    <h3 className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Total de Tokens</h3>
                    <p className="text-2xl font-black text-slate-800 dark:text-slate-100">
                      {billingQ.data?.grandTotalTokens.toLocaleString() ?? 0}
                    </p>
                  </div>
                </Card>

                {isSuperAdmin && (
                  <Card className="rounded-[22px] border-slate-200/80 p-5 bg-white shadow-sm flex items-center gap-4 dark:border-slate-800 dark:bg-slate-900">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                      <Coins className="h-6 w-6" />
                    </span>
                    <div>
                      <h3 className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Custo Estimado (USD)</h3>
                      <p className="text-2xl font-black text-slate-800 dark:text-slate-100">
                        ${billingQ.data?.grandTotalCostUsd.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) ?? "0.0000"}
                      </p>
                    </div>
                  </Card>
                )}

                <Card className="rounded-[22px] border-slate-200/80 p-5 bg-white shadow-sm flex items-center gap-4 dark:border-slate-800 dark:bg-slate-900">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
                    <CreditCard className="h-6 w-6" />
                  </span>
                  <div>
                    <h3 className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Valor Fatura (BRL)</h3>
                    <p className="text-2xl font-black text-slate-800 dark:text-slate-100">
                      R$ {((billingQ.data?.grandTotalCostUsd ?? 0) * 5.0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </Card>
              </div>

              {/* Billing Details Table */}
              <Card className="rounded-[22px] border-slate-200/80 p-5 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-850">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Consumo por Conversa
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Detalhamento do consumo de tokens da IA e custos calculados para cada lead atendido.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => billingQ.refetch()}
                    className="rounded-xl text-xs font-semibold"
                  >
                    <RefreshCw className="mr-1.5 h-3 w-3" /> Atualizar Fatura
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-850 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                        <th className="py-2.5 px-3">Conversa / Contato</th>
                        <th className="py-2.5 px-3">Telefone</th>
                        <th className="py-2.5 px-3 text-right">Tokens Consumidos</th>
                        {isSuperAdmin && <th className="py-2.5 px-3 text-right">Custo USD</th>}
                        <th className="py-2.5 px-3 text-right">Custo BRL</th>
                        <th className="py-2.5 px-3">Última Interação</th>
                        <th className="py-2.5 px-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billingQ.isLoading ? (
                        <tr>
                          <td colSpan={isSuperAdmin ? 7 : 6} className="py-8 text-center">
                            <div className="flex items-center justify-center">
                              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-amber-500" />
                            </div>
                          </td>
                        </tr>
                      ) : (billingQ.data?.details ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={isSuperAdmin ? 7 : 6} className="py-8 text-center text-slate-400 italic">
                            Nenhum consumo de token registrado até o momento.
                          </td>
                        </tr>
                      ) : (
                        (billingQ.data?.details ?? []).map((detail, idx) => {
                          const displayName = detail.name || detail.title || detail.description || "Análise/Global";
                          const formattedDate = new Date(detail.lastOccurred).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          });

                          return (
                            <tr key={detail.caseId || idx} className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-slate-850 dark:hover:bg-slate-900/40">
                              <td className="py-3 px-3 font-semibold text-slate-850 dark:text-slate-200">
                                {displayName}
                              </td>
                              <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                                {detail.phone || "-"}
                              </td>
                              <td className="py-3 px-3 text-right font-medium">
                                {detail.totalTokens.toLocaleString()}
                              </td>
                              {isSuperAdmin && (
                                <td className="py-3 px-3 text-right font-mono text-slate-500">
                                  ${detail.totalCostUsd.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                                </td>
                              )}
                              <td className="py-3 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                R$ {(detail.totalCostUsd * 5.0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                              </td>
                              <td className="py-3 px-3 text-slate-500">
                                {formattedDate}
                              </td>
                              <td className="py-3 px-3 text-right">
                                {detail.isSimulation ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      if (detail.caseId && detail.caseId !== "simulation_fallback") {
                                        setSelectedSimulatorSessionId(detail.caseId);
                                      }
                                      setActiveTab("simulador");
                                    }}
                                    className="h-7 rounded-lg text-[10px] font-semibold text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/20"
                                  >
                                    Abrir Simulador
                                  </Button>
                                ) : (
                                  detail.caseId && detail.caseId !== "global_insights" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setSelectedCaseId(detail.caseId)}
                                      className="h-7 rounded-lg text-[10px] font-semibold text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/20"
                                    >
                                      Abrir Conversa
                                    </Button>
                                  )
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="plugues" className="mt-0">
            <BeeIAPlugsTab
              tenantId={activeTenantId!}
              plugs={plugsQ.data || []}
              onSave={(plugKey, isEnabled, configJson) =>
                savePlugMut.mutate({ plugKey, isEnabled, configJson })
              }
              users={tenantUsersQ.data || []}
              isSaving={savePlugMut.isPending}
            />
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

        {/* Modal: Zangão Access Permissions */}
        {permissionsInstance && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <Card className="w-full max-w-[450px] rounded-[22px] border-slate-200/80 p-5 shadow-lg animate-in fade-in zoom-in-95 duration-150 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-850">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Privacidade do Número
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Selecione quais usuários podem ver as conversas de {permissionsInstance.name}.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPermissionsInstance(null)}
                  className="h-8 rounded-xl px-2 text-xs text-slate-400 hover:bg-slate-100"
                >
                  Fechar
                </Button>
              </div>

              <div className="max-h-[300px] overflow-y-auto flex flex-col gap-2 my-4">
                {tenantUsersQ.isLoading ? (
                  <div className="flex h-20 items-center justify-center">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-amber-500" />
                  </div>
                ) : (tenantUsersQ.data ?? []).length === 0 ? (
                  <div className="text-center text-xs text-slate-400 py-6">
                    Nenhum outro usuário no tenant.
                  </div>
                ) : (
                  (tenantUsersQ.data ?? []).map((usr: any) => {
                    const isChecked = selectedUserIds.includes(usr.user_id);
                    return (
                      <div
                        key={usr.user_id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:bg-slate-55/40 dark:border-slate-800 dark:hover:bg-slate-900/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {usr.display_name || "Usuário sem nome"}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">
                            {usr.email} • <span className="uppercase text-[9px] font-bold">{usr.role}</span>
                          </div>
                        </div>
                        <Switch
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedUserIds([...selectedUserIds, usr.user_id]);
                            } else {
                              setSelectedUserIds(selectedUserIds.filter(id => id !== usr.user_id));
                            }
                          }}
                        />
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t border-slate-100 pt-3 flex items-center justify-between dark:border-slate-850">
                <span className="text-[10px] text-slate-400 italic">
                  * Se nenhum for marcado, todos (Admin/Super-Admin) terão acesso.
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setPermissionsInstance(null)}
                    className="rounded-xl text-xs font-semibold"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleSavePermissions}
                    disabled={savingPermissions}
                    className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs"
                  >
                    {savingPermissions ? "Salvando…" : "Salvar Permissões"}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Modal: Test Numbers */}
        {testNumbersInstance && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <Card className="w-full max-w-[450px] rounded-[22px] border-slate-200/80 p-5 shadow-lg animate-in fade-in zoom-in-95 duration-150 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-850">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-indigo-500" />
                    Números de Teste Real
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Esses números acionarão o simulador da BeeIA mesmo que ela esteja globalmente desativada. As conversas cairão direto na aba Simulador.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 rounded-full p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  onClick={() => setTestNumbersInstance(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-col gap-3 py-2">
                <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Telefones permitidos (separados por vírgula):</Label>
                <Textarea
                  value={testNumbersInput}
                  onChange={e => setTestNumbersInput(e.target.value)}
                  placeholder="Ex: 5547999999999, 5511888888888"
                  className="min-h-[80px] text-xs resize-none"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-850">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTestNumbersInstance(null)}
                  className="rounded-xl text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveTestNumbers}
                  disabled={savingTestNumbers}
                  className="rounded-xl bg-indigo-600 text-white font-semibold text-xs px-4 hover:bg-indigo-700"
                >
                  {savingTestNumbers ? (
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white mr-1.5" />
                  ) : (
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Salvar
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Modal: View Prompt Version */}
        {selectedVersion && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <Card className="w-full max-w-[650px] rounded-[22px] border-slate-200/80 p-5 shadow-lg animate-in fade-in zoom-in-95 duration-150 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col max-h-[85vh]">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-850">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                      Versão {selectedVersion.version}
                    </span>
                    Visualizar Prompt
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {selectedVersion.description || "Sem descrição"} • {new Date(selectedVersion.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedVersion(null)}
                  className="h-8 rounded-xl px-2 text-xs text-slate-400 hover:bg-slate-100"
                >
                  Fechar
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-850 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed select-all">
                {selectedVersion.prompt_text}
              </div>

              <div className="border-t border-slate-100 pt-3 mt-4 flex justify-end gap-2 dark:border-slate-850">
                <Button
                  variant="outline"
                  onClick={() => setSelectedVersion(null)}
                  className="rounded-xl text-xs font-semibold"
                >
                  Voltar
                </Button>
                <Button
                  onClick={() => {
                    setSystemPrompt(selectedVersion.prompt_text);
                    setSelectedVersion(null);
                    showSuccess(`Prompt restaurado da V${selectedVersion.version} na caixa de texto. Lembre-se de salvar!`);
                  }}
                  className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-4"
                >
                  Restaurar esta Versão
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Drawer/Sheet: WhatsApp Chat Viewer */}
        <Sheet open={Boolean(selectedCaseId)} onOpenChange={(open) => !open && setSelectedCaseId(null)}>
          <SheetContent side="right" className="w-full sm:max-w-[45vw] p-0 flex flex-col h-full rounded-l-[30px] border-slate-200 dark:border-slate-850">
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
      {/* Learned rules review dialog */}
      <Dialog open={showLearningsDialog} onOpenChange={setShowLearningsDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <DialogHeader className="flex flex-col gap-1.5 pb-2">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <BrainCircuit className="h-5 w-5 text-indigo-500" />
              Revisar Aprendizados Extraídos
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-left">
              A Inteligência Artificial extraiu os seguintes padrões das conversas selecionadas. Você pode alterar os textos, excluir o que não faz sentido ou adicionar novos antes de salvar.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2 py-4 flex flex-col gap-3 custom-scrollbar">
            {proposedLearnings.length === 0 ? (
              <div className="text-center p-6 text-slate-500 italic text-sm">
                Nenhuma regra sugerida. Você pode adicionar manualmente.
              </div>
            ) : (
              proposedLearnings.map((learning, idx) => (
                <div key={idx} className="relative group flex flex-col gap-1 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800 focus-within:border-indigo-300 transition-colors">
                  <div className="flex justify-between items-center px-1 mb-1">
                    <span className="text-xs font-semibold text-slate-500">Regra #{idx + 1}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setProposedLearnings(prev => prev.filter((_, i) => i !== idx))}
                      title="Remover esta regra"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Textarea
                    value={learning}
                    onChange={(e) => {
                      const newVal = e.target.value;
                      setProposedLearnings(prev => {
                        const next = [...prev];
                        next[idx] = newVal;
                        return next;
                      });
                    }}
                    className="min-h-[80px] bg-white dark:bg-slate-950 border-0 resize-y text-sm focus-visible:ring-0 shadow-none p-2"
                    placeholder="Descreva o ensinamento..."
                  />
                </div>
              ))
            )}
            
            <Button
              variant="outline"
              onClick={() => setProposedLearnings(prev => [...prev, ""])}
              className="mt-2 rounded-xl border-dashed border-slate-300 text-slate-500 hover:text-slate-700 hover:border-slate-400 bg-transparent h-12"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar nova regra
            </Button>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="ghost" onClick={() => setShowLearningsDialog(false)} className="rounded-xl">
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveProposedLearnings} 
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              Salvar Aprendizados
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// -----------------------------------------------------------------------------
// Componente de Plugues (Integrações da IA)
// -----------------------------------------------------------------------------
interface PlugRow {
  plug_key: string;
  is_enabled: boolean;
  config_json: any;
}

interface UserProfileOption {
  user_id: string;
  display_name: string | null;
  email: string;
}

interface BeeIAPlugsTabProps {
  tenantId: string;
  plugs: PlugRow[];
  onSave: (plugKey: string, isEnabled: boolean, configJson: any) => void;
  users: UserProfileOption[];
  isSaving: boolean;
}

function BeeIAPlugsTab({
  plugs,
  onSave,
  users,
  isSaving,
}: BeeIAPlugsTabProps) {
  // Local States for forms
  const [crmTargetStage, setCrmTargetStage] = useState("morno");
  const [crmAssignedUser, setCrmAssignedUser] = useState("");

  const [entAllowedFields, setEntAllowedFields] = useState<string[]>(["price", "description", "area", "location", "photos"]);
  const [entLimitInstructions, setEntLimitInstructions] = useState("");

  const [finAllowCheck, setFinAllowCheck] = useState(false);
  const [finPixKey, setFinPixKey] = useState("");
  const [finBillingInstructions, setFinBillingInstructions] = useState("");

  const [simAllowRules, setSimAllowRules] = useState(false);
  const [simCustomInstructions, setSimCustomInstructions] = useState("");

  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [discordTriggerInstructions, setDiscordTriggerInstructions] = useState("");
  const [discordNotificationTemplate, setDiscordNotificationTemplate] = useState("");

  // Sync with loaded plugs data
  useEffect(() => {
    if (plugs && plugs.length > 0) {
      const crmPlug = plugs.find((p) => p.plug_key === "crm_journeys");
      if (crmPlug) {
        setCrmTargetStage(crmPlug.config_json?.target_stage || "morno");
        setCrmAssignedUser(crmPlug.config_json?.assigned_user_id || "");
      }

      const entPlug = plugs.find((p) => p.plug_key === "core_entities");
      if (entPlug) {
        setEntAllowedFields(entPlug.config_json?.allowed_fields || ["price", "description", "area", "location", "photos"]);
        setEntLimitInstructions(entPlug.config_json?.limit_instructions || "");
      }

      const finPlug = plugs.find((p) => p.plug_key === "financial_billing");
      if (finPlug) {
        setFinAllowCheck(finPlug.config_json?.allow_check_receivables ?? false);
        setFinPixKey(finPlug.config_json?.pix_key || "");
        setFinBillingInstructions(finPlug.config_json?.billing_instructions || "");
      }

      const simPlug = plugs.find((p) => p.plug_key === "financing_simulator");
      if (simPlug) {
        setSimAllowRules(simPlug.config_json?.allow_use_bank_rules ?? false);
        setSimCustomInstructions(simPlug.config_json?.custom_instructions || "");
      }

      const discordPlug = plugs.find((p) => p.plug_key === "discord_notifications");
      if (discordPlug) {
        setDiscordWebhookUrl(discordPlug.config_json?.webhook_url || "");
        setDiscordTriggerInstructions(discordPlug.config_json?.trigger_instructions || "");
        setDiscordNotificationTemplate(discordPlug.config_json?.notification_template || "");
      }
    }
  }, [plugs]);

  const isPlugEnabled = (key: string) => {
    return plugs.find((p) => p.plug_key === key)?.is_enabled ?? false;
  };

  const getPlugConfig = (key: string) => {
    return plugs.find((p) => p.plug_key === key)?.config_json ?? {};
  };

  const handleTogglePlug = (key: string, enabled: boolean) => {
    onSave(key, enabled, getPlugConfig(key));
  };

  const handleSaveCrm = () => {
    onSave("crm_journeys", isPlugEnabled("crm_journeys"), {
      target_stage: crmTargetStage,
      assigned_user_id: crmAssignedUser === "none" ? null : crmAssignedUser || null,
    });
  };

  const handleSaveEntities = () => {
    onSave("core_entities", isPlugEnabled("core_entities"), {
      allowed_fields: entAllowedFields,
      limit_instructions: entLimitInstructions,
    });
  };

  const handleSaveFinancial = () => {
    onSave("financial_billing", isPlugEnabled("financial_billing"), {
      allow_check_receivables: finAllowCheck,
      pix_key: finPixKey,
      billing_instructions: finBillingInstructions,
    });
  };

  const handleSaveSim = () => {
    onSave("financing_simulator", isPlugEnabled("financing_simulator"), {
      allow_use_bank_rules: simAllowRules,
      custom_instructions: simCustomInstructions,
    });
  };

  const handleSaveDiscord = () => {
    onSave("discord_notifications", isPlugEnabled("discord_notifications"), {
      webhook_url: discordWebhookUrl,
      trigger_instructions: discordTriggerInstructions,
      notification_template: discordNotificationTemplate,
    });
  };

  const handleToggleField = (field: string) => {
    if (entAllowedFields.includes(field)) {
      setEntAllowedFields(entAllowedFields.filter((f) => f !== field));
    } else {
      setEntAllowedFields([...entAllowedFields, field]);
    }
  };

  const pingDiscordMut = useMutation({
    mutationFn: async () => {
      if (!discordWebhookUrl) throw new Error("A URL do Webhook é obrigatória para o ping.");
      const { data, error } = await supabase.functions.invoke("integrations-discord-ping", {
        body: { webhook_url: discordWebhookUrl }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => showSuccess("Ping enviado com sucesso para o Discord!"),
    onError: (err: any) => showError("Erro ao enviar ping: " + err.message)
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-300 p-4 rounded-[22px] flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider">Configure os Plugues de Integração</h3>
          <p className="text-[11px] text-slate-650 dark:text-slate-400 mt-1 leading-relaxed">
            Ative e controle os recursos reais do sistema que a IA está autorizada a utilizar nas conversas com os leads. A IA lerá diretamente as tabelas do banco de dados (registro de imóveis, faturas em aberto e regras bancárias) baseando-se no que for configurado aqui.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* Plug 1: CRM & Journeys */}
        <Card className="rounded-[22px] border-slate-200/80 p-5 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-slate-350 dark:hover:border-slate-700">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 dark:border-slate-850">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                <LayoutGrid className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-150">
                  CRM & Atribuição de Leads (Jornadas)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Define o estágio do lead qualificado e atribui o atendimento automaticamente a um usuário.
                </p>
              </div>
            </div>
            <Switch
              checked={isPlugEnabled("crm_journeys")}
              disabled={isSaving}
              onCheckedChange={(checked) => handleTogglePlug("crm_journeys", checked)}
            />
          </div>

          {isPlugEnabled("crm_journeys") && (
            <div className="mt-4 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    Estágio de Destino para Qualificação
                  </Label>
                  <Select value={crmTargetStage} onValueChange={setCrmTargetStage}>
                    <SelectTrigger className="rounded-xl border-slate-200 text-xs dark:border-slate-850">
                      <SelectValue placeholder="Selecione o estágio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contato">1º Contato</SelectItem>
                      <SelectItem value="morno">Morno</SelectItem>
                      <SelectItem value="quente">Quente</SelectItem>
                      <SelectItem value="frio">Frio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    Atribuir Lead para Usuário
                  </Label>
                  <Select value={crmAssignedUser || "none"} onValueChange={setCrmAssignedUser}>
                    <SelectTrigger className="rounded-xl border-slate-200 text-xs dark:border-slate-850">
                      <SelectValue placeholder="Selecione o responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum (Sem atribuição)</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.user_id} value={u.user_id}>
                          {u.display_name || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end border-t border-slate-100 pt-3 dark:border-slate-850">
                <Button
                  size="sm"
                  onClick={handleSaveCrm}
                  disabled={isSaving}
                  className="rounded-xl bg-slate-900 text-white font-semibold text-xs px-4 dark:bg-slate-50 dark:text-slate-950"
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" /> Salvar Configurações
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Plug 2: Core Entities / Property Catalog */}
        <Card className="rounded-[22px] border-slate-200/80 p-5 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-slate-350 dark:hover:border-slate-700">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 dark:border-slate-850">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
                <BookOpen className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-150">
                  Catálogo de Imóveis & Entidades (`core_entities`)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Permite que a IA consulte as informações de imóveis cadastrados e configure quais dados revelar ao cliente.
                </p>
              </div>
            </div>
            <Switch
              checked={isPlugEnabled("core_entities")}
              disabled={isSaving}
              onCheckedChange={(checked) => handleTogglePlug("core_entities", checked)}
            />
          </div>

          {isPlugEnabled("core_entities") && (
            <div className="mt-4 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  Informações Autorizadas para Divulgação
                </Label>
                <div className="flex flex-wrap gap-2.5 p-3 border border-slate-200 dark:border-slate-850 rounded-xl bg-slate-50 dark:bg-slate-950">
                  {[
                    { key: "price", label: "Preço do Imóvel" },
                    { key: "description", label: "Descrição Comercial" },
                    { key: "area", label: "Área Total & Útil" },
                    { key: "location", label: "Localização (Bairro, Cidade)" },
                    { key: "photos", label: "Fotos Oficiais (Links públicos)" },
                    { key: "rooms", label: "Cômodos (Quartos, Vagas, Suítes)" },
                  ].map((field) => {
                    const isChecked = entAllowedFields.includes(field.key);
                    return (
                      <label
                        key={field.key}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-all ${
                          isChecked
                            ? "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-300"
                            : "bg-white border-slate-200 text-slate-650 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleField(field.key)}
                          className="hidden"
                        />
                        {field.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  Instruções Limites de Divulgação
                </Label>
                <Textarea
                  value={entLimitInstructions}
                  onChange={(e) => setEntLimitInstructions(e.target.value)}
                  placeholder="Ex: Nunca dê o endereço exato ou nome do proprietário. Diga que só passamos o endereço exato agendando a visita."
                  className="rounded-xl border-slate-200 text-xs dark:border-slate-850 min-h-[70px] resize-y"
                />
              </div>

              <div className="flex justify-end border-t border-slate-100 pt-3 dark:border-slate-850">
                <Button
                  size="sm"
                  onClick={handleSaveEntities}
                  disabled={isSaving}
                  className="rounded-xl bg-slate-900 text-white font-semibold text-xs px-4 dark:bg-slate-50 dark:text-slate-950"
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" /> Salvar Configurações
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Plug 3: Financial Invoices */}
        <Card className="rounded-[22px] border-slate-200/80 p-5 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-slate-350 dark:hover:border-slate-700">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 dark:border-slate-850">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                <CreditCard className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-150">
                  Módulo Financeiro & Faturas (`financial_receivables`)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Permite à IA consultar faturas pendentes do cliente no financeiro e fornecer chaves PIX de recebimento.
                </p>
              </div>
            </div>
            <Switch
              checked={isPlugEnabled("financial_billing")}
              disabled={isSaving}
              onCheckedChange={(checked) => handleTogglePlug("financial_billing", checked)}
            />
          </div>

          {isPlugEnabled("financial_billing") && (
            <div className="mt-4 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    Chave PIX para Cobrança
                  </Label>
                  <Input
                    value={finPixKey}
                    onChange={(e) => setFinPixKey(e.target.value)}
                    placeholder="Chave PIX (E-mail, CNPJ, Celular)"
                    className="rounded-xl border-slate-200 text-xs dark:border-slate-850"
                  />
                </div>

                <div className="flex flex-col gap-2 justify-center">
                  <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    Consulta Financeira do Cliente
                  </Label>
                  <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-850 rounded-xl p-2.5 bg-slate-50 dark:bg-slate-950">
                    <input
                      type="checkbox"
                      id="allow_receiv"
                      checked={finAllowCheck}
                      onChange={(e) => setFinAllowCheck(e.target.checked)}
                      className="rounded border-slate-200 text-amber-500 focus:ring-amber-500 cursor-pointer h-4 w-4"
                    />
                    <label htmlFor="allow_receiv" className="text-[11px] font-medium text-slate-650 dark:text-slate-400 cursor-pointer select-none">
                      Permitir que a IA busque faturas em aberto/vencidas do cliente.
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  Instruções de Negociação Financeira
                </Label>
                <Textarea
                  value={finBillingInstructions}
                  onChange={(e) => setFinBillingInstructions(e.target.value)}
                  placeholder="Ex: Se o boleto estiver vencido, avise que geramos a nova via e passamos a chave PIX, mas não ofereça descontos sem aprovação."
                  className="rounded-xl border-slate-200 text-xs dark:border-slate-850 min-h-[70px] resize-y"
                />
              </div>

              <div className="flex justify-end border-t border-slate-100 pt-3 dark:border-slate-850">
                <Button
                  size="sm"
                  onClick={handleSaveFinancial}
                  disabled={isSaving}
                  className="rounded-xl bg-slate-900 text-white font-semibold text-xs px-4 dark:bg-slate-50 dark:text-slate-950"
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" /> Salvar Configurações
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Plug 4: Financing Simulator */}
        <Card className="rounded-[22px] border-slate-200/80 p-5 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-slate-350 dark:hover:border-slate-700">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 dark:border-slate-850">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Coins className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-150">
                  Simulador de Financiamento Bancário (`financing_bank_rules`)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Permite à IA ler as regras de bancos ativas e calcular parcelas e taxas de financiamento oficiais.
                </p>
              </div>
            </div>
            <Switch
              checked={isPlugEnabled("financing_simulator")}
              disabled={isSaving}
              onCheckedChange={(checked) => handleTogglePlug("financing_simulator", checked)}
            />
          </div>

          {isPlugEnabled("financing_simulator") && (
            <div className="mt-4 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-850 rounded-xl p-2.5 bg-slate-50 dark:bg-slate-950">
                <input
                  type="checkbox"
                  id="allow_bank_rules"
                  checked={simAllowRules}
                  onChange={(e) => setSimAllowRules(e.target.checked)}
                  className="rounded border-slate-200 text-amber-500 focus:ring-amber-500 cursor-pointer h-4 w-4"
                />
                <label htmlFor="allow_bank_rules" className="text-[11px] font-medium text-slate-650 dark:text-slate-400 cursor-pointer select-none">
                  Permitir que a IA acesse as regras e taxas ativas do Simulador de Financiamento.
                </label>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  Instruções Adicionais para Simulações
                </Label>
                <Textarea
                  value={simCustomInstructions}
                  onChange={(e) => setSimCustomInstructions(e.target.value)}
                  placeholder="Ex: Priorize simulações da Caixa Econômica. Diga que aceitamos FGTS como parte do pagamento da entrada."
                  className="rounded-xl border-slate-200 text-xs dark:border-slate-850 min-h-[70px] resize-y"
                />
              </div>

              <div className="flex justify-end border-t border-slate-100 pt-3 dark:border-slate-850">
                <Button
                  size="sm"
                  onClick={handleSaveSim}
                  disabled={isSaving}
                  className="rounded-xl bg-slate-900 text-white font-semibold text-xs px-4 dark:bg-slate-50 dark:text-slate-950"
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" /> Salvar Configurações
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Plug 5: Discord Notifications */}
        <Card className="rounded-[22px] border-slate-200/80 p-5 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-slate-350 dark:hover:border-slate-700">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 dark:border-slate-850">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5865F2]/10 text-[#5865F2] dark:bg-[#5865F2]/20">
                <Webhook className="h-5 w-5" />
              </span>
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  Notificações Discord <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full dark:bg-amber-900/50 dark:text-amber-400">NOVO</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Permite à IA disparar alertas automáticos no Discord sempre que uma regra definida for atingida na conversa.
                </p>
              </div>
            </div>
            <Switch
              checked={isPlugEnabled("discord_notifications")}
              disabled={isSaving}
              onCheckedChange={(checked) => handleTogglePlug("discord_notifications", checked)}
            />
          </div>

          {isPlugEnabled("discord_notifications") && (
            <div className="mt-4 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  Webhook URL (Discord)
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://discord.com/api/webhooks/..."
                    value={discordWebhookUrl}
                    onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                    className="border-slate-200 bg-slate-50 focus-visible:ring-amber-500 dark:border-slate-800 dark:bg-slate-950/50"
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => pingDiscordMut.mutate()} 
                    disabled={pingDiscordMut.isPending || !discordWebhookUrl}
                    className="shrink-0 gap-2 text-[#5865F2] border-[#5865F2]/30 hover:bg-[#5865F2]/10"
                  >
                    <Bell className="h-4 w-4" />
                    Ping de Teste
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
                    Regra de Disparo (Quando notificar?)
                  </Label>
                  <Textarea
                    placeholder="Ex: Dispare uma notificação quando o cliente afirmar que quer agendar uma visita ou perguntar sobre os valores das parcelas."
                    value={discordTriggerInstructions}
                    onChange={(e) => setDiscordTriggerInstructions(e.target.value)}
                    className="min-h-[100px] border-slate-200 bg-slate-50 focus-visible:ring-amber-500 dark:border-slate-800 dark:bg-slate-950/50"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
                    Formato da Mensagem (Template)
                  </Label>
                  <Textarea
                    placeholder="Ex: 🚨 Novo Lead Interessado! O cliente (telefone: {telefone}) solicitou os preços do imóvel."
                    value={discordNotificationTemplate}
                    onChange={(e) => setDiscordNotificationTemplate(e.target.value)}
                    className="min-h-[100px] border-slate-200 bg-slate-50 focus-visible:ring-amber-500 dark:border-slate-800 dark:bg-slate-950/50 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveDiscord} disabled={isSaving} className="gap-2 bg-slate-800 hover:bg-slate-700 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 shadow-sm rounded-xl px-6">
                  <Save className="h-4 w-4" />
                  Salvar Configuração do Discord
                </Button>
              </div>
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
