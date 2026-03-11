import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { SUPABASE_ANON_KEY_IN_USE, SUPABASE_URL_IN_USE } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { showError, showSuccess } from "@/utils/toast";

type BankAccountRow = { id: string; bank_name: string; account_name: string; currency: string };

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

async function validateAccessToken(accessToken: string) {
  const url = `${SUPABASE_URL_IN_USE}/auth/v1/user`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY_IN_USE,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (res.ok) return true;
  const text = await res.text();
  return { ok: false as const, status: res.status, text };
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
  if (m.includes("invalid jwt")) {
    return (
      "JWT inválido geralmente significa sessão antiga/ambiente trocado.\n" +
      "Tente: logout/login. Se você mudou o projeto Supabase recentemente, limpe a sessão do navegador."
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
        apikey: SUPABASE_ANON_KEY_IN_USE,
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
  const [accountId, setAccountId] = useState<string>("");
  const [bankSource, setBankSource] = useState<string>("auto");
  const [extractType, setExtractType] = useState<string>("checking");

  const accountsQ = useQuery({
    queryKey: ["bank_accounts", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id,bank_name,account_name,currency")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BankAccountRow[];
    },
  });

  const jobsQ = useQuery({
    queryKey: ["financial_ingestion_jobs", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 30_000,
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
    if (!accountId) {
      showError("Selecione uma conta para vincular as transações importadas.");
      return;
    }

    setUploading(true);
    try {
      const b64 = await fileToBase64(file);

      const body = {
        tenantId: activeTenantId,
        accountId,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        fileBase64: b64,
        bankSource,
        extractType,
      };

      const baseUrl = (supabase as any)?.supabaseUrl as string | undefined;
      console.log("[finance-ingestion] posting to edge function", {
        baseUrl,
        endpoint: `${SUPABASE_URL_IN_USE}/functions/v1/financial-ingestion-upload`,
        tenantId: activeTenantId,
        accountId,
        fileName: file.name,
        sizeKb: Math.round(file.size / 1024),
      });

      // 1) Use current session token
      let accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? null;

      // 2) If missing, try refresh
      if (!accessToken) {
        await supabase.auth.refreshSession();
        accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? null;
      }
      if (!accessToken) throw new Error("Sessão inválida. Faça logout/login.");

      // 3) Validate token against Supabase Auth endpoint (helps distinguish gateway vs session issues)
      const tokenCheck = await validateAccessToken(accessToken);
      if (tokenCheck !== true) {
        console.warn("[finance-ingestion] access token rejected by auth endpoint", tokenCheck);
        throw new Error(`Token inválido no Auth: HTTP ${tokenCheck.status}`);
      }

      let { res, json, text } = await postToIngestionFunction({ accessToken, body });

      // If token is rejected, attempt a refresh + retry once.
      if (res.status === 401 && String(text).toLowerCase().includes("invalid jwt")) {
        await supabase.auth.refreshSession();
        accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? null;
        if (!accessToken) throw new Error("Sessão inválida. Faça logout/login.");

        const tokenCheck2 = await validateAccessToken(accessToken);
        if (tokenCheck2 !== true) {
          console.warn("[finance-ingestion] refreshed token rejected by auth endpoint", tokenCheck2);
          throw new Error(`Token inválido no Auth: HTTP ${tokenCheck2.status}`);
        }

        ({ res, json, text } = await postToIngestionFunction({ accessToken, body }));
      }

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
      const extra =
        msg.includes("HTTP 401") || msg.toLowerCase().includes("invalid jwt")
          ? "\n\nSe o token é válido no Auth mas a Function retorna Invalid JWT, desligue 'Verify JWT' nessa Edge Function no painel do Supabase e deixe a validação acontecer dentro da função."
          : "";
      showError(`Falha no upload: ${msg}${help ? `\n\n${help}` : ""}${extra}`);
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

      <div className="mt-4 grid gap-3">
        <div>
          <Label className="text-xs text-slate-700 dark:text-slate-300">Conta de destino</Label>
          <Select
            value={accountId}
            onValueChange={setAccountId}
            disabled={!activeTenantId || accountsQ.isLoading || !(accountsQ.data ?? []).length}
          >
            <SelectTrigger className="mt-1 rounded-2xl">
              <SelectValue
                placeholder={
                  accountsQ.isLoading
                    ? "Carregando…"
                    : !(accountsQ.data ?? []).length
                      ? "Cadastre uma conta primeiro (menu Lançamentos → Bancos)"
                      : "Selecione"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_">Selecione uma conta</SelectItem>
              {(accountsQ.data ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.account_name} • {a.bank_name} ({a.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-slate-700 dark:text-slate-300">Instituição / Banco</Label>
            <Select value={bankSource} onValueChange={setBankSource}>
              <SelectTrigger className="mt-1 rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático (Inter/OFX)</SelectItem>
                <SelectItem value="inter">Banco Inter (CSV)</SelectItem>
                <SelectItem value="cresol">Cresol (CSV)</SelectItem>
                <SelectItem value="itau">Itaú (CSV)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-700 dark:text-slate-300">Tipo de Extrato</Label>
            <Select value={extractType} onValueChange={setExtractType}>
              <SelectTrigger className="mt-1 rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checking">Conta Corrente</SelectItem>
                <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="file" className="text-xs text-slate-700 dark:text-slate-300">
            Arquivo (.csv ou .ofx)
          </Label>
          <Input id="file" type="file" accept={accept} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <div className="mt-2 flex items-center gap-2">
            <Button
              onClick={onUpload}
              disabled={!file || uploading || !activeTenantId || !accountId}
              className="h-10 rounded-2xl"
            >
              {uploading ? "Enviando…" : "Enviar e processar"}
            </Button>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : "Selecione um arquivo"}
            </div>
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
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400">
              Nenhum job ainda.
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}