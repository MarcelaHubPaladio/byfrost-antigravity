import React, { useEffect, useMemo, useState } from "react";
import { cn, formatMoneyBRL } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
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
import { addDays, subDays, addMonths, subMonths, format, parseISO, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Download, Landmark, Pencil, Plus, Upload, Link2, CheckCircle2, Search, Info, Trash2, X, ChevronRight, ChevronLeft, Calendar as CalendarIcon, UploadCloud, Network, CornerDownRight, Scissors } from "lucide-react";
import { AsyncSelect } from "@/components/ui/async-select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "react-router-dom";
import { useSession } from "@/providers/SessionProvider";

import { FinancialIngestionPanel } from "../FinancialIngestionPanel";
import { SplitTransactionModal } from "./SplitTransactionModal";

import { CategoryType, CATEGORY_LABELS, normalizeDescription, stripOuterQuotes, splitCsvLine, parseCategoryType, ParsedCategory, parseCategoryCsv, sha256Hex, parseMoneyInput, formatMoneyInput, prettyAccountType, currentMonthRangeIso } from "@/lib/financial-utils";
type BankAccountRow = {
  id: string;
  bank_name: string;
  account_name: string;
  account_type: string;
  currency: string;
};


function useSessionState<T>(key: string, initialValue: T | (() => T)) {
  const [state, setState] = useState<T>(() => {
    try {
      const item = sessionStorage.getItem(key);
      if (item !== null) return JSON.parse(item);
    } catch {
      // ignore
    }
    return typeof initialValue === "function" ? (initialValue as any)() : initialValue;
  });

  useEffect(() => {
    sessionStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);

  return [state, setState] as const;
}

export function TransactionsTab() {
  
  // Handle ?tab=dre in URL
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const qc = useQueryClient();

  const [txStartDate, setTxStartDate] = useSessionState("fin_tx_start", () => currentMonthRangeIso().start);
  const [txEndDate, setTxEndDate] = useSessionState("fin_tx_end", () => currentMonthRangeIso().end);

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
  const [filterEntityId, setFilterEntityId] = useSessionState<string | null>("fin_tx_entity", null);
  const [filterCategoryId, setFilterCategoryId] = useSessionState<string | null>("fin_tx_category", null);
  const [sortKey, setSortKey] = useSessionState<string | null>("fin_tx_sort_key", "transaction_date");
  const [sortDir, setSortDir] = useSessionState<"asc" | "desc">("fin_tx_sort_dir", "desc");
  const [txSearchText, setTxSearchText] = useSessionState("fin_tx_search", "");
  const [filterType, setFilterType] = useSessionState<string>("fin_tx_type", "all");

  const [learningModalOpen, setLearningModalOpen] = useState(false);
  const [learningData, setLearningData] = useState<{ id: string; description: string; categoryId: string; categoryName: string } | null>(null);

  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"category" | "entity" | "type" | null>(null);
  const [bulkActionValue, setBulkActionValue] = useState<string | null>(null);
  const [showIngestion, setShowIngestion] = useState(false);

  const [splitTxDialogOpen, setSplitTxDialogOpen] = useState(false);
  const [txToSplit, setTxToSplit] = useState<any>(null);

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
          "id,tenant_id,account_id,amount,type,description,transaction_date,status,source,fingerprint,category_id,created_at,entity_id,linked_payable_id,linked_receivable_id,invoice_number,core_entities(display_name),financial_categories(name),is_split,split_parent_id"
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

  const sortedTransactions = useMemo(() => {
    let data = [...(transactionsQ.data || [])];

    // 1. Filtering
    if (filterEntityId) {
      data = data.filter((t) => t.entity_id === filterEntityId);
    }
    if (filterCategoryId) {
      data = data.filter((t) => t.category_id === filterCategoryId);
    }
    if (filterType && filterType !== "all") {
      data = data.filter((t) => (t.type || "").toLowerCase().trim() === filterType);
    }
    
    if (txSearchText) {
      const q = txSearchText.toLowerCase();
      data = data.filter((t) => {
        const desc = (t.description || "").toLowerCase();
        const acc = accountById.get(t.account_id)?.account_name?.toLowerCase() || "";
        const cat = categoryById.get(t.category_id)?.name?.toLowerCase() || "";
        const ent = t.core_entities?.display_name?.toLowerCase() || "";
        return desc.includes(q) || acc.includes(q) || cat.includes(q) || ent.includes(q);
      });
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
  }, [transactionsQ.data, filterEntityId, filterCategoryId, filterType, sortKey, sortDir, txSearchText, accountById, categoryById]);

  const groupedTransactions = useMemo(() => {
    const mainTxs: any[] = [];
    const childrenMap = new Map<string, any[]>();
    
    sortedTransactions.forEach(t => {
      if (t.split_parent_id && sortedTransactions.some(p => p.id === t.split_parent_id)) {
        if (!childrenMap.has(t.split_parent_id)) childrenMap.set(t.split_parent_id, []);
        childrenMap.get(t.split_parent_id)!.push(t);
      } else {
        mainTxs.push(t);
      }
    });
    return { mainTxs, childrenMap };
  }, [sortedTransactions]);

  const selectedTxs = useMemo(() => {
    return sortedTransactions.filter((t) => selectedTxIds.has(t.id));
  }, [sortedTransactions, selectedTxIds]);

  const sumSelected = useMemo(() => {
    return selectedTxs.reduce((acc, t) => {
      if (t.is_split) return acc;
      const v = Number(t.amount) || 0;
      return (t.type || "").toLowerCase().trim() === "credit" ? acc + v : acc - v;
    }, 0);
  }, [selectedTxs]);

  const hasActiveFilters = Boolean(
    filterEntityId || 
    filterCategoryId || 
    (filterType && filterType !== "all") || 
    txSearchText
  );

  const clearFilters = () => {
    setFilterEntityId(null);
    setFilterCategoryId(null);
    setFilterType("all");
    setTxSearchText("");
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const handleDownloadCsv = () => {
    if (!sortedTransactions.length) {
      showError("Nenhuma transação para exportar.");
      return;
    }

    const headers = ["Data", "Descrição", "Entidade", "Conta", "Tipo", "Valor", "Categoria", "NFE"];
    const rows = sortedTransactions.map((t) => {
      const acc = accountById.get(t.account_id);
      return [
        t.transaction_date,
        t.description,
        t.core_entities?.display_name || "",
        acc?.account_name || "",
        t.type,
        t.amount.toFixed(2).replace(".", ","),
        t.financial_categories?.name || "",
        t.invoice_number || "",
      ];
    });

    const csvContent = [
      headers.join(";"),
      ...rows.map((row) =>
        row
          .map((cell) => {
            const val = String(cell ?? "");
            return `"${val.replace(/"/g, '""')}"`;
          })
          .join(";")
      ),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `lancamentos_${format(new Date(), "yyyy-MM-dd_HHmm")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleEdit = (t: any) => {
    setEditingTxId(t.id);
    setAccountId(t.account_id);
    setTxDate(t.transaction_date || "");
    setTxType(t.type as any);
    const formattedAmount = Number(t.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setAmount(formattedAmount);
    setTxDate(t.transaction_date);
    setDescription(t.description || "");
    setTxEntityId(t.entity_id || null);
    setCategoryId(t.category_id || "");
    setTxInvoiceNumber(t.invoice_number || "");
    setTxDialogOpen(true);
  };

  

  

  // Quick Create Dialogs
  const [quickEntityOpen, setQuickEntityOpen] = useState(false);
  const [quickEntityName, setQuickEntityName] = useState("");
  const [quickEntitySubtype, setQuickEntitySubtype] = useState("cliente");
  const [quickEntityTxId, setQuickEntityTxId] = useState<string | null>(null);

  const [quickCatOpen, setQuickCatOpen] = useState(false);
  const [quickCatName, setQuickCatName] = useState("");
  const [quickCatType, setQuickCatType] = useState<CategoryType>("variable");
  const [quickCatTxId, setQuickCatTxId] = useState<string | null>(null);

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
  // Manual transaction (modal)
  // --------------------------
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [accountId, setAccountId] = useState<string>("");
  const [txDate, setTxDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [txType, setTxType] = useState<"credit" | "debit">("debit");
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [txEntityId, setTxEntityId] = useState<string | null>(null);
  const [txInvoiceNumber, setTxInvoiceNumber] = useState("");
  const [editingTxId, setEditingTxId] = useState<string | null>(null);

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

      if (editingTxId) {
        const { error: updErr } = await supabase
          .from("financial_transactions")
          .update({
            account_id: accountId,
            amount: Number(n.toFixed(2)),
            type: txType,
            description: description.trim(),
            transaction_date: txDate,
            competence_date: txDate,
            category_id: categoryId || null,
            entity_id: txEntityId || null,
            invoice_number: txInvoiceNumber || null,
            fingerprint,
          })
          .eq("id", editingTxId)
          .eq("tenant_id", activeTenantId);
        if (updErr) throw updErr;
      } else {
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
          invoice_number: txInvoiceNumber || null,
        });
        if (insErr) throw insErr;
      }

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

      const msg = editingTxId ? `Atualizou o lançamento "${description}".` : `Criou o lançamento "${description}".`;
      const actionType = editingTxId ? "UPDATE_TRANSACTION" : "CREATE_TRANSACTION";
      const eventType = editingTxId ? "financial_transaction_updated" : "financial_transaction_created";

      await supabase.from("financial_logs").insert({
        tenant_id: activeTenantId,
        action_type: actionType,
        description: msg,
        metadata: { amount: n, description, categoryId },
        created_by: user?.id || null
      });

      await supabase.from("timeline_events").insert({
        tenant_id: activeTenantId,
        event_type: eventType,
        actor_type: user?.id ? "user" : "system",
        actor_id: user?.id || null,
        message: msg,
        meta_json: { amount: n, description, categoryId }
      });
    },
    onSuccess: async () => {
      showSuccess(editingTxId ? "Lançamento atualizado." : "Lançamento criado.");
      setAmount("");
      setDescription("");
      setCategoryId("");
      setCategoryTouched(false);
      setTxEntityId(null);
      setEntityTouched(false);
      setTxInvoiceNumber("");
      setEditingTxId(null);
      setTxDialogOpen(false);
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_cash_projection", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao salvar transação"),
  });

  const deleteTxM = useMutation({
    mutationFn: async (id: string) => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const { error } = await supabase
        .from("financial_transactions")
        .delete()
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;
      
      await supabase.from("financial_logs").insert({
        tenant_id: activeTenantId,
        action_type: "DELETE_TRANSACTION",
        description: `Excluiu a transação manualmente.`,
        metadata: { id },
        created_by: user?.id || null
      });

      await supabase.from("timeline_events").insert({
        tenant_id: activeTenantId,
        event_type: "financial_transaction_deleted",
        actor_type: user?.id ? "user" : "system",
        actor_id: user?.id || null,
        message: "Lançamento financeiro excluído.",
        meta_json: { id }
      });
    },
    onSuccess: async () => {
      showSuccess("Lançamento excluído.");
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_cash_projection", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao excluir lançamento"),
  });

  const bulkDeleteM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId || selectedTxIds.size === 0) return;
      const ids = Array.from(selectedTxIds);
      const { error } = await supabase
        .from("financial_transactions")
        .delete()
        .in("id", ids)
        .eq("tenant_id", activeTenantId);
      if (error) throw error;
      
      await supabase.from("financial_logs").insert({
        tenant_id: activeTenantId,
        action_type: "BULK_DELETE",
        description: `Excluiu em massa ${ids.length} transações.`,
        metadata: { ids },
        created_by: user?.id || null
      });

      await supabase.from("timeline_events").insert({
        tenant_id: activeTenantId,
        event_type: "financial_bulk_deleted",
        actor_type: user?.id ? "user" : "system",
        actor_id: user?.id || null,
        message: `Exclusão em massa de ${ids.length} lançamentos financeiros.`,
        meta_json: { ids }
      });
    },
    onSuccess: async () => {
      showSuccess("Lançamentos excluídos.");
      setSelectedTxIds(new Set());
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_cash_projection", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao excluir em massa"),
  });

  const bulkUpdateM = useMutation({
    mutationFn: async ({ field, value }: { field: "category_id" | "entity_id" | "type"; value: string | null }) => {
      if (!activeTenantId || selectedTxIds.size === 0) return;
      const ids = Array.from(selectedTxIds);
      const payload: any = {};
      payload[field] = value;
      
      const { error } = await supabase
        .from("financial_transactions")
        .update(payload)
        .in("id", ids)
        .eq("tenant_id", activeTenantId);
      if (error) throw error;

      await supabase.from("financial_logs").insert({
        tenant_id: activeTenantId,
        action_type: "BULK_UPDATE",
        description: `Atualizou o campo ${field} de ${ids.length} transações.`,
        metadata: { ids, field, value },
        created_by: user?.id || null
      });

      await supabase.from("timeline_events").insert({
        tenant_id: activeTenantId,
        event_type: "financial_bulk_updated",
        actor_type: user?.id ? "user" : "system",
        actor_id: user?.id || null,
        message: `Atualização em massa de ${ids.length} lançamentos financeiros.`,
        meta_json: { ids, field, value }
      });
    },
    onSuccess: async () => {
      showSuccess("Lançamentos atualizados.");
      setBulkAction(null);
      setBulkActionValue(null);
      setSelectedTxIds(new Set());
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_cash_projection", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao atualizar em massa"),
  });

  const updateTxCategoryM = useMutation({
    mutationFn: async ({ id, description, categoryId }: { id: string; description: string; categoryId: string }) => {
      if (!activeTenantId) throw new Error("Tenant inválido");

      const { error } = await supabase
        .from("financial_transactions")
        .update({ category_id: categoryId || null })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;

      await supabase.from("financial_logs").insert({
        tenant_id: activeTenantId,
        action_type: "UPDATE_CATEGORY",
        description: `Alterou manualmente a categoria da transação para "${description}".`,
        metadata: { id, category_id: categoryId },
        created_by: user?.id || null
      });

      await supabase.from("timeline_events").insert({
        tenant_id: activeTenantId,
        event_type: "financial_category_updated",
        actor_type: user?.id ? "user" : "system",
        actor_id: user?.id || null,
        message: `Categoria do lançamento "${description}" alterada.`,
        meta_json: { id, category_id: categoryId }
      });
    },
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      if (vars.categoryId) {
        const cat = categoryById.get(vars.categoryId);
        if (cat) {
          setLearningData({ id: vars.id, description: vars.description, categoryId: vars.categoryId, categoryName: cat.name });
          setLearningModalOpen(true);
        }
      }
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao atualizar categoria"),
  });

  const applyLearningRuleM = useMutation({
    mutationFn: async ({ description, categoryId }: { description: string; categoryId: string }) => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const descN = normalizeDescription(description);
      
      // 1. Insert Rule
      const { error: ruleErr } = await supabase.from("financial_category_rules").insert({
        tenant_id: activeTenantId,
        pattern: descN,
        category_id: categoryId,
        is_regex: false,
      });
      if (ruleErr) throw ruleErr;

      // 2. Apply to existing uncategorized
      const { data: uncategorized } = await supabase
        .from("financial_transactions")
        .select("id, description")
        .eq("tenant_id", activeTenantId)
        .is("category_id", null);

      if (uncategorized && uncategorized.length > 0) {
        const toUpdate = uncategorized.filter(u => normalizeDescription(u.description).includes(descN));
        if (toUpdate.length > 0) {
          const ids = toUpdate.map(u => u.id);
          await supabase
            .from("financial_transactions")
            .update({ category_id: categoryId })
            .in("id", ids)
            .eq("tenant_id", activeTenantId);
          
          await supabase.from("financial_logs").insert({
            tenant_id: activeTenantId,
            action_type: "LEARN_CATEGORY",
            description: `Criou uma regra de aprendizado para "${description}". Atualizou ${toUpdate.length} transações pendentes.`,
            metadata: { category_id: categoryId, pattern: descN, updated_count: toUpdate.length },
            created_by: user?.id || null
          });

          await supabase.from("timeline_events").insert({
            tenant_id: activeTenantId,
            event_type: "financial_learning_rule",
            actor_type: user?.id ? "user" : "system",
            actor_id: user?.id || null,
            message: `Regra financeira criada para "${description}". Atualizou ${toUpdate.length} transações.`,
            meta_json: { category_id: categoryId, pattern: descN, updated_count: toUpdate.length }
          });
          
          return toUpdate.length;
        }
      }
      return 0;
    },
    onSuccess: async (updatedCount) => {
      showSuccess(`Regra aprendida! ${updatedCount} transações antigas foram categorizadas automaticamente.`);
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      setLearningModalOpen(false);
    },
    onError: (e: any) => {
      showError(e?.message ?? "Erro ao salvar a regra");
      setLearningModalOpen(false);
    }
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

      await supabase.from("timeline_events").insert({
        tenant_id: activeTenantId,
        event_type: "financial_transaction_updated",
        actor_type: user?.id ? "user" : "system",
        actor_id: user?.id || null,
        message: `Entidade atrelada ao lançamento "${description}".`,
        meta_json: { id, entity_id: entityId }
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      showSuccess("Entidade atrelada e regra de aprendizado criada.");
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao atualizar entidade"),
  });

  const updateTxInvoiceM = useMutation({
    mutationFn: async ({ id, invoiceNumber }: { id: string; invoiceNumber: string }) => {
      if (!activeTenantId) throw new Error("Tenant inválido");

      const { error } = await supabase
        .from("financial_transactions")
        .update({ invoice_number: invoiceNumber || null })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      showSuccess("NFE atualizada.");
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao atualizar NFE"),
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
        const { data: adjData, error: adjErr } = await supabase.from(table).insert({
          tenant_id: activeTenantId,
          description: `Ajuste/Juros de conciliação (${reconcileTxId?.slice(0,8)})`,
          amount: Math.abs(adjustment.amount),
          due_date: selectedTx?.transaction_date,
          status: 'paid',
          category_id: adjustment.categoryId,
          entity_id: reconcileEntityId
        }).select('id').single();

        if (adjErr) {
          console.error("Falha ao criar ajuste:", adjErr);
        } else if (adjData) {
          // Link the adjustment to the transaction too
          const linkPayload: any = {
            tenant_id: activeTenantId,
            transaction_id: reconcileTxId,
            amount: Math.abs(adjustment.amount)
          };
          if (type === 'payable') linkPayload.payable_id = adjData.id;
          else linkPayload.receivable_id = adjData.id;

          await supabase.from("financial_reconciliation_links").insert(linkPayload);
        }
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

  if (showIngestion) {
    return (
      <div className="flex flex-col gap-4 animate-in fade-in duration-300">
        <div>
          <Button 
            variant="outline" 
            onClick={() => setShowIngestion(false)} 
            className="rounded-2xl flex items-center gap-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 shadow-sm"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar para Lançamentos
          </Button>
        </div>
        <FinancialIngestionPanel />
        <SplitTransactionModal 
        open={splitTxDialogOpen} 
        onOpenChange={setSplitTxDialogOpen} 
        transaction={txToSplit} 
      />
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Lançamentos</div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Lançamentos manuais com sugestão automática de categoria e aprendizado por correções.
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="h-9 rounded-2xl border border-slate-200/60 shadow-sm bg-white dark:bg-slate-950 dark:border-slate-800"
                onClick={() => setShowIngestion(true)}
              >
                <UploadCloud className="mr-2 h-4 w-4 text-indigo-500" />
                Importar Extratos
              </Button>

            <Dialog 
              open={txDialogOpen} 
              onOpenChange={(open) => {
                setTxDialogOpen(open);
                if (!open) {
                  setEditingTxId(null);
                  setAmount("");
                  setDescription("");
                  setTxInvoiceNumber("");
                  setTxEntityId(null);
                  setCategoryId("");
                  setCategoryTouched(false);
                  setEntityTouched(false);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button 
                  className="h-9 rounded-2xl" 
                  disabled={!activeTenantId}
                  onClick={() => {
                    setEditingTxId(null);
                    setTxDate(new Date().toISOString().slice(0, 10));
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Novo lançamento
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-hidden rounded-3xl p-0">
                <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                        <Pencil className="h-4 w-4" />
                      </div>
                      {editingTxId ? "Editar lançamento" : "Novo lançamento"}
                    </DialogTitle>
                    <DialogDescription className="pt-2">
                      Preencha os dados do lançamento. Se uma regra bater com a descrição, sugerimos automaticamente a categoria.
                    </DialogDescription>
                  </DialogHeader>
                </div>

                <ScrollArea className="h-[55vh] px-6 py-4 bg-slate-50/50 dark:bg-slate-900/20">
                  <div className="grid gap-5 md:grid-cols-6">
                    {/* Conta e Data */}
                    <div className="md:col-span-3 space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Conta Bancária</Label>
                      <Select value={accountId} onValueChange={setAccountId}>
                        <SelectTrigger className="h-10 rounded-2xl bg-white dark:bg-slate-950">
                          <SelectValue
                            placeholder={
                              accountsQ.isLoading
                                ? "Carregando…"
                                : !(accountsQ.data ?? []).length
                                  ? "Cadastre uma conta"
                                  : "Selecione a conta"
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

                    <div className="md:col-span-3 space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Data da Transação</Label>
                      <Input
                        className="h-10 rounded-2xl bg-white dark:bg-slate-950"
                        type="date"
                        value={txDate}
                        onChange={(e) => setTxDate(e.target.value)}
                      />
                    </div>

                    {/* Tipo e Valor */}
                    <div className="md:col-span-3 space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Natureza do Lançamento</Label>
                      <Select value={txType} onValueChange={(v) => setTxType(v as any)}>
                        <SelectTrigger className="h-10 rounded-2xl bg-white dark:bg-slate-950">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="debit">Saída (Despesa)</SelectItem>
                          <SelectItem value="credit">Entrada (Receita)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="md:col-span-3 space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Valor</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">R$</span>
                        <Input
                          className="h-10 pl-9 rounded-2xl bg-white dark:bg-slate-950 font-semibold text-slate-900 dark:text-slate-100"
                          placeholder="0,00"
                          value={amount}
                          onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className="md:col-span-6 border-t border-slate-200 dark:border-slate-800 my-1"></div>

                    {/* Descrição */}
                    <div className="md:col-span-4 space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Descrição</Label>
                      <Input 
                        className="h-10 rounded-2xl bg-white dark:bg-slate-950" 
                        placeholder="Ex: Compra de materiais..."
                        value={description} 
                        onChange={(e) => setDescription(e.target.value)} 
                      />
                    </div>

                    <div className="md:col-span-2 space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400">NFE / Comprovante</Label>
                      <Input 
                        className="h-10 rounded-2xl bg-white dark:bg-slate-950" 
                        placeholder="Nº da Nota" 
                        value={txInvoiceNumber} 
                        onChange={(e) => setTxInvoiceNumber(e.target.value)} 
                      />
                    </div>

                    {/* Categoria e Entidade */}
                    <div className="md:col-span-3 space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                        Categoria 
                        {suggested?.category_id && <Badge variant="secondary" className="h-4 text-[9px] px-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100">Sugerida</Badge>}
                      </Label>
                      <Select
                        value={categoryId}
                        onValueChange={(v) => {
                          setCategoryTouched(true);
                          setCategoryId(v);
                        }}
                      >
                        <SelectTrigger className="h-10 rounded-2xl bg-white dark:bg-slate-950">
                          <SelectValue placeholder={categoriesQ.isLoading ? "Carregando…" : "Selecione..."} />
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
                        <div className="text-[10px] font-medium text-slate-400">
                          Regra automática: "{suggested.pattern}"
                        </div>
                      ) : null}
                    </div>

                    <div className="md:col-span-3 space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                        Entidade 
                        {suggestedEntity?.entity_id && <Badge variant="secondary" className="h-4 text-[9px] px-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100">Sugerida</Badge>}
                      </Label>
                      <AsyncSelect
                        className="h-10 rounded-2xl bg-white dark:bg-slate-950"
                        value={txEntityId}
                        initialLabel={suggestedEntity?.label}
                        onChange={(v) => {
                          setEntityTouched(true);
                          setTxEntityId(v);
                        }}
                        onCreate={(val) => {
                          setQuickEntityName(val);
                          setQuickEntityTxId(null);
                          setQuickEntityOpen(true);
                        }}
                        placeholder="Buscar cliente/fornecedor..."
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
                        <div className="text-[10px] font-medium text-slate-400">
                          Regra automática: "{suggestedEntity.pattern}"
                        </div>
                      ) : null}
                    </div>
                  </div>
                </ScrollArea>

                <div className="p-4 bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800">
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" className="h-11 rounded-2xl font-medium" onClick={() => setTxDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      className="h-11 rounded-2xl px-8 bg-indigo-600 hover:bg-indigo-700 font-bold"
                      onClick={() => createTxM.mutate()}
                      disabled={!activeTenantId || createTxM.isPending || !accountId}
                    >
                      {createTxM.isPending ? "Processando…" : (editingTxId ? "Salvar Alterações" : "Concluir Lançamento")}
                    </Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {!(accountsQ.data ?? []).length && !accountsQ.isLoading ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200">
              Você ainda não tem contas bancárias cadastradas. Vá na aba <b>Bancos</b> para criar uma conta (isso é necessário
              para importação de extratos e lançamentos manuais).
            </div>
          ) : null}
        </Card>

        <Card className={cn(
          "rounded-[22px] p-4 shadow-sm backdrop-blur transition-all",
          hasActiveFilters ? "border-indigo-200 bg-indigo-50/30 dark:border-indigo-900/40 dark:bg-indigo-900/10" : "border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-950/40"
        )}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Transações
                {hasActiveFilters && (
                  <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[9px] font-black uppercase tracking-widest px-1.5 py-0">
                    Filtros Ativos
                  </Badge>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">Filtre por período (padrão: mês atual).</div>
              
              {/* Show which column filters are active */}
              {(filterEntityId || filterCategoryId) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {filterEntityId && (
                    <Badge variant="outline" className="bg-white border-indigo-200 text-indigo-700 text-[10px] font-bold gap-1 pr-1">
                      Entidade Específica
                      <button onClick={() => setFilterEntityId(null)} className="hover:bg-indigo-100 rounded-full p-0.5"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {filterCategoryId && (
                    <Badge variant="outline" className="bg-white border-indigo-200 text-indigo-700 text-[10px] font-bold gap-1 pr-1">
                      Categoria Específica
                      <button onClick={() => setFilterCategoryId(null)} className="hover:bg-indigo-100 rounded-full p-0.5"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              {hasActiveFilters && (
                <Button 
                  variant="ghost" 
                  className="h-9 rounded-2xl text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100 text-xs font-bold transition-all" 
                  onClick={clearFilters}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" /> Limpar Filtros
                </Button>
              )}
              <div className="relative">
                <Search className={cn("absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4", txSearchText ? "text-indigo-500" : "text-slate-400")} />
                <Input
                  className={cn(
                    "mt-1 h-9 w-[200px] rounded-2xl pl-9 transition-all",
                    txSearchText ? "border-indigo-300 bg-indigo-50/50 text-indigo-900 placeholder:text-indigo-400" : "bg-white dark:bg-slate-950"
                  )}
                  placeholder="Buscar lançamentos..."
                  value={txSearchText}
                  onChange={(e) => setTxSearchText(e.target.value)}
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className={cn(
                  "mt-1 h-9 w-[130px] rounded-2xl font-medium text-xs transition-all",
                  filterType !== "all" ? "border-indigo-300 bg-indigo-50/50 text-indigo-700" : "bg-white dark:bg-slate-950"
                )}>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="credit">Entradas (Crédito)</SelectItem>
                  <SelectItem value="debit">Saídas (Débito)</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="h-9 px-4 border border-slate-200/60 hover:border-slate-300 rounded-2xl text-xs font-bold text-slate-600 flex items-center gap-2 transition-all shadow-sm bg-slate-50 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-300"
                  >
                    <CalendarIcon className="h-4 w-4 text-indigo-500" />
                    {txStartDate ? (
                      txEndDate ? (
                        `${format(parseISO(txStartDate), "dd/MM/yyyy")} - ${format(parseISO(txEndDate), "dd/MM/yyyy")}`
                      ) : (
                        format(parseISO(txStartDate), "dd/MM/yyyy")
                      )
                    ) : (
                      "Todo Período"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-3xl border-slate-200 shadow-2xl overflow-hidden bg-white dark:bg-slate-950 dark:border-slate-800" align="end">
                  <div className="flex flex-col md:flex-row">
                    <div className="w-full md:w-48 border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-800 p-3 flex flex-col gap-1 bg-slate-50/50 dark:bg-slate-900/30">
                      {[
                        { label: "Hoje", get: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
                        { label: "Ontem", get: () => ({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) }) },
                        { label: "Últimos 7 dias", get: () => ({ from: startOfDay(subDays(new Date(), 7)), to: endOfDay(new Date()) }) },
                        { label: "Últimos 30 dias", get: () => ({ from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()) }) },
                        { label: "Mês Atual", get: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
                        { label: "Mês Passado", get: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
                        { label: "Todo Período", get: () => ({ from: undefined, to: undefined }) },
                      ].map((btn) => {
                        const range = btn.get();
                        const isMatch = (range.from ? format(range.from, "yyyy-MM-dd") : "") === txStartDate && 
                                        (range.to ? format(range.to, "yyyy-MM-dd") : "") === txEndDate;
                        return (
                          <Button
                            key={btn.label}
                            variant="ghost"
                            className={cn(
                              "h-10 justify-start rounded-full text-[10px] font-black uppercase tracking-widest transition-all text-left px-4",
                              isMatch ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-2 border-slate-900 dark:border-slate-100 shadow-sm" : "text-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:text-indigo-600 border-2 border-transparent"
                            )}
                            onClick={() => {
                              setTxStartDate(range.from ? format(range.from, "yyyy-MM-dd") : "");
                              setTxEndDate(range.to ? format(range.to, "yyyy-MM-dd") : "");
                            }}
                          >
                            {btn.label}
                          </Button>
                        );
                      })}
                    </div>
                    <div className="p-2">
                      <CalendarComponent
                        initialFocus
                        mode="range"
                        defaultMonth={txStartDate ? parseISO(txStartDate) : new Date()}
                        selected={{ 
                          from: txStartDate ? parseISO(txStartDate) : undefined, 
                          to: txEndDate ? parseISO(txEndDate) : undefined 
                        }}
                        onSelect={(range: any) => {
                          if (range?.from) setTxStartDate(format(range.from, "yyyy-MM-dd"));
                          if (range?.to) setTxEndDate(format(range.to, "yyyy-MM-dd"));
                        }}
                        numberOfMonths={2}
                        locale={ptBR}
                        className="rounded-2xl"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="secondary" className="h-9 rounded-2xl" onClick={() => transactionsQ.refetch()}>
                Atualizar
              </Button>
              <Button
                variant="outline"
                className="h-9 rounded-2xl border-emerald-600/20 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                onClick={handleDownloadCsv}
              >
                <Download className="mr-2 h-4 w-4" />
                Baixar CSV
              </Button>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 dark:bg-slate-900/20">
                  <TableHead className="w-[40px] px-3">
                    <Checkbox 
                      checked={sortedTransactions.length > 0 && selectedTxIds.size === sortedTransactions.length}
                      onCheckedChange={(val) => {
                        if (val) {
                          setSelectedTxIds(new Set(sortedTransactions.map(t => t.id)));
                        } else {
                          setSelectedTxIds(new Set());
                        }
                      }}
                    />
                  </TableHead>
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
                  <TableHead className="w-[100px]">NFE</TableHead>
                  <TableHead className="w-[120px]">Conciliação</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactionsQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-slate-600 dark:text-slate-400">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : transactionsQ.isSuccess ? (
                  groupedTransactions.mainTxs.map((t) => {
                    const acc = accountById.get(t.account_id);
                    const cat = t.category_id ? categoryById.get(t.category_id) : null;
                    const children = groupedTransactions.childrenMap.get(t.id) || [];
                    return (
                      <React.Fragment key={t.id}>
                      <TableRow className={cn("group", t.is_split && "bg-slate-50/50 opacity-80")}>
                        <TableCell className="w-[40px] px-3">
                          <Checkbox
                            checked={selectedTxIds.has(t.id)}
                            onCheckedChange={(val) => {
                              const s = new Set(selectedTxIds);
                              if (val) s.add(t.id);
                              else s.delete(t.id);
                              setSelectedTxIds(s);
                            }}
                          />
                        </TableCell>
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
                        <TableCell className="w-[80px] text-[11px] font-medium text-slate-900 dark:text-slate-100">
                          {(t.type || "").toLowerCase().trim() === 'credit' ? 'Entrada' : (t.type || "").toLowerCase().trim() === 'debit' ? 'Saída' : t.type}
                        </TableCell>
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
                        <TableCell className="w-[100px]">
                          <Input
                            className="h-8 rounded-xl text-[11px]"
                            placeholder="NFE..."
                            defaultValue={t.invoice_number ?? ""}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val !== (t.invoice_number ?? "")) {
                                updateTxInvoiceM.mutate({ id: t.id, invoiceNumber: val });
                              }
                            }}
                          />
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
                        <TableCell className="w-[100px]">
                          <div className="flex justify-end gap-1">
                            {!t.is_split && !t.split_parent_id && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 rounded-lg text-slate-400 hover:text-indigo-600"
                                      onClick={() => {
                                        setTxToSplit(t);
                                        setSplitTxDialogOpen(true);
                                      }}
                                    >
                                      <Scissors className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Dividir Lançamento</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-lg text-slate-400 hover:text-indigo-600"
                              onClick={() => handleEdit(t)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-2xl">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Você tem certeza? Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="rounded-xl bg-rose-600 hover:bg-rose-700"
                                    onClick={() => deleteTxM.mutate(t.id)}
                                  >
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                      {children.map(child => {
                        const childCat = child.category_id ? categoryById.get(child.category_id) : null;
                        return (
                          <TableRow key={child.id} className="group bg-slate-50/40">
                            <TableCell className="w-[40px] px-3"></TableCell>
                            <TableCell className="w-[110px] whitespace-nowrap pl-6">
                              <div className="flex items-center gap-1.5 text-slate-400">
                                <CornerDownRight className="h-4 w-4" />
                                <span className="text-[11px] font-medium">{child.transaction_date}</span>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[300px]">
                              <div className="truncate font-medium text-slate-600 text-xs" title={child.description}>{child.description ?? "—"}</div>
                            </TableCell>
                            <TableCell className="w-[180px]">
                               <div className="text-[11px] text-slate-600 font-medium">
                                 {child.core_entities?.display_name ?? "—"}
                               </div>
                            </TableCell>
                            <TableCell className="w-[140px]"><span className="text-[10px] text-slate-400">Pai: {t.id.slice(0, 8)}...</span></TableCell>
                            <TableCell className="w-[80px]">
                              <Badge variant="outline" className={cn("text-[9px] uppercase font-black px-1.5 py-0", child.type === "credit" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-rose-700 bg-rose-50 border-rose-200")}>
                                {child.type === "credit" ? "Entrada" : "Saída"}
                              </Badge>
                            </TableCell>
                            <TableCell className="w-[110px] text-right font-bold text-xs text-slate-700">
                              {child.type === "credit" ? "+" : "-"} {formatMoneyBRL(child.amount)}
                            </TableCell>
                            <TableCell className="w-[180px]">
                               <div className="text-[11px] text-slate-600 font-medium">
                                 {childCat?.name ?? "—"}
                               </div>
                            </TableCell>
                            <TableCell className="w-[100px]"></TableCell>
                            <TableCell className="w-[120px]"></TableCell>
                            <TableCell className="w-[100px]">
                               <div className="flex justify-end gap-1">
                                 <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-400 hover:text-indigo-600" onClick={() => handleEdit(child)}>
                                   <Pencil className="h-3.5 w-3.5" />
                                 </Button>
                                 <AlertDialog>
                                   <AlertDialogTrigger asChild>
                                     <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-600">
                                       <Trash2 className="h-3.5 w-3.5" />
                                     </Button>
                                   </AlertDialogTrigger>
                                   <AlertDialogContent className="rounded-2xl">
                                     <AlertDialogHeader><AlertDialogTitle>Excluir parcela?</AlertDialogTitle><AlertDialogDescription>Deseja excluir esta parcela dividida? A soma das partes pode ficar inválida.</AlertDialogDescription></AlertDialogHeader>
                                     <AlertDialogFooter><AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel><AlertDialogAction className="rounded-xl bg-rose-600 hover:bg-rose-700" onClick={() => deleteTxM.mutate(child.id)}>Excluir</AlertDialogAction></AlertDialogFooter>
                                   </AlertDialogContent>
                                 </AlertDialog>
                               </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      </React.Fragment>
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

          <Dialog open={learningModalOpen} onOpenChange={setLearningModalOpen}>
            <DialogContent className="sm:max-w-[425px] rounded-3xl">
              <DialogHeader>
                <DialogTitle>Aprender Categorização</DialogTitle>
                <DialogDescription>
                  Você acabou de categorizar a transação "{learningData?.description}" como "{learningData?.categoryName}".
                  Deseja criar uma regra para que o sistema categorize automaticamente transações semelhantes no futuro e aplique aos lançamentos pendentes?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLearningModalOpen(false)} className="rounded-xl">Não, apenas desta vez</Button>
                <Button 
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white" 
                  onClick={() => learningData && applyLearningRuleM.mutate({ description: learningData.description, categoryId: learningData.categoryId })}
                  disabled={applyLearningRuleM.isPending}
                >
                  {applyLearningRuleM.isPending ? "Aplicando..." : "Sim, criar regra"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>
      </div>

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
                <div className="flex items-center justify-between px-1">
                  <div className="flex flex-col">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
                      <Search className="h-4 w-4 text-[hsl(var(--byfrost-accent))]" />
                      Sugestões de correspondência
                    </h4>
                    <p className="text-[10px] text-slate-500 font-medium">Buscamos lançamentos que batem com o valor e data</p>
                  </div>
                </div>

                <div className="grid gap-3 p-1">
                  {reconcileSuggestionsQ.isLoading ? (
                    <div className="flex flex-col items-center py-10 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 animate-pulse">
                      <div className="w-8 h-8 rounded-full border-2 border-[hsl(var(--byfrost-accent))] border-t-transparent animate-spin mb-3" />
                      <div className="text-xs text-slate-500 font-medium">Analisando registros...</div>
                    </div>
                  ) : reconcileSuggestionsQ.isError ? (
                    <div className="py-4 px-4 text-center rounded-2xl border border-rose-100 bg-rose-50/50 text-rose-600 text-xs">
                      Erro ao buscar sugestões. Tente a busca manual abaixo.
                    </div>
                  ) : (reconcileSuggestionsQ.data?.matches?.length ?? 0) > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 text-[10px] font-bold text-emerald-600 uppercase tracking-tight w-fit animate-in fade-in zoom-in">
                        <CheckCircle2 className="h-3 w-3" />
                        {reconcileSuggestionsQ.data.matches.length} Correspondência{reconcileSuggestionsQ.data.matches.length > 1 ? 's' : ''} Encontrada{reconcileSuggestionsQ.data.matches.length > 1 ? 's' : ''}
                      </div>
                      
                      {reconcileSuggestionsQ.data.matches.map((match: any) => (
                        <div
                          key={match.id}
                          className="group relative flex items-center justify-between p-4 rounded-[24px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-[hsl(var(--byfrost-accent)/0.5)] hover:bg-[hsl(var(--byfrost-accent)/0.02)] hover:shadow-lg hover:shadow-[hsl(var(--byfrost-accent)/0.05)] transition-all cursor-pointer overflow-hidden"
                          onClick={() => reconcileTxM.mutate({ linkedId: match.id, type: match.type })}
                        >
                          <div className={cn(
                            "absolute left-0 top-0 bottom-0 w-1.5 transition-all",
                            match.days_diff === 0 ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"
                          )} />
                          <div className="flex flex-col pl-2">
                            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{match.description}</span>
                            <span className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                              {match.due_date} 
                              <Badge variant="outline" className={cn(
                                "text-[9px] py-0 px-1.5 h-4 border-slate-200",
                                match.days_diff === 0 ? "text-emerald-600 bg-emerald-50 border-emerald-100" : "text-slate-500"
                              )}>
                                {match.days_diff === 0 ? "Data exata" : `${match.days_diff}d de dif.`}
                              </Badge>
                            </span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{formatMoneyBRL(match.amount)}</span>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                              Conciliar <ChevronRight className="h-3 w-3" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-8 px-4 text-center rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20">
                      <div className="p-3 rounded-full bg-slate-50 dark:bg-slate-900 text-slate-400 mb-2">
                        <Link2 className="h-5 w-5" />
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">Nenhuma sugestão automática para este valor.<br/>Use a busca manual abaixo.</p>
                    </div>
                  )}

                  <div className="relative pt-2">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
                      <span className="bg-white px-2 text-slate-400 dark:bg-slate-950">Ou crie um novo registro</span>
                    </div>
                  </div>

                  <div className="grid gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/10">
                    <div>
                      <Label className="text-[10px] uppercase text-slate-500 font-bold block mb-1.5">Entidade (Cliente/Fornecedor)</Label>
                      <AsyncSelect
                        className="h-10 rounded-xl"
                        value={reconcileEntityId}
                        initialLabel={selectedTx?.core_entities?.display_name || null}
                        onChange={setReconcileEntityId}
                        onCreate={(val) => {
                          setQuickEntityName(val);
                          setQuickEntityTxId(reconcileTxId);
                          setQuickEntityOpen(true);
                        }}
                        placeholder="Pesquisar..."
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

                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Checkbox 
                          id="dlg-recurrent" 
                          checked={reconcileIsRecurrent} 
                          onCheckedChange={(v) => setReconcileIsRecurrent(!!v)} 
                        />
                        <Label htmlFor="dlg-recurrent" className="text-xs cursor-pointer">Recorrente</Label>
                      </div>
                      
                      {reconcileIsRecurrent && (
                        <div className="flex items-center gap-2">
                          <Label className="text-[10px] uppercase text-slate-500 font-bold">Parcelas</Label>
                          <Input 
                            type="number" 
                            className="h-8 w-14 text-xs rounded-lg" 
                            value={reconcileInstallments} 
                            onChange={(e) => setReconcileInstallments(e.target.value)} 
                            min="2"
                            max="60"
                          />
                        </div>
                      )}
                    </div>

                    <Button 
                      variant="secondary" 
                      className="w-full h-10 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 border-slate-200 dark:bg-slate-950 dark:hover:bg-slate-900 dark:border-slate-800"
                      onClick={() => selectedTx.type === 'debit' ? createLinkedPayableM.mutate(selectedTx) : createLinkedReceivableM.mutate(selectedTx)}
                      disabled={createLinkedPayableM.isPending || createLinkedReceivableM.isPending}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Criar Lançamento e Conciliar
                    </Button>
                  </div>
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

      {/* Bulk Action Bar */}
      {selectedTxIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 dark:bg-slate-100/95 text-slate-100 dark:text-slate-900 rounded-2xl p-3 shadow-2xl flex items-center gap-3 md:gap-5 backdrop-blur animate-in slide-in-from-bottom-5 border border-slate-700 dark:border-slate-300">
          <div className="text-sm whitespace-nowrap px-2">
            <span className="font-bold">{selectedTxIds.size}</span> selecionadas
            <span className="mx-3 text-slate-600 dark:text-slate-400">|</span>
            Soma: <span className="font-bold text-emerald-400 dark:text-emerald-600">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(sumSelected)}</span>
          </div>
          <div className="w-[1px] h-6 bg-slate-700 dark:bg-slate-300" />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="hover:bg-slate-800 dark:hover:bg-slate-200 text-xs rounded-xl" onClick={() => setBulkAction("category")}>Categoria</Button>
            <Button variant="ghost" size="sm" className="hover:bg-slate-800 dark:hover:bg-slate-200 text-xs rounded-xl" onClick={() => setBulkAction("entity")}>Entidade</Button>
            <Button variant="ghost" size="sm" className="hover:bg-slate-800 dark:hover:bg-slate-200 text-xs rounded-xl" onClick={() => setBulkAction("type")}>Tipo</Button>
            <div className="w-[1px] h-4 mx-1 bg-slate-700 dark:bg-slate-300" />
            <Button variant="ghost" size="sm" className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 dark:text-rose-600 dark:hover:text-rose-700 dark:hover:bg-rose-100 text-xs rounded-xl" onClick={() => bulkDeleteM.mutate()}>Excluir</Button>
            <Button variant="ghost" size="sm" className="ml-2 h-7 w-7 p-0 rounded-full hover:bg-slate-800 dark:hover:bg-slate-200" onClick={() => setSelectedTxIds(new Set())}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Action Dialog */}
      <Dialog open={bulkAction !== null} onOpenChange={(val) => { if (!val) { setBulkAction(null); setBulkActionValue(null); } }}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Alteração em Massa</DialogTitle>
            <DialogDescription>
              Atualizando {selectedTxIds.size} lançamentos selecionados.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {bulkAction === "category" && (
              <div className="grid gap-2">
                <Label>Nova Categoria</Label>
                <AsyncSelect
                  className="h-11 rounded-xl"
                  value={bulkActionValue}
                  onChange={setBulkActionValue}
                  placeholder="Selecione a categoria"
                  loadOptions={async (val) => {
                    if (!activeTenantId) return [];
                    const query = supabase
                      .from("financial_categories")
                      .select("id, name, type")
                      .eq("tenant_id", activeTenantId)
                      .order("name", { ascending: true })
                      .limit(20);
                    if (val.trim()) query.ilike("name", `%${val}%`);
                    const { data } = await query;
                    return (data || []).map((c) => ({ value: c.id, label: `${c.name} (${c.type})` }));
                  }}
                />
              </div>
            )}
            {bulkAction === "entity" && (
              <div className="grid gap-2">
                <Label>Nova Entidade</Label>
                <AsyncSelect
                  className="h-11 rounded-xl"
                  value={bulkActionValue}
                  onChange={setBulkActionValue}
                  placeholder="Selecione a entidade"
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
            )}
            {bulkAction === "type" && (
              <div className="grid gap-2">
                <Label>Novo Tipo</Label>
                <Select value={bulkActionValue || undefined} onValueChange={setBulkActionValue}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Entrada (Crédito)</SelectItem>
                    <SelectItem value="debit">Saída (Débito)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkAction(null)} className="rounded-xl">
              Cancelar
            </Button>
            <Button
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
              disabled={!bulkActionValue || bulkUpdateM.isPending}
              onClick={() => {
                if (bulkAction && bulkActionValue) {
                  const field = bulkAction === "category" ? "category_id" : bulkAction === "entity" ? "entity_id" : "type";
                  bulkUpdateM.mutate({ field, value: bulkActionValue });
                }
              }}
            >
              {bulkUpdateM.isPending ? "Atualizando..." : "Aplicar a Todos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SplitTransactionModal 
        open={splitTxDialogOpen} 
        onOpenChange={setSplitTxDialogOpen} 
        transaction={txToSplit} 
      />
    </>
  );
}