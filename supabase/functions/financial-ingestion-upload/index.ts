import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// NOTE:
// This function is intentionally self-contained (no ../_shared imports)
// so it can be deployed via the Supabase Dashboard editor, which bundles a single folder.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function createSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceRoleKey) {
    throw new Error("missing_supabase_env");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "byfrost-financial-ingestion-upload" } },
  });
}

const BUCKET = "financial-ingestion";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400, details?: any) {
  return json({ ok: false, error: message, details: details ?? null }, status);
}

function decodeBase64ToBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function stripDiacritics(s: string) {
  try {
    return String(s ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  } catch {
    return String(s ?? "");
  }
}

function normalizeHeader(s: string) {
  return stripDiacritics(String(s ?? ""))
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s/g, "_");
}

function normalizeDescription(s: string) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function parseDateLoose(s: string): string | null {
  const v = String(s ?? "").trim();
  if (!v) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  // dd/mm/yyyy or dd/mm/yy
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  }

  // fallback: try Date
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const da = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }

  return null;
}

function parseOfxDateLoose(s: string): string | null {
  // OFX usually: YYYYMMDD or YYYYMMDDHHMMSS[...]
  const v = String(s ?? "").trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return parseDateLoose(v);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function extractOfxTag(block: string, tag: string) {
  const re = new RegExp(`<${tag}>([^<\r\n]*)`, "i");
  const m = String(block ?? "").match(re);
  return (m?.[1] ?? "").trim();
}

function parseOfx(text: string) {
  const raw = String(text ?? "");
  const blocks = raw.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];

  const rows: Record<string, string>[] = [];

  for (const b of blocks) {
    const dt = extractOfxTag(b, "DTPOSTED");
    const txDate = parseOfxDateLoose(dt);
    if (!txDate) continue;

    const amt = extractOfxTag(b, "TRNAMT");
    const memo = extractOfxTag(b, "MEMO") || extractOfxTag(b, "NAME");

    // Keep OFX identifiers in raw_payload for traceability
    const fitid = extractOfxTag(b, "FITID");
    const refnum = extractOfxTag(b, "REFNUM");
    const checknum = extractOfxTag(b, "CHECKNUM");

    rows.push({
      transaction_date: txDate,
      description: memo,
      amount: amt,
      fitid,
      refnum,
      checknum,
    });
  }

  return { headers: [] as string[], rows };
}

function parseAmountLoose(s: string): number | null {
  const v = String(s ?? "").trim();
  if (!v) return null;

  // Remove currency and spaces
  let t = v.replace(/[^0-9,\.-]/g, "").trim();

  // If it has both "." and ",", decide decimal by last separator
  const lastDot = t.lastIndexOf(".");
  const lastComma = t.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decSep = lastDot > lastComma ? "." : ",";
    const thouSep = decSep === "." ? "," : ".";
    t = t.split(thouSep).join("");
    if (decSep === ",") t = t.replace(",", ".");
  } else if (lastComma >= 0 && lastDot < 0) {
    // Assume comma is decimal
    t = t.replace(/\./g, "").replace(",", ".");
  }

  const n = Number(t);
  if (Number.isNaN(n)) return null;
  return n;
}

async function sha256Hex(text: string) {
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseCsvWithPreamble(text: string) {
  const lines = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return { headers: [] as string[], rows: [] as Record<string, string>[] };

  const splitLine = (line: string) => {
    // Supports commas/semicolons/tabs, minimal quote support.
    // Detect which separator is most likely:
    const counts = {
      semicolon: (line.match(/;/g) || []).length,
      comma: (line.match(/,/g) || []).length,
      tab: (line.match(/\t/g) || []).length,
    };

    let sep = ",";
    if (counts.tab > counts.semicolon && counts.tab > counts.comma) sep = "\t";
    else if (counts.semicolon >= counts.comma) sep = ";";

    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (!inQ && ch === sep) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  // Some Brazilian bank exports include a preamble (account/period/balance).
  // Find the first line that looks like a header.
  const isHeaderLine = (parts: string[]) => {
    if (parts.length < 3) return false;
    const joined = normalizeHeader(parts.join(" "));
    const hasDate = joined.includes("data");
    const hasAmount = joined.includes("valor") || joined.includes("amount") || joined.includes("montante");
    const hasDesc = joined.includes("descricao") || joined.includes("description") || joined.includes("historico");
    return hasDate && hasAmount && hasDesc;
  };

  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const parts = splitLine(lines[i]);
    if (isHeaderLine(parts)) {
      headerIdx = i;
      break;
    }
  }

  const rawHeaders = splitLine(lines[headerIdx]);
  const headers = rawHeaders.map((h) => normalizeHeader(h));

  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const parts = splitLine(line);
    if (!parts.length) continue;
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = String(parts[i] ?? "").trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}

function pickField(row: Record<string, string>, keys: string[]) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== "") return String(row[k]);
  }
  return "";
}

async function processFinancialIngestion(opts: {
  supabase: any;
  tenantId: string;
  ingestionJobId: string;
  bucket: string;
  path: string;
  accountId?: string | null;
  bankSource?: string;
  extractType?: string;
}) {
  const { supabase, tenantId, ingestionJobId, bucket, path, bankSource, extractType } = opts;

  await supabase.from("ingestion_jobs").update({ status: "processing", error_log: null }).eq("id", ingestionJobId);

  const { data: dl, error: dlErr } = await supabase.storage.from(bucket).download(path);
  if (dlErr || !dl) throw new Error(`download_failed:${dlErr?.message ?? "unknown"}`);

  const bytes = new Uint8Array(await dl.arrayBuffer());
  const text = new TextDecoder().decode(bytes);

  const isOfx =
    /\n\s*OFXHEADER\s*:/i.test(text) ||
    /<OFX[>\s]/i.test(text) ||
    /<STMTTRN>/i.test(text) ||
    path.toLowerCase().endsWith(".ofx");

  const parsed = isOfx ? parseOfx(text) : parseCsvWithPreamble(text);

  // Determine bank account to attach transactions.
  let accountId: string | null = String(opts.accountId ?? "").trim() || null;

  // Ensure we have at least one bank account to attach transactions.
  if (!accountId) {
    const { data: acc } = await supabase
      .from("bank_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    accountId = (acc as any)?.id ?? null;
  }

  if (!accountId) {
    const { data: created, error: cErr } = await supabase
      .from("bank_accounts")
      .insert({
        tenant_id: tenantId,
        bank_name: "Import",
        account_name: "Conta padrão (import)",
        account_type: "checking",
        currency: "BRL",
      })
      .select("id")
      .maybeSingle();
    if (cErr || !created?.id) throw new Error(`failed_to_create_default_account:${cErr?.message ?? ""}`);
    accountId = created.id;
  }

  const dateKeys = ["transaction_date", "data", "date", "dt", "data_mov", "data_lancamento"];
  const descKeys = ["description", "descricao", "historico", "memo", "narrativa", "desc"];
  const amountKeys = ["amount", "valor", "montante", "value", "vlr"];

  const inserts: any[] = [];
  const errors: string[] = [];

  for (const row of parsed.rows) {
    const dateRaw = pickField(row, dateKeys);
    const txDate = isOfx ? parseOfxDateLoose(dateRaw) : parseDateLoose(dateRaw);
    if (!txDate) {
      errors.push(`invalid_date:${dateRaw}`);
      continue;
    }

    const descRaw = pickField(row, descKeys);
    const descNorm = normalizeDescription(descRaw);

    let amt = parseAmountLoose(pickField(row, amountKeys));
    let inferredType: "credit" | "debit" = "debit";

    if (amt == null) {
      errors.push(`invalid_amount:${JSON.stringify(row)}`);
      continue;
    }

    inferredType = amt >= 0 ? "credit" : "debit";
    if (amt < 0) amt = Math.abs(amt);

    const fingerprint = await sha256Hex(
      JSON.stringify({
        tenant_id: tenantId,
        account_id: accountId,
        transaction_date: txDate,
        amount: Number(amt.toFixed(2)),
        description: descNorm,
      })
    );

    inserts.push({
      tenant_id: tenantId,
      account_id: accountId,
      amount: Number(amt.toFixed(2)),
      type: inferredType,
      description: descRaw,
      transaction_date: txDate,
      competence_date: txDate,
      status: "posted",
      fingerprint,
      source: "import",
      raw_payload: { format: isOfx ? "ofx" : "csv", bankSource, extractType, ...row },
    });
  }

  const chunkSize = 250;
  let inserted = 0;

  for (let i = 0; i < inserts.length; i += chunkSize) {
    const chunk = inserts.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("financial_transactions")
      .upsert(chunk, { onConflict: "tenant_id,fingerprint", ignoreDuplicates: true })
      .select("id");

    if (error) throw new Error(`persist_failed:${error.message}`);

    inserted += (data ?? []).length;

    await supabase
      .from("ingestion_jobs")
      .update({ processed_rows: inserted, status: "processing" })
      .eq("id", ingestionJobId);
  }

  const errLog = errors.length ? errors.slice(0, 30).join("\n") : null;

  await supabase
    .from("ingestion_jobs")
    .update({ status: "done", processed_rows: inserted, error_log: errLog })
    .eq("id", ingestionJobId);

  return { ok: true, inserted, parsedRows: parsed.rows.length, errors: errors.length };
}

serve(async (req) => {
  const fn = "financial-ingestion-upload";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });

  try {
    if (req.method !== "POST") return err("method_not_allowed", 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return err("unauthorized", 401);
    const token = auth.slice("Bearer ".length).trim();

    const body = await req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const accountIdRaw = String(body?.accountId ?? "").trim();
    const fileName = String(body?.fileName ?? "").trim();
    const contentType = String(body?.contentType ?? "application/octet-stream").trim();
    const fileBase64 = String(body?.fileBase64 ?? "").trim();
    const bankSource = String(body?.bankSource ?? "auto").trim();
    const extractType = String(body?.extractType ?? "checking").trim();

    if (!tenantId || !fileName || !fileBase64) return err("missing_params", 400);

    const supabase = createSupabaseAdmin();

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) return err("unauthorized", 401);

    const userId = userRes.user.id;

    // Multi-tenant boundary: require membership OR super-admin.
    const { data: membership, error: memErr } = await supabase
      .from("users_profile")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    const isSuperAdmin = Boolean(
      (userRes.user.app_metadata as any)?.byfrost_super_admin || (userRes.user.app_metadata as any)?.super_admin
    );

    if (memErr || (!membership && !isSuperAdmin)) return err("forbidden", 403);

    // Validate accountId (if provided) belongs to tenant.
    if (accountIdRaw) {
      const { data: acc, error: accErr } = await supabase
        .from("bank_accounts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("id", accountIdRaw)
        .maybeSingle();
      if (accErr) return err("invalid_account", 400, { message: accErr.message });
      if (!acc?.id) return err("invalid_account", 400, { message: "account_not_found" });
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file.bin";
    const uid = crypto.randomUUID();
    const path = `tenants/${tenantId}/financial-ingestion/${uid}-${safeName}`;

    const bytes = decodeBase64ToBytes(fileBase64);

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      upsert: false,
      contentType,
    });

    if (upErr) {
      console.error(`[${fn}] upload failed`, { tenantId, error: upErr.message });
      return err("upload_failed", 500, { message: upErr.message });
    }

    const { data: job, error: jobErr } = await supabase
      .from("ingestion_jobs")
      .insert({
        tenant_id: tenantId,
        file_name: safeName,
        status: "pending",
        processed_rows: 0,
        error_log: null,
      })
      .select("id")
      .maybeSingle();

    if (jobErr || !job?.id) {
      console.error(`[${fn}] failed to create ingestion job`, { tenantId, jobErr });
      return err("failed_to_create_job", 500);
    }

    // IMPORTANT (dashboard-only deployments): process immediately.
    // The original architecture enqueued job_queue for an async worker (jobs-processor),
    // but that worker may not be deployed when using the Supabase Dashboard only.
    const out = await processFinancialIngestion({
      supabase,
      tenantId,
      ingestionJobId: job.id,
      bucket: BUCKET,
      path,
      accountId: accountIdRaw || null,
      bankSource,
      extractType,
    });

    console.log(`[${fn}] uploaded + processed`, { tenantId, jobId: job.id, path, by: userId, out });

    return json({ ok: true, ingestionJobId: job.id, result: out });
  } catch (e: any) {
    console.error("[financial-ingestion-upload] unhandled", { error: e?.message ?? String(e) });
    const msg = String(e?.message ?? "internal_error");
    if (msg.includes("missing_supabase_env")) return err("missing_supabase_env", 500);
    return err("internal_error", 500, { message: msg });
  }
});