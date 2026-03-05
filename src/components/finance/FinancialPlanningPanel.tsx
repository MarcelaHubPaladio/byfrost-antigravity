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
import { showError, showSuccess } from "@/utils/toast";

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  type: "revenue" | "cost" | "fixed" | "variable" | "other";
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
    queryKey: ["financial_receivables", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_receivables")
        .select("id,tenant_id,description,amount,due_date,status")
        .eq("tenant_id", activeTenantId!)
        .order("due_date", { ascending: true })
        .limit(400);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const payablesQ = useQuery({
    queryKey: ["financial_payables", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_payables")
        .select("id,tenant_id,description,amount,due_date,status")
        .eq("tenant_id", activeTenantId!)
        .order("due_date", { ascending: true })
        .limit(400);
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

  const createReceivableM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const amt = parseMoneyInput(recvAmount);
      if (!recvDesc.trim()) throw new Error("Descrição obrigatória");
      if (!Number.isFinite(amt)) throw new Error("Valor inválido");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(recvDueDate)) throw new Error("Data inválida");

      const { error } = await supabase.from("financial_receivables").insert({
        tenant_id: activeTenantId,
        description: recvDesc.trim(),
        amount: Number(amt.toFixed(2)),
        due_date: recvDueDate,
        status: recvStatus,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      showSuccess("Recebível cadastrado.");
      setRecvDesc("");
      setRecvAmount("");
      setRecvDueDate("");
      await qc.invalidateQueries({ queryKey: ["financial_receivables", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_cash_projection", activeTenantId] });
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao cadastrar recebível"),
  });

  const [payDesc, setPayDesc] = useState<string>("");
  const [payAmount, setPayAmount] = useState<string>("");
  const [payDueDate, setPayDueDate] = useState<string>("");
  const [payStatus, setPayStatus] = useState<string>("pending");

  const createPayableM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const amt = parseMoneyInput(payAmount);
      if (!payDesc.trim()) throw new Error("Descrição obrigatória");
      if (!Number.isFinite(amt)) throw new Error("Valor inválido");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payDueDate)) throw new Error("Data inválida");

      const { error } = await supabase.from("financial_payables").insert({
        tenant_id: activeTenantId,
        description: payDesc.trim(),
        amount: Number(amt.toFixed(2)),
        due_date: payDueDate,
        status: payStatus,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      showSuccess("Pagável cadastrado.");
      setPayDesc("");
      setPayAmount("");
      setPayDueDate("");
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

  const projection = projectionQ.data;

  return (
    <div className="grid gap-4">
      <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Projeção básica de caixa</div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">saldo atual + recebíveis - pagáveis</div>
          </div>
          <Button
            variant="secondary"
            className="h-9 rounded-2xl"
            onClick={() => projectionQ.refetch()}
            disabled={!activeTenantId}
          >
            Atualizar
          </Button>
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

      <Tabs defaultValue="budgets" className="w-full">
        <TabsList className="grid w-full grid-cols-3 rounded-2xl">
          <TabsTrigger value="budgets" className="rounded-2xl">
            Orçamentos
          </TabsTrigger>
          <TabsTrigger value="receivables" className="rounded-2xl">
            Recebíveis
          </TabsTrigger>
          <TabsTrigger value="payables" className="rounded-2xl">
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
                        {c.name} ({c.type})
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

            <div className="mt-4 grid gap-3 md:grid-cols-5">
              <div className="md:col-span-2">
                <Label className="text-xs">Descrição</Label>
                <Input className="mt-1 rounded-2xl" value={recvDesc} onChange={(e) => setRecvDesc(e.target.value)} />
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
                    <SelectItem value="pending">pending</SelectItem>
                    <SelectItem value="paid">paid</SelectItem>
                    <SelectItem value="overdue">overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-5">
                <Button
                  onClick={() => createReceivableM.mutate()}
                  disabled={!activeTenantId || createReceivableM.isPending}
                  className="h-10 w-full rounded-2xl md:w-auto"
                >
                  {createReceivableM.isPending ? "Salvando…" : "Cadastrar recebível"}
                </Button>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(receivablesQ.data ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.description}</TableCell>
                      <TableCell>{formatMoneyBRL(Number(r.amount ?? 0))}</TableCell>
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
                            <SelectItem value="pending">pending</SelectItem>
                            <SelectItem value="paid">paid</SelectItem>
                            <SelectItem value="overdue">overdue</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}

                  {!receivablesQ.isLoading && !(receivablesQ.data ?? []).length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-slate-600 dark:text-slate-400">
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

            <div className="mt-4 grid gap-3 md:grid-cols-5">
              <div className="md:col-span-2">
                <Label className="text-xs">Descrição</Label>
                <Input className="mt-1 rounded-2xl" value={payDesc} onChange={(e) => setPayDesc(e.target.value)} />
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
                    <SelectItem value="pending">pending</SelectItem>
                    <SelectItem value="paid">paid</SelectItem>
                    <SelectItem value="overdue">overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-5">
                <Button
                  onClick={() => createPayableM.mutate()}
                  disabled={!activeTenantId || createPayableM.isPending}
                  className="h-10 w-full rounded-2xl md:w-auto"
                >
                  {createPayableM.isPending ? "Salvando…" : "Cadastrar pagável"}
                </Button>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(payablesQ.data ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.description}</TableCell>
                      <TableCell>{formatMoneyBRL(Number(p.amount ?? 0))}</TableCell>
                      <TableCell>{p.due_date}</TableCell>
                      <TableCell>
                        <Select value={p.status} onValueChange={(v) => updatePayableStatusM.mutate({ id: p.id, status: v })}>
                          <SelectTrigger className="h-9 w-[140px] rounded-2xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">pending</SelectItem>
                            <SelectItem value="paid">paid</SelectItem>
                            <SelectItem value="overdue">overdue</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}

                  {!payablesQ.isLoading && !(payablesQ.data ?? []).length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-slate-600 dark:text-slate-400">
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
    </div>
  );
}
