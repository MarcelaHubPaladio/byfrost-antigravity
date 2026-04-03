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
import { showError, showSuccess } from "@/utils/toast";
import { Checkbox } from "@/components/ui/checkbox";
import { addDays, addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AsyncSelect } from "@/components/ui/async-select";
import { Pencil, Trash2, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Wallet, Link2Off, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

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
        .select("id,tenant_id,description,amount,due_date,status,entity_id,account_id,core_entities(display_name),financial_transactions!financial_transactions_receivable_fk(id,transaction_date,description,amount)")
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
        .select("id,tenant_id,description,amount,due_date,status,entity_id,account_id,core_entities(display_name),financial_transactions!financial_transactions_payable_fk(id,transaction_date,description,amount)")
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

      items.push({
        description: count > 1 ? `${recvDesc.trim()} (${i + 1}/${count})` : recvDesc.trim(),
        amount: Number(amt.toFixed(2)),
        due_date: format(itemDate, "yyyy-MM-dd"),
        installment_number: i + 1,
        installments_total: count > 1 ? count : null,
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

      items.push({
        description: count > 1 ? `${payDesc.trim()} (${i + 1}/${count})` : payDesc.trim(),
        amount: Number(amt.toFixed(2)),
        due_date: format(itemDate, "yyyy-MM-dd"),
        installment_number: i + 1,
        installments_total: count > 1 ? count : null,
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
        description: item.description,
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
  const [editType, setEditType] = useState<"receivable" | "payable">("receivable");
  const [editScope, setEditScope] = useState<"only-this" | "this-and-future">("only-this");

  const [reconcileItem, setReconcileItem] = useState<any>(null);
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false);

  const updateItemM = useMutation({
    mutationFn: async (updatedData: any) => {
      if (!activeTenantId || !editItem) throw new Error("Item inválido");
      const table = editType === "receivable" ? "financial_receivables" : "financial_payables";
      
      const payload = {
        description: updatedData.description,
        amount: parseMoneyInput(updatedData.amount),
        due_date: updatedData.due_date,
        entity_id: updatedData.entity_id,
        account_id: updatedData.account_id,
      };

      if (!Number.isFinite(payload.amount)) throw new Error("Valor inválido");

      if (editScope === "this-and-future" && editItem.recurrence_group_id) {
        // Atualiza este e os próximos membros do grupo
        const { error } = await supabase
          .from(table)
          .update(payload)
          .eq("tenant_id", activeTenantId)
          .eq("recurrence_group_id", editItem.recurrence_group_id)
          .gte("installment_number", editItem.installment_number);
        if (error) throw error;
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
      showSuccess("Item atualizado com sucesso.");
      setEditDialogOpen(false);
      setEditItem(null);
      qc.invalidateQueries({ queryKey: [editType === "receivable" ? "financial_receivables" : "financial_payables", activeTenantId] });
      qc.invalidateQueries({ queryKey: ["financial_cash_projection", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao atualizar"),
  });

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

        {projectionQ.isError ? (
          <div className="mt-3 text-xs text-red-600 dark:text-red-300">
            Falha ao calcular projeção: {(projectionQ.error as any)?.message ?? "erro"}
          </div>
        ) : null}
      </Card>

      <Tabs defaultValue="receivables" className="w-full">
        <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-slate-100/50 p-1 dark:bg-slate-800/20">
          <TabsTrigger value="budgets" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-900">
            Orçamentos
          </TabsTrigger>
          <TabsTrigger value="receivables" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-900">
            Recebíveis
          </TabsTrigger>
          <TabsTrigger value="payables" className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-900">
            Pagáveis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="budgets" className="mt-4">
          <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cadastro de orçamento</div>

            <div className="mt-4 grid gap-3 md:grid-cols-5">
              <div className="md:col-span-2">
                <Label className="text-xs">Categoria</Label>
                <Select value={budgetCategoryId} onValueChange={setBudgetCategoryId}>
                  <SelectTrigger className="mt-1 rounded-2xl">
                    <SelectValue placeholder={categoriesQ.isLoading ? "Carregando…" : "Selecione"} />
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
          <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Contas a receber</div>

            <div className="mt-4 grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <Label className="text-xs">Descrição</Label>
                <Input className="mt-1 rounded-2xl" value={recvDesc} onChange={(e) => setRecvDesc(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Entidade (Cliente/Inscritível)</Label>
                <AsyncSelect
                  className="mt-1 h-10 rounded-2xl"
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
                <Label className="text-xs">Valor</Label>
                <Input
                  className="mt-1 rounded-2xl"
                  placeholder="Ex: 250,00"
                  value={recvAmount}
                  onChange={(e) => setRecvAmount(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Vencimento</Label>
                <Input
                  className="mt-1 rounded-2xl"
                  type="date"
                  value={recvDueDate}
                  onChange={(e) => setRecvDueDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={recvStatus} onValueChange={setRecvStatus}>
                  <SelectTrigger className="mt-1 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="overdue">Atrasado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label className="text-xs">Conta</Label>
                <Select value={recvAccountId || ""} onValueChange={setRecvAccountId}>
                  <SelectTrigger className="mt-1 rounded-2xl">
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
                <Label className="text-xs">Tipo</Label>
                <Select value={recvType} onValueChange={(v: any) => setRecvType(v)}>
                  <SelectTrigger className="mt-1 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Único</SelectItem>
                    <SelectItem value="recurrent">Recorrente (Mensal)</SelectItem>
                    <SelectItem value="installments">Parcelado (A cada 30 dias)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {recvType !== "single" && (
                <div>
                  <Label className="text-xs">{recvType === 'recurrent' ? 'Meses' : 'Parcelas'}</Label>
                  <Input 
                    type="number" 
                    className="mt-1 rounded-2xl" 
                    value={recvInstallments} 
                    onChange={(e) => setRecvInstallments(e.target.value)} 
                    min="2"
                    max="60"
                  />
                </div>
              )}

              <div className="md:col-span-full flex items-end">
                <Button
                  onClick={generateRecvPreview}
                  disabled={!activeTenantId || createReceivableM.isPending}
                  className="h-10 w-full rounded-2xl md:w-auto"
                >
                  Continuar Cadastro
                </Button>
              </div>

              {showRecvPreview && (
                <div className="md:col-span-full mt-4 p-4 rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold">Confirmar Lançamentos</div>
                    <Button variant="ghost" size="sm" onClick={() => setShowRecvPreview(false)}>Cancelar</Button>
                  </div>
                  <div className="max-h-[300px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <Table>
                      <TableHeader className="bg-white dark:bg-slate-950">
                        <TableRow>
                          <TableHead className="text-[10px] uppercase">Descrição</TableHead>
                          <TableHead className="text-[10px] uppercase">Vencimento</TableHead>
                          <TableHead className="text-[10px] uppercase">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recvPreviewItems.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="py-2 text-xs">
                              <Input 
                                className="h-8 rounded-lg text-xs" 
                                value={item.description} 
                                onChange={(e) => {
                                  const newItems = [...recvPreviewItems];
                                  newItems[idx].description = e.target.value;
                                  setRecvPreviewItems(newItems);
                                }}
                              />
                            </TableCell>
                            <TableCell className="py-2 text-xs">
                              <Input 
                                type="date"
                                className="h-8 rounded-lg text-xs" 
                                value={item.due_date} 
                                onChange={(e) => {
                                  const newItems = [...recvPreviewItems];
                                  newItems[idx].due_date = e.target.value;
                                  setRecvPreviewItems(newItems);
                                }}
                              />
                            </TableCell>
                            <TableCell className="py-2 text-xs font-semibold">
                              {formatMoneyBRL(item.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={() => createReceivableM.mutate()}
                      disabled={createReceivableM.isPending}
                      className="rounded-2xl"
                    >
                      {createReceivableM.isPending ? "Salvando…" : `Confirmar e Gerar ${recvPreviewItems.length} Lançamentos`}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Entidade</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Conciliado</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(receivablesQ.data ?? []).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.description}
                        {r.installments_total && (
                          <span className="ml-2 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                            {r.installment_number}/{r.installments_total}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {r.core_entities?.display_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => {
                            const linked = r.financial_transactions ?? [];
                            if (linked.length > 0) {
                              setReconcileItem(r);
                              setReconcileDialogOpen(true);
                            }
                          }}
                          className={cn(
                            "text-xs font-semibold transition-colors",
                            (r.financial_transactions ?? []).length > 0 
                              ? "text-emerald-600 hover:text-emerald-700 underline underline-offset-4 cursor-pointer" 
                              : "text-slate-400"
                          )}
                        >
                          {formatMoneyBRL((r.financial_transactions ?? []).reduce((acc: number, t: any) => acc + (t.amount ?? 0), 0))}
                        </button>
                      </TableCell>
                      <TableCell>{r.due_date}</TableCell>
                      <TableCell>
                        <Select
                          value={r.status}
                          onValueChange={(v) => updateReceivableStatusM.mutate({ id: r.id, status: v })}
                        >
                          <SelectTrigger className="h-9 w-[140px] rounded-2xl">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                          onClick={() => {
                            setEditType("receivable");
                            setEditItem(r);
                            setEditScope("only-this");
                            setEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4 text-slate-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {!receivablesQ.isLoading && !(receivablesQ.data ?? []).length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-slate-600 dark:text-slate-400">
                        Nenhum recebível ainda.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="payables" className="mt-4">
          <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Contas a pagar</div>

            <div className="mt-4 grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <Label className="text-xs">Descrição</Label>
                <Input className="mt-1 rounded-2xl" value={payDesc} onChange={(e) => setPayDesc(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Entidade (Fornecedor/Destino)</Label>
                <AsyncSelect
                  className="mt-1 h-10 rounded-2xl"
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
                <Label className="text-xs">Valor</Label>
                <Input
                  className="mt-1 rounded-2xl"
                  placeholder="Ex: 320,00"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Vencimento</Label>
                <Input
                  className="mt-1 rounded-2xl"
                  type="date"
                  value={payDueDate}
                  onChange={(e) => setPayDueDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={payStatus} onValueChange={setPayStatus}>
                  <SelectTrigger className="mt-1 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="overdue">Atrasado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label className="text-xs">Conta</Label>
                <Select value={payAccountId || ""} onValueChange={setPayAccountId}>
                  <SelectTrigger className="mt-1 rounded-2xl">
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
                <Label className="text-xs">Tipo</Label>
                <Select value={payType} onValueChange={(v: any) => setPayType(v)}>
                  <SelectTrigger className="mt-1 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Único</SelectItem>
                    <SelectItem value="recurrent">Recorrente (Mensal)</SelectItem>
                    <SelectItem value="installments">Parcelado (A cada 30 dias)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {payType !== "single" && (
                <div>
                  <Label className="text-xs">{payType === 'recurrent' ? 'Meses' : 'Parcelas'}</Label>
                  <Input 
                    type="number" 
                    className="mt-1 rounded-2xl" 
                    value={payInstallments} 
                    onChange={(e) => setPayInstallments(e.target.value)} 
                    min="2"
                    max="60"
                  />
                </div>
              )}

              <div className="md:col-span-full flex items-end">
                <Button
                  onClick={generatePayPreview}
                  disabled={!activeTenantId || createPayableM.isPending}
                  className="h-10 w-full rounded-2xl md:w-auto"
                >
                  Continuar Cadastro
                </Button>
              </div>

              {showPayPreview && (
                <div className="md:col-span-full mt-4 p-4 rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold">Confirmar Lançamentos</div>
                    <Button variant="ghost" size="sm" onClick={() => setShowPayPreview(false)}>Cancelar</Button>
                  </div>
                  <div className="max-h-[300px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <Table>
                      <TableHeader className="bg-white dark:bg-slate-950">
                        <TableRow>
                          <TableHead className="text-[10px] uppercase">Descrição</TableHead>
                          <TableHead className="text-[10px] uppercase">Vencimento</TableHead>
                          <TableHead className="text-[10px] uppercase">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payPreviewItems.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="py-2 text-xs">
                              <Input 
                                className="h-8 rounded-lg text-xs" 
                                value={item.description} 
                                onChange={(e) => {
                                  const newItems = [...payPreviewItems];
                                  newItems[idx].description = e.target.value;
                                  setPayPreviewItems(newItems);
                                }}
                              />
                            </TableCell>
                            <TableCell className="py-2 text-xs">
                              <Input 
                                type="date"
                                className="h-8 rounded-lg text-xs" 
                                value={item.due_date} 
                                onChange={(e) => {
                                  const newItems = [...payPreviewItems];
                                  newItems[idx].due_date = e.target.value;
                                  setPayPreviewItems(newItems);
                                }}
                              />
                            </TableCell>
                            <TableCell className="py-2 text-xs font-semibold">
                              {formatMoneyBRL(item.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={() => createPayableM.mutate()}
                      disabled={createPayableM.isPending}
                      className="rounded-2xl"
                    >
                      {createPayableM.isPending ? "Salvando…" : `Confirmar e Gerar ${payPreviewItems.length} Lançamentos`}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Entidade</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Conciliado</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(payablesQ.data ?? []).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.description}
                        {p.installments_total && (
                          <span className="ml-2 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                            {p.installment_number}/{p.installments_total}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {p.core_entities?.display_name ?? "—"}
                      </TableCell>
                      <TableCell>{formatMoneyBRL(Number(p.amount ?? 0))}</TableCell>
                      <TableCell>
                        <button
                          onClick={() => {
                            const linked = p.financial_transactions ?? [];
                            if (linked.length > 0) {
                              setReconcileItem(p);
                              setReconcileDialogOpen(true);
                            }
                          }}
                          className={cn(
                            "text-xs font-semibold transition-colors",
                            (p.financial_transactions ?? []).length > 0 
                              ? "text-emerald-600 hover:text-emerald-700 underline underline-offset-4 cursor-pointer" 
                              : "text-slate-400"
                          )}
                        >
                          {formatMoneyBRL((p.financial_transactions ?? []).reduce((acc: number, t: any) => acc + (t.amount ?? 0), 0))}
                        </button>
                      </TableCell>
                      <TableCell>{p.due_date}</TableCell>
                      <TableCell>
                        <Select value={p.status} onValueChange={(v) => updatePayableStatusM.mutate({ id: p.id, status: v })}>
                          <SelectTrigger className="h-9 w-[140px] rounded-2xl">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                          onClick={() => {
                            setEditType("payable");
                            setEditItem(p);
                            setEditScope("only-this");
                            setEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4 text-slate-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {!payablesQ.isLoading && !(payablesQ.data ?? []).length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-slate-600 dark:text-slate-400">
                        Nenhum pagável ainda.
                      </TableCell>
                    </TableRow>
                  ) : null}
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

  // Sync state when item changes
  useMemo(() => {
    if (item) {
      setDesc(item.description || "");
      setAmount(String(item.amount || ""));
      setDate(item.due_date || "");
      setEntityId(item.entity_id || null);
      setEntityLabel(item.core_entities?.display_name || null);
      setAccountId(item.account_id || null);
    }
  }, [item]);

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Editar {type === 'receivable' ? 'Recebível' : 'Pagável'}</DialogTitle>
          <DialogDescription>
            Ajuste os detalhes do lançamento planejado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          <div>
            <Label className="text-xs">Descrição</Label>
            <Input className="mt-1 rounded-2xl" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Valor</Label>
              <Input className="mt-1 rounded-2xl" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Vencimento</Label>
              <Input type="date" className="mt-1 rounded-2xl" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Entidade</Label>
            <AsyncSelect
              className="mt-1 h-10 rounded-2xl"
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
            <Label className="text-xs">Conta</Label>
            <Select value={accountId || ""} onValueChange={setAccountId}>
              <SelectTrigger className="mt-1 rounded-2xl">
                <SelectValue placeholder="Opcional" />
              </SelectTrigger>
              <SelectContent>
                {(bankAccounts || []).map((ba: any) => (
                  <SelectItem key={ba.id} value={ba.id}>
                    {ba.bank_name} - {ba.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {item.recurrence_group_id && (
            <div className="mt-2 p-3 rounded-2xl bg-amber-50 border border-amber-100 dark:bg-amber-900/20 dark:border-amber-900/40">
              <Label className="text-xs font-semibold text-amber-800 dark:text-amber-200 block mb-2">Este lançamento faz parte de uma recorrência</Label>
              <Select value={scope} onValueChange={onScopeChange}>
                <SelectTrigger className="h-9 rounded-xl bg-white dark:bg-slate-950">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="only-this">Alterar somente esta parcela ({item.installment_number})</SelectItem>
                  <SelectItem value="this-and-future">Alterar esta e todas as próximas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button 
            disabled={isPending} 
            onClick={() => onSave({ description: desc, amount, due_date: date, entity_id: entityId, account_id: accountId })}
            className="rounded-2xl"
          >
            {isPending ? "Salvando..." : "Salvar Alterações"}
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
