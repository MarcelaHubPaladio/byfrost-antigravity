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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { showError, showSuccess } from "@/utils/toast";
import { Loader2, Plus, Search, Trash2, Package, ShoppingCart, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommitmentDeliverablesPreview } from "./CommitmentDeliverablesPreview";

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

function renderTemplate(body: string, vars: Record<string, string>) {
  let out = String(body ?? "");
  for (const [k, val] of Object.entries(vars)) {
    // TS lib target may not include String.prototype.replaceAll
    out = out.split(`{{${k}}}`).join(String(val ?? ""));
  }
  return out;
}

function partyAddressFull(md: any) {
  const address = safe(md?.address);
  const city = safe(md?.city);
  const uf = safe(md?.uf ?? md?.state);
  const cep = safe(md?.cep);
  const parts = [address, [city, uf].filter(Boolean).join("/"), cep ? `CEP ${cep}` : ""].filter(Boolean);
  return parts.join(" • ");
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
  const [previewOpen, setPreviewOpen] = useState(false);

  const tenantTemplatesQ = useQuery({
    queryKey: ["tenant_contract_templates_for_proposal", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id,name,branding_json").eq("id", tenantId).maybeSingle();
      if (error) throw error;
      const bj = (data as any)?.branding_json ?? {};
      return {
        tenantName: String((data as any)?.name ?? ""),
        templates: ensureArray(bj.contract_templates).filter(Boolean) as ContractTemplate[],
      };
    },
    staleTime: 10_000,
  });

  const tenantName = tenantTemplatesQ.data?.tenantName ?? "";
  const templates = tenantTemplatesQ.data?.templates ?? [];

  const partyQ = useQuery({
    queryKey: ["party_entity_for_proposal", tenantId, partyId],
    enabled: Boolean(tenantId && partyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id,display_name,metadata")
        .eq("tenant_id", tenantId)
        .eq("id", partyId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as any;
    },
    staleTime: 10_000,
  });

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
    queryKey: ["party_commitments_with_items", tenantId, partyId],
    enabled: Boolean(tenantId && partyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_commitments")
        .select(`
          id,
          commitment_type,
          status,
          created_at,
          items:commitment_items(
            id,
            offering_entity_id,
            quantity,
            metadata,
            offering:core_entities(display_name)
          )
        `)
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
  const [contractTerm, setContractTerm] = useState<string>("");
  const [contractTotalValue, setContractTotalValue] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [installmentsDueDate, setInstallmentsDueDate] = useState<string>("");
  const [scopeNotes, setScopeNotes] = useState<string>("");

  // Product search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [addingItem, setAddingItem] = useState(false);
  const [itemQty, setItemQty] = useState<number>(1);

  const searchOfferings = async (term: string) => {
    if (term.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id,display_name,subtype")
        .eq("tenant_id", tenantId)
        .eq("entity_type", "offering")
        .is("deleted_at", null)
        .ilike("display_name", `%${term}%`)
        .limit(10);
      if (error) throw error;
      setSearchResults(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddItem = async (offering: any) => {
    if (!tenantId || !partyId) return;
    setAddingItem(true);
    try {
      // 1. Create a commercial commitment of type 'order'
      const { data: comm, error: cErr } = await supabase
        .from("commercial_commitments")
        .insert({
          tenant_id: tenantId,
          commitment_type: "order",
          customer_entity_id: partyId,
          status: "draft",
        })
        .select("id")
        .single();

      if (cErr) throw cErr;

      // 2. Create commitment item
      const { error: iErr } = await supabase.from("commitment_items").insert({
        tenant_id: tenantId,
        commitment_id: comm.id,
        offering_entity_id: offering.id,
        quantity: itemQty,
      });

      if (iErr) throw iErr;

      showSuccess(`${offering.display_name} (${itemQty}x) adicionado.`);
      setSearchQuery("");
      setSearchResults([]);
      setItemQty(1);

      // Auto-select the new item for the proposal
      setSelected(prev => ({ ...prev, [comm.id]: true }));

      await qc.invalidateQueries({ queryKey: ["party_commitments_with_items", tenantId, partyId] });
    } catch (e: any) {
      showError(e?.message ?? "Erro ao adicionar item");
    } finally {
      setAddingItem(false);
    }
  };

  const handleDeleteCommitment = async (id: string) => {
    if (!confirm("Deseja remover este item?")) return;
    try {
      const { error } = await supabase
        .from("commercial_commitments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw error;

      showSuccess("Item removido.");
      setSelected(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await qc.invalidateQueries({ queryKey: ["party_commitments_with_items", tenantId, partyId] });
    } catch (e: any) {
      showError(e?.message ?? "Erro ao remover item");
    }
  };

  const handleUpdateItemQuantity = async (commitmentId: string, itemId: string, qty: number) => {
    if (!tenantId) return;
    try {
      const { error } = await supabase
        .from("commitment_items")
        .update({ quantity: qty })
        .eq("tenant_id", tenantId)
        .eq("id", itemId)
        .eq("commitment_id", commitmentId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["party_commitments_with_items", tenantId, partyId] });
    } catch (e: any) {
      showError(e?.message ?? "Erro ao atualizar quantidade");
    }
  };

  const handleUpdateItemMetadata = async (itemId: string, metadata: any) => {
    if (!tenantId) return;
    try {
      const { error } = await supabase
        .from("commitment_items")
        .update({ metadata })
        .eq("tenant_id", tenantId)
        .eq("id", itemId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["party_commitments_with_items", tenantId, partyId] });
    } catch (e: any) {
      showError(e?.message ?? "Erro ao atualizar metadados");
    }
  };

  useEffect(() => {
    if (!activeProposal) {
      setTemplateId(templates[0]?.id ? String(templates[0].id) : "");
      setContractTerm("");
      setContractTotalValue("");
      setPaymentMethod("");
      setInstallmentsDueDate("");
      setScopeNotes("");
      return;
    }

    const currentId = safe(activeProposal.approval_json?.contract_template_id);
    setTemplateId(currentId || (templates[0]?.id ? String(templates[0].id) : ""));

    setContractTerm(safe(activeProposal.approval_json?.contract_term));
    setContractTotalValue(safe(activeProposal.approval_json?.contract_total_value));
    setPaymentMethod(safe(activeProposal.approval_json?.payment_method));
    setInstallmentsDueDate(safe(activeProposal.approval_json?.installments_due_date));
    setScopeNotes(safe(activeProposal.approval_json?.scope_notes));
  }, [activeProposal?.id, templates.length]);

  const selectedIds = useMemo(() => {
    return Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
  }, [selected]);

  const selectedItemsForPreview = useMemo(() => {
    const list: any[] = [];
    const commitments = (commitmentsQ.data ?? []).filter(c => selectedIds.includes(String(c.id)));
    for (const c of commitments) {
      for (const it of (c.items ?? [])) {
        list.push({
          id: it.id,
          offering_entity_id: it.offering_entity_id,
          quantity: it.quantity,
          metadata: it.metadata
        });
      }
    }
    return list;
  }, [commitmentsQ.data, selectedIds]);

  const scopeQ = useQuery({
    queryKey: ["proposal_scope_lines_preview", tenantId, selectedIds.join(",")],
    enabled: Boolean(tenantId && selectedIds.length),
    queryFn: async () => {
      const { data: its, error: iErr } = await supabase
        .from("commitment_items")
        .select("id,commitment_id,offering_entity_id,quantity,metadata")
        .eq("tenant_id", tenantId)
        .in("commitment_id", selectedIds)
        .is("deleted_at", null);
      if (iErr) throw iErr;

      const items = its ?? [];
      const offeringIds = Array.from(new Set(items.map((it: any) => String(it.offering_entity_id)).filter(Boolean)));

      if (!offeringIds.length) return { scopeLines: [] as string[] };

      const { data: offs, error: oErr } = await supabase
        .from("core_entities")
        .select("id,display_name")
        .eq("tenant_id", tenantId)
        .in("id", offeringIds)
        .is("deleted_at", null);
      if (oErr) throw oErr;

      const offeringsById: Record<string, any> = Object.fromEntries((offs ?? []).map((o: any) => [String(o.id), o]));

      const { data: ts, error: tErr } = await supabase
        .from("deliverable_templates")
        .select("id,offering_entity_id,name")
        .eq("tenant_id", tenantId)
        .in("offering_entity_id", offeringIds)
        .is("deleted_at", null);
      if (tErr) throw tErr;

      const templates = ts ?? [];
      const templatesByOffering = new Map<string, any[]>();
      for (const t of templates) {
        const oid = String((t as any).offering_entity_id);
        if (!templatesByOffering.has(oid)) templatesByOffering.set(oid, []);
        templatesByOffering.get(oid)!.push(t);
      }

      const scopeLines: string[] = [];
      for (const it of items) {
        const oid = String((it as any).offering_entity_id);
        const offName = String(offeringsById[oid]?.display_name ?? oid);
        const qty = Number((it as any).quantity ?? 1);
        const ts2 = templatesByOffering.get(oid) ?? [];
        if (ts2.length === 0) {
          scopeLines.push(`${offName} (qtd ${qty})`);
        } else {
          for (const t of ts2) scopeLines.push(`${offName} — ${(t as any).name} (qtd ${qty})`);
        }
      }

      return { scopeLines };
    },
    staleTime: 2_000,
  });

  const proposalUrl = useMemo(() => {
    if (!activeProposal?.token) return null;
    return `${window.location.origin}/p/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(activeProposal.token)}`;
  }, [activeProposal?.token, tenantSlug]);

  const createNewProposal = async () => {
    if (!tenantId || !partyId) return;

    setSaving(true);
    try {
      const initialApproval = {
        ...(templateId ? { contract_template_id: templateId } : {}),
        contract_term: contractTerm || null,
        contract_total_value: contractTotalValue || null,
        payment_method: paymentMethod || null,
        installments_due_date: installmentsDueDate || null,
        scope_notes: scopeNotes || null,
      };

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
        contract_term: contractTerm || null,
        contract_total_value: contractTotalValue || null,
        payment_method: paymentMethod || null,
        installments_due_date: installmentsDueDate || null,
        scope_notes: scopeNotes || null,
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

  const activeTemplate = useMemo(() => {
    return templates.find((t) => String(t.id) === String(templateId)) ?? templates[0] ?? null;
  }, [templates, templateId]);

  const previewText = useMemo(() => {
    const md = partyQ.data?.metadata ?? {};

    const scopeLines = scopeQ.data?.scopeLines ?? [];
    const scopeBlock = scopeLines.length ? scopeLines.map((l) => `• ${l}`).join("\n") : "(sem itens)";

    const vars: Record<string, string> = {
      tenant_name: safe(tenantName || tenantSlug),
      party_name: safe(partyQ.data?.display_name || "Cliente"),
      party_document: safe(md?.cpf_cnpj ?? md?.cpfCnpj ?? md?.document),
      party_whatsapp: safe(md?.whatsapp ?? md?.phone ?? md?.phone_e164),
      party_email: safe(md?.email),
      party_address_full: partyAddressFull(md),
      portal_link: safe(proposalUrl),
      contract_term: safe(contractTerm),
      contract_total_value: safe(contractTotalValue),
      payment_method: safe(paymentMethod),
      installments_due_date: safe(installmentsDueDate),
      scope_notes: safe(scopeNotes),
      scope_lines: scopeBlock,
      generated_at: new Date().toLocaleString("pt-BR"),
    };

    const body =
      safe(activeTemplate?.body) ||
      `Tenant: {{tenant_name}}\nCliente: {{party_name}}\nPortal: {{portal_link}}\n\n{{scope_lines}}\n\nObs: {{scope_notes}}\n`;
    return renderTemplate(body, vars);
  }, [
    activeTemplate?.body,
    contractTerm,
    contractTotalValue,
    paymentMethod,
    installmentsDueDate,
    proposalUrl,
    scopeNotes,
    partyQ.data?.display_name,
    partyQ.data?.metadata,
    scopeQ.data?.scopeLines,
    tenantName,
    tenantSlug,
  ]);

  return (
    <>
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
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${isActive ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:bg-slate-50"
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
                  <div className="mt-1 text-xs text-slate-600">Assinatura: {String(activeProposal.autentique_json.status)}</div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="rounded-xl" onClick={saveActiveProposal} disabled={saving || !activeProposal}>
                  {saving ? "Salvando…" : "Salvar proposta"}
                </Button>
              </div>
            </div>

            <Separator className="my-3" />

            <div className="rounded-2xl border bg-white p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-700">Template do contrato</div>
                  <div className="mt-0.5 text-xs text-slate-600">Use esse modelo para a prévia do contrato.</div>
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
                    Dica: edite em "Contratos" e use <span className="font-mono">{"{{scope_lines}}"}</span>.
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setPreviewOpen(true)}
                  disabled={!activeProposal || tenantTemplatesQ.isLoading}
                >
                  Ver contrato (prévia texto)
                </Button>
              </div>
            </div>

            <Separator className="my-3" />

            <div className="rounded-2xl border bg-white p-3">
              <div className="text-xs font-semibold text-slate-700">Dados do contrato</div>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div className="grid gap-1">
                  <Label className="text-xs">Prazo do contrato</Label>
                  <Input value={contractTerm} onChange={(e) => setContractTerm(e.target.value)} className="h-10 rounded-xl" placeholder="Ex: 12 meses" />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Valor total do contrato</Label>
                  <Input
                    value={contractTotalValue}
                    onChange={(e) => setContractTotalValue(e.target.value)}
                    className="h-10 rounded-xl"
                    placeholder="Ex: R$ 10.000,00"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Forma de pagamento</Label>
                  <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-10 rounded-xl" placeholder="Ex: 12x no boleto" />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Vencimento das parcelas</Label>
                  <Input
                    value={installmentsDueDate}
                    onChange={(e) => setInstallmentsDueDate(e.target.value)}
                    className="h-10 rounded-xl"
                    placeholder="Ex: todo dia 10"
                  />
                </div>

                <div className="grid gap-1 md:col-span-2">
                  <Label className="text-xs">Observações do escopo</Label>
                  <Textarea
                    value={scopeNotes}
                    onChange={(e) => setScopeNotes(e.target.value)}
                    rows={4}
                    className="rounded-xl"
                    placeholder="Escreva observações livres (serão usadas em {{scope_notes}} no template)."
                  />
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Variáveis: <span className="font-mono">{"{{contract_term}}"}</span>, <span className="font-mono">{"{{contract_total_value}}"}</span>,{" "}
                <span className="font-mono">{"{{payment_method}}"}</span>, <span className="font-mono">{"{{installments_due_date}}"}</span>,{" "}
                <span className="font-mono">{"{{scope_notes}}"}</span>.
              </div>

            </div>

            <Separator className="my-3" />

            <div className="rounded-2xl border bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-slate-700">Escopo Comercial (Produtos e Serviços)</div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <ShoppingCart className="h-3 w-3" />
                  <span>O que está sendo vendido</span>
                </div>
              </div>

              <div className="mt-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Buscar produto ou serviço para adicionar..."
                      className="h-11 rounded-xl pl-10"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        searchOfferings(e.target.value);
                      }}
                    />
                    {isSearching && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      </div>
                    )}
                  </div>
                  <div className="w-[100px]">
                    <Input
                      type="number"
                      min={1}
                      value={itemQty}
                      onChange={(e) => setItemQty(Number(e.target.value))}
                      className="h-11 rounded-xl"
                      title="Quantidade"
                    />
                  </div>
                </div>

                {searchResults.length > 0 && (
                  <div className="mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    {searchResults.map((res) => (
                      <button
                        key={res.id}
                        type="button"
                        onClick={() => handleAddItem(res)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50 transition"
                      >
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{res.display_name}</div>
                          {res.subtype && <div className="text-[10px] text-slate-500">{res.subtype}</div>}
                        </div>
                        <Plus className="h-4 w-4 text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-2">
                {commitmentsQ.isLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                  </div>
                ) : (commitmentsQ.data ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                    Nenhum item adicionado ao escopo. Busque acima para começar.
                  </div>
                ) : (
                  (commitmentsQ.data ?? []).map((c: any) => {
                    const isSelected = Boolean(selected[c.id]);

                    return (
                      <div
                        key={c.id}
                        className={cn(
                          "group flex flex-col gap-3 rounded-xl border p-3 transition",
                          isSelected ? "border-slate-300 bg-slate-50/50" : "border-slate-100 bg-white"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [c.id]: Boolean(v) }))}
                            />
                            <div className="flex items-center gap-2">
                              {c.commitment_type === "order" ? (
                                <Package className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              ) : (
                                <ShoppingCart className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              )}
                              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                {c.commitment_type} • {new Date(c.created_at).toLocaleDateString("pt-BR")}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition"
                              onClick={() => handleDeleteCommitment(c.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Badge variant={c.status === "active" ? "default" : "outline"} className="hidden sm:inline-flex capitalize">
                              {c.status}
                            </Badge>
                          </div>
                        </div>

                        <div className="ml-8 space-y-3">
                          {(c.items ?? []).map((it: any) => {
                            const offeringName = it.offering?.display_name ?? "Item sem nome";
                            const qty = it.quantity ?? 1;

                            return (
                              <div key={it.id} className="flex items-center justify-between gap-4 p-2 rounded-lg bg-white border border-slate-100 shadow-sm">
                                <div className="truncate text-sm font-semibold text-slate-900">
                                  {offeringName}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10px] font-medium text-slate-500 uppercase">Qtd:</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={qty}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => handleUpdateItemQuantity(c.id, it.id, Number(e.target.value))}
                                    className="w-12 h-6 rounded border bg-transparent text-center focus:outline-none focus:ring-1 focus:ring-slate-300 font-semibold text-slate-900"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {selectedItemsForPreview.length > 0 && (
                <div className="mt-6 border-t pt-4">
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <Info className="h-4 w-4 text-[hsl(var(--byfrost-accent))]" />
                    <div className="text-xs font-semibold text-slate-700">Detalhamento de Entregáveis (Execução)</div>
                  </div>
                  <CommitmentDeliverablesPreview
                    tenantId={tenantId}
                    items={selectedItemsForPreview}
                    onUpdateMetadata={handleUpdateItemMetadata}
                  />
                  <div className="mt-2 px-1 text-[10px] text-slate-500 border-l-2 border-slate-100 pl-3">
                    Estes entregáveis são baseados nos templates configurados para cada produto/serviço no módulo "Entregas".
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-2xl border bg-white p-3">
              <Label className="text-xs">Link público (da proposta selecionada)</Label>
              <Input value={proposalUrl ?? "Selecione/crie uma proposta"} readOnly className="mt-1 rounded-xl" />
              <div className="mt-2 flex items-center justify-end gap-2">
                <Button variant="outline" className="rounded-xl" onClick={copy} disabled={!proposalUrl}>
                  Copiar link
                </Button>
                <Button className="rounded-xl" onClick={() => proposalUrl && window.open(proposalUrl, "_blank")} disabled={!proposalUrl}>
                  Abrir
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Prévia do contrato (texto)</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-slate-600">
            Isso é uma prévia renderizada do template selecionado com os dados atuais (inclui escopo, observações e link do portal).
          </div>
          <ScrollArea className="mt-3 max-h-[70vh] rounded-xl border bg-slate-50 p-3">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-slate-900">{previewText}</pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}