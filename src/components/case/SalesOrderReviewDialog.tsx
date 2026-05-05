import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CaseCustomerDataEditorCard } from "@/components/case/CaseCustomerDataEditorCard";
import { SalesOrderItemsEditorCard } from "@/components/case/SalesOrderItemsEditorCard";
import { ZoomableImage } from "@/components/case/ZoomableImage";
import { ExternalLink, Image as ImageIcon, FileText, FileCode, FileSpreadsheet, FileArchive, Download } from "lucide-react";

type FieldRow = {
  key: string;
  value_text: string | null;
  source?: string | null;
  confidence?: number | null;
};

export function SalesOrderReviewDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  imageUrl: string | null;
  contentType?: string | null;
  filename?: string | null;
  fields: FieldRow[] | undefined;
}) {
  const { open, onOpenChange, caseId, imageUrl, contentType, filename, fields } = props;

  const safeUrl = useMemo(() => {
    const u = (imageUrl ?? "").trim();
    return u || null;
  }, [imageUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[85vh] w-[95vw] max-w-none rounded-[24px] border-slate-200 bg-white p-0 shadow-xl sm:h-[85vh] sm:w-[90vw] lg:h-[80vh] lg:w-[80vw]">
        <div className="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden">
          <DialogHeader className="px-5 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="truncate text-base font-semibold text-slate-900">
                  Revisão do pedido
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs text-slate-600">
                  Dê zoom na imagem e preencha manualmente os dados ao lado.
                </DialogDescription>
              </div>

              {safeUrl ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 rounded-2xl"
                  onClick={() => window.open(safeUrl, "_blank", "noopener,noreferrer")}
                  title="Abrir imagem em uma nova aba"
                >
                  <ExternalLink className="mr-2 h-4 w-4" /> Abrir
                </Button>
              ) : null}
            </div>
          </DialogHeader>

          <div className="grid h-full min-h-0 gap-0 overflow-hidden md:grid-cols-[3fr_2fr]">
            {/* Left: image (60%) */}
            <div className="relative h-full min-h-0 overflow-hidden border-t border-slate-200 bg-slate-50 md:border-r">
              {safeUrl ? (
                <>
                  {contentType?.startsWith("image/") ? (
                    <ZoomableImage src={safeUrl} alt={filename || "Anexo"} className="h-full w-full" />
                  ) : contentType === "application/pdf" ? (
                    <iframe
                      src={`${safeUrl}#toolbar=0`}
                      className="h-full w-full border-0"
                      title={filename || "PDF Preview"}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
                      <div className="relative">
                        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white shadow-xl">
                          {contentType?.includes("csv") || contentType?.includes("sheet") ? (
                            <FileSpreadsheet className="h-12 w-12 text-emerald-600" />
                          ) : contentType?.includes("zip") || contentType?.includes("rar") ? (
                            <FileArchive className="h-12 w-12 text-amber-600" />
                          ) : (
                            <FileText className="h-12 w-12 text-blue-600" />
                          )}
                        </div>
                        <div className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-blue-600 border-4 border-slate-50 flex items-center justify-center text-white shadow-lg">
                          <Download className="h-4 w-4" />
                        </div>
                      </div>
                      
                      <div className="text-center max-w-sm">
                        <h3 className="text-lg font-bold text-slate-900 mb-2 truncate px-4">
                          {filename || "Documento"}
                        </h3>
                        <p className="text-sm text-slate-600 mb-6">
                          Este formato de arquivo ({contentType || "desconhecido"}) não pode ser visualizado diretamente no navegador.
                        </p>
                        
                        <Button
                          onClick={() => window.open(safeUrl, "_blank", "noopener,noreferrer")}
                          className="h-11 rounded-2xl bg-blue-600 px-8 font-bold text-white hover:bg-blue-700 shadow-lg shadow-blue-200"
                        >
                          Baixar e Abrir Arquivo
                          <ExternalLink className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-slate-600">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-sm">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-slate-900">Sem conteúdo</div>
                  <div className="text-xs text-slate-600">Este anexo não tem URL ou conteúdo disponível.</div>
                </div>
              )}
            </div>

            {/* Right: editable fields (40%) */}
            <div className="flex h-full min-h-0 flex-col border-t border-slate-200 bg-white">
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-4">
                  <CaseCustomerDataEditorCard caseId={caseId} fields={fields} />
                  <Separator className="my-4" />
                  <SalesOrderItemsEditorCard caseId={caseId} />
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}