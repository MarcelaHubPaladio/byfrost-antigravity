import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireFinancingSimulatorEnabled } from "@/components/RequireFinancingSimulatorEnabled";
import { useTenant } from "@/providers/TenantProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinancingSimulationList } from "@/components/financing/FinancingSimulationList";
import { FinancingSimulationWizard } from "@/components/financing/FinancingSimulationWizard";
import { FinancingBankRulesPanel } from "@/components/financing/FinancingBankRulesPanel";
import { FinancingSimulationPdfButton } from "@/components/financing/FinancingSimulationPdfButton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, Building2, Settings2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fmtBRL, fmtPct, runSimulation, getEffectiveRate, calcAge } from "@/components/financing/useSimulationEngine";
import { cn } from "@/lib/utils";

type PanelMode = "list" | "new" | "view";

export default function FinancingSimulator() {
  const { activeTenantId, activeTenant } = useTenant();
  const isAdmin = activeTenant?.role === "admin";

  const [tab, setTab] = useState("simulations");
  const [panelMode, setPanelMode] = useState<PanelMode>("list");
  const [viewingSim, setViewingSim] = useState<any>(null);

  const handleNew = () => {
    setViewingSim(null);
    setPanelMode("new");
    setTab("simulations");
  };

  const handleView = (sim: any) => {
    setViewingSim(sim);
    setPanelMode("view");
    setTab("simulations");
  };

  const handleSaved = () => {
    setViewingSim(null);
    setPanelMode("list");
  };

  const handleCancel = () => {
    setViewingSim(null);
    setPanelMode("list");
  };

  return (
    <RequireAuth>
      <RequireFinancingSimulatorEnabled>
        <AppShell>
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--byfrost-accent)/0.12)] text-[hsl(var(--byfrost-accent))]">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-slate-900">Simulador de Financiamento</h1>
                  <p className="text-xs text-slate-500">Imóveis · SAC e Tabela Price</p>
                </div>
              </div>
            </div>

            <Tabs value={tab} onValueChange={(v) => { setTab(v); if (v !== "simulations") setPanelMode("list"); }}>
              <TabsList className="h-10 rounded-2xl bg-slate-100 p-1">
                <TabsTrigger value="simulations" className="rounded-xl text-xs">
                  <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
                  Simulações
                </TabsTrigger>
                {(isAdmin) && (
                  <TabsTrigger value="banks" className="rounded-xl text-xs">
                    <Building2 className="mr-1.5 h-3.5 w-3.5" />
                    Bancos
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="simulations" className="mt-4">
                <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur">
                  {panelMode === "list" && (
                    <FinancingSimulationList
                      onNew={handleNew}
                      onEdit={handleView}
                      onView={handleView}
                    />
                  )}

                  {(panelMode === "new" || panelMode === "view") && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-2xl text-xs"
                          onClick={handleCancel}
                        >
                          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                          Voltar à lista
                        </Button>
                        <span className="text-sm font-semibold text-slate-700">
                          {panelMode === "new" ? "Nova Simulação" : "Ver / Editar Simulação"}
                        </span>
                      </div>

                      {/* If viewing/editing existing sim, show detail + PDF button at top */}
                      {panelMode === "view" && viewingSim && (
                        <ViewSimulationDetail
                          sim={viewingSim}
                          onEdit={() => setPanelMode("new")}
                        />
                      )}

                      {panelMode === "new" && (
                        <FinancingSimulationWizard
                          initialSim={viewingSim}
                          onSaved={handleSaved}
                          onCancel={handleCancel}
                        />
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>

              {isAdmin && (
                <TabsContent value="banks" className="mt-4">
                  <div className="rounded-[28px] border border-slate-200 bg-white/65 p-4 shadow-sm backdrop-blur">
                    <FinancingBankRulesPanel />
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </div>
        </AppShell>
      </RequireFinancingSimulatorEnabled>
    </RequireAuth>
  );
}

function ViewSimulationDetail({ sim, onEdit }: { sim: any; onEdit: () => void }) {
  const c = sim.client_snapshot_json ?? {};
  const p = sim.simulation_params_json ?? {};
  const r = sim.results_json ?? {};

  // Reconstruct SimulationResult from saved data for PDF
  const simResult = r.loanValue != null ? {
    loanValue: r.loanValue,
    effectiveMonthlyRate: 0,
    sac: {
      firstPayment: r.sac?.firstPayment ?? 0,
      lastPayment: r.sac?.lastPayment ?? 0,
      totalPaid: r.sac?.totalPaid ?? 0,
      totalInterest: r.sac?.totalInterest ?? 0,
      monthlyAmortization: r.sac?.monthlyAmortization ?? 0,
      monthlyInsurance: 0,
      schedule: [],
    },
    price: {
      monthlyPayment: r.price?.monthlyPayment ?? 0,
      totalPaid: r.price?.totalPaid ?? 0,
      totalInterest: r.price?.totalInterest ?? 0,
      monthlyInsurance: 0,
      schedule: [],
    },
    tac: r.tac ?? 0,
    cetEstimatePct: r.cetEstimatePct ?? 0,
    minIncomeRequired: r.minIncomeRequired ?? 0,
    availableForFinancing: 0,
    incomeIsEnough: true,
  } : null;

  const STATUS_COLOR: Record<string, string> = {
    draft: "bg-amber-100 text-amber-700",
    finalized: "bg-emerald-100 text-emerald-700",
    archived: "bg-slate-100 text-slate-500",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-slate-500">#{sim.reference_number}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_COLOR[sim.status] ?? "bg-slate-100 text-slate-500")}>
            {sim.status === "draft" ? "Rascunho" : sim.status === "finalized" ? "Finalizada" : "Arquivada"}
          </span>
        </div>
        <div className="flex gap-2">
          {simResult && (
            <FinancingSimulationPdfButton
              clientSnapshot={c}
              simulationParams={p}
              simResult={simResult}
              bankName={p.bank_name ?? ""}
              referenceNumber={sim.reference_number ?? ""}
            />
          )}
          <Button variant="outline" size="sm" className="h-9 rounded-2xl text-xs" onClick={onEdit}>
            Editar simulação
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Cliente */}
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
          <div className="mb-2 text-xs font-semibold text-slate-500">Cliente</div>
          <div className="text-sm font-bold text-slate-900">{c.name ?? "—"}</div>
          {c.cpf && <div className="text-xs text-slate-500">CPF: {c.cpf}</div>}
          {c.gross_income && <div className="text-xs text-slate-500">Renda: {fmtBRL(c.gross_income)}</div>}
          {c.is_public_servant && <div className="mt-1 text-xs text-blue-600 font-semibold">Servidor Público</div>}
          {c.fgts_years > 0 && <div className="text-xs text-slate-500">FGTS: {c.fgts_years} anos</div>}
        </div>

        {/* Imóvel */}
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
          <div className="mb-2 text-xs font-semibold text-slate-500">Imóvel e banco</div>
          <div className="text-sm font-bold text-slate-900">{p.bank_name ?? "—"}</div>
          {p.property_value && <div className="text-xs text-slate-500">Valor: {fmtBRL(p.property_value)}</div>}
          {p.loan_value && <div className="text-xs text-slate-500">Financiado: {fmtBRL(p.loan_value)}</div>}
          {p.effective_rate_pct && <div className="text-xs text-slate-500">Taxa: {fmtPct(p.effective_rate_pct)} a.a.</div>}
          {p.term_months && <div className="text-xs text-slate-500">Prazo: {p.term_months} meses</div>}
        </div>

        {/* Resultados */}
        {r.price?.monthlyPayment && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="mb-2 text-xs font-semibold text-emerald-700">Price (parcela)</div>
            <div className="text-lg font-bold text-emerald-700">{fmtBRL(r.price.monthlyPayment)}/mês</div>
            {r.sac?.firstPayment && (
              <div className="text-xs text-slate-500">SAC 1ª:{" "}<span className="font-semibold">{fmtBRL(r.sac.firstPayment)}</span></div>
            )}
            {r.cetEstimatePct && (
              <div className="text-xs text-slate-500">CET: {fmtPct(r.cetEstimatePct)} a.a.</div>
            )}
          </div>
        )}
      </div>

      {sim.notes && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span className="font-semibold">Observações: </span>{sim.notes}
        </div>
      )}
    </div>
  );
}
