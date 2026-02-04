import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { fetchAsBase64 } from "../_shared/crypto.ts";
import {
  docAiExtractFormFields,
  docAiExtractTables,
  docAiTextFromAnchor,
  processWithGoogleDocumentAI,
} from "../_shared/googleDocumentAI.ts";

const fn = "sales-order-extract";

function pickFirstString(...values: any[]) {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function normalizeLine(s: string) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function toDigits(s: string) {
  return (s ?? "").replace(/\D/g, "");
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

function isMeaningfulValue(s: string | null) {
  const v = normalizeLine(s ?? "");
  if (!v) return false;
  if (/^[\p{P}\p{S}\s]+$/u.test(v)) return false;
  if (v.length < 2) return false;
  return true;
}

function parsePtBrMoneyToNumber(value: string) {
  const v = (value ?? "").trim();
  if (!v) return null;
  const cleaned = v.replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parsePtBrDateFromText(s: string) {
  const m = String(s ?? "").match(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{2,4})/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  let yyyy = m[3];
  if (yyyy.length === 2) yyyy = `20${yyyy}`;
  return `${dd}/${mm}/${yyyy}`;
}

function stripAgroforteHeaderLines(lines: string[]) {
  const idx = lines.findIndex((l) => /\bLocal\b\s*[:\-]/i.test(l));
  if (idx >= 0) return lines.slice(idx);

  const idx2 = lines.findIndex((l) => /^\s*Local\b/i.test(l));
  if (idx2 >= 0) return lines.slice(idx2);

  const idx3 = lines.findIndex((l) => /\bNome\b\s*[:\-]/i.test(l));
  if (idx3 >= 0) return lines.slice(idx3);

  return lines;
}

type ExtractedItem = {
  line_no: number;
  code: string | null;
  description: string;
  qty: number | null;
  value_raw: string | null;
  value_num: number | null;
};

type ExtractedFields = {
  local?: string | null;
  order_date_text?: string | null;
  customer_name?: string | null;
  customer_code?: string | null;
  email?: string | null;
  birth_date_text?: string | null;
  address?: string | null;
  phone_raw?: string | null;
  city?: string | null;
  cep?: string | null;
  state?: string | null;
  uf?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  ie?: string | null;
  rg?: string | null;

  representative_code?: string | null;
  representative_name?: string | null;
  customer_signature_present?: boolean;

  items?: ExtractedItem[];
  items_sum_total_raw?: string | null;

  payment_terms?: string | null;
  payment_signal_date_text?: string | null;
  payment_signal_value_raw?: string | null;
  payment_origin?: string | null;
  payment_local?: string | null;
  payment_due_date_text?: string | null;
  proposal_validity_date_text?: string | null;
  delivery_forecast_text?: string | null;
  obs?: string | null;

  total_raw?: string | null;

  ocr_text_preview?: string | null;
};

function extractFieldsFromText(text: string) {
  const allLines = String(text ?? "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const lines = stripAgroforteHeaderLines(allLines);

  const pickByLineRegex = (re: RegExp) => {
    for (const line of lines) {
      const m = line.match(re);
      if (m?.[1] && isMeaningfulValue(m[1])) return normalizeLine(m[1]);
    }
    return null;
  };

  const pickLabelFromLine = (label: RegExp) => {
    for (const line of lines) {
      if (!label.test(line)) continue;
      const idx = line.search(label);
      const after = normalizeLine(line.slice(idx).replace(label, "").replace(/^\s*[:\-\.]?\s*/g, ""));
      if (isMeaningfulValue(after)) return after;
    }
    return null;
  };

  const pickFromCombinedLine = (re: RegExp) => {
    for (const line of lines) {
      const m = line.match(re);
      if (m) return m;
    }
    return null;
  };

  const extracted: ExtractedFields = {
    ocr_text_preview: lines.slice(0, 50).join("\n").slice(0, 1400),
  };

  const localData = pickFromCombinedLine(/\bLocal\b\s*:\s*(.*?)\s*(?:\bData\b\s*[:\-]\s*(.*))?$/i);
  if (localData) {
    extracted.local = normalizeLine(localData[1] ?? "") || null;
    extracted.order_date_text = parsePtBrDateFromText(localData[2] ?? "") ?? null;
  } else {
    extracted.local = pickLabelFromLine(/\bLocal\b/i);
    extracted.order_date_text = parsePtBrDateFromText(pickLabelFromLine(/\bData\b/i) ?? "") ?? null;
  }

  const nomeCod = pickFromCombinedLine(/\bNome\b\s*:\s*(.*?)\s*(?:\bC[oó]digo\s+do\s+Cliente\b\s*:\s*(.*))?$/i);
  if (nomeCod) {
    let name = normalizeLine(nomeCod[1] ?? "");
    name = name.replace(/\bc[oó]digo\s+do\s+cliente\b.*$/i, "").trim();
    extracted.customer_name = name || null;
    extracted.customer_code = normalizeLine(nomeCod[2] ?? "") || null;
  } else {
    extracted.customer_name = pickLabelFromLine(/\bNome\b/i);
    extracted.customer_code = pickLabelFromLine(/\bC[oó]digo\s+do\s+Cliente\b/i);
  }

  extracted.email = pickLabelFromLine(/\bE-?mail\b/i);
  extracted.birth_date_text = parsePtBrDateFromText(pickLabelFromLine(/\bData\s+de\s+Nascimento\b/i) ?? "") ?? null;
  extracted.address = pickLabelFromLine(/\bEndere[cç]o\b/i);

  const phoneLabeled = pickLabelFromLine(/\bTelefone\b/i);
  if (phoneLabeled) {
    const m = phoneLabeled.match(/(\(?\d{2}\)?\s*9?\s*\d{4}[-\s]?\d{4})/);
    extracted.phone_raw = m?.[1] ? normalizeLine(m[1]) : null;
  }

  extracted.city = pickLabelFromLine(/\bCidade\b/i);

  {
    const cepRaw =
      pickByLineRegex(/\bCEP\b\s*[:\-]?\s*([0-9.\-]{7,12})/i) ??
      pickByLineRegex(/\bCEP\b\s*[:\-]?\s*([0-9]{5}\s*[\-\.]?\s*[0-9]{3})/i);
    const d = cepRaw ? toDigits(cepRaw) : "";
    extracted.cep = d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : null;
  }

  extracted.state = pickLabelFromLine(/\bEstado\b/i);
  extracted.uf = pickByLineRegex(/\bUF\b\s*[:\-]?\s*([A-Z]{2})\b/);

  const cpfCnpjRaw =
    pickByLineRegex(/\bcpf\s*\/?\s*cnpj\b\s*[\.:\-]?\s*([0-9\.\/-]{11,18})/i) ??
    pickByLineRegex(/\bcnpj\s*\/?\s*cpf\b\s*[\.:\-]?\s*([0-9\.\/-]{11,18})/i) ??
    pickByLineRegex(/\bcnpj\/?cpf\b\s*[\.:\-]?\s*([0-9\.\/-]{11,18})/i);

  const cpfCnpjDigits = cpfCnpjRaw ? toDigits(cpfCnpjRaw) : null;
  extracted.cpf = cpfCnpjDigits && cpfCnpjDigits.length === 11 ? cpfCnpjDigits : null;
  extracted.cnpj = cpfCnpjDigits && cpfCnpjDigits.length === 14 ? cpfCnpjDigits : null;

  extracted.ie = pickLabelFromLine(/\bInscr\.?\s*Est\.?\b/i);

  const rgRaw = pickByLineRegex(/\bRG\b\s*[\.:\-]?\s*([0-9\.\-]{6,14})/i);
  extracted.rg = rgRaw ? toDigits(rgRaw) : null;

  // Items table
  const descrIdx = lines.findIndex((l) => /\bDescri[cç][aã]o\b/i.test(l));
  const paymentIdx = lines.findIndex((l) => /\bCondi[cç][oõ]es\s+de\s+Pagamento\b/i.test(l));

  const items: ExtractedItem[] = [];

  if (descrIdx >= 0) {
    const start = descrIdx + 1;
    const end = paymentIdx > start ? paymentIdx : lines.length;
    const tableLines = lines.slice(start, end).filter((l) => !/^[-_]+$/.test(l));

    const moneyRe = /^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})$/;
    const qtyOnlyRe = /^(\d{1,3})$/;

    let descParts: string[] = [];

    const flushDesc = () => {
      const s = normalizeLine(descParts.join(" "));
      descParts = [];
      return s;
    };

    const splitCodeFromDescription = (s: string) => {
      const v = normalizeLine(s);
      if (!v) return { code: null as string | null, description: v };

      const m1 = v.match(/^(\d{3,})\s+(.+)$/);
      if (m1) return { code: m1[1], description: normalizeLine(m1[2]) };

      const m2 = v.match(/^([A-Z0-9]{3,})\s+(.+)$/i);
      if (m2) return { code: normalizeLine(m2[1]), description: normalizeLine(m2[2]) };

      return { code: null as string | null, description: v };
    };

    for (let i = 0; i < tableLines.length; i++) {
      const line = normalizeLine(tableLines[i]);
      if (!line) continue;

      if (/^(c[oó]d\.?|inscr\.?|rg|uf|quant\.?|valor)$/i.test(line)) continue;

      const qtyM = line.match(qtyOnlyRe);
      const next = normalizeLine(tableLines[i + 1] ?? "");
      const moneyM = next.match(moneyRe);

      if (qtyM && moneyM) {
        const qty = Number(qtyM[1]);
        const money = moneyM[1];
        const valueNum = parsePtBrMoneyToNumber(money);
        const rawDesc = flushDesc();

        const { code, description } = splitCodeFromDescription(rawDesc);

        if (isMeaningfulValue(description)) {
          items.push({
            line_no: items.length + 1,
            code,
            description,
            qty: Number.isFinite(qty) ? qty : null,
            value_raw: money,
            value_num: valueNum,
          });
        }

        i += 1;
        continue;
      }

      if (moneyRe.test(line)) continue;

      descParts.push(line);
      if (descParts.join(" ").length > 240) flushDesc();
    }
  }

  extracted.items = items;

  const itemsSum = items.reduce((acc, it) => acc + (it.value_num ?? 0), 0);
  extracted.items_sum_total_raw =
    itemsSum > 0
      ? `R$ ${itemsSum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;

  // Payment
  const payTermsLine = lines.find((l) => /\bCondi[cç][oõ]es\s+de\s+Pagamento\b/i.test(l));
  if (payTermsLine) {
    const t = payTermsLine.replace(/.*Condi[cç][oõ]es\s+de\s+Pagamento\b\s*/i, "").trim();
    extracted.payment_terms = isMeaningfulValue(t) ? t : null;
  }

  extracted.payment_origin = pickLabelFromLine(/\bOrigem\s+Financeira\b/i);

  if (paymentIdx >= 0) {
    for (let i = paymentIdx; i < Math.min(lines.length, paymentIdx + 30); i++) {
      const l = lines[i];
      const m = l.match(/\bLocal\b\s*[:\-]\s*(.+)/i);
      if (m?.[1] && isMeaningfulValue(m[1])) {
        extracted.payment_local = normalizeLine(m[1]);
        break;
      }
    }
  }

  extracted.payment_signal_date_text =
    parsePtBrDateFromText(pickLabelFromLine(/\bSinal\s+de\s+neg[oó]cio\s+em\b/i) ?? "") ?? null;
  extracted.payment_due_date_text =
    parsePtBrDateFromText(pickLabelFromLine(/\bCom\s+vencimento\s+em\b/i) ?? "") ?? null;
  extracted.proposal_validity_date_text =
    parsePtBrDateFromText(pickLabelFromLine(/\bValidade\s+da\s+Proposta\b/i) ?? "") ?? null;

  extracted.delivery_forecast_text = pickLabelFromLine(/\bData\s+prevista\s+para\s+entrega\b/i);
  extracted.obs = pickLabelFromLine(/\bObs\.?\b/i);

  if (paymentIdx >= 0) {
    const block = lines.slice(paymentIdx, Math.min(lines.length, paymentIdx + 60)).join("\n");
    const mSignal = block.match(/\bSinal\b[\s\S]{0,120}?R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
    const mAny = block.match(/\bR\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/);
    const v = mSignal?.[1] ?? mAny?.[1] ?? null;
    extracted.payment_signal_value_raw = v ? `R$ ${v}` : null;
  }

  // Representative / signature
  extracted.representative_code = pickLabelFromLine(/\bC[oó]digo\s+do\s+Representante\b/i);

  const repCodeIdx = lines.findIndex((l) => /\bC[oó]digo\s+do\s+Representante\b/i.test(l));
  if (repCodeIdx > 0) {
    for (let i = repCodeIdx - 1; i >= Math.max(0, repCodeIdx - 4); i--) {
      const cand = normalizeLine(lines[i]);
      if (!cand) continue;
      if (/condi[cç][oõ]es/i.test(cand)) continue;
      if (/cliente\s*:/i.test(cand)) continue;
      if (cand.length >= 3 && cand.length <= 40) {
        extracted.representative_name = cand;
        break;
      }
    }
  }

  let customerSig = false;
  for (const line of lines) {
    const m = line.match(/\bCLIENTE\b\s*:\s*(.+)$/i);
    if (m?.[1] && normalizeLine(m[1]).length >= 2) {
      customerSig = true;
      break;
    }
  }
  extracted.customer_signature_present = customerSig;

  extracted.total_raw = extracted.items_sum_total_raw;

  return extracted;
}

function mapDocAiLabel(label: string) {
  const l = normalizeLine(label).toLowerCase();
  if (l.startsWith("local")) return "local";
  if (l === "data" || l.startsWith("data:")) return "order_date_text";
  if (l.startsWith("nome")) return "customer_name";
  if (l.includes("código do cliente")) return "customer_code";
  if (l.startsWith("e-mail") || l.startsWith("email")) return "email";
  if (l.includes("data de nascimento")) return "birth_date_text";
  if (l.startsWith("endereço") || l.startsWith("endereco")) return "address";
  if (l.startsWith("telefone")) return "phone_raw";
  if (l.startsWith("cidade")) return "city";
  if (l.startsWith("cep")) return "cep";
  if (l.startsWith("estado")) return "state";
  if (l === "uf" || l.startsWith("uf")) return "uf";
  if (l.includes("cpf/cnpj") || l.includes("cnpj/cpf")) return "cpf_cnpj";
  if (l.includes("inscr") && l.includes("est")) return "ie";
  if (l === "rg") return "rg";
  if (l.includes("condições de pagamento")) return "payment_terms";
  if (l.includes("origem financeira")) return "payment_origin";
  if (l.includes("sinal") && l.includes("negócio")) return "payment_signal_date_text";
  if (l.includes("com vencimento")) return "payment_due_date_text";
  if (l.includes("validade da proposta")) return "proposal_validity_date_text";
  if (l.includes("data prevista") && l.includes("entrega")) return "delivery_forecast_text";
  if (l.startsWith("obs")) return "obs";
  if (l.includes("código do representante")) return "representative_code";
  return null;
}

function extractFromDocAi(doc: any): Partial<ExtractedFields> {
  const out: Partial<ExtractedFields> = {};

  const formFields = docAiExtractFormFields(doc);
  for (const kv of formFields) {
    const key = mapDocAiLabel(kv.label);
    if (!key) continue;

    const val = normalizeLine(kv.value);
    if (!val) continue;

    if (key === "cpf_cnpj") {
      const digits = toDigits(val);
      if (digits.length === 11) out.cpf = digits;
      if (digits.length === 14) out.cnpj = digits;
      continue;
    }

    if (key.endsWith("_date_text") || key === "order_date_text") {
      const d = parsePtBrDateFromText(val);
      if (d) (out as any)[key] = d;
      continue;
    }

    (out as any)[key] = val;
  }

  // Tables -> items
  const tables = docAiExtractTables(doc);
  const items: ExtractedItem[] = [];

  const readCell = (cell: any) => {
    const s = docAiTextFromAnchor(doc, cell?.layout?.textAnchor);
    return normalizeLine(s);
  };

  for (const t of tables) {
    const headerRow = t?.headerRows?.[0];
    const headerCells = headerRow?.cells ?? [];
    const headers = headerCells.map(readCell).map((h: string) => h.toLowerCase());

    const col = {
      code: headers.findIndex((h: string) => /\bc[oó]d\b|c[oó]digo|\bid\b|\bitem\b/.test(h)),
      description: headers.findIndex((h: string) => /descri/.test(h)),
      qty: headers.findIndex((h: string) => /quant/.test(h)),
      value: headers.findIndex((h: string) => /valor/.test(h)),
    };

    if (col.description < 0 || col.value < 0) continue;

    const bodyRows = t?.bodyRows ?? [];
    for (const r of bodyRows) {
      const cells = r?.cells ?? [];
      const code = col.code >= 0 ? readCell(cells[col.code]) : "";
      const desc = col.description >= 0 ? readCell(cells[col.description]) : "";
      const qtyRaw = col.qty >= 0 ? readCell(cells[col.qty]) : "";
      const valueRaw = col.value >= 0 ? readCell(cells[col.value]) : "";

      const description = desc;
      if (!description) continue;

      const qty = qtyRaw ? Number(toDigits(qtyRaw)) : null;
      const moneyMatch = valueRaw.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
      const money = moneyMatch?.[1] ?? null;
      const valueNum = money ? parsePtBrMoneyToNumber(money) : null;

      items.push({
        line_no: items.length + 1,
        code: code || null,
        description,
        qty: Number.isFinite(qty as any) ? qty : null,
        value_raw: money,
        value_num: valueNum,
      });
    }
  }

  if (items.length) out.items = items;

  const itemsSum = (out.items ?? []).reduce((acc, it) => acc + (it.value_num ?? 0), 0);
  if (itemsSum > 0) {
    out.items_sum_total_raw = `R$ ${itemsSum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    out.total_raw = out.items_sum_total_raw;
  }

  return out;
}

function mergePreferDocAi(base: ExtractedFields, patch: Partial<ExtractedFields>) {
  const out: any = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) continue;
    if (k === "items" && Array.isArray(v) && v.length) out.items = v;
    else out[k] = v;
  }
  return out as ExtractedFields;
}

async function runOcrGoogleVision(input: { imageUrl?: string | null; imageBase64?: string | null }) {
  const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY") ?? "";
  if (!apiKey) return { ok: false as const, error: "Missing GOOGLE_VISION_API_KEY" };

  const imageUrl = input.imageUrl ?? null;
  const imageBase64 = input.imageBase64 ?? null;

  if (!imageUrl && !imageBase64) {
    return { ok: false as const, error: "Missing mediaUrl/mediaBase64" };
  }

  const content = imageBase64 ?? (await fetchAsBase64(imageUrl!));

  const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
  const visionReq = {
    requests: [
      {
        image: { content },
        imageContext: { languageHints: ["pt"] },
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
    console.error(`[${fn}] Vision API error`, { status: res.status, json });
    return { ok: false as const, error: `Vision API error: ${res.status}`, raw: json };
  }

  const annotation = json?.responses?.[0]?.fullTextAnnotation;
  return { ok: true as const, text: String(annotation?.text ?? "") };
}

async function runOcrGoogleDocumentAI(input: { contentBase64: string; mimeType: string }) {
  const processorName = Deno.env.get("GOOGLE_DOCUMENT_AI_PROCESSOR_NAME") ?? "";
  const saJson = Deno.env.get("GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON") ?? "";
  if (!processorName || !saJson) {
    return { ok: false as const, error: "Missing GOOGLE_DOCUMENT_AI_PROCESSOR_NAME/GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON" };
  }

  const json = await processWithGoogleDocumentAI({
    processorName,
    serviceAccountJson: saJson,
    contentBase64: input.contentBase64,
    mimeType: input.mimeType,
  });

  const doc = json?.document;
  const text = String(doc?.text ?? "");
  return { ok: true as const, text, document: doc };
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
    if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !supabaseAnon) {
      console.error(`[${fn}] Missing env`, { hasUrl: Boolean(supabaseUrl), hasAnon: Boolean(supabaseAnon) });
      return new Response("Server misconfigured", { status: 500, headers: corsHeaders });
    }

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: u, error: uErr } = await userClient.auth.getUser(token);
    if (uErr || !u?.user?.id) {
      console.error(`[${fn}] auth.getUser failed`, { uErr });
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const caseId = String(body?.caseId ?? "").trim();
    const provider = String(body?.ocrProvider ?? "google_document_ai").trim();
    const mediaUrl = (body?.mediaUrl ? String(body.mediaUrl) : null) as string | null;
    const mediaBase64 = (body?.mediaBase64 ? String(body.mediaBase64) : null) as string | null;
    const mimeType = String(body?.mimeType ?? "image/jpeg").trim() || "image/jpeg";

    if (!tenantId || !caseId || (!mediaUrl && !mediaBase64)) {
      return new Response(JSON.stringify({ ok: false, error: "tenantId_caseId_and_media_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createSupabaseAdmin();

    // Authorization (IMPORTANT): use the *user* client (RLS) to verify the caller can access this case.
    // This avoids relying on a specific membership table that can diverge from the DB policies.
    const { data: cUser, error: cUserErr } = await userClient
      .from("cases")
      .select("id,tenant_id,case_type")
      .eq("tenant_id", tenantId)
      .eq("id", caseId)
      .maybeSingle();

    if (cUserErr) {
      console.error(`[${fn}] authz case check failed`, { cUserErr, tenantId, caseId, userId: u.user.id });
      return new Response(JSON.stringify({ ok: false, error: "authz_check_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!cUser?.id) {
      console.warn(`[${fn}] forbidden`, { tenantId, caseId, userId: u.user.id });
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: c, error: cErr } = await admin
      .from("cases")
      .select("id,tenant_id,case_type")
      .eq("tenant_id", tenantId)
      .eq("id", caseId)
      .maybeSingle();

    if (cErr || !c?.id) {
      console.error(`[${fn}] case load failed`, { cErr });
      return new Response(JSON.stringify({ ok: false, error: "case_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store attachment (inline data URL for quick preview)
    const contentBase64 = mediaBase64 ?? (await fetchAsBase64(mediaUrl!));
    const dataUrl = contentBase64.trim().startsWith("data:")
      ? contentBase64.trim()
      : `data:${mimeType};base64,${contentBase64}`;

    const { data: attachment, error: aErr } = await admin
      .from("case_attachments")
      .insert({
        case_id: caseId,
        kind: "image",
        storage_path: dataUrl,
        meta_json: {
          source: "panel_extract",
          inline_base64: true,
          ocr_provider: provider,
        },
      })
      .select("id")
      .single();

    if (aErr) {
      console.error(`[${fn}] attachment insert failed`, { aErr });
      return new Response(JSON.stringify({ ok: false, error: "attachment_insert_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // OCR + extraction
    let ocrText = "";
    let docAiDoc: any = null;
    let providerUsed = provider;

    if (provider === "google_document_ai") {
      const da = await runOcrGoogleDocumentAI({ contentBase64, mimeType });
      if (da.ok) {
        ocrText = da.text ?? "";
        docAiDoc = da.document ?? null;
      } else {
        console.warn(`[${fn}] docai_failed_fallback_to_vision`, { error: da.error });
        providerUsed = "google_vision";
        const v = await runOcrGoogleVision({ imageBase64: contentBase64 });
        if (!v.ok) {
          console.error(`[${fn}] vision_failed`, { error: v.error });
          return new Response(JSON.stringify({ ok: false, error: v.error }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        ocrText = v.text ?? "";
      }
    } else {
      const v = await runOcrGoogleVision({ imageBase64: contentBase64 });
      if (!v.ok) {
        console.error(`[${fn}] vision_failed`, { error: v.error });
        return new Response(JSON.stringify({ ok: false, error: v.error }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      ocrText = v.text ?? "";
    }

    // Extract structured fields
    let extracted = extractFieldsFromText(ocrText);
    if (docAiDoc) {
      const patch = extractFromDocAi(docAiDoc);
      extracted = mergePreferDocAi(extracted, patch);
    }

    // Existing values (avoid overwriting admin-filled fields)
    const keysToMaybeWrite = [
      "ocr_text",
      "local",
      "order_date_text",
      "name",
      "customer_code",
      "email",
      "birth_date_text",
      "address",
      "phone",
      "city",
      "cep",
      "state",
      "uf",
      "cpf",
      "cnpj",
      "rg",
      "ie",
      "representative_code",
      "representative_name",
      "customer_signature_present",
      "payment_terms",
      "payment_signal_date_text",
      "payment_signal_value_raw",
      "payment_origin",
      "payment_local",
      "payment_due_date_text",
      "proposal_validity_date_text",
      "delivery_forecast_text",
      "obs",
      "items_sum_total_raw",
      "total_raw",
    ];

    const { data: existingFields } = await admin
      .from("case_fields")
      .select("key,value_text,source")
      .eq("case_id", caseId)
      .in("key", keysToMaybeWrite)
      .limit(5000);

    const existingByKey = new Map<string, any>();
    for (const r of existingFields ?? []) {
      existingByKey.set(String((r as any).key), r);
    }

    const upserts: any[] = [];
    const maybeUpsert = (key: string, value: any, confidence: number) => {
      if (value === null || value === undefined) return;

      const ex = existingByKey.get(key);
      const exVal = typeof ex?.value_text === "string" ? ex.value_text.trim() : "";
      const exSource = String(ex?.source ?? "");

      // Don't overwrite admin/manual values.
      if (exVal && exSource === "admin") return;

      const row: any = {
        case_id: caseId,
        key,
        confidence,
        source: "ocr",
        last_updated_by: fn,
      };

      if (typeof value === "string") row.value_text = value;
      else row.value_json = value;

      upserts.push(row);
    };

    maybeUpsert("ocr_text", ocrText, 0.75);

    maybeUpsert("local", extracted.local ?? null, 0.8);
    maybeUpsert("order_date_text", extracted.order_date_text ?? null, 0.75);
    maybeUpsert("name", extracted.customer_name ?? null, 0.75);
    maybeUpsert("customer_code", extracted.customer_code ?? null, 0.65);
    maybeUpsert("email", extracted.email ?? null, 0.65);
    maybeUpsert("birth_date_text", extracted.birth_date_text ?? null, 0.7);
    maybeUpsert("address", extracted.address ?? null, 0.6);
    maybeUpsert("phone", extracted.phone_raw ?? null, extracted.phone_raw ? 0.8 : 0.0);
    maybeUpsert("city", extracted.city ?? null, 0.6);
    maybeUpsert("cep", extracted.cep ?? null, 0.8);
    maybeUpsert("state", extracted.state ?? null, 0.55);
    maybeUpsert("uf", extracted.uf ?? null, 0.85);
    maybeUpsert("cpf", extracted.cpf ?? null, extracted.cpf ? 0.85 : 0.0);
    maybeUpsert("cnpj", extracted.cnpj ?? null, extracted.cnpj ? 0.85 : 0.0);
    maybeUpsert("rg", extracted.rg ?? null, extracted.rg ? 0.7 : 0.0);
    maybeUpsert("ie", extracted.ie ?? null, 0.55);

    maybeUpsert("representative_code", extracted.representative_code ?? null, 0.6);
    maybeUpsert("representative_name", extracted.representative_name ?? null, 0.55);
    maybeUpsert("customer_signature_present", extracted.customer_signature_present ? "yes" : "no", 0.5);

    maybeUpsert("payment_terms", extracted.payment_terms ?? null, 0.6);
    maybeUpsert("payment_signal_date_text", extracted.payment_signal_date_text ?? null, 0.65);
    maybeUpsert("payment_signal_value_raw", extracted.payment_signal_value_raw ?? null, 0.65);
    maybeUpsert("payment_origin", extracted.payment_origin ?? null, 0.6);
    maybeUpsert("payment_local", extracted.payment_local ?? null, 0.6);
    maybeUpsert("payment_due_date_text", extracted.payment_due_date_text ?? null, 0.65);
    maybeUpsert("proposal_validity_date_text", extracted.proposal_validity_date_text ?? null, 0.7);
    maybeUpsert("delivery_forecast_text", extracted.delivery_forecast_text ?? null, 0.6);
    maybeUpsert("obs", extracted.obs ?? null, 0.55);

    maybeUpsert("items_sum_total_raw", extracted.items_sum_total_raw ?? null, 0.75);
    maybeUpsert("total_raw", extracted.total_raw ?? null, 0.8);

    if (upserts.length) {
      const { error: fErr } = await admin.from("case_fields").upsert(upserts as any, {
        onConflict: "case_id,key",
      });
      if (fErr) console.error(`[${fn}] case_fields upsert failed`, { fErr });
    }

    // Items: only fill if empty (avoid wiping manual items)
    const { data: anyItem } = await admin
      .from("case_items")
      .select("id")
      .eq("case_id", caseId)
      .limit(1)
      .maybeSingle();

    let insertedItems = 0;

    if (!(anyItem as any)?.id && Array.isArray(extracted.items) && extracted.items.length) {
      // Ensure empty
      await admin.from("case_items").delete().eq("case_id", caseId);

      const rows = extracted.items
        .filter((it) => normalizeLine(it.description))
        .slice(0, 80)
        .map((it, idx) => {
          const qty = it.qty ?? null;
          const total = it.value_num ?? null;
          const unit = qty && total ? Number(total) / Number(qty) : null;

          return {
            case_id: caseId,
            line_no: idx + 1,
            code: it.code,
            description: normalizeLine(it.description),
            qty,
            price: unit,
            total,
            confidence_json: { source: providerUsed, value_raw: it.value_raw },
          };
        });

      if (rows.length) {
        const { error: iErr } = await admin.from("case_items").insert(rows);
        if (iErr) console.error(`[${fn}] case_items insert failed`, { iErr });
        else insertedItems = rows.length;
      }
    }

    // Audit
    await admin.from("timeline_events").insert({
      tenant_id: tenantId,
      case_id: caseId,
      event_type: "sales_order_attachment_extracted",
      actor_type: "admin",
      actor_id: u.user.id,
      message: "Anexo adicionado e interpretado (OCR) no painel.",
      meta_json: {
        attachment_id: (attachment as any)?.id ?? null,
        provider_requested: provider,
        provider_used: providerUsed,
        fields_written: upserts.map((x) => x.key),
        items_inserted: insertedItems,
      },
      occurred_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        ok: true,
        attachmentId: (attachment as any)?.id ?? null,
        providerUsed,
        fieldsWritten: upserts.map((x) => x.key),
        itemsInserted: insertedItems,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error(`[${fn}] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});