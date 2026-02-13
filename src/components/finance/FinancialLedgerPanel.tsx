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
import { showError, showSuccess } from "@/utils/toast";

type BankAccountRow = { id: string; bank_name: string; account_name: string; currency: string };

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

export function FinancialLedgerPanel() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  const accountsQ = useQuery({
    queryKey: ["bank_accounts", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id,bank_name,account_name,currency")
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

  const transactionsQ = useQuery({
    queryKey: ["financial_transactions", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select(
          "id,tenant_id,account_id,amount,type,description,transaction_date,status,source,fingerprint,category_id,created_at"
        )
        .eq("tenant_id", activeTenantId!)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(80);
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
  // Manual transaction form
  // --------------------------
  const [accountId, setAccountId] = useState<string>("");
  const [txDate, setTxDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [txType, setTxType] = useState<"credit" | "debit">("debit");
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  const descNorm = useMemo(() => normalizeDescription(description), [description]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [categoryTouched, setCategoryTouched] = useState(false);

  useEffect(() => {
    // Default to first account
    if (!accountId && (accountsQ.data?.length ?? 0) > 0) {
      setAccountId(accountsQ.data![0].id);
    }
  }, [accountId, accountsQ.data]);

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
      });
      if (insErr) throw insErr;

      // Learning:
      // - If suggestion existed and user kept it: increase confidence
      // - If user changed category: create/update a rule for this pattern
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
    },
    onSuccess: async () => {
      showSuccess("Transação lançada.");
      setAmount("");
      setDescription("");
      setCategoryId("");
      setCategoryTouched(false);
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

  return (
    <div className="grid gap-4">
      <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Categorias</div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Crie categorias para classificar lançamentos e treinar regras automáticas.
            </div>
          </div>

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
                <Button variant="secondary" className="h-10 rounded-2xl" onClick={() => setCatDialogOpen(false)}>
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

        <div className="mt-3 flex flex-wrap gap-2">
          {(categoriesQ.data ?? []).slice(0, 24).map((c) => (
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

      <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Novo lançamento</div>
        <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Se uma regra bater com a descrição, sugerimos automaticamente uma categoria. Ao corrigir, o sistema aprende.
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label className="text-xs">Conta</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="mt-1 rounded-2xl">
                <SelectValue placeholder={accountsQ.isLoading ? "Carregando…" : "Selecione"} />
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
            <Input className="mt-1 rounded-2xl" type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
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

          <div className="md:col-span-4">
            <Label className="text-xs">Descrição</Label>
            <Input className="mt-1 rounded-2xl" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="md:col-span-2 flex items-end">
            <Button
              className="h-10 w-full rounded-2xl"
              onClick={() => createTxM.mutate()}
              disabled={!activeTenantId || createTxM.isPending}
            >
              {createTxM.isPending ? "Salvando…" : "Lançar"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Transações recentes</div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Ajuste a categoria para ensinar a regra (pattern = descrição normalizada).
            </div>
          </div>
          <Button variant="secondary" className="h-9 rounded-2xl" onClick={() => transactionsQ.refetch()}>
            Atualizar
          </Button>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Categoria</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(transactionsQ.data ?? []).map((t) => {
                const acc = accountById.get(t.account_id);
                const cat = t.category_id ? categoryById.get(t.category_id) : null;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{t.transaction_date}</TableCell>
                    <TableCell className="min-w-[260px]">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{t.description ?? "—"}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {t.source} • {t.status}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {acc ? `${acc.account_name}` : String(t.account_id).slice(0, 8)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{t.type}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{formatMoneyBRL(Number(t.amount ?? 0))}</TableCell>
                    <TableCell className="min-w-[220px]">
                      <Select
                        value={t.category_id ?? ""}
                        onValueChange={(v) => updateTxCategoryM.mutate({ id: t.id, description: t.description, categoryId: v })}
                      >
                        <SelectTrigger className="h-9 rounded-2xl">
                          <SelectValue placeholder="(sem categoria)" />
                        </SelectTrigger>
                        <SelectContent>
                          {(categoriesQ.data ?? []).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} ({c.type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {cat ? (
                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{cat.type}</div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}

              {!transactionsQ.isLoading && !(transactionsQ.data ?? []).length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-slate-600 dark:text-slate-400">
                    Nenhuma transação ainda.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}