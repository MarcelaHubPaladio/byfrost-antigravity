import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { SUPABASE_URL_IN_USE } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";

async function fileToBase64(file: File) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function helpForEdgeFunctionError(message: string) {
  const m = (message ?? "").toLowerCase();
  if (m.includes("failed to send a request") || m.includes("failed to fetch")) {
    return (
      "O navegador não conseguiu chamar a Edge Function. Checklist:\n" +
      `• O frontend está apontando para o projeto correto? (Supabase: ${SUPABASE_URL_IN_USE})\n` +
      "• A função 'financial-ingestion-upload' está deployada nesse mesmo projeto?\n" +
      "• No Supabase, confirme que Edge Functions está habilitado e a função existe."
    );
  }
  if (m.includes("non-2xx") || m.startsWith("http ")) {
    return (
      "A Edge Function respondeu com erro (4xx/5xx). Normalmente é:\n" +
      "• bucket de Storage inexistente ('financial-ingestion')\n" +
      "• env vars ausentes na função\n" +
      "• erro ao inserir em ingestion_jobs/job_queue (RLS/constraints)\n" +
      "Cheque o log da Edge Function no painel do Supabase para ver o stacktrace."
    );
  }
  if (m.includes("timeout")) {
    return (
      "A chamada para a Edge Function demorou demais e foi cancelada.\n" +
      "Cheque os logs da Edge Function no Supabase (pode estar travando em Storage/DB)."
    );
  }
  return null;
}

async function postToIngestionFunction(params: { accessToken: string; body: any; timeoutMs?: number }) {
  const url = `${SUPABASE_URL_IN_USE}/functions/v1/financial-ingestion-upload`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 25_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify(params.body),
      signal: controller.signal,
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      // ignore
    }

    return { res, text, json };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("timeout");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export function FinancialIngestionPanel() {
  const { activeTenantId } = useTenant();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const jobsQ = useQuery({
    queryKey: ["financial_ingestion_jobs", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 2500,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingestion_jobs")
        .select("id,tenant_id,file_name,status,processed_rows,error_log,created_at")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const accept = useMemo(() => ".csv,.ofx,text/csv,application/octet-stream", []);

  const onUpload = async () => {
    if (!activeTenantId) return;
    if (!file) return;

    setUploading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token ?? null;
      if (!accessToken) throw new Error("Sessão inválida. Faça logout/login.");

      const b64 = await fileToBase64(file);

      const body = {
        tenantId: activeTenantId,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        fileBase64: b64,
      };

      const baseUrl = (supabase as any)?.supabaseUrl as string | undefined;
      console.log("[finance-ingestion] posting to edge function", {
        baseUrl,
        endpoint: `${SUPABASE_URL_IN_USE}/functions/v1/financial-ingestion-upload`,
        tenantId: activeTenantId,
        fileName: file.name,
        sizeKb: Math.round(file.size / 1024),
        tokenPrefix: `${accessToken.slice(0, 16)}…`,
      });

      const { res, json, text } = await postToIngestionFunction({ accessToken, body });

      if (!res.ok) {
        const msg =
          json?.error ||
          json?.message ||
          (text ? text.slice(0, 220) : null) ||
          `HTTP ${res.status}`;
        throw new Error(`HTTP ${res.status}: ${msg}`);
      }

      if (!json?.ok) throw new Error(String(json?.error ?? "Falha no upload"));

      showSuccess("Upload recebido. Processamento assíncrono iniciado.");
      setFile(null);
      await jobsQ.refetch();
    } catch (e: any) {
      const msg = String(e?.message ?? "erro");
      const help = helpForEdgeFunctionError(msg);
      showError(`Falha no upload: ${msg}${help ? `\n\n${help}` : ""}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ingestão de extratos</div>
      <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
        Upload de CSV/OFX com processamento assíncrono (upload → parse → normalize → deduplicate → persist).
      </div>
      <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
        Supabase: <span className="font-mono">{SUPABASE_URL_IN_USE}</span>
      </div>

      <div className="mt-4 grid gap-2">
        <Label htmlFor="file" className="text-xs text-slate-700 dark:text-slate-300">
          Arquivo (.csv ou .ofx)
        </Label>
        <Input
          id="file"
          type="file"
          accept={accept}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div className="flex items-center gap-2">
          <Button onClick={onUpload} disabled={!file || uploading || !activeTenantId} className="h-10 rounded-2xl">
            {uploading ? "Enviando…" : "Enviar e processar"}
          </Button>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : "Selecione um arquivo"}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Jobs recentes</div>
        <div className="mt-2 grid gap-2">
          {(jobsQ.data ?? []).map((j: any) => (
            <div
              key={j.id}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-slate-900 dark:text-slate-100">{j.file_name}</div>
                <div className="text-slate-600 dark:text-slate-400">
                  <span className="font-medium">{j.status}</span>
                  {typeof j.processed_rows === "number" ? ` • ${j.processed_rows} inseridas` : ""}
                </div>
              </div>
              {j.error_log ? (
                <div className="mt-1 whitespace-pre-wrap text-[11px] text-amber-700 dark:text-amber-300">
                  {j.error_log}
                </div>
              ) : null}
            </div>
          ))}

          {!jobsQ.isLoading && !(jobsQ.data ?? []).length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/40 px-3 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/20 dark:text-slate-400">
              Nenhum job ainda.
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}