import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Landmark, PieChart, UploadCloud, AlertTriangle } from "lucide-react";
import { TransactionsTab } from "./FinancialLedgerPanel/TransactionsTab";
import { CategoriesTab } from "./FinancialLedgerPanel/CategoriesTab";
import { BanksTab } from "./FinancialLedgerPanel/BanksTab";
import { DreTab } from "./FinancialLedgerPanel/DreTab";
import { FinancialIngestionPanel } from "./FinancialIngestionPanel";
import { FinancialTensionsPanel } from "./FinancialTensionsPanel";
import { FinancialPlanningPanel } from "./FinancialPlanningPanel";
import { FinanceControlTowerPanel } from "./FinanceControlTowerPanel";
import { FinancialDecisionBoard } from "./FinancialDecisionBoard";

export function FinancialLedgerPanel() {
  const [activeTab, setActiveTab] = useState("transactions");

  // Handle ?tab=xxx in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t && ["overview", "transactions", "categories", "banks", "dre", "ingestion", "tensions", "planning", "control_tower", "decisions"].includes(t)) {
      setActiveTab(t);
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Landmark className="h-6 w-6 text-indigo-500" />
          Financeiro
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Gerencie contas bancárias, lançamentos e acompanhe o DRE de forma unificada.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="h-11 rounded-2xl bg-white/50 p-1 shadow-sm border border-slate-200/60 dark:bg-slate-900/50 dark:border-slate-800/60 flex w-full max-w-full flex-wrap sm:flex-nowrap mb-8 overflow-x-auto justify-start no-scrollbar">
          <TabsTrigger 
            value="transactions" 
            className="rounded-xl flex-1 whitespace-nowrap data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300 px-4"
          >
            Lançamentos
          </TabsTrigger>
          <TabsTrigger 
            value="dre" 
            className="rounded-xl flex-1 whitespace-nowrap data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300 px-4"
          >
            DRE-Caixa
          </TabsTrigger>
          <TabsTrigger 
            value="tensions" 
            className="rounded-xl flex-1 whitespace-nowrap data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300 px-4 flex items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4" />
            Tensões
          </TabsTrigger>
          <TabsTrigger 
            value="planning" 
            className="rounded-xl flex-1 whitespace-nowrap data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300 px-4"
          >
            Planejamento
          </TabsTrigger>
          <TabsTrigger 
            value="control_tower" 
            className="rounded-xl flex-1 whitespace-nowrap data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300 px-4"
          >
            Control Tower
          </TabsTrigger>
          <TabsTrigger 
            value="decisions" 
            className="rounded-xl flex-1 whitespace-nowrap data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300 px-4"
          >
            Decisões
          </TabsTrigger>
          <TabsTrigger 
            value="ingestion" 
            className="rounded-xl flex-1 whitespace-nowrap data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300 px-4 flex items-center gap-2"
          >
            <UploadCloud className="h-4 w-4" />
            Importar
          </TabsTrigger>
          <TabsTrigger 
            value="categories" 
            className="rounded-xl flex-1 whitespace-nowrap data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300 px-4"
          >
            Categorias
          </TabsTrigger>
          <TabsTrigger 
            value="banks" 
            className="rounded-xl flex-1 whitespace-nowrap data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300 px-4"
          >
            Bancos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="mt-6 outline-none">
          <TransactionsTab />
        </TabsContent>

        <TabsContent value="categories" className="grid gap-4 mt-6 outline-none">
          <CategoriesTab />
        </TabsContent>

        <TabsContent value="banks" className="grid gap-4 mt-6 outline-none">
          <BanksTab />
        </TabsContent>

        <TabsContent value="dre" className="grid gap-4 min-w-0 mt-6 overflow-hidden outline-none">
          <DreTab />
        </TabsContent>

        <TabsContent value="tensions" className="grid gap-4 min-w-0 mt-6 overflow-hidden outline-none">
          <FinancialTensionsPanel />
        </TabsContent>

        <TabsContent value="ingestion" className="grid gap-4 min-w-0 mt-6 overflow-hidden outline-none">
          <FinancialIngestionPanel />
        </TabsContent>

        <TabsContent value="planning" className="grid gap-4 min-w-0 mt-6 overflow-hidden outline-none">
          <FinancialPlanningPanel />
        </TabsContent>

        <TabsContent value="control_tower" className="grid gap-4 min-w-0 mt-6 overflow-hidden outline-none">
          <FinanceControlTowerPanel />
        </TabsContent>

        <TabsContent value="decisions" className="grid gap-4 min-w-0 mt-6 overflow-hidden outline-none">
          <FinancialDecisionBoard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
