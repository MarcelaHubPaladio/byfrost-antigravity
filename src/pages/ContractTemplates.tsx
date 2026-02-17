import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { showError, showSuccess } from "@/utils/toast";

export type ContractTemplate = {
  id: string;
  name: string;
  body: string;
  updated_at: string;
};

function randomId() {
  // deterministic enough for UI usage; not security sensitive.
  return `ct_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

const DEFAULT_BODY = `CONTRATO / PROPOSTA\n\nTenant: {{tenant_name}}\nCliente: {{party_name}}\nPortal do cliente: {{portal_link}}\n\nCliente (documento): {{party_document}}\nCliente (whatsapp): {{party_whatsapp}}\nCliente (email): {{party_email}}\nCliente (endereço): {{party_address_full}}\n\nPrazo: {{contract_term}}\nValor total: {{contract_total_value}}\nForma de pagamento: {{payment_method}}\nVencimento das parcelas: {{installments_due_date}}\n\nESCOPO (deliverables)\n{{scope_lines}}\n\nObservações\n{{scope_notes}}\n\nGerado em: {{generated_at}}\n`;

export default function ContractTemplates() {
  const qc = useQueryClient();
  const { activeTenantId, isSuperAdmin } = useTenant();

  const tenantQ = useQuery({
    queryKey: ["tenant_contract_templates", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id,branding_json")
        .eq("id", activeTenantId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Tenant não encontrado");
      return data as any;
    },
    staleTime: 3_000,
  });

  const templates = useMemo(() => {
    const bj = tenantQ.data?.branding_json ?? {};
    return ensureArray(bj.contract_templates).filter(Boolean) as ContractTemplate[];
  }, [tenantQ.data]);

  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (activeId) return;
    const first = templates[0]?.id ?? null;
    if (first) setActiveId(String(first));
  }, [activeId, templates]);

  const activeTemplate = useMemo(() => {
    if (!activeId) return null;
    return templates.find((t) => String(t.id) === String(activeId)) ?? null;
  }, [activeId, templates]);

  const [draftName, setDraftName] = useState("Modelo padrão");
  const [draftBody, setDraftBody] = useState(DEFAULT_BODY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeTemplate) {
      setDraftName("Modelo padrão");
      setDraftBody(DEFAULT_BODY);
      return;
    }
    setDraftName(activeTemplate.name);
    setDraftBody(activeTemplate.body);
  }, [activeTemplate?.id]);

  const save = async () => {
    if (!activeTenantId) return;
    if (!isSuperAdmin) {
      showError("Sem permissão para salvar no tenant (RLS). Ative Super-admin (RLS) em Configurações.");
      return;
    }
    if (!draftName.trim()) {
      showError("Informe um nome.");
      return;
    }
    if (!draftBody.trim()) {
      showError("O conteúdo do template não pode ficar vazio.");
      return;
    }

    setSaving(true);
    try {
      const currentBj = tenantQ.data?.branding_json ?? {};

      // IMPORTANT: use the freshest branding_json to avoid lost updates when other screens change branding_json.
      const { data: freshTenant, error: freshErr } = await supabase
        .from("tenants")
        .select("branding_json")
        .eq("id", activeTenantId)
        .maybeSingle();
      if (freshErr) throw freshErr;

      const freshestBj = (freshTenant as any)?.branding_json ?? currentBj;
      const freshestTemplates = ensureArray(freshestBj.contract_templates).filter(Boolean) as ContractTemplate[];

      const nextTemplates = [...freshestTemplates];

      const idx = activeTemplate
        ? nextTemplates.findIndex((t) => String(t.id) === String(activeTemplate.id))
        : -1;

      const nextRow: ContractTemplate = {
        id: activeTemplate?.id ?? randomId(),
        name: draftName.trim(),
        body: draftBody,
        updated_at: nowIso(),
      };

      if (idx >= 0) nextTemplates[idx] = nextRow;
      else nextTemplates.unshift(nextRow);

      const nextBj = { ...freshestBj, contract_templates: nextTemplates };
      const { error } = await supabase.from("tenants").update({ branding_json: nextBj }).eq("id", activeTenantId);
      if (error) throw error;

      showSuccess("Template salvo.");
      setActiveId(nextRow.id);
      await qc.invalidateQueries({ queryKey: ["tenant_contract_templates", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["tenant_settings", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["tenant_branding", activeTenantId] });
    } catch (e: any) {
      showError(e?.message ?? "Erro ao salvar template");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!activeTenantId) return;
    if (!isSuperAdmin) {
      showError("Sem permissão para remover no tenant (RLS). Ative Super-admin (RLS) em Configurações.");
      return;
    }
    if (!activeTemplate) return;

    setSaving(true);
    try {
      const { data: freshTenant, error: freshErr } = await supabase
        .from("tenants")
        .select("branding_json")
        .eq("id", activeTenantId)
        .maybeSingle();
      if (freshErr) throw freshErr;

      const currentBj = (freshTenant as any)?.branding_json ?? tenantQ.data?.branding_json ?? {};
      const currentTemplates = ensureArray(currentBj.contract_templates).filter(Boolean) as ContractTemplate[];

      const nextTemplates = currentTemplates.filter((t) => String(t.id) !== String(activeTemplate.id));
      const nextBj = { ...currentBj, contract_templates: nextTemplates };
      const { error } = await supabase.from("tenants").update({ branding_json: nextBj }).eq("id", activeTenantId);
      if (error) throw error;

      showSuccess("Template removido.");
      setActiveId(nextTemplates[0]?.id ?? null);
      await qc.invalidateQueries({ queryKey: ["tenant_contract_templates", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["tenant_settings", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["tenant_branding", activeTenantId] });
    } catch (e: any) {
      showError(e?.message ?? "Erro ao remover template");
    } finally {
      setSaving(false);
    }
  };

  const insertVariable = (v: string) => {
    const txt = `{{${v}}}`;
    setDraftBody((b) => {
      // append at cursor is overkill; keep simple.
      if (!b.endsWith("\n") && b.length) return `${b}\n${txt}\n`;
      return `${b}${txt}\n`;
    });
  };

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.settings">
        <AppShell>
          <div className="space-y-4">
            <div>
              <div className="text-xl font-bold text-slate-900">Templates de contrato</div>
              <div className="mt-1 text-sm text-slate-600">
                Modelos (por tenant) usados para gerar a prévia e o PDF enviado ao Autentique. Variáveis suportadas: {" "}
                <span className="font-mono">{"{{tenant_name}}"}</span>, <span className="font-mono">{"{{party_name}}"}</span>,{" "}
                <span className="font-mono">{"{{portal_link}}"}</span>,{" "}
                <span className="font-mono">{"{{party_document}}"}</span>, <span className="font-mono">{"{{party_whatsapp}}"}</span>,{" "}
                <span className="font-mono">{"{{party_email}}"}</span>, <span className="font-mono">{"{{party_address_full}}"}</span>,{" "}
                <span className="font-mono">{"{{contract_term}}"}</span>, <span className="font-mono">{"{{contract_total_value}}"}</span>,{" "}
                <span className="font-mono">{"{{payment_method}}"}</span>, <span className="font-mono">{"{{installments_due_date}}"}</span>,{" "}
                <span className="font-mono">{"{{scope_lines}}"}</span>, <span className="font-mono">{"{{scope_notes}}"}</span>,{" "}
                <span className="font-mono">{"{{generated_at}}"}</span>.
              </div>
            </div>

            {!isSuperAdmin ? (
              <Card className="rounded-2xl border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Você está em modo somente leitura. Para salvar templates, ative Super-admin (RLS) em Configurações.
              </Card>
            ) : null}

            <div className="grid gap-4 md:grid-cols-[260px,1fr]">
              <Card className="rounded-2xl border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-700">Templates</div>
                  <Badge variant="secondary">{templates.length}</Badge>
                </div>
                <div className="mt-2 grid gap-2">
                  {templates.length === 0 ? (
                    <div className="text-sm text-slate-600">Nenhum template ainda.</div>
                  ) : (
                    templates.map((t) => {
                      const isActive = String(t.id) === String(activeId);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setActiveId(String(t.id))}
                          className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                            isActive ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <div className="truncate text-sm font-semibold text-slate-900">{t.name}</div>
                          <div className="mt-1 text-[11px] text-slate-500">{new Date(t.updated_at).toLocaleString("pt-BR")}</div>
                        </button>
                      );
                    })
                  )}
                </div>

                <Separator className="my-3" />

                <Button
                  className="w-full rounded-xl"
                  variant="outline"
                  onClick={() => {
                    setActiveId(null);
                    setDraftName("Modelo padrão");
                    setDraftBody(DEFAULT_BODY);
                  }}
                >
                  Novo template
                </Button>
              </Card>

              <Card className="rounded-2xl border-slate-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Editor</div>
                    <div className="mt-1 text-xs text-slate-600">O PDF/Prévia é gerado em texto simples.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={save} disabled={saving || tenantQ.isLoading} className="rounded-xl">
                      {saving ? "Salvando…" : "Salvar"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={remove}
                      disabled={saving || !activeTemplate}
                      className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"
                    >
                      Remover
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <div className="grid gap-1">
                    <Label>Nome</Label>
                    <Input className="rounded-xl" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                  </div>

                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label>Conteúdo</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => insertVariable("tenant_name")}>
                          + {"{{tenant_name}}"}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => insertVariable("party_name")}>
                          + {"{{party_name}}"}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => insertVariable("portal_link")}>
                          + {"{{portal_link}}"}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => insertVariable("party_document")}>
                          + {"{{party_document}}"}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => insertVariable("party_whatsapp")}>
                          + {"{{party_whatsapp}}"}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => insertVariable("party_email")}>
                          + {"{{party_email}}"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => insertVariable("party_address_full")}
                        >
                          + {"{{party_address_full}}"}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => insertVariable("contract_term")}>
                          + {"{{contract_term}}"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => insertVariable("contract_total_value")}
                        >
                          + {"{{contract_total_value}}"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => insertVariable("payment_method")}
                        >
                          + {"{{payment_method}}"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => insertVariable("installments_due_date")}
                        >
                          + {"{{installments_due_date}}"}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => insertVariable("scope_lines")}>
                          + {"{{scope_lines}}"}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => insertVariable("scope_notes")}>
                          + {"{{scope_notes}}"}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => insertVariable("generated_at")}>
                          + {"{{generated_at}}"}
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      rows={18}
                      className="rounded-2xl font-mono text-xs"
                    />
                    <div className="text-xs text-slate-600">
                      Dica: use linhas começando com <span className="font-mono">#</span> para título (ex: <span className="font-mono"># CONTRATO</span>).
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}