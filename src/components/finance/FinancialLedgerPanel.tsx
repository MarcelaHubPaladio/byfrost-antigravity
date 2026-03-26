import React, { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
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
import { Checkbox } from "@/components/ui/checkbox";
import { addDays, addMonths, subMonths, format, parseISO, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Download, Landmark, Pencil, Plus, Upload, Link2, CheckCircle2, Search, Info, Trash2, X } from "lucide-react";
import { AsyncSelect } from "@/components/ui/async-select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type BankAccountRow = {
  id: string;
  bank_name: string;
  account_name: string;
  account_type: string;
  currency: string;
};

type CategoryType = "revenue" | "cost" | "fixed" | "variable" | "investment" | "financing" | "other";

type CategoryRow = {
  id: string;
  name: string;
  type: CategoryType;
};

const CATEGORY_LABELS: Record<CategoryType, string> = {
  revenue: "Receita",
  cost: "Custo Direto",
  fixed: "Custo Fixo",
  variable: "Custo Variável",
  investment: "Investimento",
  financing: "Financiamento",
  other: "Outros",
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
  if (["investment", "investimento", "investimentos"].includes(t)) return "investment";
  if (["financing", "financiamento", "financiamentos"].includes(t)) return "financing";
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
  const [activeTab, setActiveTab] = useState("transactions");

  // Handle ?tab=dre in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "dre") setActiveTab("dre");
  }, []);
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

  // DRE State
  const [dreStartDate, setDreStartDate] = useState<string>(() => format(subMonths(new Date(), 2), "yyyy-MM-01"));
  const [dreEndDate, setDreEndDate] = useState<string>(() => format(addMonths(new Date(), 3), "yyyy-MM-dd"));
  const [dreGranularity, setDreGranularity] = useState<"monthly" | "daily">("monthly");

  const drePeriods = useMemo(() => {
    const periods = [];
    const start = parseISO(dreStartDate);
    const end = parseISO(dreEndDate);

    if (dreGranularity === "monthly") {
      let current = startOfMonth(start);
      while (current <= end) {
        const mKey = format(current, "yyyy-MM");
        periods.push({
          label: format(current, "MMM/yy", { locale: ptBR }).toUpperCase(),
          key: mKey,
          start: format(startOfMonth(current), "yyyy-MM-dd"),
          end: format(endOfMonth(current), "yyyy-MM-dd"),
        });
        current = addMonths(current, 1);
      }
    } else {
      let current = startOfDay(start);
      const limit = endOfDay(end);
      let count = 0;
      while (current <= limit && count < 62) { // Limit to 2 months of daily view for performance
        const dKey = format(current, "yyyy-MM-dd");
        periods.push({
          label: format(current, "dd/MM"),
          key: dKey,
          start: dKey,
          end: dKey,
        });
        current = addDays(current, 1);
        count++;
      }
    }
    return periods;
  }, [dreStartDate, dreEndDate, dreGranularity]);

  const dreTransactionsQ = useQuery({
    queryKey: ["financial_dre_transactions", activeTenantId, dreStartDate, dreEndDate],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("amount, type, category_id, transaction_date")
        .eq("tenant_id", activeTenantId!)
        .gte("transaction_date", dreStartDate)
        .lte("transaction_date", dreEndDate);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const dreBudgetsQ = useQuery({
    queryKey: ["financial_dre_budgets", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_budgets")
        .select("category_id, expected_amount, recurrence, scenario")
        .eq("tenant_id", activeTenantId!)
        .eq("scenario", "base");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const drePendingQ = useQuery({
    queryKey: ["financial_dre_pending", activeTenantId, dreStartDate, dreEndDate],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const [resP, resR] = await Promise.all([
        supabase
          .from("financial_payables")
          .select("amount, category_id, due_date")
          .eq("tenant_id", activeTenantId!)
          .eq("status", "pending")
          .gte("due_date", dreStartDate)
          .lte("due_date", dreEndDate),
        supabase
          .from("financial_receivables")
          .select("amount, category_id, due_date")
          .eq("tenant_id", activeTenantId!)
          .eq("status", "pending")
          .gte("due_date", dreStartDate)
          .lte("due_date", dreEndDate),
      ]);
      if (resP.error) throw resP.error;
      if (resR.error) throw resR.error;
      return {
        payables: resP.data ?? [],
        receivables: resR.data ?? [],
      };
    },
  });

  const dreData = useMemo(() => {
    const categories = categoriesQ.data ?? [];
    const transactions = dreTransactionsQ.data ?? [];
    const budgets = dreBudgetsQ.data ?? [];
    const pending = drePendingQ.data || { payables: [], receivables: [] };

    const rows: Record<string, { 
      category: CategoryRow; 
      periods: Record<string, { budget: number; realized: number }> 
    }> = {};

    // Initialize periods for all categories
    categories.forEach(cat => {
      rows[cat.id] = { category: cat, periods: {} };
      drePeriods.forEach(p => {
        rows[cat.id].periods[p.key] = { budget: 0, realized: 0 };
      });
    });

    // 1. Budgeting
    budgets.forEach(b => {
      if (!rows[b.category_id]) return;
      if (b.recurrence === "monthly") {
        drePeriods.forEach(p => {
          // If monthly budget and Granville is daily, we divide? 
          // For now, only show monthly budget in monthly view or distributed?
          // User said "cada mes terá duas vertentes: Orçamento ... e Realizado".
          // Let's assume budgets are monthly.
          if (dreGranularity === "monthly") {
            rows[b.category_id].periods[p.key].budget += Number(b.expected_amount);
          } else {
            // Distribute simple average for daily view
            rows[b.category_id].periods[p.key].budget += Number(b.expected_amount) / 30;
          }
        });
      }
    });

    // 2. Realized (Transactions)
    transactions.forEach(t => {
      if (!t.category_id || !rows[t.category_id]) return;
      const pKey = dreGranularity === "monthly" ? t.transaction_date.slice(0, 7) : t.transaction_date;
      if (rows[t.category_id].periods[pKey]) {
        rows[t.category_id].periods[pKey].realized += Number(t.amount);
      }
    });

    // 3. Projected (Pending Payables/Receivables)
    pending.payables.forEach(p => {
      if (!p.category_id || !rows[p.category_id]) return;
      const pKey = dreGranularity === "monthly" ? p.due_date.slice(0, 7) : p.due_date;
      if (rows[p.category_id].periods[pKey]) {
        rows[p.category_id].periods[pKey].realized += Number(p.amount);
      }
    });
    pending.receivables.forEach(r => {
      if (!r.category_id || !rows[r.category_id]) return;
      const pKey = dreGranularity === "monthly" ? r.due_date.slice(0, 7) : r.due_date;
      if (rows[r.category_id].periods[pKey]) {
        rows[r.category_id].periods[pKey].realized += Number(r.amount);
      }
    });

    // Filter out categories with no data in the range
    const filteredRows = Object.values(rows).filter(row => {
      return Object.values(row.periods).some(p => p.budget > 0 || p.realized > 0);
    });

    return filteredRows.sort((a, b) => {
      if (a.category.type !== b.category.type) {
        const order: Record<string, number> = {
          revenue: 0, cost: 1, variable: 2, fixed: 3, investment: 4, financing: 5, other: 6,
        };
        return (order[a.category.type] ?? 99) - (order[b.category.type] ?? 99);
      }
      return a.category.name.localeCompare(b.category.name);
    });
  }, [categoriesQ.data, dreTransactionsQ.data, dreBudgetsQ.data, drePendingQ.data, drePeriods, dreGranularity]);

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
          "id,tenant_id,account_id,amount,type,description,transaction_date,status,source,fingerprint,category_id,created_at,entity_id,linked_payable_id,linked_receivable_id,core_entities(display_name),financial_categories(name)"
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

  // Quick Create Dialogs
  const [quickEntityOpen, setQuickEntityOpen] = useState(false);
  const [quickEntityName, setQuickEntityName] = useState("");
  const [quickEntitySubtype, setQuickEntitySubtype] = useState("cliente");
  const [quickEntityTxId, setQuickEntityTxId] = useState<string | null>(null);

  const [quickCatOpen, setQuickCatOpen] = useState(false);
  const [quickCatName, setQuickCatName] = useState("");
  const [quickCatType, setQuickCatType] = useState<CategoryType>("variable");
  const [quickCatTxId, setQuickCatTxId] = useState<string | null>(null);

  // Category Deletion / Remapping
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryRow | null>(null);
  const [remappingTargetId, setRemappingTargetId] = useState<string | null>(null);

  const deleteCategoryWithRemapM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId || !categoryToDelete || !remappingTargetId) {
        throw new Error("Dados insuficientes para exclusão.");
      }
      if (categoryToDelete.id === remappingTargetId) {
        throw new Error("A categoria de destino deve ser diferente da atual.");
      }

      // 1. Update all transactions to target category
      const { error: txErr } = await supabase
        .from("financial_transactions")
        .update({ category_id: remappingTargetId })
        .eq("tenant_id", activeTenantId)
        .eq("category_id", categoryToDelete.id);
      if (txErr) throw txErr;

      // 2. Update payables
      const { error: payErr } = await supabase
        .from("financial_payables")
        .update({ category_id: remappingTargetId })
        .eq("tenant_id", activeTenantId)
        .eq("category_id", categoryToDelete.id);
      if (payErr) throw payErr;

      // 3. Update receivables
      const { error: recErr } = await supabase
        .from("financial_receivables")
        .update({ category_id: remappingTargetId })
        .eq("tenant_id", activeTenantId)
        .eq("category_id", categoryToDelete.id);
      if (recErr) throw recErr;

      // 4. Delete classification rules (to avoid unique conflicts on remap)
      await supabase
        .from("classification_rules")
        .delete()
        .eq("tenant_id", activeTenantId)
        .eq("category_id", categoryToDelete.id);

      // 5. Delete the category
      const { error: delErr } = await supabase
        .from("financial_categories")
        .delete()
        .eq("tenant_id", activeTenantId)
        .eq("id", categoryToDelete.id);
      if (delErr) throw delErr;
    },
    onSuccess: async () => {
      showSuccess(`Categoria "${categoryToDelete?.name}" removida. Lançamentos, contas a pagar e receber foram movidos.`);
      setCategoryToDelete(null);
      setRemappingTargetId(null);
      await qc.invalidateQueries({ queryKey: ["financial_categories", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_payables", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_receivables", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao remover categoria"),
  });

  const quickCreateEntityM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const { data, error } = await supabase
        .from("core_entities")
        .insert({
          tenant_id: activeTenantId,
          display_name: quickEntityName,
          subtype: quickEntitySubtype,
          entity_type: ["cliente", "fornecedor", "indicador", "banco", "pintor"].includes(quickEntitySubtype) ? "party" : "offering",
          status: "active"
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (newEntity) => {
      showSuccess(`Entidade "${newEntity.display_name}" criada.`);
      if (quickEntityTxId) {
        updateTxEntityM.mutate({ 
          id: quickEntityTxId, 
          description: sortedTransactions.find(t => t.id === quickEntityTxId)?.description || "", 
          entityId: newEntity.id 
        });
      }
      setQuickEntityOpen(false);
      setQuickEntityName("");
      setQuickEntityTxId(null);
      await qc.invalidateQueries({ queryKey: ["core_entities", activeTenantId] });
    },
    onError: (e: any) => showError(e.message || "Erro ao criar entidade")
  });

  const quickCreateCategoryM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const { data, error } = await supabase
        .from("financial_categories")
        .insert({
          tenant_id: activeTenantId,
          name: quickCatName,
          type: quickCatType
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (newCat) => {
      showSuccess(`Categoria "${newCat.name}" criada.`);
      if (quickCatTxId) {
        updateTxCategoryM.mutate({ 
          id: quickCatTxId, 
          description: sortedTransactions.find(t => t.id === quickCatTxId)?.description || "", 
          categoryId: newCat.id 
        });
      }
      setQuickCatOpen(false);
      setQuickCatName("");
      setQuickCatTxId(null);
      await qc.invalidateQueries({ queryKey: ["financial_categories", activeTenantId] });
    },
    onError: (e: any) => showError(e.message || "Erro ao criar categoria")
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

  // --------------------------
  // Reconciliation
  // --------------------------
  const [reconcileTxId, setReconcileTxId] = useState<string | null>(null);
  const [reconcileIsRecurrent, setReconcileIsRecurrent] = useState(false);
  const [reconcileInstallments, setReconcileInstallments] = useState("12");
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false);
  const [reconcileOnlyCurrentMonth, setReconcileOnlyCurrentMonth] = useState(true);
  const [reconcileEntityId, setReconcileEntityId] = useState<string | null>(null);
  const [reconcileAdjustmentCatId, setReconcileAdjustmentCatId] = useState<string | null>(null);
  const [reconcileDiff, setReconcileDiff] = useState<number | null>(null);
  const [reconcilePendingLink, setReconcilePendingLink] = useState<{ id: string, type: string } | null>(null);
  const [reconcilePendingLabel, setReconcilePendingLabel] = useState<string | null>(null);

  const selectedTx = useMemo(() =>
    transactionsQ.data?.find(t => t.id === reconcileTxId),
    [transactionsQ.data, reconcileTxId]
  );

  const reconcileSuggestionsQ = useQuery({
    queryKey: ["financial_suggest_reconciliation", activeTenantId, reconcileTxId],
    enabled: Boolean(activeTenantId && reconcileTxId && reconcileDialogOpen),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("financial_suggest_reconciliation", {
        p_tenant_id: activeTenantId!,
        p_transaction_id: reconcileTxId!
      });
      if (error) throw error;
      return data as any;
    }
  });

  const reconcileTxM = useMutation({
    mutationFn: async ({ linkedId, type, adjustment }: { linkedId: string, type: string, adjustment?: { amount: number, categoryId: string } }) => {
      if (!activeTenantId || !reconcileTxId) throw new Error("Parâmetros inválidos");
      
      const { data, error } = await supabase.rpc("financial_reconcile_transaction", {
        p_tenant_id: activeTenantId,
        p_transaction_id: reconcileTxId,
        p_linked_id: linkedId,
        p_type: type
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || "Erro desconhecido");

      if (adjustment && adjustment.amount !== 0) {
        const table = type === 'payable' ? 'financial_payables' : 'financial_receivables';
        const { error: adjErr } = await supabase.from(table).insert({
          tenant_id: activeTenantId,
          description: `Ajuste/Juros de conciliação (${reconcileTxId?.slice(0,8)})`,
          amount: Math.abs(adjustment.amount),
          due_date: selectedTx?.transaction_date,
          status: 'paid',
          category_id: adjustment.categoryId,
          entity_id: reconcileEntityId
        });
        if (adjErr) console.error("Falha ao criar ajuste:", adjErr);
      }
    },
    onSuccess: async () => {
      showSuccess("Transação conciliada com sucesso.");
      setReconcileDialogOpen(false);
      setReconcileTxId(null);
      setReconcileDiff(null);
      setReconcilePendingLink(null);
      setReconcilePendingLabel(null);
      setReconcileAdjustmentCatId(null);
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_cash_projection", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao conciliar")
  });

  const createLinkedPayableM = useMutation({
    mutationFn: async (tx: any) => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      
      const count = reconcileIsRecurrent ? parseInt(reconcileInstallments) || 1 : 1;
      const groupId = reconcileIsRecurrent ? crypto.randomUUID() : null;
      const items = [];
      const baseDate = new Date(`${tx.transaction_date}T12:00:00`);

      for (let i = 0; i < count; i++) {
        const itemDate = addMonths(baseDate, i);
        items.push({
          tenant_id: activeTenantId,
          description: count > 1 ? `${tx.description} (${i+1}/${count})` : tx.description,
          amount: tx.amount,
          due_date: format(itemDate, "yyyy-MM-dd"),
          status: 'pending', 
          recurrence_group_id: groupId,
          installment_number: i + 1,
          installments_total: count > 1 ? count : null,
          entity_id: reconcileEntityId || tx.entity_id,
          category_id: tx.category_id
        });
      }

      const { data: insertedItems, error: payErr } = await supabase.from("financial_payables")
        .insert(items)
        .select();
      
      if (payErr) throw payErr;
      const firstItem = insertedItems[0];

      const { error: txErr } = await supabase.rpc("financial_reconcile_transaction", {
        p_tenant_id: activeTenantId,
        p_transaction_id: tx.id,
        p_linked_id: firstItem.id,
        p_type: 'payable'
      });
      if (txErr) throw txErr;
    },
    onSuccess: async () => {
      showSuccess("Pagamento criado e vinculado.");
      setReconcileDialogOpen(false);
      setReconcileTxId(null);
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_payables", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_cash_projection", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao criar")
  });

  const createLinkedReceivableM = useMutation({
    mutationFn: async (tx: any) => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      
      const count = reconcileIsRecurrent ? parseInt(reconcileInstallments) || 1 : 1;
      const groupId = reconcileIsRecurrent ? crypto.randomUUID() : null;
      const items = [];
      const baseDate = new Date(`${tx.transaction_date}T12:00:00`);

      for (let i = 0; i < count; i++) {
        const itemDate = addMonths(baseDate, i);
        items.push({
          tenant_id: activeTenantId,
          description: count > 1 ? `${tx.description} (${i+1}/${count})` : tx.description,
          amount: tx.amount,
          due_date: format(itemDate, "yyyy-MM-dd"),
          status: 'pending',
          recurrence_group_id: groupId,
          installment_number: i + 1,
          installments_total: count > 1 ? count : null,
          entity_id: reconcileEntityId || tx.entity_id,
          category_id: tx.category_id
        });
      }

      const { data: insertedItems, error: recvErr } = await supabase.from("financial_receivables")
        .insert(items)
        .select();
      
      if (recvErr) throw recvErr;
      const firstItem = insertedItems[0];

      const { error: txErr } = await supabase.rpc("financial_reconcile_transaction", {
        p_tenant_id: activeTenantId,
        p_transaction_id: tx.id,
        p_linked_id: firstItem.id,
        p_type: 'receivable'
      });
      if (txErr) throw txErr;
    },
    onSuccess: async () => {
      showSuccess("Recebível criado e vinculado.");
      setReconcileDialogOpen(false);
      setReconcileTxId(null);
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_receivables", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_cash_projection", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao criar")
  });

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="grid gap-4">
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
        <TabsTrigger value="dre" className="rounded-2xl">
          DRE-Caixa
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
                        onCreate={(val) => {
                          setQuickEntityName(val);
                          setQuickEntityTxId(null); // No txId when creating manual
                          setQuickEntityOpen(true);
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
                  <TableHead className="w-[120px]">Conciliação</TableHead>
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
                            onCreate={(val) => {
                              setQuickEntityName(val);
                              setQuickEntityTxId(t.id);
                              setQuickEntityOpen(true);
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
                            onCreate={(val) => {
                              setQuickCatName(val);
                              setQuickCatTxId(t.id);
                              setQuickCatOpen(true);
                            }}
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
                        <TableCell className="w-[120px]">
                          {t.linked_payable_id || t.linked_receivable_id ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium text-xs">
                                    <CheckCircle2 className="h-4 w-4" />
                                    Conciliado
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t.linked_payable_id ? "Vinculado a um Conta a Pagar" : "Vinculado a um Conta a Receber"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-xl text-slate-500 hover:text-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.1)] gap-1.5 px-2"
                                onClick={() => {
                                  setReconcileTxId(t.id);
                                  setReconcileEntityId(t.entity_id || null);
                                  setReconcileDialogOpen(true);
                                }}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              <span className="text-[11px]">Conciliar</span>
                            </Button>
                          )}
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
                      Depois da importação, ajuste o tipo (receita/custo/fixo/variável/outro). As alterações são salvas na
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
                                    {(["revenue", "cost", "fixed", "variable", "investment", "financing", "other"] as CategoryType[]).map((t) => (
                                      <SelectItem key={t} value={t}>
                                        {CATEGORY_LABELS[t]}
                                      </SelectItem>
                                    ))}
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
                          {(["revenue", "cost", "fixed", "variable", "investment", "financing", "other"] as CategoryType[]).map((t) => (
                            <SelectItem key={t} value={t}>
                              {CATEGORY_LABELS[t]}
                            </SelectItem>
                          ))}
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
                          {(["revenue", "cost", "fixed", "variable", "investment", "financing", "other"] as CategoryType[]).map((t) => (
                            <SelectItem key={t} value={t}>
                              {CATEGORY_LABELS[t]}
                            </SelectItem>
                          ))}
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
            {(categoriesQ.data ?? []).slice(0, 80).map((c) => (
              <div
                key={c.id}
                className="group flex items-center gap-2 rounded-full border border-slate-200 bg-white pl-3 pr-1.5 py-1 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-200 hover:border-indigo-200 hover:shadow-sm transition-all"
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-[10px] text-slate-400 font-normal uppercase tracking-tight">{CATEGORY_LABELS[c.type]}</span>
                
                <button
                  onClick={() => {
                    setCategoryToDelete(c);
                    setRemappingTargetId(null);
                  }}
                  className="h-5 w-5 rounded-full flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
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

      <TabsContent value="dre" className="grid gap-4">
        <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">DRE-Caixa & Planejamento</div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Acompanhamento de orçamento vs realizado (regime de caixa).
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950/40">
                <Button 
                  variant={dreGranularity === "monthly" ? "secondary" : "ghost"} 
                  size="sm" 
                  className="h-8 rounded-xl px-4 text-xs" 
                  onClick={() => setDreGranularity("monthly")}
                >
                  Mensal
                </Button>
                <Button 
                  variant={dreGranularity === "daily" ? "secondary" : "ghost"} 
                  size="sm" 
                  className="h-8 rounded-xl px-4 text-xs" 
                  onClick={() => setDreGranularity("daily")}
                >
                  Diário
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Input 
                  type="date" 
                  className="h-9 w-[130px] rounded-2xl text-xs" 
                  value={dreStartDate} 
                  onChange={(e) => setDreStartDate(e.target.value)} 
                />
                <span className="text-slate-400">até</span>
                <Input 
                  type="date" 
                  className="h-9 w-[130px] rounded-2xl text-xs" 
                  value={dreEndDate} 
                  onChange={(e) => setDreEndDate(e.target.value)} 
                />
              </div>

              <Button 
                variant="outline" 
                size="sm" 
                className="h-9 rounded-2xl"
                onClick={() => {
                  dreTransactionsQ.refetch();
                  dreBudgetsQ.refetch();
                  drePendingQ.refetch();
                }}
              >
                Atualizar
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 dark:bg-slate-900/20 border-b">
                  <TableHead className="min-w-[220px] sticky left-0 bg-slate-50/50 dark:bg-slate-900/20 z-10">Categoria</TableHead>
                  {drePeriods.map((p) => (
                    <TableHead key={p.key} colSpan={3} className="text-center border-l bg-slate-100/30 dark:bg-slate-800/20">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{p.label}</div>
                      <div className="flex justify-around text-[9px] text-slate-400 border-t pt-1">
                        <span className="w-1/3 text-left pl-1">ORÇ.</span>
                        <span className="w-1/3 text-center">REAL.</span>
                        <span className="w-1/3 text-right pr-1">%</span>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(dreTransactionsQ.isLoading || dreBudgetsQ.isLoading || drePendingQ.isLoading) ? (
                  <TableRow>
                    <TableCell colSpan={drePeriods.length * 3 + 1} className="py-12 text-center text-slate-500">
                      Carregando dados financeiros...
                    </TableCell>
                  </TableRow>
                ) : dreData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={drePeriods.length * 3 + 1} className="py-12 text-center text-slate-500">
                      Nenhum lançamento ou orçamento encontrado para este período.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {/* Revenue Section */}
                    <TableRow className="bg-blue-50/20 dark:bg-blue-900/10 hover:bg-transparent">
                      <TableCell className="font-bold text-blue-600 dark:text-blue-400 sticky left-0 bg-inherit z-10">(=) RECEITAS</TableCell>
                      {drePeriods.map(p => {
                        const subRows = dreData.filter(r => r.category.type === "revenue");
                        const totalB = subRows.reduce((acc, curr) => acc + curr.periods[p.key].budget, 0);
                        const totalR = subRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
                        const pct = totalB > 0 ? (totalR / totalB) : 0;
                        return (
                          <React.Fragment key={p.key}>
                            <TableCell className="text-right text-[11px] font-semibold border-l">{formatMoneyBRL(totalB)}</TableCell>
                            <TableCell className="text-right text-[11px] font-bold text-blue-700 dark:text-blue-300">{formatMoneyBRL(totalR)}</TableCell>
                            <TableCell className={cn("text-right text-[10px]", pct >= 1 ? "text-emerald-600" : "text-amber-600")}>
                               {pct > 0 ? `${(pct * 100).toFixed(0)}%` : "—"}
                            </TableCell>
                          </React.Fragment>
                        );
                      })}
                    </TableRow>
                    {dreData.filter(r => r.category.type === "revenue").map(row => (
                      <TableRow key={row.category.id} className="group hover:bg-slate-50 dark:hover:bg-slate-900/40">
                        <TableCell className="pl-6 text-sm text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-950 group-hover:bg-inherit z-10">{row.category.name}</TableCell>
                        {drePeriods.map(p => {
                          const val = row.periods[p.key];
                          const pct = val.budget > 0 ? (val.realized / val.budget) : 0;
                          return (
                            <React.Fragment key={p.key}>
                              <TableCell className="text-right text-[11px] text-slate-500 border-l">{formatMoneyBRL(val.budget)}</TableCell>
                              <TableCell className="text-right text-[11px] font-medium">{formatMoneyBRL(val.realized)}</TableCell>
                              <TableCell className={cn("text-right text-[10px]", pct >= 1 ? "text-emerald-600" : pct > 0 ? "text-amber-600" : "text-slate-300")}>
                                {pct > 0 ? `${(pct * 100).toFixed(0)}%` : "—"}
                              </TableCell>
                            </React.Fragment>
                          );
                        })}
                      </TableRow>
                    ))}

                    <TableRow className="h-4 hover:bg-transparent"><TableCell colSpan={drePeriods.length * 3 + 1}></TableCell></TableRow>

                    {/* Expenses Section */}
                    <TableRow className="bg-rose-50/20 dark:bg-rose-900/10 hover:bg-transparent">
                      <TableCell className="font-bold text-rose-600 dark:text-rose-400 sticky left-0 bg-inherit z-10">(-) DESPESAS</TableCell>
                      {drePeriods.map(p => {
                        const subRows = dreData.filter(r => r.category.type !== "revenue");
                        const totalB = subRows.reduce((acc, curr) => acc + curr.periods[p.key].budget, 0);
                        const totalR = subRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
                        const pct = totalB > 0 ? (totalR / totalB) : 0;
                        return (
                          <React.Fragment key={p.key}>
                            <TableCell className="text-right text-[11px] font-semibold border-l">{formatMoneyBRL(totalB)}</TableCell>
                            <TableCell className="text-right text-[11px] font-bold text-rose-700 dark:text-rose-300">{formatMoneyBRL(totalR)}</TableCell>
                            <TableCell className={cn("text-right text-[10px]", pct > 1 ? "text-rose-600" : pct > 0 ? "text-emerald-600" : "text-slate-300")}>
                               {pct > 0 ? `${(pct * 100).toFixed(0)}%` : "—"}
                            </TableCell>
                          </React.Fragment>
                        );
                      })}
                    </TableRow>
                    {dreData.filter(r => r.category.type !== "revenue").map(row => (
                      <TableRow key={row.category.id} className="group hover:bg-slate-50 dark:hover:bg-slate-900/40">
                        <TableCell className="pl-6 text-sm text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-950 group-hover:bg-inherit z-10">
                          {row.category.name} <span className="text-[10px] opacity-40 uppercase">({CATEGORY_LABELS[row.category.type]})</span>
                        </TableCell>
                        {drePeriods.map(p => {
                          const val = row.periods[p.key];
                          const pct = val.budget > 0 ? (val.realized / val.budget) : 0;
                          return (
                            <React.Fragment key={p.key}>
                              <TableCell className="text-right text-[11px] text-slate-500 border-l">{formatMoneyBRL(val.budget)}</TableCell>
                              <TableCell className="text-right text-[11px] font-medium">{formatMoneyBRL(val.realized)}</TableCell>
                              <TableCell className={cn("text-right text-[10px]", pct > 1 ? "text-rose-600" : pct > 0 ? "text-emerald-600" : "text-slate-300")}>
                                {pct > 0 ? `${(pct * 100).toFixed(0)}%` : "—"}
                              </TableCell>
                            </React.Fragment>
                          );
                        })}
                      </TableRow>
                    ))}

                    {/* Net Result */}
                    <TableRow className="bg-slate-100 dark:bg-slate-900 font-bold border-t-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100">
                      <TableCell className="sticky left-0 bg-slate-100 dark:bg-slate-900 z-10">RESULTADO LÍQUIDO</TableCell>
                      {drePeriods.map(p => {
                        const revRows = dreData.filter(r => r.category.type === "revenue");
                        const expRows = dreData.filter(r => r.category.type !== "revenue");
                        
                        const revB = revRows.reduce((acc, curr) => acc + curr.periods[p.key].budget, 0);
                        const revR = revRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
                        
                        const expB = expRows.reduce((acc, curr) => acc + curr.periods[p.key].budget, 0);
                        const expR = expRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
                        
                        const netB = revB - expB;
                        const netR = revR - expR;
                        
                        return (
                          <React.Fragment key={p.key}>
                            <TableCell className="text-right text-[11px] border-l">{formatMoneyBRL(netB)}</TableCell>
                            <TableCell className={cn("text-right text-[11px] font-bold", netR >= 0 ? "text-emerald-600" : "text-rose-600")}>
                              {formatMoneyBRL(netR)}
                            </TableCell>
                            <TableCell className="text-right text-[10px] text-slate-400">
                              {netB !== 0 ? `${(((netR - netB) / Math.abs(netB)) * 100).toFixed(0)}%` : "—"}
                            </TableCell>
                          </React.Fragment>
                        );
                      })}
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 text-[10px] text-slate-400">
            * Realizado inclui pagamentos confirmados e lançamentos projetados (contas a pagar/receber pendentes).
          </div>
        </Card>
      </TabsContent>
    </Tabs>

      <Dialog open={reconcileDialogOpen} onOpenChange={setReconcileDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Conciliação Bancária</DialogTitle>
            <DialogDescription>
              Vincule esta transação a um registro de conta a pagar ou receber existente.
            </DialogDescription>
          </DialogHeader>

          {selectedTx && (
            <div className="grid gap-4 py-4">
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Transação do Extrato</div>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{selectedTx.description}</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">{selectedTx.transaction_date}</div>
                  </div>
                  <div className={cn("text-lg font-bold", selectedTx.type === 'credit' ? 'text-emerald-600' : 'text-slate-900 dark:text-slate-100')}>
                    {formatMoneyBRL(selectedTx.amount)}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Busca manual (Conciliação Parcial)</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="dlg-only-month" 
                      checked={reconcileOnlyCurrentMonth} 
                      onCheckedChange={(v) => setReconcileOnlyCurrentMonth(!!v)} 
                    />
                    <Label htmlFor="dlg-only-month" className="text-[10px] text-slate-500 cursor-pointer">Apenas mês atual</Label>
                  </div>
                </div>
                <AsyncSelect
                  key={`reconcile-search-${reconcileOnlyCurrentMonth}`}
                  className="h-10 rounded-2xl"
                  placeholder="Buscar por descrição ou valor..."
                  onChange={(jsonVal) => {
                    if (jsonVal) {
                      const { id, amount, label } = JSON.parse(jsonVal);
                      const diff = Math.abs(selectedTx?.amount || 0) - (amount || 0);
                      const type = selectedTx.type === 'debit' ? 'payable' : 'receivable';

                      if (diff > 0.01) {
                        setReconcileDiff(diff);
                        setReconcilePendingLink({ id, type });
                        setReconcilePendingLabel(label);
                        setReconcileAdjustmentCatId(null);
                      } else {
                        reconcileTxM.mutate({ linkedId: id, type });
                      }
                    }
                  }}
                  loadOptions={async (val) => {
                    if (!activeTenantId || val.length < 2) return [];
                    const table = selectedTx.type === 'debit' ? 'financial_payables' : 'financial_receivables';
                    
                    let query = supabase
                      .from(table)
                      .select("id, description, amount, due_date, core_entities(display_name)")
                      .eq("tenant_id", activeTenantId)
                      .eq("status", "pending")
                      .or(`description.ilike.%${val}%,description.ilike.%${val.replace(/[áàâãéèêíïóôõöúç]/gi, '_')}%`);

                    if (reconcileOnlyCurrentMonth) {
                      const baseDate = new Date(`${selectedTx.transaction_date}T12:00:00`);
                      const startOfMonth = format(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1), "yyyy-MM-dd");
                      const endOfMonth = format(new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0), "yyyy-MM-dd");
                      query = query.gte("due_date", startOfMonth).lte("due_date", endOfMonth);
                    }

                    const { data } = await query
                      .order("due_date", { ascending: true })
                      .limit(10);
                    
                    return (data || []).map((d: any) => ({
                      value: JSON.stringify({ id: d.id, amount: d.amount, label: d.description }),
                      label: `${d.description}${d.core_entities?.display_name ? ` [${d.core_entities.display_name}]` : ""} - ${formatMoneyBRL(d.amount)} (${d.due_date})`
                    }));
                  }}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-3">
                    <Search className="h-4 w-4" />
                    Sugestões de correspondência
                  </h4>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    Valor Idêntico
                  </Badge>
                </div>

                <div className="grid gap-2">
                  {reconcileSuggestionsQ.isLoading ? (
                    <div className="py-8 text-center text-sm text-slate-500">Buscando correspondências...</div>
                  ) : (reconcileSuggestionsQ.data?.matches?.length ?? 0) > 0 ? (
                    reconcileSuggestionsQ.data.matches.map((match: any) => (
                      <div
                        key={match.id}
                        className="group flex items-center justify-between p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-[hsl(var(--byfrost-accent)/0.5)] hover:bg-[hsl(var(--byfrost-accent)/0.02)] transition-all cursor-pointer"
                        onClick={() => reconcileTxM.mutate({ linkedId: match.id, type: match.type })}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{match.description}</span>
                          <span className="text-xs text-slate-500 flex items-center gap-2">
                            Vencimento: {match.due_date} 
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full border",
                              match.days_diff === 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"
                            )}>
                              {match.days_diff === 0 ? "Mesma data" : `${match.days_diff} dias de diferença`}
                            </span>
                            {selectedTx && Math.abs(selectedTx.amount) > match.amount && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                                Diferença: {formatMoneyBRL(Math.abs(selectedTx.amount) - match.amount)}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{formatMoneyBRL(match.amount)}</span>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              const diff = Math.abs(selectedTx?.amount || 0) - match.amount;
                              if (diff > 0.01) {
                                setReconcileDiff(diff);
                                setReconcilePendingLink({ id: match.id, type: match.type });
                                setReconcilePendingLabel(match.description);
                                setReconcileAdjustmentCatId(null);
                              } else {
                                reconcileTxM.mutate({ linkedId: match.id, type: match.type });
                              }
                            }}
                          >
                            Vincular
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center py-6 px-4 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/30">
                      <div className="h-10 w-10 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center mb-3">
                        <Info className="h-5 w-5 text-slate-400" />
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Nenhuma conta pendente com valor de {formatMoneyBRL(selectedTx.amount)}.</p>
                      
                      <div className="mt-5 w-full max-w-[320px] p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                        <div className="mb-4">
                          <Label className="text-[10px] uppercase text-slate-500 block mb-1">Entidade (Cliente/Fornecedor)</Label>
                          <AsyncSelect
                            className="h-9 rounded-xl text-xs"
                            value={reconcileEntityId}
                            initialLabel={selectedTx?.core_entities?.display_name || null}
                            onChange={setReconcileEntityId}
                            onCreate={(val) => {
                              setQuickEntityName(val);
                              setQuickEntityTxId(reconcileTxId);
                              setQuickEntityOpen(true);
                            }}
                            placeholder="Buscar entidade..."
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
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <Checkbox 
                            id="dlg-recurrent" 
                            checked={reconcileIsRecurrent} 
                            onCheckedChange={(v) => setReconcileIsRecurrent(!!v)} 
                          />
                          <Label htmlFor="dlg-recurrent" className="text-xs cursor-pointer">Lançamento Recorrente</Label>
                        </div>
                        
                        {reconcileIsRecurrent && (
                          <div className="flex items-center justify-between gap-3">
                            <Label className="text-[10px] uppercase text-slate-500">Meses</Label>
                            <Input 
                              type="number" 
                              className="h-8 w-16 text-xs rounded-lg" 
                              value={reconcileInstallments} 
                              onChange={(e) => setReconcileInstallments(e.target.value)} 
                              min="2"
                              max="60"
                            />
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 justify-center">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="h-9 rounded-xl text-xs px-4"
                          onClick={() => selectedTx.type === 'debit' ? createLinkedPayableM.mutate(selectedTx) : createLinkedReceivableM.mutate(selectedTx)}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Criar e Vincular agora
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {reconcileDiff !== null && reconcilePendingLink && (
                <div className="absolute inset-0 bg-white/95 dark:bg-slate-950/95 z-20 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-200">
                  <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center mb-4">
                    <Info className="h-8 w-8" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">Diferença Detectada</h3>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                    Você está vinculando a <strong>{reconcilePendingLabel}</strong>.<br/>
                    O valor pago é maior em <strong className="text-emerald-600">{formatMoneyBRL(reconcileDiff)}</strong>.
                  </div>

                  <div className="w-full max-w-sm space-y-4 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-3xl border border-slate-200 dark:border-slate-800">
                    <div className="text-left">
                      <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block text-center">Classificar a diferença como:</Label>
                      <AsyncSelect
                        className="h-10 rounded-2xl"
                        value={reconcileAdjustmentCatId}
                        onChange={setReconcileAdjustmentCatId}
                        onCreate={(val) => {
                          setQuickCatName(val);
                          setQuickCatTxId(reconcileTxId);
                          setQuickCatOpen(true);
                        }}
                        placeholder="Selecione categoria (ex: Juros)..."
                        loadOptions={async (val) => {
                          if (!activeTenantId) return [];
                          const { data } = await supabase
                            .from("financial_categories")
                            .select("id, name")
                            .eq("tenant_id", activeTenantId)
                            .ilike("name", `%${val}%`)
                            .limit(10);
                          return (data || []).map((d) => ({ value: d.id, label: d.name }));
                        }}
                      />
                    </div>
                    
                    <div className="flex flex-col gap-2 pt-2">
                       <Button 
                        className="w-full h-11 rounded-2xl bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.9)]"
                        disabled={!reconcileAdjustmentCatId || reconcileTxM.isPending}
                        onClick={() => reconcileTxM.mutate({ 
                          linkedId: reconcilePendingLink.id, 
                          type: reconcilePendingLink.type,
                          adjustment: { amount: reconcileDiff, categoryId: reconcileAdjustmentCatId! }
                        })}
                      >
                        {reconcileTxM.isPending ? "Processando..." : "Confirmar Vínculo com Ajuste"}
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="w-full h-11 rounded-2xl text-slate-500"
                        onClick={() => {
                          setReconcileDiff(null);
                          setReconcilePendingLink(null);
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="ghost" className="h-10 rounded-2xl" onClick={() => setReconcileDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Create Entity Dialog */}
      <Dialog open={quickEntityOpen} onOpenChange={setQuickEntityOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Novo Cadastro Simplificado</DialogTitle>
            <DialogDescription>
              Cadastre rapidamente uma nova entidade para este lançamento.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="q-name">Nome de Exibição</Label>
              <Input
                id="q-name"
                value={quickEntityName}
                onChange={(e) => setQuickEntityName(e.target.value)}
                className="rounded-xl h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="q-subtype">Subtipo</Label>
              <Select value={quickEntitySubtype} onValueChange={setQuickEntitySubtype}>
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="fornecedor">Fornecedor</SelectItem>
                  <SelectItem value="indicador">Indicador</SelectItem>
                  <SelectItem value="banco">Banco</SelectItem>
                  <SelectItem value="pintor">Pintor</SelectItem>
                  <SelectItem value="servico">Serviço</SelectItem>
                  <SelectItem value="produto">Produto</SelectItem>
                  <SelectItem value="imovel">Imóvel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setQuickEntityOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => quickCreateEntityM.mutate()}
              disabled={!quickEntityName.trim() || quickCreateEntityM.isPending}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {quickCreateEntityM.isPending ? "Criando..." : "Cadastrar Entidade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Create Category Dialog */}
      <Dialog open={quickCatOpen} onOpenChange={setQuickCatOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Nova Categoria</DialogTitle>
            <DialogDescription>
              Crie uma nova categoria financeira para este lançamento.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="qc-name">Nome da Categoria</Label>
              <Input
                id="qc-name"
                value={quickCatName}
                onChange={(e) => setQuickCatName(e.target.value)}
                className="rounded-xl h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="qc-type">Tipo de Categoria</Label>
              <Select value={quickCatType} onValueChange={(v: any) => setQuickCatType(v)}>
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Receita</SelectItem>
                  <SelectItem value="cost">Custo Direto</SelectItem>
                  <SelectItem value="fixed">Custo Fixo</SelectItem>
                  <SelectItem value="variable">Custo Variável</SelectItem>
                  <SelectItem value="investment">Investimento</SelectItem>
                  <SelectItem value="financing">Financiamento</SelectItem>
                  <SelectItem value="other">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setQuickCatOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => quickCreateCategoryM.mutate()}
              disabled={!quickCatName.trim() || quickCreateCategoryM.isPending}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {quickCreateCategoryM.isPending ? "Criando..." : "Cadastrar Categoria"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Remapear Lançamentos (Ao excluir categoria) */}
      <Dialog 
        open={Boolean(categoryToDelete)} 
        onOpenChange={(v) => !v && setCategoryToDelete(null)}
      >
        <DialogContent className="sm:max-w-[425px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="h-5 w-5" />
              Remover Categoria
            </DialogTitle>
            <DialogDescription>
              Você está removendo a categoria <strong>{categoryToDelete?.name}</strong>. 
              Para qual categoria deseja mover os lançamentos existentes?
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label className="text-xs mb-2 block uppercase text-slate-500 font-bold">Categoria de Destino</Label>
            <AsyncSelect
              className="h-11 rounded-2xl"
              value={remappingTargetId}
              onChange={setRemappingTargetId}
              placeholder="Selecione a nova categoria..."
              loadOptions={async (val) => {
                if (!activeTenantId) return [];
                let query = supabase
                  .from("financial_categories")
                  .select("id, name")
                  .eq("tenant_id", activeTenantId)
                  .ilike("name", `%${val}%`);
                
                if (categoryToDelete?.id) {
                  query = query.neq("id", categoryToDelete.id);
                }

                const { data } = await query.limit(10);
                return (data || []).map((d) => ({ value: d.id, label: d.name }));
              }}
            />
            <p className="mt-4 text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
              <Info className="h-3 w-3 inline mr-1 mb-0.5" />
              Esta ação é permanente. Todos os lançamentos vinculados a "{categoryToDelete?.name}" serão atualizados para a nova categoria selecionada.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setCategoryToDelete(null)}
              className="rounded-2xl"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="rounded-2xl bg-rose-600 hover:bg-rose-700 font-bold"
              disabled={!remappingTargetId || deleteCategoryWithRemapM.isPending}
              onClick={() => deleteCategoryWithRemapM.mutate()}
            >
              {deleteCategoryWithRemapM.isPending ? "Processando..." : "Confirmar e Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}