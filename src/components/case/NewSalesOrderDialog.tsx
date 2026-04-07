import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { Image as ImageIcon, ScanText, UserPlus, ArrowRight } from "lucide-react";
import { CaseCustomerDataEditorCard } from "@/components/case/CaseCustomerDataEditorCard";
import { SalesOrderItemsEditorCard } from "@/components/case/SalesOrderItemsEditorCard";

const SIM_URL = "https://pryoirzeghatrgecwrci.supabase.co/functions/v1/simulator-whatsapp";

type OcrProvider = "google_vision" | "google_document_ai";

type CaseFieldRow = {
  key: string;
  value_text: string | null;
  value_json?: any;
  confidence?: number | null;
  source?: string | null;
  updated_at?: string;
};

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

function getField(fields: CaseFieldRow[] | undefined, key: string) {
  return (fields ?? []).find((f) => f.key === key)?.value_text ?? "";
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

  const [tab, setTab] = useState<"manual" | "ocr">("manual");
  const [saving, setSaving] = useState(false);

  // Manual mode: create a draft case so we can reuse the same editor cards
  // (dados do cliente + itens + financeiro) as in the opened case.
  const [draftCaseId, setDraftCaseId] = useState<string | null>(null);
  const [draftCreated, setDraftCreated] = useState(false);
  const [finalized, setFinalized] = useState(false);

  // OCR
  const [ocrProvider, setOcrProvider] = useState<OcrProvider>("google_document_ai");
  const [ocrBase64, setOcrBase64] = useState<string>("");
  const [ocrMimeType, setOcrMimeType] = useState<string>("image/jpeg");
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState<string>("");
  const [readingImage, setReadingImage] = useState(false);

  const canRunOcr = Boolean(ocrBase64);

  const resetLocal = () => {
    setTab("manual");

    setOcrProvider("google_document_ai");
    setOcrBase64("");
    setOcrMimeType("image/jpeg");
    setOcrPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
    if (fileInputRef.current) fileInputRef.current.value = "";

    setDraftCaseId(null);
    setDraftCreated(false);
    setFinalized(false);
  };

  const createDraftCase = async () => {
    if (!tenantId || !journeyId) return null;

    const { data: created, error } = await supabase
      .from("cases")
      .insert({
        tenant_id: tenantId,
        journey_id: journeyId,
        case_type: "sales_order",
        status: "open",
        state: "new",
        created_by_channel: "panel",
        title: "Pedido (rascunho)",
        meta_json: { created_from: "sales_order_new", mode: "manual", draft: true },
      })
      .select("id")
      .single();

    if (error) throw error;
    const id = String((created as any)?.id ?? "");
    if (!id) throw new Error("Falha ao criar rascunho.");
    return id;
  };

  const softDeleteCase = async (caseId: string) => {
    await supabase
      .from("cases")
      .update({ deleted_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", caseId);
  };

  // When opening dialog, prepare a draft case for manual entry.
  useEffect(() => {
    if (!open) return;
    if (draftCreated) return;

    setSaving(true);
    createDraftCase()
      .then((id) => {
        setDraftCaseId(id);
        setDraftCreated(true);
      })
      .catch((e: any) => {
        showError(`Falha ao preparar rascunho: ${e?.message ?? "erro"}`);
      })
      .finally(() => setSaving(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fieldsQ = useQuery({
    queryKey: ["case_fields", tenantId, draftCaseId],
    enabled: Boolean(open && tenantId && draftCaseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_fields")
        .select("key,value_text,value_json,confidence,source,updated_at")
        .eq("case_id", draftCaseId!)
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as any as CaseFieldRow[];
    },
  });

  const itemsCountQ = useQuery({
    queryKey: ["case_items_count", draftCaseId],
    enabled: Boolean(open && draftCaseId),
    queryFn: async () => {
      // Cheap count: fetch 1 row only.
      const { data, error } = await supabase
        .from("case_items")
        .select("id")
        .eq("case_id", draftCaseId!)
        .limit(1);
      if (error) throw error;
      return (data ?? []).length;
    },
  });

  const finalizeManual = async () => {
    if (!draftCaseId) return;

    const fields = fieldsQ.data ?? [];
    const name = getField(fields, "name").trim();
    const phone = getField(fields, "phone").trim();
    const paymentTerms = getField(fields, "payment_terms").trim();

    if (!name && !phone) {
      showError('Preencha "Nome" ou "Telefone" e clique em "Salvar dados".');
      return;
    }

    if (!paymentTerms) {
      showError('Preencha "Condições de pagamento" e clique em "Salvar dados".');
      return;
    }

    const hasItems = (itemsCountQ.data ?? 0) > 0;
    if (!hasItems) {
      showError('Adicione ao menos 1 item e clique em "Salvar itens".');
      return;
    }

    setSaving(true);
    try {
      const title = name || phone || "Pedido";

      const { data: cRow } = await supabase
        .from("cases")
        .select("meta_json")
        .eq("tenant_id", tenantId)
        .eq("id", draftCaseId)
        .maybeSingle();

      const meta = (cRow as any)?.meta_json ?? {};

      const { error } = await supabase
        .from("cases")
        .update({
          title,
          meta_json: { ...meta, draft: false, finalized_at: new Date().toISOString() },
        })
        .eq("tenant_id", tenantId)
        .eq("id", draftCaseId);

      if (error) throw error;

      setFinalized(true);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["cases_by_tenant", tenantId] }),
        qc.invalidateQueries({ queryKey: ["case", tenantId, draftCaseId] }),
        qc.invalidateQueries({ queryKey: ["case_fields", tenantId, draftCaseId] }),
        qc.invalidateQueries({ queryKey: ["case_items", draftCaseId] }),
      ]);

      showSuccess("Pedido aberto.");

      onOpenChange(false);
      nav(`/app/orders/${draftCaseId}`);
    } catch (e: any) {
      showError(`Falha ao abrir pedido: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
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

  const runOcr = async () => {
    if (!tenantId) return;
    if (!canRunOcr) {
      showError("Selecione uma imagem.");
      return;
    }

    setSaving(true);
    try {
      // If the user created a manual draft but decided to OCR instead, delete the draft.
      if (draftCaseId && !finalized) {
        await softDeleteCase(draftCaseId);
        setDraftCaseId(null);
        setDraftCreated(false);
      }

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token ?? null;

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

      onOpenChange(false);
      nav(`/app/orders/${caseId}`);
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
      onOpenChange={async (v) => {
        if (!v) {
          // Closing: if draft wasn't finalized, delete it.
          if (draftCaseId && !finalized) {
            await softDeleteCase(draftCaseId);
          }
          resetLocal();
        }
        onOpenChange(v);
      }}
    >
      <DialogContent
        className={cn(
          "w-[95vw] max-w-[980px] rounded-[24px] border-slate-200 bg-white p-0 shadow-xl",
          // Keep centered but guarantee scrolling on small screens
          "max-h-[90vh] overflow-hidden"
        )}
      >
        <div className="max-h-[90vh] overflow-y-auto p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900">Novo pedido</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Abra um pedido manualmente (mesmos campos do case) ou envie uma foto para leitura automática.
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
                {!draftCaseId ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    Preparando rascunho…
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      Preencha <span className="font-semibold">Dados do cliente</span>, <span className="font-semibold">Financeiro</span>
                      (Condições de pagamento) e <span className="font-semibold">Itens do pedido</span>. Depois clique em
                      <span className="font-semibold"> Abrir pedido</span>.
                    </div>

                    {/* Same cards as the opened sales_order case */}
                    <CaseCustomerDataEditorCard caseId={draftCaseId} fields={fieldsQ.data as any} />
                    <SalesOrderItemsEditorCard caseId={draftCaseId} />

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                        onClick={finalizeManual}
                        disabled={saving}
                        title="Valida se dados/itens foram salvos e abre o case"
                      >
                        Abrir pedido <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
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
                            Envie uma foto; o sistema cria o pedido e extrai campos/itens.
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
                          Se o sistema detectar que é uma atualização (pedido repetido), ele consolida no case existente e você será direcionado para ele.
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