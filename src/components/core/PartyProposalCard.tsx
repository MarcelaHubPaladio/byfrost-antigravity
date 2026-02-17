import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { showError, showSuccess } from "@/utils/toast";

function randomToken() {
  // simple + url-safe
  const a = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

type ProposalRow = {
  id: string;
  token: string;
  status: string;
  approved_at: string | null;
  approval_json: any;
  selected_commitment_ids: string[];
  autentique_json: any;
  created_at: string;
};

type ContractTemplate = {
  id: string;
  name: string;
  body: string;
  updated_at: string;
};

function safe(v: any) {
  return String(v ?? "").trim();
}

function ensureArray(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

export function PartyProposalCard({
  tenantId,
  partyId,
  tenantSlug,
}: {
  tenantId: string;
  partyId: string;
  tenantSlug: string;
}) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);

  const tenantTemplatesQ = useQuery({
    queryKey: ["tenant_contract_templates_for_proposal", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id,branding_json").eq("id", tenantId).maybeSingle();
      if (error) throw error;
      const bj = (data as any)?.branding_json ?? {};
      return ensureArray(bj.contract_templates).filter(Boolean) as ContractTemplate[];
    },
    staleTime: 10_000,
  });

  const templates = tenantTemplatesQ.data ?? [];

  const proposalsQ = useQuery({
    queryKey: ["party_proposals", tenantId, partyId],
    enabled: Boolean(tenantId && partyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("party_proposals")
        .select("id,token,status,approved_at,approval_json,selected_commitment_ids,autentique_json,created_at")
        .eq("tenant_id", tenantId)
        .eq("party_entity_id", partyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as ProposalRow[];
    },
    staleTime: 3_000,
  });

  const proposals = proposalsQ.data ?? [];

  // Default to the most recent proposal
  useEffect(() => {
    if (activeProposalId) return;
    const first = proposals[0]?.id ?? null;
    if (first) setActiveProposalId(first);
  }, [activeProposalId, proposals]);

  const activeProposal = useMemo(() => {
    if (!activeProposalId) return null;
    return proposals.find((p) => p.id === activeProposalId) ?? null;
  }, [activeProposalId, proposals]);

  const commitmentsQ = useQuery({
    queryKey: ["party_commitments", tenantId, partyId],
    enabled: Boolean(tenantId && partyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_commitments")
        .select("id,commitment_type,status,created_at")
        .eq("tenant_id", tenantId)
        .eq("customer_entity_id", partyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 5_000,
  });

  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // Hydrate selection from active proposal
  useEffect(() => {
    if (!activeProposal) {
      setSelected({});
      return;
    }

    const map: Record<string, boolean> = {};
    for (const id of (activeProposal.selected_commitment_ids ?? []) as string[]) map[String(id)] = true;
    setSelected(map);
  }, [activeProposal?.id]);

  const [templateId, setTemplateId] = useState<string>("");

  useEffect(() => {
    if (!activeProposal) {
      setTemplateId(templates[0]?.id ? String(templates[0].id) : "");
      return;
    }

    const currentId = safe(activeProposal.approval_json?.contract_template_id);
    if (currentId) {
      setTemplateId(currentId);
      return;
    }

    setTemplateId(templates[0]?.id ? String(templates[0].id) : "");
  }, [activeProposal?.id, templates.length]);

  const selectedIds = useMemo(() => {
    return Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
  }, [selected]);

  const proposalUrl = useMemo(() => {
    if (!activeProposal?.token) return null;
    return `${window.location.origin}/p/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(activeProposal.token)}`;
  }, [activeProposal?.token, tenantSlug]);

  const createNewProposal = async () => {
    if (!tenantId || !partyId) return;

    setSaving(true);
    try {
      const initialApproval = templateId ? { contract_template_id: templateId } : {};

      const { data, error } = await supabase
        .from("party_proposals")
        .insert({
          tenant_id: tenantId,
          party_entity_id: partyId,
          token: randomToken(),
          selected_commitment_ids: selectedIds,
          status: "draft",
          approval_json: initialApproval,
        })
        .select("id,token,status,approved_at,approval_json,selected_commitment_ids,autentique_json,created_at")
        .single();

      if (error) throw error;

      // Best effort: add an entity-level event so public/internal timelines show "proposta gerada".
      // (ignore errors if timeline_events table differs)
      try {
        await supabase.from("timeline_events").insert({
          tenant_id: tenantId,
          case_id: null,
          event_type: "proposal_created",
          actor_type: "admin",
          actor_id: null,
          message: "Proposta gerada.",
          meta_json: { proposal_id: data.id, party_entity_id: partyId },
          occurred_at: new Date().toISOString(),
        });
      } catch {
        // ignore
      }

      showSuccess("Nova proposta criada.");
      await qc.invalidateQueries({ queryKey: ["party_proposals", tenantId, partyId] });
      if (data?.id) setActiveProposalId(String(data.id));
    } catch (e: any) {
      showError(e?.message ?? "Erro ao criar proposta");
    } finally {
      setSaving(false);
    }
  };

  const saveActiveProposal = async () => {
    if (!tenantId || !partyId || !activeProposal) return;

    setSaving(true);
    try {
      const nextApprovalJson = {
        ...(activeProposal.approval_json ?? {}),
        contract_template_id: templateId || null,
      };

      const { error } = await supabase
        .from("party_proposals")
        .update({ selected_commitment_ids: selectedIds, approval_json: nextApprovalJson })
        .eq("tenant_id", tenantId)
        .eq("id", activeProposal.id)
        .is("deleted_at", null);
      if (error) throw error;
      showSuccess("Proposta atualizada.");

      await qc.invalidateQueries({ queryKey: ["party_proposals", tenantId, partyId] });
    } catch (e: any) {
      showError(e?.message ?? "Erro ao salvar proposta");
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!proposalUrl) return;
    try {
      await navigator.clipboard.writeText(proposalUrl);
      showSuccess("Link copiado.");
    } catch {
      showError("Não consegui copiar.");
    }
  };

  return (
    <Card className="rounded-2xl border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Propostas públicas</div>
          <div className="mt-1 text-xs text-slate-600">
            Você pode criar múltiplas propostas para o mesmo cliente (party) e gerenciar o escopo de cada uma.
          </div>
        </div>
        <Button className="rounded-xl" onClick={createNewProposal} disabled={saving}>
          {saving ? "Criando…" : "Nova proposta"}
        </Button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[240px,1fr]">
        <div className="rounded-2xl border bg-white p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-700">Propostas</div>
            <Badge variant="secondary">{proposals.length}</Badge>
          </div>

          <div className="mt-2 grid gap-2">
            {proposals.length === 0 ? (
              <div className="text-sm text-slate-600">Nenhuma proposta ainda.</div>
            ) : (
              proposals.map((p) => {
                const isActive = p.id === activeProposalId;
                const autStatus = safe(p.autentique_json?.status);
                const lastEvent = safe(p.autentique_json?.last_webhook_event);
                const lastAt = safe(p.autentique_json?.last_webhook_received_at);

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActiveProposalId(p.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                      isActive ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold text-slate-900">{p.status}</div>
                      <Badge variant={isActive ? "default" : "outline"} className="shrink-0">
                        {String(p.token).slice(0, 6)}…
                      </Badge>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-600">
                      {new Date(p.created_at).toLocaleString("pt-BR")}
                      {autStatus ? ` • ass.: ${autStatus}` : ""}
                    </div>
                    {lastEvent || lastAt ? (
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        webhook: {lastEvent || "—"}{lastAt ? ` • ${new Date(lastAt).toLocaleString("pt-BR")}` : ""}
                      </div>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-700">Proposta selecionada</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-900">
                {activeProposal ? `${activeProposal.status} • ${String(activeProposal.id).slice(0, 8)}…` : "—"}
              </div>
              {activeProposal?.autentique_json?.status ? (
                <div className="mt-1 text-xs text-slate-600">
                  Assinatura: {String(activeProposal.autentique_json.status)}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={saveActiveProposal}
                disabled={saving || !activeProposal}
              >
                {saving ? "Salvando…" : "Salvar escopo"}
              </Button>
            </div>
          </div>

          <Separator className="my-3" />

          <div className="rounded-2xl border bg-white p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-700">Template do contrato</div>
                <div className="mt-0.5 text-xs text-slate-600">
                  Esse modelo será usado quando você emitir/enviar o contrato para assinatura no Autentique.
                </div>
              </div>
              <div className="min-w-[240px]">
                <Select value={templateId} onValueChange={(v) => setTemplateId(v)}>
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue placeholder={templates.length ? "Selecione…" : "Sem templates"} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.length === 0 ? (
                      <SelectItem value="__no_templates__" disabled>
                        Nenhum template cadastrado
                      </SelectItem>
                    ) : (
                      templates.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <div className="mt-1 text-[11px] text-slate-500">
                  Dica: cadastre/edite em "Contratos" (menu lateral) e use <span className="font-mono">{"{{scope_lines}}"}</span>.
                </div>
              </div>
            </div>
          </div>

          <Separator className="my-3" />

          <div className="rounded-2xl border bg-white p-3">
            <div className="text-xs font-semibold text-slate-700">Compromissos do cliente</div>
            <div className="mt-2 grid gap-2">
              {(commitmentsQ.data ?? []).length === 0 ? (
                <div className="text-sm text-slate-600">Nenhum compromisso encontrado para este cliente.</div>
              ) : (
                (commitmentsQ.data ?? []).map((c: any) => (
                  <label key={c.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={Boolean(selected[c.id])}
                        onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [c.id]: Boolean(v) }))}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {String(c.commitment_type)} • {String(c.id).slice(0, 8)}
                        </div>
                        <div className="text-xs text-slate-600">status: {c.status ?? "—"}</div>
                      </div>
                    </div>
                    <Badge variant="outline">{new Date(c.created_at).toLocaleDateString("pt-BR")}</Badge>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-3">
            <Label className="text-xs">Link público (da proposta selecionada)</Label>
            <Input value={proposalUrl ?? "Selecione/crie uma proposta"} readOnly className="mt-1 rounded-xl" />
            <div className="mt-2 flex items-center justify-end gap-2">
              <Button variant="outline" className="rounded-xl" onClick={copy} disabled={!proposalUrl}>
                Copiar link
              </Button>
              <Button
                className="rounded-xl"
                onClick={() => proposalUrl && window.open(proposalUrl, "_blank")}
                disabled={!proposalUrl}
              >
                Abrir
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}