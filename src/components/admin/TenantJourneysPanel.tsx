import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2, Languages } from "lucide-react";

import {
  META_CONTENT_DEFAULT_CONFIG,
  TRELLO_DEFAULT_STATE_MACHINE,
  TRELLO_JOURNEY_KEY,
  TRELLO_JOURNEY_NAME,
  TRELLO_SECTOR_NAME,
} from "@/lib/journeys/catalog";
import { JourneyConfig } from "@/lib/journeys/types";

type SectorRow = {
  id: string;
  name: string;
  description: string | null;
};

type JourneyRow = {
  id: string;
  sector_id: string | null;
  key: string;
  name: string;
  description: string | null;
  is_crm?: boolean;
  default_state_machine_json?: any;
};

type TenantSectorRow = {
  id: string;
  sector_id: string;
  enabled: boolean;
};

type TenantJourneyRow = {
  id: string;
  journey_id: string;
  enabled: boolean;
  config_json: any;
};

function normalizeStateKey(s: string) {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\-]/g, "")
    .slice(0, 48);
}

function move<T>(arr: T[], from: number, to: number) {
  const copy = [...arr];
  const [it] = copy.splice(from, 1);
  copy.splice(to, 0, it);
  return copy;
}

function safeJsonParse(s: string) {
  try {
    return { ok: true as const, value: JSON.parse(s) };
  } catch (e: any) {
    return { ok: false as const, error: e?.message ?? "JSON inválido" };
  }
}

function deepMerge(a: any, b: any) {
  if (Array.isArray(a) || Array.isArray(b)) return b;
  if (typeof a !== "object" || a === null) return b;
  if (typeof b !== "object" || b === null) return b;
  const out: any = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out;
}

export function TenantJourneysPanel() {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();

  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [configDraft, setConfigDraft] = useState<string>("{}");
  const [savingConfig, setSavingConfig] = useState(false);

  // UI labels (catalog-level)
  const [journeyNameDraft, setJourneyNameDraft] = useState<string>("");
  const [stateLabelsDraft, setStateLabelsDraft] = useState<Record<string, string>>({});
  const [savingUiLabels, setSavingUiLabels] = useState(false);

  // ---- Create sector/journey (catalog) ----
  const [creatingSector, setCreatingSector] = useState(false);
  const [sectorName, setSectorName] = useState("");
  const [sectorDesc, setSectorDesc] = useState("");

  const [creatingJourney, setCreatingJourney] = useState(false);
  const [journeySectorId, setJourneySectorId] = useState<string>("");
  const [journeyKey, setJourneyKey] = useState("");
  const [journeyName, setJourneyName] = useState("");
  const [journeyDesc, setJourneyDesc] = useState("");
  const [journeyIsCrm, setJourneyIsCrm] = useState(false);

  const [savingCatalogFlags, setSavingCatalogFlags] = useState(false);
  const [bootstrappingTrello, setBootstrappingTrello] = useState(false);

  // state machine builder (UI)
  const [stateDraft, setStateDraft] = useState("");
  const [states, setStates] = useState<string[]>([
    "new",
    "in_progress",
    "ready_for_review",
    "confirmed",
    "finalized",
  ]);
  const [defaultState, setDefaultState] = useState<string>("new");

  const stateMachineJson = useMemo(() => {
    const unique = Array.from(new Set(states.map((s) => normalizeStateKey(s)).filter(Boolean)));
    const def = unique.includes(defaultState) ? defaultState : unique[0] ?? "new";
    return { states: unique, default: def };
  }, [states, defaultState]);

  const sectorsQ = useQuery({
    queryKey: ["sectors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sectors")
        .select("id,name,description")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SectorRow[];
    },
  });

  const journeysQ = useQuery({
    queryKey: ["journeys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journeys")
        .select("id,sector_id,key,name,description,is_crm,default_state_machine_json")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as JourneyRow[];
    },
  });

  const tenantSectorsQ = useQuery({
    queryKey: ["tenant_sectors", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_sectors")
        .select("id,sector_id,enabled")
        .eq("tenant_id", activeTenantId!)
        .limit(500);
      if (error) throw error;
      return (data ?? []) as TenantSectorRow[];
    },
  });

  const tenantJourneysQ = useQuery({
    queryKey: ["tenant_journeys", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("id,journey_id,enabled,config_json")
        .eq("tenant_id", activeTenantId!)
        .limit(500);
      if (error) throw error;
      return (data ?? []) as TenantJourneyRow[];
    },
  });

  const tenantSectorBySectorId = useMemo(() => {
    const m = new Map<string, TenantSectorRow>();
    for (const r of tenantSectorsQ.data ?? []) m.set(r.sector_id, r);
    return m;
  }, [tenantSectorsQ.data]);

  const tenantJourneyByJourneyId = useMemo(() => {
    const m = new Map<string, TenantJourneyRow>();
    for (const r of tenantJourneysQ.data ?? []) m.set(r.journey_id, r);
    return m;
  }, [tenantJourneysQ.data]);

  const journeyKeyById = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of journeysQ.data ?? []) m.set(j.id, j.key);
    return m;
  }, [journeysQ.data]);

  const journeysBySector = useMemo(() => {
    const m = new Map<string, JourneyRow[]>();
    for (const j of journeysQ.data ?? []) {
      const sid = j.sector_id ?? "__none__";
      if (!m.has(sid)) m.set(sid, []);
      m.get(sid)!.push(j);
    }
    return m;
  }, [journeysQ.data]);

  const selectedJourney = useMemo(() => {
    if (!selectedJourneyId) return null;
    return (journeysQ.data ?? []).find((j) => j.id === selectedJourneyId) ?? null;
  }, [journeysQ.data, selectedJourneyId]);

  const journeyStates = useMemo(() => {
    const raw = (selectedJourney?.default_state_machine_json?.states ?? []) as any[];
    const list = Array.isArray(raw) ? raw.map((s) => String(s)).filter(Boolean) : [];
    return Array.from(new Set(list));
  }, [selectedJourney]);

  // keep ui label drafts in sync with selection
  useEffect(() => {
    if (!selectedJourney) {
      setJourneyNameDraft("");
      setStateLabelsDraft({});
      return;
    }

    setJourneyNameDraft(selectedJourney.name ?? "");

    const labelsObj =
      (selectedJourney.default_state_machine_json?.labels ??
        selectedJourney.default_state_machine_json?.state_labels ??
        {}) as any;

    const next: Record<string, string> = {};
    for (const k of journeyStates) {
      const v = labelsObj?.[k];
      next[k] = typeof v === "string" ? v : "";
    }

    // include labels for unknown keys too (if present)
    if (labelsObj && typeof labelsObj === "object") {
      for (const [k, v] of Object.entries(labelsObj)) {
        if (!(k in next)) next[k] = typeof v === "string" ? v : "";
      }
    }

    setStateLabelsDraft(next);
  }, [selectedJourneyId, selectedJourney?.id, journeyStates.join(",")]);

  const selectedTenantJourney = useMemo(() => {
    if (!selectedJourneyId) return null;
    return tenantJourneyByJourneyId.get(selectedJourneyId) ?? null;
  }, [selectedJourneyId, tenantJourneyByJourneyId]);

  // keep draft in sync with selection
  useEffect(() => {
    const next = selectedTenantJourney?.config_json ?? {};
    setConfigDraft(JSON.stringify(next, null, 2));
  }, [selectedJourneyId, selectedTenantJourney]);

  const configParsed = useMemo(() => safeJsonParse(configDraft), [configDraft]);
  const configObj = configParsed.ok ? (configParsed.value ?? {}) : null;

  const updateConfig = (patch: any) => {
    const base = configObj ?? {};
    const next = deepMerge(base, patch);
    setConfigDraft(JSON.stringify(next, null, 2));
  };

  const ocrEnabled = Boolean((configObj as any)?.automation?.ocr?.enabled);
  const ocrProvider = String((configObj as any)?.automation?.ocr?.provider ?? "google_vision");
  const createDefaultPendencies = Boolean(
    (configObj as any)?.automation?.on_image?.create_default_pendencies
  );
  const onImageInitialState = (configObj as any)?.automation?.on_image?.initial_state ?? "";

  const createCaseOnText = (configObj as any)?.automation?.on_text?.create_case ?? true;
  const onTextInitialState = (configObj as any)?.automation?.on_text?.initial_state ?? "";

  const convAutoCreateVendor = (configObj as any)?.automation?.conversations?.auto_create_vendor ?? true;
  const convRequireVendor = Boolean((configObj as any)?.automation?.conversations?.require_vendor);

  const createCaseOnLocation = Boolean((configObj as any)?.automation?.on_location?.create_case);
  const onLocationInitialState = (configObj as any)?.automation?.on_location?.initial_state ?? "";

  const onLocationNextState = (configObj as any)?.automation?.on_location?.next_state ?? "";

  const presenceEnabledFlag = Boolean((configObj as any)?.flags?.presence_enabled);
  const presenceAllowWhatsapp = Boolean((configObj as any)?.flags?.presence_allow_whatsapp_clocking);
  const presenceTimeZone = String((configObj as any)?.presence?.time_zone ?? "America/Sao_Paulo");
  const presenceScheduledStart = String((configObj as any)?.presence?.scheduled_start_hhmm ?? "08:00");
  const presencePlannedMinutes = String((configObj as any)?.presence?.planned_minutes ?? 480);

  const metaContentEnabled = Boolean(
    (configObj as any)?.meta_content_enabled ?? META_CONTENT_DEFAULT_CONFIG.meta_content_enabled
  );
  const metaAutopublishStories = Boolean(
    (configObj as any)?.meta_autopublish_stories ?? META_CONTENT_DEFAULT_CONFIG.meta_autopublish_stories
  );
  const metaAutopublishFeed = Boolean(
    (configObj as any)?.meta_autopublish_feed ?? META_CONTENT_DEFAULT_CONFIG.meta_autopublish_feed
  );
  const metaAutopublishReels = Boolean(
    (configObj as any)?.meta_autopublish_reels ?? META_CONTENT_DEFAULT_CONFIG.meta_autopublish_reels
  );
  const calendarImportExportEnabled = Boolean(
    (configObj as any)?.calendar_import_export_enabled ??
    META_CONTENT_DEFAULT_CONFIG.calendar_import_export_enabled
  );

  const bootstrapTrelloJourney = async () => {
    setBootstrappingTrello(true);
    try {
      // 1) sector: Operações
      let sectorId: string | null = null;
      const { data: sectorExisting, error: sectorSelErr } = await supabase
        .from("sectors")
        .select("id")
        .eq("name", TRELLO_SECTOR_NAME)
        .limit(1)
        .maybeSingle();
      if (sectorSelErr) throw sectorSelErr;

      if (sectorExisting?.id) {
        sectorId = sectorExisting.id;
      } else {
        const { data: sectorInserted, error: sectorInsErr } = await supabase
          .from("sectors")
          .insert({
            name: TRELLO_SECTOR_NAME,
            description: "Fluxos internos (estilo Trello / gerenciamento)",
          })
          .select("id")
          .single();
        if (sectorInsErr) throw sectorInsErr;
        sectorId = sectorInserted.id;
      }

      // 2) journey: key=trello
      const { data: journeyExisting, error: journeySelErr } = await supabase
        .from("journeys")
        .select("id")
        .eq("key", TRELLO_JOURNEY_KEY)
        .limit(1)
        .maybeSingle();
      if (journeySelErr) throw journeySelErr;

      if (!journeyExisting?.id) {
        const { error: journeyInsErr } = await supabase.from("journeys").insert({
          sector_id: sectorId,
          key: TRELLO_JOURNEY_KEY,
          name: TRELLO_JOURNEY_NAME,
          description:
            "Jornada padrão (estilo Trello) para cards internos com responsável, tarefas, anexos, prazo e timeline.",
          default_state_machine_json: TRELLO_DEFAULT_STATE_MACHINE,
          is_crm: false,
        });
        if (journeyInsErr) throw journeyInsErr;
      }

      showSuccess("Catálogo Trello (Byfrost) criado/atualizado. Agora você pode ativar no tenant.");
      await qc.invalidateQueries({ queryKey: ["sectors"] });
      await qc.invalidateQueries({ queryKey: ["journeys"] });
    } catch (e: any) {
      showError(`Falha ao criar catálogo Trello: ${e?.message ?? "erro"}`);
    } finally {
      setBootstrappingTrello(false);
    }
  };

  const createSector = async () => {
    if (!sectorName.trim()) return;
    setCreatingSector(true);
    try {
      const { error } = await supabase.from("sectors").insert({
        name: sectorName.trim(),
        description: sectorDesc.trim() || null,
      });
      if (error) throw error;
      showSuccess("Setor criado.");
      setSectorName("");
      setSectorDesc("");
      await qc.invalidateQueries({ queryKey: ["sectors"] });
    } catch (e: any) {
      showError(`Falha ao criar setor: ${e?.message ?? "erro"}`);
    } finally {
      setCreatingSector(false);
    }
  };

  const createJourney = async () => {
    if (!journeyName.trim() || !journeyKey.trim()) return;

    const uniqueStates = stateMachineJson.states;
    if (uniqueStates.length < 2) {
      showError("Adicione ao menos 2 estados (ex.: new, in_progress). ");
      return;
    }

    setCreatingJourney(true);
    try {
      const { error } = await supabase.from("journeys").insert({
        sector_id: journeySectorId || null,
        key: journeyKey.trim(),
        name: journeyName.trim(),
        description: journeyDesc.trim() || null,
        is_crm: journeyIsCrm,
        default_state_machine_json: stateMachineJson,
      });
      if (error) throw error;

      showSuccess("Jornada criada.");
      setJourneyKey("");
      setJourneyName("");
      setJourneyDesc("");
      setJourneyIsCrm(false);
      await qc.invalidateQueries({ queryKey: ["journeys"] });
    } catch (e: any) {
      showError(`Falha ao criar jornada: ${e?.message ?? "erro"}`);
    } finally {
      setCreatingJourney(false);
    }
  };

  const updateJourneyCatalog = async (journeyId: string, patch: Partial<Pick<JourneyRow, "is_crm">>) => {
    setSavingCatalogFlags(true);
    try {
      const { error } = await supabase.from("journeys").update(patch).eq("id", journeyId);
      if (error) throw error;
      showSuccess("Catálogo atualizado.");
      await qc.invalidateQueries({ queryKey: ["journeys"] });
    } catch (e: any) {
      // journeys_update is super-admin only
      showError(`Falha ao atualizar catálogo (RLS): ${e?.message ?? "erro"}`);
    } finally {
      setSavingCatalogFlags(false);
    }
  };

  const saveUiLabels = async () => {
    if (!selectedJourney?.id) return;
    if (!journeyNameDraft.trim()) {
      showError("Informe um nome para a jornada.");
      return;
    }

    setSavingUiLabels(true);
    try {
      const base = selectedJourney.default_state_machine_json ?? {};
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(stateLabelsDraft ?? {})) {
        const vv = String(v ?? "").trim();
        if (vv) cleaned[k] = vv;
      }

      const nextJson = { ...base, labels: cleaned };

      const { error } = await supabase
        .from("journeys")
        .update({
          name: journeyNameDraft.trim(),
          default_state_machine_json: nextJson,
        } as any)
        .eq("id", selectedJourney.id);

      if (error) throw error;

      showSuccess("Nomes e rótulos salvos.");
      await qc.invalidateQueries({ queryKey: ["journeys"] });
    } catch (e: any) {
      showError(`Falha ao salvar rótulos: ${e?.message ?? "erro"}`);
    } finally {
      setSavingUiLabels(false);
    }
  };

  const addState = () => {
    const key = normalizeStateKey(stateDraft);
    if (!key) return;
    setStates((prev) => {
      if (prev.map(normalizeStateKey).includes(key)) return prev;
      return [...prev, key];
    });
    setStateDraft("");
  };

  const removeState = (s: string) => {
    setStates((prev) => prev.filter((x) => normalizeStateKey(x) !== normalizeStateKey(s)));
    if (defaultState === s) {
      setDefaultState((states[0] ?? "new") as string);
    }
  };

  const toggleSector = async (sectorId: string, enabled: boolean) => {
    if (!activeTenantId) return;
    try {
      const existing = tenantSectorBySectorId.get(sectorId);
      if (existing) {
        const { error } = await supabase
          .from("tenant_sectors")
          .update({ enabled })
          .eq("tenant_id", activeTenantId)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tenant_sectors").insert({
          tenant_id: activeTenantId,
          sector_id: sectorId,
          enabled,
        });
        if (error) throw error;
      }

      await qc.invalidateQueries({ queryKey: ["tenant_sectors", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao atualizar setor: ${e?.message ?? "erro"}`);
    }
  };

  const toggleJourney = async (journeyId: string, enabled: boolean) => {
    if (!activeTenantId) return;
    try {
      const existing = tenantJourneyByJourneyId.get(journeyId);
      if (existing) {
        const { error } = await supabase
          .from("tenant_journeys")
          .update({ enabled })
          .eq("tenant_id", activeTenantId)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const key = journeyKeyById.get(journeyId) ?? "";
        const config_json = key === "meta_content" ? META_CONTENT_DEFAULT_CONFIG : {};

        const { error } = await supabase.from("tenant_journeys").insert({
          tenant_id: activeTenantId,
          journey_id: journeyId,
          enabled,
          config_json,
        });
        if (error) throw error;
      }

      await qc.invalidateQueries({ queryKey: ["tenant_journeys", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao atualizar jornada: ${e?.message ?? "erro"}`);
    }
  };

  const saveJourneyConfig = async () => {
    if (!activeTenantId || !selectedJourneyId) return;
    setSavingConfig(true);
    try {
      const parsed = safeJsonParse(configDraft);
      if (!parsed.ok) {
        showError(`Config JSON inválido: ${parsed.error}`);
        return;
      }

      const existing = tenantJourneyByJourneyId.get(selectedJourneyId);
      if (!existing) {
        const { error } = await supabase.from("tenant_journeys").insert({
          tenant_id: activeTenantId,
          journey_id: selectedJourneyId,
          enabled: true,
          config_json: parsed.value,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("tenant_journeys")
          .update({ config_json: parsed.value })
          .eq("tenant_id", activeTenantId)
          .eq("id", existing.id);
        if (error) throw error;
      }

      showSuccess("Config da jornada salva.");
      await qc.invalidateQueries({ queryKey: ["tenant_journeys", activeTenantId] });
    } catch (e: any) {
      showError(`Falha ao salvar config: ${e?.message ?? "erro"}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const applyOcrDefaults = () => {
    if (!selectedJourney) return;
    const st = journeyStates;
    const initial =
      st.includes("awaiting_ocr")
        ? "awaiting_ocr"
        : st.includes(String(selectedJourney.default_state_machine_json?.default ?? ""))
          ? String(selectedJourney.default_state_machine_json?.default ?? "")
          : st[0] ?? "new";

    const afterLocation =
      st.includes("ready_for_review")
        ? "ready_for_review"
        : st.includes("in_progress")
          ? "in_progress"
          : st[0] ?? "new";

    updateConfig({
      automation: {
        ocr: { enabled: true, provider: "google_vision" },
        on_image: {
          initial_state: initial,
          create_default_pendencies: selectedJourney.key === "sales_order",
        },
        on_location: {
          next_state: afterLocation,
        },
      },
    });
  };

  if (!activeTenantId) {
    return (
      <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Selecione um tenant (botão "Trocar") para configurar setores e jornadas.
      </div>
    );
  }

  const sectors = sectorsQ.data ?? [];
  const noneSectorJourneys = journeysBySector.get("__none__") ?? [];

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[22px] border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Criar setor (catálogo)</div>
          <div className="mt-1 text-xs text-slate-500">Setores são globais e reutilizáveis entre tenants.</div>

          <div className="mt-4 grid gap-3">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input
                value={sectorName}
                onChange={(e) => setSectorName(e.target.value)}
                className="mt-1 rounded-2xl"
                placeholder="Ex: Vendas"
              />
            </div>
            <div>
              <Label className="text-xs">Descrição (opcional)</Label>
              <Input
                value={sectorDesc}
                onChange={(e) => setSectorDesc(e.target.value)}
                className="mt-1 rounded-2xl"
                placeholder="Ex: Fluxos de captura de pedido"
              />
            </div>
            <Button
              onClick={createSector}
              disabled={creatingSector || !sectorName.trim()}
              className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
            >
              {creatingSector ? "Criando…" : "Criar setor"}
            </Button>
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Criar jornada/fluxo (catálogo)</div>
          <div className="mt-1 text-xs text-slate-500">
            Estados são montados pela UI; por baixo, viram JSON em <span className="font-medium">journeys.default_state_machine_json</span>.
          </div>

          <div className="mt-4 grid gap-3">
            <div>
              <Label className="text-xs">Setor (opcional)</Label>
              <select
                value={journeySectorId}
                onChange={(e) => setJourneySectorId(e.target.value)}
                className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-[hsl(var(--byfrost-accent)/0.45)] outline-none"
              >
                <option value="">Sem setor</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Key (única)</Label>
                <Input
                  value={journeyKey}
                  onChange={(e) => setJourneyKey(e.target.value)}
                  className="mt-1 rounded-2xl"
                  placeholder="Ex: sales_order"
                />
              </div>
              <div>
                <Label className="text-xs">Nome</Label>
                <Input
                  value={journeyName}
                  onChange={(e) => setJourneyName(e.target.value)}
                  className="mt-1 rounded-2xl"
                  placeholder="Ex: Pedido (WhatsApp + Foto)"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Descrição (opcional)</Label>
              <Input
                value={journeyDesc}
                onChange={(e) => setJourneyDesc(e.target.value)}
                className="mt-1 rounded-2xl"
                placeholder="Ex: Captura por foto com OCR"
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div>
                <div className="text-sm font-medium text-slate-900">Fluxo estilo CRM</div>
                <div className="mt-0.5 text-xs text-slate-600">
                  Marca o fluxo para que o painel /app habilite recursos de CRM (drag, busca, cliente, tarefas, observações).
                </div>
              </div>
              <Switch checked={journeyIsCrm} onCheckedChange={setJourneyIsCrm} />
            </div>

            <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-900">Estados do fluxo</div>
              <div className="mt-1 text-[11px] text-slate-600">
                Dica: use chaves curtas (ex.: <span className="font-mono">awaiting_ocr</span>). A UI normaliza.
              </div>

              <div className="mt-3 flex gap-2">
                <Input
                  value={stateDraft}
                  onChange={(e) => setStateDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addState();
                    }
                  }}
                  className="h-10 flex-1 rounded-2xl bg-white"
                  placeholder="novo estado (ex: awaiting_location)"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 rounded-2xl"
                  onClick={addState}
                  disabled={!normalizeStateKey(stateDraft)}
                >
                  <Plus className="mr-2 h-4 w-4" /> Adicionar
                </Button>
              </div>

              <div className="mt-3 space-y-2">
                {stateMachineJson.states.map((s, idx) => (
                  <div
                    key={s}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-2xl border px-3 py-2",
                      defaultState === s ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white/70"
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => setDefaultState(s)}
                      title="Definir como estado inicial"
                    >
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          defaultState === s ? "bg-emerald-600" : "bg-slate-300"
                        )}
                      />
                      <span className="truncate text-sm font-medium text-slate-900">{s}</span>
                      {defaultState === s && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                          inicial
                        </span>
                      )}
                    </button>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-8 w-8 rounded-xl p-0"
                        disabled={idx === 0}
                        onClick={() => setStates((prev) => move(prev, idx, idx - 1))}
                        title="Subir"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-8 w-8 rounded-xl p-0"
                        disabled={idx === stateMachineJson.states.length - 1}
                        onClick={() => setStates((prev) => move(prev, idx, idx + 1))}
                        title="Descer"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-8 w-8 rounded-xl p-0"
                        disabled={stateMachineJson.states.length <= 1}
                        onClick={() => removeState(s)}
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="rounded-2xl border border-slate-200 bg-white/70 p-2">
                  <div className="text-[11px] font-semibold text-slate-700">JSON gerado</div>
                  <pre className="mt-1 max-h-[120px] overflow-auto text-[11px] text-slate-700">
                    {JSON.stringify(stateMachineJson, null, 2)}
                  </pre>
                </div>
              </div>
            </div>

            <Button
              onClick={createJourney}
              disabled={creatingJourney || !journeyKey.trim() || !journeyName.trim()}
              className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
            >
              {creatingJourney ? "Criando…" : "Criar jornada"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[22px] border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Ativar fluxos para este tenant</div>
              <div className="mt-1 text-xs text-slate-500">
                Use os toggles para habilitar setores e jornadas. Isso grava em <span className="font-medium">tenant_sectors</span> e <span className="font-medium">tenant_journeys</span>.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={bootstrapTrelloJourney}
                disabled={bootstrappingTrello}
                className="h-9 rounded-2xl"
                title="Cria o setor Operações e a jornada Trello (Byfrost) no catálogo caso a migration ainda não tenha sido aplicada."
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {bootstrappingTrello ? "Criando Trello…" : "Criar Trello (Byfrost)"}
              </Button>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                tenant_id: <span className="font-medium text-slate-900">{activeTenantId.slice(0, 8)}…</span>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {sectors.map((s) => {
              const ts = tenantSectorBySectorId.get(s.id);
              const sectorEnabled = ts?.enabled ?? false;
              const list = journeysBySector.get(s.id) ?? [];

              return (
                <div key={s.id} className="rounded-[20px] border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{s.name}</div>
                      {s.description && (
                        <div className="mt-0.5 text-xs text-slate-600">{s.description}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500">habilitado</span>
                      <Switch checked={sectorEnabled} onCheckedChange={(v) => toggleSector(s.id, v)} />
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2">
                    {list.map((j) => {
                      const tj = tenantJourneyByJourneyId.get(j.id);
                      const enabled = tj?.enabled ?? false;
                      const selected = selectedJourneyId === j.id;

                      return (
                        <button
                          key={j.id}
                          type="button"
                          onClick={() => setSelectedJourneyId(j.id)}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left transition",
                            selected
                              ? "border-[hsl(var(--byfrost-accent)/0.45)] bg-white"
                              : "border-slate-200 bg-white/60 hover:bg-white"
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-xs font-semibold text-slate-900">{j.name}</div>
                              {j.is_crm ? (
                                <span className="rounded-full bg-[hsl(var(--byfrost-accent)/0.12)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--byfrost-accent))]">
                                  CRM
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 truncate text-[11px] text-slate-500">key: {j.key}</div>
                          </div>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[11px] text-slate-500">on</span>
                            <Switch checked={enabled} onCheckedChange={(v) => toggleJourney(j.id, v)} />
                          </div>
                        </button>
                      );
                    })}

                    {list.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-3 text-xs text-slate-500">
                        Sem jornadas neste setor.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {noneSectorJourneys.length > 0 && (
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-semibold text-slate-900">Jornadas sem setor</div>
                <div className="mt-3 grid gap-2">
                  {noneSectorJourneys.map((j) => {
                    const tj = tenantJourneyByJourneyId.get(j.id);
                    const enabled = tj?.enabled ?? false;
                    const selected = selectedJourneyId === j.id;

                    return (
                      <button
                        key={j.id}
                        type="button"
                        onClick={() => setSelectedJourneyId(j.id)}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left transition",
                          selected
                            ? "border-[hsl(var(--byfrost-accent)/0.45)] bg-white"
                            : "border-slate-200 bg-white/60 hover:bg-white"
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-xs font-semibold text-slate-900">{j.name}</div>
                            {j.is_crm ? (
                              <span className="rounded-full bg-[hsl(var(--byfrost-accent)/0.12)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--byfrost-accent))]">
                                CRM
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-slate-500">key: {j.key}</div>
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[11px] text-slate-500">on</span>
                          <Switch checked={enabled} onCheckedChange={(v) => toggleJourney(j.id, v)} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Automação do fluxo (por tenant)</div>
          <div className="mt-1 text-xs text-slate-500">
            Configure aqui como o WhatsApp deve tratar <span className="font-medium">imagens</span> e <span className="font-medium">OCR</span> para esta jornada.
          </div>

          {!selectedJourney ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Selecione uma jornada à esquerda para configurar.
            </div>
          ) : !configParsed.ok ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              config_json inválido: {configParsed.error}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">{selectedJourney.name}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">key: {selectedJourney.key}</div>
                  </div>

                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[11px] text-slate-500">CRM</div>
                    <Switch
                      checked={Boolean(selectedJourney.is_crm)}
                      disabled={savingCatalogFlags}
                      onCheckedChange={(v) => updateJourneyCatalog(selectedJourney.id, { is_crm: v })}
                    />
                  </div>
                </div>

                <div className="mt-2 text-[11px] text-slate-500">
                  Essa flag é do <span className="font-medium">catálogo (journeys)</span> e é protegida por RLS (apenas super-admin).
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">Nomes amigáveis (UI)</div>
                    <div className="mt-0.5 text-[11px] text-slate-600">
                      Traduza os estados sem mudar as chaves técnicas. Esses rótulos também serão usados na timeline (estado alterado).
                    </div>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
                    <Languages className="h-5 w-5" />
                  </div>
                </div>

                <div className="mt-3 grid gap-3">
                  <div>
                    <Label className="text-xs">Nome da jornada</Label>
                    <Input
                      value={journeyNameDraft}
                      onChange={(e) => setJourneyNameDraft(e.target.value)}
                      className="mt-1 rounded-2xl"
                      placeholder="Ex: CRM - Leads"
                    />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold text-slate-700">Rótulos de estados</div>
                    <div className="mt-1 text-[11px] text-slate-600">
                      Deixe vazio para usar o fallback automático (title-case).
                    </div>

                    <div className="mt-3 grid gap-2">
                      {(journeyStates.length ? journeyStates : Object.keys(stateLabelsDraft)).map((st) => (
                        <div key={st} className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
                            {st}
                          </div>
                          <Input
                            value={stateLabelsDraft[st] ?? ""}
                            onChange={(e) =>
                              setStateLabelsDraft((prev) => ({ ...prev, [st]: e.target.value }))
                            }
                            className="h-10 rounded-2xl bg-white"
                            placeholder="Ex: Em andamento"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={saveUiLabels}
                    disabled={savingUiLabels}
                    className="h-11 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    {savingUiLabels ? "Salvando…" : "Salvar nomes e rótulos"}
                  </Button>

                  <div className="text-[11px] text-slate-500">
                    Obs: isso atualiza o catálogo (<span className="font-mono">journeys</span>) e requer permissão de super-admin.
                  </div>
                </div>
              </div>

              {selectedJourney.key === "meta_content" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-semibold text-slate-900">Meta Content</div>
                  <div className="mt-1 text-[11px] text-slate-600">
                    Jornada <span className="font-semibold">opcional</span> por tenant. Estes flags vivem em
                    <span className="font-mono"> tenant_journeys.config_json</span>.
                  </div>

                  <div className="mt-3 grid gap-2">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-900">meta_content_enabled</div>
                        <div className="mt-0.5 text-[11px] text-slate-600">Habilita a jornada para este tenant.</div>
                      </div>
                      <Switch
                        checked={metaContentEnabled}
                        onCheckedChange={(v) => updateConfig({ meta_content_enabled: v })}
                      />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-900">meta_autopublish_stories</div>
                          <div className="mt-0.5 text-[11px] text-slate-600">Permite autopublicar Stories.</div>
                        </div>
                        <Switch
                          checked={metaAutopublishStories}
                          onCheckedChange={(v) => updateConfig({ meta_autopublish_stories: v })}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-900">meta_autopublish_feed</div>
                          <div className="mt-0.5 text-[11px] text-slate-600">Permite autopublicar Feed.</div>
                        </div>
                        <Switch
                          checked={metaAutopublishFeed}
                          onCheckedChange={(v) => updateConfig({ meta_autopublish_feed: v })}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-900">meta_autopublish_reels</div>
                          <div className="mt-0.5 text-[11px] text-slate-600">Permite autopublicar Reels.</div>
                        </div>
                        <Switch
                          checked={metaAutopublishReels}
                          onCheckedChange={(v) => updateConfig({ meta_autopublish_reels: v })}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-900">calendar_import_export_enabled</div>
                          <div className="mt-0.5 text-[11px] text-slate-600">Habilita import/export de calendário.</div>
                        </div>
                        <Switch
                          checked={calendarImportExportEnabled}
                          onCheckedChange={(v) => updateConfig({ calendar_import_export_enabled: v })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedJourney.key === "presence" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-semibold text-slate-900">Presença (Ponto Digital)</div>
                  <div className="mt-1 text-[11px] text-slate-600">
                    Esta é uma jornada <span className="font-semibold">opcional</span>. A UI de ponto só aparece quando a flag estiver ativa.
                  </div>

                  <div className="mt-3 grid gap-2">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-900">presence_enabled</div>
                        <div className="mt-0.5 text-[11px] text-slate-600">
                          Habilita funcionalidades de ponto para este tenant.
                        </div>
                      </div>
                      <Switch
                        checked={presenceEnabledFlag}
                        onCheckedChange={(v) => updateConfig({ flags: { presence_enabled: v } })}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-900">presence_allow_whatsapp_clocking</div>
                        <div className="mt-0.5 text-[11px] text-slate-600">
                          Quando true, permite batidas via WhatsApp (ENTRADA/SAIDA/INTERVALO/VOLTEI + localização).
                        </div>
                      </div>
                      <Switch
                        checked={presenceAllowWhatsapp}
                        onCheckedChange={(v) => updateConfig({ flags: { presence_allow_whatsapp_clocking: v } })}
                      />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <Label className="text-xs">Time zone</Label>
                        <Input
                          value={presenceTimeZone}
                          onChange={(e) => updateConfig({ presence: { time_zone: e.target.value } })}
                          className="mt-1 rounded-2xl"
                          placeholder="America/Sao_Paulo"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Entrada (HH:MM)</Label>
                        <Input
                          value={presenceScheduledStart}
                          onChange={(e) => updateConfig({ presence: { scheduled_start_hhmm: e.target.value } })}
                          className="mt-1 rounded-2xl"
                          placeholder="08:00"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Minutos planejados</Label>
                        <Input
                          value={presencePlannedMinutes}
                          onChange={(e) => updateConfig({ presence: { planned_minutes: Number(e.target.value) || 0 } })}
                          className="mt-1 rounded-2xl"
                          placeholder="480"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">Conversas (texto / áudio)</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      Defina se uma mensagem de texto deve <span className="font-medium">abrir um case automaticamente</span> quando não existir um case ativo para o número.
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2">
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-900">Criar case ao receber texto</div>
                      <div className="mt-0.5 text-[11px] text-slate-600">
                        Se desligado, textos entram como log em <span className="font-medium">wa_messages</span>, mas não aparecem no Dashboard.
                      </div>
                    </div>
                    <Switch
                      checked={createCaseOnText}
                      onCheckedChange={(v) => updateConfig({ automation: { on_text: { create_case: v } } })}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-900">Auto-criar vendedor ao receber mensagem</div>
                      <div className="mt-0.5 text-[11px] text-slate-600">
                        Se ligado, o sistema cria um registro em <span className="font-medium">vendors</span> automaticamente quando ainda não existir.
                      </div>
                    </div>
                    <Switch
                      checked={convAutoCreateVendor}
                      onCheckedChange={(v) =>
                        updateConfig({ automation: { conversations: { auto_create_vendor: v } } })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-900">Exigir vendedor identificado para abrir case</div>
                      <div className="mt-0.5 text-[11px] text-slate-600">
                        Se ligado, o case só abre quando o número for identificado como vendedor (via cadastro ou auto-criação).
                      </div>
                    </div>
                    <Switch
                      checked={convRequireVendor}
                      onCheckedChange={(v) =>
                        updateConfig({ automation: { conversations: { require_vendor: v } } })
                      }
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <Label className="text-xs">Estado inicial ao abrir por texto</Label>
                  <select
                    value={onTextInitialState}
                    onChange={(e) => updateConfig({ automation: { on_text: { initial_state: e.target.value } } })}
                    className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                  >
                    <option value="">(usar default da jornada)</option>
                    {journeyStates.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">Localização</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      Útil quando seu fluxo depende de localização e você quer que ela também possa abrir o case.
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">Criar case ao receber localização</div>
                    <div className="mt-0.5 text-[11px] text-slate-600">
                      Se desligado, localização só será aplicada se já existir um case ativo.
                    </div>
                  </div>
                  <Switch
                    checked={createCaseOnLocation}
                    onCheckedChange={(v) => updateConfig({ automation: { on_location: { create_case: v } } })}
                  />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Estado inicial ao abrir por localização</Label>
                    <select
                      value={onLocationInitialState}
                      onChange={(e) =>
                        updateConfig({ automation: { on_location: { initial_state: e.target.value } } })
                      }
                      className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                    >
                      <option value="">(usar default da jornada)</option>
                      {journeyStates.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs">Após receber localização</Label>
                    <select
                      value={onLocationNextState}
                      onChange={(e) =>
                        updateConfig({ automation: { on_location: { next_state: e.target.value } } })
                      }
                      className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                    >
                      <option value="">(não mudar estado)</option>
                      {journeyStates.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">OCR</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      Quando ligado, uma imagem inbound pode preencher campos e itens automaticamente.
                    </div>
                  </div>
                  <Switch
                    checked={ocrEnabled}
                    onCheckedChange={(v) =>
                      updateConfig({ automation: { ocr: { enabled: v, provider: ocrProvider || "google_vision" } } })
                    }
                  />
                </div>

                <div className="mt-3">
                  <Label className="text-xs">Provedor</Label>
                  <select
                    value={ocrProvider}
                    onChange={(e) =>
                      updateConfig({ automation: { ocr: { enabled: ocrEnabled, provider: e.target.value } } })
                    }
                    className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                  >
                    <option value="google_vision">Google Vision (rápido / simples)</option>
                    <option value="google_document_ai">Google Document AI (melhor para tabelas)</option>
                  </select>
                  <div className="mt-1 text-[11px] text-slate-600">
                    Dica: para usar Document AI, configure as secrets <span className="font-mono">GOOGLE_DOCUMENT_AI_PROCESSOR_NAME</span> e
                    <span className="font-mono"> GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON</span>. Se falhar, o sistema pode fazer fallback para Vision.
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">Pendências padrão (vendedor)</div>
                    <div className="mt-0.5 text-[11px] text-slate-600">
                      Cria automaticamente "localização" e "próximas páginas". Recomendado para sales_order.
                    </div>
                  </div>
                  <Switch
                    checked={createDefaultPendencies}
                    onCheckedChange={(v) =>
                      updateConfig({ automation: { on_image: { create_default_pendencies: v } } })
                    }
                  />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Estado ao receber imagem</Label>
                    <select
                      value={onImageInitialState}
                      onChange={(e) =>
                        updateConfig({ automation: { on_image: { initial_state: e.target.value } } })
                      }
                      className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                    >
                      <option value="">(usar default da jornada)</option>
                      {journeyStates.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="hidden sm:block" />
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3 h-10 w-full rounded-2xl"
                  onClick={applyOcrDefaults}
                >
                  <Sparkles className="mr-2 h-4 w-4" /> Aplicar defaults de OCR
                </Button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">Config JSON (avançado)</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      Você ainda pode editar manualmente se precisar.
                    </div>
                  </div>
                </div>

                <Textarea
                  value={configDraft}
                  onChange={(e) => setConfigDraft(e.target.value)}
                  className="mt-3 min-h-[220px] rounded-2xl bg-white font-mono text-[12px]"
                />

                <Button
                  onClick={saveJourneyConfig}
                  disabled={savingConfig}
                  className="mt-3 h-11 w-full rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                >
                  {savingConfig ? "Salvando…" : "Salvar config"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}