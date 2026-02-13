import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { FinancialLedgerPanel } from "@/components/finance/FinancialLedgerPanel";

export default function FinanceLedger() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-4">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Financeiro • Lançamentos
            </h1>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Lançamentos manuais com sugestão automática de categoria e aprendizado por correções.
            </div>
          </div>

          <FinancialLedgerPanel />
        </div>
      </AppShell>
    </RequireAuth>
  );
}
