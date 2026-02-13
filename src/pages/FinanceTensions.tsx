import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { FinancialTensionsPanel } from "@/components/finance/FinancialTensionsPanel";

export default function FinanceTensions() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-4">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Financeiro • Tensões
            </h1>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Riscos financeiros detectados automaticamente (com score e explicação).
            </div>
          </div>

          <FinancialTensionsPanel />
        </div>
      </AppShell>
    </RequireAuth>
  );
}
