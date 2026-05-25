export type CategoryType = "revenue" | "cost" | "fixed" | "variable" | "investment" | "financing" | "other";

export const CATEGORY_LABELS: Record<CategoryType, string> = {
  revenue: "Receita",
  cost: "Custo Direto",
  fixed: "Custo Fixo",
  variable: "Custo Variável",
  investment: "Investimento",
  financing: "Financiamento",
  other: "Outros",
};

export function normalizeDescription(s: string) {
  const raw = String(s ?? "");
  try {
    return raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
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

export function stripOuterQuotes(s: string) {
  const t = String(s ?? "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

export function splitCsvLine(line: string, delimiter: "," | ";") {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      out.push(cur.trim());
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur.trim());
  return out.map(stripOuterQuotes);
}

export function parseCategoryType(s: string | undefined | null): CategoryType | null {
  const raw = String(s ?? "").trim();
  if (!raw) return null;

  const t = raw
    .normalize?.("NFD")
    ?.replace?.(/[\u0300-\u036f]/g, "")
    ?.toLowerCase?.() ?? raw.toLowerCase();

  if (["revenue", "receita", "receitas"].includes(t)) return "revenue";
  if (["cost", "custo", "custos"].includes(t)) return "cost";
  if (["fixed", "fixo", "fixos"].includes(t)) return "fixed";
  if (["variable", "variavel", "variaveis"].includes(t)) return "variable";
  if (["investment", "investimento", "investimentos"].includes(t)) return "investment";
  if (["financing", "financiamento", "financiamentos"].includes(t)) return "financing";
  if (["other", "outro", "outros"].includes(t)) return "other";

  return null;
}

export type ParsedCategory = { name: string; type?: CategoryType };

export function parseCategoryCsv(text: string) {
  const raw = String(text ?? "");
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return [] as ParsedCategory[];

  const header = lines[0];
  const headerLower = header.toLowerCase();

  const delimiter: "," | ";" | null =
    header.includes(";") &&
      (headerLower.includes("categoria") || headerLower.includes("nome") || headerLower.includes("tipo"))
      ? ";"
      : header.includes(",") &&
        (headerLower.includes("categoria") || headerLower.includes("nome") || headerLower.includes("tipo"))
        ? ","
        : null;

  if (!delimiter) {
    const out: ParsedCategory[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = stripOuterQuotes(lines[i]);
      const lower = line.toLowerCase();
      if (i === 0 && (lower === "categorias" || lower === "categoria" || lower === "name" || lower === "nome")) continue;
      if (!line) continue;
      out.push({ name: line.trim() });
    }

    const seen = new Set<string>();
    const deduped: ParsedCategory[] = [];
    for (const row of out) {
      const key = row.name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push({ name: row.name.trim() });
    }
    return deduped;
  }

  const headerCells = splitCsvLine(header, delimiter).map((c) => c.toLowerCase());
  const nameIdx = headerCells.findIndex((c) => ["categoria", "categorias", "nome", "name"].includes(c));
  const typeIdx = headerCells.findIndex((c) => ["tipo", "type"].includes(c));

  const rows: ParsedCategory[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    const name = String(cells[nameIdx >= 0 ? nameIdx : 0] ?? "").trim();
    if (!name) continue;

    const typeRaw = String(cells[typeIdx >= 0 ? typeIdx : 1] ?? "").trim();
    const parsedType = parseCategoryType(typeRaw) ?? undefined;

    rows.push({ name, type: parsedType });
  }

  const seen = new Set<string>();
  const deduped: ParsedCategory[] = [];
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push({ name: r.name.trim(), type: r.type });
  }

  return deduped;
}

export async function sha256Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function parseMoneyInput(v: string) {
  const t = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function prettyAccountType(s: string) {
  const t = String(s ?? "").trim().toLowerCase();
  if (t === "checking") return "Conta corrente";
  if (t === "savings") return "Poupança";
  if (t === "credit") return "Cartão";
  if (t === "cash") return "Caixa";
  return s;
}

export function currentMonthRangeIso() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
