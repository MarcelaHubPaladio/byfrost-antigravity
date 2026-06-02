import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, Loader2, FileText, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import { calculateCommissionForOrders, saveCommissionReport } from "@/utils/commissionUtils";
import { useTenant } from "@/providers/TenantProvider";

export function CommissionReportDialog({
  open,
  onOpenChange,
  vendors,
  users,
  cases,
  caseDataFields,
  caseDataTotals,
  customers
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendors: any[];
  users: any[];
  cases: any[];
  caseDataFields: Map<string, any>;
  caseDataTotals: Map<string, number>;
  customers: Map<string, any>;
}) {
  const { activeTenantId } = useTenant();
  const [selectedSeller, setSelectedSeller] = useState<string>("");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date | undefined }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const combinedSellers = [
    ...vendors.map(v => ({ id: v.id, name: v.display_name, type: "vendor" })),
    ...users.map(u => ({ id: u.user_id, name: u.display_name || u.email, type: "user" }))
  ];

  // Remove duplicates by name to avoid confusion
  const uniqueSellers = combinedSellers.filter((v, i, a) => a.findIndex(t => (t.name === v.name)) === i).sort((a,b) => a.name.localeCompare(b.name));

  const handleGenerate = async () => {
    if (!selectedSeller) {
      showError("Selecione um vendedor.");
      return;
    }
    if (!dateRange.from) {
      showError("Selecione o período.");
      return;
    }

    setIsGenerating(true);
    try {
      // 1. Filter orders
      const start = startOfDay(dateRange.from);
      const end = endOfDay(dateRange.to || dateRange.from);

      const targetSeller = uniqueSellers.find(s => s.id === selectedSeller);
      const targetSellerName = targetSeller?.name?.toLowerCase();

      const validOrders = cases.filter(r => {
        // Filter by seller
        let matchesSeller = false;
        if (r.assigned_vendor_id === selectedSeller) matchesSeller = true;
        if (r.assigned_user_id === selectedSeller) matchesSeller = true;
        if (targetSellerName) {
          const rowUserName = r.users_profile?.display_name?.toLowerCase();
          const rowVendorName = r.assigned_vendor?.display_name?.toLowerCase();
          if (rowUserName === targetSellerName || rowVendorName === targetSellerName) matchesSeller = true;
        }

        if (!matchesSeller) return false;

        // Filter by date
        const f = caseDataFields.get(r.id);
        const billStatus = (f?.billing_status || "Pendente").toLowerCase();
        
        // Only "Faturado", "Pago" or "Faturado Parcial"
        if (!billStatus.includes("faturado") && !billStatus.includes("pago")) return false;

        // Date check
        const d = new Date(r.created_at); // Simplification, using created_at
        return isWithinInterval(d, { start, end });
      });

      if (validOrders.length === 0) {
        showError("Nenhum pedido faturado encontrado para este vendedor no período selecionado.");
        setIsGenerating(false);
        return;
      }

      // Calculate
      const reportData = await calculateCommissionForOrders(
        activeTenantId!,
        selectedSeller,
        dateRange.from,
        dateRange.to || dateRange.from,
        validOrders,
        caseDataFields,
        caseDataTotals
      );

      // Map customer names
      reportData.orders = reportData.orders.map((o: any) => {
        const orderRow = validOrders.find(v => v.id === o.case_id);
        const custName = orderRow?.customer_id ? customers.get(orderRow.customer_id)?.name : "—";
        return { ...o, customer_name: custName };
      });

      // Save
      await saveCommissionReport(activeTenantId!, reportData);

      showSuccess(`Relatório de ${reportData.seller_name} gerado com sucesso! Disponível em Financeiro > Comissões.`);
      onOpenChange(false);

    } catch (e: any) {
      showError(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            Relatório de Comissões
          </DialogTitle>
          <DialogDescription>
            Gera um fechamento imutável de comissões para o vendedor selecionado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label>Vendedor</Label>
            <div className="relative">
              <select
                className="flex h-10 w-full appearance-none rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedSeller}
                onChange={(e) => setSelectedSeller(e.target.value)}
              >
                <option value="">Selecione um vendedor...</option>
                {uniqueSellers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Período de Faturamento</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal h-10 rounded-xl",
                    !dateRange.from && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "dd/MM/yyyy")} -{" "}
                        {format(dateRange.to, "dd/MM/yyyy")}
                      </>
                    ) : (
                      format(dateRange.from, "dd/MM/yyyy")
                    )
                  ) : (
                    <span>Selecione o período</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(v: any) => setDateRange(v || { from: undefined, to: undefined })}
                  numberOfMonths={2}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleGenerate} disabled={isGenerating} className="bg-indigo-600 hover:bg-indigo-700">
            {isGenerating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Gerar Fechamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
