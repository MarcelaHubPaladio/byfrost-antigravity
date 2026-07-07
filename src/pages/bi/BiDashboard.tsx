import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePickerCustom } from "@/components/ui/date-range-picker-custom";
import { DateRange } from "react-day-picker";
import { subMonths } from "date-fns";
import { BiOverviewTab } from "./tabs/BiOverviewTab";
import { BiFinanceTab } from "./tabs/BiFinanceTab";
import { BiCrmTab } from "./tabs/BiCrmTab";
import { BiInventoryTab } from "./tabs/BiInventoryTab";
import { Download, Filter, LineChart, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTenant } from "@/providers/TenantProvider";

function useDateRangeSession(key: string, initialValue: DateRange | undefined) {
  const [state, setState] = useState<DateRange | undefined>(() => {
    try {
      const item = sessionStorage.getItem(key);
      if (item) {
        const parsed = JSON.parse(item);
        if (parsed.from) parsed.from = new Date(parsed.from);
        if (parsed.to) parsed.to = new Date(parsed.to);
        return parsed;
      }
    } catch (e) {
      console.warn("Failed to parse DateRange from session", e);
    }
    return initialValue;
  });

  useEffect(() => {
    if (state) {
      sessionStorage.setItem(key, JSON.stringify(state));
    } else {
      sessionStorage.removeItem(key);
    }
  }, [key, state]);

  return [state, setState] as const;
}

export default function BiDashboard() {
  const { activeTenant } = useTenant();
  const nav = useNavigate();
  const [dateRange, setDateRange] = useDateRangeSession("bi_dashboard_date_range", {
    from: subMonths(new Date(), 6),
    to: new Date()
  });

  return (
    <div className="flex h-[calc(100vh-64px)] w-full flex-col overflow-hidden bg-slate-50/50 dark:bg-[#0B0F19]">
      {/* Background Decorativo Global */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--byfrost-accent)/0.15)] blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 h-[400px] w-[400px] translate-x-1/2 translate-y-1/2 rounded-full bg-rose-500/10 blur-[100px] dark:bg-rose-500/5" />
      </div>

      <TooltipProvider delayDuration={200}>
        <div className="relative z-10 flex h-full flex-col p-6">
          {/* Header do BI */}
          <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => nav("/app")}
                className="h-10 w-10 shrink-0 rounded-full hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
              >
                <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </Button>
              <div 
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm border" 
                style={{
                  backgroundColor: 'hsl(var(--byfrost-accent)/0.1)',
                  borderColor: 'hsl(var(--byfrost-accent)/0.2)',
                  color: 'hsl(var(--byfrost-accent))'
                }}
              >
                <LineChart className="h-6 w-6" />
              </div>
              <div className="ml-1">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">Business Intelligence</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Análise de dados unificada do tenant</p>
              </div>
            </div>
          
          <div className="flex items-center gap-2">
            <DateRangePickerCustom
              date={dateRange}
              onDateChange={setDateRange}
              className="bg-white/60 border-slate-200 dark:border-slate-800 dark:bg-slate-950/40 h-10 w-64"
            />
            <Button variant="outline" className="h-10 gap-2 rounded-xl border-slate-200 bg-white/60 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/40">
              <Filter className="h-4 w-4 text-slate-500" />
              <span>Filtros</span>
            </Button>
            <Button className="h-10 gap-2 rounded-xl text-white shadow-sm" style={{ backgroundColor: 'hsl(var(--byfrost-accent))' }}>
              <Download className="h-4 w-4" />
              <span>Exportar</span>
            </Button>
          </div>
        </div>

        {/* Conteúdo com Abas */}
        <div className="flex-1 overflow-auto rounded-3xl pb-20">
          <Tabs defaultValue="overview" className="h-full w-full">
            <TabsList className="mb-6 h-12 w-full justify-start rounded-2xl bg-slate-200/50 p-1 backdrop-blur-sm dark:bg-slate-900/50 overflow-x-auto overflow-y-hidden hide-scrollbar">
              <TabsTrigger 
                value="overview" 
                className="rounded-xl px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-indigo-400"
              >
                Visão Geral
              </TabsTrigger>
              <TabsTrigger 
                value="finance" 
                className="rounded-xl px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-indigo-400"
              >
                Financeiro
              </TabsTrigger>
              <TabsTrigger 
                value="crm" 
                className="rounded-xl px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-indigo-400"
              >
                Vendas & CRM
              </TabsTrigger>
              <TabsTrigger 
                value="inventory" 
                className="rounded-xl px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-indigo-400"
              >
                Inventário
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-0 outline-none">
              <BiOverviewTab dateRange={dateRange} />
            </TabsContent>

            <TabsContent value="finance" className="mt-0 outline-none">
              <BiFinanceTab dateRange={dateRange} />
            </TabsContent>

            <TabsContent value="crm" className="mt-0 outline-none">
              <BiCrmTab dateRange={dateRange} />
            </TabsContent>

            <TabsContent value="inventory" className="mt-0 outline-none">
              <BiInventoryTab dateRange={dateRange} />
            </TabsContent>
          </Tabs>
        </div>
        </div>
      </TooltipProvider>
    </div>
  );
}
