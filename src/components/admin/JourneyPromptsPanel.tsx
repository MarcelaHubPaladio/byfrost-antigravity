import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";

// UI simplificada: prompts por jornada (apenas). Internamente usamos um agent fixo.
const PROMPT_AGENT_KEY = "analyst_agent";

type JourneyRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
};

type PromptVersionRow = {
  id: string;
  tenant_id: string;
  journey_id: string | null;
  version: number;
  prompt_text: string;
  is_active: boolean;
  created_at: string;
};

type TenantJourneyOpt = {
  id: string;
  enabled: boolean;
  journey: JourneyRow;
};

export function JourneyPromptsPanel() {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();

  const [journeyId, setJourneyId] = useState<string>("");
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const agentsQ = useQuery({
    queryKey: ["agents"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("id,key");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; key: string }>;
    },
  });

  const agentId = useMemo(() => {
    return agentsQ.data?.find((a) => a.key === PROMPT_AGENT_KEY)?.id ?? null;
  }, [agentsQ.data]);

  // Importante: NÃO carregue o catálogo inteiro de journeys aqui.
  // A lista pode ser grande e renderizar milhares de <option> pode travar o navegador.
  // Para prompts, faz sentido listar só as jornadas habilitadas (ou cadastradas) no tenant.
  const tenantJourneysQ = useQuery({
    queryKey: ["admin_prompt_tenant_journeys", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("journey_id,enabled,journeys(id,key,name,description)")
        .eq("tenant_id", activeTenantId!)
        .limit(500);

      if (error) throw error;

      const opts: TenantJourneyOpt[] = (data ?? [])
        .map((r: any) => ({
          id: String(r.journey_id),
          enabled: Boolean(r.enabled),
          journey: r.journeys as JourneyRow,
        }))
        .filter((r) => Boolean(r.journey?.id));

      opts.sort((a, b) => a.journey.name.localeCompare(b.journey.name));
      return opts;
    },
  });

  const selectedJourney = useMemo(() => {
    if (!journeyId) return null;
    return tenantJourneysQ.data?.find((j) => j.id === journeyId)?.journey ?? null;
  }, [tenantJourneysQ.data, journeyId]);

  const promptVersionsQ = useQuery({
    queryKey: ["prompt_versions", activeTenantId, journeyId, agentId],
    enabled: Boolean(activeTenantId && journeyId && agentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prompt_versions")
        .select("id,tenant_id,journey_id,version,prompt_text,is_active,created_at")
        .eq("tenant_id", activeTenantId!)
        .eq("journey_id", journeyId)
        .eq("agent_id", agentId!)
        .order("version", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PromptVersionRow[];
    },
  });

  const activeVersion = useMemo(() => {
    return (promptVersionsQ.data ?? []).find((v) => v.is_active) ?? null;
  }, [promptVersionsQ.data]);

  const canEdit = Boolean(activeTenantId) && Boolean(journeyId) && Boolean(agentId);

  const startFromActive = () => {
    setDraft(activeVersion?.prompt_text ?? "");
  };

  const createNewVersion = async () => {
    if (!activeTenantId || !journeyId || !agentId) return;
    if (!draft.trim()) {
      showError("Escreva o prompt antes de salvar.");
      return;
    }

    setSaving(true);
    try {
      const versions = promptVersionsQ.data ?? [];
      const nextVersion = (versions.reduce((m, v) => Math.max(m, v.version), 0) || 0) + 1;

      const { error } = await supabase.from("prompt_versions").insert({
        tenant_id: activeTenantId,
        journey_id: journeyId,
        role_id: null,
        agent_id: agentId,
        version: nextVersion,
        prompt_text: draft,
        is_active: false,
      });
      if (error) throw error;

      showSuccess(`Prompt salvo como versão ${nextVersion}.`);
      await qc.invalidateQueries({ queryKey: ["prompt_versions", activeTenantId, journeyId, agentId] });
    } catch (e: any) {
      showError(`Falha ao salvar versão: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  const activateVersion = async (id: string) => {
    if (!activeTenantId || !journeyId || !agentId) return;
    setSaving(true);
    try {
      // Deactivate all
      const { error: offErr } = await supabase
        .from("prompt_versions")
        .update({ is_active: false })
        .eq("tenant_id", activeTenantId)
        .eq("journey_id", journeyId)
        .eq("agent_id", agentId);
      if (offErr) throw offErr;

      const { error: onErr } = await supabase
        .from("prompt_versions")
        .update({ is_active: true })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (onErr) throw onErr;

      showSuccess("Versão ativada.");
      await qc.invalidateQueries({ queryKey: ["prompt_versions", activeTenantId, journeyId, agentId] });
    } catch (e: any) {
      showError(`Falha ao ativar versão: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  if (!activeTenantId) {
    return (
      <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Selecione um tenant (botão "Trocar") para configurar prompts de jornada.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-900">Jornada</div>
        <div className="mt-1 text-xs text-slate-500">
          Selecione uma jornada do tenant para editar prompts versionados.
        </div>

        <div className="mt-4">
          <Label className="text-xs">Jornada</Label>
          <select
            value={journeyId}
            onChange={(e) => {
              setJourneyId(e.target.value);
              setDraft("");
            }}
            className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-[hsl(var(--byfrost-accent)/0.45)] outline-none"
          >
            <option value="">Selecione…</option>
            {(tenantJourneysQ.data ?? []).map((j) => (
              <option key={j.id} value={j.id}>
                {j.journey.name}{j.enabled ? "" : " (desabilitada)"}
              </option>
            ))}
          </select>

          {tenantJourneysQ.isError && (
            <div className="mt-2 text-xs text-rose-700">
              Erro ao carregar jornadas do tenant: {(tenantJourneysQ.error as any)?.message ?? ""}
            </div>
          )}

          {(tenantJourneysQ.data ?? []).length === 0 && !tenantJourneysQ.isError && (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
              Nenhuma jornada cadastrada/habilitada para este tenant.
            </div>
          )}
        </div>

        {selectedJourney && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">{selectedJourney.name}</div>
                <div className="mt-0.5 truncate text-xs text-slate-600">key: {selectedJourney.key}</div>
                {selectedJourney.description && (
                  <div className="mt-1 text-xs text-slate-600">{selectedJourney.description}</div>
                )}
              </div>
              <Badge className="rounded-full border-0 bg-[hsl(var(--byfrost-accent)/0.10)] text-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.10)]">
                prompts
              </Badge>
            </div>

            {!agentId && (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                Agent <span className="font-medium">{PROMPT_AGENT_KEY}</span> não encontrado na tabela agents.
              </div>
            )}

            {activeVersion && (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                Ativo: versão <span className="font-semibold">{activeVersion.version}</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Nota: neste MVP, os Edge Functions ainda não consomem automaticamente estes prompts. A UI já cria/ativa versões no banco.
        </div>
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Prompt (novo rascunho)</div>
            <div className="mt-1 text-xs text-slate-500">
              Salve como nova versão. Depois, ative a versão desejada.
            </div>
          </div>
          <Button
            variant="secondary"
            className="h-10 rounded-2xl"
            disabled={!canEdit || saving}
            onClick={startFromActive}
          >
            Copiar do ativo
          </Button>
        </div>

        <div className="mt-4">
          <Label className="text-xs">prompt_text</Label>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="mt-1 min-h-[280px] rounded-2xl bg-white font-mono text-[12px]"
            placeholder="Escreva aqui o prompt da jornada…"
            disabled={!canEdit}
          />
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={createNewVersion}
            disabled={!canEdit || saving}
            className="h-11 flex-1 rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
          >
            {saving ? "Salvando…" : "Salvar como nova versão"}
          </Button>
        </div>

        <div className="mt-5">
          <div className="text-xs font-semibold text-slate-900">Versões</div>
          <div className="mt-2 space-y-2">
            {(promptVersionsQ.data ?? []).map((v) => (
              <div
                key={v.id}
                className={cn(
                  "rounded-2xl border p-3",
                  v.is_active ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900">
                      Versão {v.version}{v.is_active ? " (ativa)" : ""}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-600">
                      {new Date(v.created_at).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    className="h-9 rounded-2xl"
                    disabled={saving || v.is_active}
                    onClick={() => activateVersion(v.id)}
                  >
                    Ativar
                  </Button>
                </div>

                <pre className="mt-2 max-h-[160px] overflow-auto rounded-2xl bg-white/70 p-2 text-[11px] text-slate-700">
                  {v.prompt_text}
                </pre>
              </div>
            ))}

            {journeyId && (promptVersionsQ.data ?? []).length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
                Sem versões ainda. Escreva um prompt e salve como versão 1.
              </div>
            )}

            {!journeyId && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
                Selecione uma jornada para ver/criar versões.
              </div>
            )}

            {promptVersionsQ.isError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                Erro ao carregar versões: {(promptVersionsQ.error as any)?.message ?? ""}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}