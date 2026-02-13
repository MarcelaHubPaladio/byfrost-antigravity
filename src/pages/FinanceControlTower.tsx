import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { FinanceControlTowerPanel } from "@/components/finance/FinanceControlTowerPanel";

export default function FinanceControlTower() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-4">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Financeiro • Control Tower
            </h1>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Saúde financeira em leitura rápida.
            </div>
          </div>

          <FinanceControlTowerPanel />
        </div>
      </AppShell>
    </RequireAuth>
  );
}
