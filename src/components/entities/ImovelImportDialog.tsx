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
import { FileUp, UploadCloud, CheckCircle2, Loader2 } from "lucide-react";

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
};

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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const reset = () => {
    setFileName("");
    setRawText("");
    setImporting(false);
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
        
        out.push({
          rowNo: i + 1,
          name: idxName >= 0 ? cols[idxName] || "" : "",
          subtype: "imovel",
          legacyId: idxLegacy >= 0 ? cols[idxLegacy] || "" : "",
          businessType: idxBusiness >= 0 ? cols[idxBusiness]?.toLowerCase() || "sale" : "sale",
          price: idxPrice >= 0 ? cols[idxPrice] || "0" : "0",
          address: idxAddress >= 0 ? cols[idxAddress] || "" : "",
          photoUrl: idxPhoto >= 0 ? cols[idxPhoto] || "" : "",
          propertyType: idxPropertyType >= 0 ? cols[idxPropertyType] || "casa" : "casa",
          totalArea: idxTotalArea >= 0 ? cols[idxTotalArea] || "" : "",
          usefulArea: idxUsefulArea >= 0 ? cols[idxUsefulArea] || "" : "",
        });
      }
      return out;
    } catch (e) {
      return [];
    }
  }, [rawText]);

  const startImport = async () => {
    if (!parsedRows.length) return;
    setImporting(true);
    setProgress({ done: 0, total: parsedRows.length });

    let done = 0;
    for (const row of parsedRows) {
      try {
        const busType = row.businessType.includes("aluguel") || row.businessType.includes("rent") 
          ? (row.businessType.includes("venda") || row.businessType.includes("sale") ? "both" : "rent")
          : "sale";

        let finalPhotoUrl = null;
        if (row.photoUrl && row.photoUrl.startsWith("http")) {
           try {
              const res = await fetch(row.photoUrl);
              const blob = await res.blob();
              const ext = row.photoUrl.split(".").pop()?.split(/[#?]/)[0] || "jpg";
              const path = `${tenantId}/imports/${crypto.randomUUID()}.${ext}`;
              
              const { error: upErr } = await supabase.storage
                .from("media-kit")
                .upload(path, blob);
                
              if (!upErr) {
                 const { data: { publicUrl } } = supabase.storage
                   .from("media-kit")
                   .getPublicUrl(path);
                 finalPhotoUrl = publicUrl;
              }
           } catch (err) {
              console.warn("Falha ao importar foto da URL:", row.photoUrl, err);
           }
        }

          const rawPrice = row.price.toLowerCase();
          const isConsult = rawPrice.includes("consultar") || rawPrice.includes("consulta");
          
          let numericPrice = 0;
          if (!isConsult) {
            let clean = row.price.replace(/[R$\s]/g, "");
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
          }

          const { data: entityData, error: entityErr } = await supabase.from("core_entities").insert({
            tenant_id: tenantId,
            entity_type: "offering",
            subtype: "imovel",
            display_name: row.name || "Sem nome",
            status: "active",
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
          }).select("id").single();

        if (entityErr) throw entityErr;

        // NEW: Also insert into core_entity_photos for room photo management
        if (finalPhotoUrl && entityData) {
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
      setProgress({ done, total: parsedRows.length });
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
          {!fileName ? (
            <div className="group relative h-40 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 hover:border-indigo-300 hover:bg-slate-50 transition-all flex flex-col items-center justify-center p-6 text-center">
              <UploadCloud className="w-10 h-10 text-slate-300 group-hover:text-indigo-400 transition-colors mb-2" />
              <p className="text-sm font-bold text-slate-600">Arraste ou clique para selecionar CSV</p>
              <p className="text-xs text-slate-400 mt-1">Colunas sugeridas: Nome, ID Legado, Tipo, Preço, Endereço</p>
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

          {importing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span>Processando...</span>
                <span>{progress?.done} / {progress?.total}</span>
              </div>
              <Progress value={progress ? (progress.done / progress.total) * 100 : 0} className="h-2" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
            Cancelar
          </Button>
          <Button 
            onClick={startImport} 
            disabled={!parsedRows.length || importing} 
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 min-w-[120px]"
          >
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importando
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Confirmar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
