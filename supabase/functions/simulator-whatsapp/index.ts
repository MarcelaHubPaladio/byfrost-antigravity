import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { normalizePhoneE164Like } from "../_shared/normalize.ts";
import { fetchAsBase64 } from "../_shared/crypto.ts";
import {
  docAiExtractFormFields,
  docAiExtractTables,
  docAiTextFromAnchor,
  processWithGoogleDocumentAI,
} from "../_shared/googleDocumentAI.ts";

function toDigits(s: string) {
  return (s ?? "").replace(/\D/g, "");
}

function normalizeLine(s: string) {
  return (s ?? "").replace(/\s+/g, " ").trim();
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
  await supabase.from("case_items").update({ case_id: keepCaseId }).eq("case_id", duplicateCaseId);
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
    meta_json: { duplicate_case_id: duplicateCaseId, fingerprint, source: "simulator" },
    occurred_at: new Date().toISOString(),
  });
}

function isMeaningfulValue(s: string | null) {
  const v = normalizeLine(s ?? "");
  if (!v) return false;
  // Avoid punctuation-only artifacts from OCR like "." or ".:"
  if (/^[\p{P}\p{S}\s]+$/u.test(v)) return false;
  if (v.length < 2) return false;
  return true;
}

function parsePtBrMoneyToNumber(value: string) {
  // "16.029,00" -> 16029.00
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
  // Heurística baseada no layout do pedido:
  // O cabeçalho com logo/endereço/CNPJ aparece ANTES da seção "Local:".
  const idx = lines.findIndex((l) => /\bLocal\b\s*[:\-]/i.test(l));
  if (idx >= 0) return lines.slice(idx);

  // Fallback: algumas capturas podem vir sem ":".
  const idx2 = lines.findIndex((l) => /^\s*Local\b/i.test(l));
  if (idx2 >= 0) return lines.slice(idx2);

  // Último fallback: começa no primeiro "Nome:" (já dentro do formulário do cliente).
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
  // Supplier
  supplier_name?: string | null;
  supplier_cnpj?: string | null;
  supplier_phone?: string | null;
  supplier_city_uf?: string | null;

  // Customer / header
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

  // Representative / signatures
  representative_code?: string | null;
  representative_name?: string | null;
  customer_signature_present?: boolean;

  // Items
  items?: ExtractedItem[];
  items_sum_total_raw?: string | null;

  // Payment
  payment_terms?: string | null;
  payment_signal_date_text?: string | null;
  payment_signal_value_raw?: string | null;
  payment_origin?: string | null;
  payment_local?: string | null;
  payment_due_date_text?: string | null;
  proposal_validity_date_text?: string | null;
  delivery_forecast_text?: string | null;
  obs?: string | null;

  // Totals
  total_raw?: string | null;

  // Raw helpers
  ocr_text_preview?: string | null;
};

function extractFieldsFromText(text: string) {
  // IMPORTANT: OCR text can contain multiple fields on the same line (forms).
  // Prefer "label -> value" parsing line-by-line; avoid generic digit matches (which often capture dates).
  const allLines = String(text ?? "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  // Para melhorar a leitura dos campos do pedido, ignoramos o topo (logo + dados da Agroforte).
  // Isso evita, por exemplo, capturar o CNPJ do cabeçalho como se fosse CPF/CNPJ do cliente.
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

  // ----------------------
  // Customer header fields
  // ----------------------
  // Local + Data may appear on same line
  const localData = pickFromCombinedLine(/\bLocal\b\s*:\s*(.*?)\s*(?:\bData\b\s*[:\-]\s*(.*))?$/i);
  if (localData) {
    extracted.local = normalizeLine(localData[1] ?? "") || null;
    extracted.order_date_text = parsePtBrDateFromText(localData[2] ?? "") ?? null;
  } else {
    extracted.local = pickLabelFromLine(/\bLocal\b/i);
    extracted.order_date_text = parsePtBrDateFromText(pickLabelFromLine(/\bData\b/i) ?? "") ?? null;
  }

  // Nome + Código do Cliente may appear together
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

  // Phone: only accept if explicitly labeled
  const phoneLabeled = pickLabelFromLine(/\bTelefone\b/i);
  if (phoneLabeled) {
    const m = phoneLabeled.match(/(\(?\d{2}\)?\s*9?\s*\d{4}[-\s]?\d{4})/);
    extracted.phone_raw = m?.[1] ? normalizeLine(m[1]) : null;
  }

  extracted.city = pickLabelFromLine(/\bCidade\b/i);

  // CEP is often OCR'ed with punctuation ("84400.00" / "84400-000" / "84400000")
  {
    const cepRaw =
      pickByLineRegex(/\bCEP\b\s*[:\-]?\s*([0-9.\-]{7,12})/i) ??
      pickByLineRegex(/\bCEP\b\s*[:\-]?\s*([0-9]{5}\s*[\-\.]?\s*[0-9]{3})/i);
    const d = cepRaw ? toDigits(cepRaw) : "";
    extracted.cep = d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : null;
  }

  extracted.state = pickLabelFromLine(/\bEstado\b/i);
  extracted.uf = pickByLineRegex(/\bUF\b\s*[:\-]?\s*([A-Z]{2})\b/);

  // Documents
  const cpfCnpjRaw =
    pickByLineRegex(/\bcpf\s*\/?\s*cnpj\b\s*[\.:\-]?\s*([0-9\.\/-]{11,18})/i) ??
    pickByLineRegex(/\bcnpj\s*\/?\s*cpf\b\s*[\.:\-]?\s*([0-9\.\/-]{11,18})/i) ??
    pickByLineRegex(/\bcnpj\/?cpf\b\s*[\.:\-]?\s*([0-9\.\/-]{11,18})/i);

  const cpfCnpjDigits = cpfCnpjRaw ? toDigits(cpfCnpjRaw) : null;
  extracted.cpf = cpfCnpjDigits && cpfCnpjDigits.length === 11 ? cpfCnpjDigits : null;
  extracted.cnpj = cpfCnpjDigits && cpfCnpjDigits.length === 14 ? cpfCnpjDigits : null;

  extracted.ie = pickLabelFromLine(/\bInscr\.?\s*Est\.?\b/i);

  // RG: only accept if explicitly labeled as RG (avoid picking dates)
  const rgRaw = pickByLineRegex(/\bRG\b\s*[\.:\-]?\s*([0-9\.\-]{6,14})/i);
  extracted.rg = rgRaw ? toDigits(rgRaw) : null;

  // ----------------------
  // Items table (text fallback)
  // ----------------------
  // OCR frequently breaks header across multiple lines ("Descrição" alone).
  const descrIdx = lines.findIndex((l) => /\bDescri[cç][aã]o\b/i.test(l));
  const paymentIdx = lines.findIndex((l) => /\bCondi[cç][oõ]es\s+de\s+Pagamento\b/i.test(l));

  const items: ExtractedItem[] = [];

  if (descrIdx >= 0) {
    const start = descrIdx + 1;
    const end = paymentIdx > start ? paymentIdx : lines.length;
    const tableLines = lines.slice(start, end).filter((l) => !/^[-_]+$/.test(l));

    const moneyRe = /^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})$/;
    const qtyOnlyRe = /^(\d{1,3})$/;

    // Heuristic state:
    // - accumulate description lines
    // - when we see qty-only and next is money, we emit an item
    let descParts: string[] = [];

    const flushDesc = () => {
      const s = normalizeLine(descParts.join(" "));
      descParts = [];
      return s;
    };

    const splitCodeFromDescription = (s: string) => {
      const v = normalizeLine(s);
      if (!v) return { code: null as string | null, description: v };

      // Common OCR pattern: "12345 PRODUTO ..." or "AB12C ITEM ..."
      const m1 = v.match(/^(\d{3,})\s+(.+)$/);
      if (m1) return { code: m1[1], description: normalizeLine(m1[2]) };

      const m2 = v.match(/^([A-Z0-9]{3,})\s+(.+)$/i);
      if (m2) return { code: normalizeLine(m2[1]), description: normalizeLine(m2[2]) };

      return { code: null as string | null, description: v };
    };

    for (let i = 0; i < tableLines.length; i++) {
      const line = normalizeLine(tableLines[i]);
      if (!line) continue;

      // Skip obvious non-item headers
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

        i += 1; // consume the money line too
        continue;
      }

      // If this looks like a standalone money line, ignore (usually totals/labels)
      if (moneyRe.test(line)) continue;

      // Otherwise, treat as description (multi-line)
      descParts.push(line);

      // Prevent runaway description
      if (descParts.join(" ").length > 240) {
        // best-effort: cut and keep going
        flushDesc();
      }
    }
  }

  extracted.items = items;

  const itemsSum = items.reduce((acc, it) => acc + (it.value_num ?? 0), 0);
  extracted.items_sum_total_raw =
    itemsSum > 0
      ? `R$ ${itemsSum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;

  // ----------------------
  // Payment section
  // ----------------------
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

  extracted.payment_signal_date_text = parsePtBrDateFromText(pickLabelFromLine(/\bSinal\s+de\s+neg[oó]cio\s+em\b/i) ?? "") ?? null;
  extracted.payment_due_date_text = parsePtBrDateFromText(pickLabelFromLine(/\bCom\s+vencimento\s+em\b/i) ?? "") ?? null;
  extracted.proposal_validity_date_text = parsePtBrDateFromText(pickLabelFromLine(/\bValidade\s+da\s+Proposta\b/i) ?? "") ?? null;

  extracted.delivery_forecast_text = pickLabelFromLine(/\bData\s+prevista\s+para\s+entrega\b/i);
  extracted.obs = pickLabelFromLine(/\bObs\.?\b/i);

  if (paymentIdx >= 0) {
    const block = lines.slice(paymentIdx, Math.min(lines.length, paymentIdx + 60)).join("\n");
    // Prefer the signal value if present; otherwise fall back to the first money in the block.
    const mSignal = block.match(/\bSinal\b[\s\S]{0,120}?R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
    const mAny = block.match(/\bR\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/);
    const v = mSignal?.[1] ?? mAny?.[1] ?? null;
    extracted.payment_signal_value_raw = v ? `R$ ${v}` : null;
  }

  // ----------------------
  // Representative + customer signature (best-effort)
  // ----------------------
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

  // If OCR captures any content after "CLIENTE:", treat as signed.
  let customerSig = false;
  for (const line of lines) {
    const m = line.match(/\bCLIENTE\b\s*:\s*(.+)$/i);
    if (m?.[1] && normalizeLine(m[1]).length >= 2) {
      customerSig = true;
      break;
    }
  }
  extracted.customer_signature_present = customerSig;

  // Total = sum(items) (Valor = total per item)
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
  // Evita pegar o CNPJ do cabeçalho do fornecedor; preferimos o campo explícito CPF/CNPJ do formulário.
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

    // Consider it the items table only if at least description + value are present
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

  // Total = sum(items)
  const itemsSum = (out.items ?? []).reduce((acc, it) => acc + (it.value_num ?? 0), 0);
  if (itemsSum > 0) {
    out.items_sum_total_raw = `R$ ${itemsSum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    out.total_raw = out.items_sum_total_raw;
  }

  return out;
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
        imageContext: {
          languageHints: ["pt"],
        },
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
  if (!res.ok || !json) return { ok: false as const, error: `Vision API error: ${res.status}`, raw: json };
  const annotation = json?.responses?.[0]?.fullTextAnnotation;
  return { ok: true as const, text: annotation?.text ?? "", raw: json?.responses?.[0] ?? json };
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
  return { ok: true as const, text, document: doc, raw: json };
}

async function ensureSalesOrderJourney(supabase: ReturnType<typeof createSupabaseAdmin>) {
  const fn = "simulator-whatsapp";

  const { data: journeyExisting, error: jErr } = await supabase
    .from("journeys")
    .select("id")
    .eq("key", "sales_order")
    .maybeSingle();

  if (jErr) {
    console.error(`[${fn}] Failed to query journeys`, { jErr });
  }

  if (journeyExisting?.id) return journeyExisting.id as string;

  console.warn(`[${fn}] Journey sales_order missing; attempting to (re)seed minimal catalog rows`);

  let sectorId: string | null = null;
  const { data: sector } = await supabase.from("sectors").select("id").eq("name", "Vendas").maybeSingle();
  sectorId = sector?.id ?? null;

  if (!sectorId) {
    const { data: createdSector, error: sErr } = await supabase
      .from("sectors")
      .insert({ name: "Vendas", description: "Templates para fluxos de vendas" })
      .select("id")
      .single();

    if (sErr || !createdSector?.id) {
      console.error(`[${fn}] Failed to create sector Vendas`, { sErr });
      return null;
    }

    sectorId = createdSector.id;
  }

  const defaultStateMachine = {
    states: [
      "new",
      "awaiting_ocr",
      "awaiting_location",
      "pending_vendor",
      "ready_for_review",
      "confirmed",
      "in_separation",
      "in_route",
      "delivered",
      "finalized",
    ],
    default: "new",
  };

  const { data: createdJourney, error: cjErr } = await supabase
    .from("journeys")
    .upsert(
      {
        sector_id: sectorId,
        key: "sales_order",
        name: "Pedido (WhatsApp + Foto)",
        description: "Captura de pedido por foto com OCR e pendências",
        default_state_machine_json: defaultStateMachine,
      },
      { onConflict: "sector_id,key" }
    )
    .select("id")
    .single();

  if (cjErr || !createdJourney?.id) {
    console.error(`[${fn}] Failed to upsert journey sales_order`, { cjErr });
    return null;
  }

  console.log(`[${fn}] Seeded journey sales_order`, { journeyId: createdJourney.id });
  return createdJourney.id as string;
}

serve(async (req) => {
  const fn = "simulator-whatsapp";
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

    const body = await req.json().catch(() => null);
    if (!body) return new Response("Invalid JSON", { status: 400, headers: corsHeaders });

    const tenantId = body.tenantId as string | undefined;
    const instanceIdRaw = body.instanceId as string | undefined;
    const instanceId = instanceIdRaw ? String(instanceIdRaw).trim() : null;

    const journeyKeyRaw = body.journeyKey as string | undefined;
    const journeyIdRaw = body.journeyId as string | undefined;
    const journeyKey = journeyKeyRaw ? String(journeyKeyRaw).trim() : "";
    const journeyIdOverride = journeyIdRaw ? String(journeyIdRaw).trim() : "";

    const type = (body.type as string | undefined) ?? "text";
    const from = normalizePhoneE164Like(body.from);
    const to = normalizePhoneE164Like(body.to);
    const text = (body.text as string | undefined) ?? null;
    const mediaUrl = (body.mediaUrl as string | undefined) ?? null;
    const mediaBase64 = (body.mediaBase64 as string | undefined) ?? null;
    const mimeType = (body.mimeType as string | undefined) ?? "image/jpeg";
    const location = body.location as { lat: number; lng: number } | undefined;

    if (!tenantId || !from) {
      return new Response(JSON.stringify({ ok: false, error: "Missing tenantId/from" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const correlationId = `sim:${crypto.randomUUID()}`;
    const supabase = createSupabaseAdmin();

    // Ensure vendor
    let vendorId: string | null = null;
    const { data: vendor } = await supabase
      .from("vendors")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("phone_e164", from)
      .maybeSingle();
    vendorId = vendor?.id ?? null;
    if (!vendorId) {
      const { data: createdVendor } = await supabase
        .from("vendors")
        .insert({ tenant_id: tenantId, phone_e164: from, display_name: "Vendedor (sim)" })
        .select("id")
        .single();
      vendorId = createdVendor?.id ?? null;
    }

    // Decide which journey to use
    let journeyId: string | null = null;
    if (journeyIdOverride) {
      const { data: j } = await supabase.from("journeys").select("id").eq("id", journeyIdOverride).maybeSingle();
      journeyId = j?.id ?? null;
    } else if (journeyKey) {
      const { data: j } = await supabase.from("journeys").select("id").eq("key", journeyKey).maybeSingle();
      journeyId = j?.id ?? null;
    } else {
      journeyId = await ensureSalesOrderJourney(supabase);
    }

    if (!journeyId) {
      return new Response(
        JSON.stringify({ ok: false, error: journeyKey || journeyIdOverride ? "Journey not found" : "Journey sales_order missing" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Determine OCR provider (tenant config) + allow request override
    let ocrProvider = (body.ocrProvider as string | undefined) ?? "";
    if (!ocrProvider) {
      const { data: tj } = await supabase
        .from("tenant_journeys")
        .select("config_json")
        .eq("tenant_id", tenantId)
        .eq("journey_id", journeyId)
        .maybeSingle();
      ocrProvider = (tj?.config_json?.automation?.ocr?.provider as string | undefined) ?? "google_vision";
    }

    // Case creation flow (MVP)
    let caseId: string | null = null;

    const debug: any = {
      journey: { journeyId, journeyKey: journeyKey || "(default: sales_order)" },
      ocr: {
        provider: ocrProvider,
        attempted: false,
        ok: false,
        error: null as string | null,
        textPreview: null as string | null,
        fallbackProvider: null as string | null,
      },
      extracted: null as any,
      created: { pendencies: 0, case_fields: 0, case_items: 0, attachments: 0, timeline: 0, wa_messages: 0 },
      notes: [] as string[],
    };

    const upsertCaseField = async (case_id: string, key: string, value: any, confidence: number, source: string, last_updated_by: string) => {
      if (value === null || value === undefined) return;
      const row: any = { case_id, key, confidence, source, last_updated_by };
      if (typeof value === "string") row.value_text = value;
      else row.value_json = value;
      const { error } = await supabase.from("case_fields").upsert(row);
      if (error) {
        console.error(`[${fn}] Failed to upsert case_field ${key}`, { error });
        debug.notes.push(`Failed to upsert case_field ${key}`);
        return;
      }
      debug.created.case_fields += 1;
    };

    const mergePreferDocAi = (base: ExtractedFields, patch: Partial<ExtractedFields>) => {
      const out: any = { ...base };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined) continue;
        if (k === "items" && Array.isArray(v) && v.length) out.items = v;
        else out[k] = v;
      }
      return out as ExtractedFields;
    };

    if (type === "image") {
      const { data: createdCase, error: cErr } = await supabase
        .from("cases")
        .insert({
          tenant_id: tenantId,
          journey_id: journeyId,
          case_type: "sales_order",
          status: "open",
          state: "awaiting_ocr",
          created_by_channel: "api",
          created_by_vendor_id: vendorId,
          assigned_vendor_id: vendorId,
          title: "Pedido (simulador)",
          meta_json: { correlation_id: correlationId, simulator: true, ocr_provider: ocrProvider },
        })
        .select("id")
        .single();

      if (cErr || !createdCase) {
        console.error(`[${fn}] Failed to create case`, { cErr });
        return new Response(JSON.stringify({ ok: false, error: "Failed to create case" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      caseId = createdCase.id;

      // Persist inbound (linked to case)
      {
        const { error: wErr } = await supabase.from("wa_messages").insert({
          tenant_id: tenantId,
          instance_id: instanceId,
          case_id: caseId,
          direction: "inbound",
          from_phone: from,
          to_phone: to,
          type: "image",
          body_text: text,
          media_url: mediaUrl,
          payload_json: body,
          correlation_id: correlationId,
          occurred_at: new Date().toISOString(),
        });
        if (!wErr) debug.created.wa_messages += 1;
      }

      // attachment placeholder
      if (mediaUrl) {
        const { error: aErr } = await supabase.from("case_attachments").insert({
          case_id: caseId,
          kind: "image",
          storage_path: mediaUrl,
          meta_json: { source: "simulator" },
        });
        if (!aErr) debug.created.attachments += 1;
      } else if (mediaBase64) {
        // For simulator UX, store a data URL so the UI can preview the image immediately.
        // (In real inbound flows we expect an actual URL from the provider.)
        const dataUrl = `data:${mimeType};base64,${mediaBase64}`;

        const { error: aErr } = await supabase.from("case_attachments").insert({
          case_id: caseId,
          kind: "image",
          storage_path: dataUrl,
          meta_json: { source: "simulator", inline_base64: true },
        });
        if (!aErr) debug.created.attachments += 1;
      }

      // Default pendencies
      {
        const { error: pErr } = await supabase.from("pendencies").insert([
          {
            case_id: caseId,
            type: "need_location",
            assigned_to_role: "vendor",
            question_text: "Envie sua localização (WhatsApp: Compartilhar localização). Sem isso não conseguimos registrar o pedido.",
            required: true,
            status: "open",
            due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          },
          {
            case_id: caseId,
            type: "need_more_pages",
            assigned_to_role: "vendor",
            question_text: "Tem mais alguma folha desse pedido? Se sim, envie as próximas fotos. Se não, responda: última folha.",
            required: false,
            status: "open",
            due_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          },
        ]);
        if (!pErr) debug.created.pendencies += 2;
      }

      // OCR
      if (mediaUrl || mediaBase64) {
        debug.ocr.attempted = true;

        const content = mediaBase64 ?? (await fetchAsBase64(mediaUrl!));

        let ocrText = "";
        let docAiDoc: any = null;
        let docAiError: string | null = null;
        let visionError: string | null = null;

        try {
          if (ocrProvider === "google_document_ai") {
            const da = await runOcrGoogleDocumentAI({ contentBase64: content, mimeType });
            if (da.ok) {
              ocrText = da.text ?? "";
              docAiDoc = da.document ?? null;
              debug.ocr.ok = true;
            } else {
              debug.ocr.ok = false;
              debug.ocr.error = da.error;
              docAiError = da.error;
            }
          } else {
            const v = await runOcrGoogleVision({ imageBase64: content });
            if (v.ok) {
              ocrText = v.text ?? "";
              debug.ocr.ok = true;
            } else {
              debug.ocr.ok = false;
              debug.ocr.error = v.error;
              visionError = v.error;
            }
          }
        } catch (e: any) {
          debug.ocr.ok = false;
          debug.ocr.error = e?.message ?? String(e);
          if (ocrProvider === "google_document_ai") docAiError = debug.ocr.error;
          else visionError = debug.ocr.error;
        }

        // Fallback: if DocAI fails, run Vision automatically
        if (!debug.ocr.ok && ocrProvider === "google_document_ai") {
          debug.ocr.fallbackProvider = "google_vision";
          const v = await runOcrGoogleVision({ imageBase64: content });
          if (v.ok) {
            ocrText = v.text ?? "";
            debug.ocr.ok = true;
            debug.ocr.error = null;
          } else {
            visionError = v.error;
            debug.ocr.ok = false;
            debug.ocr.error = `DocAI failed (${docAiError ?? "unknown"}); Vision failed (${visionError ?? "unknown"})`;
          }
        }

        debug.ocr.textPreview = ocrText ? String(ocrText).slice(0, 1200) : "";

        await upsertCaseField(caseId, "ocr_text", ocrText, 0.85, "ocr", "ocr_agent");

        // Base extraction from text
        let extracted = extractFieldsFromText(ocrText);

        // Prefer DocAI structure when available
        if (docAiDoc) {
          const patch = extractFromDocAi(docAiDoc);
          extracted = mergePreferDocAi(extracted, patch);
        }

        debug.extracted = extracted;

        // Persist core fields
        await upsertCaseField(caseId, "local", extracted.local ?? null, 0.8, "ocr", "extract");
        await upsertCaseField(caseId, "order_date_text", extracted.order_date_text ?? null, 0.75, "ocr", "extract");
        await upsertCaseField(caseId, "name", extracted.customer_name ?? null, 0.75, "ocr", "extract");
        await upsertCaseField(caseId, "customer_code", extracted.customer_code ?? null, 0.65, "ocr", "extract");
        await upsertCaseField(caseId, "email", extracted.email ?? null, 0.65, "ocr", "extract");
        await upsertCaseField(caseId, "birth_date_text", extracted.birth_date_text ?? null, 0.7, "ocr", "extract");
        await upsertCaseField(caseId, "address", extracted.address ?? null, 0.6, "ocr", "extract");
        await upsertCaseField(caseId, "phone", extracted.phone_raw ?? null, extracted.phone_raw ? 0.8 : 0.0, "ocr", "extract");
        await upsertCaseField(caseId, "city", extracted.city ?? null, 0.6, "ocr", "extract");
        await upsertCaseField(caseId, "cep", extracted.cep ?? null, 0.8, "ocr", "extract");
        await upsertCaseField(caseId, "state", extracted.state ?? null, 0.55, "ocr", "extract");
        await upsertCaseField(caseId, "uf", extracted.uf ?? null, 0.85, "ocr", "extract");
        await upsertCaseField(caseId, "cpf", extracted.cpf ?? null, extracted.cpf ? 0.85 : 0.0, "ocr", "extract");
        await upsertCaseField(caseId, "cnpj", extracted.cnpj ?? null, extracted.cnpj ? 0.85 : 0.0, "ocr", "extract");
        await upsertCaseField(caseId, "rg", extracted.rg ?? null, extracted.rg ? 0.7 : 0.0, "ocr", "extract");
        await upsertCaseField(caseId, "ie", extracted.ie ?? null, 0.55, "ocr", "extract");

        await upsertCaseField(caseId, "supplier_name", extracted.supplier_name ?? null, 0.7, "ocr", "extract");
        await upsertCaseField(caseId, "supplier_cnpj", extracted.supplier_cnpj ?? null, extracted.supplier_cnpj ? 0.9 : 0.0, "ocr", "extract");
        await upsertCaseField(caseId, "supplier_phone", extracted.supplier_phone ?? null, 0.75, "ocr", "extract");
        await upsertCaseField(caseId, "supplier_city_uf", extracted.supplier_city_uf ?? null, 0.6, "ocr", "extract");

        await upsertCaseField(caseId, "representative_code", extracted.representative_code ?? null, 0.6, "ocr", "extract");
        await upsertCaseField(caseId, "representative_name", extracted.representative_name ?? null, 0.55, "ocr", "extract");
        await upsertCaseField(caseId, "customer_signature_present", extracted.customer_signature_present ? "yes" : "no", 0.5, "ocr", "extract");

        if (!extracted.customer_signature_present) {
          const { data: sigPend } = await supabase
            .from("pendencies")
            .select("id")
            .eq("case_id", caseId)
            .eq("type", "need_customer_signature")
            .maybeSingle();

          if (!sigPend?.id) {
            const { error: spErr } = await supabase.from("pendencies").insert({
              case_id: caseId,
              type: "need_customer_signature",
              assigned_to_role: "vendor",
              question_text: "Faltou a assinatura do cliente no pedido. Envie uma foto/close da assinatura (ou reenvie a folha com a assinatura visível).",
              required: true,
              status: "open",
              due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            });
            if (!spErr) debug.created.pendencies += 1;
          }
        }

        await upsertCaseField(caseId, "payment_terms", extracted.payment_terms ?? null, 0.6, "ocr", "extract");
        await upsertCaseField(caseId, "payment_signal_date_text", extracted.payment_signal_date_text ?? null, 0.65, "ocr", "extract");
        await upsertCaseField(caseId, "payment_signal_value_raw", extracted.payment_signal_value_raw ?? null, 0.65, "ocr", "extract");
        await upsertCaseField(caseId, "payment_origin", extracted.payment_origin ?? null, 0.6, "ocr", "extract");
        await upsertCaseField(caseId, "payment_local", extracted.payment_local ?? null, 0.6, "ocr", "extract");
        await upsertCaseField(caseId, "payment_due_date_text", extracted.payment_due_date_text ?? null, 0.65, "ocr", "extract");
        await upsertCaseField(caseId, "proposal_validity_date_text", extracted.proposal_validity_date_text ?? null, 0.7, "ocr", "extract");
        await upsertCaseField(caseId, "delivery_forecast_text", extracted.delivery_forecast_text ?? null, 0.6, "ocr", "extract");
        await upsertCaseField(caseId, "obs", extracted.obs ?? null, 0.55, "ocr", "extract");

        await upsertCaseField(caseId, "items_sum_total_raw", extracted.items_sum_total_raw ?? null, 0.75, "ocr", "extract");
        await upsertCaseField(caseId, "total_raw", extracted.total_raw ?? null, 0.8, "ocr", "extract");

        // Items -> case_items
        if (Array.isArray(extracted.items) && extracted.items.length) {
          await supabase.from("case_items").delete().eq("case_id", caseId);

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
                confidence_json: { source: ocrProvider, value_raw: it.value_raw },
              };
            });

          if (rows.length) {
            const { error: iErr } = await supabase.from("case_items").insert(rows);
            if (!iErr) debug.created.case_items += rows.length;
          }
        }

        // Dedupe (simulador) — mesma lógica do processor (jobs):
        // se já existe um case com o mesmo fingerprint, consolidamos e devolvemos o case "keep".
        try {
          const looksAgroforte = /\bagroforte\b/i.test(ocrText);
          const clientKey =
            extracted.customer_code ||
            extracted.cpf ||
            (extracted.phone_raw ? toDigits(extracted.phone_raw) : "") ||
            extracted.customer_name ||
            "";

          const totalCentsFromItems = Array.isArray(extracted.items)
            ? Math.round(
                extracted.items.reduce((acc: number, it: any) => acc + (Number(it?.value_num) || 0), 0) * 100
              )
            : 0;

          const itemLinesForFp = Array.isArray(extracted.items)
            ? extracted.items
                .map((it: any) => {
                  const code = String(it?.code ?? "").trim();
                  const desc = String(it?.description ?? "").trim();
                  const qty = Number(it?.qty ?? 0);
                  const value = Number(it?.value_num ?? 0);
                  return `${code ? `${code} ` : ""}${desc} | QTY:${qty} | VALUE:${value}`;
                })
                .filter(Boolean)
            : [];

          const fingerprint =
            looksAgroforte && clientKey && totalCentsFromItems > 0 && itemLinesForFp.length
              ? await computeSalesOrderFingerprint({
                  clientKey,
                  totalCents: totalCentsFromItems,
                  itemLines: itemLinesForFp,
                })
              : null;

          if (fingerprint) {
            const { data: cRow } = await supabase
              .from("cases")
              .select("id, meta_json")
              .eq("tenant_id", tenantId)
              .eq("id", caseId)
              .maybeSingle();

            const meta = (cRow as any)?.meta_json ?? {};

            const nextMeta = {
              ...meta,
              sales_order_fingerprint: fingerprint,
              sales_order_total_cents: totalCentsFromItems,
              sales_order_client_key: extracted.customer_code
                ? `customer_code:${normalizeKeyText(extracted.customer_code)}`
                : extracted.cpf
                  ? `cpf:${extracted.cpf}`
                  : extracted.phone_raw
                    ? `phone:${toDigits(extracted.phone_raw)}`
                    : extracted.customer_name
                      ? `name:${normalizeKeyText(extracted.customer_name)}`
                      : null,
              sales_order_items_source: "simulator",
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

              debug.notes.push(`Dedupe: case consolidado em ${keepId}`);
              debug.extracted = { ...debug.extracted, merged_into: keepId, sales_order_fingerprint: fingerprint };

              // IMPORTANT: from here on, keep using the kept case id.
              caseId = keepId;
            }
          }
        } catch (e: any) {
          console.warn(`[${fn}] dedupe_check_failed (ignored)`, { e: e?.message ?? String(e) });
        }
      }

      // apply location if provided
      if (location) {
        await upsertCaseField(caseId, "location", location, 1, "vendor", "simulator");
        await supabase
          .from("pendencies")
          .update({ status: "answered", answered_text: "Localização enviada", answered_payload_json: location })
          .eq("case_id", caseId)
          .eq("type", "need_location");
      }

      // Include created pendencies in debug (helps simulator UX)
      {
        const { data: pendencies } = await supabase
          .from("pendencies")
          .select("id,type,assigned_to_role,question_text,required,status,created_at")
          .eq("case_id", caseId)
          .order("created_at", { ascending: true })
          .limit(50);
        debug.pendencies = pendencies ?? [];
      }

      const { data: outbox } = await supabase
        .from("wa_messages")
        .select("id, to_phone, type, body_text, media_url, occurred_at")
        .eq("tenant_id", tenantId)
        .eq("direction", "outbound")
        .eq("correlation_id", correlationId)
        .order("occurred_at", { ascending: true });

      return new Response(JSON.stringify({ ok: true, correlationId, caseId, instanceId, journeyId, outbox: outbox ?? [], debug }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Non-image payload fallback
    await supabase.from("wa_messages").insert({
      tenant_id: tenantId,
      instance_id: instanceId,
      case_id: null,
      direction: "inbound",
      from_phone: from,
      to_phone: to,
      type: type === "location" ? "location" : "text",
      body_text: text,
      media_url: mediaUrl,
      payload_json: body,
      correlation_id: correlationId,
      occurred_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ ok: true, correlationId, caseId: null, instanceId, journeyId, outbox: [], debug: { ocr: { provider: ocrProvider } } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[simulator-whatsapp] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});