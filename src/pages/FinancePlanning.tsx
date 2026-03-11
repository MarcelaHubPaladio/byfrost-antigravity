import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { FinancialPlanningPanel } from "@/components/finance/FinancialPlanningPanel";

export default function FinancePlanning() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="mx-auto w-full">
          <div className="mb-4">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Financeiro • Planejamento
            </h1>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Orçamentos, contas a pagar/receber e projeção básica de caixa.
            </div>
          </div>

          <FinancialPlanningPanel />
        </div>
      </AppShell>
    </RequireAuth>
  );
}
