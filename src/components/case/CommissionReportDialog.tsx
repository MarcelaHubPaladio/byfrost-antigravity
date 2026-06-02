import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, FileText, CalendarIcon, ChevronDown, Check } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  const queryClient = useQueryClient();
  const { activeTenantId } = useTenant();
  const [selectedSellers, setSelectedSellers] = useState<string[]>([]);
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
    if (!dateRange.from) {
      showError("Selecione o período de faturamento.");
      return;
    }
    if (selectedSellers.length === 0) {
      showError("Selecione pelo menos um vendedor.");
      return;
    }
    
    setIsGenerating(true);
    try {
      const start = startOfDay(dateRange.from);
      const end = endOfDay(dateRange.to || dateRange.from);
      let successCount = 0;

      for (const sellerId of selectedSellers) {
        const targetSeller = uniqueSellers.find(s => s.id === sellerId);
        const targetSellerName = targetSeller?.name?.toLowerCase();

        const validOrders = cases.filter(r => {
          let matchesSeller = false;
          if (r.assigned_vendor_id === sellerId) matchesSeller = true;
          if (r.assigned_user_id === sellerId) matchesSeller = true;
          if (targetSellerName) {
            const rowUserName = r.users_profile?.display_name?.toLowerCase();
            const rowVendorName = r.assigned_vendor?.display_name?.toLowerCase();
            if (rowUserName === targetSellerName || rowVendorName === targetSellerName) matchesSeller = true;
          }

          if (!matchesSeller) return false;

          const f = caseDataFields.get(r.id);
          const billStatus = (f?.billing_status || "Pendente").toLowerCase();
          
          if (!billStatus.includes("faturado") && !billStatus.includes("pago")) return false;

          const d = new Date(r.created_at); // Simplification, using created_at
          return isWithinInterval(d, { start, end });
        });

        if (validOrders.length === 0) {
          continue; // Skip this seller if no orders
        }

        const reportData = await calculateCommissionForOrders(
          activeTenantId!,
          sellerId,
          dateRange.from,
          dateRange.to || dateRange.from,
          validOrders,
          caseDataFields,
          caseDataTotals
        );

        reportData.orders = reportData.orders.map((o: any) => {
          const orderRow = validOrders.find(v => v.id === o.case_id);
          const custName = orderRow?.customer_id ? customers.get(orderRow.customer_id)?.name : "—";
          return { ...o, customer_name: custName };
        });

        await saveCommissionReport(activeTenantId!, reportData);
        successCount++;
      }

      if (successCount === 0) {
        showError("Nenhum pedido faturado encontrado para os vendedores no período.");
      } else {
        queryClient.invalidateQueries({ queryKey: ["commission_reports", activeTenantId] });
        showSuccess(`${successCount} relatório(s) gerado(s) com sucesso!`);
        onOpenChange(false);
      }

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
            <Label>Vendedor(es)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal h-10 rounded-xl">
                  {selectedSellers.length > 0 
                    ? `${selectedSellers.length} selecionado(s)` 
                    : "Selecione os vendedores..."}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-2" align="start">
                <ScrollArea className="h-[200px] w-full">
                  <div className="flex flex-col gap-2 p-1">
                    <Button 
                      variant="ghost" 
                      className="justify-start h-8 text-xs underline"
                      onClick={() => {
                        if (selectedSellers.length === uniqueSellers.length) setSelectedSellers([]);
                        else setSelectedSellers(uniqueSellers.map(s => s.id));
                      }}
                    >
                      {selectedSellers.length === uniqueSellers.length ? "Desmarcar todos" : "Selecionar todos"}
                    </Button>
                    {uniqueSellers.map(s => (
                      <div key={s.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`seller-${s.id}`} 
                          checked={selectedSellers.includes(s.id)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedSellers([...selectedSellers, s.id]);
                            else setSelectedSellers(selectedSellers.filter(id => id !== s.id));
                          }}
                        />
                        <label 
                          htmlFor={`seller-${s.id}`} 
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {s.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
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
