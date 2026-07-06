import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BookOpen, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Calendar, Wallet, Check, Cloud, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { showError, showSuccess } from "@/utils/toast";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";

interface DigitalLedgerEntry {
  id: string;
  tenant_id: string;
  entry_date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  is_paid: boolean;
  created_at: string;
}

export function DigitalLedgerTab() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  // Date and month state
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [pickerYear, setPickerYear] = useState(currentMonth.getFullYear());
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  useEffect(() => {
    setPickerYear(currentMonth.getFullYear());
  }, [currentMonth]);

  const startDate = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const endDate = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

  const formatMonthLabel = (date: Date) => {
    const label = format(date, "MMMM 'de' yyyy", { locale: ptBR });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const monthsList = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez"
  ];

  // Fetch entries
  const entriesQ = useQuery({
    queryKey: ["digital_ledger_entries", activeTenantId, startDate, endDate],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("digital_ledger_entries")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .gte("entry_date", startDate)
        .lte("entry_date", endDate)
        .order("entry_date", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as DigitalLedgerEntry[];
    },
  });

  const entries = entriesQ.data ?? [];
  const entradas = entries.filter(e => e.type === "income");
  const saidas = entries.filter(e => e.type === "expense");

  const totalEntradas = entradas.reduce((acc, curr) => acc + Number(curr.amount), 0);
  const totalSaidas = saidas.reduce((acc, curr) => acc + Number(curr.amount), 0);
  const saldo = totalEntradas - totalSaidas;

  const totalEntradasPagas = entradas.filter(e => e.is_paid).reduce((acc, curr) => acc + Number(curr.amount), 0);
  const totalSaidasPagas = saidas.filter(e => e.is_paid).reduce((acc, curr) => acc + Number(curr.amount), 0);
  const saldoPago = totalEntradasPagas - totalSaidasPagas;

  // Selection states & calculations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentMonth]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedEntries = entries.filter(e => selectedIds.has(e.id));
  const selectedEntradas = selectedEntries.filter(e => e.type === "income");
  const selectedSaidas = selectedEntries.filter(e => e.type === "expense");

  const selectedTotalEntradas = selectedEntradas.reduce((acc, curr) => acc + Number(curr.amount), 0);
  const selectedTotalSaidas = selectedSaidas.reduce((acc, curr) => acc + Number(curr.amount), 0);
  const selectedSaldo = selectedTotalEntradas - selectedTotalSaidas;

  // Daily cash flow data
  const chartData = React.useMemo(() => {
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const data = [];
    let runningBalance = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, "0");
      const monthStr = String(currentMonth.getMonth() + 1).padStart(2, "0");
      const yearStr = currentMonth.getFullYear();
      const dateKey = `${yearStr}-${monthStr}-${dayStr}`;

      const dayEntries = entries.filter(e => e.entry_date === dateKey);
      const dayEntradas = dayEntries.filter(e => e.type === "income").reduce((acc, curr) => acc + Number(curr.amount), 0);
      const daySaidas = dayEntries.filter(e => e.type === "expense").reduce((acc, curr) => acc + Number(curr.amount), 0);
      const dayNet = dayEntradas - daySaidas;
      runningBalance += dayNet;

      data.push({
        date: dateKey,
        label: `${dayStr}/${monthStr}`,
        entradas: dayEntradas,
        saidas: daySaidas,
        saldoDia: dayNet,
        saldoAcumulado: runningBalance
      });
    }
    return data;
  }, [entries, currentMonth]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3 rounded-xl border border-slate-850 text-xs shadow-xl flex flex-col gap-1.5 min-w-[180px]">
          <p className="font-semibold text-slate-450">
            {format(new Date(data.date + "T00:00:00"), "dd 'de' MMMM", { locale: ptBR })}
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Entradas:</span>
              <span className="text-emerald-450 font-bold">{formatCurrency(data.entradas)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Saídas:</span>
              <span className="text-rose-450 font-bold">{formatCurrency(data.saidas)}</span>
            </div>
            <div className="border-t border-slate-800 my-1"></div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-450 font-medium">Saldo do Dia:</span>
              <span className={`font-bold ${data.saldoDia >= 0 ? "text-emerald-450" : "text-rose-450"}`}>
                {formatCurrency(data.saldoDia)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-450 font-medium">Saldo Acumulado:</span>
              <span className={`font-bold ${data.saldoAcumulado >= 0 ? "text-emerald-450" : "text-rose-450"}`}>
                {formatCurrency(data.saldoAcumulado)}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // CRUD Dialog States
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DigitalLedgerEntry | null>(null);
  
  // Form fields
  const [entryDate, setEntryDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"income" | "expense">("income");
  const [isPaid, setIsPaid] = useState(false);

  // Delete Alert States
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Setup form for add/edit
  const handleOpenAdd = (defaultType: "income" | "expense") => {
    setEditingEntry(null);
    setDescription("");
    setAmount("");
    setType(defaultType);
    setIsPaid(false);
    
    // Default date to current month's start or today if today is in the current month
    const today = new Date();
    if (today.getFullYear() === currentMonth.getFullYear() && today.getMonth() === currentMonth.getMonth()) {
      setEntryDate(format(today, "yyyy-MM-dd"));
    } else {
      setEntryDate(format(startOfMonth(currentMonth), "yyyy-MM-dd"));
    }
    setDialogOpen(true);
  };

  const handleOpenEdit = (entry: DigitalLedgerEntry) => {
    setEditingEntry(entry);
    setEntryDate(entry.entry_date);
    setDescription(entry.description);
    setAmount(String(entry.amount));
    setType(entry.type);
    setIsPaid(entry.is_paid);
    setDialogOpen(true);
  };

  // Mutations
  const saveEntryM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const desc = description.trim();
      const val = parseFloat(amount);
      if (!desc) throw new Error("A descrição é obrigatória");
      if (isNaN(val) || val <= 0) throw new Error("Insira um valor maior que zero");
      if (!entryDate) throw new Error("A data é obrigatória");

      const payload = {
        tenant_id: activeTenantId,
        entry_date: entryDate,
        description: desc,
        amount: val,
        type,
        is_paid: isPaid,
      };

      if (editingEntry) {
        const { error } = await supabase
          .from("digital_ledger_entries")
          .update(payload)
          .eq("tenant_id", activeTenantId)
          .eq("id", editingEntry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("digital_ledger_entries")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      showSuccess(editingEntry ? "Anotação atualizada." : "Anotação criada.");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["digital_ledger_entries", activeTenantId] });
    },
    onError: (err: any) => showError(err.message ?? "Erro ao salvar anotação"),
  });

  const togglePaidM = useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const { error } = await supabase
        .from("digital_ledger_entries")
        .update({ is_paid: paid })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["digital_ledger_entries", activeTenantId] });
    },
    onError: (err: any) => showError(err.message ?? "Erro ao atualizar status"),
  });

  const deleteEntryM = useMutation({
    mutationFn: async (id: string) => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const { error } = await supabase
        .from("digital_ledger_entries")
        .delete()
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Anotação removida.");
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["digital_ledger_entries", activeTenantId] });
    },
    onError: (err: any) => showError(err.message ?? "Erro ao remover anotação"),
  });

  // Helpers
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };

  const formatDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split("-");
      return `${day}/${month}`;
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Month Navigation and Status bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Caderneta de Finanças
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Simples, organizada e prática
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/70 p-1 rounded-xl border border-slate-200/40 dark:border-slate-700/40">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrevMonth}
              className="h-8 w-8 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:shadow-xs"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 px-3 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 hover:shadow-xs font-medium text-xs flex items-center gap-1.5"
                >
                  <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                  {formatMonthLabel(currentMonth)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950" align="center">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setPickerYear(prev => prev - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {pickerYear}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setPickerYear(prev => prev + 1)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {monthsList.map((m, idx) => {
                    const isSelected = currentMonth.getFullYear() === pickerYear && currentMonth.getMonth() === idx;
                    return (
                      <Button
                        key={m}
                        variant={isSelected ? "default" : "ghost"}
                        className={`h-9 text-xs rounded-lg ${isSelected ? "bg-indigo-600 text-white" : ""}`}
                        onClick={() => {
                          const newDate = new Date(pickerYear, idx, 1);
                          setCurrentMonth(newDate);
                          setMonthPickerOpen(false);
                        }}
                      >
                        {m}
                      </Button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleNextMonth}
              className="h-8 w-8 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:shadow-xs"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900 p-2 px-3 rounded-xl border border-slate-100 dark:border-slate-800">
            <Cloud className="h-3.5 w-3.5 text-slate-400" />
            Seus dados são salvos automaticamente
          </div>
        </div>
      </div>

      {/* Fluxo de Caixa Chart */}
      <Card className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 overflow-hidden shadow-xs bg-white dark:bg-slate-900">
        <div className="p-5 border-b border-slate-200/60 dark:border-slate-800/60">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Fluxo de Caixa Diário
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Evolução do saldo acumulado (linha roxa) e saldo diário (barras representam o saldo líquido de cada dia).
          </p>
        </div>
        <div className="p-5 pl-2">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/40" />
              <XAxis 
                dataKey="label" 
                tickLine={false} 
                axisLine={false}
                tick={{ fill: '#94a3b8', fontSize: 9 }}
                dy={8}
              />
              <YAxis 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => `R$ ${val.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
                tick={{ fill: '#94a3b8', fontSize: 9 }}
                dx={-8}
              />
              <RechartsTooltip content={<CustomTooltip />} />
              <Bar dataKey="saldoDia" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.saldoDia >= 0 ? '#10b981' : '#f43f5e'} opacity={0.85} />
                ))}
              </Bar>
              <Line 
                type="monotone" 
                dataKey="saldoAcumulado" 
                stroke="#6366f1" 
                strokeWidth={2} 
                dot={false}
                activeDot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Inputs and Outputs Table Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* ENTRADAS */}
        <Card className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 overflow-hidden shadow-xs">
          <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/10 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
              <span className="font-semibold text-slate-800 dark:text-slate-100">Entradas</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleOpenAdd("income")}
              className="h-8 px-2.5 rounded-lg border-emerald-200 hover:border-emerald-300 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-xs flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova Entrada
            </Button>
          </div>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
                <TableRow className="border-b border-slate-100 dark:border-slate-800">
                  <TableHead className="w-[40px] pl-4 py-3"></TableHead>
                  <TableHead className="w-[100px] text-xs font-medium text-slate-500 dark:text-slate-400 py-3">Data</TableHead>
                  <TableHead className="text-xs font-medium text-slate-500 dark:text-slate-400 py-3">Descrição</TableHead>
                  <TableHead className="text-xs font-medium text-slate-500 dark:text-slate-400 py-3 text-right">Valor</TableHead>
                  <TableHead className="w-[80px] text-xs font-medium text-slate-500 dark:text-slate-400 py-3 text-center pr-4">Pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entradas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-slate-400 dark:text-slate-500 text-xs py-8 pl-4 pr-4">
                      Nenhuma entrada anotada neste mês.
                    </TableCell>
                  </TableRow>
                ) : (
                  entradas.map(entry => (
                    <TableRow key={entry.id} className={`group border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/30 dark:hover:bg-slate-900/20 transition-colors ${selectedIds.has(entry.id) ? "bg-indigo-50/25 dark:bg-indigo-950/15" : ""}`}>
                      <TableCell className="py-2.5 pl-4 w-[40px] text-center">
                        <button
                          onClick={() => handleToggleSelect(entry.id)}
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                            selectedIds.has(entry.id)
                              ? "bg-indigo-600 border-indigo-600 text-white"
                              : "border-slate-300 dark:border-slate-600 hover:border-indigo-500"
                          }`}
                        >
                          {selectedIds.has(entry.id) && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                        </button>
                      </TableCell>
                      <TableCell className="py-2.5 font-medium text-xs text-slate-600 dark:text-slate-300">
                        {formatDate(entry.entry_date)}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-slate-800 dark:text-slate-200">
                        <div className="flex items-center justify-between gap-2 max-w-full">
                          <span className="truncate">{entry.description}</span>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md"
                              onClick={() => handleOpenEdit(entry)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-slate-400 hover:text-rose-600 rounded-md"
                              onClick={() => setDeleteId(entry.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(entry.amount)}
                      </TableCell>
                      <TableCell className="py-2.5 text-center pr-4">
                        <div className="flex justify-center">
                          <button
                            onClick={() => togglePaidM.mutate({ id: entry.id, paid: !entry.is_paid })}
                            disabled={togglePaidM.isPending}
                            className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                              entry.is_paid
                                ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                                : "border-slate-300 dark:border-slate-600 hover:border-emerald-500"
                            }`}
                          >
                            {entry.is_paid && <Check className="h-3 w-3 stroke-[3]" />}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="p-4 bg-emerald-50/20 dark:bg-emerald-950/5 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-xs">
              <span className="font-medium text-emerald-800 dark:text-emerald-400">Total (Recebido / Total)</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-300 text-sm">
                {formatCurrency(totalEntradasPagas)} / {formatCurrency(totalEntradas)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* SAÍDAS */}
        <Card className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 overflow-hidden shadow-xs">
          <div className="p-4 bg-rose-50/50 dark:bg-rose-950/10 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-rose-600 dark:text-rose-500" />
              <span className="font-semibold text-slate-800 dark:text-slate-100">Saídas</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleOpenAdd("expense")}
              className="h-8 px-2.5 rounded-lg border-rose-200 hover:border-rose-300 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova Saída
            </Button>
          </div>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
                <TableRow className="border-b border-slate-100 dark:border-slate-800">
                  <TableHead className="w-[40px] pl-4 py-3"></TableHead>
                  <TableHead className="w-[100px] text-xs font-medium text-slate-500 dark:text-slate-400 py-3">Data</TableHead>
                  <TableHead className="text-xs font-medium text-slate-500 dark:text-slate-400 py-3">Descrição</TableHead>
                  <TableHead className="text-xs font-medium text-slate-500 dark:text-slate-400 py-3 text-right">Valor</TableHead>
                  <TableHead className="w-[80px] text-xs font-medium text-slate-500 dark:text-slate-400 py-3 text-center pr-4">Pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saidas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-slate-400 dark:text-slate-500 text-xs py-8 pl-4 pr-4">
                      Nenhuma saída anotada neste mês.
                    </TableCell>
                  </TableRow>
                ) : (
                  saidas.map(entry => (
                    <TableRow key={entry.id} className={`group border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/30 dark:hover:bg-slate-900/20 transition-colors ${selectedIds.has(entry.id) ? "bg-indigo-50/25 dark:bg-indigo-950/15" : ""}`}>
                      <TableCell className="py-2.5 pl-4 w-[40px] text-center">
                        <button
                          onClick={() => handleToggleSelect(entry.id)}
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                            selectedIds.has(entry.id)
                              ? "bg-indigo-600 border-indigo-600 text-white"
                              : "border-slate-300 dark:border-slate-600 hover:border-indigo-500"
                          }`}
                        >
                          {selectedIds.has(entry.id) && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                        </button>
                      </TableCell>
                      <TableCell className="py-2.5 font-medium text-xs text-slate-600 dark:text-slate-300">
                        {formatDate(entry.entry_date)}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-slate-800 dark:text-slate-200">
                        <div className="flex items-center justify-between gap-2 max-w-full">
                          <span className="truncate">{entry.description}</span>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md"
                              onClick={() => handleOpenEdit(entry)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-slate-400 hover:text-rose-600 rounded-md"
                              onClick={() => setDeleteId(entry.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-semibold text-xs text-rose-600 dark:text-rose-400">
                        {formatCurrency(entry.amount)}
                      </TableCell>
                      <TableCell className="py-2.5 text-center pr-4">
                        <div className="flex justify-center">
                          <button
                            onClick={() => togglePaidM.mutate({ id: entry.id, paid: !entry.is_paid })}
                            disabled={togglePaidM.isPending}
                            className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                              entry.is_paid
                                ? "bg-rose-600 border-rose-600 text-white shadow-xs"
                                : "border-slate-300 dark:border-slate-600 hover:border-rose-500"
                            }`}
                          >
                            {entry.is_paid && <Check className="h-3 w-3 stroke-[3]" />}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="p-4 bg-rose-50/20 dark:bg-rose-950/5 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-xs">
              <span className="font-medium text-rose-800 dark:text-rose-400">Total (Pago / Total)</span>
              <span className="font-bold text-rose-700 dark:text-rose-300 text-sm">
                {formatCurrency(totalSaidasPagas)} / {formatCurrency(totalSaidas)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Summary card */}
      <Card className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 overflow-hidden shadow-xs bg-slate-50/50 dark:bg-slate-900/50">
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200/40 dark:border-slate-700/40">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Resumo do Mês</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 block sm:inline sm:ml-2 font-medium">(Efetivo / Total)</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 md:gap-8 text-xs font-semibold text-slate-600 dark:text-slate-400">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-450 dark:text-slate-500">Entradas</span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totalEntradasPagas)} <span className="text-slate-400 font-normal">/</span> {formatCurrency(totalEntradas)}
              </span>
            </div>
            <div className="text-slate-300 dark:text-slate-700 text-lg hidden sm:block">-</div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-450 dark:text-slate-500">Saídas</span>
              <span className="text-sm font-bold text-rose-600 dark:text-rose-400">
                {formatCurrency(totalSaidasPagas)} <span className="text-slate-400 font-normal">/</span> {formatCurrency(totalSaidas)}
              </span>
            </div>
            <div className="text-slate-300 dark:text-slate-700 text-lg hidden sm:block">=</div>
            <div className="flex flex-col gap-0.5 bg-white dark:bg-slate-950 p-2 px-4 rounded-xl border border-slate-200/40 dark:border-slate-800/40">
              <span className="text-[10px] uppercase tracking-wider text-slate-450 dark:text-slate-500">Saldo</span>
              <span className={`text-base font-bold ${saldo >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {formatCurrency(saldoPago)} <span className="text-slate-400 font-normal text-xs">/</span> {formatCurrency(saldo)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* CRUD Dialog Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl bg-white dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-950 dark:text-white">
              {editingEntry ? "Editar Anotação" : "Nova Anotação"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {editingEntry ? "Altere as informações desta anotação da caderneta." : "Preencha os campos para registrar uma anotação na caderneta."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 text-slate-800 dark:text-slate-200">
            <div className="grid gap-2">
              <Label htmlFor="date" className="text-xs font-semibold">Data</Label>
              <Input
                id="date"
                type="date"
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                className="rounded-lg text-xs"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="desc" className="text-xs font-semibold">Descrição</Label>
              <Input
                id="desc"
                type="text"
                placeholder="Ex: Mercado, Salário..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="rounded-lg text-xs"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="val" className="text-xs font-semibold">Valor</Label>
              <Input
                id="val"
                type="number"
                step="0.01"
                placeholder="0,00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="rounded-lg text-xs"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-semibold">Tipo</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={type === "income" ? "default" : "outline"}
                  onClick={() => setType("income")}
                  className={`rounded-lg text-xs font-medium h-9 ${
                    type === "income" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  Entrada
                </Button>
                <Button
                  type="button"
                  variant={type === "expense" ? "default" : "outline"}
                  onClick={() => setType("expense")}
                  className={`rounded-lg text-xs font-medium h-9 ${
                    type === "expense" ? "bg-rose-600 text-white hover:bg-rose-700" : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  Saída
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsPaid(!isPaid)}
                className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                  isPaid
                    ? type === "income"
                      ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                      : "bg-rose-600 border-rose-600 text-white shadow-xs"
                    : "border-slate-300 dark:border-slate-600"
                }`}
              >
                {isPaid && <Check className="h-3 w-3 stroke-[3]" />}
              </button>
              <Label onClick={() => setIsPaid(!isPaid)} className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                Marcar como pago/recebido
              </Label>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-lg text-xs h-9">
              Cancelar
            </Button>
            <Button
              onClick={() => saveEntryM.mutate()}
              disabled={saveEntryM.isPending}
              className={`rounded-lg text-xs h-9 ${type === "income" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
            >
              {saveEntryM.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent className="rounded-2xl bg-white dark:bg-slate-950">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-slate-950 dark:text-white">Deseja excluir esta anotação?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500">
              Esta ação é permanente e não poderá ser desfeita. A anotação será deletada da caderneta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-lg text-xs h-9">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs h-9"
              onClick={() => deleteId && deleteEntryM.mutate(deleteId)}
              disabled={deleteEntryM.isPending}
            >
              {deleteEntryM.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Floating Selection Banner */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 dark:bg-slate-950 text-white p-4 px-6 rounded-2xl shadow-xl flex items-center gap-6 border border-slate-800 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-2 border-r border-slate-800 dark:border-slate-800 pr-6">
            <span className="text-xs font-semibold text-slate-300">
              {selectedIds.size} {selectedIds.size === 1 ? "selecionado" : "selecionados"}
            </span>
          </div>

          <div className="flex items-center gap-6 text-xs font-semibold">
            {selectedTotalEntradas > 0 && (
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Soma Entradas</span>
                <span className="text-emerald-400 font-bold">{formatCurrency(selectedTotalEntradas)}</span>
              </div>
            )}
            {selectedTotalSaidas > 0 && (
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Soma Saídas</span>
                <span className="text-rose-400 font-bold">{formatCurrency(selectedTotalSaidas)}</span>
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Total Selecionado</span>
              <span className={`font-bold ${selectedSaldo >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {formatCurrency(selectedSaldo)}
              </span>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-slate-400 hover:text-white hover:bg-slate-800 dark:hover:bg-slate-800 rounded-lg h-8 ml-2 border border-slate-800 dark:border-slate-800"
            onClick={() => setSelectedIds(new Set())}
          >
            Limpar
          </Button>
        </div>
      )}
    </div>
  );
}
