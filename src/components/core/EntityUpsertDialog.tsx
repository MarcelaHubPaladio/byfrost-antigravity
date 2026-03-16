import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Loader2, Check, ChevronsUpDown, MapPin, LocateFixed, Trash2, Tag, X, Plus as PlusIcon, Building2, Smartphone, Mail, Globe } from "lucide-react";
import { LocationPinSelector } from "@/components/crm/LocationPinSelector";
import { cn } from "@/lib/utils";

export type CoreEntityType = "party" | "offering";

type PartySubtype = "cliente" | "fornecedor" | "indicador" | "banco" | "pintor";
type OfferingSubtype = "servico" | "produto" | "imovel";
export type UiSubtype = PartySubtype | OfferingSubtype;

export type EntityUpsertInput = {
  id?: string;
  tenant_id: string;
  entity_type: CoreEntityType;
  subtype: string | null;
  display_name: string;
  status: string | null;
  metadata: any;
  property_type?: string | null;
  total_area?: number | null;
  useful_area?: number | null;
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
  return subtype === "servico" || subtype === "produto" || subtype === "imovel" ? "offering" : "party";
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

  // Imóvel fields
  const [legacyId, setLegacyId] = useState<string>("");
  const [businessType, setBusinessType] = useState<string>("both");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState<string>("");
  const [propertyType, setPropertyType] = useState<string>("casa");
  const [totalArea, setTotalArea] = useState<string>("");
  const [usefulArea, setUsefulArea] = useState<string>("");
  const [geocoding, setGeocoding] = useState(false);

  const handleGeocode = async () => {
    if (!address.trim()) return;
    setGeocoding(true);
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
      const data = await resp.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        setLocation({ lat: parseFloat(lat), lng: parseFloat(lon) });
        showSuccess("Localização encontrada!");
      } else {
        showError("Endereço não encontrado no mapa.");
      }
    } catch (e) {
      showError("Erro ao buscar coordenadas.");
    } finally {
      setGeocoding(false);
    }
  };

  // Tags
  const [tags, setTags] = useState<string[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (!open) return;

    // subtype
    const initialSubtype = String(initial?.subtype ?? "").toLowerCase().trim();
    const subtypeFromInitial = (
      ["cliente", "fornecedor", "indicador", "banco", "pintor", "servico", "produto"].includes(initialSubtype)
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

    // Imóvel fields
    setLegacyId(String(initial?.metadata?.legacy_id ?? ""));
    setBusinessType(String(initial?.metadata?.business_type ?? "both"));
    const loc = initial?.metadata?.location_json || null;
    setLocation(loc?.lat ? { lat: loc.lat, lng: loc.lng } : null);
    setAddress(String(loc?.address ?? ""));

    setPropertyType(String(initial?.property_type ?? "casa"));
    setTotalArea(String(initial?.total_area ?? ""));
    setUsefulArea(String(initial?.useful_area ?? ""));

    // Tags fetch
    if (initial?.id) {
       supabase.from("core_entity_tags").select("tag").eq("entity_id", initial.id).eq("tenant_id", tenantId)
       .then(({data}) => {
         setTags((data || []).map(r => r.tag));
       });
    } else {
       setTags([]);
    }
  }, [open, initial?.id]);

  const allTenantTagsQ = useQuery({
    queryKey: ["all_entity_tags", tenantId],
    enabled: Boolean(tenantId && open),
    queryFn: async () => {
      const { data } = await supabase.from("core_entity_tags").select("tag").eq("tenant_id", tenantId).limit(1000);
      const unique = Array.from(new Set((data || []).map(r => r.tag))).sort();
      return unique;
    }
  });

  const normalizeTag = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").slice(0, 32);

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
        legacy_id: subtype === "imovel" ? legacyId.trim() : baseMetadata?.legacy_id,
        business_type: subtype === "imovel" ? businessType : baseMetadata?.business_type,
        location_json: subtype === "imovel" ? { ...location, address: address.trim() } : baseMetadata?.location_json,
        tags: tags, // keeping semantic copy in metadata if needed, but primary is table
      };

      const entityData: any = {
        subtype: subtype,
        display_name: displayName.trim(),
        status: status,
        metadata: nextMetadata,
      };

      if (subtype === "imovel") {
        entityData.legacy_id = legacyId.trim() || null;
        entityData.business_type = businessType;
        entityData.location_json = location ? { ...location, address: address.trim() } : null;
        entityData.property_type = propertyType;
        entityData.total_area = parseFloat(totalArea.replace(",", ".")) || null;
        entityData.useful_area = parseFloat(usefulArea.replace(",", ".")) || null;
      }

      if (isEdit) {
        const { error } = await supabase
          .from("core_entities")
          .update(entityData)
          .eq("tenant_id", tenantId)
          .eq("id", String(initial?.id))
          .is("deleted_at", null);
        if (error) throw error;
        
        const entityId = String(initial?.id);
        // Sync tags
        await supabase.from("core_entity_tags").delete().eq("entity_id", entityId).eq("tenant_id", tenantId);
        if (tags.length > 0) {
           await supabase.from("core_entity_tags").insert(tags.map(t => ({ entity_id: entityId, tenant_id: tenantId, tag: t })));
        }

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
            ...entityData
          })
          .select("id")
          .single();
        if (error) throw error;
        
        const newId = data.id;
        // Sync tags
        if (tags.length > 0) {
           await supabase.from("core_entity_tags").insert(tags.map(t => ({ entity_id: newId, tenant_id: tenantId, tag: t })));
        }

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
    { value: "pintor", label: "Pintor", type: "party" },
    { value: "indicador", label: "Indicador", type: "party" },
    { value: "banco", label: "Banco", type: "party" },
    { value: "servico", label: "Serviço", type: "offering" },
    { value: "produto", label: "Produto", type: "offering" },
    { value: "imovel", label: "Imóvel", type: "offering" },
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

          <div className="grid gap-2">
            <Label className="flex items-center gap-2">
               <Tag className="h-3.5 w-3.5 text-slate-400" />
               Tags / Categorias
            </Label>
            <div className="flex flex-wrap gap-2 min-h-[44px] p-2 rounded-2xl border border-slate-200 bg-white">
               {tags.map(t => (
                 <Badge key={t} variant="secondary" className="pl-2 pr-1 h-7 rounded-lg gap-1 bg-indigo-50 text-indigo-700 border-indigo-100 uppercase text-[10px] font-bold">
                    {t}
                    <button type="button" onClick={() => setTags(tags.filter(x => x !== t))} className="hover:bg-indigo-200/50 rounded-md p-0.5">
                       <X className="h-3 w-3" />
                    </button>
                 </Badge>
               ))}
               
               <Popover open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
                  <PopoverTrigger asChild>
                     <Button type="button" variant="ghost" size="sm" className="h-7 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-indigo-600">
                        <PlusIcon className="mr-1 h-3 w-3" /> Adicionar Tag
                     </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[240px] p-0 rounded-2xl overflow-hidden shadow-2xl border-indigo-100" align="start">
                     <Command>
                        <CommandInput 
                           placeholder="Buscar ou criar tag..." 
                           value={tagInput}
                           onValueChange={setTagInput}
                        />
                        <CommandList>
                           <CommandEmpty>
                              <div className="p-2 space-y-2">
                                 <p className="text-[11px] text-slate-500">Nenhuma tag encontrada.</p>
                                 {tagInput.trim() && (
                                   <Button 
                                      className="w-full h-8 rounded-xl text-xs" 
                                      onClick={() => {
                                        const nt = normalizeTag(tagInput);
                                        if (nt && !tags.includes(nt)) setTags([...tags, nt]);
                                        setTagInput("");
                                        setTagPickerOpen(false);
                                      }}
                                   >
                                      Criar "{tagInput}"
                                   </Button>
                                 )}
                              </div>
                           </CommandEmpty>
                           <CommandGroup heading="Sugestões">
                              {allTenantTagsQ.data?.filter(t => !tags.includes(t)).map(t => (
                                <CommandItem 
                                   key={t} 
                                   onSelect={() => {
                                     setTags([...tags, t]);
                                     setTagPickerOpen(false);
                                     setTagInput("");
                                   }}
                                   className="rounded-xl"
                                >
                                   <Check className={cn("mr-2 h-4 w-4 opacity-0", tags.includes(t) && "opacity-100")} />
                                   {t}
                                </CommandItem>
                              ))}
                           </CommandGroup>
                        </CommandList>
                     </Command>
                  </PopoverContent>
               </Popover>
            </div>
            <div className="text-[10px] text-slate-400">Classifique para facilitar a busca e gestão posterior.</div>
          </div>

          {subtype === "imovel" && (
            <div className="grid gap-4 rounded-2xl border border-slate-200 p-4 bg-slate-50/50">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dados do Imóvel</div>
              
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>ID Legado</Label>
                  <Input 
                    value={legacyId} 
                    onChange={e => setLegacyId(e.target.value)} 
                    placeholder="Ex: 00123" 
                    className="rounded-xl"
                  />
                  <div className="text-[10px] text-slate-400">ID do sistema anterior</div>
                </div>
                <div className="grid gap-2">
                  <Label>Tipo de Negócio</Label>
                  <Select value={businessType} onValueChange={setBusinessType}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sale">Venda</SelectItem>
                      <SelectItem value="rent">Aluguel</SelectItem>
                      <SelectItem value="both">Venda e Aluguel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label>Tipo de Imóvel</Label>
                  <Select value={propertyType} onValueChange={setPropertyType}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casa">Casa</SelectItem>
                      <SelectItem value="apartamento">Apartamento</SelectItem>
                      <SelectItem value="terreno">Terreno</SelectItem>
                      <SelectItem value="comercial">Comercial</SelectItem>
                      <SelectItem value="chacara">Chácara / Sítio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Área Total (m²)</Label>
                  <Input
                    value={totalArea}
                    onChange={e => setTotalArea(e.target.value)}
                    placeholder="Ex: 250"
                    className="rounded-xl"
                    inputMode="decimal"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Área Útil (m²)</Label>
                  <Input
                    value={usefulArea}
                    onChange={e => setUsefulArea(e.target.value)}
                    placeholder="Ex: 180"
                    className="rounded-xl"
                    inputMode="decimal"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Endereço Completo</Label>
                <div className="relative">
                  <Input 
                    value={address} 
                    onChange={e => setAddress(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && handleGeocode()}
                    placeholder="Rua, Número, Bairro, Cidade - UF" 
                    className="rounded-xl pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleGeocode}
                    disabled={geocoding || !address.trim()}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-slate-400 hover:text-indigo-600 rounded-lg"
                  >
                    {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Localização no Mapa</Label>
                <LocationPinSelector 
                  value={location} 
                  onChange={setLocation} 
                  className="w-full"
                />
              </div>
            </div>
          )}

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