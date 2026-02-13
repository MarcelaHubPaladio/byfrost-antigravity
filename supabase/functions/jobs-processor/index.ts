import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { fetchAsBase64, sha256Hex } from "../_shared/crypto.ts";
import { publishContentPublication } from "../_shared/metaPublish.ts";
import { collectContentMetricsSnapshot } from "../_shared/metaMetrics.ts";
import { buildPerformanceReport } from "../_shared/performanceAnalyst.ts";

type JobRow = {
  id: string;
  tenant_id: string;
  type: string;
  payload_json: any;
  attempts: number;
};

function toDigits(s: string) {
  return (s ?? "").replace(/\D/g, "");
}

function preprocessOcrTextSalesOrder(rawText: string) {
  const text = String(rawText ?? "");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Heurística: em muitos pedidos (Agroforte), o cabeçalho contém telefone/endereço da empresa,
  // o que atrapalha a extração de telefone do cliente. Cortamos o texto até o início do formulário.
  const startIdx = lines.findIndex((l) =>
    /^\s*(local|nome|e-?mail|endere[cç]o|endere[cç]o\.|cidade|cep|estado|uf)\b/i.test(l)
  );

  const sliced = startIdx > 0 ? lines.slice(startIdx) : lines;

  // Remove resíduos de cabeçalho que, às vezes, vazam para as primeiras linhas.
  const filtered = sliced.filter((l, i) => {
    if (i > 10) return true;
    return !/(\bagroforte\b|\bcnpj\b|solu[cç]oes agr[ií]colas|\binscr\b|\bend(er)?e[cç]o\b.*\brua\b|\bfone\b)/i.test(
      l
    );
  });

  // Ignora o bloco "Condições Complementares" (ruído) mas preserva a área de assinatura/cliente.
  const out: string[] = [];
  let skippingConditions = false;

  for (const l of filtered) {
    if (!skippingConditions && /^condi[cç][õo]es\s+complementares\s*:?/i.test(l)) {
      skippingConditions = true;
      continue;
    }

    if (skippingConditions) {
      // quando chega na área de assinatura/cliente, voltamos a incluir
      if (/(\bdeclaro\b|\bdeclara\b|\bcliente\b\s*:|\bassinatura\b)/i.test(l)) {
        skippingConditions = false;
        out.push(l);
      }
      continue;
    }

    out.push(l);
  }

  return out.join("\n").trim();
}

function normalizeOcrTextForExtraction(rawText: string) {
  const text = String(rawText ?? "");
  // Só aplica "corte do cabeçalho" quando o documento aparenta ser o formulário da Agroforte.
  if (/\bagroforte\b/i.test(text) || (/\bcnpj\b/i.test(text) && /solu[cç]oes/i.test(text))) {
    return preprocessOcrTextSalesOrder(text);
  }
  return text;
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

function normalizeKeyText(s: string) {
  return stripDiacritics(String(s ?? ""))
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeExtractedValue(v: string) {
  return String(v ?? "")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAgroforteCustomerFields(text: string) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const start = lines.findIndex((l) => /^local\s*:/i.test(l));
  if (start < 0) return null;

  // The items table usually starts around "Cód." / "Descrição".
  const endCandidates = [
    lines.findIndex((l) => /^c[oó]d\.?\b/i.test(l)),
    lines.findIndex((l) => /^descri[cç][aã]o\b/i.test(l)),
  ].filter((n) => n >= 0);

  const end = endCandidates.length ? Math.min(...endCandidates) : Math.min(lines.length, start + 18);
  const block = lines.slice(start, end).join("\n");

  const labels: Array<{ key: string; re: RegExp }> = [
    { key: "order_local", re: /\bLocal\s*:\s*/i },
    { key: "order_date_text", re: /\bData\s*:\s*/i },
    { key: "name", re: /\bNome\s*:\s*/i },
    { key: "customer_code", re: /\bC[oó]digo\s+do\s+Cliente\s*:\s*/i },
    { key: "email", re: /\bE-?mail\s*:\s*/i },
    { key: "birth_date_text", re: /\bData\s+de\s+Nascimento\s*:\s*/i },
    { key: "address", re: /\bEndere[cç]o\s*:\s*/i },
    { key: "phone_raw", re: /\bTelefone\s*:\s*/i },
    { key: "city", re: /\bCidade\s*:\s*/i },
    { key: "cep", re: /\bCEP\s*:\s*/i },
    { key: "state", re: /\bEstado\s*:\s*/i },
    { key: "inscr_est", re: /\bInscr\.?\s*Est\.?\s*:?\s*/i },
    { key: "rg", re: /\bRG\s*:?\s*/i },
    // In the form the label is "CNPJ/CPF" (bottom left)
    { key: "cpf_cnpj_raw", re: /\bCNPJ\s*\/\s*CPF\b\s*:?\s*/i },
    { key: "uf", re: /\bUF\b\s*:?\s*/i },
  ];

  // Collect all label hits with their positions.
  const hits: Array<{ key: string; start: number; end: number }> = [];
  for (const lb of labels) {
    const re = new RegExp(lb.re.source, lb.re.flags.includes("g") ? lb.re.flags : lb.re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) {
      hits.push({ key: lb.key, start: m.index, end: m.index + m[0].length });
      // only first hit for each key
      break;
    }
  }

  if (!hits.length) return null;
  hits.sort((a, b) => a.start - b.start);

  const out: Record<string, string> = {};
  for (let i = 0; i < hits.length; i++) {
    const cur = hits[i];
    const next = hits[i + 1];
    const slice = block.slice(cur.end, next ? next.start : block.length);
    const value = sanitizeExtractedValue(slice);
    if (value) out[cur.key] = value;
  }

  // Normalize CPF/CNPJ: keep digits only (we will still validate CPF length later).
  const cpfCnpjDigits = out.cpf_cnpj_raw ? toDigits(out.cpf_cnpj_raw) : "";
  if (cpfCnpjDigits) {
    if (cpfCnpjDigits.length === 11) out.cpf = cpfCnpjDigits;
    else out.cnpj = cpfCnpjDigits;
  }

  // Normalize UF/state to 2 letters when possible
  if (out.uf) {
    const uf = normalizeKeyText(out.uf).replace(/\s/g, "");
    if (/^[A-Z]{2}$/.test(uf)) out.uf = uf;
  }

  return out;
}

function extractFieldsFromText(text: string) {
  const agro = extractAgroforteCustomerFields(text) ?? {};

  const cpfMatch = text.match(/\b(\d{3}\.?(\d{3})\.?(\d{3})-?(\d{2}))\b/);
  const cpf = agro.cpf ?? (cpfMatch ? toDigits(cpfMatch[1]) : null);

  const rgMatch = text.match(/\bRG\s*[:\-]?\s*(\d{6,12})\b/i) ?? text.match(/\b(\d{7,10})\b/);
  const rg = agro.rg ? toDigits(agro.rg) : rgMatch ? toDigits(rgMatch[1]) : null;

  const birthMatch = text.match(/\b(\d{2}[\/-]\d{2}[\/-]\d{2,4})\b/);
  const birth_date_text = agro.birth_date_text ?? (birthMatch ? birthMatch[1] : null);

  const phoneMatch =
    text.match(/\bTelefone\s*[:\-]?\s*(\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4})\b/i) ??
    text.match(/\b(\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4})\b/);
  const phone_raw = agro.phone_raw ?? (phoneMatch ? phoneMatch[1] : null);

  const totalMatch = text.match(/R\$\s*([0-9\.,]{2,})/);
  const total_raw = totalMatch ? totalMatch[0] : null;

  const nameMatch = text.match(/\bNome\s*[:\-]\s*(.+)/i);
  const name = agro.name ?? (nameMatch ? nameMatch[1].trim().slice(0, 80) : null);

  const signaturePresent = /assinatura/i.test(text);

  // Items (very rough): lines with qty and value
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const itemLines = lines.filter((l) => /\b(\d+[\.,]?\d*)\b/.test(l) && /R\$/.test(l));

  return {
    name,
    cpf,
    // we store rg as digits-only (existing behavior)
    rg,
    birth_date_text,
    phone_raw,
    total_raw,
    signaturePresent,
    itemLines: itemLines.slice(0, 15),

    // Agroforte-specific fields
    customer_code: agro.customer_code ?? null,
    email: agro.email ?? null,
    address: agro.address ?? null,
    city: agro.city ?? null,
    cep: agro.cep ?? null,
    state: agro.state ?? null,
    uf: agro.uf ?? null,
    order_local: agro.order_local ?? null,
    order_date_text: agro.order_date_text ?? null,
    inscr_est: agro.inscr_est ?? null,
  };
}

function parsePtBrMoneyToCents(input: string | null | undefined) {
  const raw = String(input ?? "");
  const m = raw.match(/([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/);
  if (!m?.[1]) return null;
  const normalized = m[1].replace(/\./g, "").replace(/,/g, ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function extractTotalCents(text: string) {
  const t = String(text ?? "");
  // Prefer explicit TOTAL label
  const labeled = t.match(/\bTOTAL\b[^\d]{0,30}([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/i);
  if (labeled?.[1]) return parsePtBrMoneyToCents(labeled[1]);

  // Fallback: first currency-like occurrence
  const rs = t.match(/R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/i);
  if (rs?.[1]) return parsePtBrMoneyToCents(rs[1]);

  return null;
}

async function sha256Hex(text: string) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function computeSalesOrderFingerprint(args: {
  clientKey: string;
  totalCents: number;
  itemLines: string[];
}) {
  const clientKey = normalizeKeyText(args.clientKey);
  const totalCents = Number(args.totalCents);
  const itemKey = args.itemLines
    .map((l) => normalizeKeyText(l))
    .filter(Boolean)
    .join(" | ");

  // Para evitar falso-positivo, só deduplica quando temos:
  // - cliente (cpf/telefone/nome) + total + ao menos 1 linha de item
  if (!clientKey || !Number.isFinite(totalCents) || totalCents <= 0) return null;
  if (!itemKey || itemKey.length < 8) return null;

  const base = `${clientKey}::${totalCents}::${itemKey}`;
  return await sha256Hex(base);
}

async function mergeDuplicateCase(args: {
  supabase: any;
  tenantId: string;
  duplicateCaseId: string;
  keepCaseId: string;
  fingerprint: string;
}) {
  const { supabase, tenantId, duplicateCaseId, keepCaseId, fingerprint } = args;

  // Move entities to the kept case (best-effort)
  await supabase
    .from("wa_messages")
    .update({ case_id: keepCaseId })
    .eq("tenant_id", tenantId)
    .eq("case_id", duplicateCaseId);
  await supabase
    .from("case_attachments")
    .update({ case_id: keepCaseId })
    .eq("tenant_id", tenantId)
    .eq("case_id", duplicateCaseId);
  await supabase
    .from("pendencies")
    .update({ case_id: keepCaseId })
    .eq("tenant_id", tenantId)
    .eq("case_id", duplicateCaseId);

  // IMPORTANT: don't duplicate items.
  // If the kept case already has items, we discard the duplicate case's items.
  // If it doesn't, we move them.
  const { data: keepAnyItem } = await supabase
    .from("case_items")
    .select("id")
    .eq("case_id", keepCaseId)
    .limit(1)
    .maybeSingle();

  if ((keepAnyItem as any)?.id) {
    await supabase.from("case_items").delete().eq("case_id", duplicateCaseId);
  } else {
    await supabase.from("case_items").update({ case_id: keepCaseId }).eq("case_id", duplicateCaseId);
  }

  // Keep case_fields history (may contain duplicates; acceptable for now)
  await supabase.from("case_fields").update({ case_id: keepCaseId }).eq("case_id", duplicateCaseId);

  // Soft-delete duplicate case
  await supabase
    .from("cases")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", duplicateCaseId);

  // Audit
  await supabase.from("timeline_events").insert({
    tenant_id: tenantId,
    case_id: keepCaseId,
    event_type: "duplicate_detected",
    actor_type: "system",
    actor_id: null,
    message: "Pedido duplicado detectado. Consolidamos mensagens/anexos no caso existente.",
    meta_json: { duplicate_case_id: duplicateCaseId, fingerprint },
    occurred_at: new Date().toISOString(),
  });
}

async function runOcrGoogleVision(imageUrl: string) {
  const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY") ?? "";
  if (!apiKey) return { ok: false as const, error: "Missing GOOGLE_VISION_API_KEY" };

  const content = await fetchAsBase64(imageUrl);
  const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
  const visionReq = {
    requests: [
      {
        image: { content },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      },
    ],
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(visionReq),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    return { ok: false as const, error: `Vision API error: ${res.status}`, raw: json };
  }

  const annotation = json?.responses?.[0]?.fullTextAnnotation;
  const text = annotation?.text ?? "";

  return { ok: true as const, text, raw: json?.responses?.[0] ?? json };
}

function addDays(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map((n) => Number(n));
  const base = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function tzOffsetMs(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  const map: any = {};
  for (const p of parts) map[p.type] = p.value;

  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );

  return asUtc - date.getTime();
}

function localMidnightUtcMs(dateStr: string, timeZone: string) {
  const [y, m, d] = dateStr.split("-").map((n) => Number(n));
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);

  // Two-pass correction (handles DST shifts if they ever exist again)
  let t = guess;
  let off = tzOffsetMs(new Date(t), timeZone);
  t = guess - off;
  off = tzOffsetMs(new Date(t), timeZone);
  t = guess - off;

  return t;
}

function buildDailyTopics(text: string) {
  const stop = new Set([
    "de",
    "da",
    "do",
    "das",
    "dos",
    "e",
    "a",
    "o",
    "os",
    "as",
    "que",
    "pra",
    "para",
    "com",
    "na",
    "no",
    "em",
    "um",
    "uma",
    "uns",
    "umas",
    "por",
    "se",
    "não",
    "sim",
    "oi",
    "ola",
    "olá",
    "boa",
    "bom",
    "dia",
    "tarde",
    "noite",
  ]);

  const words = (text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => w.length >= 4)
    .filter((w) => !stop.has(w));

  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);

  const top = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);

  return top;
}

function normalizeDescription(s: string) {
  const raw = String(s ?? "");
  try {
    return raw
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

function parseDateLoose(s: string): string | null {
  const v = String(s ?? "").trim();
  if (!v) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  // DD/MM/YYYY or DD/MM/YY
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

function parseCsv(text: string) {
  const lines = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return { headers: [] as string[], rows: [] as Record<string, string>[] };

  const splitLine = (line: string) => {
    // MVP: supports commas/semicolons, minimal quote support
    const sep = line.includes(";") && !line.includes(",") ? ";" : ",";
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

  const headers = splitLine(lines[0]).map((h) => normalizeDescription(h).replace(/\s/g, "_"));
  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(1)) {
    const parts = splitLine(line);
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

function parseAmountLoose(s: string): number | null {
  const v = String(s ?? "").trim();
  if (!v) return null;

  // Remove currency and spaces
  let t = v.replace(/[^0-9,\.-]/g, "").trim();

  // If it has both '.' and ',', decide decimal by last separator
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

async function processFinancialIngestionJob(opts: {
  supabase: any;
  tenantId: string;
  ingestionJobId: string;
  bucket: string;
  path: string;
}) {
  const { supabase, tenantId, ingestionJobId, bucket, path } = opts;

  await supabase.from("ingestion_jobs").update({ status: "processing", error_log: null }).eq("id", ingestionJobId);

  // Fetch file
  const { data: dl, error: dlErr } = await supabase.storage.from(bucket).download(path);
  if (dlErr || !dl) throw new Error(`download_failed:${dlErr?.message ?? "unknown"}`);

  const bytes = new Uint8Array(await dl.arrayBuffer());
  const text = new TextDecoder().decode(bytes);

  // PIPELINE: upload → parse → normalize → deduplicate → persist
  const isOfx =
    /\n\s*OFXHEADER\s*:/i.test(text) ||
    /<OFX[>\s]/i.test(text) ||
    /<STMTTRN>/i.test(text) ||
    path.toLowerCase().endsWith(".ofx");

  const parsed = isOfx ? parseOfx(text) : parseCsv(text);

  // Ensure we have at least one bank account to attach transactions.
  // If tenant has none, create a default one.
  let accountId: string | null = null;
  {
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

  const inserts: any[] = [];
  const errors: string[] = [];

  // Simple header mapping (works for common exports)
  const dateKeys = ["data", "date", "transaction_date", "dt", "data_mov", "data_lancamento"];
  const descKeys = ["descricao", "description", "historico", "memo", "narrativa", "desc"];
  const amountKeys = ["valor", "amount", "montante", "value", "vlr"];
  const creditKeys = ["credito", "credit"];
  const debitKeys = ["debito", "debit"];

  for (const row of parsed.rows) {
    const dateRaw = pickField(row, dateKeys);
    const txDate = parseDateLoose(dateRaw);
    if (!txDate) {
      errors.push(`invalid_date:${dateRaw}`);
      continue;
    }

    const descRaw = pickField(row, descKeys);
    const descNorm = normalizeDescription(descRaw);

    // Amount can be in one column or split credit/debit
    let amt = parseAmountLoose(pickField(row, amountKeys));
    let inferredType: "credit" | "debit" = "debit";

    if (amt == null) {
      const cr = parseAmountLoose(pickField(row, creditKeys));
      const db = parseAmountLoose(pickField(row, debitKeys));
      if (cr != null) {
        amt = Math.abs(cr);
        inferredType = "credit";
      } else if (db != null) {
        amt = Math.abs(db);
        inferredType = "debit";
      }
    } else {
      // If amount is signed (common in exports / OFX), infer type from sign.
      inferredType = amt >= 0 ? "credit" : "debit";
    }

    if (amt == null) {
      errors.push(`invalid_amount:${JSON.stringify(row)}`);
      continue;
    }

    // Normalize sign
    if (amt < 0) {
      inferredType = "debit";
      amt = Math.abs(amt);
    }

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
      raw_payload: { format: isOfx ? "ofx" : "csv", ...row },
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

    if (error) {
      // Most likely: missing columns / CSV mismatch
      throw new Error(`persist_failed:${error.message}`);
    }

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

async function getTenantTensionRule(supabase: any, tenantId: string, tensionType: string) {
  const { data } = await supabase
    .from("tenant_tension_rules")
    .select("threshold,severity")
    .eq("tenant_id", tenantId)
    .eq("tension_type", tensionType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as any | null;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function computeScores(opts: { impact: number; urgency: number; cascade: number }) {
  const impact = clamp(opts.impact, 0, 100);
  const urgency = clamp(opts.urgency, 0, 100);
  const cascade = clamp(opts.cascade, 0, 100);
  const final = clamp(impact * 0.5 + urgency * 0.35 + cascade * 0.15, 0, 100);
  return { impact, urgency, cascade, final };
}

async function createTensionEventWithScore(opts: {
  supabase: any;
  tenantId: string;
  tensionType: string;
  referenceId?: string | null;
  description: string;
  scores: { impact: number; urgency: number; cascade: number; final: number };
}) {
  const { supabase, tenantId, tensionType, referenceId, description, scores } = opts;

  // Avoid spamming: only one event per tenant+tension_type in the last 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from("tension_events")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("tension_type", tensionType)
    .gte("detected_at", since)
    .order("detected_at", { ascending: false })
    .limit(1);

  if ((existing ?? []).length) {
    return { ok: true, skipped: true };
  }

  const { data: ev, error: evErr } = await supabase
    .from("tension_events")
    .insert({
      tenant_id: tenantId,
      tension_type: tensionType,
      reference_id: referenceId ?? null,
      description,
      detected_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (evErr || !ev?.id) throw new Error(`tension_event_insert_failed:${evErr?.message ?? ""}`);

  const { error: sErr } = await supabase.from("tension_scores").insert({
    tension_event_id: ev.id,
    impact_score: scores.impact,
    urgency_score: scores.urgency,
    cascade_score: scores.cascade,
    final_score: scores.final,
  });
  if (sErr) throw new Error(`tension_score_insert_failed:${sErr.message}`);

  // Reuse existing explanation log structure.
  await supabase.from("decision_logs").insert({
    tenant_id: tenantId,
    case_id: null,
    agent_id: null,
    input_summary: `Tensão detectada: ${tensionType}`,
    output_summary: `Score final ${scores.final.toFixed(1)}`,
    reasoning_public: description,
    why_json: {
      kind: "financial_tension",
      tension_type: tensionType,
      reference_id: referenceId ?? null,
      scores,
    },
    confidence_json: { overall: 0.8, method: "rules" },
    occurred_at: new Date().toISOString(),
  });

  return { ok: true, eventId: ev.id };
}

async function runFinancialTensionChecks(opts: { supabase: any; tenantId: string }) {
  const { supabase, tenantId } = opts;

  // Gather needed aggregates
  const { data: cash } = await supabase.rpc("financial_cash_projection", { p_tenant_id: tenantId });
  const current = Number(cash?.current_balance ?? 0);
  const projected = Number(cash?.projected_balance ?? current);
  const receivablesPending = Number(cash?.receivables_pending ?? 0);
  const payablesPending = Number(cash?.payables_pending ?? 0);

  // 1) risco de caixa negativo (impacto real: projected < 0)
  if (projected < 0) {
    const rule = (await getTenantTensionRule(supabase, tenantId, "cash_negative")) ?? {
      threshold: 0,
      severity: "high",
    };

    const deficit = Math.abs(projected);
    if (deficit > Number(rule.threshold ?? 0)) {
      const impact = clamp((deficit / Math.max(1, Math.abs(current) + 1)) * 100, 25, 100);
      const urgency = clamp(payablesPending > 0 ? 85 : 70, 0, 100);
      const cascade = clamp(60 + Math.min(20, deficit / 1000), 0, 100);
      const scores = computeScores({ impact, urgency, cascade });

      const description = [
        `Risco de caixa negativo (projeção < 0).`,
        `Saldo atual: ${current.toFixed(2)}`,
        `Recebíveis pendentes: ${receivablesPending.toFixed(2)}`,
        `Pagáveis pendentes: ${payablesPending.toFixed(2)}`,
        `Saldo projetado: ${projected.toFixed(2)} (déficit ${deficit.toFixed(2)})`,
      ].join("\n");

      await createTensionEventWithScore({
        supabase,
        tenantId,
        tensionType: "cash_negative",
        referenceId: null,
        description,
        scores,
      });
    }
  }

  // 2) runway baixo (impacto real: projected < threshold)
  // Simple MVP: runway threshold is absolute projected balance.
  {
    const rule = (await getTenantTensionRule(supabase, tenantId, "runway_low")) ?? {
      threshold: 1000,
      severity: "medium",
    };

    const thr = Number(rule.threshold ?? 0);
    if (thr > 0 && projected >= 0 && projected < thr) {
      const gap = thr - projected;
      const impact = clamp((gap / thr) * 100, 15, 90);
      const urgency = clamp(projected < thr * 0.25 ? 80 : 60, 0, 100);
      const cascade = clamp(45 + Math.min(25, gap / 1000), 0, 100);
      const scores = computeScores({ impact, urgency, cascade });

      const description = [
        `Runway baixo: saldo projetado abaixo do limite configurado.`,
        `Saldo projetado: ${projected.toFixed(2)}`,
        `Limite (threshold): ${thr.toFixed(2)}`,
        `Gap: ${gap.toFixed(2)}`,
      ].join("\n");

      await createTensionEventWithScore({
        supabase,
        tenantId,
        tensionType: "runway_low",
        referenceId: null,
        description,
        scores,
      });
    }
  }

  // 3) receita não recebida (impacto real: receivables overdue)
  {
    const { data: overdue, error } = await supabase
      .from("financial_receivables")
      .select("id,amount,due_date,description")
      .eq("tenant_id", tenantId)
      .eq("status", "overdue")
      .order("due_date", { ascending: true })
      .limit(50);

    if (!error && (overdue ?? []).length) {
      const total = (overdue ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
      if (total > 0) {
        const rule = (await getTenantTensionRule(supabase, tenantId, "revenue_not_received")) ?? {
          threshold: 0,
          severity: "high",
        };
        if (total > Number(rule.threshold ?? 0)) {
          const oldest = overdue![0];
          const impact = clamp(Math.min(100, (total / Math.max(1, receivablesPending + 1)) * 100), 20, 100);
          const urgency = 85;
          const cascade = clamp(50 + Math.min(30, total / 1000), 0, 100);
          const scores = computeScores({ impact, urgency, cascade });

          const sample = overdue!
            .slice(0, 5)
            .map((r: any) => `- ${r.due_date}: ${Number(r.amount ?? 0).toFixed(2)} • ${String(r.description ?? "").slice(0, 60)}`)
            .join("\n");

          const description = [
            `Receita não recebida: há recebíveis em atraso.`,
            `Total em atraso: ${total.toFixed(2)} • Itens: ${overdue!.length}`,
            `Mais antigo: ${oldest.due_date}`,
            sample ? `Exemplos:\n${sample}` : "",
          ]
            .filter(Boolean)
            .join("\n");

          await createTensionEventWithScore({
            supabase,
            tenantId,
            tensionType: "revenue_not_received",
            referenceId: oldest.id,
            description,
            scores,
          });
        }
      }
    }
  }

  // 4) desvio relevante do orçamento (impacto real: actual > expected * threshold)
  {
    // Consider only last 30 days for MVP
    const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Pull budgets
    const { data: budgets, error: bErr } = await supabase
      .from("financial_budgets")
      .select("id,category_id,expected_amount,recurrence,scenario")
      .eq("tenant_id", tenantId)
      .limit(200);

    if (!bErr && (budgets ?? []).length) {
      // Pull transactions with category in last 30 days
      const { data: txs, error: tErr } = await supabase
        .from("financial_transactions")
        .select("id,category_id,amount,type,transaction_date")
        .eq("tenant_id", tenantId)
        .gte("transaction_date", sinceDate)
        .not("category_id", "is", null)
        .limit(5000);

      if (!tErr && (txs ?? []).length) {
        const actualByCat = new Map<string, number>();
        for (const t of txs ?? []) {
          const cat = (t as any).category_id as string | null;
          if (!cat) continue;
          const amt = Number((t as any).amount ?? 0);
          const sign = (t as any).type === "debit" ? 1 : -1; // expenses positive
          actualByCat.set(cat, (actualByCat.get(cat) ?? 0) + amt * sign);
        }

        const rule = (await getTenantTensionRule(supabase, tenantId, "budget_deviation")) ?? {
          threshold: 0.25,
          severity: "medium",
        };

        const ratioThr = Number(rule.threshold ?? 0.25);

        // Find worst deviation with impact
        let worst: { categoryId: string; expected: number; actual: number; deviation: number } | null = null;

        for (const b of budgets ?? []) {
          const catId = (b as any).category_id as string;
          const expected = Number((b as any).expected_amount ?? 0);
          if (expected <= 0) continue;
          const actual = actualByCat.get(catId) ?? 0;

          // only consider overspend (actual > expected)
          if (actual <= expected) continue;

          const deviation = (actual - expected) / expected;
          if (deviation < ratioThr) continue;

          if (!worst || deviation > worst.deviation) worst = { categoryId: catId, expected, actual, deviation };
        }

        if (worst) {
          const excess = worst.actual - worst.expected;
          if (excess > 0) {
            const impact = clamp(Math.min(100, worst.deviation * 100), 20, 100);
            const urgency = clamp(worst.deviation > 0.75 ? 80 : 60, 0, 100);
            const cascade = clamp(40 + Math.min(30, excess / 1000), 0, 100);
            const scores = computeScores({ impact, urgency, cascade });

            const description = [
              `Desvio relevante do orçamento (últimos 30 dias).`,
              `Categoria: ${worst.categoryId}`,
              `Esperado: ${worst.expected.toFixed(2)}`,
              `Real: ${worst.actual.toFixed(2)}`,
              `Excesso: ${excess.toFixed(2)} • Desvio: ${(worst.deviation * 100).toFixed(1)}%`,
              `Threshold: ${(ratioThr * 100).toFixed(1)}%`,
            ].join("\n");

            await createTensionEventWithScore({
              supabase,
              tenantId,
              tensionType: "budget_deviation",
              referenceId: null,
              description,
              scores,
            });
          }
        }
      }
    }
  }

  return { ok: true };
}

serve(async (req) => {
  const fn = "jobs-processor";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    const supabase = createSupabaseAdmin();

    const batchSize = 10;

    // Fetch pending jobs
    const { data: jobs, error: jobsErr } = await supabase
      .from("job_queue")
      .select("id, tenant_id, type, payload_json, attempts")
      .eq("status", "pending")
      .lte("run_after", new Date().toISOString())
      .is("locked_at", null)
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (jobsErr) {
      console.error(`[${fn}] Failed to read jobs`, { jobsErr });
      return new Response("Failed to read jobs", { status: 500, headers: corsHeaders });
    }

    const lockedBy = crypto.randomUUID();

    // Lock jobs
    const locked: JobRow[] = [];
    for (const job of (jobs ?? []) as any[]) {
      const { data: updated } = await supabase
        .from("job_queue")
        .update({ status: "processing", locked_at: new Date().toISOString(), locked_by: lockedBy })
        .eq("id", job.id)
        .eq("status", "pending")
        .select("id, tenant_id, type, payload_json, attempts")
        .maybeSingle();
      if (updated) locked.push(updated as any);
    }

    const { data: agents } = await supabase.from("agents").select("id, key");
    const agentIdByKey = new Map<string, string>();
    for (const a of agents ?? []) agentIdByKey.set(a.key, a.id);

    const results: any[] = [];

    for (const job of locked) {
      try {
        const tenantId = job.tenant_id;
        const caseId = job.payload_json?.case_id as string | undefined;

        if (job.type === "FINANCIAL_INGESTION") {
          const ingestionJobId = String(job.payload_json?.ingestion_job_id ?? "").trim();
          const bucket = String(job.payload_json?.storage_bucket ?? "").trim();
          const path = String(job.payload_json?.storage_path ?? "").trim();

          if (!ingestionJobId || !bucket || !path) throw new Error("Missing payload (ingestion_job_id/storage_bucket/storage_path)");

          const out = await processFinancialIngestionJob({ supabase, tenantId, ingestionJobId, bucket, path });

          // After persisting transactions, run simple financial tension checks.
          try {
            await runFinancialTensionChecks({ supabase, tenantId });
          } catch (e) {
            console.warn(`[${fn}] tension checks failed (ignored)`, { tenantId, e: String(e) });
          }

          await supabase.from("job_queue").update({ status: "done" }).eq("id", job.id);
          results.push({ id: job.id, ok: true, type: job.type, result: out });
          continue;
        }

        if (job.type === "META_PUBLISH_PUBLICATION") {
          const publicationId = String(job.payload_json?.publication_id ?? "").trim();
          if (!publicationId) throw new Error("Missing payload.publication_id");

          const out = await publishContentPublication({ supabase, tenantId, publicationId, requestedByUserId: null });

          await supabase.from("job_queue").update({ status: "done" }).eq("id", job.id);
          results.push({ id: job.id, ok: true, type: job.type, publicationId, result: out });
          continue;
        }

        if (job.type === "META_COLLECT_METRICS") {
          const publicationId = String(job.payload_json?.publication_id ?? "").trim();
          const windowDays = Number(job.payload_json?.window_days ?? 1);
          if (!publicationId) throw new Error("Missing payload.publication_id");
          if (![1, 3, 7].includes(windowDays)) throw new Error("Missing/invalid payload.window_days (1|3|7)");

          const out = await collectContentMetricsSnapshot({
            supabase,
            tenantId,
            publicationId,
            windowDays: windowDays as 1 | 3 | 7,
          });

          // Generate a report from all snapshots available
          if (out.ok) {
            const { data: snaps } = await supabase
              .from("content_metrics_snapshots")
              .select("window_days,impressions,profile_visits,follows,messages")
              .eq("tenant_id", tenantId)
              .eq("publication_id", publicationId)
              .order("window_days", { ascending: true })
              .limit(10);

            const points = (snaps ?? []).map((s: any) => ({
              window_days: Number(s.window_days),
              impressions: s.impressions ?? null,
              profile_visits: s.profile_visits ?? null,
              follows: s.follows ?? null,
              messages: s.messages ?? null,
            }));

            const report = buildPerformanceReport({ points, channel: out.publication.channel });
            const agentId = agentIdByKey.get("performance_analyst_agent") ?? null;

            if (agentId) {
              await supabase.from("decision_logs").insert({
                tenant_id: tenantId,
                case_id: out.publication.case_id,
                agent_id: agentId,
                input_summary: `Métricas D+${windowDays} (publicação ${publicationId.slice(0, 8)}…)`,
                output_summary: `Relatório do guardião (D+${windowDays})`,
                reasoning_public: report.reportText,
                why_json: {
                  kind: "content_performance_report",
                  publication_id: publicationId,
                  channel: out.publication.channel,
                  points,
                  derived: report.derived,
                },
                confidence_json: { overall: 0.72, method: "heuristic" },
                occurred_at: new Date().toISOString(),
              });
            }
          }

          await supabase.from("job_queue").update({ status: "done" }).eq("id", job.id);
          results.push({ id: job.id, ok: out.ok, type: job.type, publicationId, windowDays, result: out });
          continue;
        }

        if (job.type === "DAILY_WA_SUMMARY") {
          const dateStr = String(job.payload_json?.date ?? "").trim();
          const timeZone = String(job.payload_json?.time_zone ?? "America/Sao_Paulo").trim() || "America/Sao_Paulo";
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error("Missing/invalid payload.date (YYYY-MM-DD)");

          const next = addDays(dateStr, 1);
          const startIso = new Date(localMidnightUtcMs(dateStr, timeZone)).toISOString();
          const endIso = new Date(localMidnightUtcMs(next, timeZone)).toISOString();

          // Pull messages in pages (MVP)
          const pageSize = 1000;
          const maxPages = 20;
          let all: any[] = [];
          for (let page = 0; page < maxPages; page++) {
            const from = page * pageSize;
            const to = from + pageSize - 1;

            const { data, error } = await supabase
              .from("wa_messages")
              .select("case_id,direction,body_text,occurred_at")
              .eq("tenant_id", tenantId)
              .gte("occurred_at", startIso)
              .lt("occurred_at", endIso)
              .not("case_id", "is", null)
              .order("occurred_at", { ascending: true })
              .range(from, to);

            if (error) throw error;
            if (!data?.length) break;
            all = all.concat(data as any[]);
            if (data.length < pageSize) break;
          }

          if (!all.length) {
            await supabase.from("job_queue").update({ status: "done" }).eq("id", job.id);
            results.push({ id: job.id, ok: true, note: "no messages" });
            continue;
          }

          const { data: existingSummaries } = await supabase
            .from("timeline_events")
            .select("case_id")
            .eq("tenant_id", tenantId)
            .eq("event_type", "daily_conversation_summary")
            .contains("meta_json", { date: dateStr })
            .limit(5000);

          const already = new Set<string>((existingSummaries ?? []).map((r: any) => String(r.case_id)));

          const byCase = new Map<
            string,
            {
              inbound: number;
              outbound: number;
              first: string;
              last: string;
              text: string;
            }
          >();

          for (const m of all) {
            const cid = String((m as any).case_id);
            if (!cid) continue;

            const cur = byCase.get(cid) ?? {
              inbound: 0,
              outbound: 0,
              first: String((m as any).occurred_at),
              last: String((m as any).occurred_at),
              text: "",
            };

            const dir = String((m as any).direction);
            if (dir === "inbound") cur.inbound += 1;
            if (dir === "outbound") cur.outbound += 1;

            const t = String((m as any).occurred_at);
            if (t < cur.first) cur.first = t;
            if (t > cur.last) cur.last = t;

            const body = (m as any).body_text ? String((m as any).body_text) : "";
            if (body) cur.text += `\n${body}`;

            byCase.set(cid, cur);
          }

          const inserts: any[] = [];
          const [yyyy, mm, dd] = dateStr.split("-");
          const dateBr = `${dd}/${mm}`;

          for (const [cid, s] of byCase.entries()) {
            if (already.has(cid)) continue;
            if ((s.inbound + s.outbound) <= 0) continue;

            const topics = buildDailyTopics(s.text).slice(0, 3);
            const topicsText = topics.length ? topics.join(", ") : "(sem tema dominante)";

            inserts.push({
              tenant_id: tenantId,
              case_id: cid,
              event_type: "daily_conversation_summary",
              actor_type: "system",
              actor_id: null,
              message: `Resumo do dia (${dateBr}): ${s.inbound} mensagens do cliente, ${s.outbound} do time. Principais temas: ${topicsText}.`,
              meta_json: {
                date: dateStr,
                time_zone: timeZone,
                inbound_count: s.inbound,
                outbound_count: s.outbound,
                first_message_at: s.first,
                last_message_at: s.last,
                topics,
              },
              occurred_at: new Date().toISOString(),
            });
          }

          if (inserts.length) {
            await supabase.from("timeline_events").insert(inserts);
          }

          await supabase.from("job_queue").update({ status: "done" }).eq("id", job.id);
          results.push({ id: job.id, ok: true, date: dateStr, inserted: inserts.length, cases: byCase.size });
          continue;
        }

        if (!caseId) throw new Error("Missing payload.case_id");

        if (job.type === "OCR_IMAGE") {
          const { data: att } = await supabase
            .from("case_attachments")
            .select("storage_path")
            .eq("tenant_id", tenantId)
            .eq("case_id", caseId)
            .eq("kind", "image")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const imageUrl = att?.storage_path as string | undefined;
          if (!imageUrl) throw new Error("Missing image attachment");

          const ocr = await runOcrGoogleVision(imageUrl);
          if (!ocr.ok) {
            await supabase.from("decision_logs").insert({
              tenant_id: tenantId,
              case_id: caseId,
              agent_id: agentIdByKey.get("ocr_agent") ?? null,
              input_summary: "OCR_IMAGE",
              output_summary: "Falha no OCR",
              reasoning_public: "Não foi possível executar OCR com o provedor configurado.",
              why_json: { error: ocr.error },
              confidence_json: { overall: 0 },
              occurred_at: new Date().toISOString(),
            });
            // Keep job as failed
            await supabase.from("job_queue").update({ status: "failed", attempts: job.attempts + 1 }).eq("id", job.id);
            results.push({ id: job.id, ok: false, error: ocr.error });
            continue;
          }

          await supabase.from("case_fields").upsert({
            tenant_id: tenantId,
            case_id: caseId,
            key: "ocr_text",
            value_text: ocr.text,
            confidence: 0.85,
            source: "ocr",
            last_updated_by: "ocr_agent",
          });

          await supabase.from("timeline_events").insert({
            tenant_id: tenantId,
            case_id: caseId,
            event_type: "ocr_done",
            actor_type: "ai",
            message: "OCR concluído. Extraindo campos…",
            meta_json: {},
            occurred_at: new Date().toISOString(),
          });

          await supabase.from("decision_logs").insert({
            tenant_id: tenantId,
            case_id: caseId,
            agent_id: agentIdByKey.get("ocr_agent") ?? null,
            input_summary: "Imagem do pedido",
            output_summary: `Texto OCR com ${ocr.text.length} caracteres`,
            reasoning_public: "Extraímos o texto do pedido para iniciar a extração estruturada de campos.",
            why_json: { provider: "google_vision" },
            confidence_json: { overall: 0.85 },
            occurred_at: new Date().toISOString(),
          });

          await supabase.from("job_queue").update({ status: "done" }).eq("id", job.id);

          // enqueue extraction/validation
          await supabase.from("job_queue").insert({
            tenant_id: tenantId,
            type: "EXTRACT_FIELDS",
            idempotency_key: `EXTRACT_FIELDS:${caseId}:${Date.now()}`,
            payload_json: { case_id: caseId },
            status: "pending",
            run_after: new Date().toISOString(),
          });

          results.push({ id: job.id, ok: true });
          continue;
        }

        if (job.type === "EXTRACT_FIELDS") {
          const { data: ocrField } = await supabase
            .from("case_fields")
            .select("value_text")
            .eq("tenant_id", tenantId)
            .eq("case_id", caseId)
            .eq("key", "ocr_text")
            .maybeSingle();

          const rawText = (ocrField?.value_text as string | null) ?? "";
          const cleanedText = normalizeOcrTextForExtraction(rawText);
          const extracted = extractFieldsFromText(cleanedText);

          // Dedupe (Agroforte sales_order):
          // evita abrir mais de 1 caso com o MESMO cliente + MESMO total + MESMA lista de itens.
          // Regra: só considera itens estruturados quando tiver >= 1 item com descrição + qty + price.
          // Observação: só roda quando temos dados suficientes (para evitar falso-positivo).
          let targetCaseId = caseId;
          let mergedInto: string | null = null;

          try {
            const { data: cRow } = await supabase
              .from("cases")
              .select("id, meta_json")
              .eq("tenant_id", tenantId)
              .eq("id", caseId)
              .maybeSingle();

            const meta = (cRow as any)?.meta_json ?? {};
            const journeyKey = String(meta?.journey_key ?? "");
            const looksAgroforte = /\bagroforte\b/i.test(rawText);

            const clientKey =
              extracted.customer_code ||
              extracted.cpf ||
              (extracted.phone_raw ? toDigits(extracted.phone_raw) : "") ||
              extracted.name ||
              "";

            // Prefer structured case_items for fingerprint when we have at least 1 complete row.
            const { data: caseItems } = await supabase
              .from("case_items")
              .select("code,description,qty,price")
              .eq("case_id", caseId)
              .order("line_no", { ascending: true })
              .limit(200);

            const completeItems = (caseItems ?? []).filter((r: any) => {
              const desc = String(r?.description ?? "").trim();
              const qty = Number(r?.qty);
              const price = Number(r?.price);
              return desc && Number.isFinite(qty) && qty > 0 && Number.isFinite(price) && price >= 0;
            });

            const itemsSource = completeItems.length ? "case_items" : "ocr";

            const itemLinesForFp = completeItems.length
              ? completeItems.map((r: any) => {
                  const code = String(r?.code ?? "").trim();
                  const desc = String(r?.description ?? "").trim();
                  const qty = Number(r?.qty);
                  const price = Number(r?.price);
                  return `${code ? `${code} ` : ""}${desc} | QTY:${qty} | PRICE:${price}`;
                })
              : (extracted.itemLines ?? []);

            const totalCentsFromItems = completeItems.length
              ? Math.round(
                  completeItems.reduce((acc: number, r: any) => {
                    const qty = Number(r?.qty);
                    const price = Number(r?.price);
                    return acc + (Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0);
                  }, 0) * 100
                )
              : null;

            const totalCents =
              totalCentsFromItems ??
              extractTotalCents(cleanedText) ??
              parsePtBrMoneyToCents(extracted.total_raw) ??
              null;

            const fingerprint =
              journeyKey === "sales_order" && looksAgroforte && clientKey && totalCents
                ? await computeSalesOrderFingerprint({
                    clientKey,
                    totalCents,
                    itemLines: itemLinesForFp,
                  })
                : null;

            if (fingerprint) {
              const salesOrderClientKey = extracted.customer_code
                ? `customer_code:${normalizeKeyText(extracted.customer_code)}`
                : extracted.cpf
                  ? `cpf:${extracted.cpf}`
                  : extracted.phone_raw
                    ? `phone:${toDigits(extracted.phone_raw)}`
                    : extracted.name
                      ? `name:${normalizeKeyText(extracted.name)}`
                      : null;

              const nextMeta = {
                ...meta,
                sales_order_fingerprint: fingerprint,
                sales_order_client_key: salesOrderClientKey,
                sales_order_total_cents: totalCents,
                sales_order_items_source: itemsSource,
              };

              await supabase
                .from("cases")
                .update({ meta_json: nextMeta })
                .eq("tenant_id", tenantId)
                .eq("id", caseId);

              const { data: existing } = await supabase
                .from("cases")
                .select("id,updated_at")
                .eq("tenant_id", tenantId)
                .is("deleted_at", null)
                .contains("meta_json", { sales_order_fingerprint: fingerprint })
                .neq("id", caseId)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              const keepId = (existing as any)?.id ? String((existing as any).id) : null;
              if (keepId) {
                await mergeDuplicateCase({
                  supabase,
                  tenantId,
                  duplicateCaseId: caseId,
                  keepCaseId: keepId,
                  fingerprint,
                });

                targetCaseId = keepId;
                mergedInto = keepId;
              }
            }
          } catch (e: any) {
            // Não falha o job por dedupe. Seguimos com a extração normal.
            console.warn(`[${fn}] dedupe_check_failed (ignored)`, { caseId, e: e?.message ?? String(e) });
          }

          // Se o case foi consolidado em outro, escrevemos os campos no case "keep".
          const upserts: any[] = [];
          if (extracted.name) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "name", value_text: extracted.name, confidence: 0.75, source: "ocr", last_updated_by: "extract" });
          if (extracted.customer_code) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "customer_code", value_text: extracted.customer_code, confidence: 0.8, source: "ocr", last_updated_by: "extract" });
          if (extracted.email) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "email", value_text: extracted.email, confidence: 0.75, source: "ocr", last_updated_by: "extract" });
          if (extracted.address) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "address", value_text: extracted.address, confidence: 0.7, source: "ocr", last_updated_by: "extract" });
          if (extracted.city) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "city", value_text: extracted.city, confidence: 0.75, source: "ocr", last_updated_by: "extract" });
          if (extracted.cep) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "cep", value_text: extracted.cep, confidence: 0.75, source: "ocr", last_updated_by: "extract" });
          if (extracted.state) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "state", value_text: extracted.state, confidence: 0.7, source: "ocr", last_updated_by: "extract" });
          if (extracted.uf) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "uf", value_text: extracted.uf, confidence: 0.85, source: "ocr", last_updated_by: "extract" });
          if (extracted.order_local) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "order_local", value_text: extracted.order_local, confidence: 0.75, source: "ocr", last_updated_by: "extract" });
          if (extracted.order_date_text) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "order_date_text", value_text: extracted.order_date_text, confidence: 0.65, source: "ocr", last_updated_by: "extract" });
          if (extracted.inscr_est) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "inscr_est", value_text: extracted.inscr_est, confidence: 0.6, source: "ocr", last_updated_by: "extract" });

          if (extracted.cpf) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "cpf", value_text: extracted.cpf, confidence: extracted.cpf.length === 11 ? 0.85 : 0.45, source: "ocr", last_updated_by: "extract" });
          if (extracted.rg) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "rg", value_text: extracted.rg, confidence: extracted.rg.length >= 7 ? 0.75 : 0.45, source: "ocr", last_updated_by: "extract" });
          if (extracted.birth_date_text) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "birth_date_text", value_text: extracted.birth_date_text, confidence: 0.75, source: "ocr", last_updated_by: "extract" });
          if (extracted.phone_raw) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "phone", value_text: extracted.phone_raw, confidence: 0.75, source: "ocr", last_updated_by: "extract" });
          if (extracted.total_raw) upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "total_raw", value_text: extracted.total_raw, confidence: 0.6, source: "ocr", last_updated_by: "extract" });
          upserts.push({ tenant_id: tenantId, case_id: targetCaseId, key: "signature_present", value_text: extracted.signaturePresent ? "yes" : "no", confidence: 0.5, source: "ocr", last_updated_by: "extract" });

          if (upserts.length) await supabase.from("case_fields").upsert(upserts);

          await supabase.from("decision_logs").insert({
            tenant_id: tenantId,
            case_id: targetCaseId,
            agent_id: agentIdByKey.get("validation_agent") ?? null,
            input_summary: "Texto OCR",
            output_summary: mergedInto ? "Campos extraídos e caso consolidado" : "Campos iniciais extraídos",
            reasoning_public: "Extração baseada em padrões (MVP). Se faltar algo, geraremos pendências ao vendedor.",
            why_json: {
              extracted_keys: upserts.map((u) => u.key),
              ocr_preprocess: cleanedText !== rawText ? "header_trim" : "none",
              merged_into: mergedInto,
            },
            confidence_json: { overall: 0.65 },
            occurred_at: new Date().toISOString(),
          });

          await supabase.from("job_queue").update({ status: "done" }).eq("id", job.id);

          await supabase.from("job_queue").insert({
            tenant_id: tenantId,
            type: "VALIDATE_FIELDS",
            idempotency_key: `VALIDATE_FIELDS:${targetCaseId}:${Date.now()}`,
            payload_json: { case_id: targetCaseId },
            status: "pending",
            run_after: new Date().toISOString(),
          });

          results.push({ id: job.id, ok: true, mergedInto });
          continue;
        }

        if (job.type === "VALIDATE_FIELDS") {
          const { data: fields } = await supabase
            .from("case_fields")
            .select("key, value_text, value_json")
            .eq("tenant_id", tenantId)
            .eq("case_id", caseId);

          const fieldMap = new Map<string, any>();
          for (const f of fields ?? []) fieldMap.set(f.key, f.value_text ?? f.value_json);

          const missing: Array<{ type: string; question: string; required: boolean }> = [];

          const name = fieldMap.get("name");
          const cpf = fieldMap.get("cpf");
          const rg = fieldMap.get("rg");
          const birth = fieldMap.get("birth_date_text");
          const phone = fieldMap.get("phone");
          const location = fieldMap.get("location");
          const signature = fieldMap.get("signature_present");
          const totalRaw = fieldMap.get("total_raw");

          if (!name) missing.push({ type: "missing_field", question: "Qual é o NOME do cliente no pedido?", required: true });
          if (!cpf || String(cpf).length < 11) missing.push({ type: "missing_field", question: "Envie o CPF (somente números).", required: true });
          if (!rg || String(rg).length < 7) missing.push({ type: "missing_field", question: "Envie o RG (somente números).", required: true });
          if (!birth) missing.push({ type: "missing_field", question: "Qual é a data de nascimento? (dd/mm/aaaa)", required: true });
          if (!phone) missing.push({ type: "missing_field", question: "Qual é o telefone do cliente? (DDD + número)", required: true });

          if (!location) missing.push({ type: "need_location", question: "Envie sua localização (WhatsApp: Compartilhar localização).", required: true });

          if (signature === "no") {
            missing.push({ type: "missing_field", question: "O pedido está sem assinatura do cliente. Confirme se há assinatura e, se possível, envie uma foto mais nítida da assinatura.", required: true });
          }

          if (!totalRaw) {
            // Não trava, mas avisa líder/admin
            missing.push({ type: "leader_followup", question: "TOTAL não detectado. Validar manualmente o valor total do pedido.", required: false });
          }

          // Upsert pendencies (don't duplicate)
          for (const m of missing) {
            await supabase.from("pendencies").insert({
              tenant_id: tenantId,
              case_id: caseId,
              type: m.type,
              assigned_to_role: m.type === "leader_followup" ? "leader" : "vendor",
              question_text: m.question,
              required: m.required,
              status: "open",
              due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
            });
          }

          const requiredOpen = (missing.filter((m) => m.required && m.type !== "leader_followup").length > 0) as boolean;

          await supabase.from("cases").update({
            state: requiredOpen ? "pending_vendor" : "ready_for_review",
            status: requiredOpen ? "in_progress" : "ready",
          }).eq("id", caseId);

          await supabase.from("decision_logs").insert({
            tenant_id: tenantId,
            case_id: caseId,
            agent_id: agentIdByKey.get("validation_agent") ?? null,
            input_summary: "Campos extraídos / respostas do vendedor",
            output_summary: requiredOpen ? "Pendências abertas para o vendedor" : "Pronto para revisão humana",
            reasoning_public: "O pedido só pode seguir quando os campos obrigatórios e a localização estiverem presentes.",
            why_json: { missing_required: missing.filter((m) => m.required).map((m) => m.question), missing_optional: missing.filter((m) => !m.required).map((m) => m.question) },
            confidence_json: { overall: requiredOpen ? 0.55 : 0.75 },
            occurred_at: new Date().toISOString(),
          });

          await supabase.from("job_queue").update({ status: "done" }).eq("id", job.id);
          results.push({ id: job.id, ok: true, requiredOpen });
          continue;
        }

        if (job.type === "ASK_PENDENCIES") {
          // Build a pendency list message
          const { data: c } = await supabase
            .from("cases")
            .select("assigned_vendor_id, meta_json")
            .eq("id", caseId)
            .maybeSingle();

          const meta = (c as any)?.meta_json ?? {};

          // Prefer sending to vendor when assigned; otherwise fallback to customer/counterpart phone.
          let toPhone: string | null = null;

          if (c?.assigned_vendor_id) {
            const { data: vendor } = await supabase
              .from("vendors")
              .select("phone_e164")
              .eq("id", c.assigned_vendor_id)
              .maybeSingle();

            toPhone = (vendor as any)?.phone_e164 ?? null;
          }

          if (!toPhone) {
            const fallback =
              (meta?.customer_phone as string | undefined) ??
              (meta?.counterpart_phone as string | undefined) ??
              (meta?.phone as string | undefined) ??
              null;
            toPhone = fallback && String(fallback).trim() ? String(fallback).trim() : null;
          }

          if (!toPhone) {
            // Last resort: look for an extracted phone field
            const { data: cf } = await supabase
              .from("case_fields")
              .select("value_text")
              .eq("tenant_id", tenantId)
              .eq("case_id", caseId)
              .in("key", ["whatsapp", "phone", "customer_phone"])
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            toPhone = (cf as any)?.value_text ? String((cf as any).value_text).trim() : null;
          }

          if (!toPhone) throw new Error("Case has no recipient phone (vendor/customer)");

          const { data: pends } = await supabase
            .from("pendencies")
            .select("id, question_text, required")
            .eq("tenant_id", tenantId)
            .eq("case_id", caseId)
            .eq("assigned_to_role", "vendor")
            .eq("status", "open")
            .order("created_at", { ascending: true });

          if (!pends?.length) {
            await supabase.from("job_queue").update({ status: "done" }).eq("id", job.id);
            results.push({ id: job.id, ok: true, note: "no pendencies" });
            continue;
          }

          const list = pends
            .map((p, idx) => `${idx + 1}) ${p.question_text}${p.required ? "" : " (opcional)"}`)
            .join("\n");

          const msg = `Byfrost.ia — Pendências do pedido:\n\n${list}\n\nVocê pode responder por texto ou áudio (MVP).`;

          const { data: inst } = await supabase
            .from("wa_instances")
            .select("id, phone_number")
            .eq("tenant_id", tenantId)
            .eq("status", "active")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (inst?.id) {
            await supabase.from("wa_messages").insert({
              tenant_id: tenantId,
              instance_id: inst.id,
              case_id: caseId,
              direction: "outbound",
              from_phone: inst.phone_number ?? null,
              to_phone: toPhone,
              type: "text",
              body_text: msg,
              payload_json: { kind: "pendency_list", case_id: caseId },
              correlation_id: `case:${caseId}`,
              occurred_at: new Date().toISOString(),
            });

            await supabase.from("usage_events").insert({
              tenant_id: tenantId,
              type: "message",
              qty: 1,
              ref_type: "wa_message",
              meta_json: { direction: "outbound", wa_type: "text", kind: "pendency_list" },
              occurred_at: new Date().toISOString(),
            });
          }

          await supabase.from("timeline_events").insert({
            tenant_id: tenantId,
            case_id: caseId,
            event_type: "pendencies_asked",
            actor_type: "ai",
            message: "Pendências enviadas (lista).",
            meta_json: { count: pends.length, to: toPhone },
            occurred_at: new Date().toISOString(),
          });

          await supabase.from("decision_logs").insert({
            tenant_id: tenantId,
            case_id: caseId,
            agent_id: agentIdByKey.get("comms_agent") ?? null,
            input_summary: "Pendências abertas",
            output_summary: "Lista de perguntas preparada e registrada na outbox",
            reasoning_public: "Mantemos a conversa sempre em formato de lista para reduzir ambiguidades.",
            why_json: { pendency_count: pends.length },
            confidence_json: { overall: 0.8 },
            occurred_at: new Date().toISOString(),
          });

          await supabase.from("job_queue").update({ status: "done" }).eq("id", job.id);
          results.push({ id: job.id, ok: true });
          continue;
        }

        // Unknown job type
        await supabase.from("job_queue").update({ status: "failed", attempts: job.attempts + 1 }).eq("id", job.id);
        results.push({ id: job.id, ok: false, error: `Unknown job type ${job.type}` });
      } catch (e: any) {
        console.error(`[${fn}] job failed`, { id: job.id, type: job.type, error: e?.message ?? String(e) });

        if (job.type === "FINANCIAL_INGESTION") {
          const ingestionJobId = String(job.payload_json?.ingestion_job_id ?? "").trim();
          if (ingestionJobId) {
            await supabase
              .from("ingestion_jobs")
              .update({ status: "failed", error_log: String(e?.message ?? e) })
              .eq("id", ingestionJobId);
          }
        }

        await supabase.from("job_queue").update({ status: "failed", attempts: job.attempts + 1 }).eq("id", job.id);
        results.push({ id: job.id, ok: false, error: e?.message ?? String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[jobs-processor] unhandled", { error: (e as any)?.message ?? String(e) });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});