import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { showError, showSuccess } from "@/utils/toast";
import { Checkbox } from "@/components/ui/checkbox";
import { addDays, addMonths, endOfMonth, format, startOfMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AsyncSelect } from "@/components/ui/async-select";
import { Pencil, Trash2, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Wallet, Link2Off, ExternalLink, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  type: "revenue" | "cost" | "fixed" | "variable" | "investment" | "financing" | "other";
};

const CATEGORY_LABELS: Record<CategoryRow["type"], string> = {
  revenue: "Receita",
  cost: "Custo Direto",
  fixed: "Custo Fixo",
  variable: "Custo Variável",
  investment: "Investimento",
  financing: "Financiamento",
  other: "Outros",
};

function parseMoneyInput(v: string) {
  const t = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function formatDescriptionWithInstallment(desc: string, current: number | null, total: number | null) {
  if (!total || !current) return desc;
  const suffix = `(${current}/${total})`;
  if (desc.includes(suffix)) return desc;
  // Remove existing (X/Y) if any, then append
  const cleanDesc = desc.replace(/\s*\(\d+\/\d+\)\s*$/, "").trim();
  return `${cleanDesc} (${current}/${total})`;
}

function formatMoneyBRL(n: number | null | undefined) {
  const x = Number(n ?? 0);
  try {
    return x.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${x.toFixed(2)}`;
  }
}

export function FinancialPlanningPanel() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  // Filters state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("receivables");

  const monthStart = format(startOfMonth(selectedDate), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(selectedDate), "yyyy-MM-dd");

  const bankAccountsQ = useQuery({
    queryKey: ["bank_accounts", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, bank_name, account_name")
        .eq("tenant_id", activeTenantId!)
        .order("bank_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const categoriesQ = useQuery({
    queryKey: ["financial_categories", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_categories")
        .select("id,name,parent_id,type")
        .eq("tenant_id", activeTenantId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
  });

  const budgetsQ = useQuery({
    queryKey: ["financial_budgets", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_budgets")
        .select("id,tenant_id,category_id,expected_amount,recurrence,due_day,scenario,created_at")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const receivablesQ = useQuery({
    queryKey: ["financial_receivables", activeTenantId, monthStart, monthEnd, selectedAccountId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let query = supabase
        .from("financial_receivables")
        .select(`
          id,tenant_id,description,amount,due_date,status,entity_id,account_id,category_id,
          recurrence_group_id,installment_number,installments_total,
          core_entities(display_name),
          financial_categories(name),
          financial_transactions!financial_transactions_receivable_fk(
            id,transaction_date,description,amount,category_id,
            financial_categories(name)
          ),
          financial_reconciliation_links(
            id, amount,
            financial_transactions(id, transaction_date, description, amount)
          )
        `)
        .eq("tenant_id", activeTenantId!)
        .gte("due_date", monthStart)
        .lte("due_date", monthEnd)
        .order("due_date", { ascending: true });
      
      if (selectedAccountId !== "all") {
        query = query.eq("account_id", selectedAccountId);
      }

      const { data, error } = await query.limit(400);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const payablesQ = useQuery({
    queryKey: ["financial_payables", activeTenantId, monthStart, monthEnd, selectedAccountId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let query = supabase
        .from("financial_payables")
        .select(`
          id,tenant_id,description,amount,due_date,status,entity_id,account_id,category_id,
          recurrence_group_id,installment_number,installments_total,
          core_entities(display_name),
          financial_categories(name),
          financial_transactions!financial_transactions_payable_fk(
            id,transaction_date,description,amount,category_id,
            financial_categories(name)
          ),
          financial_reconciliation_links(
            id, amount,
            financial_transactions(id, transaction_date, description, amount)
          )
        `)
        .eq("tenant_id", activeTenantId!)
        .gte("due_date", monthStart)
        .lte("due_date", monthEnd)
        .order("due_date", { ascending: true });

      if (selectedAccountId !== "all") {
        query = query.eq("account_id", selectedAccountId);
      }

      const { data, error } = await query.limit(400);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const startingBalanceQ = useQuery({
    queryKey: ["financial_starting_balance", activeTenantId, monthStart, selectedAccountId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("financial_get_balance_at_date", {
        p_tenant_id: activeTenantId!,
        p_date: monthStart,
        p_account_id: selectedAccountId === "all" ? null : selectedAccountId
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  const projectionQ = useQuery({
    queryKey: ["financial_cash_projection", activeTenantId],
    enabled: Boolean(activeTenantId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("financial_cash_projection", {
        p_tenant_id: activeTenantId!,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const categoryById = useMemo(() => {
    const m = new Map<string, CategoryRow>();
    for (const c of categoriesQ.data ?? []) m.set(c.id, c);
    return m;
  }, [categoriesQ.data]);

  // ----------------------
  // Create budget
  // ----------------------
  const [budgetCategoryId, setBudgetCategoryId] = useState<string>("");
  const [budgetExpectedAmount, setBudgetExpectedAmount] = useState<string>("");
  const [budgetRecurrence, setBudgetRecurrence] = useState<string>("monthly");
  const [budgetDueDay, setBudgetDueDay] = useState<string>("");
  const [budgetScenario, setBudgetScenario] = useState<string>("base");

  const createBudgetM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      if (!budgetCategoryId) throw new Error("Selecione uma categoria");
      const expected = parseMoneyInput(budgetExpectedAmount);
      if (!Number.isFinite(expected)) throw new Error("Valor esperado inválido");

      const dueDay = budgetDueDay.trim() ? Number(budgetDueDay) : null;
      if (dueDay != null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) {
        throw new Error("Dia de vencimento inválido (1-31)");
      }

      const { error } = await supabase.from("financial_budgets").insert({
        tenant_id: activeTenantId,
        category_id: budgetCategoryId,
        expected_amount: Number(expected.toFixed(2)),
        recurrence: budgetRecurrence,
        due_day: dueDay,
        scenario: budgetScenario || "base",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      showSuccess("Orçamento cadastrado.");
      setBudgetExpectedAmount("");
      setBudgetDueDay("");
      await qc.invalidateQueries({ queryKey: ["financial_budgets", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao cadastrar orçamento"),
  });

  // ----------------------
  // Create receivable/payable
  // ----------------------
  const [recvDesc, setRecvDesc] = useState<string>("");
  const [recvAmount, setRecvAmount] = useState<string>("");
  const [recvDueDate, setRecvDueDate] = useState<string>("");
  const [recvStatus, setRecvStatus] = useState<string>("pending");
  const [recvType, setRecvType] = useState<"single" | "recurrent" | "installments">("single");
  const [recvInstallments, setRecvInstallments] = useState("12");
  const [recvAccountId, setRecvAccountId] = useState<string | null>(null);
  const [recvEntityId, setRecvEntityId] = useState<string | null>(null);

  const [recvPreviewItems, setRecvPreviewItems] = useState<any[]>([]);
  const [showRecvPreview, setShowRecvPreview] = useState(false);

  const generateRecvPreview = () => {
    const amt = parseMoneyInput(recvAmount);
    if (!recvDesc.trim()) return showError("Descrição obrigatória");
    if (!Number.isFinite(amt)) return showError("Valor inválido");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recvDueDate)) return showError("Data inválida");

    const count = recvType === "single" ? 1 : parseInt(recvInstallments) || 1;
    const baseDate = new Date(`${recvDueDate}T12:00:00`);
    const items = [];

    for (let i = 0; i < count; i++) {
      let itemDate;
      if (recvType === "recurrent") {
        itemDate = addMonths(baseDate, i);
      } else if (recvType === "installments") {
        itemDate = addDays(baseDate, i * 30);
      } else {
        itemDate = baseDate;
      }
      
      const installmentNum = recvType !== "single" ? i + 1 : null;
      const totalNum = recvType !== "single" ? count : null;
      
      items.push({
        description: formatDescriptionWithInstallment(recvDesc, installmentNum, totalNum),
        amount: Number(amt.toFixed(2)),
        due_date: format(itemDate, "yyyy-MM-dd"),
        installment_number: installmentNum,
        installments_total: totalNum
      });
    }
    setRecvPreviewItems(items);
    setShowRecvPreview(true);
  };

  const createReceivableM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const amt = parseMoneyInput(recvAmount);
      if (!recvDesc.trim()) throw new Error("Descrição obrigatória");
      if (!Number.isFinite(amt)) throw new Error("Valor inválido");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(recvDueDate)) throw new Error("Data inválida");

      const groupId = recvType !== "single" ? crypto.randomUUID() : null;
      
      const items = recvPreviewItems.map(item => ({
        tenant_id: activeTenantId,
        description: item.description,
        amount: item.amount,
        due_date: item.due_date,
        status: recvStatus,
        recurrence_group_id: groupId,
        installment_number: item.installment_number,
        installments_total: item.installments_total,
        entity_id: recvEntityId,
        account_id: recvAccountId
      }));

      const { error } = await supabase.from("financial_receivables").insert(items);
      if (error) throw error;
    },
    onSuccess: async () => {
      showSuccess("Recebível cadastrado.");
      setRecvDesc("");
      setRecvAmount("");
      setRecvDueDate("");
      setRecvPreviewItems([]);
      setShowRecvPreview(false);
      await qc.invalidateQueries({ queryKey: ["financial_receivables", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_cash_projection", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao cadastrar recebível"),
  });

  const [payDesc, setPayDesc] = useState<string>("");
  const [payAmount, setPayAmount] = useState<string>("");
  const [payDueDate, setPayDueDate] = useState<string>("");
  const [payStatus, setPayStatus] = useState<string>("pending");
  const [payType, setPayType] = useState<"single" | "recurrent" | "installments">("single");
  const [payInstallments, setPayInstallments] = useState("12");
  const [payAccountId, setPayAccountId] = useState<string | null>(null);
  const [payEntityId, setPayEntityId] = useState<string | null>(null);

  const [payPreviewItems, setPayPreviewItems] = useState<any[]>([]);
  const [showPayPreview, setShowPayPreview] = useState(false);

  const generatePayPreview = () => {
    const amt = parseMoneyInput(payAmount);
    if (!payDesc.trim()) return showError("Descrição obrigatória");
    if (!Number.isFinite(amt)) return showError("Valor inválido");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payDueDate)) return showError("Data inválida");

    const count = payType === "single" ? 1 : parseInt(payInstallments) || 1;
    const baseDate = new Date(`${payDueDate}T12:00:00`);
    const items = [];

    for (let i = 0; i < count; i++) {
      let itemDate;
      if (payType === "recurrent") {
        itemDate = addMonths(baseDate, i);
      } else if (payType === "installments") {
        itemDate = addDays(baseDate, i * 30);
      } else {
        itemDate = baseDate;
      }
      
      const installmentNum = payType !== "single" ? i + 1 : null;
      const totalNum = payType !== "single" ? count : null;

      items.push({
        description: formatDescriptionWithInstallment(payDesc, installmentNum, totalNum),
        amount: Number(amt.toFixed(2)),
        due_date: format(itemDate, "yyyy-MM-dd"),
        installment_number: installmentNum,
        installments_total: totalNum
      });
    }
    setPayPreviewItems(items);
    setShowPayPreview(true);
  };

  const createPayableM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const amt = parseMoneyInput(payAmount);
      if (!payDesc.trim()) throw new Error("Descrição obrigatória");
      if (!Number.isFinite(amt)) throw new Error("Valor inválido");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payDueDate)) throw new Error("Data inválida");

      const groupId = payType !== "single" ? crypto.randomUUID() : null;

      const items = payPreviewItems.map(item => ({
        tenant_id: activeTenantId,
        description: formatDescriptionWithInstallment(item.description, item.installment_number, item.installments_total),
        amount: item.amount,
        due_date: item.due_date,
        status: payStatus,
        recurrence_group_id: groupId,
        installment_number: item.installment_number,
        installments_total: item.installments_total,
        entity_id: payEntityId,
        account_id: payAccountId
      }));

      const { error } = await supabase.from("financial_payables").insert(items);
      if (error) throw error;
    },
    onSuccess: async () => {
      showSuccess("Pagável cadastrado.");
      setPayDesc("");
      setPayAmount("");
      setPayDueDate("");
      setPayPreviewItems([]);
      setShowPayPreview(false);
      await qc.invalidateQueries({ queryKey: ["financial_payables", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_cash_projection", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao cadastrar pagável"),
  });

  const updateReceivableStatusM = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("financial_receivables").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["financial_receivables", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_cash_projection", activeTenantId] });
    },
  });

  const updatePayableStatusM = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("financial_payables").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["financial_payables", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_cash_projection", activeTenantId] });
    },
  });

  // ----------------------
  // Edit logic
  // ----------------------
  const [editItem, setEditItem] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editType, setEditType] = useState<"receivable" | "payable" | "budget">("receivable");
  const [editScope, setEditScope] = useState<"only-this" | "this-and-future">("only-this");

  const [reconcileItem, setReconcileItem] = useState<any>(null);
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false);

  const updateItemM = useMutation({
    mutationFn: async (updatedData: any) => {
      if (!activeTenantId || !editItem) throw new Error("Item inválido");
      
      if (editType === "budget") {
        const payload = {
          category_id: updatedData.category_id,
          expected_amount: parseMoneyInput(updatedData.expected_amount),
          recurrence: updatedData.recurrence,
          due_day: parseInt(updatedData.due_day),
          scenario: updatedData.scenario
        };
        const { error } = await supabase
          .from("financial_budgets")
          .update(payload)
          .eq("id", editItem.id)
          .eq("tenant_id", activeTenantId);
        if (error) throw error;
        return;
      }

      const table = editType === "receivable" ? "financial_receivables" : "financial_payables";
      
      const payload: any = {
        description: formatDescriptionWithInstallment(updatedData.description, editItem.installment_number, updatedData.installments_total || editItem.installments_total),
        amount: parseMoneyInput(updatedData.amount),
        due_date: updatedData.due_date,
        entity_id: updatedData.entity_id,
        account_id: updatedData.account_id,
        category_id: updatedData.category_id,
        installments_total: updatedData.installments_total,
      };

      if (!Number.isFinite(payload.amount)) throw new Error("Valor inválido");

      if (editScope === "this-and-future" && editItem.recurrence_group_id) {
        // 1. Atualizar registros existentes (este e futuros) no grupo
        const { error: updateErr } = await supabase
          .from(table)
          .update(payload)
          .eq("tenant_id", activeTenantId)
          .eq("recurrence_group_id", editItem.recurrence_group_id)
          .gte("installment_number", editItem.installment_number);
        
        if (updateErr) throw updateErr;

        // 2. Se o total aumentou, gera parcelas extras
        const currentMaxTotal = editItem.installments_total || 0;
        const newTotal = Number(updatedData.installments_total || currentMaxTotal);
        
        if (newTotal > currentMaxTotal) {
          // Busca a última parcela existente no grupo para saber a data
          const { data: lastItems, error: lastErr } = await supabase
            .from(table)
            .select("installment_number, due_date")
            .eq("tenant_id", activeTenantId)
            .eq("recurrence_group_id", editItem.recurrence_group_id)
            .order("installment_number", { ascending: false })
            .limit(1);

          if (lastErr) throw lastErr;
          
          const lastNum = lastItems?.[0]?.installment_number || editItem.installment_number;
          const lastDate = parseISO(lastItems?.[0]?.due_date || editItem.due_date);

          if (newTotal > lastNum) {
            const extraItems = [];
            for (let i = lastNum + 1; i <= newTotal; i++) {
              const monthsToAdd = i - lastNum;
              const newDate = addMonths(lastDate, monthsToAdd);
              extraItems.push({
                tenant_id: activeTenantId,
                description: payload.description,
                amount: payload.amount,
                due_date: format(newDate, "yyyy-MM-dd"),
                status: "pending",
                recurrence_group_id: editItem.recurrence_group_id,
                installment_number: i,
                installments_total: newTotal,
                entity_id: payload.entity_id,
                account_id: payload.account_id,
                category_id: payload.category_id
              });
            }
            if (extraItems.length > 0) {
              const { error: insertErr } = await supabase.from(table).insert(extraItems);
              if (insertErr) throw insertErr;
            }
          }
        }
      } else {
        // Atualiza apenas este
        const { error } = await supabase
          .from(table)
          .update(payload)
          .eq("id", editItem.id)
          .eq("tenant_id", activeTenantId);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      const queryKey = editType === "receivable" ? "financial_receivables" : editType === "payable" ? "financial_payables" : "financial_budgets";
      
      // Invalida de forma abrangente (prefixo)
      await Promise.all([
        qc.invalidateQueries({ queryKey: [queryKey], exact: false }),
        qc.invalidateQueries({ queryKey: ["financial_cash_projection"], exact: false })
      ]);

      showSuccess("Item atualizado com sucesso.");
      setEditDialogOpen(false);
      setEditItem(null);
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao atualizar"),
  });

  const deleteItemM = useMutation({
    mutationFn: async ({ id, type, scope, recurrenceGroupId, installmentNumber }: { id: string, type: "receivable" | "payable" | "budget", scope: "only-this" | "this-and-future", recurrenceGroupId?: string, installmentNumber?: number }) => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const table = type === "receivable" ? "financial_receivables" : type === "payable" ? "financial_payables" : "financial_budgets";
      
      if (scope === "this-and-future" && recurrenceGroupId && type !== "budget") {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq("tenant_id", activeTenantId)
          .eq("recurrence_group_id", recurrenceGroupId)
          .gte("installment_number", installmentNumber || 0);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq("id", id)
          .eq("tenant_id", activeTenantId);
        if (error) throw error;
      }
    },
    onSuccess: async (_, vars) => {
      const queryKey = vars.type === "receivable" ? "financial_receivables" : vars.type === "payable" ? "financial_payables" : "financial_budgets";
      
      // Invalida de forma abrangente com prefixo
      await Promise.all([
        qc.invalidateQueries({ queryKey: [queryKey], exact: false }),
        qc.invalidateQueries({ queryKey: ["financial_cash_projection"], exact: false })
      ]);

      showSuccess("Item removido com sucesso.");
      setDeleteDialogOpen(false);
      setDeleteItem(null);
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao remover item"),
  });

  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [deleteType, setDeleteType] = useState<"receivable" | "payable" | "budget">("receivable");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"only-this" | "this-and-future">("only-this");

  const unreconcileM = useMutation({
    mutationFn: async (transactionId: string) => {
      const { data, error } = await supabase.rpc("financial_unreconcile_transaction", {
        p_tenant_id: activeTenantId,
        p_transaction_id: transactionId,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.error || "Erro ao desvincular");
    },
    onSuccess: async () => {
      showSuccess("Lançamento desvinculado com sucesso.");
      await qc.invalidateQueries({ queryKey: ["financial_receivables", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_payables", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_cash_projection", activeTenantId] });
      setReconcileDialogOpen(false);
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao desvincular"),
  });

  const projection = projectionQ.data;

  const trendData = useMemo(() => {
    if (!startingBalanceQ.isSuccess) return [];
    
    let currentBalance = startingBalanceQ.data;
    const daysInMonth = endOfMonth(selectedDate).getDate();
    const data = [];

    // Map receivables and payables by day for faster lookups
    const recvByDay = new Map<string, number>();
    for (const r of receivablesQ.data ?? []) {
      const d = r.due_date;
      recvByDay.set(d, (recvByDay.get(d) ?? 0) + Number(r.amount || 0));
    }
    
    const payByDay = new Map<string, number>();
    for (const p of payablesQ.data ?? []) {
      const d = p.due_date;
      payByDay.set(d, (payByDay.get(d) ?? 0) + Number(p.amount || 0));
    }

    const monthPrefix = format(selectedDate, "yyyy-MM");

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
      const inflow = recvByDay.get(dateStr) ?? 0;
      const outflow = payByDay.get(dateStr) ?? 0;
      
      currentBalance = currentBalance + inflow - outflow;
      
      data.push({
        day,
        balance: Number(currentBalance.toFixed(2)),
        inflow,
        outflow,
        formattedDate: format(new Date(`${dateStr}T12:00:00`), "dd MMM", { locale: ptBR })
      });
    }

    return data;
  }, [startingBalanceQ.data, startingBalanceQ.isSuccess, receivablesQ.data, payablesQ.data, selectedDate]);


  return (
    <div className="grid gap-4">
      <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/50 p-1 dark:border-slate-800 dark:bg-slate-950/20">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl"
                onClick={() => setSelectedDate(prev => addMonths(prev, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex min-w-[120px] items-center justify-center gap-2 px-2 text-sm font-medium text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
                {format(selectedDate, "MMMM yyyy", { locale: ptBR })}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl"
                onClick={() => setSelectedDate(prev => addMonths(prev, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger className="h-10 w-[200px] rounded-2xl bg-white/50 dark:bg-slate-950/20">
                <div className="flex items-center gap-2">
                  <Wallet className="h-3.5 w-3.5 text-slate-400" />
                  <SelectValue placeholder="Todas as contas" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as contas</SelectItem>
                {(bankAccountsQ.data ?? []).map((ba: any) => (
                  <SelectItem key={ba.id} value={ba.id}>
                    {ba.bank_name} - {ba.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <div className="text-[11px] font-semibold text-slate-400 uppercase text-right">Projeção básica de caixa</div>
              <div className="text-[10px] text-slate-500 text-right">saldo atual + pendências</div>
            </div>
            <Button
              variant="secondary"
              className="h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800"
              onClick={() => {
              projectionQ.refetch();
                receivablesQ.refetch();
                payablesQ.refetch();
                startingBalanceQ.refetch();
              }}
              disabled={!activeTenantId}
            >
              Atualizar
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="text-[11px] text-slate-600 dark:text-slate-400">Saldo atual</div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {formatMoneyBRL(Number(projection?.current_balance ?? 0))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="text-[11px] text-slate-600 dark:text-slate-400">Recebíveis (pendentes)</div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {formatMoneyBRL(Number(projection?.receivables_pending ?? 0))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="text-[11px] text-slate-600 dark:text-slate-400">Pagáveis (pendentes)</div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {formatMoneyBRL(Number(projection?.payables_pending ?? 0))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="text-[11px] text-slate-600 dark:text-slate-400">Saldo projetado</div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {formatMoneyBRL(Number(projection?.projected_balance ?? 0))}
            </div>
          </div>
        </div>

        {/* Trend Chart */}
        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[hsl(var(--byfrost-accent)/0.1)] text-[hsl(var(--byfrost-accent))]">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Fluxo de Caixa Diário</div>
                <div className="text-[10px] text-slate-500 font-medium">Projeção de saldo acumulado no mês</div>
              </div>
            </div>
            {startingBalanceQ.isSuccess && (
              <div className="text-right">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Saldo Inicial</div>
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">{formatMoneyBRL(startingBalanceQ.data)}</div>
              </div>
            )}
          </div>
          
          <div className="h-[200px] w-full px-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--byfrost-accent))" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="hsl(var(--byfrost-accent))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis 
                  dataKey="day" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }}
                  interval={Math.ceil(trendData.length / 10)}
                  dy={10}
                />
                <YAxis 
                  hide 
                  domain={['dataMin - 1000', 'dataMax + 1000']}
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">{data.formattedDate}</p>
                          <div className="flex items-center justify-between gap-6 mb-2">
                             <span className="text-[10px] font-medium text-slate-500">Saldo:</span>
                             <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{formatMoneyBRL(data.balance)}</span>
                          </div>
                          {(data.inflow > 0 || data.outflow > 0) && (
                            <div className="mt-2 grid gap-1 border-t border-slate-100 dark:border-slate-800 pt-2">
                              {data.inflow > 0 && (
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-[9px] font-medium text-emerald-600/70">Entradas</span>
                                  <span className="text-[10px] text-emerald-600 font-bold whitespace-nowrap">+{formatMoneyBRL(data.inflow)}</span>
                                </div>
                              )}
                              {data.outflow > 0 && (
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-[9px] font-medium text-rose-600/70">Saídas</span>
                                  <span className="text-[10px] text-rose-600 font-bold whitespace-nowrap">-{formatMoneyBRL(data.outflow)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="balance" 
                  stroke="hsl(var(--byfrost-accent))" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorBalance)" 
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {projectionQ.isError ? (
          <div className="mt-3 text-xs text-red-600 dark:text-red-300">
            Falha ao calcular projeção: {(projectionQ.error as any)?.message ?? "erro"}
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { id: "budgets", label: "Orçamentos", icon: Wallet, color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20" },
          { id: "receivables", label: "Recebíveis", icon: ChevronRight, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" },
          { id: "payables", label: "Pagáveis", icon: ChevronLeft, color: "text-rose-600 bg-rose-50 dark:bg-rose-900/20" },
        ].map((btn) => (
          <button
            key={btn.id}
            onClick={() => setActiveTab(btn.id)}
            className={cn(
              "flex flex-col items-center justify-center p-6 rounded-[28px] border-2 transition-all duration-300 group",
              activeTab === btn.id
                ? "border-[hsl(var(--byfrost-accent))] bg-white dark:bg-slate-900 shadow-xl shadow-[hsl(var(--byfrost-accent)/0.1)] scale-[1.02]"
                : "border-slate-100 bg-slate-50/50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/20"
            )}
          >
            <div className={cn("p-4 rounded-3xl mb-4 transition-transform group-hover:scale-110", btn.color)}>
              <btn.icon className="h-6 w-6" />
            </div>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest">{btn.label}</span>
            <div className="mt-2 text-xs text-slate-500 font-medium">
              {btn.id === 'budgets' && budgetsQ.data ? `${budgetsQ.data.length} ativos` : ""}
              {btn.id === 'receivables' && receivablesQ.data ? formatMoneyBRL(receivablesQ.data.reduce((acc: number, r: any) => acc + (r.amount || 0), 0)) : ""}
              {btn.id === 'payables' && payablesQ.data ? formatMoneyBRL(payablesQ.data.reduce((acc: number, p: any) => acc + (p.amount || 0), 0)) : ""}
            </div>
          </button>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsContent value="budgets" className="mt-2">
          <Card className="rounded-[32px] border-slate-200 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex items-center justify-between mb-6">
              <div className="text-lg font-bold text-slate-900 dark:text-slate-100">Configuração de Orçamentos</div>
              <div className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full text-[10px] font-bold uppercase tracking-widest">Planejamento</div>
            </div>

            <div className="grid gap-6 md:grid-cols-5">
              <div className="md:col-span-2">
                <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Categoria do Orçamento</Label>
                <Select value={budgetCategoryId} onValueChange={setBudgetCategoryId}>
                  <SelectTrigger className="h-11 rounded-2xl bg-white dark:bg-slate-950">
                    <SelectValue placeholder={categoriesQ.isLoading ? "Carregando…" : "Escolha uma categoria"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(categoriesQ.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({CATEGORY_LABELS[c.type]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Valor esperado</Label>
                <Input
                  className="mt-1 rounded-2xl"
                  placeholder="Ex: 1500,00"
                  value={budgetExpectedAmount}
                  onChange={(e) => setBudgetExpectedAmount(e.target.value)}
                />
              </div>

              <div>
                <Label className="text-xs">Recorrência</Label>
                <Select value={budgetRecurrence} onValueChange={setBudgetRecurrence}>
                  <SelectTrigger className="mt-1 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                    <SelectItem value="once">Único</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Dia vencimento (1-31)</Label>
                <Input
                  className="mt-1 rounded-2xl"
                  inputMode="numeric"
                  placeholder="Ex: 5"
                  value={budgetDueDay}
                  onChange={(e) => setBudgetDueDay(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <Label className="text-xs">Cenário</Label>
                <Input
                  className="mt-1 rounded-2xl"
                  placeholder="base"
                  value={budgetScenario}
                  onChange={(e) => setBudgetScenario(e.target.value)}
                />
              </div>

              <div className="md:col-span-3 flex items-end">
                <Button
                  onClick={() => createBudgetM.mutate()}
                  disabled={!activeTenantId || createBudgetM.isPending}
                  className="h-10 w-full rounded-2xl md:w-auto"
                >
                  {createBudgetM.isPending ? "Salvando…" : "Cadastrar orçamento"}
                </Button>
              </div>
            </div>

            <div className="mt-5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Orçamentos cadastrados</div>
              <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Recorrência</TableHead>
                      <TableHead>Dia</TableHead>
                      <TableHead>Cenário</TableHead>
                      <TableHead className="w-[80px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(budgetsQ.data ?? []).map((b) => {
                      const cat = categoryById.get(b.category_id);
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">{cat?.name ?? b.category_id}</TableCell>
                          <TableCell>{formatMoneyBRL(Number(b.expected_amount ?? 0))}</TableCell>
                          <TableCell>{b.recurrence}</TableCell>
                          <TableCell>{b.due_day ?? "—"}</TableCell>
                          <TableCell>{b.scenario}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 rounded-full"
                                onClick={() => {
                                  setEditType("budget" as any);
                                  setEditItem(b);
                                  setEditDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3 w-3 text-slate-400" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:text-rose-600"
                                onClick={() => {
                                  setDeleteType("budget");
                                  setDeleteItem(b);
                                  setDeleteScope("only-this");
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-3 w-3 text-slate-400" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {!budgetsQ.isLoading && !(budgetsQ.data ?? []).length ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-slate-600 dark:text-slate-400">
                          Nenhum orçamento ainda.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="receivables" className="mt-4">
          <Card className="rounded-[32px] border-slate-200 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex items-center justify-between mb-6">
              <div className="text-lg font-bold text-slate-900 dark:text-slate-100">Contas a Receber</div>
              <div className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-bold uppercase tracking-widest">Entradas</div>
            </div>

            <div className="grid gap-6 md:grid-cols-6">
              <div className="md:col-span-2">
                <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Descrição</Label>
                <Input className="h-11 rounded-2xl bg-white dark:bg-slate-950" value={recvDesc} onChange={(e) => setRecvDesc(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Cliente / Entidade</Label>
                <AsyncSelect
                  className="h-11 rounded-2xl bg-white dark:bg-slate-950"
                  value={recvEntityId}
                  onChange={setRecvEntityId}
                  placeholder="Buscar..."
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
              <div>
                <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Valor (R$)</Label>
                <Input
                  className="h-11 rounded-2xl bg-white dark:bg-slate-950"
                  placeholder="0,00"
                  value={recvAmount}
                  onChange={(e) => setRecvAmount(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Vencimento</Label>
                <Input
                  className="h-11 rounded-2xl bg-white dark:bg-slate-950"
                  type="date"
                  value={recvDueDate}
                  onChange={(e) => setRecvDueDate(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Conta de Destino</Label>
                <Select value={recvAccountId || ""} onValueChange={setRecvAccountId}>
                  <SelectTrigger className="h-11 rounded-2xl bg-white dark:bg-slate-950">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    {(bankAccountsQ.data ?? []).map((ba: any) => (
                      <SelectItem key={ba.id} value={ba.id}>
                        {ba.bank_name} - {ba.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Tipo de Lançamento</Label>
                <Select value={recvType} onValueChange={(v: any) => setRecvType(v)}>
                  <SelectTrigger className="h-11 rounded-2xl bg-white dark:bg-slate-950">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Pagamento Único</SelectItem>
                    <SelectItem value="recurrent">Recorrente (Mensal)</SelectItem>
                    <SelectItem value="installments">Parcelado (30 dias)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {recvType !== "single" && (
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">
                    {recvType === 'recurrent' ? 'Meses' : 'Parcelas'}
                  </Label>
                  <Input 
                    type="number" 
                    className="h-11 rounded-2xl bg-white dark:bg-slate-950" 
                    value={recvInstallments} 
                    onChange={(e) => setRecvInstallments(e.target.value)} 
                    min="2"
                    max="60"
                  />
                </div>
              )}

              <div className="md:col-span-full flex items-end pt-2">
                <Button
                  onClick={generateRecvPreview}
                  disabled={!activeTenantId || createReceivableM.isPending}
                  className="h-12 px-8 rounded-2xl bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.9)] text-white font-bold"
                >
                  {showRecvPreview ? "Atualizar Plano" : "Continuar Cadastro"}
                </Button>
              </div>

              {showRecvPreview && (
                <div className="md:col-span-full mt-8 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600">
                        <CalendarIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Confirmação de Recebíveis</div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Revise os lançamentos gerados</div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="rounded-xl text-slate-500" onClick={() => setShowRecvPreview(false)}>Cancelar</Button>
                  </div>
                  
                  <div className="grid gap-3 max-h-[400px] overflow-auto pr-2 custom-scrollbar">
                    {recvPreviewItems.map((item, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 hover:border-[hsl(var(--byfrost-accent)/0.3)] transition-all group">
                        <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500">#{idx + 1}</div>
                        <div className="flex-1 w-full">
                          <Label className="text-[9px] uppercase font-bold text-slate-400 mb-1 block ml-1">Descrição</Label>
                          <Input className="h-10 rounded-xl bg-slate-50/50" value={item.description} onChange={(e) => {
                            const newItems = [...recvPreviewItems];
                            newItems[idx].description = e.target.value;
                            setRecvPreviewItems(newItems);
                          }} />
                        </div>
                        <div className="w-full sm:w-40">
                          <Label className="text-[9px] uppercase font-bold text-slate-400 mb-1 block ml-1">Vencimento</Label>
                          <Input type="date" className="h-10 rounded-xl bg-slate-50/50" value={item.due_date} onChange={(e) => {
                            const newItems = [...recvPreviewItems];
                            newItems[idx].due_date = e.target.value;
                            setRecvPreviewItems(newItems);
                          }} />
                        </div>
                        <div className="w-full sm:w-32 text-right">
                          <Label className="text-[9px] uppercase font-bold text-slate-400 mb-1 block mr-1">Valor</Label>
                          <div className="h-10 flex items-center justify-end px-3 font-bold text-slate-900">{formatMoneyBRL(item.amount)}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-[32px] bg-emerald-50/50 border border-emerald-100">
                    <div className="text-sm font-medium text-slate-600">
                      Total a receber: <span className="font-bold text-emerald-600">{formatMoneyBRL(recvPreviewItems.reduce((acc, i) => acc + i.amount, 0))}</span> em {recvPreviewItems.length} vezes.
                    </div>
                    <Button
                      onClick={() => createReceivableM.mutate()}
                      disabled={createReceivableM.isPending}
                      className="h-12 px-8 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    >
                      {createReceivableM.isPending ? "Processando..." : "Confirmar e Salvar"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800">
              <Table>
                <TableHeader className="bg-slate-50/50 dark:bg-slate-950">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase font-bold">Descrição</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold">Entidade</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold">Conciliado</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold">Vencimento</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold">Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(receivablesQ.data ?? []).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-bold text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-2">
                          <span>{r.description}</span>
                          {r.installments_total && (
                            <Badge variant="secondary" className="h-5 text-[10px] font-bold border-[hsl(var(--byfrost-accent)/0.1)] text-[hsl(var(--byfrost-accent))] bg-[hsl(var(--byfrost-accent)/0.05)]">
                              {r.installment_number}/{r.installments_total}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-500">
                        {r.core_entities?.display_name ?? "—"}
                      </TableCell>
                      <TableCell className={cn(
                        "text-xs font-bold transition-all",
                        r.status === 'paid' ? "text-emerald-600" :
                        r.status === 'overdue' ? "text-rose-600" :
                        "text-amber-600"
                      )}>
                        <button
                          onClick={() => {
                            const oldLinks = r.financial_transactions ? [r.financial_transactions] : [];
                            const newLinks = r.financial_reconciliation_links?.map((l: any) => l.financial_transactions).filter(Boolean) || [];
                            const allUnique = Array.from(new Set([...oldLinks, ...newLinks].map(t => t.id)))
                              .map(id => [...oldLinks, ...newLinks].find(t => t.id === id));

                            if (allUnique.length > 0) {
                              // If multiple, maybe we show a specific dialog or just the standard one
                              // For now, the dialog shows the first linked item or we can extend it
                              setReconcileItem(r);
                              setReconcileDialogOpen(true);
                            }
                          }}
                          className={cn(
                            "text-xs font-bold transition-all",
                            (() => {
                               const oldL = r.financial_transactions ? 1 : 0;
                               const newL = r.financial_reconciliation_links?.length || 0;
                               return (oldL + newL) > 0 ? "text-emerald-600 hover:scale-105" : "text-slate-300";
                            })()
                          )}
                        >
                          {(() => {
                            const oldLinks = r.financial_transactions ? [r.financial_transactions] : [];
                            const newLinks = r.financial_reconciliation_links?.map((l: any) => l.financial_transactions).filter(Boolean) || [];
                            const allUnique = Array.from(new Set([...oldLinks, ...newLinks].map(t => t.id)))
                              .map(id => [...oldLinks, ...newLinks].find(t => t.id === id));
                            
                            const totalReconciled = allUnique.reduce((acc, t) => acc + (t.amount || 0), 0);
                            if (totalReconciled > 0 && totalReconciled < r.amount) {
                              return `${formatMoneyBRL(totalReconciled)} / ${formatMoneyBRL(r.amount)}`;
                            }
                            return formatMoneyBRL(totalReconciled);
                          })()}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{r.due_date}</TableCell>
                      <TableCell>
                        <Select value={r.status} onValueChange={(v) => updateReceivableStatusM.mutate({ id: r.id, status: v })}>
                          <SelectTrigger className={cn(
                            "h-8 w-[110px] rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                            r.status === 'paid' ? "text-emerald-600 border-emerald-200 bg-emerald-50" :
                            r.status === 'overdue' ? "text-rose-600 border-rose-200 bg-rose-50" :
                            "text-amber-600 border-amber-200 bg-amber-50"
                          )}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pendente</SelectItem>
                            <SelectItem value="paid">Pago</SelectItem>
                            <SelectItem value="overdue">Atrasado</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-slate-100"
                            onClick={() => {
                              setEditType("receivable");
                              setEditItem(r);
                              setEditScope("only-this");
                              setEditDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5 text-slate-400" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-rose-50 hover:text-rose-600"
                            onClick={() => {
                              setDeleteType("receivable");
                              setDeleteItem(r);
                              setDeleteScope("only-this");
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!receivablesQ.isLoading && !(receivablesQ.data ?? []).length && (
                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-400 text-sm italic">Nenhum registro encontrado para este período.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="payables" className="mt-4">
          <Card className="rounded-[32px] border-slate-200 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex items-center justify-between mb-6">
              <div className="text-lg font-bold text-slate-900 dark:text-slate-100">Contas a Pagar</div>
              <div className="px-3 py-1 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full text-[10px] font-bold uppercase tracking-widest">Saídas</div>
            </div>

            <div className="grid gap-6 md:grid-cols-6">
              <div className="md:col-span-2">
                <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Descrição</Label>
                <Input className="h-11 rounded-2xl bg-white dark:bg-slate-950" value={payDesc} onChange={(e) => setPayDesc(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Fornecedor / Entidade</Label>
                <AsyncSelect
                  className="h-11 rounded-2xl bg-white dark:bg-slate-950"
                  value={payEntityId}
                  onChange={setPayEntityId}
                  placeholder="Buscar..."
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
              <div>
                <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Valor (R$)</Label>
                <Input
                  className="h-11 rounded-2xl bg-white dark:bg-slate-950"
                  placeholder="0,00"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Vencimento</Label>
                <Input
                  className="h-11 rounded-2xl bg-white dark:bg-slate-950"
                  type="date"
                  value={payDueDate}
                  onChange={(e) => setPayDueDate(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Conta de Origem</Label>
                <Select value={payAccountId || ""} onValueChange={setPayAccountId}>
                  <SelectTrigger className="h-11 rounded-2xl bg-white dark:bg-slate-950">
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    {(bankAccountsQ.data ?? []).map((ba: any) => (
                      <SelectItem key={ba.id} value={ba.id}>
                        {ba.bank_name} - {ba.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Tipo de Lançamento</Label>
                <Select value={payType} onValueChange={(v: any) => setPayType(v)}>
                  <SelectTrigger className="h-11 rounded-2xl bg-white dark:bg-slate-950">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Pagamento Único</SelectItem>
                    <SelectItem value="recurrent">Recorrente (Mensal)</SelectItem>
                    <SelectItem value="installments">Parcelado (30 dias)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {payType !== "single" && (
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">
                    {payType === 'recurrent' ? 'Meses' : 'Parcelas'}
                  </Label>
                  <Input 
                    type="number" 
                    className="h-11 rounded-2xl bg-white dark:bg-slate-950" 
                    value={payInstallments} 
                    onChange={(e) => setPayInstallments(e.target.value)} 
                    min="2"
                    max="60"
                  />
                </div>
              )}

              <div className="md:col-span-full flex items-end pt-2">
                <Button
                  onClick={generatePayPreview}
                  disabled={!activeTenantId || createPayableM.isPending}
                  className="h-12 px-8 rounded-2xl bg-[hsl(var(--byfrost-accent))] hover:bg-[hsl(var(--byfrost-accent)/0.9)] text-white font-bold"
                >
                  {showPayPreview ? "Atualizar Plano" : "Continuar Cadastro"}
                </Button>
              </div>

              {showPayPreview && (
                <div className="md:col-span-full mt-8 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600">
                        <CalendarIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Cronograma de Parcelas</div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Revise as datas e descrições</div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="rounded-xl text-slate-500" onClick={() => setShowPayPreview(false)}>Cancelar</Button>
                  </div>
                  
                  <div className="grid gap-3 max-h-[400px] overflow-auto pr-2 custom-scrollbar">
                    {payPreviewItems.map((item, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 hover:border-[hsl(var(--byfrost-accent)/0.3)] transition-all group">
                        <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500">#{idx + 1}</div>
                        <div className="flex-1 w-full">
                          <Label className="text-[9px] uppercase font-bold text-slate-400 mb-1 block ml-1">Descrição</Label>
                          <Input className="h-10 rounded-xl bg-slate-50/50" value={item.description} onChange={(e) => {
                            const newItems = [...payPreviewItems];
                            newItems[idx].description = e.target.value;
                            setPayPreviewItems(newItems);
                          }} />
                        </div>
                        <div className="w-full sm:w-40">
                          <Label className="text-[9px] uppercase font-bold text-slate-400 mb-1 block ml-1">Vencimento</Label>
                          <Input type="date" className="h-10 rounded-xl bg-slate-50/50" value={item.due_date} onChange={(e) => {
                            const newItems = [...payPreviewItems];
                            newItems[idx].due_date = e.target.value;
                            setPayPreviewItems(newItems);
                          }} />
                        </div>
                        <div className="w-full sm:w-32 text-right">
                          <Label className="text-[9px] uppercase font-bold text-slate-400 mb-1 block mr-1">Valor</Label>
                          <div className="h-10 flex items-center justify-end px-3 font-bold text-slate-900">{formatMoneyBRL(item.amount)}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-[32px] bg-[hsl(var(--byfrost-accent)/0.03)] border border-[hsl(var(--byfrost-accent)/0.1)]">
                    <div className="text-sm font-medium text-slate-600">
                      Serão gerados <span className="font-bold">{payPreviewItems.length}</span> lançamentos totalizando <span className="font-bold text-rose-600">{formatMoneyBRL(payPreviewItems.reduce((acc, i) => acc + i.amount, 0))}</span>
                    </div>
                    <Button
                      onClick={() => createPayableM.mutate()}
                      disabled={createPayableM.isPending}
                      className="h-12 px-8 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 font-bold shadow-lg shadow-black/10"
                    >
                      {createPayableM.isPending ? "Processando..." : "Confirmar e Gerar Plano"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800">
              <Table>
                <TableHeader className="bg-slate-50/50 dark:bg-slate-950">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase font-bold">Descrição</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold">Entidade</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold">Conciliado</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold">Vencimento</TableHead>
                    <TableHead className="text-[10px] uppercase font-bold">Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(payablesQ.data ?? []).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-bold text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-2">
                          <span>{p.description}</span>
                          {p.installments_total && (
                            <Badge variant="secondary" className="h-5 text-[10px] font-bold border-[hsl(var(--byfrost-accent)/0.1)] text-[hsl(var(--byfrost-accent))] bg-[hsl(var(--byfrost-accent)/0.05)]">
                              {p.installment_number}/{p.installments_total}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-500">
                        {p.core_entities?.display_name ?? "—"}
                      </TableCell>
                      <TableCell className={cn(
                        "text-xs font-bold transition-all",
                        p.status === 'paid' ? "text-emerald-600" :
                        p.status === 'overdue' ? "text-rose-600" :
                        "text-amber-600"
                      )}>
                        <button
                          onClick={() => {
                            const oldLinks = p.financial_transactions ? [p.financial_transactions] : [];
                            const newLinks = p.financial_reconciliation_links?.map((l: any) => l.financial_transactions).filter(Boolean) || [];
                            const allUnique = Array.from(new Set([...oldLinks, ...newLinks].map(t => t.id)))
                              .map(id => [...oldLinks, ...newLinks].find(t => t.id === id));

                            if (allUnique.length > 0) {
                              setReconcileItem(p);
                              setReconcileDialogOpen(true);
                            }
                          }}
                          className={cn(
                            "text-xs font-bold transition-all",
                            (() => {
                               const oldL = p.financial_transactions ? 1 : 0;
                               const newL = p.financial_reconciliation_links?.length || 0;
                               return (oldL + newL) > 0 ? "text-emerald-600 hover:scale-105" : "text-slate-300";
                            })()
                          )}
                        >
                          {(() => {
                            const oldLinks = p.financial_transactions ? [p.financial_transactions] : [];
                            const newLinks = p.financial_reconciliation_links?.map((l: any) => l.financial_transactions).filter(Boolean) || [];
                            const allUnique = Array.from(new Set([...oldLinks, ...newLinks].map(t => t.id)))
                              .map(id => [...oldLinks, ...newLinks].find(t => t.id === id));
                            
                            const totalReconciled = allUnique.reduce((acc, t) => acc + (t.amount || 0), 0);
                            if (totalReconciled > 0 && totalReconciled < p.amount) {
                              return `${formatMoneyBRL(totalReconciled)} / ${formatMoneyBRL(p.amount)}`;
                            }
                            return formatMoneyBRL(totalReconciled);
                          })()}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{p.due_date}</TableCell>
                      <TableCell>
                        <Select value={p.status} onValueChange={(v) => updatePayableStatusM.mutate({ id: p.id, status: v })}>
                          <SelectTrigger className={cn(
                            "h-8 w-[110px] rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                            p.status === 'paid' ? "text-emerald-600 border-emerald-200 bg-emerald-50" :
                            p.status === 'overdue' ? "text-rose-600 border-rose-200 bg-rose-50" :
                            "text-amber-600 border-amber-200 bg-amber-50"
                          )}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pendente</SelectItem>
                            <SelectItem value="paid">Pago</SelectItem>
                            <SelectItem value="overdue">Atrasado</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-slate-100"
                            onClick={() => {
                              setEditType("payable");
                              setEditItem(p);
                              setEditScope("only-this");
                              setEditDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5 text-slate-400" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-rose-50 hover:text-rose-600"
                            onClick={() => {
                              setDeleteType("payable");
                              setDeleteItem(p);
                              setDeleteScope("only-this");
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!payablesQ.isLoading && !(payablesQ.data ?? []).length && (
                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-400 text-sm italic">Nenhum registro encontrado para este período.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
      <EditItemDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        item={editItem}
        type={editType}
        scope={editScope}
        onScopeChange={setEditScope}
        onSave={(data: any) => updateItemM.mutate(data)}
        isPending={updateItemM.isPending}
        activeTenantId={activeTenantId}
        bankAccounts={bankAccountsQ.data ?? []}
      />

      <LinkedTransactionsDialog
        open={reconcileDialogOpen}
        onOpenChange={setReconcileDialogOpen}
        item={reconcileItem}
        onUnreconcile={(id: string) => unreconcileM.mutate(id)}
        isPending={unreconcileM.isPending}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este item? Esta ação não pode ser desfeita.
              {deleteItem?.recurrence_group_id && (
                <div className="mt-4 p-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
                  <Label className="text-[10px] font-bold uppercase text-amber-600 mb-2 block">Item Recorrente</Label>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="del-scope-only" 
                        checked={deleteScope === "only-this"} 
                        onCheckedChange={() => setDeleteScope("only-this")} 
                      />
                      <Label htmlFor="del-scope-only" className="text-xs cursor-pointer">Apenas esta parcela</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="del-scope-future" 
                        checked={deleteScope === "this-and-future"} 
                        onCheckedChange={() => setDeleteScope("this-and-future")} 
                      />
                      <Label htmlFor="del-scope-future" className="text-xs cursor-pointer">Esta e todas as futuras</Label>
                    </div>
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-slate-200">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white border-none min-w-[140px]"
              onClick={(e) => {
                e.preventDefault(); // Evita fechar antes da mutação sucess
                deleteItemM.mutate({ 
                  id: deleteItem.id, 
                  type: deleteType, 
                  scope: deleteScope,
                  recurrenceGroupId: deleteItem?.recurrence_group_id,
                  installmentNumber: deleteItem?.installment_number
                });
              }}
              disabled={deleteItemM.isPending}
            >
              {deleteItemM.isPending ? "Excluindo..." : "Confirmar Exclusão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
function EditItemDialog({ open, onOpenChange, item, type, scope, onScopeChange, onSave, isPending, activeTenantId, bankAccounts }: any) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [entityId, setEntityId] = useState<string | null>(null);
  const [entityLabel, setEntityLabel] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryLabel, setCategoryLabel] = useState<string | null>(null);
  const [instNumber, setInstNumber] = useState<number | null>(null);
  const [instTotal, setInstTotal] = useState<number | null>(null);

  // Budget specific fields
  const [budRecurrence, setBudRecurrence] = useState("monthly");
  const [budDueDay, setBudDueDay] = useState("");
  const [budScenario, setBudScenario] = useState("base");

  // Sync state when item changes
  useMemo(() => {
    if (item) {
      if (type === "budget") {
        setCategoryId(item.category_id);
        const catName = item.financial_categories?.name || item.category_id;
        setCategoryLabel(catName);
        setAmount(String(item.expected_amount || ""));
        setBudRecurrence(item.recurrence || "monthly");
        setBudDueDay(String(item.due_day || ""));
        setBudScenario(item.scenario || "base");
        setDesc(`Orçamento: ${catName}`);
      } else {
        setDesc(item.description || "");
        setAmount(String(item.amount || ""));
        setDate(item.due_date || "");
        setEntityId(item.entity_id || null);
        setEntityLabel(item.core_entities?.display_name || null);
        setAccountId(item.account_id || null);
        
        // Se não tiver categoria mas estiver conciliado, busca da transação
        let catId = item.category_id;
        let catLabel = item.financial_categories?.name;
        
        if (!catId && (item.financial_transactions?.length ?? 0) > 0) {
          const linked = item.financial_transactions[0];
          if (linked?.category_id) {
            catId = linked.category_id;
            catLabel = linked.financial_categories?.name;
          }
        }
        
        setCategoryId(catId || null);
        setCategoryLabel(catLabel || null);
        setInstNumber(item.installment_number || null);
        setInstTotal(item.installments_total || null);
      }
    }
  }, [item, type]);

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] rounded-3xl">
        <DialogHeader>
          <DialogTitle>Editar {type === 'receivable' ? 'Recebível' : type === 'payable' ? 'Pagável' : 'Orçamento'}</DialogTitle>
          <DialogDescription>
            Ajuste os detalhes do {type === 'budget' ? 'orçamento planejado' : 'lançamento planejado'}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {type === 'budget' ? (
            <div className="grid gap-4">
              <div>
                <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Categoria</Label>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-semibold">
                  {categoryLabel}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Valor Esperado</Label>
                  <Input 
                    className="h-11 rounded-2xl font-bold text-[hsl(var(--byfrost-accent))]" 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)} 
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Dia Vencimento (1-31)</Label>
                  <Input 
                    className="h-11 rounded-2xl" 
                    value={budDueDay} 
                    onChange={(e) => setBudDueDay(e.target.value)} 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Recorrência</Label>
                  <Select value={budRecurrence} onValueChange={setBudRecurrence}>
                    <SelectTrigger className="h-11 rounded-2xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                      <SelectItem value="once">Único</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Cenário</Label>
                  <Input 
                    className="h-11 rounded-2xl" 
                    value={budScenario} 
                    onChange={(e) => setBudScenario(e.target.value)} 
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-[10px] font-bold uppercase text-slate-500 block">Descrição</Label>
                  {instNumber && (
                    <Badge variant="outline" className="h-5 text-[10px] font-bold border-indigo-100 text-indigo-600 bg-indigo-50">
                      {instNumber} de {instTotal || "?"}
                    </Badge>
                  )}
                </div>
                <Input className="h-11 rounded-2xl" value={desc} onChange={(e) => setDesc(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Valor</Label>
                  <Input className="h-11 rounded-2xl font-bold text-emerald-600" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Vencimento</Label>
                  <Input type="date" className="h-11 rounded-2xl" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Entidade</Label>
                  <AsyncSelect
                    className="h-11 rounded-2xl"
                    value={entityId}
                    initialLabel={entityLabel}
                    onChange={(v) => setEntityId(v)}
                    loadOptions={async (val) => {
                      if (!activeTenantId || val.length < 2) return [];
                      const { data } = await supabase
                        .from("core_entities")
                        .select("id, display_name")
                        .eq("tenant_id", activeTenantId)
                        .ilike("display_name", `%${val}%`)
                        .limit(10);
                      return (data || []).map((d) => ({ value: d.id, label: d.display_name }));
                    }}
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Categoria</Label>
                  <AsyncSelect
                    className="h-11 rounded-2xl"
                    value={categoryId}
                    initialLabel={categoryLabel}
                    onChange={(v) => setCategoryId(v)}
                    loadOptions={async (val) => {
                      if (!activeTenantId || val.length < 2) return [];
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-1">
                  <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Conta</Label>
                  <Select value={accountId || "none"} onValueChange={(v) => setAccountId(v === "none" ? null : v)}>
                    <SelectTrigger className="h-11 rounded-2xl">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {bankAccounts.map((ba: any) => (
                        <SelectItem key={ba.id} value={ba.id}>{ba.bank_name} - {ba.account_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {item.recurrence_group_id && (
                  <div className="col-span-1">
                    <Label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Escopo da Alteração</Label>
                    <Select value={scope} onValueChange={onScopeChange}>
                      <SelectTrigger className="h-11 rounded-2xl border-indigo-100 bg-indigo-50/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="only-this">Apenas esta parcela</SelectItem>
                        <SelectItem value="this-and-future">Esta e todas as futuras</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {item.recurrence_group_id && (
                <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Ajuste de Recorrência</div>
                    <Badge variant="outline" className="h-4 text-[9px] px-1.5 opacity-60">Série Ativa</Badge>
                  </div>
                  <div className="grid gap-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-slate-600">Total de parcelas projetadas:</Label>
                      <Input 
                        type="number" 
                        className="h-9 w-20 text-center rounded-xl bg-white dark:bg-slate-950 font-bold" 
                        value={instTotal || ""} 
                        onChange={(e) => setInstTotal(Number(e.target.value))}
                        min={instNumber || 1}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" className="rounded-2xl h-11" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button 
            className="rounded-2xl h-11 bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 font-bold px-8" 
            onClick={() => onSave(type === 'budget' ? {
              expected_amount: amount,
              category_id: categoryId,
              recurrence: budRecurrence,
              due_day: budDueDay,
              scenario: budScenario
            } : {
              description: desc,
              amount,
              due_date: date,
              entity_id: entityId,
              account_id: accountId,
              category_id: categoryId,
              installments_total: instTotal
            })}
            disabled={isPending}
          >
            {isPending ? "Salvando…" : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkedTransactionsDialog({ open, onOpenChange, item, onUnreconcile, isPending }: any) {
  if (!item) return null;
  const transactions = item.financial_transactions ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Transações Conciliadas</DialogTitle>
          <DialogDescription>
            Estas são as transações bancárias vinculadas a este lançamento.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900">
                <TableRow>
                  <TableHead className="text-[10px] uppercase">Data</TableHead>
                  <TableHead className="text-[10px] uppercase">Descrição</TableHead>
                  <TableHead className="text-[10px] uppercase">Valor</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{t.transaction_date || "—"}</TableCell>
                    <TableCell className="text-xs font-medium">{t.description}</TableCell>
                    <TableCell className="text-xs font-semibold">{formatMoneyBRL(t.amount)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                        onClick={() => onUnreconcile(t.id)}
                        disabled={isPending}
                        title="Desvincular"
                      >
                        <Link2Off className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/30">
            <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
              <span className="font-semibold">Nota:</span> Ao desvincular uma transação, o lançamento voltará para o status "Pendente" (caso este seja o único vínculo) e a transação bancária ficará disponível para novas reconciliações.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-2xl">Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
