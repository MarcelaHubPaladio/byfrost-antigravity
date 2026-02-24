import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { showError, showSuccess } from "@/utils/toast";
import { Download, Landmark, Pencil, Plus, Upload } from "lucide-react";
import { AsyncSelect } from "@/components/ui/async-select";

type BankAccountRow = {
  id: string;
  bank_name: string;
  account_name: string;
  account_type: string;
  currency: string;
};

type CategoryType = "revenue" | "cost" | "fixed" | "variable" | "other";

type CategoryRow = {
  id: string;
  name: string;
  type: CategoryType;
};

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

function stripOuterQuotes(s: string) {
  const t = String(s ?? "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function splitCsvLine(line: string, delimiter: "," | ";") {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // Handle escaped quotes "" inside quoted field
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

function parseCategoryType(s: string | undefined | null): CategoryType | null {
  const raw = String(s ?? "").trim();
  if (!raw) return null;

  const t = raw
    .normalize?.("NFD")
    ?.replace?.(/\p{Diacritic}/gu, "")
    ?.toLowerCase?.() ?? raw.toLowerCase();

  // Accept both system enums and common pt-BR labels.
  if (["revenue", "receita", "receitas"].includes(t)) return "revenue";
  if (["cost", "custo", "custos"].includes(t)) return "cost";
  if (["fixed", "fixo", "fixos"].includes(t)) return "fixed";
  if (["variable", "variavel", "variaveis"].includes(t)) return "variable";
  if (["other", "outro", "outros"].includes(t)) return "other";

  return null;
}

type ParsedCategory = { name: string; type?: CategoryType };

function parseCategoryCsv(text: string) {
  const raw = String(text ?? "");
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return [] as ParsedCategory[];

  const header = lines[0];
  const headerLower = header.toLowerCase();

  // Only consider delimiter if the header *looks like* a multi-column CSV.
  const delimiter: "," | ";" | null =
    header.includes(";") &&
      (headerLower.includes("categoria") || headerLower.includes("nome") || headerLower.includes("tipo"))
      ? ";"
      : header.includes(",") &&
        (headerLower.includes("categoria") || headerLower.includes("nome") || headerLower.includes("tipo"))
        ? ","
        : null;

  // 1-column template: "Categorias" with one category per line.
  if (!delimiter) {
    const out: ParsedCategory[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = stripOuterQuotes(lines[i]);
      const lower = line.toLowerCase();
      if (i === 0 && (lower === "categorias" || lower === "categoria" || lower === "name" || lower === "nome")) continue;
      if (!line) continue;
      out.push({ name: line.trim() });
    }

    // de-dupe (case-insensitive) while preserving order
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

  // Multi-column: at minimum, Categoria/Nome and optional Tipo/Type.
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

async function sha256Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatMoneyBRL(n: number | null | undefined) {
  const x = Number(n ?? 0);
  try {
    return x.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${x.toFixed(2)}`;
  }
}

function parseMoneyInput(v: string) {
  const t = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function prettyAccountType(s: string) {
  const t = String(s ?? "").trim().toLowerCase();
  if (t === "checking") return "Conta corrente";
  if (t === "savings") return "Poupança";
  if (t === "credit") return "Cartão";
  if (t === "cash") return "Caixa";
  return s;
}

function currentMonthRangeIso() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function FinancialLedgerPanel() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  const [txStartDate, setTxStartDate] = useState(() => currentMonthRangeIso().start);
  const [txEndDate, setTxEndDate] = useState(() => currentMonthRangeIso().end);

  useEffect(() => {
    // Default filter always starts on current month when entering the screen / switching tenant.
    if (!activeTenantId) return;
    const r = currentMonthRangeIso();
    setTxStartDate(r.start);
    setTxEndDate(r.end);
  }, [activeTenantId]);

  const accountsQ = useQuery({
    queryKey: ["bank_accounts", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id,bank_name,account_name,account_type,currency")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BankAccountRow[];
    },
  });

  const categoriesQ = useQuery({
    queryKey: ["financial_categories", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_categories")
        .select("id,name,type")
        .eq("tenant_id", activeTenantId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
  });

  // Sorting & Filtering State
  const [filterEntityId, setFilterEntityId] = useState<string | null>(null);
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const transactionsQ = useQuery({
    queryKey: ["financial_transactions", activeTenantId, txStartDate, txEndDate],
    enabled: Boolean(activeTenantId && txStartDate && txEndDate),
    queryFn: async () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(txStartDate) || !/^\d{4}-\d{2}-\d{2}$/.test(txEndDate)) {
        throw new Error("Filtro de datas inválido");
      }

      const { data, error } = await supabase
        .from("financial_transactions")
        .select(
          "id,tenant_id,account_id,amount,type,description,transaction_date,status,source,fingerprint,category_id,created_at,entity_id,core_entities(display_name),financial_categories(name)"
        )
        .eq("tenant_id", activeTenantId!)
        .gte("transaction_date", txStartDate)
        .lte("transaction_date", txEndDate)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const sortedTransactions = useMemo(() => {
    let data = [...(transactionsQ.data || [])];

    // 1. Filtering
    if (filterEntityId) {
      data = data.filter((t) => t.entity_id === filterEntityId);
    }
    if (filterCategoryId) {
      data = data.filter((t) => t.category_id === filterCategoryId);
    }

    // 2. Sorting
    data.sort((a, b) => {
      if (sortKey) {
        let valA: any = a[sortKey];
        let valB: any = b[sortKey];

        if (sortKey === "amount") {
          valA = Number(valA || 0);
          valB = Number(valB || 0);
        }

        if (valA < valB) return sortDir === "asc" ? -1 : 1;
        if (valA > valB) return sortDir === "asc" ? 1 : -1;
        return 0;
      }

      // Default: Incomplete first, then date
      const aIncomplete = !a.category_id || !a.entity_id;
      const bIncomplete = !b.category_id || !b.entity_id;

      if (aIncomplete && !bIncomplete) return -1;
      if (!aIncomplete && bIncomplete) return 1;

      if (a.transaction_date !== b.transaction_date) {
        return b.transaction_date.localeCompare(a.transaction_date);
      }
      return b.created_at.localeCompare(a.created_at);
    });

    return data;
  }, [transactionsQ.data, filterEntityId, filterCategoryId, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const categoryById = useMemo(() => {
    const m = new Map<string, CategoryRow>();
    for (const c of categoriesQ.data ?? []) m.set(c.id, c);
    return m;
  }, [categoriesQ.data]);

  const accountById = useMemo(() => {
    const m = new Map<string, BankAccountRow>();
    for (const a of accountsQ.data ?? []) m.set(a.id, a);
    return m;
  }, [accountsQ.data]);

  // --------------------------
  // Banks CRUD
  // --------------------------
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccountRow | null>(null);
  const [bankName, setBankName] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountType, setBankAccountType] = useState("checking");
  const [bankCurrency, setBankCurrency] = useState("BRL");

  useEffect(() => {
    if (!bankDialogOpen) {
      setEditingBank(null);
      setBankName("");
      setBankAccountName("");
      setBankAccountType("checking");
      setBankCurrency("BRL");
    }
  }, [bankDialogOpen]);

  const saveBankM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const bn = bankName.trim();
      const an = bankAccountName.trim();
      const at = bankAccountType.trim();
      const cur = bankCurrency.trim().toUpperCase();
      if (!bn) throw new Error("Informe o banco");
      if (!an) throw new Error("Informe o nome da conta");
      if (!at) throw new Error("Informe o tipo");
      if (!cur) throw new Error("Informe a moeda");

      if (editingBank) {
        const { error } = await supabase
          .from("bank_accounts")
          .update({ bank_name: bn, account_name: an, account_type: at, currency: cur })
          .eq("tenant_id", activeTenantId)
          .eq("id", editingBank.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from("bank_accounts").insert({
        tenant_id: activeTenantId,
        bank_name: bn,
        account_name: an,
        account_type: at,
        currency: cur,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      showSuccess(editingBank ? "Conta atualizada." : "Conta criada.");
      setBankDialogOpen(false);
      await qc.invalidateQueries({ queryKey: ["bank_accounts", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao salvar conta"),
  });

  const deleteBankM = useMutation({
    mutationFn: async (id: string) => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const { error } = await supabase.from("bank_accounts").delete().eq("tenant_id", activeTenantId).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      showSuccess("Conta removida.");
      await qc.invalidateQueries({ queryKey: ["bank_accounts", activeTenantId] });
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "Falha ao remover conta");
      if (msg.toLowerCase().includes("restrict") || msg.toLowerCase().includes("foreign key")) {
        showError("Não foi possível remover: existem transações vinculadas a essa conta.");
      } else {
        showError(msg);
      }
    },
  });

  // --------------------------
  // Category creation
  // --------------------------
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<CategoryType>("variable");

  const createCategoryM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const name = newCatName.trim();
      if (!name) throw new Error("Informe o nome da categoria");

      const { data, error } = await supabase
        .from("financial_categories")
        .insert({ tenant_id: activeTenantId, name, type: newCatType })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    onSuccess: async () => {
      showSuccess("Categoria criada.");
      setNewCatName("");
      setNewCatType("variable");
      setCatDialogOpen(false);
      await qc.invalidateQueries({ queryKey: ["financial_categories", activeTenantId] });
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "Falha ao criar categoria");
      // Common case: unique(tenant_id, name)
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        showError("Já existe uma categoria com esse nome.");
      } else {
        showError(msg);
      }
    },
  });

  // --------------------------
  // Category type editing
  // --------------------------
  const [editTypesOpen, setEditTypesOpen] = useState(false);
  const [editTypesFilter, setEditTypesFilter] = useState("");

  const filteredCategories = useMemo(() => {
    const q = editTypesFilter.trim().toLowerCase();
    const rows = categoriesQ.data ?? [];
    if (!q) return rows;
    return rows.filter((c) => c.name.toLowerCase().includes(q));
  }, [categoriesQ.data, editTypesFilter]);

  const updateCategoryTypeM = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: CategoryType }) => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const { error } = await supabase
        .from("financial_categories")
        .update({ type })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["financial_categories", activeTenantId] });
      showSuccess("Tipo atualizado.");
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao atualizar tipo"),
  });

  // --------------------------
  // Category import (CSV)
  // --------------------------
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDefaultType, setImportDefaultType] = useState<CategoryType>("variable");
  const [importPreview, setImportPreview] = useState<ParsedCategory[]>([]);

  const importCategoriesM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      if (!importFile) throw new Error("Selecione um arquivo CSV");

      const text = await importFile.text();
      const parsed = parseCategoryCsv(text);
      if (parsed.length === 0) throw new Error("Nenhuma categoria encontrada no CSV");

      const rows = parsed.map((r) => ({
        tenant_id: activeTenantId,
        name: r.name,
        type: r.type ?? importDefaultType,
      }));

      const { data, error } = await supabase
        .from("financial_categories")
        .upsert(rows as any, { onConflict: "tenant_id,name", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;

      return {
        total: parsed.length,
        inserted: (data ?? []).length,
      };
    },
    onSuccess: async (res) => {
      showSuccess(`Importação concluída. ${res.inserted} novas / ${res.total} no CSV.`);
      setImportFile(null);
      setImportPreview([]);
      setImportDefaultType("variable");
      setImportDialogOpen(false);
      await qc.invalidateQueries({ queryKey: ["financial_categories", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao importar categorias"),
  });

  // --------------------------
  // Manual transaction (modal)
  // --------------------------
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [accountId, setAccountId] = useState<string>("");
  const [txDate, setTxDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [txType, setTxType] = useState<"credit" | "debit">("debit");
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [txEntityId, setTxEntityId] = useState<string | null>(null);

  const descNorm = useMemo(() => normalizeDescription(description), [description]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [categoryTouched, setCategoryTouched] = useState(false);

  useEffect(() => {
    // Default to first account
    if (!accountId && (accountsQ.data?.length ?? 0) > 0) {
      setAccountId(accountsQ.data![0].id);
    }
  }, [accountId, accountsQ.data]);

  const entitySuggestionQ = useQuery({
    queryKey: ["financial_suggest_entity", activeTenantId, descNorm],
    enabled: Boolean(activeTenantId && descNorm.length >= 3),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("financial_suggest_entity", {
        p_tenant_id: activeTenantId!,
        p_description_norm: descNorm,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const suggestedEntity = entitySuggestionQ.data?.match ? entitySuggestionQ.data : null;
  const [entityTouched, setEntityTouched] = useState(false);

  useEffect(() => {
    if (!entityTouched && suggestedEntity?.entity_id) {
      setTxEntityId(String(suggestedEntity.entity_id));
    }
    if (!description) {
      setEntityTouched(false);
      setTxEntityId(null);
    }
  }, [suggestedEntity?.entity_id, entityTouched, description]);

  const suggestionQ = useQuery({
    queryKey: ["financial_suggest_category", activeTenantId, descNorm],
    enabled: Boolean(activeTenantId && descNorm.length >= 3),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("financial_suggest_category", {
        p_tenant_id: activeTenantId!,
        p_description_norm: descNorm,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const suggested = suggestionQ.data?.match ? suggestionQ.data : null;

  useEffect(() => {
    if (!categoryTouched && suggested?.category_id) {
      setCategoryId(String(suggested.category_id));
    }
    if (!description) {
      setCategoryTouched(false);
      setCategoryId("");
    }
  }, [suggested?.category_id, categoryTouched, description]);

  const createTxM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      if (!accountId) throw new Error("Selecione uma conta");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate)) throw new Error("Data inválida");
      if (!description.trim()) throw new Error("Descrição obrigatória");
      const n = parseMoneyInput(amount);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Valor inválido");

      const fingerprint = await sha256Hex(
        JSON.stringify({
          tenant_id: activeTenantId,
          account_id: accountId,
          transaction_date: txDate,
          amount: Number(n.toFixed(2)),
          description: descNorm,
        })
      );

      const { error: insErr } = await supabase.from("financial_transactions").insert({
        tenant_id: activeTenantId,
        account_id: accountId,
        amount: Number(n.toFixed(2)),
        type: txType,
        description: description.trim(),
        transaction_date: txDate,
        competence_date: txDate,
        status: "posted",
        fingerprint,
        source: "manual",
        raw_payload: { origin: "manual" },
        category_id: categoryId || null,
        entity_id: txEntityId || null,
      });
      if (insErr) throw insErr;

      // Learning for Categories
      if (categoryId) {
        if (suggested?.rule_id && String(suggested.category_id) === categoryId && !categoryTouched) {
          await supabase.rpc("financial_increment_rule_use", {
            p_tenant_id: activeTenantId,
            p_rule_id: String(suggested.rule_id),
            p_used_increment: 1,
          });
        } else {
          await supabase.rpc("financial_upsert_classification_rule", {
            p_tenant_id: activeTenantId,
            p_pattern: descNorm,
            p_category_id: categoryId,
            p_used_increment: 1,
          });
        }
      }

      // Learning for Entities
      if (txEntityId) {
        if (suggestedEntity?.rule_id && String(suggestedEntity.entity_id) === txEntityId && !entityTouched) {
          await supabase.rpc("financial_increment_entity_rule_use", {
            p_tenant_id: activeTenantId,
            p_rule_id: String(suggestedEntity.rule_id),
            p_used_increment: 1,
          });
        } else {
          await supabase.rpc("financial_upsert_entity_rule", {
            p_tenant_id: activeTenantId,
            p_pattern: descNorm,
            p_entity_id: txEntityId,
            p_used_increment: 1,
          });
        }
      }
    },
    onSuccess: async () => {
      showSuccess("Transação lançada.");
      setAmount("");
      setDescription("");
      setCategoryId("");
      setCategoryTouched(false);
      setTxEntityId(null);
      setEntityTouched(false);
      setTxDialogOpen(false);
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao lançar transação"),
  });

  const updateTxCategoryM = useMutation({
    mutationFn: async ({ id, description, categoryId }: { id: string; description: string; categoryId: string }) => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const descN = normalizeDescription(description);

      const { error } = await supabase
        .from("financial_transactions")
        .update({ category_id: categoryId || null })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;

      if (categoryId) {
        await supabase.rpc("financial_upsert_classification_rule", {
          p_tenant_id: activeTenantId,
          p_pattern: descN,
          p_category_id: categoryId,
          p_used_increment: 1,
        });
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      showSuccess("Categoria atualizada (regra aprendida).");
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao atualizar categoria"),
  });

  const updateTxEntityM = useMutation({
    mutationFn: async ({ id, description, entityId }: { id: string; description: string; entityId: string | null }) => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const descN = normalizeDescription(description);

      const { error } = await supabase
        .from("financial_transactions")
        .update({ entity_id: entityId || null })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;

      if (entityId) {
        await supabase.rpc("financial_upsert_entity_rule", {
          p_tenant_id: activeTenantId,
          p_pattern: descN,
          p_entity_id: entityId,
          p_used_increment: 1,
        });
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      showSuccess("Entidade atrelada e regra de aprendizado criada.");
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao atualizar entidade"),
  });

  return (
    <Tabs defaultValue="transactions" className="grid gap-4">
      <TabsList className="w-fit rounded-2xl">
        <TabsTrigger value="transactions" className="rounded-2xl">
          Lançamentos
        </TabsTrigger>
        <TabsTrigger value="categories" className="rounded-2xl">
          Categorias
        </TabsTrigger>
        <TabsTrigger value="banks" className="rounded-2xl">
          Bancos
        </TabsTrigger>
      </TabsList>

      <TabsContent value="transactions" className="grid gap-4">
        <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Lançamentos</div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Lançamentos manuais com sugestão automática de categoria e aprendizado por correções.
              </div>
            </div>

            <Dialog open={txDialogOpen} onOpenChange={setTxDialogOpen}>
              <DialogTrigger asChild>
                <Button className="h-9 rounded-2xl" disabled={!activeTenantId}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo lançamento
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle>Novo lançamento</DialogTitle>
                  <DialogDescription>
                    Se uma regra bater com a descrição, sugerimos automaticamente uma categoria. Ao corrigir, o sistema aprende.
                  </DialogDescription>
                </DialogHeader>

                <ScrollArea className="h-[65vh] pr-2">
                  <div className="grid gap-3 md:grid-cols-6">
                    <div className="md:col-span-2">
                      <Label className="text-xs">Conta</Label>
                      <Select value={accountId} onValueChange={setAccountId}>
                        <SelectTrigger className="mt-1 rounded-2xl">
                          <SelectValue
                            placeholder={
                              accountsQ.isLoading
                                ? "Carregando…"
                                : !(accountsQ.data ?? []).length
                                  ? "Cadastre uma conta (aba Bancos)"
                                  : "Selecione"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {(accountsQ.data ?? []).map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.account_name} • {a.bank_name} ({a.currency})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">Data</Label>
                      <Input
                        className="mt-1 rounded-2xl"
                        type="date"
                        value={txDate}
                        onChange={(e) => setTxDate(e.target.value)}
                      />
                    </div>

                    <div>
                      <Label className="text-xs">Tipo</Label>
                      <Select value={txType} onValueChange={(v) => setTxType(v as any)}>
                        <SelectTrigger className="mt-1 rounded-2xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="debit">debit</SelectItem>
                          <SelectItem value="credit">credit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">Valor</Label>
                      <Input
                        className="mt-1 rounded-2xl"
                        placeholder="Ex: 120,50"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <Label className="text-xs">Categoria {suggested?.category_id ? "(sugerida)" : ""}</Label>
                      <Select
                        value={categoryId}
                        onValueChange={(v) => {
                          setCategoryTouched(true);
                          setCategoryId(v);
                        }}
                      >
                        <SelectTrigger className="mt-1 rounded-2xl">
                          <SelectValue placeholder={categoriesQ.isLoading ? "Carregando…" : "(sem categoria)"} />
                        </SelectTrigger>
                        <SelectContent>
                          {(categoriesQ.data ?? []).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} ({c.type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {suggested?.pattern ? (
                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          Regra: "{suggested.pattern}" • conf: {Number(suggested.confidence ?? 0).toFixed(2)}
                        </div>
                      ) : null}
                    </div>

                    <div className="md:col-span-2">
                      <Label className="text-xs">Entidade {suggestedEntity?.entity_id ? "(sugerida)" : ""}</Label>
                      <AsyncSelect
                        className="mt-1 h-9 rounded-2xl"
                        value={txEntityId}
                        initialLabel={suggestedEntity?.label}
                        onChange={(v) => {
                          setEntityTouched(true);
                          setTxEntityId(v);
                        }}
                        placeholder="Buscar cliente/fornec..."
                        loadOptions={async (val) => {
                          if (!activeTenantId || val.length < 2) return [];
                          const { data } = await supabase
                            .from("core_entities")
                            .select("id, display_name")
                            .eq("tenant_id", activeTenantId)
                            .ilike("display_name", `%${val}%`)
                            .is("deleted_at", null)
                            .limit(10);
                          return (data || []).map((d) => ({ value: d.id, label: d.display_name }));
                        }}
                      />
                      {suggestedEntity?.pattern ? (
                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          Regra: "{suggestedEntity.pattern}" • conf: {Number(suggestedEntity.confidence ?? 0).toFixed(2)}
                        </div>
                      ) : null}
                    </div>

                    <div className="md:col-span-4">
                      <Label className="text-xs">Descrição</Label>
                      <Input className="mt-1 rounded-2xl" value={description} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                  </div>
                </ScrollArea>

                <DialogFooter>
                  <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => setTxDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    className="h-10 rounded-2xl"
                    onClick={() => createTxM.mutate()}
                    disabled={!activeTenantId || createTxM.isPending || !accountId}
                  >
                    {createTxM.isPending ? "Salvando…" : "Lançar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {!(accountsQ.data ?? []).length && !accountsQ.isLoading ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200">
              Você ainda não tem contas bancárias cadastradas. Vá na aba <b>Bancos</b> para criar uma conta (isso é necessário
              para importação de extratos e lançamentos manuais).
            </div>
          ) : null}
        </Card>

        <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Transações</div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">Filtre por período (padrão: mês atual).</div>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label className="text-[11px]">De</Label>
                <Input
                  className="mt-1 h-9 w-[160px] rounded-2xl"
                  type="date"
                  value={txStartDate}
                  onChange={(e) => setTxStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-[11px]">Até</Label>
                <Input
                  className="mt-1 h-9 w-[160px] rounded-2xl"
                  type="date"
                  value={txEndDate}
                  onChange={(e) => setTxEndDate(e.target.value)}
                />
              </div>
              <Button
                variant="secondary"
                className="h-9 rounded-2xl"
                onClick={() => {
                  const r = currentMonthRangeIso();
                  setTxStartDate(r.start);
                  setTxEndDate(r.end);
                }}
              >
                Mês atual
              </Button>
              <Button variant="secondary" className="h-9 rounded-2xl" onClick={() => transactionsQ.refetch()}>
                Atualizar
              </Button>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 dark:bg-slate-900/20">
                  <TableHead className="w-[110px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => toggleSort("transaction_date")}>
                    Data {sortKey === "transaction_date" && (sortDir === "asc" ? "↑" : "↓")}
                  </TableHead>
                  <TableHead className="min-w-[200px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => toggleSort("description")}>
                    Descrição {sortKey === "description" && (sortDir === "asc" ? "↑" : "↓")}
                  </TableHead>
                  <TableHead className="w-[180px]">
                    <div className="flex items-center justify-between">
                      <span className="cursor-pointer" onClick={() => toggleSort("entity_id")}>Entidade</span>
                      {filterEntityId && (
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-[10px]" onClick={() => setFilterEntityId(null)}>Limpar</Button>
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="w-[140px]">Conta</TableHead>
                  <TableHead className="w-[80px]">Tipo</TableHead>
                  <TableHead className="w-[110px] text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => toggleSort("amount")}>
                    Valor {sortKey === "amount" && (sortDir === "asc" ? "↑" : "↓")}
                  </TableHead>
                  <TableHead className="w-[180px]">
                    <div className="flex items-center justify-between">
                      <span className="cursor-pointer" onClick={() => toggleSort("category_id")}>Categoria</span>
                      {filterCategoryId && (
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-[10px]" onClick={() => setFilterCategoryId(null)}>Limpar</Button>
                      )}
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactionsQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-slate-600 dark:text-slate-400">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : transactionsQ.isSuccess ? (
                  sortedTransactions.map((t) => {
                    const acc = accountById.get(t.account_id);
                    const cat = t.category_id ? categoryById.get(t.category_id) : null;
                    return (
                      <TableRow key={t.id} className="group">
                        <TableCell className="w-[110px] whitespace-nowrap">{t.transaction_date}</TableCell>
                        <TableCell className="max-w-[300px]">
                          <div className="truncate font-medium text-slate-900 dark:text-slate-100" title={t.description}>{t.description ?? "—"}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {t.source} • {t.status}
                          </div>
                        </TableCell>
                        <TableCell className="w-[180px]">
                          <AsyncSelect
                            className="h-8 rounded-xl"
                            value={t.entity_id ?? null}
                            initialLabel={t.core_entities?.display_name ?? null}
                            onChange={(v) => {
                              updateTxEntityM.mutate({ id: t.id, description: t.description, entityId: v });
                            }}
                            placeholder="(sem entidade)"
                            loadOptions={async (val) => {
                              if (!activeTenantId || val.length < 2) return [];
                              const { data } = await supabase
                                .from("core_entities")
                                .select("id, display_name")
                                .eq("tenant_id", activeTenantId)
                                .ilike("display_name", `%${val}%`)
                                .is("deleted_at", null)
                                .limit(10);
                              return (data || []).map((d) => ({ value: d.id, label: d.display_name }));
                            }}
                          />
                          {t.entity_id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-1 h-5 w-full text-[10px] text-slate-400 opacity-0 group-hover:opacity-100"
                              onClick={() => setFilterEntityId(t.entity_id)}
                            >
                              Filtrar este
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="w-[140px]">
                          <div className="truncate text-[11px]" title={acc?.account_name}>
                            {acc ? acc.account_name : String(t.account_id).slice(0, 8)}
                          </div>
                        </TableCell>
                        <TableCell className="w-[80px] text-[11px] font-medium text-slate-900 dark:text-slate-100">{t.type}</TableCell>
                        <TableCell className="w-[110px] text-right font-bold text-slate-900 dark:text-slate-100">
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(t.amount)}
                        </TableCell>
                        <TableCell className="w-[180px]">
                          <AsyncSelect
                            className="h-8 rounded-xl"
                            value={t.category_id ?? null}
                            initialLabel={(t as any).financial_categories?.name ?? null}
                            onChange={(v) =>
                              updateTxCategoryM.mutate({ id: t.id, description: t.description, categoryId: v })
                            }
                            placeholder="(sem categoria)"
                            loadOptions={async (val) => {
                              if (!activeTenantId) return [];
                              const query = supabase
                                .from("financial_categories")
                                .select("id, name, type")
                                .eq("tenant_id", activeTenantId)
                                .order("name", { ascending: true })
                                .limit(20);

                              if (val.trim()) {
                                query.ilike("name", `%${val}%`);
                              }

                              const { data } = await query;
                              return (data || []).map((c) => ({
                                value: c.id,
                                label: `${c.name} (${c.type})`
                              }));
                            }}
                          />
                          <div className="flex items-center justify-between">
                            {cat ? <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{cat.type}</div> : <div></div>}
                            {t.category_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-1 h-5 text-[10px] text-slate-400 opacity-0 group-hover:opacity-100"
                                onClick={() => setFilterCategoryId(t.category_id)}
                              >
                                Filtrar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : null}

                {!transactionsQ.isLoading && !(transactionsQ.data ?? []).length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-slate-600 dark:text-slate-400">
                      Nenhuma transação encontrada.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="categories" className="grid gap-4">
        <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Categorias</div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Crie/importa categorias para classificar lançamentos e treinar regras automáticas.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="secondary" className="h-9 rounded-2xl">
                <a href="/templates/categorias_com_tipo.csv" download>
                  <Download className="mr-2 h-4 w-4" />
                  Modelo CSV
                </a>
              </Button>

              <Dialog open={editTypesOpen} onOpenChange={setEditTypesOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary" className="h-9 rounded-2xl" disabled={!activeTenantId}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar tipos
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[760px] max-h-[85vh] overflow-hidden">
                  <DialogHeader>
                    <DialogTitle>Editar tipo das categorias</DialogTitle>
                    <DialogDescription>
                      Depois da importação, ajuste o tipo (revenue/cost/fixed/variable/other). As alterações são salvas na
                      hora.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-3">
                    <div>
                      <Label className="text-xs">Buscar</Label>
                      <Input
                        className="mt-1 rounded-2xl"
                        value={editTypesFilter}
                        onChange={(e) => setEditTypesFilter(e.target.value)}
                        placeholder="Ex: impostos, marketing, salários…"
                      />
                    </div>

                    <ScrollArea className="h-[55vh] rounded-2xl border border-slate-200 dark:border-slate-800">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Categoria</TableHead>
                            <TableHead className="w-[220px]">Tipo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(filteredCategories ?? []).slice(0, 200).map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-medium text-slate-900 dark:text-slate-100">{c.name}</TableCell>
                              <TableCell>
                                <Select
                                  value={c.type}
                                  onValueChange={(v) =>
                                    updateCategoryTypeM.mutate({ id: c.id, type: v as CategoryType })
                                  }
                                >
                                  <SelectTrigger className="h-9 rounded-2xl">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="revenue">revenue</SelectItem>
                                    <SelectItem value="cost">cost</SelectItem>
                                    <SelectItem value="fixed">fixed</SelectItem>
                                    <SelectItem value="variable">variable</SelectItem>
                                    <SelectItem value="other">other</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            </TableRow>
                          ))}

                          {!categoriesQ.isLoading && !(categoriesQ.data ?? []).length ? (
                            <TableRow>
                              <TableCell colSpan={2} className="text-slate-600 dark:text-slate-400">
                                Nenhuma categoria ainda.
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </TableBody>
                      </Table>
                    </ScrollArea>

                    {(filteredCategories ?? []).length > 200 ? (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Mostrando 200 de {(filteredCategories ?? []).length}. Use a busca para refinar.
                      </div>
                    ) : null}
                  </div>

                  <DialogFooter>
                    <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => setEditTypesOpen(false)}>
                      Fechar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog
                open={importDialogOpen}
                onOpenChange={(v) => {
                  setImportDialogOpen(v);
                  if (!v) {
                    setImportFile(null);
                    setImportPreview([]);
                    setImportDefaultType("variable");
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="secondary" className="h-9 rounded-2xl" disabled={!activeTenantId}>
                    <Upload className="mr-2 h-4 w-4" />
                    Importar CSV
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[560px]">
                  <DialogHeader>
                    <DialogTitle>Importar categorias (CSV)</DialogTitle>
                    <DialogDescription>
                      Você pode usar 1 coluna (Categoria) ou 2 colunas (Categoria;Tipo). Se o Tipo estiver vazio, usamos o
                      tipo padrão.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-3">
                    <div>
                      <Label className="text-xs">Tipo padrão (fallback)</Label>
                      <Select value={importDefaultType} onValueChange={(v) => setImportDefaultType(v as CategoryType)}>
                        <SelectTrigger className="mt-1 rounded-2xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="revenue">revenue (receita)</SelectItem>
                          <SelectItem value="cost">cost (custo)</SelectItem>
                          <SelectItem value="fixed">fixed (fixo)</SelectItem>
                          <SelectItem value="variable">variable (variável)</SelectItem>
                          <SelectItem value="other">other (outro)</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Valores aceitos em "Tipo": revenue/cost/fixed/variable/other (ou receita/custo/fixo/variável/outro).
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Arquivo CSV</Label>
                      <Input
                        className="mt-1 rounded-2xl"
                        type="file"
                        accept=".csv,text/csv"
                        onChange={async (e) => {
                          const f = e.target.files?.[0] ?? null;
                          setImportFile(f);
                          if (!f) {
                            setImportPreview([]);
                            return;
                          }
                          try {
                            const text = await f.text();
                            const parsed = parseCategoryCsv(text);
                            setImportPreview(parsed);
                          } catch {
                            setImportPreview([]);
                          }
                        }}
                      />
                      {importPreview.length ? (
                        <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                          {importPreview.length} categorias detectadas. Ex.:{" "}
                          {importPreview
                            .slice(0, 3)
                            .map((r) => `${r.name}${r.type ? ` (${r.type})` : ""}`)
                            .join(", ")}
                          {importPreview.length > 3 ? "…" : ""}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => setImportDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      className="h-10 rounded-2xl"
                      disabled={!activeTenantId || importCategoriesM.isPending || !importFile}
                      onClick={() => importCategoriesM.mutate()}
                    >
                      {importCategoriesM.isPending ? "Importando…" : "Importar"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="h-9 rounded-2xl" disabled={!activeTenantId}>
                    Nova categoria
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[520px]">
                  <DialogHeader>
                    <DialogTitle>Nova categoria</DialogTitle>
                    <DialogDescription>
                      Dica: use nomes curtos (ex.: "Marketing", "Combustível", "Recebíveis").
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-3">
                    <div>
                      <Label className="text-xs">Nome</Label>
                      <Input
                        className="mt-1 rounded-2xl"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        placeholder="Ex: Marketing"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">Tipo</Label>
                      <Select value={newCatType} onValueChange={(v) => setNewCatType(v as CategoryType)}>
                        <SelectTrigger className="mt-1 rounded-2xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="revenue">revenue (receita)</SelectItem>
                          <SelectItem value="cost">cost (custo)</SelectItem>
                          <SelectItem value="fixed">fixed (fixo)</SelectItem>
                          <SelectItem value="variable">variable (variável)</SelectItem>
                          <SelectItem value="other">other (outro)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      variant="secondary"
                      className="h-10 rounded-2xl"
                      onClick={() => setCatDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className="h-10 rounded-2xl"
                      onClick={() => createCategoryM.mutate()}
                      disabled={createCategoryM.isPending || !activeTenantId}
                    >
                      {createCategoryM.isPending ? "Salvando…" : "Criar"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(categoriesQ.data ?? []).slice(0, 48).map((c) => (
              <div
                key={c.id}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-200"
                title={c.id}
              >
                {c.name} <span className="text-slate-400">•</span> {c.type}
              </div>
            ))}
            {!categoriesQ.isLoading && !(categoriesQ.data ?? []).length ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">Nenhuma categoria ainda.</div>
            ) : null}
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="banks" className="grid gap-4">
        <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Landmark className="h-4 w-4" />
                Bancos / Contas
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Cadastre contas para importar extratos e vincular lançamentos.
              </div>
            </div>

            <Dialog
              open={bankDialogOpen}
              onOpenChange={(v) => {
                setBankDialogOpen(v);
                if (v) return;
              }}
            >
              <DialogTrigger asChild>
                <Button className="h-9 rounded-2xl" disabled={!activeTenantId}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova conta
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                  <DialogTitle>{editingBank ? "Editar conta" : "Nova conta"}</DialogTitle>
                  <DialogDescription>Use nomes claros (ex.: "Itaú PJ", "Santander CC", "Cartão Nubank").</DialogDescription>
                </DialogHeader>

                <div className="grid gap-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label className="text-xs">Banco</Label>
                      <Input className="mt-1 rounded-2xl" value={bankName} onChange={(e) => setBankName(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Moeda</Label>
                      <Input
                        className="mt-1 rounded-2xl"
                        value={bankCurrency}
                        onChange={(e) => setBankCurrency(e.target.value)}
                        placeholder="BRL"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Nome da conta</Label>
                    <Input
                      className="mt-1 rounded-2xl"
                      value={bankAccountName}
                      onChange={(e) => setBankAccountName(e.target.value)}
                      placeholder="Ex: Conta PJ"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={bankAccountType} onValueChange={setBankAccountType}>
                      <SelectTrigger className="mt-1 rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Conta corrente</SelectItem>
                        <SelectItem value="savings">Poupança</SelectItem>
                        <SelectItem value="credit">Cartão</SelectItem>
                        <SelectItem value="cash">Caixa</SelectItem>
                        <SelectItem value="other">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => setBankDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    className="h-10 rounded-2xl"
                    onClick={() => saveBankM.mutate()}
                    disabled={saveBankM.isPending || !activeTenantId}
                  >
                    {saveBankM.isPending ? "Salvando…" : "Salvar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Moeda</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(accountsQ.data ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-slate-900 dark:text-slate-100">{a.account_name}</TableCell>
                    <TableCell>{a.bank_name}</TableCell>
                    <TableCell>{prettyAccountType(a.account_type)}</TableCell>
                    <TableCell>{a.currency}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          className="h-8 rounded-2xl"
                          onClick={() => {
                            setEditingBank(a);
                            setBankName(a.bank_name);
                            setBankAccountName(a.account_name);
                            setBankAccountType(a.account_type || "checking");
                            setBankCurrency(a.currency || "BRL");
                            setBankDialogOpen(true);
                          }}
                        >
                          Editar
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="h-8 rounded-2xl">
                              Remover
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover conta?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Isso remove a conta do cadastro. Se houver transações vinculadas, a remoção será bloqueada.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteBankM.mutate(a.id)} disabled={deleteBankM.isPending}>
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {!accountsQ.isLoading && !(accountsQ.data ?? []).length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-slate-600 dark:text-slate-400">
                      Nenhuma conta ainda.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </Card>
      </TabsContent>
    </Tabs>
  );
}