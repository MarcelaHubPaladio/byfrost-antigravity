import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Landmark } from "lucide-react";
import { TransactionsTab } from "./FinancialLedgerPanel/TransactionsTab";
import { CategoriesTab } from "./FinancialLedgerPanel/CategoriesTab";
import { BanksTab } from "./FinancialLedgerPanel/BanksTab";
import { DreTab } from "./FinancialLedgerPanel/DreTab";

export function FinancialLedgerPanel() {
  const [activeTab, setActiveTab] = useState("transactions");

  // Handle ?tab=dre in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "dre" || t === "categories" || t === "banks") {
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
        <TabsList className="h-11 rounded-2xl bg-white/50 p-1 shadow-sm border border-slate-200/60 dark:bg-slate-900/50 dark:border-slate-800/60 flex w-full max-w-[500px]">
          <TabsTrigger 
            value="transactions" 
            className="rounded-xl flex-1 data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300"
          >
            Lançamentos
          </TabsTrigger>
          <TabsTrigger 
            value="categories" 
            className="rounded-xl flex-1 data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300"
          >
            Categorias
          </TabsTrigger>
          <TabsTrigger 
            value="banks" 
            className="rounded-xl flex-1 data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300"
          >
            Bancos
          </TabsTrigger>
          <TabsTrigger 
            value="dre" 
            className="rounded-xl flex-1 data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300"
          >
            DRE-Caixa
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
      </Tabs>
    </div>
  );
}
