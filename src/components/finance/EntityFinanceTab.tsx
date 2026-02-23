import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type EntityFinanceTabProps = {
    tenantId: string;
    entityId: string;
};

function formatMoneyBRL(n: number | null | undefined) {
    const x = Number(n ?? 0);
    try {
        return x.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    } catch {
        return `R$ ${x.toFixed(2)}`;
    }
}

export function EntityFinanceTab({ tenantId, entityId }: EntityFinanceTabProps) {
    const txQuery = useQuery({
        queryKey: ["entity_financial_transactions", tenantId, entityId],
        enabled: Boolean(tenantId && entityId),
        queryFn: async () => {
            const { data, error } = await supabase
                .from("financial_transactions")
                .select(`
          id,
          amount,
          type,
          description,
          transaction_date,
          status,
          source,
          category_id,
          financial_categories(name)
        `)
                .eq("tenant_id", tenantId)
                .eq("entity_id", entityId)
                .order("transaction_date", { ascending: false });

            if (error) throw error;
            return data || [];
        },
    });

    const summary = useMemo(() => {
        const list = txQuery.data || [];
        let totalCredit = 0;
        let totalDebit = 0;

        for (const tx of list) {
            if (tx.type === "credit") totalCredit += Number(tx.amount || 0);
            if (tx.type === "debit") totalDebit += Number(tx.amount || 0);
        }

        return {
            totalCredit,
            totalDebit,
            balance: totalCredit - totalDebit,
            count: list.length,
        };
    }, [txQuery.data]);

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="rounded-2xl border-slate-200 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Entradas (Créditos)</div>
                    <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {formatMoneyBRL(summary.totalCredit)}
                    </div>
                </Card>
                <Card className="rounded-2xl border-slate-200 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Saídas (Débitos)</div>
                    <div className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
                        {formatMoneyBRL(summary.totalDebit)}
                    </div>
                </Card>
                <Card className="rounded-2xl border-slate-200 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Saldo no Período</div>
                    <div className={`mt-2 text-2xl font-bold ${summary.balance >= 0 ? "text-slate-900 dark:text-slate-100" : "text-rose-600"}`}>
                        {formatMoneyBRL(summary.balance)}
                    </div>
                </Card>
            </div>

            <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex flex-col mb-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Lançamentos da Entidade</h3>
                    <p className="text-xs text-slate-500 mt-1">
                        Histórico de todas as transações financeiras vinculadas a este cadastro.
                    </p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead>Categoria</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(txQuery.data || []).map((t) => (
                                <TableRow key={t.id}>
                                    <TableCell className="whitespace-nowrap">{t.transaction_date}</TableCell>
                                    <TableCell className="min-w-[200px]">
                                        <div className="font-medium text-slate-900 dark:text-slate-100">{t.description || "—"}</div>
                                        <div className="text-[11px] text-slate-500">Fonte: {t.source}</div>
                                    </TableCell>
                                    <TableCell>
                                        {(t.financial_categories as any)?.name ? (
                                            <Badge variant="outline">{(t.financial_categories as any).name}</Badge>
                                        ) : (
                                            <span className="text-slate-400">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={t.status === "posted" ? "default" : "secondary"}>
                                            {t.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className={`whitespace-nowrap text-right font-medium ${t.type === 'credit' ? 'text-emerald-600' : 'text-slate-900 dark:text-white'}`}>
                                        {t.type === 'debit' ? '-' : '+'} {formatMoneyBRL(Number(t.amount))}
                                    </TableCell>
                                </TableRow>
                            ))}

                            {!txQuery.isLoading && summary.count === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-6 text-slate-500">
                                        Nenhuma transação encontrada para esta entidade.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    );
}
