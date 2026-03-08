import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CoreEntityType = "party" | "offering";

type PartySubtype = "cliente" | "fornecedor" | "indicador" | "banco";
type OfferingSubtype = "servico" | "produto";
export type UiSubtype = PartySubtype | OfferingSubtype;

export type EntityUpsertInput = {
  id?: string;
  tenant_id: string;
  entity_type: CoreEntityType;
  subtype: string | null;
  display_name: string;
  status: string | null;
  metadata: any;
};

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

function isValidEmail(s: string) {
  const v = String(s ?? "").trim();
  if (!v) return false;
  // Simple (good-enough) email validation.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function subtypeToEntityType(subtype: UiSubtype): CoreEntityType {
  return subtype === "servico" || subtype === "produto" ? "offering" : "party";
}

function formatCpfCnpj(digitsRaw: string) {
  const d = onlyDigits(digitsRaw).slice(0, 14);

  // CPF: 000.000.000-00
  if (d.length <= 11) {
    const p1 = d.slice(0, 3);
    const p2 = d.slice(3, 6);
    const p3 = d.slice(6, 9);
    const p4 = d.slice(9, 11);
    let out = p1;
    if (p2) out += "." + p2;
    if (p3) out += "." + p3;
    if (p4) out += "-" + p4;
    return out;
  }

  // CNPJ: 00.000.000/0000-00
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 5);
  const p3 = d.slice(5, 8);
  const p4 = d.slice(8, 12);
  const p5 = d.slice(12, 14);
  let out = p1;
  if (p2) out += "." + p2;
  if (p3) out += "." + p3;
  if (p4) out += "/" + p4;
  if (p5) out += "-" + p5;
  return out;
}

function normalizeWhatsappDigits(digitsRaw: string) {
  const d = onlyDigits(digitsRaw);
  // Allow either:
  // - 10/11 digits (DDD + number)
  // - 13 digits with 55 prefix
  if (d.startsWith("55") && d.length > 13) return d.slice(0, 13);
  if (d.startsWith("55") && d.length <= 13) return d;
  return d.slice(0, 11);
}

function formatWhatsappBr(digitsRaw: string) {
  const d0 = normalizeWhatsappDigits(digitsRaw);

  const has55 = d0.startsWith("55") && d0.length > 11;
  const d = has55 ? d0.slice(2) : d0;

  const dd = d.slice(0, 2);
  const rest = d.slice(2);

  const isMobile = rest.length >= 9;
  const a = isMobile ? rest.slice(0, 5) : rest.slice(0, 4);
  const b = isMobile ? rest.slice(5, 9) : rest.slice(4, 8);

  let out = "";
  if (has55) out += "+55 ";
  if (dd) out += `(${dd}) `;
  out += a;
  if (b) out += "-" + b;
  return out.trim();
}

async function lookupCnpj(cnpjDigits: string) {
  const cnpj = onlyDigits(cnpjDigits);
  if (cnpj.length !== 14) throw new Error("CNPJ inválido (use 14 dígitos)");

  const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (!resp.ok) {
    throw new Error("CNPJ não encontrado na BrasilAPI");
  }
  const json = await resp.json();

  const name =
    (json?.razao_social as string | undefined) ??
    (json?.nome_fantasia as string | undefined) ??
    null;

  return {
    displayName: name?.trim() ? name.trim() : null,
    raw: json,
  };
}

export function EntityUpsertDialog({
  open,
  onOpenChange,
  tenantId,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  initial?: Partial<EntityUpsertInput> | null;
  onSaved?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const isEdit = Boolean(initial?.id);

  const [saving, setSaving] = useState(false);
  const [fetchingDoc, setFetchingDoc] = useState(false);

  const lockedEntityType = (initial?.entity_type as CoreEntityType | undefined) ?? null;

  const [subtype, setSubtype] = useState<UiSubtype>("cliente");
  const [displayName, setDisplayName] = useState<string>("");
  const [docDigitsState, setDocDigitsState] = useState<string>("");
  const [whatsappDigitsState, setWhatsappDigitsState] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [status, setStatus] = useState<string>("active");

  useEffect(() => {
    if (!open) return;

    // subtype
    const initialSubtype = String(initial?.subtype ?? "").toLowerCase().trim();
    const subtypeFromInitial = (
      ["cliente", "fornecedor", "indicador", "banco", "servico", "produto"].includes(initialSubtype)
        ? (initialSubtype as UiSubtype)
        : null
    );

    const defaultSubtype: UiSubtype = lockedEntityType === "offering" ? "servico" : "cliente";
    setSubtype(subtypeFromInitial ?? defaultSubtype);

    setDisplayName(String(initial?.display_name ?? ""));

    const md = (initial?.metadata ?? {}) as any;
    setDocDigitsState(onlyDigits(String(md?.cpf_cnpj ?? md?.cpfCnpj ?? md?.document ?? "")).slice(0, 14));
    setWhatsappDigitsState(normalizeWhatsappDigits(String(md?.whatsapp ?? md?.phone ?? md?.phone_e164 ?? "")));
    setEmail(String(md?.email ?? ""));
    setStatus(String(initial?.status ?? "active"));
  }, [open, initial?.id]);

  const entityType: CoreEntityType = useMemo(() => {
    if (lockedEntityType) return lockedEntityType;
    return subtypeToEntityType(subtype);
  }, [lockedEntityType, subtype]);

  const docDigits = useMemo(() => onlyDigits(docDigitsState).slice(0, 14), [docDigitsState]);
  const whatsappDigits = useMemo(() => normalizeWhatsappDigits(whatsappDigitsState), [whatsappDigitsState]);

  const docDisplay = useMemo(() => formatCpfCnpj(docDigits), [docDigits]);
  const whatsappDisplay = useMemo(() => formatWhatsappBr(whatsappDigits), [whatsappDigits]);

  const requiresDocAndContacts = entityType === "party";

  const isCpf = docDigits.length === 11;
  const isCnpj = docDigits.length === 14;
  const docOk = docDigits.length === 0 || isCpf || isCnpj;

  const whatsappOk =
    whatsappDigits.length === 0 ||
    whatsappDigits.length === 10 ||
    whatsappDigits.length === 11 ||
    (whatsappDigits.startsWith("55") && whatsappDigits.length === 13);

  const canLookupCnpj = entityType === "party" && isCnpj && !fetchingDoc;

  const emailOk = email.trim().length > 0 ? isValidEmail(email) : true;

  const canSave =
    Boolean(tenantId) &&
    displayName.trim().length >= 2 &&
    docOk &&
    whatsappOk &&
    emailOk &&
    !saving;

  const title = isEdit ? "Editar entidade" : "Nova entidade";

  const doLookup = async () => {
    if (!canLookupCnpj) return;
    setFetchingDoc(true);
    try {
      const res = await lookupCnpj(docDigits);
      if (res.displayName) {
        setDisplayName(res.displayName);
        showSuccess("Nome preenchido a partir do CNPJ.");
      } else {
        showError("Não consegui obter o nome a partir do CNPJ.");
      }
    } catch (e: any) {
      showError(e?.message ?? "Erro ao buscar CNPJ");
    } finally {
      setFetchingDoc(false);
    }
  };

  const save = async () => {
    if (!canSave) return;

    setSaving(true);
    try {
      const baseMetadata = (initial?.metadata ?? {}) as any;
      const nextMetadata = {
        ...baseMetadata,
        cpf_cnpj: requiresDocAndContacts ? docDigits : baseMetadata?.cpf_cnpj,
        whatsapp: requiresDocAndContacts ? whatsappDigits : baseMetadata?.whatsapp,
        email: requiresDocAndContacts ? email.trim() : baseMetadata?.email,
      };

      if (isEdit) {
        const { error } = await supabase
          .from("core_entities")
          .update({
            // NOTE: avoid changing entity_type in edit (can break downstream constraints).
            subtype: subtype,
            display_name: displayName.trim(),
            status: status,
            metadata: nextMetadata,
          })
          .eq("tenant_id", tenantId)
          .eq("id", String(initial?.id))
          .is("deleted_at", null);
        if (error) throw error;

        showSuccess("Entidade atualizada.");
        await qc.invalidateQueries({ queryKey: ["entities"] });
        await qc.invalidateQueries({ queryKey: ["entity"] });
        onSaved?.(String(initial?.id));
        onOpenChange(false);
      } else {
        const { data, error } = await supabase
          .from("core_entities")
          .insert({
            tenant_id: tenantId,
            entity_type: entityType,
            subtype: subtype,
            display_name: displayName.trim(),
            status: status,
            metadata: nextMetadata,
          })
          .select("id")
          .single();
        if (error) throw error;

        const newId = String((data as any)?.id ?? "");
        showSuccess("Entidade criada.");
        await qc.invalidateQueries({ queryKey: ["entities"] });
        onSaved?.(newId);
        onOpenChange(false);
      }
    } catch (e: any) {
      showError(e?.message ?? "Erro ao salvar entidade");
    } finally {
      setSaving(false);
    }
  };

  const subtypeOptions: Array<{ value: UiSubtype; label: string; type: CoreEntityType }> = [
    { value: "cliente", label: "Cliente", type: "party" },
    { value: "fornecedor", label: "Fornecedor", type: "party" },
    { value: "indicador", label: "Indicador", type: "party" },
    { value: "banco", label: "Banco", type: "party" },
    { value: "servico", label: "Serviço", type: "offering" },
    { value: "produto", label: "Produto", type: "offering" },
  ];

  const visibleSubtypes = lockedEntityType
    ? subtypeOptions.filter((o) => o.type === lockedEntityType)
    : subtypeOptions;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Cadastre os dados básicos. <span className="font-semibold">Status</span> inicia como <span className="font-semibold">ativo</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Subtipo</Label>
            <Select value={subtype} onValueChange={(v) => setSubtype(v as UiSubtype)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {visibleSubtypes.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!lockedEntityType ? (
              <div className="text-[11px] text-slate-500">Serviço/Produto criam uma entidade do tipo offering; demais criam party.</div>
            ) : null}
          </div>

          {entityType === "party" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>CPF ou CNPJ</Label>
                <Input
                  value={docDisplay}
                  onChange={(e) => setDocDigitsState(onlyDigits(e.target.value).slice(0, 14))}
                  placeholder="000.000.000-00"
                  className="rounded-xl"
                  inputMode="numeric"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-500">CPF (11) • CNPJ (14)</div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-xl"
                    onClick={doLookup}
                    disabled={!canLookupCnpj}
                    title={canLookupCnpj ? "Buscar nome pelo CNPJ" : "Informe um CNPJ com 14 dígitos"}
                  >
                    {fetchingDoc ? "Buscando…" : "Buscar CNPJ"}
                  </Button>
                </div>
                {!docOk ? (
                  <div className="text-[11px] font-semibold text-red-600">Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).</div>
                ) : (
                  <div className="text-[11px] text-slate-500">CPF (11) • CNPJ (14) • Opcional</div>
                )}
              </div>

              <div className="grid gap-2">
                <Label>WhatsApp</Label>
                <Input
                  value={whatsappDisplay}
                  onChange={(e) => setWhatsappDigitsState(normalizeWhatsappDigits(e.target.value))}
                  placeholder="(11) 99999-8888"
                  className="rounded-xl"
                  inputMode="tel"
                />
                {!whatsappOk ? (
                  <div className="text-[11px] font-semibold text-red-600">Informe um número válido com DDD.</div>
                ) : (
                  <div className="text-[11px] text-slate-500">Padrão BR: (DD) 9XXXX-XXXX • Opcional</div>
                )}
              </div>
            </div>
          ) : null}

          {/* Nome vem depois do documento para permitir lookup preencher automaticamente */}
          <div className="grid gap-2">
            <Label>Nome</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nome da entidade"
              className="rounded-xl"
            />
          </div>

          {entityType === "party" ? (
            <div className="grid gap-2">
              <Label>E-mail</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="rounded-xl"
                inputMode="email"
              />
              {!emailOk ? (
                <div className="text-[11px] font-semibold text-red-600">E-mail inválido.</div>
              ) : (
                <div className="text-[11px] text-slate-500">Opcional</div>
              )}
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="paused">Inativo / Pausado</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-[11px] text-slate-500">Entidades inativas não aparecem na TV Corporativa nem em novos compromissos.</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            O nome é o único campo obrigatório. Dados de contato e documento são opcionais, mas recomendados para CRM.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button className="rounded-xl" onClick={save} disabled={!canSave}>
            {saving ? "Salvando…" : isEdit ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}