import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { Upload, X, FileText, Loader2, User, MapPin, UserPlus, ClipboardList, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

const CITIES_PR = [
  "Abatiá", "Adrianópolis", "Agudos do Sul", "Almirante Tamandaré", "Altamira do Paraná", "Alto Paraíso", "Alto Paraná", "Alto Piquiri", "Altônia", "Alvorada do Sul", "Amaporã", "Ampére", "Anahy", "Andirá", "Ângulo", "Antonina", "Antônio Olinto", "Apucarana", "Arapongas", "Arapoti", "Arapuã", "Araruna", "Araucária", "Ariranha do Ivaí", "Assaí", "Assis Chateaubriand", "Astorga", "Atalaia", "Balsa Nova", "Bandeirantes", "Barbosa Ferraz", "Barra do Jacaré", "Barracão", "Bela Vista da Caroba", "Bela Vista do Paraíso", "Bituruna", "Boa Esperança", "Boa Esperança do Iguaçu", "Boa Ventura de São Roque", "Boa Vista da Aparecida", "Bocaiúva do Sul", "Bom Jesus do Sul", "Bom Sucesso", "Bom Sucesso do Sul", "Borrazópolis", "Braganey", "Brasilândia do Sul", "Cafeara", "Cafelândia", "Cafezal do Sul", "Califórnia", "Cambará", "Cambé", "Cambira", "Campina da Lagoa", "Campina do Simão", "Campina Grande do Sul", "Campo Bonito", "Campo do Tenente", "Campo Largo", "Campo Magro", "Campo Mourão", "Cândido de Abreu", "Candói", "Cantagalo", "Capanema", "Capitão Leônidas Marques", "Carambeí", "Carlópolis", "Cascavel", "Castro", "Catanduvas", "Centenário do Sul", "Cerro Azul", "Céu Azul", "Chopinzinho", "Cianorte", "Cidade Gaúcha", "Clevelândia", "Colombo", "Colorado", "Congonhinhas", "Conselheiro Mairinck", "Contenda", "Corbélia", "Cornélio Procópio", "Coronel Domingos Soares", "Coronel Vivida", "Corumbataí do Sul", "Cruz Machado", "Cruzeiro do Iguaçu", "Cruzeiro do Oeste", "Cruzeiro do Sul", "Cruzmaltina", "Curitiba", "Curiúva", "Diamante do Norte", "Diamante do Oeste", "Diamante do Sul", "Dois Vizinhos", "Douradina", "Doutor Camargo", "Doutor Ulysses", "Enéas Marques", "Engenheiro Beltrão", "Entre Rios do Oeste", "Esperança Nova", "Espigão Alto do Iguaçu", "Farol", "Faxinal", "Fazenda Rio Grande", "Fênix", "Fernandes Pinheiro", "Figueira", "Flor da Serra do Sul", "Floraí", "Floresta", "Florestópolis", "Flórida", "Formosa do Oeste", "Foz do Iguaçu", "Foz do Jordão", "Francisco Alves", "Francisco Beltrão", "General Carneiro", "Godoy Moreira", "Goioerê", "Goioxim", "Grandes Rios", "Guairaçá", "Guaíra", "Guamiranga", "Guapirama", "Guaporema", "Guaraci", "Guaraniaçu", "Guarapuava", "Guaraqueçaba", "Guaratuba", "Honório Serpa", "Ibaiti", "Ibema", "Ibiporã", "Icaraíma", "Iguaraçu", "Iguatu", "Imbaú", "Imbituva", "Inácio Martins", "Inajá", "Indianópolis", "Ipiranga", "Iporã", "Iracema do Oeste", "Irati", "Iretama", "Itaguajé", "Itaipulândia", "Itambaracá", "Itambé", "Itapejara d'Oeste", "Itaperuçu", "Itaúna do Sul", "Ivaí", "Ivaiporã", "Ivaté", "Ivatuba", "Jaboti", "Jacarezinho", "Jaguapitã", "Jaguariaíva", "Jandaia do Sul", "Janiópolis", "Japira", "Japurá", "Jardim Alegre", "Jardim Olinda", "Jataizinho", "Jesuítas", "Joaquim Távora", "Jundiaí do Sul", "Juranda", "Jussara", "Kaloré", "Lapa", "Laranjal", "Laranjeiras do Sul", "Leópolis", "Lidianópolis", "Lindoeste", "Loanda", "Lobato", "Londrina", "Luiziana", "Lunardelli", "Lupionópolis", "Mallet", "Mamborê", "Mandaguaçu", "Mandaguari", "Mandirituba", "Manfrinópolis", "Mangueirinha", "Manoel Ribas", "Marechal Cândido Rondon", "Maria Helena", "Marialva", "Marilândia do Sul", "Marilena", "Mariluz", "Maringá", "Mariópolis", "Maripá", "Marmeleiro", "Marquinho", "Marumbi", "Matelândia", "Matinhos", "Mato Rico", "Mauá da Serra", "Medianeira", "Mercedes", "Mirador", "Miraselva", "Missal", "Moreira Sales", "Morretes", "Munhoz de Melo", "Nossa Senhora das Graças", "Nova Aliança do Ivaí", "Nova América da Colina", "Nova Aurora", "Nova Cantu", "Nova Esperança", "Nova Esperança do Sudoeste", "Nova Fátima", "Nova Laranjeiras", "Nova Londrina", "Nova Olímpia", "Nova Prata do Iguaçu", "Nova Santa Bárbara", "Nova Santa Rosa", "Nova Tebas", "Novo Itacolomi", "Ortigueira", "Ourizona", "Ouro Verde do Oeste", "Paiçandu", "Palmas", "Palmeira", "Palmital", "Palotina", "Paraíso do Norte", "Paranacity", "Paranaguá", "Paranapoema", "Paranavaí", "Pato Bragado", "Pato Branco", "Paula Freitas", "Paulo Frontin", "Peabiru", "Perobal", "Pérola", "Pérola d'Oeste", "Piên", "Pinhais", "Pinhão", "Piraí do Sul", "Piraquara", "Pitanga", "Pitangueiras", "Planaltina do Paraná", "Planalto", "Ponta Grossa", "Pontal do Paraná", "Porecatu", "Porto Amazonas", "Porto Barreiro", "Porto Rico", "Porto Vitória", "Prado Ferreira", "Pranchita", "Presidente Castelo Branco", "Primeiro de Maio", "Prudentópolis", "Quarto Centenário", "Quedas do Iguaçu", "Querência do Norte", "Quinta do Sol", "Quitandinha", "Ramilândia", "Rancho Alegre", "Rancho Alegre d'Oeste", "Realeza", "Rebouças", "Renascença", "Reserva", "Reserva do Iguaçu", "Ribeirão Claro", "Ribeirão do Pinhal", "Rio Azul", "Rio Bom", "Rio Bonito do Iguaçu", "Rio Branco do Ivaí", "Rio Negro", "Rondinha", "Rondon", "Rosário do Ivaí", "Sabáudia", "Salgado Filho", "Salto do Itararé", "Salto do Lontra", "Santa Amélia", "Santa Cecília do Pavão", "Santa Cruz de Monte Castelo", "Santa Fé", "Santa Helena", "Santa Inês", "Santa Isabel do Ivaí", "Santa Izabel do Oeste", "Santa Lúcia", "Santa Maria do Oeste", "Santa Mariana", "Santa Mônica", "Santa Tereza do Oeste", "Santa Terezinha de Itaipu", "Santana do Itararé", "Santo Antônio da Platina", "Santo Antônio do Caiuá", "Santo Antônio do Paraíso", "Santo Antônio do Sudoeste", "Santo Inácio", "São Carlos do Ivaí", "São Jerônimo da Serra", "São João", "São João do Caiuá", "São João do Ivaí", "São João do Triunfo", "São Jorge d'Oeste", "São Jorge do Ivaí", "São Jorge do Patrocínio", "São José da Boa Vista", "São José das Palmeiras", "São José dos Pinhais", "São Manoel do Paraná", "São Mateus do Sul", "São Miguel do Iguaçu", "São Pedro do Iguaçu", "São Pedro do Ivaí", "São Pedro do Paraná", "São Sebastião da Amoreira", "São Tomé", "Sapopema", "Sarandi", "Saudade do Iguaçu", "Sengés", "Serranópolis do Iguaçu", "Sertaneja", "Sertanópolis", "Siqueira Campos", "Sulina", "Tamarana", "Tamboara", "Tapejara", "Tapira", "Teixeira Soares", "Telêmaco Borba", "Terra Boa", "Terra Rica", "Terra Roxa", "Tibagi", "Tijucas do Sul", "Toledo", "Tomazina", "Três Barras do Paraná", "Tunas do Paraná", "Tuneiras do Oeste", "Tupãssi", "Turvo", "Ubiratã", "Umuarama", "União da Vitória", "Uniflor", "Uraí", "Ventania", "Vera Cruz do Oeste", "Verê", "Virmond", "Vitorino", "Wenceslau Braz", "Xambrê"
];

export function NewSalesOrderDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  journeyId: string;
}) {
  const { open, onOpenChange, tenantId, journeyId } = props;
  const nav = useNavigate();
  const qc = useQueryClient();

  const [saving, setSaving] = useState(false);
  
  // Form State
  const [customerName, setCustomerName] = useState("");
  const [city, setCity] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [observations, setObservations] = useState("");
  
  const [openCity, setOpenCity] = useState(false);

  const usersQ = useQuery({
    queryKey: ["tenant_users_profiles", tenantId],
    enabled: Boolean(open && tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id, display_name, email")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    }
  });

  const resetForm = () => {
    setCustomerName("");
    setCity("");
    setSellerId("");
    setOrderFile(null);
    setDocFiles([]);
    setObservations("");
    setSaving(false);
  };

  const uploadFile = async (file: File, subfolder: string) => {
    const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
    const path = `tenants/${tenantId}/orders/${subfolder}/${Date.now()}_${cleanName}`;
    const { error } = await supabase.storage.from("tenant-assets").upload(path, file);
    if (error) throw error;
    return path;
  };

  const handleCreate = async () => {
    if (!customerName.trim()) {
      showError("Informe o nome do cliente.");
      return;
    }

    setSaving(true);
    try {
      // 1. Create Case
      const { data: caseRow, error: caseErr } = await supabase
        .from("cases")
        .insert({
          tenant_id: tenantId,
          journey_id: journeyId,
          case_type: "sales_order",
          status: "open",
          state: "new",
          title: customerName,
          assigned_user_id: sellerId || null,
          created_by_channel: "panel",
          meta_json: { created_from: "simplified_modal" }
        })
        .select("id")
        .single();

      if (caseErr) throw caseErr;
      const caseId = caseRow.id;

      // 2. Upload Files
      let orderPath = "";
      if (orderFile) {
        orderPath = await uploadFile(orderFile, "main_orders");
      }
      
      const docPaths: string[] = [];
      for (const f of docFiles) {
        const p = await uploadFile(f, "attachments");
        docPaths.push(p);
      }

      // 3. Create Case Fields
      const fields = [
        { case_id: caseId, key: "name", value_text: customerName, source: "ocr", confidence: 1, last_updated_by: "panel" },
        { case_id: city && caseId, key: "city", value_text: city, source: "ocr", confidence: 1, last_updated_by: "panel" },
        { case_id: observations && caseId, key: "obs", value_text: observations, source: "ocr", confidence: 1, last_updated_by: "panel" },
      ].filter(f => f.case_id && f.value_text);

      if (orderPath) {
        fields.push({ case_id: caseId, key: "order_attachment", value_text: orderPath, source: "ocr", confidence: 1, last_updated_by: "panel" } as any);
      }
      if (docPaths.length > 0) {
        fields.push({ case_id: caseId, key: "docs_attachments", value_text: JSON.stringify(docPaths), source: "ocr", confidence: 1, last_updated_by: "panel" } as any);
      }

      const { error: fieldsErr } = await supabase.from("case_fields").upsert(fields as any, { onConflict: "case_id,key" });
      if (fieldsErr) console.error("Error creating case fields:", fieldsErr);

      // 4. Create Case Attachments (for visibility in generic attachment lists)
      const attachmentsPayload = [];
      if (orderPath && orderFile) {
        attachmentsPayload.push({
          tenant_id: tenantId,
          case_id: caseId,
          kind: "order",
          storage_path: supabase.storage.from("tenant-assets").getPublicUrl(orderPath).data.publicUrl,
          original_filename: orderFile.name,
          content_type: orderFile.type,
          meta_json: { storage_path: orderPath, source: "simplified_modal" }
        });
      }
      for (let i = 0; i < docFiles.length; i++) {
        attachmentsPayload.push({
          tenant_id: tenantId,
          case_id: caseId,
          kind: "document",
          storage_path: supabase.storage.from("tenant-assets").getPublicUrl(docPaths[i]).data.publicUrl,
          original_filename: docFiles[i].name,
          content_type: docFiles[i].type,
          meta_json: { storage_path: docPaths[i], source: "simplified_modal" }
        });
      }

      if (attachmentsPayload.length > 0) {
        const { error: attachErr } = await supabase.from("case_attachments").insert(attachmentsPayload);
        if (attachErr) console.error("Error creating case attachments:", attachErr);
      }

      showSuccess("Pedido criado com sucesso!");
      
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["cases_by_tenant", tenantId] }),
        qc.invalidateQueries({ queryKey: ["cases"] }),
      ]);

      onOpenChange(false);
      resetForm();
      nav(`/app/orders/${caseId}`);
    } catch (e: any) {
      showError(`Falha ao criar pedido: ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) resetForm();
      onOpenChange(v);
    }}>
      <DialogContent className="sm:max-w-[600px] rounded-[32px] overflow-hidden p-0 border-none shadow-2xl">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <UserPlus className="w-8 h-8" />
              Novo Pedido de Venda
            </DialogTitle>
            <DialogDescription className="text-blue-100 text-sm font-medium">
              Preencha os dados abaixo para iniciar um novo pedido.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <User className="w-3 h-3" /> Nome do Cliente
              </Label>
              <Input 
                placeholder="Ex: João da Silva" 
                value={customerName} 
                onChange={e => setCustomerName(e.target.value)}
                className="h-12 rounded-2xl border-slate-200 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-2 flex flex-col">
              <Label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <MapPin className="w-3 h-3" /> Cidade (PR)
              </Label>
              <Popover open={openCity} onOpenChange={setOpenCity}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCity}
                    className="h-12 w-full justify-between rounded-2xl border-slate-200 font-normal hover:bg-slate-50 transition-colors"
                  >
                    {city ? city : <span className="text-slate-500">Selecione a cidade...</span>}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-2xl shadow-xl border-slate-200" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar cidade..." className="h-12" />
                    <CommandList className="max-h-[300px]">
                      <CommandEmpty>Cidade não encontrada.</CommandEmpty>
                      <CommandGroup>
                        {CITIES_PR.map((c) => (
                          <CommandItem
                            key={c}
                            value={c}
                            onSelect={(currentValue) => {
                              setCity(currentValue === city ? "" : currentValue);
                              setOpenCity(false);
                            }}
                            className="rounded-xl m-1"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                city === c ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {c}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <ClipboardList className="w-3 h-3" /> Vendedor Responsável
            </Label>
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger className="h-12 rounded-2xl border-slate-200">
                <SelectValue placeholder="Selecione um vendedor..." />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {usersQ.data?.map(u => (
                  <SelectItem key={u.user_id} value={u.user_id} className="rounded-xl">
                    {u.display_name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Anexar o Pedido</Label>
              <div className="relative">
                <Input 
                  type="file" 
                  onChange={e => setOrderFile(e.target.files?.[0] || null)}
                  className="h-12 rounded-2xl border-slate-200 file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {orderFile && (
                  <button onClick={() => setOrderFile(null)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Anexar Documentos</Label>
              <Input 
                type="file" 
                multiple 
                onChange={e => setDocFiles(Array.from(e.target.files || []))}
                className="h-12 rounded-2xl border-slate-200 file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              {docFiles.length > 0 && (
                <p className="text-[10px] text-slate-500 font-medium">{docFiles.length} arquivos selecionados</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Observações</Label>
            <Textarea 
              placeholder="Alguma informação adicional importante..." 
              value={observations} 
              onChange={e => setObservations(e.target.value)}
              className="rounded-2xl border-slate-200 min-h-[100px] focus:ring-blue-500"
            />
          </div>
        </div>

        <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-2xl h-12 font-bold text-slate-500">
            Cancelar
          </Button>
          <Button 
            onClick={handleCreate} 
            disabled={saving || !customerName.trim()}
            className="rounded-2xl h-12 px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-200 transition-all active:scale-95"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : (
              "Criar Pedido"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}