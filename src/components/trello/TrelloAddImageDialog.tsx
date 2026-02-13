import { useMemo, useRef, useState } from "react";
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
import { ImagePlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB (primeira versão: base64 no banco)

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

export function TrelloAddImageDialog(props: {
  tenantId: string;
  caseId: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dataUrl, setDataUrl] = useState<string>("");
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFile(null);
    setDataUrl("");
    setReading(false);
    setSaving(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPick = async (next: File | null) => {
    setFile(next);
    setDataUrl("");
    if (!next) return;

    if (!next.type.startsWith("image/")) {
      showError("Selecione um arquivo de imagem.");
      reset();
      return;
    }

    if (next.size > MAX_IMAGE_BYTES) {
      showError("Imagem muito grande. Limite: 4MB (nesta versão).");
      reset();
      return;
    }

    setReading(true);
    try {
      const url = await fileToDataUrl(next);
      setDataUrl(url);
    } catch (e: any) {
      showError(`Falha ao ler imagem: ${e?.message ?? "erro"}`);
      reset();
    } finally {
      setReading(false);
    }
  };

  const sizeLabel = useMemo(() => {
    if (!file) return "";
    const kb = Math.round(file.size / 1024);
    return `${kb} KB`;
  }, [file]);

  const save = async () => {
    if (!props.caseId) return;
    if (!file || !dataUrl) {
      showError("Selecione uma imagem.");
      return;
    }

    setSaving(true);
    try {
      const basePayload: any = {
        case_id: props.caseId,
        kind: "image",
        // Primeira versão: data URL (base64) direto no campo.
        storage_path: dataUrl,
        original_filename: file.name,
        content_type: file.type || "image/jpeg",
        meta_json: {
          source: "inline_base64",
          size_bytes: file.size,
        },
      };

      // Compat: alguns ambientes antigos não têm tenant_id em case_attachments.
      const tryPayloads = [
        { ...basePayload, tenant_id: props.tenantId },
        basePayload,
      ];

      let lastErr: any = null;
      for (const payload of tryPayloads) {
        const res = await supabase.from("case_attachments").insert(payload);
        if (!res.error) {
          lastErr = null;
          break;
        }
        lastErr = res.error;

        const msg = String(res.error.message ?? "");
        if (!msg.toLowerCase().includes("tenant_id") || !msg.toLowerCase().includes("schema cache")) {
          break;
        }
      }
      if (lastErr) throw lastErr;

      // timeline_events sempre tem tenant_id
      if (props.tenantId) {
        await supabase.from("timeline_events").insert({
          tenant_id: props.tenantId,
          case_id: props.caseId,
          event_type: "attachment_added",
          actor_type: "admin",
          actor_id: null,
          message: `Anexo adicionado: ${file.name}`,
          meta_json: { kind: "image", source: "inline_base64", size_bytes: file.size },
          occurred_at: new Date().toISOString(),
        });
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case_attachments", props.tenantId, props.caseId] }),
        qc.invalidateQueries({ queryKey: ["timeline", props.tenantId, props.caseId] }),
      ]);

      showSuccess("Imagem anexada.");
      setOpen(false);
      reset();
    } catch (e: any) {
      showError(`Falha ao anexar: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
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
          className={cn("h-9 rounded-2xl", props.className)}
          title="Adicionar imagem (base64)"
        >
          <ImagePlus className="mr-2 h-4 w-4" /> Adicionar imagem
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[95vw] max-w-[760px] rounded-[24px] border-slate-200 bg-white p-0 shadow-xl">
        <div className="p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900">Novo anexo (imagem)</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Nesta primeira versão, a imagem é salva como base64 no banco.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-4 sm:grid-cols-[240px_1fr]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">
                Preview
              </div>
              <div className="p-3">
                {dataUrl ? (
                  <img
                    src={dataUrl}
                    alt="Preview"
                    className="h-48 w-full rounded-xl border border-slate-200 bg-slate-50 object-cover"
                  />
                ) : (
                  <div className="grid h-48 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500">
                    sem imagem
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div>
                <Label className="text-xs">Imagem</Label>
                <Input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                  className={cn(
                    "mt-1 rounded-2xl",
                    "file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700"
                  )}
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  {reading
                    ? "Convertendo para base64…"
                    : file
                      ? `${file.name} • ${sizeLabel}`
                      : "Selecione uma imagem (até 4MB)"}
                </div>
              </div>

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 rounded-2xl"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-5 text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                  onClick={save}
                  disabled={saving || reading || !dataUrl}
                >
                  {saving ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}