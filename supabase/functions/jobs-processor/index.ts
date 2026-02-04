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

  // Heurística: em muitos pedidos (ex: Agroforte), o cabeçalho contém telefone/endereço da empresa,
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

  return filtered.join("\n").trim();
}

function normalizeOcrTextForExtraction(rawText: string) {
  const text = String(rawText ?? "");
  // Só aplica "corte do cabeçalho" quando o documento aparenta ser o formulário da Agroforte.
  if (/\bagroforte\b/i.test(text) || (/\bcnpj\b/i.test(text) && /solu[cç]oes/i.test(text))) {
    return preprocessOcrTextSalesOrder(text);
  }
  return text;
}

function extractFieldsFromText(text: string) {
  const cpfMatch = text.match(/\b(\d{3}\.?(\d{3})\.?(\d{3})-?(\d{2}))\b/);
  const cpf = cpfMatch ? toDigits(cpfMatch[1]) : null;

  const rgMatch = text.match(/\bRG\s*[:\-]?\s*(\d{6,12})\b/i) ?? text.match(/\b(\d{7,10})\b/);
  const rg = rgMatch ? toDigits(rgMatch[1]) : null;

  const birthMatch = text.match(/\b(\d{2}[\/-]\d{2}[\/-]\d{2,4})\b/);
  const birth_date_text = birthMatch ? birthMatch[1] : null;

  const phoneMatch =
    text.match(/\bTelefone\s*[:\-]?\s*(\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4})\b/i) ??
    text.match(/\b(\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4})\b/);
  const phone_raw = phoneMatch ? phoneMatch[1] : null;

  const totalMatch = text.match(/R\$\s*([0-9\.,]{2,})/);
  const total_raw = totalMatch ? totalMatch[0] : null;

  const nameMatch = text.match(/\bNome\s*[:\-]\s*(.+)/i);
  const name = nameMatch ? nameMatch[1].trim().slice(0, 80) : null;

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
    rg,
    birth_date_text,
    phone_raw,
    total_raw,
    signaturePresent,
    itemLines: itemLines.slice(0, 15),
  };
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

          const text = (ocrField?.value_text as string | null) ?? "";
          const cleanedText = normalizeOcrTextForExtraction(text);
          const extracted = extractFieldsFromText(cleanedText);

          const upserts: any[] = [];
          if (extracted.name) upserts.push({ tenant_id: tenantId, case_id: caseId, key: "name", value_text: extracted.name, confidence: 0.7, source: "ocr", last_updated_by: "extract" });
          if (extracted.cpf) upserts.push({ tenant_id: tenantId, case_id: caseId, key: "cpf", value_text: extracted.cpf, confidence: extracted.cpf.length === 11 ? 0.8 : 0.4, source: "ocr", last_updated_by: "extract" });
          if (extracted.rg) upserts.push({ tenant_id: tenantId, case_id: caseId, key: "rg", value_text: extracted.rg, confidence: extracted.rg.length >= 7 ? 0.7 : 0.4, source: "ocr", last_updated_by: "extract" });
          if (extracted.birth_date_text) upserts.push({ tenant_id: tenantId, case_id: caseId, key: "birth_date_text", value_text: extracted.birth_date_text, confidence: 0.65, source: "ocr", last_updated_by: "extract" });
          if (extracted.phone_raw) upserts.push({ tenant_id: tenantId, case_id: caseId, key: "phone", value_text: extracted.phone_raw, confidence: 0.65, source: "ocr", last_updated_by: "extract" });
          if (extracted.total_raw) upserts.push({ tenant_id: tenantId, case_id: caseId, key: "total_raw", value_text: extracted.total_raw, confidence: 0.6, source: "ocr", last_updated_by: "extract" });
          upserts.push({ tenant_id: tenantId, case_id: caseId, key: "signature_present", value_text: extracted.signaturePresent ? "yes" : "no", confidence: 0.5, source: "ocr", last_updated_by: "extract" });

          if (upserts.length) await supabase.from("case_fields").upsert(upserts);

          await supabase.from("decision_logs").insert({
            tenant_id: tenantId,
            case_id: caseId,
            agent_id: agentIdByKey.get("validation_agent") ?? null,
            input_summary: "Texto OCR",
            output_summary: "Campos iniciais extraídos",
            reasoning_public: "Extração baseada em padrões (MVP). Se faltar algo, geraremos pendências ao vendedor.",
            why_json: { extracted_keys: upserts.map((u) => u.key), ocr_preprocess: cleanedText !== text ? "header_trim" : "none" },
            confidence_json: { overall: 0.65 },
            occurred_at: new Date().toISOString(),
          });

          await supabase.from("job_queue").update({ status: "done" }).eq("id", job.id);

          await supabase.from("job_queue").insert({
            tenant_id: tenantId,
            type: "VALIDATE_FIELDS",
            idempotency_key: `VALIDATE_FIELDS:${caseId}:${Date.now()}`,
            payload_json: { case_id: caseId },
            status: "pending",
            run_after: new Date().toISOString(),
          });

          results.push({ id: job.id, ok: true });
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