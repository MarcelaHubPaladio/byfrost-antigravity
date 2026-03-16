import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { showError, showSuccess } from "@/utils/toast";
import { FileUp, UploadCloud, CheckCircle2, Loader2, AlertCircle, AlertTriangle, ArrowRight, Table as TableIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type ParsedRow = {
  rowNo: number;
  name: string;
  subtype: string;
  legacyId: string;
  businessType: string;
  price: string;
  address: string;
  photoUrl: string;
  propertyType: string;
  totalArea: string;
  usefulArea: string;
  // Validation
  isValid: boolean;
  errors: string[];
  warnings: string[];
  interpretedPrice?: number;
  isConsult?: boolean;
};

type ImportStep = "upload" | "preview" | "importing";

export function ImovelImportDialog({
  tenantId,
  open,
  onOpenChange,
}: {
  tenantId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState("");
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<ImportStep>("upload");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const reset = () => {
    setFileName("");
    setRawText("");
    setImporting(false);
    setStep("upload");
    setProgress(null);
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    setFileName(f.name);
    try {
      const text = await f.text();
      setRawText(text);
    } catch (e: any) {
      showError("Erro ao ler arquivo");
    }
  };

  const parsedRows = useMemo(() => {
    if (!rawText.trim()) return [];
    try {
      const lines = rawText.split(/\r\n|\n|\r/);
      if (lines.length < 2) return [];
      
      const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ç/g, "c");
      const headerRaw = lines[0];
      const delimiter = headerRaw.includes(";") ? ";" : ",";
      const headers = headerRaw.split(delimiter).map(h => normalize(h.trim().replace(/^"|"$/g, '')));
      
      const idxName = headers.findIndex(h => h.includes("nome") || h.includes("name") || h.includes("titulo"));
      const idxLegacy = headers.findIndex(h => h.includes("id") || h.includes("legado") || h.includes("legacy") || h.includes("codigo"));
      const idxBusiness = headers.findIndex(h => h.includes("tipo") || h.includes("negocio") || h.includes("business") || h.includes("finalidade"));
      const idxPrice = headers.findIndex(h => h.includes("preco") || h.includes("price") || h.includes("valor"));
      const idxAddress = headers.findIndex(h => h.includes("endereco") || h.includes("address") || h.includes("localizacao") || h.includes("logradouro"));
      const idxPhoto = headers.findIndex(h => h.includes("foto") || h.includes("photo") || h.includes("imagem") || h.includes("image") || h.includes("url"));
      const idxPropertyType = headers.findIndex(h => h.includes("tipo_imovel") || h.includes("property_type") || h.includes("categoria") || h.includes("tipo do imovel"));
      const idxTotalArea = headers.findIndex(h => h.includes("area_total") || h.includes("total_area") || h.includes("area total"));
      const idxUsefulArea = headers.findIndex(h => h.includes("area_util") || h.includes("useful_area") || h.includes("area privativa") || h.includes("area util"));

      const out: ParsedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
        
        const name = idxName >= 0 ? cols[idxName] || "" : "";
        const priceStr = idxPrice >= 0 ? cols[idxPrice] || "" : "";
        const businessTypeStr = idxBusiness >= 0 ? cols[idxBusiness]?.toLowerCase() || "" : "";
        
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!name) errors.push("Nome ausente");
        
        const rawPrice = priceStr.toLowerCase();
        const isConsult = rawPrice.includes("consultar") || rawPrice.includes("consulta");
        
        let numericPrice = 0;
        if (priceStr && !isConsult) {
          let clean = priceStr.replace(/[R$\s]/g, "");
          if (clean.includes(",") && clean.includes(".")) {
            clean = clean.replace(/\./g, "").replace(",", ".");
          } else if (clean.includes(",")) {
            clean = clean.replace(",", ".");
          } else if (clean.includes(".")) {
            const parts = clean.split(".");
            if (parts.length > 2 || parts[parts.length - 1].length === 3) {
              clean = clean.replace(/\./g, "");
            }
          }
          numericPrice = parseFloat(clean) || 0;
          if (numericPrice <= 0 && !isConsult) warnings.push("Preço zerado ou inválido");
        } else if (!priceStr) {
          warnings.push("Preço não informado");
        }

        const busTypeMapped = businessTypeStr.includes("aluguel") || businessTypeStr.includes("rent") 
          ? (businessTypeStr.includes("venda") || businessTypeStr.includes("sale") ? "both" : "rent")
          : "sale";

        out.push({
          rowNo: i + 1,
          name,
          subtype: "imovel",
          legacyId: idxLegacy >= 0 ? cols[idxLegacy] || "" : "",
          businessType: busTypeMapped,
          price: priceStr,
          address: idxAddress >= 0 ? cols[idxAddress] || "" : "",
          photoUrl: idxPhoto >= 0 ? cols[idxPhoto] || "" : "",
          propertyType: idxPropertyType >= 0 ? cols[idxPropertyType] || "casa" : "casa",
          totalArea: idxTotalArea >= 0 ? cols[idxTotalArea] || "" : "",
          usefulArea: idxUsefulArea >= 0 ? cols[idxUsefulArea] || "" : "",
          isValid: errors.length === 0,
          errors,
          warnings,
          interpretedPrice: numericPrice,
          isConsult
        });
      }
      return out;
    } catch (e) {
      return [];
    }
  }, [rawText]);

  const validRows = useMemo(() => parsedRows.filter(r => r.isValid), [parsedRows]);
  const errorRows = useMemo(() => parsedRows.filter(r => !r.isValid), [parsedRows]);

  const startImport = async () => {
    if (!validRows.length) return;
    setImporting(true);
    setStep("importing");
    setProgress({ done: 0, total: validRows.length });

    let done = 0;
    for (const row of validRows) {
      try {
        const busType = row.businessType as "sale" | "rent" | "both";

        let finalPhotoUrl = null;
        if (row.photoUrl && row.photoUrl.startsWith("http")) {
           try {
              const res = await fetch(row.photoUrl);
              const blob = await res.blob();
              const ext = row.photoUrl.split(".").pop()?.split(/[#?]/)[0] || "jpg";
              const path = `${tenantId}/imports/${crypto.randomUUID()}.${ext}`;
              
              const { error: upErr } = await supabase.storage
                .from("media_kit_assets")
                .upload(path, blob);
                
              if (!upErr) {
                 const { data: { publicUrl } } = supabase.storage
                   .from("media_kit_assets")
                   .getPublicUrl(path);
                 finalPhotoUrl = publicUrl;
              } else {
                 console.warn("Erro ao subir para storage, usando fallback URL:", upErr);
                 finalPhotoUrl = row.photoUrl;
              }
           } catch (err) {
              console.warn("Falha ao importar foto da URL (CORS?), usando fallback:", row.photoUrl, err);
              finalPhotoUrl = row.photoUrl;
           }
        }

          const isConsult = row.isConsult;
          const numericPrice = row.interpretedPrice || 0;

          const { data: entityData, error: entityErr } = await supabase.from("core_entities").upsert({
            tenant_id: tenantId,
            entity_type: "offering",
            subtype: "imovel",
            display_name: row.name || "Sem nome",
            status: "active",
            deleted_at: null, // CRITICAL: Restore soft-deleted entities
            legacy_id: row.legacyId || null,
            business_type: busType,
            location_json: { address: row.address },
            property_type: row.propertyType.toLowerCase() || 'casa',
            total_area: parseFloat(row.totalArea.replace(",", ".")) || null,
            useful_area: parseFloat(row.usefulArea.replace(",", ".")) || null,
            metadata: {
              price_sale: (busType === 'sale' || busType === 'both') ? numericPrice : 0,
              price_rent: (busType === 'rent') ? numericPrice : 0,
              price_consult: isConsult,
              photo_url: finalPhotoUrl,
              imported: true,
              import_date: new Date().toISOString()
            }
          }, { 
            onConflict: row.legacyId ? 'tenant_id, legacy_id' : 'tenant_id, display_name' 
          }).select("id").single();

        if (entityErr) throw entityErr;

        // NEW: Also insert into core_entity_photos for room photo management
        if (finalPhotoUrl && entityData) {
          // Set others as not main for this entity to ensure imported is primary
          await supabase.from("core_entity_photos")
            .update({ is_main: false })
            .eq("entity_id", entityData.id)
            .eq("tenant_id", tenantId);

          await supabase.from("core_entity_photos").insert({
            tenant_id: tenantId,
            entity_id: entityData.id,
            room_type: "geral",
            url: finalPhotoUrl,
            is_main: true,
            metadata: { imported: true }
          });
        }
      } catch (e) {
        console.error("Erro na linha", row.rowNo, e);
      }
      done++;
      setProgress({ done, total: validRows.length });
    }

    showSuccess(`${done} imóveis importados!`);
    qc.invalidateQueries({ queryKey: ["entities"] });
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar Imóveis</DialogTitle>
          <DialogDescription>
            Selecione uma planilha CSV para importar ofertas do subtipo Imóvel.
            A primeira linha deve conter os cabeçalhos: Nome, Código/Legacy ID, Tipo de Negócio, Preço, Endereço.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {step === "upload" && (
            <div className="space-y-4">
              {!fileName ? (
                <div className="group relative h-40 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 hover:border-indigo-300 hover:bg-slate-50 transition-all flex flex-col items-center justify-center p-6 text-center">
                  <UploadCloud className="w-10 h-10 text-slate-300 group-hover:text-indigo-400 transition-colors mb-2" />
                  <p className="text-sm font-bold text-slate-600">Arraste ou clique para selecionar CSV</p>
                  <p className="text-xs text-slate-400 mt-1">Colunas: Nome, ID Legado, Finalidade, Valor, Endereço</p>
                  <input
                    type="file"
                    accept=".csv"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={e => onFile(e.target.files?.[0] || null)}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-2xl border border-indigo-100 bg-indigo-50/30">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 text-white p-2 rounded-xl">
                      <FileUp className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">{fileName}</div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                        {parsedRows.length} linhas detectadas
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => reset()} className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl">
                    Remover
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4 h-[400px] flex flex-col">
              <div className="flex items-center justify-between gap-4">
                 <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
                       {validRows.length} válidos
                    </Badge>
                    {errorRows.length > 0 && (
                      <Badge variant="secondary" className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
                         {errorRows.length} com erro
                      </Badge>
                    )}
                 </div>
                 <Button variant="ghost" size="sm" onClick={() => reset()} className="text-[10px] h-7 uppercase font-black text-slate-400 hover:text-slate-600">
                    Trocar arquivo
                 </Button>
              </div>

              <ScrollArea className="flex-1 border rounded-2xl overflow-hidden bg-slate-50/30">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-white sticky top-0 border-b shadow-sm z-10">
                    <tr>
                      <th className="p-3 font-bold text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="p-3 font-bold text-slate-400 uppercase tracking-wider">Nome</th>
                      <th className="p-3 font-bold text-slate-400 uppercase tracking-wider">Tipo/Preço</th>
                      <th className="p-3 font-bold text-slate-400 uppercase tracking-wider">Ajustes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((row) => (
                      <tr key={row.rowNo} className={cn("bg-white/50", !row.isValid && "bg-red-50/30")}>
                        <td className="p-3 align-top whitespace-nowrap">
                          {row.isValid ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          )}
                        </td>
                        <td className="p-3 align-top">
                          <div className="font-bold text-slate-700 line-clamp-1">{row.name || "—"}</div>
                          <div className="text-[10px] text-slate-400">{row.address || "Sem endereço"}</div>
                        </td>
                        <td className="p-3 align-top whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <Badge variant="outline" className="text-[9px] h-4 py-0 w-fit border-slate-200 text-slate-500 uppercase">
                              {row.businessType === 'sale' ? 'Venda' : row.businessType === 'rent' ? 'Aluguel' : 'Ambos'}
                            </Badge>
                            <span className="font-mono text-[10px]">
                               {row.isConsult ? "Sob Consulta" : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.interpretedPrice || 0)}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 align-top">
                          <div className="space-y-1">
                            {row.errors.map((e, idx) => (
                              <div key={idx} className="flex items-center gap-1 text-[10px] text-red-600 font-medium">
                                <AlertCircle className="w-3 h-3" /> {e}
                              </div>
                            ))}
                            {row.warnings.map((w, idx) => (
                              <div key={idx} className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                                <AlertTriangle className="w-3 h-3" /> {w}
                              </div>
                            ))}
                            {row.isValid && row.errors.length === 0 && row.warnings.length === 0 && (
                              <span className="text-[10px] text-slate-400 italic">OK</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}

          {step === "importing" && (
            <div className="space-y-6 py-10 flex flex-col items-center">
              <div className="relative">
                 <Loader2 className="w-12 h-12 text-indigo-200 animate-spin" />
                 <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-indigo-600">
                    {Math.round((progress?.done || 0) / (progress?.total || 1) * 100)}%
                 </div>
              </div>
              <div className="text-center space-y-1">
                 <p className="text-sm font-bold text-slate-700">Importando registros...</p>
                 <p className="text-xs text-slate-400">Linha {progress?.done} de {progress?.total}</p>
              </div>
              <Progress value={progress ? (progress.done / progress.total) * 100 : 0} className="h-2 w-full max-w-xs" />
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importing} className="rounded-xl">
            {step === "importing" ? "Rodando..." : "Cancelar"}
          </Button>
          
          {step === "upload" && (
            <Button 
               onClick={() => setStep("preview")} 
               disabled={!parsedRows.length} 
               className="rounded-xl bg-indigo-600 hover:bg-indigo-700 gap-2 px-6"
            >
               Próximo <ArrowRight className="w-4 h-4" />
            </Button>
          )}

          {step === "preview" && (
            <Button 
              onClick={startImport} 
              disabled={validRows.length === 0} 
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 min-w-[140px] gap-2"
            >
              Confirmar {validRows.length} registros
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
