import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import { FilePlus, Paperclip } from "lucide-react";

export function SalesOrderSimpleUploadDialog(props: {
  tenantId: string;
  caseId: string;
  className?: string;
}) {
  const { tenantId, caseId, className } = props;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPick = (pickedFile?: File | null) => {
    if (!pickedFile) {
      reset();
      return;
    }

    setFile(pickedFile);
    if (pickedFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(pickedFile);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } else {
      setPreviewUrl("");
    }
  };

  const handleUpload = async () => {
    if (!tenantId || !caseId || !file) return;

    setUploading(true);
    try {
      // 1. Upload to Storage
      const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
      const path = `tenants/${tenantId}/orders/attachments/${Date.now()}_${cleanName}`;
      
      const { error: uploadErr } = await supabase.storage
        .from("tenant-assets")
        .upload(path, file);
      
      if (uploadErr) throw uploadErr;

      const publicUrl = supabase.storage.from("tenant-assets").getPublicUrl(path).data.publicUrl;

      // 2. Create Case Attachment
      const { error: attachErr } = await supabase.from("case_attachments").insert({
        tenant_id: tenantId,
        case_id: caseId,
        kind: "image", // Using 'image' as a safe kind for now as per previous fixes
        storage_path: publicUrl,
        original_filename: file.name,
        content_type: file.type,
        meta_json: { 
          storage_path: path, 
          source: "manual_upload",
          kind: "document"
        }
      });

      if (attachErr) throw attachErr;

      showSuccess("Anexo adicionado com sucesso!");
      
      await qc.invalidateQueries({ queryKey: ["case_attachments", caseId] });

      setOpen(false);
      reset();
    } catch (e: any) {
      showError(`Falha ao enviar: ${e?.message ?? "erro"}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className={cn("h-9 rounded-2xl", className)}
          title="Adicionar anexo"
        >
          <Paperclip className="mr-2 h-4 w-4" />
          Adicionar anexo
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[95vw] max-w-[500px] rounded-[24px] border-slate-200 bg-white p-0 shadow-xl overflow-hidden">
        <div className="p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900">Novo anexo</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Selecione um arquivo para anexar ao pedido.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 grid gap-4">
            {previewUrl && (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="h-40 w-full rounded-xl object-contain"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Arquivo</Label>
              <Input
                ref={fileRef}
                type="file"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                className={cn(
                  "h-12 rounded-2xl border-slate-200 bg-slate-50/50",
                  "file:mr-4 file:rounded-xl file:border-0 file:bg-slate-200 file:px-4 file:py-2 file:text-xs file:font-bold file:text-slate-700"
                )}
              />
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end mt-4">
              <Button
                type="button"
                variant="ghost"
                className="h-11 rounded-2xl font-bold text-slate-500"
                onClick={() => setOpen(false)}
                disabled={uploading}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="h-11 rounded-2xl bg-blue-600 px-8 font-bold text-white hover:bg-blue-700 shadow-md shadow-blue-200 disabled:opacity-50"
                onClick={handleUpload}
                disabled={uploading || !file}
              >
                {uploading ? "Enviando..." : "Enviar arquivo"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
