import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { showError, showSuccess } from "@/utils/toast";
import { Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { prettyAccountType } from "@/lib/financial-utils";

type BankAccountRow = {
  id: string;
  bank_name: string;
  account_name: string;
  account_type: string;
  currency: string;
};

export function BanksTab() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

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

  return (
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

        <Dialog open={bankDialogOpen} onOpenChange={setBankDialogOpen}>
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
                  <Input className="mt-1 rounded-2xl" value={bankCurrency} onChange={(e) => setBankCurrency(e.target.value)} placeholder="BRL" />
                </div>
              </div>

              <div>
                <Label className="text-xs">Nome da conta</Label>
                <Input className="mt-1 rounded-2xl" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} placeholder="Ex: Conta PJ" />
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
              <Button className="h-10 rounded-2xl" onClick={() => saveBankM.mutate()} disabled={saveBankM.isPending || !activeTenantId}>
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
            {(accountsQ.data ?? []).map((acc) => (
              <TableRow key={acc.id}>
                <TableCell className="font-medium text-slate-900 dark:text-slate-100">{acc.account_name}</TableCell>
                <TableCell>{acc.bank_name}</TableCell>
                <TableCell>{prettyAccountType(acc.account_type)}</TableCell>
                <TableCell>{acc.currency}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg text-slate-400 hover:text-indigo-600"
                      onClick={() => {
                        setEditingBank(acc);
                        setBankName(acc.bank_name);
                        setBankAccountName(acc.account_name);
                        setBankAccountType(acc.account_type);
                        setBankCurrency(acc.currency);
                        setBankDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso removerá a conta permanentemente. (Não pode ter transações associadas).
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="rounded-xl bg-rose-600 hover:bg-rose-700"
                            onClick={() => deleteBankM.mutate(acc.id)}
                          >
                            Excluir
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
                  Nenhuma conta encontrada.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
