import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
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
import { Tag, X, Plus as PlusIcon, Check, Save, Loader2, Search } from "lucide-react";
import { LocationPinSelector } from "@/components/crm/LocationPinSelector";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export type CoreEntityType = "party" | "offering";
type PartySubtype = "cliente" | "fornecedor" | "indicador" | "banco" | "pintor";
type OfferingSubtype = "servico" | "produto" | "imovel";
export type UiSubtype = PartySubtype | OfferingSubtype;

function onlyDigits(s: string) {
  return String(s ?? "").replace(/\D/g, "");
}

function isValidEmail(s: string) {
  const v = String(s ?? "").trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function formatCpfCnpj(digitsRaw: string) {
  const d = onlyDigits(digitsRaw).slice(0, 14);
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

export function EntityEditTab({
  tenantId,
  entity,
  onSaved,
}: {
  tenantId: string;
  entity: any;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [subtype, setSubtype] = useState<UiSubtype>(entity.subtype as UiSubtype || "cliente");
  const [displayName, setDisplayName] = useState<string>(entity.display_name || "");
  const [docDigitsState, setDocDigitsState] = useState<string>(onlyDigits(entity.metadata?.cpf_cnpj || "").slice(0, 14));
  const [whatsappDigitsState, setWhatsappDigitsState] = useState<string>(normalizeWhatsappDigits(entity.metadata?.whatsapp || ""));
  const [email, setEmail] = useState<string>(entity.metadata?.email || "");
  const [status, setStatus] = useState<string>(entity.status || "active");

  const [legacyId, setLegacyId] = useState<string>(entity.metadata?.legacy_id || "");
  const [businessType, setBusinessType] = useState<string>(entity.metadata?.business_type || "both");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(entity.location_json ? { lat: entity.location_json.lat, lng: entity.location_json.lng } : null);
  const [address, setAddress] = useState<string>(entity.location_json?.address || "");

  const [propertyType, setPropertyType] = useState<string>(entity.property_type || "casa");
  const [totalArea, setTotalArea] = useState<string>(entity.total_area?.toString() || "");
  const [usefulArea, setUsefulArea] = useState<string>(entity.useful_area?.toString() || "");

  const [tags, setTags] = useState<string[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    supabase.from("core_entity_tags").select("tag").eq("entity_id", entity.id).eq("tenant_id", tenantId)
    .then(({data}) => {
      setTags((data || []).map(r => r.tag));
    });
  }, [entity.id, tenantId]);

  const allTenantTagsQ = useQuery({
    queryKey: ["all_entity_tags", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("core_entity_tags").select("tag").eq("tenant_id", tenantId).limit(1000);
      const unique = Array.from(new Set((data || []).map(r => r.tag))).sort();
      return unique;
    }
  });

  const normalizeTag = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").slice(0, 32);

  const docDisplay = useMemo(() => formatCpfCnpj(docDigitsState), [docDigitsState]);
  const whatsappDisplay = useMemo(() => formatWhatsappBr(whatsappDigitsState), [whatsappDigitsState]);

  const docOk = docDigitsState.length === 0 || docDigitsState.length === 11 || docDigitsState.length === 14;
  const whatsappOk = whatsappDigitsState.length === 0 || [10, 11, 13].includes(whatsappDigitsState.length);
  const emailOk = email.trim().length > 0 ? isValidEmail(email) : true;

  const canSave = displayName.trim().length >= 2 && docOk && whatsappOk && emailOk && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const nextMetadata = {
        ...entity.metadata,
        cpf_cnpj: docDigitsState,
        whatsapp: whatsappDigitsState,
        email: email.trim(),
        legacy_id: subtype === "imovel" ? legacyId.trim() : entity.metadata?.legacy_id,
        business_type: subtype === "imovel" ? businessType : entity.metadata?.business_type,
        location_json: subtype === "imovel" ? { ...location, address: address.trim() } : entity.metadata?.location_json,
        property_type: subtype === "imovel" ? propertyType : entity.property_type,
        total_area: subtype === "imovel" ? parseFloat(totalArea.replace(",", ".")) : entity.total_area,
        useful_area: subtype === "imovel" ? parseFloat(usefulArea.replace(",", ".")) : entity.useful_area,
        tags: tags,
      };

      const entityData: any = {
        subtype,
        display_name: displayName.trim(),
        status,
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

      const { error } = await supabase
        .from("core_entities")
        .update(entityData)
        .eq("id", entity.id)
        .eq("tenant_id", tenantId);

      if (error) throw error;

      // Sync tags
      await supabase.from("core_entity_tags").delete().eq("entity_id", entity.id).eq("tenant_id", tenantId);
      if (tags.length > 0) {
        await supabase.from("core_entity_tags").insert(tags.map(t => ({ entity_id: entity.id, tenant_id: tenantId, tag: t })));
      }

      showSuccess("Alterações salvas com sucesso!");
      await qc.invalidateQueries({ queryKey: ["entity", entity.id] });
      onSaved?.();
    } catch (e: any) {
      showError(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Configurações da Entidade</h2>
          <p className="text-sm text-slate-500">Edite as informações básicas, localização e categorização.</p>
        </div>
        <Button 
          onClick={save} 
          disabled={!canSave} 
          className="rounded-xl h-12 px-8 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar Alterações
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6 rounded-3xl border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
               <Tag className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-800">Dados Básicos</h3>
          </div>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Nome de Exibição</Label>
              <Input 
                value={displayName} 
                onChange={e => setDisplayName(e.target.value)}
                className="rounded-xl h-11 border-slate-200 focus:ring-indigo-500"
                placeholder="Ex: Mobiliário Sala de Estar"
              />
            </div>

            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="rounded-xl h-11 border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="paused">Inativo / Pausado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Subtipo</Label>
              <Select value={subtype} onValueChange={(v) => setSubtype(v as UiSubtype)}>
                <SelectTrigger className="rounded-xl h-11 border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="fornecedor">Fornecedor</SelectItem>
                  <SelectItem value="imovel">Imóvel</SelectItem>
                  <SelectItem value="servico">Serviço</SelectItem>
                  <SelectItem value="produto">Produto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-6 rounded-3xl border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
               <TagIcon className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-800">Tags e Categorias</h3>
          </div>

          <div className="flex flex-wrap gap-2 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 min-h-[100px] content-start">
             {tags.map(t => (
               <Badge key={t} className="pl-3 pr-1.5 h-8 rounded-xl gap-1.5 bg-white text-indigo-700 border-indigo-100 uppercase text-[10px] font-black shadow-sm">
                  {t}
                  <button type="button" onClick={() => setTags(tags.filter(x => x !== t))} className="hover:bg-red-50 hover:text-red-500 rounded-md p-1 transition-colors">
                     <X className="h-3.5 w-3.5" />
                  </button>
               </Badge>
             ))}
             
             <Popover open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
                <PopoverTrigger asChild>
                   <Button type="button" variant="outline" size="sm" className="h-8 rounded-xl text-[10px] font-black uppercase tracking-widest border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-600 bg-white">
                      <PlusIcon className="mr-1.5 h-3.5 w-3.5" /> Adicionar Tag
                   </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0 rounded-2xl overflow-hidden shadow-2xl border-indigo-100" align="start">
                   <Command>
                      <CommandInput 
                         placeholder="Buscar ou criar tag..." 
                         value={tagInput}
                         onValueChange={setTagInput}
                         className="h-10"
                      />
                      <CommandList>
                         <CommandEmpty>
                            <div className="p-3 space-y-2">
                               <p className="text-xs text-slate-500">Tag não encontrada.</p>
                               {tagInput.trim() && (
                                 <Button 
                                    className="w-full h-9 rounded-xl text-xs bg-indigo-600" 
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
                         <CommandGroup heading="Sugestões Globais" className="p-1">
                            {allTenantTagsQ.data?.filter(t => !tags.includes(t)).map(t => (
                              <CommandItem 
                                 key={t} 
                                 onSelect={() => {
                                   setTags([...tags, t]);
                                   setTagPickerOpen(false);
                                   setTagInput("");
                                 }}
                                 className="rounded-xl h-9 px-3"
                              >
                                 <Check className={cn("mr-2 h-4 w-4 opacity-0", tags.includes(t) && "opacity-100")} />
                                 <span className="font-medium text-slate-700">{t}</span>
                              </CommandItem>
                            ))}
                         </CommandGroup>
                      </CommandList>
                   </Command>
                </PopoverContent>
             </Popover>
          </div>
          <p className="text-[10px] text-slate-400 px-1 italic">Use tags para filtrar relatórios e buscas no sistema.</p>
        </Card>
      </div>

      {subtype === "imovel" && (
        <Card className="p-8 rounded-[2rem] border-slate-200 shadow-lg bg-white space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
             <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600">
                   <Building2 className="w-5 h-5" />
                </div>
                <div>
                   <h3 className="text-lg font-bold text-slate-800">Dados do Imóvel</h3>
                   <p className="text-sm text-slate-500">Informações específicas de comercialização e localização.</p>
                </div>
             </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-6">
              <div className="grid gap-3">
                <Label className="text-slate-700 font-bold uppercase text-[11px] tracking-wider">ID Legado / Código Anterior</Label>
                <Input 
                  value={legacyId} 
                  onChange={e => setLegacyId(e.target.value)} 
                  placeholder="Ex: IMOB-0042" 
                  className="rounded-2xl h-12 border-slate-200 bg-slate-50/50"
                />
              </div>

              <div className="grid gap-3">
                <Label className="text-slate-700 font-bold uppercase text-[11px] tracking-wider">Finalidade de Negócio</Label>
                <div className="grid grid-cols-3 gap-2">
                   {['sale', 'rent', 'both'].map((type) => (
                     <button
                       key={type}
                       type="button"
                       onClick={() => setBusinessType(type)}
                       className={cn(
                         "h-20 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-1",
                         businessType === type 
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700" 
                          : "border-slate-100 bg-white text-slate-400 hover:border-slate-200"
                       )}
                     >
                        <span className="text-xs font-black uppercase tracking-tighter">
                          {type === 'sale' ? 'Venda' : type === 'rent' ? 'Aluguel' : 'Ambos'}
                        </span>
                     </button>
                   ))}
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <div className="grid gap-3">
                  <Label className="text-slate-700 font-bold uppercase text-[11px] tracking-wider">Tipo de Imóvel</Label>
                  <Select value={propertyType} onValueChange={setPropertyType}>
                    <SelectTrigger className="rounded-2xl h-12 border-slate-200 bg-slate-50/50">
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
                <div className="grid gap-3">
                  <Label className="text-slate-700 font-bold uppercase text-[11px] tracking-wider">Área Total (m²)</Label>
                  <Input 
                    value={totalArea} 
                    onChange={e => setTotalArea(e.target.value)} 
                    placeholder="Ex: 250" 
                    className="rounded-2xl h-12 border-slate-200 bg-slate-50/50"
                  />
                </div>
                <div className="grid gap-3">
                  <Label className="text-slate-700 font-bold uppercase text-[11px] tracking-wider">Área Útil (m²)</Label>
                  <Input 
                    value={usefulArea} 
                    onChange={e => setUsefulArea(e.target.value)} 
                    placeholder="Ex: 180" 
                    className="rounded-2xl h-12 border-slate-200 bg-slate-50/50"
                  />
                </div>
              </div>

              <div className="grid gap-3">
                <Label className="text-slate-700 font-bold uppercase text-[11px] tracking-wider">Endereço Completo</Label>
                <Input 
                  value={address} 
                  onChange={e => setAddress(e.target.value)} 
                  placeholder="Rua, Número, Bairro, Cidade - UF" 
                  className="rounded-2xl h-14 border-slate-200 shadow-sm"
                />
              </div>
            </div>

            <div className="grid gap-3">
              <Label className="text-slate-700 font-bold uppercase text-[11px] tracking-wider">Localização Geográfica (Pin)</Label>
              <div className="rounded-3xl overflow-hidden border border-slate-200 h-[320px]">
                <LocationPinSelector 
                  value={location} 
                  onChange={setLocation} 
                  className="w-full h-full"
                />
              </div>
              <p className="text-[10px] text-slate-400 italic">Mova o pin para a localização exata no mapa para relatórios técnicos.</p>
            </div>
          </div>
        </Card>
      )}

      {entity.entity_type === 'party' && (
        <Card className="p-8 rounded-[2rem] border-slate-200 shadow-sm bg-white space-y-6">
           <div className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b pb-4">Dados de Contato e Documentação</div>
           <div className="grid md:grid-cols-3 gap-6">
              <div className="grid gap-2">
                <Label>CPF / CNPJ</Label>
                <Input
                  value={docDisplay}
                  onChange={(e) => setDocDigitsState(onlyDigits(e.target.value).slice(0, 14))}
                  className="rounded-xl h-12"
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="grid gap-2">
                <Label>WhatsApp</Label>
                <Input
                  value={whatsappDisplay}
                  onChange={(e) => setWhatsappDigitsState(normalizeWhatsappDigits(e.target.value))}
                  className="rounded-xl h-12"
                  placeholder="(11) 99999-0000"
                />
              </div>
              <div className="grid gap-2">
                <Label>E-mail</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl h-12"
                  placeholder="exemplo@email.com"
                />
              </div>
           </div>
        </Card>
      )}
    </div>
  );
}

function TagIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
      <path d="M7 7h.01" />
    </svg>
  );
}

function Building2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </svg>
  );
}
