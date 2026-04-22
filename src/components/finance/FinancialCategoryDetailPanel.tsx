import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { formatMoneyBRL } from "@/lib/utils";
import { ArrowLeft, Calendar, FileText, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

interface Props {
  categoryId: string;
  startDate?: string;
  endDate?: string;
  categoryName?: string;
}

export function FinancialCategoryDetailPanel({ categoryId, startDate, endDate, categoryName }: Props) {
  const { activeTenantId } = useTenant();
  const navigate = useNavigate();

  const transactionsQ = useQuery({
    queryKey: ["financial_transactions_category_detail", activeTenantId, categoryId, startDate, endDate],
    enabled: Boolean(activeTenantId && categoryId),
    queryFn: async () => {
      let query = supabase
        .from("financial_transactions")
        .select(`
          *,
          core_entities (display_name)
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("category_id", categoryId)
        .order("transaction_date", { ascending: false });

      if (startDate) query = query.gte("transaction_date", startDate);
      if (endDate) query = query.lte("transaction_date", endDate);

      const { data, error } = await query.limit(1000);
      if (error) throw error;
      return data;
    },
  });

  const totalAmount = useMemo(() => {
    return (transactionsQ.data ?? []).reduce((acc, t) => {
      const amt = Number(t.amount || 0);
      return acc + (t.type === "credit" ? amt : -amt);
    }, 0);
  }, [transactionsQ.data]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full" 
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {categoryName || "Detalhes da Categoria"}
            </h2>
            <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {startDate && endDate 
                  ? `${new Date(startDate).toLocaleDateString("pt-BR")} até ${new Date(endDate).toLocaleDateString("pt-BR")}`
                  : "Todo o período"}
              </span>
            </div>
          </div>
        </div>

        <Card className="flex items-center gap-4 px-4 py-2 rounded-2xl bg-white/50 backdrop-blur dark:bg-slate-950/50">
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase text-slate-500">Total no período</div>
            <div className={`text-lg font-bold ${totalAmount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {formatMoneyBRL(totalAmount)}
            </div>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-[22px] border-slate-200 bg-white/70 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50 dark:bg-slate-900/50">
              <TableHead className="w-[120px]">Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>NFE</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactionsQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
                    <span className="text-sm text-slate-500">Carregando lançamentos...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : transactionsQ.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-slate-500">
                  Nenhum lançamento encontrado para esta categoria no período selecionado.
                </TableCell>
              </TableRow>
            ) : (
              transactionsQ.data?.map((t) => (
                <TableRow key={t.id} className="group hover:bg-slate-50 dark:hover:bg-slate-900/40">
                  <TableCell className="text-xs font-medium">
                    {new Date(t.transaction_date).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        {t.description || "Sem descrição"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {t.core_entities?.display_name || "Não informado"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {t.invoice_number || "—"}
                  </TableCell>
                  <TableCell>
                    {t.linked_payable_id || t.linked_receivable_id ? (
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border-0 text-[10px]">
                        Conciliado
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-0 text-[10px]">
                        Pendente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-semibold text-sm ${t.type === "credit" ? "text-emerald-600" : "text-rose-600"}`}>
                    {t.type === "credit" ? "+" : "-"} {formatMoneyBRL(t.amount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
