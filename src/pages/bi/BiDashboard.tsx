import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BiOverviewTab } from "./tabs/BiOverviewTab";
import { BiFinanceTab } from "./tabs/BiFinanceTab";
import { BiCrmTab } from "./tabs/BiCrmTab";
import { CalendarDays, Download, Filter, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BiDashboard() {
  return (
    <div className="flex h-[calc(100vh-64px)] w-full flex-col overflow-hidden bg-slate-50/50 dark:bg-[#0B0F19]">
      {/* Background Decorativo Global */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[100px] dark:bg-indigo-500/5" />
        <div className="absolute bottom-0 right-1/4 h-[400px] w-[400px] translate-x-1/2 translate-y-1/2 rounded-full bg-rose-500/10 blur-[100px] dark:bg-rose-500/5" />
      </div>

      <div className="relative z-10 flex h-full flex-col p-6">
        {/* Header do BI */}
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 shadow-sm">
              <LineChart className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Business Intelligence</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Análise de dados unificada do tenant</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-10 gap-2 rounded-xl border-slate-200 bg-white/60 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/40">
              <CalendarDays className="h-4 w-4 text-slate-500" />
              <span>Últimos 7 meses</span>
            </Button>
            <Button variant="outline" className="h-10 gap-2 rounded-xl border-slate-200 bg-white/60 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/40">
              <Filter className="h-4 w-4 text-slate-500" />
              <span>Filtros</span>
            </Button>
            <Button className="h-10 gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm dark:bg-indigo-600 dark:hover:bg-indigo-500">
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
            </TabsList>

            <TabsContent value="overview" className="mt-0 outline-none">
              <BiOverviewTab />
            </TabsContent>

            <TabsContent value="finance" className="mt-0 outline-none">
              <BiFinanceTab />
            </TabsContent>

            <TabsContent value="crm" className="mt-0 outline-none">
              <BiCrmTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
