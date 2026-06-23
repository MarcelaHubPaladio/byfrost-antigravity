import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { showError } from "@/utils/toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { addDays, subDays, addMonths, subMonths, format, parseISO, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Download, Search, Pencil, Calendar as CalendarIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn, formatMoneyBRL } from "@/lib/utils";
import { CATEGORY_LABELS } from "@/lib/financial-utils";

type CategoryRow = {
  id: string;
  name: string;
  type: string;
};

function useSessionState<T>(key: string, initialValue: T | (() => T)) {
  const [state, setState] = useState<T>(() => {
    try {
      const item = window.sessionStorage.getItem(key);
      if (item !== null) return JSON.parse(item);
    } catch {
      // ignore
    }
    return typeof initialValue === "function" ? (initialValue as any)() : initialValue;
  });

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [key, state]);

  return [state, setState] as const;
}

export function DreTab() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  // We re-query categories here, relying on React Query cache
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

  const [editingBudget, setEditingBudget] = useState<{ categoryId: string; periodKey: string; value: string } | null>(null);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfColumns, setPdfColumns] = useState({
    budget: true,
    projected: true,
    realized: true,
    pct: true,
  });
  const [dreStartDate, setDreStartDate] = useSessionState<string>("fin_dre_start", () => format(subMonths(new Date(), 2), "yyyy-MM-01"));
  const [dreEndDate, setDreEndDate] = useSessionState<string>("fin_dre_end", () => format(addMonths(new Date(), 3), "yyyy-MM-dd"));
  const [dreGranularity, setDreGranularity] = useSessionState<"monthly" | "daily">("fin_dre_granularity", "monthly");
  const [dreSearch, setDreSearch] = useState("");

  const drePeriods = useMemo(() => {
    const periods = [];
    const start = parseISO(dreStartDate);
    const end = parseISO(dreEndDate);

    if (dreGranularity === "monthly") {
      let current = startOfMonth(start);
      while (current <= end) {
        const mKey = format(current, "yyyy-MM");
        periods.push({
          label: format(current, "MMM/yy", { locale: ptBR }).toUpperCase(),
          key: mKey,
          start: format(startOfMonth(current), "yyyy-MM-dd"),
          end: format(endOfMonth(current), "yyyy-MM-dd"),
        });
        current = addMonths(current, 1);
      }
    } else {
      let current = startOfDay(start);
      const limit = endOfDay(end);
      let count = 0;
      while (current <= limit && count < 62) { // Limit to 2 months of daily view for performance
        const dKey = format(current, "yyyy-MM-dd");
        periods.push({
          label: format(current, "dd/MM"),
          key: dKey,
          start: dKey,
          end: dKey,
        });
        current = addDays(current, 1);
        count++;
      }
    }
    return periods;
  }, [dreStartDate, dreEndDate, dreGranularity]);

  const dreTransactionsQ = useQuery({
    queryKey: ["financial_dre_transactions", activeTenantId, dreStartDate, dreEndDate],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("amount, type, category_id, transaction_date, entity_id")
        .eq("tenant_id", activeTenantId!)
        .eq("is_split", false)
        .gte("transaction_date", dreStartDate)
        .lte("transaction_date", dreEndDate);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const dreBudgetsQ = useQuery({
    queryKey: ["financial_dre_budgets", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_budgets")
        .select("category_id, expected_amount, recurrence, scenario")
        .eq("tenant_id", activeTenantId!)
        .eq("scenario", "base");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const drePendingQ = useQuery({
    queryKey: ["financial_dre_pending", activeTenantId, dreStartDate, dreEndDate],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const [resP, resR] = await Promise.all([
        supabase
          .from("financial_payables")
          .select("amount, category_id, due_date")
          .eq("tenant_id", activeTenantId!)
          .eq("status", "pending")
          .gte("due_date", dreStartDate)
          .lte("due_date", dreEndDate),
        supabase
          .from("financial_receivables")
          .select("amount, category_id, due_date")
          .eq("tenant_id", activeTenantId!)
          .eq("status", "pending")
          .gte("due_date", dreStartDate)
          .lte("due_date", dreEndDate),
      ]);
      if (resP.error) throw resP.error;
      if (resR.error) throw resR.error;
      return {
        payables: resP.data ?? [],
        receivables: resR.data ?? [],
      };
    },
  });

  const dreData = useMemo(() => {
    const categories = categoriesQ.data ?? [];
    const transactions = dreTransactionsQ.data ?? [];
    const budgets = dreBudgetsQ.data ?? [];
    const pending = drePendingQ.data || { payables: [], receivables: [] };

    const rows: Record<string, { 
      category: CategoryRow; 
      periods: Record<string, { budget: number; realized: number; projected: number }> 
    }> = {};

    categories.forEach(cat => {
      rows[cat.id] = { category: cat, periods: {} };
      drePeriods.forEach(p => {
        rows[cat.id].periods[p.key] = { budget: 0, realized: 0, projected: 0 };
      });
    });

    budgets.forEach(b => {
      if (!b.category_id || !rows[b.category_id]) return;
      if (b.recurrence === "monthly") {
        drePeriods.forEach(p => {
          if (dreGranularity === "monthly") {
            rows[b.category_id].periods[p.key].budget += Number(b.expected_amount);
          } else {
            rows[b.category_id].periods[p.key].budget += Number(b.expected_amount) / 30;
          }
        });
      }
    });

    transactions.forEach(t => {
      if (!t.category_id || !t.entity_id || !rows[t.category_id]) return;
      const pKey = dreGranularity === "monthly" ? t.transaction_date.slice(0, 7) : t.transaction_date;
      if (rows[t.category_id].periods[pKey]) {
        const catType = rows[t.category_id].category.type.toLowerCase();
        const amt = Number(t.amount);
        const typ = (t.type || "").toLowerCase().trim();
        if (catType === "revenue") {
          rows[t.category_id].periods[pKey].realized += (typ === "credit" ? amt : -amt);
        } else {
          rows[t.category_id].periods[pKey].realized += (typ === "debit" ? amt : -amt);
        }
      }
    });

    pending.payables.forEach(p => {
      if (!p.category_id || !rows[p.category_id]) return;
      const pKey = dreGranularity === "monthly" ? p.due_date.slice(0, 7) : p.due_date;
      if (rows[p.category_id].periods[pKey]) {
        const catType = (rows[p.category_id].category.type || "").toLowerCase().trim();
        const amt = Number(p.amount);
        if (catType === "revenue") {
          rows[p.category_id].periods[pKey].projected -= amt;
        } else {
          rows[p.category_id].periods[pKey].projected += amt;
        }
      }
    });
    pending.receivables.forEach(r => {
      if (!r.category_id || !rows[r.category_id]) return;
      const pKey = dreGranularity === "monthly" ? r.due_date.slice(0, 7) : r.due_date;
      if (rows[r.category_id].periods[pKey]) {
        const catType = (rows[r.category_id].category.type || "").toLowerCase().trim();
        const amt = Number(r.amount);
        if (catType === "revenue") {
          rows[r.category_id].periods[pKey].projected += amt;
        } else {
          rows[r.category_id].periods[pKey].projected -= amt;
        }
      }
    });

    const filteredRows = Object.values(rows).filter(row => {
      const matchesSearch = !dreSearch || row.category.name.toLowerCase().includes(dreSearch.toLowerCase());
      if (!matchesSearch) return false;
      return Object.values(row.periods).some(p => p.budget > 0 || Math.abs(p.realized) > 0.001 || Math.abs(p.projected) > 0.001);
    });

    return filteredRows.sort((a, b) => {
      if (a.category.type !== b.category.type) {
        const order: Record<string, number> = {
          revenue: 0, cost: 1, variable: 2, fixed: 3, investment: 4, financing: 5, other: 6,
        };
        return (order[a.category.type] ?? 99) - (order[b.category.type] ?? 99);
      }
      return a.category.name.localeCompare(b.category.name);
    });
  }, [categoriesQ.data, dreTransactionsQ.data, dreBudgetsQ.data, drePendingQ.data, drePeriods, dreGranularity, dreSearch]);

  const upsertBudgetM = useMutation({
    mutationFn: async ({ categoryId, amount }: { categoryId: string; amount: number }) => {
      if (!activeTenantId) throw new Error("Tenant inválido");
      const { data: existing } = await supabase
        .from("financial_budgets")
        .select("id")
        .eq("tenant_id", activeTenantId)
        .eq("category_id", categoryId)
        .eq("scenario", "base")
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("financial_budgets")
          .update({ expected_amount: amount })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("financial_budgets")
          .insert({
            tenant_id: activeTenantId,
            category_id: categoryId,
            expected_amount: amount,
            recurrence: "monthly",
            scenario: "base",
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial_dre_budgets", activeTenantId] });
      setEditingBudget(null);
    },
    onError: (e: any) => showError(e?.message ?? "Falha ao salvar orçamento"),
  });

  const handleExportCSV = () => {
    const headers = ["Categoria", ...drePeriods.flatMap(p => [`${p.label} - Orçado`, `${p.label} - Projetado`, `${p.label} - Realizado`, `${p.label} - %`])];
    const rows = dreData.map(r => [
      r.category.name,
      ...drePeriods.flatMap(p => {
        const val = r.periods[p.key];
        const pct = val.budget > 0 ? (val.realized / val.budget) * 100 : 0;
        return [val.budget, val.projected, val.realized, `${pct.toFixed(0)}%`];
      })
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `dre_caixa_${dreStartDate}_${dreEndDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    let tableHtml = `<table border="1"><thead><tr><th>Categoria</th>`;
    drePeriods.forEach(p => { tableHtml += `<th colspan="4">${p.label}</th>`; });
    tableHtml += `</tr><tr><th></th>`;
    drePeriods.forEach(() => { tableHtml += `<th>Orçado</th><th>Projetado</th><th>Realizado</th><th>%</th>`; });
    tableHtml += `</tr></thead><tbody>`;
    
    dreData.forEach(r => {
      tableHtml += `<tr><td>${r.category.name}</td>`;
      drePeriods.forEach(p => {
        const val = r.periods[p.key];
        const pct = val.budget > 0 ? (val.realized / val.budget) * 100 : 0;
        tableHtml += `<td>${val.budget}</td><td>${val.projected}</td><td>${val.realized}</td><td>${pct.toFixed(0)}%</td>`;
      });
      tableHtml += `</tr>`;
    });
    
    tableHtml += `</tbody></table>`;
    
    const blob = new Blob([tableHtml], { type: "application/vnd.ms-excel" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `dre_caixa_${dreStartDate}_${dreEndDate}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    let tableHtml = `
      <html>
        <head>
          <title>DRE Caixa - ${dreStartDate} a ${dreEndDate}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #333; }
            h2 { text-align: center; margin-bottom: 20px; color: #1e293b; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: right; }
            th:first-child, td:first-child { text-align: left; }
            th { background-color: #f8fafc; color: #475569; font-weight: bold; }
            .revenue { font-weight: bold; color: #2563eb; background-color: #eff6ff; }
            .expense { font-weight: bold; color: #e11d48; background-color: #fff1f2; }
            .net { font-weight: bold; color: #0f172a; background-color: #f1f5f9; }
            .pct { color: #64748b; font-size: 10px; }
          </style>
        </head>
        <body>
          <h2>DRE Caixa (${format(parseISO(dreStartDate), 'dd/MM/yyyy')} - ${format(parseISO(dreEndDate), 'dd/MM/yyyy')})</h2>
          <table><thead><tr><th>Categoria</th>
    `;
    drePeriods.forEach(p => { 
      let colCount = 0;
      if (pdfColumns.budget) colCount++;
      if (pdfColumns.projected) colCount++;
      if (pdfColumns.realized) colCount++;
      if (pdfColumns.pct) colCount++;
      tableHtml += `<th colspan="${colCount}" style="text-align: center">${p.label}</th>`; 
    });
    tableHtml += `</tr><tr><th></th>`;
    drePeriods.forEach(() => { 
      if (pdfColumns.budget) tableHtml += `<th>Orçado</th>`;
      if (pdfColumns.projected) tableHtml += `<th>Projetado</th>`;
      if (pdfColumns.realized) tableHtml += `<th>Realizado</th>`;
      if (pdfColumns.pct) tableHtml += `<th>%</th>`;
    });
    tableHtml += `</tr></thead><tbody>`;
    
    // (=) RECEITAS
    tableHtml += `<tr class="revenue"><td>(=) RECEITAS</td>`;
    drePeriods.forEach(p => {
      const subRows = dreData.filter(r => r.category.type === "revenue");
      const totalB = subRows.reduce((acc, curr) => acc + curr.periods[p.key].budget, 0);
      const totalP = subRows.reduce((acc, curr) => acc + curr.periods[p.key].projected, 0);
      const totalR = subRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
      const pct = totalB > 0 ? (totalR / totalB) * 100 : 0;
      if (pdfColumns.budget) tableHtml += `<td>${formatMoneyBRL(totalB)}</td>`;
      if (pdfColumns.projected) tableHtml += `<td>${formatMoneyBRL(totalP)}</td>`;
      if (pdfColumns.realized) tableHtml += `<td>${formatMoneyBRL(totalR)}</td>`;
      if (pdfColumns.pct) tableHtml += `<td class="pct">${pct.toFixed(0)}%</td>`;
    });
    tableHtml += `</tr>`;

    dreData.filter(r => r.category.type === "revenue").forEach(r => {
      tableHtml += `<tr><td>&nbsp;&nbsp;&nbsp;${r.category.name}</td>`;
      drePeriods.forEach(p => {
        const val = r.periods[p.key];
        const pct = val.budget > 0 ? (val.realized / val.budget) * 100 : 0;
        if (pdfColumns.budget) tableHtml += `<td>${formatMoneyBRL(val.budget)}</td>`;
        if (pdfColumns.projected) tableHtml += `<td>${formatMoneyBRL(val.projected)}</td>`;
        if (pdfColumns.realized) tableHtml += `<td>${formatMoneyBRL(val.realized)}</td>`;
        if (pdfColumns.pct) tableHtml += `<td class="pct">${pct.toFixed(0)}%</td>`;
      });
      tableHtml += `</tr>`;
    });

    // (-) DESPESAS
    tableHtml += `<tr class="expense"><td>(-) DESPESAS</td>`;
    drePeriods.forEach(p => {
      const subRows = dreData.filter(r => r.category.type !== "revenue" && r.category.type !== "other");
      const totalB = subRows.reduce((acc, curr) => acc + curr.periods[p.key].budget, 0);
      const totalP = subRows.reduce((acc, curr) => acc + curr.periods[p.key].projected, 0);
      const totalR = subRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
      const pct = totalB > 0 ? (totalR / totalB) * 100 : 0;
      if (pdfColumns.budget) tableHtml += `<td>${formatMoneyBRL(totalB)}</td>`;
      if (pdfColumns.projected) tableHtml += `<td>${formatMoneyBRL(totalP)}</td>`;
      if (pdfColumns.realized) tableHtml += `<td>${formatMoneyBRL(totalR)}</td>`;
      if (pdfColumns.pct) tableHtml += `<td class="pct">${pct.toFixed(0)}%</td>`;
    });
    tableHtml += `</tr>`;

    dreData.filter(r => r.category.type !== "revenue" && r.category.type !== "other").forEach(r => {
      tableHtml += `<tr><td>&nbsp;&nbsp;&nbsp;${r.category.name} <span style="font-size: 8px; color: #94a3b8">(${CATEGORY_LABELS[r.category.type as any] || ""})</span></td>`;
      drePeriods.forEach(p => {
        const val = r.periods[p.key];
        const pct = val.budget > 0 ? (val.realized / val.budget) * 100 : 0;
        if (pdfColumns.budget) tableHtml += `<td>${formatMoneyBRL(val.budget)}</td>`;
        if (pdfColumns.projected) tableHtml += `<td>${formatMoneyBRL(val.projected)}</td>`;
        if (pdfColumns.realized) tableHtml += `<td>${formatMoneyBRL(val.realized)}</td>`;
        if (pdfColumns.pct) tableHtml += `<td class="pct">${pct.toFixed(0)}%</td>`;
      });
      tableHtml += `</tr>`;
    });

    // RESULTADO LÍQUIDO
    tableHtml += `<tr class="net"><td>RESULTADO LÍQUIDO</td>`;
    drePeriods.forEach(p => {
      const revRows = dreData.filter(r => r.category.type === "revenue");
      const expRows = dreData.filter(r => r.category.type !== "revenue" && r.category.type !== "other");
      const revB = revRows.reduce((acc, curr) => acc + curr.periods[p.key].budget, 0);
      const revP = revRows.reduce((acc, curr) => acc + curr.periods[p.key].projected, 0);
      const revR = revRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
      const expB = expRows.reduce((acc, curr) => acc + curr.periods[p.key].budget, 0);
      const expP = expRows.reduce((acc, curr) => acc + curr.periods[p.key].projected, 0);
      const expR = expRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
      
      const netB = revB - expB;
      const netP = revP - expP;
      const netR = revR - expR;
      const pct = netB !== 0 ? (((netR - netB) / Math.abs(netB)) * 100).toFixed(0) : "—";

      if (pdfColumns.budget) tableHtml += `<td>${formatMoneyBRL(netB)}</td>`;
      if (pdfColumns.projected) tableHtml += `<td style="color:${netP >= 0 ? '#16a34a' : '#dc2626'}">${formatMoneyBRL(netP)}</td>`;
      if (pdfColumns.realized) tableHtml += `<td style="color:${netR >= 0 ? '#16a34a' : '#dc2626'}">${formatMoneyBRL(netR)}</td>`;
      if (pdfColumns.pct) tableHtml += `<td class="pct">${pct !== "—" ? pct + '%' : pct}</td>`;
    });
    tableHtml += `</tr>`;

    // OUTROS
    tableHtml += `<tr style="background-color: #f8fafc; color: #64748b; font-weight: bold;"><td>(=) OUTROS</td>`;
    drePeriods.forEach(p => {
      const subRows = dreData.filter(r => r.category.type === "other");
      const totalB = subRows.reduce((acc, curr) => acc + curr.periods[p.key].budget, 0);
      const totalP = subRows.reduce((acc, curr) => acc + curr.periods[p.key].projected, 0);
      const totalR = subRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
      const pct = totalB > 0 ? (totalR / totalB) * 100 : 0;
      if (pdfColumns.budget) tableHtml += `<td>${formatMoneyBRL(totalB)}</td>`;
      if (pdfColumns.projected) tableHtml += `<td>${formatMoneyBRL(totalP)}</td>`;
      if (pdfColumns.realized) tableHtml += `<td>${formatMoneyBRL(totalR)}</td>`;
      if (pdfColumns.pct) tableHtml += `<td class="pct">${pct.toFixed(0)}%</td>`;
    });
    tableHtml += `</tr>`;

    dreData.filter(r => r.category.type === "other").forEach(r => {
      tableHtml += `<tr><td>&nbsp;&nbsp;&nbsp;${r.category.name}</td>`;
      drePeriods.forEach(p => {
        const val = r.periods[p.key];
        const pct = val.budget > 0 ? (val.realized / val.budget) * 100 : 0;
        if (pdfColumns.budget) tableHtml += `<td>${formatMoneyBRL(val.budget)}</td>`;
        if (pdfColumns.projected) tableHtml += `<td>${formatMoneyBRL(val.projected)}</td>`;
        if (pdfColumns.realized) tableHtml += `<td>${formatMoneyBRL(val.realized)}</td>`;
        if (pdfColumns.pct) tableHtml += `<td class="pct">${pct.toFixed(0)}%</td>`;
      });
      tableHtml += `</tr>`;
    });

    // RESULTADO FINAL
    tableHtml += `<tr style="background-color: #0f172a; color: white; font-weight: bold;"><td>RESULTADO FINAL</td>`;
    drePeriods.forEach(p => {
      const revRows = dreData.filter(r => r.category.type === "revenue");
      const restRows = dreData.filter(r => r.category.type !== "revenue");
      const revP = revRows.reduce((acc, curr) => acc + curr.periods[p.key].projected, 0);
      const revR = revRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
      const restP = restRows.reduce((acc, curr) => acc + curr.periods[p.key].projected, 0);
      const restR = restRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
      
      const finalP = revP - restP;
      const finalR = revR - restR;

      if (pdfColumns.budget) tableHtml += `<td>—</td>`;
      if (pdfColumns.projected) tableHtml += `<td style="color:${finalP >= 0 ? '#6ee7b7' : '#fda4af'}">${formatMoneyBRL(finalP)}</td>`;
      if (pdfColumns.realized) tableHtml += `<td>${formatMoneyBRL(finalR)}</td>`;
      if (pdfColumns.pct) tableHtml += `<td></td>`;
    });
    tableHtml += `</tr>`;

    tableHtml += `</tbody></table></body></html>`;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(tableHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
        setPdfDialogOpen(false);
      }, 500);
    }
  };

  return (
    <Card className="rounded-[22px] border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40 overflow-hidden">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">DRE-Caixa & Planejamento</div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Acompanhamento de orçamento vs realizado (regime de caixa).
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950/40">
            <Button 
              variant={dreGranularity === "monthly" ? "secondary" : "ghost"} 
              size="sm" 
              className="h-8 rounded-xl px-4 text-xs" 
              onClick={() => setDreGranularity("monthly")}
            >
              Mensal
            </Button>
            <Button 
              variant={dreGranularity === "daily" ? "secondary" : "ghost"} 
              size="sm" 
              className="h-8 rounded-xl px-4 text-xs" 
              onClick={() => setDreGranularity("daily")}
            >
              Diário
            </Button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="h-9 w-[200px] rounded-2xl pl-9 text-xs"
              placeholder="Buscar categoria..."
              value={dreSearch}
              onChange={(e) => setDreSearch(e.target.value)}
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                className="h-9 px-4 border border-slate-200/60 hover:border-slate-300 rounded-2xl text-xs font-bold text-slate-600 flex items-center gap-2 transition-all shadow-sm bg-slate-50 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-300"
              >
                <CalendarIcon className="h-4 w-4 text-indigo-500" />
                {dreStartDate ? (
                  dreEndDate ? (
                    `${format(parseISO(dreStartDate), "dd/MM/yyyy")} - ${format(parseISO(dreEndDate), "dd/MM/yyyy")}`
                  ) : (
                    format(parseISO(dreStartDate), "dd/MM/yyyy")
                  )
                ) : (
                  "Todo Período"
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-3xl border-slate-200 shadow-2xl overflow-hidden bg-white dark:bg-slate-950 dark:border-slate-800" align="end">
              <div className="flex flex-col md:flex-row">
                <div className="w-full md:w-48 border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-800 p-3 flex flex-col gap-1 bg-slate-50/50 dark:bg-slate-900/30">
                  {[
                    { label: "Hoje", get: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
                    { label: "Ontem", get: () => ({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) }) },
                    { label: "Últimos 7 dias", get: () => ({ from: startOfDay(subDays(new Date(), 7)), to: endOfDay(new Date()) }) },
                    { label: "Últimos 30 dias", get: () => ({ from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()) }) },
                    { label: "Mês Atual", get: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
                    { label: "Mês Passado", get: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
                    { label: "Todo Período", get: () => ({ from: undefined, to: undefined }) },
                  ].map((btn) => {
                    const range = btn.get();
                    const isMatch = (range.from ? format(range.from, "yyyy-MM-dd") : "") === dreStartDate && 
                                    (range.to ? format(range.to, "yyyy-MM-dd") : "") === dreEndDate;
                    return (
                      <Button
                        key={btn.label}
                        variant="ghost"
                        className={cn(
                          "h-10 justify-start rounded-full text-[10px] font-black uppercase tracking-widest transition-all text-left px-4",
                          isMatch ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-2 border-slate-900 dark:border-slate-100 shadow-sm" : "text-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:text-indigo-600 border-2 border-transparent"
                        )}
                        onClick={() => {
                          setDreStartDate(range.from ? format(range.from, "yyyy-MM-dd") : "");
                          setDreEndDate(range.to ? format(range.to, "yyyy-MM-dd") : "");
                        }}
                      >
                        {btn.label}
                      </Button>
                    );
                  })}
                </div>
                <div className="p-2">
                  <CalendarComponent
                    initialFocus
                    mode="range"
                    defaultMonth={dreStartDate ? parseISO(dreStartDate) : new Date()}
                    selected={{ 
                      from: dreStartDate ? parseISO(dreStartDate) : undefined, 
                      to: dreEndDate ? parseISO(dreEndDate) : undefined 
                    }}
                    onSelect={(range: any) => {
                      if (range?.from) setDreStartDate(format(range.from, "yyyy-MM-dd"));
                      if (range?.to) setDreEndDate(format(range.to, "yyyy-MM-dd"));
                    }}
                    numberOfMonths={2}
                    locale={ptBR}
                    className="rounded-2xl"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button 
            variant="outline" 
            size="sm" 
            className="h-9 rounded-2xl"
            onClick={() => {
              dreTransactionsQ.refetch();
              dreBudgetsQ.refetch();
              drePendingQ.refetch();
            }}
          >
            Atualizar
          </Button>

          <div className="flex items-center gap-2 border-l pl-3 ml-1">
            <Button variant="ghost" size="sm" className="h-9 rounded-2xl text-[11px] gap-2" onClick={handleExportCSV}>
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button variant="ghost" size="sm" className="h-9 rounded-2xl text-[11px] gap-2" onClick={handleExportExcel}>
              <Download className="h-3.5 w-3.5 text-emerald-600" />
              Excel
            </Button>
            <Button variant="ghost" size="sm" className="h-9 rounded-2xl text-[11px] gap-2" onClick={() => setPdfDialogOpen(true)}>
              <Download className="h-3.5 w-3.5 text-rose-600" />
              PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="relative w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
        <Table className="w-max min-w-full border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-30">
            <TableRow className="bg-slate-50 dark:bg-slate-900 border-b">
              <TableHead className="w-[240px] min-w-[240px] sticky left-0 bg-slate-50 dark:bg-slate-900 z-40 border-r-2 border-slate-200 dark:border-slate-800 shadow-[4px_0_8px_rgba(0,0,0,0.05)] px-6">
                Categoria
              </TableHead>
              {drePeriods.map((p) => (
                <TableHead key={p.key} colSpan={4} className="text-center border-l bg-slate-100/40 dark:bg-slate-800/20 w-[240px] min-w-[240px]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{p.label}</div>
                  <div className="grid grid-cols-4 text-[9px] text-slate-400 border-t pt-1 divide-x divide-slate-200 dark:divide-slate-800">
                    <span className="text-left pl-1">ORÇ.</span>
                    <span className="text-center">PROJ.</span>
                    <span className="text-center">REAL.</span>
                    <span className="text-right pr-1">%</span>
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(dreTransactionsQ.isLoading || dreBudgetsQ.isLoading || drePendingQ.isLoading) ? (
              <TableRow>
                <TableCell colSpan={drePeriods.length * 4 + 1} className="py-12 text-center text-slate-500">
                  Carregando dados financeiros...
                </TableCell>
              </TableRow>
            ) : dreData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={drePeriods.length * 4 + 1} className="py-12 text-center text-slate-500">
                  Nenhum lançamento ou orçamento encontrado para este período.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {/* Revenue Section */}
                <TableRow className="bg-blue-50/20 dark:bg-blue-900/10 hover:bg-transparent">
                  <TableCell className="font-bold text-blue-600 dark:text-blue-400 sticky left-0 bg-white dark:bg-slate-950 z-20 border-r-2 border-slate-200 dark:border-slate-800 shadow-[4px_0_8px_rgba(0,0,0,0.05)] pl-6">(=) RECEITAS</TableCell>
                  {drePeriods.map(p => {
                    const subRows = dreData.filter(r => r.category.type === "revenue");
                    const totalB = subRows.reduce((acc, curr) => acc + curr.periods[p.key].budget, 0);
                    const totalP = subRows.reduce((acc, curr) => acc + curr.periods[p.key].projected, 0);
                    const totalR = subRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
                    const pct = totalB > 0 ? (totalR / totalB) : 0;
                    return (
                      <React.Fragment key={p.key}>
                        <TableCell className="text-right text-[11px] font-semibold border-l w-[60px]">{formatMoneyBRL(totalB)}</TableCell>
                        <TableCell className="text-right text-[11px] font-medium text-slate-500 w-[60px]">{formatMoneyBRL(totalP)}</TableCell>
                        <TableCell className="text-right text-[11px] font-bold text-blue-700 dark:text-blue-300 w-[60px]">{formatMoneyBRL(totalR)}</TableCell>
                        <TableCell className={cn("text-right text-[10px] w-[60px]", pct >= 1 ? "text-emerald-600" : "text-amber-600")}>
                           {pct > 0 ? `${(pct * 100).toFixed(0)}%` : "—"}
                        </TableCell>
                      </React.Fragment>
                    );
                  })}
                </TableRow>
                {dreData.filter(r => r.category.type === "revenue").map(row => (
                  <TableRow key={row.category.id} className="group hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <TableCell className="pl-6 text-sm font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-950 group-hover:bg-slate-50 dark:group-hover:bg-slate-900/40 z-20 border-r-2 border-slate-100 dark:border-slate-800 shadow-[4px_0_8px_rgba(0,0,0,0.05)] overflow-hidden text-ellipsis whitespace-nowrap">
                      <Link 
                        to={`/app/finance/ledger/category/${row.category.id}?startDate=${dreStartDate}&endDate=${dreEndDate}&name=${encodeURIComponent(row.category.name)}`}
                        className="hover:text-blue-600 hover:underline transition-colors"
                      >
                        {row.category.name}
                      </Link>
                    </TableCell>
                    {drePeriods.map(p => {
                      const val = row.periods[p.key];
                      const pct = val.budget > 0 ? (val.realized / val.budget) : 0;
                      const isEditing = editingBudget?.categoryId === row.category.id && editingBudget?.periodKey === p.key;

                      return (
                        <React.Fragment key={p.key}>
                          <TableCell 
                            className="text-right text-[11px] text-slate-500 border-l w-[60px] cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/20 group/cell overflow-hidden"
                            onClick={() => setEditingBudget({ categoryId: row.category.id, periodKey: p.key, value: String(val.budget) })}
                          >
                            {isEditing ? (
                              <Input
                                autoFocus
                                className="h-6 w-full text-right text-[11px] p-1 rounded-sm border-blue-400 shadow-sm focus:ring-1 ring-blue-400"
                                value={editingBudget.value}
                                onChange={(e) => setEditingBudget({ ...editingBudget, value: e.target.value })}
                                onBlur={() => {
                                  const num = parseFloat(editingBudget.value);
                                  if (!isNaN(num) && num !== val.budget) {
                                    upsertBudgetM.mutate({ categoryId: row.category.id, amount: num });
                                  } else {
                                    setEditingBudget(null);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const num = parseFloat(editingBudget.value);
                                    if (!isNaN(num)) {
                                      upsertBudgetM.mutate({ categoryId: row.category.id, amount: num });
                                    }
                                  }
                                  if (e.key === "Escape") setEditingBudget(null);
                                }}
                              />
                            ) : (
                              <div className="flex items-center justify-end gap-1 group/row">
                                <span>{formatMoneyBRL(val.budget)}</span>
                                <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/cell:opacity-40 transition-opacity" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-[11px] text-slate-400 w-[60px]">{formatMoneyBRL(val.projected)}</TableCell>
                          <TableCell className="text-right text-[11px] font-medium w-[60px]">{formatMoneyBRL(val.realized)}</TableCell>
                          <TableCell className={cn("text-right text-[10px] w-[60px]", pct >= 1 ? "text-emerald-600 font-medium" : pct > 0 ? "text-amber-600" : "text-slate-300")}>
                            {pct > 0 ? `${(pct * 100).toFixed(0)}%` : "—"}
                          </TableCell>
                        </React.Fragment>
                      );
                    })}
                  </TableRow>
                ))}

                <TableRow className="h-4 hover:bg-transparent"><TableCell colSpan={drePeriods.length * 4 + 1}></TableCell></TableRow>

                <TableRow className="bg-rose-50/20 dark:bg-rose-900/10 hover:bg-transparent">
                  <TableCell className="font-bold text-rose-600 dark:text-rose-400 sticky left-0 bg-white dark:bg-slate-950 z-20 border-r-2 border-slate-200 dark:border-slate-800 shadow-[4px_0_8px_rgba(0,0,0,0.05)] pl-6">(-) DESPESAS</TableCell>
                  {drePeriods.map(p => {
                    const subRows = dreData.filter(r => r.category.type !== "revenue" && r.category.type !== "other");
                    const totalB = subRows.reduce((acc, curr) => acc + curr.periods[p.key].budget, 0);
                    const totalP = subRows.reduce((acc, curr) => acc + curr.periods[p.key].projected, 0);
                    const totalR = subRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
                    const pct = totalB > 0 ? (totalR / totalB) : 0;
                    return (
                      <React.Fragment key={p.key}>
                        <TableCell className="text-right text-[11px] font-semibold border-l w-[60px]">{formatMoneyBRL(totalB)}</TableCell>
                        <TableCell className="text-right text-[11px] font-medium text-slate-500 w-[60px]">{formatMoneyBRL(totalP)}</TableCell>
                        <TableCell className="text-right text-[11px] font-bold text-rose-700 dark:text-rose-300 w-[60px]">{formatMoneyBRL(totalR)}</TableCell>
                        <TableCell className={cn("text-right text-[10px] w-[60px]", pct > 1 ? "text-rose-600" : pct > 0 ? "text-emerald-600" : "text-slate-300")}>
                           {pct > 0 ? `${(pct * 100).toFixed(0)}%` : "—"}
                        </TableCell>
                      </React.Fragment>
                    );
                  })}
                </TableRow>
                {dreData.filter(r => r.category.type !== "revenue" && r.category.type !== "other").map(row => (
                  <TableRow key={row.category.id} className="group hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <TableCell className="pl-6 text-sm font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-950 group-hover:bg-slate-50 dark:group-hover:bg-slate-900/40 z-20 border-r-2 border-slate-100 dark:border-slate-800 shadow-[4px_0_8px_rgba(0,0,0,0.05)] overflow-hidden text-ellipsis whitespace-nowrap">
                      <Link 
                        to={`/app/finance/ledger/category/${row.category.id}?startDate=${dreStartDate}&endDate=${dreEndDate}&name=${encodeURIComponent(row.category.name)}`}
                        className="hover:text-blue-600 hover:underline transition-colors"
                      >
                        {row.category.name}
                      </Link>
                      <span className="text-[10px] opacity-40 uppercase ml-1">({CATEGORY_LABELS[row.category.type as any] || ""})</span>
                    </TableCell>
                    {drePeriods.map(p => {
                      const val = row.periods[p.key];
                      const pct = val.budget > 0 ? (val.realized / val.budget) : 0;
                      const isEditing = editingBudget?.categoryId === row.category.id && editingBudget?.periodKey === p.key;

                      return (
                        <React.Fragment key={p.key}>
                          <TableCell 
                            className="text-right text-[11px] text-slate-500 border-l w-[60px] cursor-pointer hover:bg-rose-50/50 dark:hover:bg-rose-900/20 group/cell overflow-hidden"
                            onClick={() => setEditingBudget({ categoryId: row.category.id, periodKey: p.key, value: String(val.budget) })}
                          >
                            {isEditing ? (
                              <Input
                                autoFocus
                                className="h-6 w-full text-right text-[11px] p-1 rounded-sm border-rose-400 shadow-sm focus:ring-1 ring-rose-400"
                                value={editingBudget.value}
                                onChange={(e) => setEditingBudget({ ...editingBudget, value: e.target.value })}
                                onBlur={() => {
                                  const num = parseFloat(editingBudget.value);
                                  if (!isNaN(num) && num !== val.budget) {
                                    upsertBudgetM.mutate({ categoryId: row.category.id, amount: num });
                                  } else {
                                    setEditingBudget(null);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const num = parseFloat(editingBudget.value);
                                    if (!isNaN(num)) {
                                      upsertBudgetM.mutate({ categoryId: row.category.id, amount: num });
                                    }
                                  }
                                  if (e.key === "Escape") setEditingBudget(null);
                                }}
                              />
                            ) : (
                              <div className="flex items-center justify-end gap-1 group/row">
                                <span>{formatMoneyBRL(val.budget)}</span>
                                <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/cell:opacity-40 transition-opacity" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-[11px] text-slate-400 w-[60px]">{formatMoneyBRL(val.projected)}</TableCell>
                          <TableCell className="text-right text-[11px] font-medium w-[60px]">{formatMoneyBRL(val.realized)}</TableCell>
                          <TableCell className={cn("text-right text-[10px] w-[60px]", pct > 1 ? "text-rose-600 font-medium" : pct > 0 ? "text-emerald-600" : "text-slate-300")}>
                            {pct > 0 ? `${(pct * 100).toFixed(0)}%` : "—"}
                          </TableCell>
                        </React.Fragment>
                      );
                    })}
                  </TableRow>
                ))}

                <TableRow className="bg-slate-100 dark:bg-slate-900 font-bold border-t-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100">
                  <TableCell className="sticky left-0 bg-slate-100 dark:bg-slate-900 z-30 border-r-2 border-slate-200 dark:border-slate-800 shadow-[4px_0_8px_rgba(0,0,0,0.05)] overflow-hidden text-ellipsis whitespace-nowrap pl-6">RESULTADO LÍQUIDO</TableCell>
                  {drePeriods.map(p => {
                    const revRows = dreData.filter(r => r.category.type === "revenue");
                    const expRows = dreData.filter(r => r.category.type !== "revenue" && r.category.type !== "other");
                    
                    const revB = revRows.reduce((acc, curr) => acc + curr.periods[p.key].budget, 0);
                    const revP = revRows.reduce((acc, curr) => acc + curr.periods[p.key].projected, 0);
                    const revR = revRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
                    
                    const expB = expRows.reduce((acc, curr) => acc + curr.periods[p.key].budget, 0);
                    const expP = expRows.reduce((acc, curr) => acc + curr.periods[p.key].projected, 0);
                    const expR = expRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
                    
                    const netB = revB - expB;
                    const netP = revP - expP;
                    const netR = revR - expR;
                    
                    return (
                      <React.Fragment key={p.key}>
                        <TableCell className="text-right text-[11px] border-l w-[60px]">{formatMoneyBRL(netB)}</TableCell>
                        <TableCell className={cn("text-right text-[11px] w-[60px]", netP >= 0 ? "text-emerald-600/70" : "text-rose-600/70")}>
                           {formatMoneyBRL(netP)}
                        </TableCell>
                        <TableCell className={cn("text-right text-[11px] font-bold w-[60px]", netR >= 0 ? "text-emerald-600" : "text-rose-600")}>
                          {formatMoneyBRL(netR)}
                        </TableCell>
                        <TableCell className="text-right text-[10px] text-slate-400 w-[60px]">
                          {netB !== 0 ? `${(((netR - netB) / Math.abs(netB)) * 100).toFixed(0)}%` : "—"}
                        </TableCell>
                      </React.Fragment>
                    );
                  })}
                </TableRow>

                <TableRow className="h-4 hover:bg-transparent"><TableCell colSpan={drePeriods.length * 4 + 1}></TableCell></TableRow>

                {/* Other Section */}
                <TableRow className="bg-slate-50/50 dark:bg-slate-800/10 hover:bg-transparent">
                  <TableCell className="font-bold text-slate-500 sticky left-0 bg-white dark:bg-slate-950 z-20 border-r-2 border-slate-200 dark:border-slate-800 shadow-[4px_0_8px_rgba(0,0,0,0.05)] pl-6">(=) OUTROS</TableCell>
                  {drePeriods.map(p => {
                    const subRows = dreData.filter(r => r.category.type === "other");
                    const totalB = subRows.reduce((acc, curr) => acc + curr.periods[p.key].budget, 0);
                    const totalP = subRows.reduce((acc, curr) => acc + curr.periods[p.key].projected, 0);
                    const totalR = subRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
                    const pct = totalB > 0 ? (totalR / totalB) : 0;
                    return (
                      <React.Fragment key={p.key}>
                        <TableCell className="text-right text-[11px] font-semibold border-l w-[60px]">{formatMoneyBRL(totalB)}</TableCell>
                        <TableCell className="text-right text-[11px] font-medium text-slate-500 w-[60px]">{formatMoneyBRL(totalP)}</TableCell>
                        <TableCell className="text-right text-[11px] font-bold text-slate-600 dark:text-slate-400 w-[60px]">{formatMoneyBRL(totalR)}</TableCell>
                        <TableCell className={cn("text-right text-[10px] w-[60px]", pct > 1 ? "text-rose-600" : pct > 0 ? "text-emerald-600" : "text-slate-300")}>
                           {pct > 0 ? `${(pct * 100).toFixed(0)}%` : "—"}
                        </TableCell>
                      </React.Fragment>
                    );
                  })}
                </TableRow>
                {dreData.filter(r => r.category.type === "other").map(row => (
                  <TableRow key={row.category.id} className="group hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <TableCell className="pl-6 text-sm font-medium text-slate-500 sticky left-0 bg-white dark:bg-slate-950 group-hover:bg-slate-50 dark:group-hover:bg-slate-900/40 z-20 border-r-2 border-slate-100 dark:border-slate-800 shadow-[4px_0_8px_rgba(0,0,0,0.05)] overflow-hidden text-ellipsis whitespace-nowrap">
                      <Link 
                        to={`/app/finance/ledger/category/${row.category.id}?startDate=${dreStartDate}&endDate=${dreEndDate}&name=${encodeURIComponent(row.category.name)}`}
                        className="hover:text-blue-600 hover:underline transition-colors"
                      >
                        {row.category.name}
                      </Link>
                    </TableCell>
                    {drePeriods.map(p => {
                      const val = row.periods[p.key];
                      const pct = val.budget > 0 ? (val.realized / val.budget) : 0;
                      const isEditing = editingBudget?.categoryId === row.category.id && editingBudget?.periodKey === p.key;

                      return (
                        <React.Fragment key={p.key}>
                          <TableCell 
                            className="text-right text-[11px] text-slate-400 border-l w-[60px] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/20 group/cell overflow-hidden"
                            onClick={() => setEditingBudget({ categoryId: row.category.id, periodKey: p.key, value: String(val.budget) })}
                          >
                            {isEditing ? (
                              <Input
                                autoFocus
                                className="h-6 w-full text-right text-[11px] p-1 rounded-sm border-slate-400 shadow-sm focus:ring-1 ring-slate-400"
                                value={editingBudget.value}
                                onChange={(e) => setEditingBudget({ ...editingBudget, value: e.target.value })}
                                onBlur={() => {
                                  const num = parseFloat(editingBudget.value);
                                  if (!isNaN(num) && num !== val.budget) {
                                    upsertBudgetM.mutate({ categoryId: row.category.id, amount: num });
                                  } else {
                                    setEditingBudget(null);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const num = parseFloat(editingBudget.value);
                                    if (!isNaN(num)) {
                                      upsertBudgetM.mutate({ categoryId: row.category.id, amount: num });
                                    }
                                  }
                                  if (e.key === "Escape") setEditingBudget(null);
                                }}
                              />
                            ) : (
                              <div className="flex items-center justify-end gap-1 group/row">
                                <span>{formatMoneyBRL(val.budget)}</span>
                                <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/cell:opacity-40 transition-opacity" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-[11px] text-slate-400/70 w-[60px]">{formatMoneyBRL(val.projected)}</TableCell>
                          <TableCell className="text-right text-[11px] font-medium text-slate-400 w-[60px]">{formatMoneyBRL(val.realized)}</TableCell>
                          <TableCell className={cn("text-right text-[10px] w-[60px]", pct > 1 ? "text-rose-600 font-medium" : pct > 0 ? "text-emerald-600" : "text-slate-300")}>
                            {pct > 0 ? `${(pct * 100).toFixed(0)}%` : "—"}
                          </TableCell>
                        </React.Fragment>
                      );
                    })}
                  </TableRow>
                ))}

                <TableRow className="h-4 hover:bg-transparent"><TableCell colSpan={drePeriods.length * 4 + 1}></TableCell></TableRow>

                <TableRow className="bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-bold border-t-2 border-slate-900 dark:border-slate-100 hover:bg-slate-900 dark:hover:bg-slate-100">
                  <TableCell className="sticky left-0 bg-slate-900 dark:bg-slate-100 z-30 border-r-2 border-slate-800 dark:border-slate-200 shadow-[4px_0_8px_rgba(0,0,0,0.05)] overflow-hidden text-ellipsis whitespace-nowrap pl-6 rounded-l-xl">RESULTADO FINAL</TableCell>
                  {drePeriods.map(p => {
                    const revRows = dreData.filter(r => r.category.type === "revenue");
                    const restRows = dreData.filter(r => r.category.type !== "revenue");
                    
                    const revP = revRows.reduce((acc, curr) => acc + curr.periods[p.key].projected, 0);
                    const revR = revRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
                    const restP = restRows.reduce((acc, curr) => acc + curr.periods[p.key].projected, 0);
                    const restR = restRows.reduce((acc, curr) => acc + curr.periods[p.key].realized, 0);
                    
                    const finalP = revP - restP;
                    const finalR = revR - restR;
                    
                    return (
                      <React.Fragment key={p.key}>
                        <TableCell className="text-right text-[11px] border-l w-[60px] opacity-0">—</TableCell>
                        <TableCell className={cn("text-right text-[11px] w-[60px] font-medium", finalP >= 0 ? "text-emerald-300" : "text-rose-300")}>
                           {formatMoneyBRL(finalP)}
                        </TableCell>
                        <TableCell className={cn("text-right text-[11px] font-bold w-[120px] px-2")}>
                          {formatMoneyBRL(finalR)}
                        </TableCell>
                        <TableCell className="text-right text-[10px] w-[0px] p-0"></TableCell>
                      </React.Fragment>
                    );
                  })}
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Exportar DRE-Caixa (PDF)</DialogTitle>
            <DialogDescription>
              Selecione as colunas que deseja incluir no relatório.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="col-budget" 
                checked={pdfColumns.budget} 
                onCheckedChange={(checked) => setPdfColumns({ ...pdfColumns, budget: checked === true })} 
              />
              <Label htmlFor="col-budget">Orçado</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="col-projected" 
                checked={pdfColumns.projected} 
                onCheckedChange={(checked) => setPdfColumns({ ...pdfColumns, projected: checked === true })} 
              />
              <Label htmlFor="col-projected">Projetado</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="col-realized" 
                checked={pdfColumns.realized} 
                onCheckedChange={(checked) => setPdfColumns({ ...pdfColumns, realized: checked === true })} 
              />
              <Label htmlFor="col-realized">Realizado</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="col-pct" 
                checked={pdfColumns.pct} 
                onCheckedChange={(checked) => setPdfColumns({ ...pdfColumns, pct: checked === true })} 
              />
              <Label htmlFor="col-pct">Porcentagem (%)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPdfDialogOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={handleExportPDF} className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white" disabled={!pdfColumns.budget && !pdfColumns.projected && !pdfColumns.realized && !pdfColumns.pct}>
              Gerar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="mt-4 text-[10px] text-slate-400">
        * Realizado inclui apenas transações conciliadas (com categoria e entidade). Projetado inclui lançamentos pendentes (contas a pagar/receber).
      </div>
    </Card>
  );
}
