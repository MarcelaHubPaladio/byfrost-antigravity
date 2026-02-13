import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { FinancialIngestionPanel } from "@/components/finance/FinancialIngestionPanel";

export default function FinanceIngestion() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-4">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Financeiro • Ingestão
            </h1>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Envie extratos para criar transações automaticamente (sem bloquear a requisição).
            </div>
          </div>

          <FinancialIngestionPanel />
        </div>
      </AppShell>
    </RequireAuth>
  );
}
