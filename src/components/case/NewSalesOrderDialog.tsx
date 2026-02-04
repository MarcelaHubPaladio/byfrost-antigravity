import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { showError } from "@/utils/toast";
import { Image as ImageIcon, ScanText, UserPlus } from "lucide-react";

const SIM_URL = "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/simulator-whatsapp";

type OcrProvider = "google_vision" | "google_document_ai";

async function fileToBase64(file: File) {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function cleanOrNull(s: string) {
  const v = (s ?? "").trim();
  return v ? v : null;
}

export function NewSalesOrderDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  journeyId: string;
}) {
  const { open, onOpenChange, tenantId, journeyId } = props;
  const nav = useNavigate();
  const qc = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ------------------
  // Manual
  // ------------------
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualNotes, setManualNotes] = useState("");

  // ------------------
  // OCR
  // ------------------
  const [ocrProvider, setOcrProvider] = useState<OcrProvider>("google_document_ai");
  const [ocrBase64, setOcrBase64] = useState<string>("");
  const [ocrMimeType, setOcrMimeType] = useState<string>("image/jpeg");
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState<string>("");
  const [readingImage, setReadingImage] = useState(false);

  const [tab, setTab] = useState<"manual" | "ocr">("manual");
  const [saving, setSaving] = useState(false);

  const canCreateManual = Boolean(cleanOrNull(manualName) || cleanOrNull(manualPhone));
  const canRunOcr = Boolean(ocrBase64);

  const resetAll = () => {
    setManualName("");
    setManualPhone("");
    setManualTitle("");
    setManualNotes("");

    setOcrBase64("");
    setOcrMimeType("image/jpeg");
    setOcrPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
    if (fileInputRef.current) fileInputRef.current.value = "";

    setTab("manual");
    setOcrProvider("google_document_ai");
  };

  const onPickImage = async (file?: File | null) => {
    if (!file) {
      setOcrBase64("");
      setOcrMimeType("image/jpeg");
      setOcrPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return "";
      });
      return;
    }

    setReadingImage(true);
    try {
      const url = URL.createObjectURL(file);
      setOcrPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setOcrMimeType(file.type || "image/jpeg");
      const b64 = await fileToBase64(file);
      setOcrBase64(b64);
    } finally {
      setReadingImage(false);
    }
  };

  const createManual = async () => {
    if (!tenantId || !journeyId) return;
    if (!canCreateManual) {
      showError("Preencha ao menos Nome ou Telefone.");
      return;
    }

    setSaving(true);
    try {
      const title = cleanOrNull(manualTitle) ?? cleanOrNull(manualName) ?? "Pedido (manual)";

      const { data: created, error } = await supabase
        .from("cases")
        .insert({
          tenant_id: tenantId,
          journey_id: journeyId,
          case_type: "sales_order",
          status: "open",
          state: "new",
          created_by_channel: "panel",
          title,
          meta_json: { created_from: "sales_order_new", mode: "manual" },
        })
        .select("id")
        .single();

      if (error) throw error;
      const caseId = String((created as any)?.id ?? "");
      if (!caseId) throw new Error("Falha ao criar case.");

      const fields = [
        { key: "name", value_text: cleanOrNull(manualName) },
        { key: "phone", value_text: cleanOrNull(manualPhone) },
        { key: "obs", value_text: cleanOrNull(manualNotes) },
      ].filter((f) => f.value_text !== null);

      if (fields.length) {
        const { error: fErr } = await supabase
          .from("case_fields")
          .upsert(
            fields.map((f) => ({
              case_id: caseId,
              key: f.key,
              value_text: f.value_text,
              confidence: 1,
              source: "admin",
              last_updated_by: "panel",
            })) as any,
            { onConflict: "case_id,key" }
          );
        if (fErr) throw fErr;
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["cases_by_tenant", tenantId] }),
        qc.invalidateQueries({ queryKey: ["case", tenantId, caseId] }),
        qc.invalidateQueries({ queryKey: ["case_fields", tenantId, caseId] }),
      ]);

      onOpenChange(false);
      resetAll();
      nav(`/app/cases/${caseId}`);
    } catch (e: any) {
      showError(`Falha ao criar pedido manual: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  const runOcr = async () => {
    if (!tenantId) return;
    if (!canRunOcr) {
      showError("Selecione uma imagem.");
      return;
    }

    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token ?? null;

      // NOTE: simulator requires a valid "from" to map a vendor. We keep a stable default.
      const payload: any = {
        tenantId,
        type: "image",
        from: "+5511999999999",
        to: "",
        mediaBase64: ocrBase64,
        mimeType: ocrMimeType,
        journeyKey: "sales_order",
        ocrProvider,
      };

      const res = await fetch(SIM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      const caseId = String(json.caseId ?? "");
      if (!caseId) throw new Error("Resposta sem caseId.");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["cases_by_tenant", tenantId] }),
        qc.invalidateQueries({ queryKey: ["case", tenantId, caseId] }),
        qc.invalidateQueries({ queryKey: ["wa_messages_case", tenantId, caseId] }),
      ]);

      // If it was deduped/merged, simulator already returns the kept caseId.
      onOpenChange(false);
      resetAll();
      nav(`/app/cases/${caseId}`);
    } catch (e: any) {
      showError(`Falha ao ler imagem: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  const providerHint = useMemo(() => {
    return ocrProvider === "google_document_ai"
      ? "Document AI costuma extrair melhor tabelas (itens)."
      : "Vision é mais simples e costuma funcionar bem para texto corrido.";
  }, [ocrProvider]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetAll();
      }}
    >
      <DialogContent className="w-[95vw] max-w-[860px] rounded-[24px] border-slate-200 bg-white p-0 shadow-xl">
        <div className="p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900">Novo pedido</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Crie um pedido manualmente ou envie uma foto para leitura automática (OCR).
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-slate-100 p-1">
                <TabsTrigger
                  value="manual"
                  className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <UserPlus className="mr-2 h-4 w-4" /> Cadastro manual
                </TabsTrigger>
                <TabsTrigger
                  value="ocr"
                  className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <ScanText className="mr-2 h-4 w-4" /> Leitura por OCR
                </TabsTrigger>
              </TabsList>

              <TabsContent value="manual" className="mt-4">
                <div className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">Nome do cliente</Label>
                      <Input
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        className="mt-1 h-10 rounded-2xl"
                        placeholder="Ex: João da Silva"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Telefone (opcional)</Label>
                      <Input
                        value={manualPhone}
                        onChange={(e) => setManualPhone(e.target.value)}
                        className="mt-1 h-10 rounded-2xl"
                        placeholder="Ex: +55..."
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Título do pedido (opcional)</Label>
                    <Input
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                      className="mt-1 h-10 rounded-2xl"
                      placeholder="Ex: Pedido Agroforte"
                    />
                    <div className="mt-1 text-[11px] text-slate-500">Se vazio, usamos o nome do cliente.</div>
                  </div>

                  <div>
                    <Label className="text-xs">Observações (opcional)</Label>
                    <Textarea
                      value={manualNotes}
                      onChange={(e) => setManualNotes(e.target.value)}
                      className="mt-1 min-h-[92px] rounded-2xl"
                      placeholder="Ex: cliente pediu entrega amanhã..."
                    />
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 rounded-2xl"
                      onClick={() => onOpenChange(false)}
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-5 text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                      onClick={createManual}
                      disabled={saving || !canCreateManual}
                    >
                      {saving ? "Criando…" : "Criar pedido"}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="ocr" className="mt-4">
                <div className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-[240px_1fr]">
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-semibold text-slate-700">Preview</div>
                        <div className="text-[11px] text-slate-500">foto do pedido</div>
                      </div>
                      <div className="p-3">
                        {ocrPreviewUrl ? (
                          <img
                            src={ocrPreviewUrl}
                            alt="Preview"
                            className="h-44 w-full rounded-xl border border-slate-200 bg-slate-50 object-cover"
                          />
                        ) : (
                          <div className="grid h-44 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500">
                            sem imagem
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">Leitura automática</div>
                          <div className="mt-1 text-xs text-slate-600">
                            Envie uma foto; o sistema cria um case e tenta extrair campos/itens.
                          </div>
                        </div>
                        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                          <ImageIcon className="h-5 w-5" />
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3">
                        <div>
                          <Label className="text-xs">Imagem do pedido</Label>
                          <Input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
                            className={cn(
                              "mt-1 rounded-2xl",
                              "file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700"
                            )}
                          />
                          <div className="mt-1 text-[11px] text-slate-500">
                            {readingImage
                              ? "Convertendo para Base64…"
                              : ocrBase64
                                ? `Pronto (${Math.round(ocrBase64.length / 1024)} KB)`
                                : "Selecione uma foto para habilitar"}
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs">Motor de OCR</Label>
                          <select
                            value={ocrProvider}
                            onChange={(e) => setOcrProvider(e.target.value as OcrProvider)}
                            className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[hsl(var(--byfrost-accent)/0.45)]"
                          >
                            <option value="google_document_ai">Google Document AI</option>
                            <option value="google_vision">Google Vision</option>
                          </select>
                          <div className="mt-1 text-[11px] text-slate-500">{providerHint}</div>
                        </div>

                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-11 rounded-2xl"
                            onClick={() => onOpenChange(false)}
                            disabled={saving}
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="button"
                            className="h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] px-5 text-white hover:bg-[hsl(var(--byfrost-accent)/0.92)]"
                            onClick={runOcr}
                            disabled={saving || readingImage || !canRunOcr}
                          >
                            {saving ? "Lendo…" : "Criar via OCR"}
                          </Button>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                          Se o sistema detectar que é um pedido repetido, ele consolida no case existente e você será direcionado para ele.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}