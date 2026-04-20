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
import { fmtBRL, fmtPct } from "@/components/financing/useSimulationEngine";
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

  // Normalize: new format has r.banks[], old format has root-level r.price/r.sac
  const savedBankResults: any[] = r.banks?.length ? r.banks : (
    r.price?.monthlyPayment ? [{
      bankId: p.bank_rule_id ?? "legacy",
      bankName: p.bank_name ?? "Banco",
      bankCode: p.bank_code ?? "—",
      effectiveRatePct: p.effective_rate_pct ?? 0,
      downPayment: p.down_payment ?? 0,
      loanValue: p.loan_value ?? r.loanValue ?? 0,
      minDownPct: 20,
      sac: r.sac ?? {},
      price: r.price ?? {},
      tac: r.tac ?? 0,
      cetEstimatePct: r.cetEstimatePct ?? 0,
      minIncomeRequired: r.minIncomeRequired ?? 0,
    }] : []
  );

  const bestPricePayment = savedBankResults.length > 1
    ? Math.min(...savedBankResults.map((b) => b.price?.monthlyPayment ?? Infinity))
    : null;

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
          {savedBankResults.length > 0 && (
            <FinancingSimulationPdfButton
              clientSnapshot={c}
              simulationParams={p}
              bankResults={savedBankResults}
              referenceNumber={sim.reference_number ?? ""}
            />
          )}
          <Button variant="outline" size="sm" className="h-9 rounded-2xl text-xs" onClick={onEdit}>
            Editar simulação
          </Button>
        </div>
      </div>

      {/* Cabeçalho: cliente + imóvel */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
          <div className="mb-2 text-xs font-semibold text-slate-500">Cliente</div>
          <div className="text-sm font-bold text-slate-900">{c.name ?? "—"}</div>
          {c.cpf && <div className="text-xs text-slate-500">CPF: {c.cpf}</div>}
          {c.gross_income && <div className="text-xs text-slate-500">Renda: {fmtBRL(c.gross_income)}</div>}
          {c.is_public_servant && <div className="mt-1 text-xs text-blue-600 font-semibold">Servidor Público</div>}
          {c.fgts_years > 0 && <div className="text-xs text-slate-500">FGTS: {c.fgts_years} anos</div>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
          <div className="mb-2 text-xs font-semibold text-slate-500">Imóvel</div>
          {p.property_value && <div className="text-sm font-bold text-slate-900">{fmtBRL(p.property_value)}</div>}
          {p.term_months && <div className="text-xs text-slate-500">Prazo: {p.term_months} meses</div>}
          {(p.fgts_amount > 0) && <div className="text-xs text-slate-500">FGTS usado: {fmtBRL(p.fgts_amount)}</div>}
          <div className="text-xs text-slate-500 mt-1">
            {savedBankResults.length} banco{savedBankResults.length !== 1 ? "s" : ""} comparados
          </div>
        </div>
      </div>

      {/* Comparativo resumido */}
      {savedBankResults.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="py-2.5 px-4 text-left text-[11px] font-semibold text-slate-300 w-36">Indicador</th>
                {savedBankResults.map((b: any) => (
                  <th key={b.bankId} className={cn(
                    "py-2.5 px-3 text-center text-[11px] font-semibold min-w-[120px]",
                    bestPricePayment !== null && b.price?.monthlyPayment === bestPricePayment ? "bg-emerald-700" : ""
                  )}>
                    <div className="font-bold">{b.bankCode}</div>
                    <div className="text-slate-300 font-normal text-[10px]">{b.bankName}</div>
                    <div className="text-[10px] text-slate-400">{fmtPct(b.effectiveRatePct ?? 0)} a.a.</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Entrada mín.", key: "downPayment", fmt: fmtBRL },
                { label: "Valor financiado", key: "loanValue", fmt: fmtBRL },
                { label: "SAC — 1ª parcela", key: null, fmt: fmtBRL, get: (b: any) => b.sac?.firstPayment },
                { label: "SAC — última parcela", key: null, fmt: fmtBRL, get: (b: any) => b.sac?.lastPayment },
                { label: "Price — parcela fixa", key: null, fmt: fmtBRL, get: (b: any) => b.price?.monthlyPayment },
                { label: "Price — total pago", key: null, fmt: fmtBRL, get: (b: any) => b.price?.totalPaid },
                { label: "CET estimado", key: "cetEstimatePct", fmt: (v: number) => `${fmtPct(v)} a.a.` },
                { label: "Renda mínima", key: "minIncomeRequired", fmt: fmtBRL },
              ].map(({ label, key, fmt, get }, rowIdx) => {
                const getValue = (b: any) => get ? get(b) : (b as any)[key!];
                const values = savedBankResults.map(getValue);
                const minVal = Math.min(...values.filter((v) => typeof v === "number" && isFinite(v)));
                return (
                  <tr key={label} className={cn("border-b border-slate-100", rowIdx % 2 === 1 ? "bg-slate-50/60" : "")}>
                    <td className="py-2 px-4 text-slate-600">{label}</td>
                    {savedBankResults.map((b: any) => {
                      const val = getValue(b);
                      const isBest = savedBankResults.length > 1 && typeof val === "number" && val === minVal;
                      return (
                        <td key={b.bankId} className={cn(
                          "py-2 px-3 text-right",
                          isBest ? "font-bold text-emerald-700 bg-emerald-50" : "text-slate-700"
                        )}>
                          {typeof val === "number" ? fmt(val) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sim.notes && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span className="font-semibold">Observações: </span>{sim.notes}
        </div>
      )}
    </div>
  );
}


