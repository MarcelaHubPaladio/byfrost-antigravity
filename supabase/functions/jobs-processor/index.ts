import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { fetchAsBase64 } from "../_shared/crypto.ts";
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
      } catch (e) {
        console.error(`[${fn}] Job failed`, { jobId: job.id, e });
        await supabase.from("job_queue").update({ status: "failed", attempts: job.attempts + 1 }).eq("id", job.id);
        results.push({ id: job.id, ok: false, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[jobs-processor] Unhandled error`, { e });
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});