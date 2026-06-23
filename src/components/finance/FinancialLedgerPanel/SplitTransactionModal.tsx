import React, { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus } from "lucide-react";
import { parseMoneyInput, formatMoneyInput } from "@/lib/financial-utils";
import { formatMoneyBRL } from "@/lib/utils";
import { AsyncSelect } from "@/components/ui/async-select";
import { showError, showSuccess } from "@/utils/toast";

export function SplitTransactionModal({
  open,
  onOpenChange,
  transaction,
}: {
  open: boolean;
  onOpenChange: (val: boolean) => void;
  transaction: any;
}) {
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const qc = useQueryClient();

  const [splits, setSplits] = useState<{ id: string; amount: string; categoryId: string | null; entityId: string | null }[]>([]);

  // Initialize splits when modal opens
  React.useEffect(() => {
    if (open && transaction) {
      const initialAmountStr = transaction.amount ? (Number(transaction.amount) * 100).toFixed(0).toString() : "";
      setSplits([
        { id: "1", amount: formatMoneyInput(initialAmountStr), categoryId: transaction.category_id || null, entityId: transaction.entity_id || null },
      ]);
    }
  }, [open, transaction]);

  const parentAmount = Number(transaction?.amount || 0);

  const totalSplitAmount = useMemo(() => {
    return splits.reduce((acc, split) => acc + parseMoneyInput(split.amount), 0);
  }, [splits]);

  const isValid = totalSplitAmount === parentAmount && splits.length > 1 && splits.every(s => parseMoneyInput(s.amount) > 0);

  const splitM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId || !transaction) throw new Error("Parâmetros inválidos");
      if (!isValid) throw new Error("A soma das parcelas deve ser igual ao valor original.");

      const splitRecords = splits.map(split => {
        const amt = parseMoneyInput(split.amount);
        return {
          tenant_id: activeTenantId,
          account_id: transaction.account_id,
          amount: amt,
          type: transaction.type,
          description: transaction.description,
          transaction_date: transaction.transaction_date,
          competence_date: transaction.competence_date,
          status: transaction.status,
          source: transaction.source,
          fingerprint: transaction.fingerprint + "-split-" + Math.random().toString(36).substring(7),
          raw_payload: transaction.raw_payload,
          category_id: split.categoryId,
          entity_id: split.entityId,
          invoice_number: transaction.invoice_number,
          split_parent_id: transaction.id,
          is_split: false
        };
      });

      const { error: insErr } = await supabase.from("financial_transactions").insert(splitRecords);
      if (insErr) throw insErr;

      const { error: updErr } = await supabase
        .from("financial_transactions")
        .update({ is_split: true })
        .eq("id", transaction.id)
        .eq("tenant_id", activeTenantId);
      
      if (updErr) throw updErr;

      await supabase.from("financial_logs").insert({
        tenant_id: activeTenantId,
        action_type: "SPLIT_TRANSACTION",
        description: `Dividiu o lançamento "${transaction.description}" em ${splits.length} parcelas.`,
        metadata: { parentId: transaction.id, splitsCount: splits.length },
        created_by: user?.id || null
      });
    },
    onSuccess: async () => {
      showSuccess("Lançamento dividido com sucesso!");
      onOpenChange(false);
      await qc.invalidateQueries({ queryKey: ["financial_transactions", activeTenantId] });
      await qc.invalidateQueries({ queryKey: ["financial_cash_projection", activeTenantId] });
    },
    onError: (e: any) => showError(e.message || "Erro ao dividir lançamento"),
  });

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] rounded-3xl">
        <DialogHeader>
          <DialogTitle>Dividir Lançamento</DialogTitle>
          <DialogDescription>
            Divida este lançamento em partes menores, categorizando-as individualmente.
            O total deve ser igual a <strong>{formatMoneyBRL(parentAmount)}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
            {splits.map((split, i) => (
              <div key={split.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="w-[120px]">
                  <Label className="text-[10px] uppercase text-slate-500 mb-1 block">Valor</Label>
                  <Input
                    value={split.amount}
                    onChange={(e) => {
                      const newSplits = [...splits];
                      newSplits[i].amount = formatMoneyInput(e.target.value);
                      setSplits(newSplits);
                    }}
                    className="h-9 text-xs rounded-lg font-mono text-right"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-[10px] uppercase text-slate-500 mb-1 block">Entidade</Label>
                  <AsyncSelect
                    className="h-9 rounded-lg text-xs"
                    value={split.entityId}
                    onChange={(v) => {
                      const newSplits = [...splits];
                      newSplits[i].entityId = v;
                      setSplits(newSplits);
                    }}
                    placeholder="Sem entidade"
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
                <div className="flex-1">
                  <Label className="text-[10px] uppercase text-slate-500 mb-1 block">Categoria</Label>
                  <AsyncSelect
                    className="h-9 rounded-lg text-xs"
                    value={split.categoryId}
                    onChange={(v) => {
                      const newSplits = [...splits];
                      newSplits[i].categoryId = v;
                      setSplits(newSplits);
                    }}
                    placeholder="Sem categoria"
                    loadOptions={async (val) => {
                      if (!activeTenantId) return [];
                      let query = supabase
                        .from("financial_categories")
                        .select("id, name, type")
                        .eq("tenant_id", activeTenantId)
                        .order("name", { ascending: true });
                      if (val) {
                        query = query.ilike("name", `%${val}%`);
                      }
                      const { data } = await query.limit(20);
                      return (data || []).map((d) => ({ value: d.id, label: d.name }));
                    }}
                  />
                </div>
                <div className="pt-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                    onClick={() => {
                      setSplits(splits.filter((s) => s.id !== split.id));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSplits([...splits, { id: Math.random().toString(), amount: "", categoryId: null, entityId: null }]);
              }}
              className="rounded-xl border-dashed h-9 text-xs font-bold text-indigo-600 hover:text-indigo-700"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Parcela
            </Button>
            
            <div className="text-right">
              <div className="text-[10px] uppercase text-slate-500 font-bold">Total Distribuído</div>
              <div className={`text-sm font-black ${totalSplitAmount === parentAmount ? "text-emerald-600" : "text-rose-600"}`}>
                {formatMoneyBRL(totalSplitAmount)} / {formatMoneyBRL(parentAmount)}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" className="rounded-xl h-11" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="rounded-xl h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8"
            onClick={() => splitM.mutate()}
            disabled={!isValid || splitM.isPending}
          >
            {splitM.isPending ? "Dividindo..." : "Confirmar Divisão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
