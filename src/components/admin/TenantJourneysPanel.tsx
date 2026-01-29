import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";

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
};

type TenantSectorRow = {
  id: string;
  sector_id: string;
  enabled: boolean;
  config_json: any;
};

type TenantJourneyRow = {
  id: string;
  journey_id: string;
  enabled: boolean;
  config_json: any;
};

function safeJsonParse(s: string) {
  try {
    return { ok: true as const, value: JSON.parse(s) };
  } catch (e: any) {
    return { ok: false as const, error: e?.message ?? "JSON inválido" };
  }
}

export function TenantJourneysPanel() {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();

  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [configDraft, setConfigDraft] = useState<string>("{}");
  const [savingConfig, setSavingConfig] = useState(false);

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
        .select("id,sector_id,key,name,description")
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
        .select("id,sector_id,enabled,config_json")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
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
        .is("deleted_at", null)
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
          config_json: {},
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
      const parsed = safeJsonParse(configDraft);
      if (!parsed.ok) {
        showError(`Config JSON inválido: ${parsed.error}`);
        return;
      }

      const existing = tenantJourneyByJourneyId.get(selectedJourneyId);
      if (!existing) {
        // create row if absent, keep enabled true by default
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
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Setores e jornadas do tenant</div>
            <div className="mt-1 text-xs text-slate-500">
              Habilite o que o tenant pode usar. A lógica do MVP ainda não lê isso automaticamente (por enquanto é catálogo + governança).
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
          Armazenado em <span className="font-medium">tenant_journeys.config_json</span>. Você pode usar isso para parâmetros da jornada (ex.: SLAs, mensagens padrão, validações extras).
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
              <div className="mt-1 text-[11px] text-slate-500">
                Dica: JSON válido. Ex.: <span className="font-mono">{"{"}"sla_hours":4{"}"}"</span>
              </div>
            </div>

            <Button
              onClick={saveJourneyConfig}
              disabled={savingConfig}
              className="h-11 w-full rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
            >
              {savingConfig ? "Salvando…" : "Salvar config"}
            </Button>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              Nota: a UI já grava no banco, mas o processamento atual (MVP) ainda não consome essas configs automaticamente.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}