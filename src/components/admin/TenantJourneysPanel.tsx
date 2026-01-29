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
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

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

export function TenantJourneysPanel() {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();

  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [configDraft, setConfigDraft] = useState<string>("{}");
  const [savingConfig, setSavingConfig] = useState(false);

  // ---- Create sector/journey (catalog) ----
  const [creatingSector, setCreatingSector] = useState(false);
  const [sectorName, setSectorName] = useState("");
  const [sectorDesc, setSectorDesc] = useState("");

  const [creatingJourney, setCreatingJourney] = useState(false);
  const [journeySectorId, setJourneySectorId] = useState<string>("");
  const [journeyKey, setJourneyKey] = useState("");
  const [journeyName, setJourneyName] = useState("");
  const [journeyDesc, setJourneyDesc] = useState("");

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
        .select("id,sector_id,key,name,description,default_state_machine_json")
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

  const selectedTenantJourney = useMemo(() => {
    if (!selectedJourneyId) return null;
    return tenantJourneyByJourneyId.get(selectedJourneyId) ?? null;
  }, [selectedJourneyId, tenantJourneyByJourneyId]);

  // keep draft in sync with selection
  useEffect(() => {
    const next = selectedTenantJourney?.config_json ?? {};
    setConfigDraft(JSON.stringify(next, null, 2));
  }, [selectedJourneyId, selectedTenantJourney]);

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
        default_state_machine_json: stateMachineJson,
      });
      if (error) throw error;

      showSuccess("Jornada criada.");
      setJourneyKey("");
      setJourneyName("");
      setJourneyDesc("");
      await qc.invalidateQueries({ queryKey: ["journeys"] });
    } catch (e: any) {
      showError(`Falha ao criar jornada: ${e?.message ?? "erro"}`);
    } finally {
      setCreatingJourney(false);
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
        const { error } = await supabase.from("tenant_journeys").insert({
          tenant_id: activeTenantId,
          journey_id: journeyId,
          enabled,
          config_json: {},
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
      let parsed: any;
      try {
        parsed = JSON.parse(configDraft);
      } catch (e: any) {
        showError(`Config JSON inválido: ${e?.message ?? "erro"}`);
        return;
      }

      const existing = tenantJourneyByJourneyId.get(selectedJourneyId);
      if (!existing) {
        // create row if absent, keep enabled true by default
        const { error } = await supabase.from("tenant_journeys").insert({
          tenant_id: activeTenantId,
          journey_id: selectedJourneyId,
          enabled: true,
          config_json: parsed,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("tenant_journeys")
          .update({ config_json: parsed })
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
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              tenant_id: <span className="font-medium text-slate-900">{activeTenantId.slice(0, 8)}…</span>
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
                            <div className="truncate text-xs font-semibold text-slate-900">{j.name}</div>
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
                          <div className="truncate text-xs font-semibold text-slate-900">{j.name}</div>
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
          <div className="text-sm font-semibold text-slate-900">Config da jornada (por tenant)</div>
          <div className="mt-1 text-xs text-slate-500">
            Armazenado em <span className="font-medium">tenant_journeys.config_json</span>.
          </div>

          {!selectedJourney ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Selecione uma jornada à esquerda para editar o JSON.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold text-slate-900">{selectedJourney.name}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">key: {selectedJourney.key}</div>
              </div>

              <div>
                <Label className="text-xs">config_json</Label>
                <Textarea
                  value={configDraft}
                  onChange={(e) => setConfigDraft(e.target.value)}
                  className="mt-1 min-h-[260px] rounded-2xl bg-white font-mono text-[12px]"
                />
                <div className="mt-1 text-[11px] text-slate-500">JSON válido.</div>
              </div>

              <Button
                onClick={saveJourneyConfig}
                disabled={savingConfig}
                className="h-11 w-full rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
              >
                {savingConfig ? "Salvando…" : "Salvar config"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}