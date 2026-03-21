import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, FilterX } from "lucide-react";
import { Button } from "@/components/ui/button";

type EntityFinanceTabProps = {
    tenantId: string;
    entityId: string;
};

const MONTHS = [
    { value: "01", label: "Janeiro" },
    { value: "02", label: "Fevereiro" },
    { value: "03", label: "Março" },
    { value: "04", label: "Abril" },
    { value: "05", label: "Maio" },
    { value: "06", label: "Junho" },
    { value: "07", label: "Julho" },
    { value: "08", label: "Agosto" },
    { value: "09", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
];

function formatMoneyBRL(n: number | null | undefined) {
    const x = Number(n ?? 0);
    try {
        return x.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    } catch {
        return `R$ ${x.toFixed(2)}`;
    }
}

export function EntityFinanceTab({ tenantId, entityId }: EntityFinanceTabProps) {
    const [selectedMonth, setSelectedMonth] = useState<string>(
        (new Date().getMonth() + 1).toString().padStart(2, "0")
    );
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

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

    const filteredTransactions = useMemo(() => {
        const list = txQuery.data || [];
        return list.filter((tx) => {
            if (!tx.transaction_date) return false;
            const isAllMonths = selectedMonth === "all";
            const isAllYears = selectedYear === "all";

            const [year, month] = tx.transaction_date.split("-");
            
            const monthMatch = isAllMonths || month === selectedMonth;
            const yearMatch = isAllYears || year === selectedYear;

            return monthMatch && yearMatch;
        });
    }, [txQuery.data, selectedMonth, selectedYear]);

    const summary = useMemo(() => {
        let totalCredit = 0;
        let totalDebit = 0;

        for (const tx of filteredTransactions) {
            if (tx.type === "credit") totalCredit += Number(tx.amount || 0);
            if (tx.type === "debit") totalDebit += Number(tx.amount || 0);
        }

        return {
            totalCredit,
            totalDebit,
            balance: totalCredit - totalDebit,
            count: filteredTransactions.length,
        };
    }, [filteredTransactions]);

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const yrs = new Set<string>();
        yrs.add(currentYear.toString());
        
        (txQuery.data || []).forEach(tx => {
            if (tx.transaction_date) {
                const y = tx.transaction_date.split("-")[0];
                if (y) yrs.add(y);
            }
        });

        return Array.from(yrs).sort((a, b) => b.localeCompare(a));
    }, [txQuery.data]);

    const resetFilters = () => {
        setSelectedMonth("all");
        setSelectedYear("all");
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white/50 p-3 rounded-2xl border border-slate-200 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <CalendarDays className="h-4 w-4" />
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-slate-900 leading-tight">Filtrar Período</h4>
                        <p className="text-[10px] text-slate-500 uppercase tracking-tight">Competência dos lançamentos</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="h-9 w-full sm:w-[140px] rounded-xl text-xs bg-white border-slate-200">
                            <SelectValue placeholder="Mês" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            <SelectItem value="all">Todos os Meses</SelectItem>
                            {MONTHS.map(m => (
                                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                        <SelectTrigger className="h-9 w-full sm:w-[100px] rounded-xl text-xs bg-white border-slate-200">
                            <SelectValue placeholder="Ano" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            <SelectItem value="all">Todos</SelectItem>
                            {years.map(y => (
                                <SelectItem key={y} value={y}>{y}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {(selectedMonth !== "all" || selectedYear !== "all") && (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-9 w-9 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            onClick={resetFilters}
                        >
                            <FilterX className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="rounded-2xl border-slate-200 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40 border-l-4 border-l-emerald-500">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Entradas</div>
                    <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {formatMoneyBRL(summary.totalCredit)}
                    </div>
                </Card>
                <Card className="rounded-2xl border-slate-200 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40 border-l-4 border-l-rose-500">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Saídas</div>
                    <div className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
                        {formatMoneyBRL(summary.totalDebit)}
                    </div>
                </Card>
                <Card className="rounded-2xl border-slate-200 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40 border-l-4 border-l-indigo-500">
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
                        Histórico de todas as transações financeiras filtradas pelo período selecionado.
                    </p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/50">
                                <TableHead className="text-[10px] font-bold uppercase text-slate-400">Data</TableHead>
                                <TableHead className="text-[10px] font-bold uppercase text-slate-400">Descrição</TableHead>
                                <TableHead className="text-[10px] font-bold uppercase text-slate-400">Categoria</TableHead>
                                <TableHead className="text-[10px] font-bold uppercase text-slate-400">Status</TableHead>
                                <TableHead className="text-right text-[10px] font-bold uppercase text-slate-400">Valor</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTransactions.map((t) => (
                                <TableRow key={t.id} className="hover:bg-slate-50/50 transition-colors">
                                    <TableCell className="whitespace-nowrap text-xs font-medium text-slate-600">
                                        {new Date(t.transaction_date).toLocaleDateString("pt-BR")}
                                    </TableCell>
                                    <TableCell className="min-w-[200px]">
                                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">{t.description || "—"}</div>
                                        <div className="text-[10px] text-slate-400 leading-none mt-1">Fonte: {t.source}</div>
                                    </TableCell>
                                    <TableCell>
                                        {(t.financial_categories as any)?.name ? (
                                            <Badge variant="outline" className="bg-slate-50 text-[10px] font-medium border-slate-200">
                                                {(t.financial_categories as any).name}
                                            </Badge>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge 
                                            variant={t.status === "posted" ? "default" : "secondary"}
                                            className={`text-[10px] font-bold uppercase tracking-wider h-5 ${t.status === 'posted' ? 'bg-indigo-600' : 'bg-slate-100 text-slate-500'}`}
                                        >
                                            {t.status === 'posted' ? 'Lançado' : 'Pendente'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className={`whitespace-nowrap text-right font-bold text-xs ${t.type === 'credit' ? 'text-emerald-600' : 'text-slate-900 dark:text-white'}`}>
                                        {t.type === 'debit' ? '-' : '+'} {formatMoneyBRL(Number(t.amount))}
                                    </TableCell>
                                </TableRow>
                            ))}

                            {!txQuery.isLoading && summary.count === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-12 text-slate-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <FilterX className="h-8 w-8 text-slate-200" />
                                            <p className="text-sm">Nenhuma transação encontrada no período.</p>
                                        </div>
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
