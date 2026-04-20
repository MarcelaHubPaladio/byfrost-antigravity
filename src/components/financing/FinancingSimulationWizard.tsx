import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import {
  runSimulation,
  getEffectiveRate,
  calcAge,
  fmtBRL,
  fmtPct,
  type SimulationResult,
} from "./useSimulationEngine";
import { FinancingSimulationPdfButton } from "./FinancingSimulationPdfButton";
import {
  User2,
  Home,
  TrendingUp,
  Check,
  ChevronRight,
  Search,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";

type BankRule = {
  id: string;
  bank_name: string;
  bank_code: string;
  base_rate_pct: number;
  rate_rules_json: any[];
  tac_json: Record<string, any>;
  max_term_months: number | null;
  is_active: boolean;
};

type Entity = {
  id: string;
  display_name: string;
  cpf?: string | null;
  birth_date?: string | null;
  gross_income?: number | null;
  marital_status?: string | null;
  has_minor_children?: boolean | null;
  fgts_years?: number | null;
  is_public_servant?: boolean | null;
  income_commitment_pct?: number | null;
  metadata?: Record<string, any>;
};

interface Props {
  initialSim?: any;
  onSaved: () => void;
  onCancel: () => void;
}

const STEPS = [
  { id: 1, label: "Cliente", icon: User2 },
  { id: 2, label: "Imóvel", icon: Home },
  { id: 3, label: "Resultado", icon: TrendingUp },
];

const MARITAL_OPTIONS = [
  { value: "", label: "Não informado" },
  { value: "solteiro", label: "Solteiro(a)" },
  { value: "casado", label: "Casado(a)" },
  { value: "divorciado", label: "Divorciado(a)" },
  { value: "viuvo", label: "Viúvo(a)" },
  { value: "uniao_estavel", label: "União Estável" },
];

export function FinancingSimulationWizard({ initialSim, onSaved, onCancel }: Props) {
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 — Cliente
  const [entitySearch, setEntitySearch] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientCpf, setClientCpf] = useState("");
  const [clientBirthDate, setClientBirthDate] = useState("");
  const [clientIncome, setClientIncome] = useState("");
  const [clientMarital, setClientMarital] = useState("");
  const [clientMinorChildren, setClientMinorChildren] = useState(false);
  const [clientFgtsYears, setClientFgtsYears] = useState("");
  const [clientPublicServant, setClientPublicServant] = useState(false);
  const [clientCommitment, setClientCommitment] = useState("");

  // Step 2 — Imóvel / Condições
  const [propertyValue, setPropertyValue] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [fgtsAmount, setFgtsAmount] = useState("");
  const [termMonths, setTermMonths] = useState("360");
  const [selectedBankId, setSelectedBankId] = useState("");
  const [notes, setNotes] = useState("");

  // Computed result
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [selectedBank, setSelectedBank] = useState<BankRule | null>(null);
  const [effectiveRate, setEffectiveRate] = useState(0);

  // Entity search results
  const [entityResults, setEntityResults] = useState<Entity[]>([]);
  const [searching, setSearching] = useState(false);

  const banksQ = useQuery({
    queryKey: ["financing_bank_rules", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financing_bank_rules")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("bank_name");
      if (error) throw error;
      return (data ?? []) as BankRule[];
    },
  });

  const banks = banksQ.data ?? [];

  // Pre-fill from initialSim if editing
  useEffect(() => {
    if (!initialSim) return;
    const c = initialSim.client_snapshot_json ?? {};
    const p = initialSim.simulation_params_json ?? {};
    setClientName(c.name ?? "");
    setClientCpf(c.cpf ?? "");
    setClientBirthDate(c.birth_date ?? "");
    setClientIncome(String(c.gross_income ?? ""));
    setClientMarital(c.marital_status ?? "");
    setClientMinorChildren(Boolean(c.has_minor_children));
    setClientFgtsYears(String(c.fgts_years ?? ""));
    setClientPublicServant(Boolean(c.is_public_servant));
    setClientCommitment(String(c.income_commitment_pct ?? ""));
    setPropertyValue(String(p.property_value ?? ""));
    setDownPayment(String(p.down_payment ?? ""));
    setFgtsAmount(String(p.fgts_amount ?? ""));
    setTermMonths(String(p.term_months ?? 360));
    setSelectedBankId(p.bank_rule_id ?? "");
    setNotes(initialSim.notes ?? "");
  }, [initialSim]);

  const searchEntities = async () => {
    if (!activeTenantId || entitySearch.trim().length < 2) return;
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id,display_name,cpf,birth_date,gross_income,marital_status,has_minor_children,fgts_years,is_public_servant,income_commitment_pct,metadata")
        .eq("tenant_id", activeTenantId)
        .eq("entity_type", "party")
        .is("deleted_at", null)
        .or(`display_name.ilike.%${entitySearch}%,cpf.ilike.%${entitySearch}%`)
        .limit(10);
      if (error) throw error;
      setEntityResults((data ?? []) as Entity[]);
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  };

  const fillFromEntity = (e: Entity) => {
    setSelectedEntity(e);
    setClientName(e.display_name);
    if (e.cpf) setClientCpf(e.cpf);
    if (e.birth_date) setClientBirthDate(e.birth_date);
    if (e.gross_income) setClientIncome(String(e.gross_income));
    if (e.marital_status) setClientMarital(e.marital_status);
    if (e.has_minor_children != null) setClientMinorChildren(Boolean(e.has_minor_children));
    if (e.fgts_years) setClientFgtsYears(String(e.fgts_years));
    if (e.is_public_servant != null) setClientPublicServant(Boolean(e.is_public_servant));
    if (e.income_commitment_pct) setClientCommitment(String(e.income_commitment_pct));
    setEntityResults([]);
    setEntitySearch("");
  };

  // Compute simulation on step 3
  useEffect(() => {
    if (step !== 3) return;
    const bank = banks.find((b) => b.id === selectedBankId);
    if (!bank) return;
    setSelectedBank(bank);

    const age = calcAge(clientBirthDate);
    const rate = getEffectiveRate(bank.base_rate_pct, bank.rate_rules_json ?? [], {
      isPublicServant: clientPublicServant,
      fgtsYears: parseFloat(clientFgtsYears) || 0,
      age,
      hasMinorChildren: clientMinorChildren,
    });
    setEffectiveRate(rate);

    const result = runSimulation({
      propertyValue: parseFloat(propertyValue) || 0,
      downPayment: parseFloat(downPayment) || 0,
      fgtsAmount: parseFloat(fgtsAmount) || 0,
      termMonths: parseInt(termMonths) || 360,
      annualRatePct: rate,
      tacValue: bank.tac_json?.fixed ?? 0,
      grossIncome: parseFloat(clientIncome) || undefined,
      incomeCommitmentPct: parseFloat(clientCommitment) || 0,
    });
    setSimResult(result);
  }, [step, selectedBankId, banks, clientBirthDate, clientPublicServant, clientFgtsYears, clientMinorChildren, propertyValue, downPayment, fgtsAmount, termMonths, clientIncome, clientCommitment]);

  const clientSnapshot = useMemo(() => ({
    name: clientName,
    cpf: clientCpf,
    birth_date: clientBirthDate || null,
    gross_income: parseFloat(clientIncome) || null,
    marital_status: clientMarital || null,
    has_minor_children: clientMinorChildren,
    fgts_years: parseFloat(clientFgtsYears) || null,
    is_public_servant: clientPublicServant,
    income_commitment_pct: parseFloat(clientCommitment) || null,
  }), [clientName, clientCpf, clientBirthDate, clientIncome, clientMarital, clientMinorChildren, clientFgtsYears, clientPublicServant, clientCommitment]);

  const simulationParams = useMemo(() => ({
    property_value: parseFloat(propertyValue) || 0,
    down_payment: parseFloat(downPayment) || 0,
    fgts_amount: parseFloat(fgtsAmount) || 0,
    loan_value: simResult?.loanValue ?? 0,
    term_months: parseInt(termMonths) || 360,
    bank_rule_id: selectedBankId,
    bank_name: selectedBank?.bank_name ?? "",
    bank_code: selectedBank?.bank_code ?? "",
    effective_rate_pct: effectiveRate,
  }), [propertyValue, downPayment, fgtsAmount, simResult, termMonths, selectedBankId, selectedBank, effectiveRate]);

  const resultsJson = useMemo(() => {
    if (!simResult) return {};
    return {
      sac: {
        firstPayment: simResult.sac.firstPayment,
        lastPayment: simResult.sac.lastPayment,
        totalPaid: simResult.sac.totalPaid,
        totalInterest: simResult.sac.totalInterest,
        monthlyAmortization: simResult.sac.monthlyAmortization,
      },
      price: {
        monthlyPayment: simResult.price.monthlyPayment,
        totalPaid: simResult.price.totalPaid,
        totalInterest: simResult.price.totalInterest,
      },
      tac: simResult.tac,
      cetEstimatePct: simResult.cetEstimatePct,
      minIncomeRequired: simResult.minIncomeRequired,
      loanValue: simResult.loanValue,
    };
  }, [simResult]);

  const saveSimulation = async (status: "draft" | "finalized") => {
    if (!activeTenantId || !user?.id) return;
    setSaving(true);
    try {
      // Update entity if selected and fields changed
      if (selectedEntity) {
        const patch: Record<string, any> = {};
        if (!selectedEntity.cpf && clientCpf) patch.cpf = clientCpf;
        if (!selectedEntity.birth_date && clientBirthDate) patch.birth_date = clientBirthDate;
        if (!selectedEntity.gross_income && clientIncome) patch.gross_income = parseFloat(clientIncome);
        if (!selectedEntity.marital_status && clientMarital) patch.marital_status = clientMarital;
        if (selectedEntity.has_minor_children == null && clientMinorChildren != null) patch.has_minor_children = clientMinorChildren;
        if (!selectedEntity.fgts_years && clientFgtsYears) patch.fgts_years = parseFloat(clientFgtsYears);
        if (selectedEntity.is_public_servant == null && clientPublicServant != null) patch.is_public_servant = clientPublicServant;
        if (!selectedEntity.income_commitment_pct && clientCommitment) patch.income_commitment_pct = parseFloat(clientCommitment);
        if (Object.keys(patch).length > 0) {
          await supabase.from("core_entities").update(patch).eq("id", selectedEntity.id);
        }
      }

      const payload = {
        tenant_id: activeTenantId,
        entity_id: selectedEntity?.id ?? null,
        bank_rule_id: selectedBankId || null,
        created_by: user.id,
        status,
        client_snapshot_json: clientSnapshot,
        simulation_params_json: simulationParams,
        results_json: resultsJson,
        notes: notes || null,
      };

      if (initialSim?.id) {
        const { error } = await supabase.from("financing_simulations").update(payload).eq("id", initialSim.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("financing_simulations").insert(payload);
        if (error) throw error;
      }

      showSuccess(status === "finalized" ? "Simulação finalizada!" : "Rascunho salvo.");
      await qc.invalidateQueries({ queryKey: ["financing_simulations", activeTenantId] });
      onSaved();
    } catch (e: any) {
      showError(`Falha ao salvar: ${e?.message ?? "erro"}`);
    } finally {
      setSaving(false);
    }
  };

  const canStep2 = clientName.trim().length > 0;
  const canStep3 = Boolean(selectedBankId) && Boolean(propertyValue) && Boolean(downPayment) && Boolean(termMonths);

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, idx) => {
          const active = step === s.id;
          const done = step > s.id;
          return (
            <div key={s.id} className="flex items-center flex-1">
              <button
                type="button"
                onClick={() => { if (done || active) setStep(s.id); }}
                className={cn(
                  "flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition",
                  active
                    ? "bg-[hsl(var(--byfrost-accent))] text-white shadow-sm"
                    : done
                    ? "bg-emerald-100 text-emerald-700 cursor-pointer hover:bg-emerald-200"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                )}
              >
                <s.icon className="h-3.5 w-3.5" />
                {s.label}
                {done && <Check className="h-3 w-3" />}
              </button>
              {idx < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-slate-300 mx-1 flex-shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* Step 1 — Cliente */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <Label className="text-xs font-semibold text-slate-700">Buscar cliente existente</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                value={entitySearch}
                onChange={(e) => setEntitySearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchEntities()}
                placeholder="Nome ou CPF do cliente…"
                className="rounded-2xl"
              />
              <Button
                variant="outline"
                onClick={searchEntities}
                disabled={searching || entitySearch.length < 2}
                className="rounded-2xl"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {entityResults.length > 0 && (
              <div className="mt-2 space-y-1">
                {entityResults.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => fillFromEntity(e)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-[hsl(var(--byfrost-accent)/0.4)] hover:bg-[hsl(var(--byfrost-accent)/0.05)] transition"
                  >
                    <span className="font-semibold text-slate-900">{e.display_name}</span>
                    {e.cpf && <span className="ml-2 text-xs text-slate-500">CPF: {e.cpf}</span>}
                  </button>
                ))}
              </div>
            )}
            {selectedEntity && (
              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Vinculado a: <span className="font-semibold">{selectedEntity.display_name}</span>
                <button className="text-slate-400 hover:text-slate-600 underline" onClick={() => setSelectedEntity(null)}>remover</button>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Nome completo *</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} className="mt-1 rounded-2xl" placeholder="Maria da Silva" />
            </div>
            <div>
              <Label className="text-xs">CPF</Label>
              <Input value={clientCpf} onChange={(e) => setClientCpf(e.target.value)} className="mt-1 rounded-2xl" placeholder="000.000.000-00" />
            </div>
            <div>
              <Label className="text-xs">Data de nascimento</Label>
              <Input type="date" value={clientBirthDate} onChange={(e) => setClientBirthDate(e.target.value)} className="mt-1 rounded-2xl" />
            </div>
            <div>
              <Label className="text-xs">Renda bruta mensal (R$)</Label>
              <Input type="number" value={clientIncome} onChange={(e) => setClientIncome(e.target.value)} className="mt-1 rounded-2xl" placeholder="5000" />
            </div>
            <div>
              <Label className="text-xs">Estado civil</Label>
              <select
                value={clientMarital}
                onChange={(e) => setClientMarital(e.target.value)}
                className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
              >
                {MARITAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Anos de FGTS acumulado</Label>
              <Input type="number" value={clientFgtsYears} onChange={(e) => setClientFgtsYears(e.target.value)} className="mt-1 rounded-2xl" placeholder="0" step="0.5" />
            </div>
            <div>
              <Label className="text-xs">% renda já comprometida</Label>
              <Input type="number" value={clientCommitment} onChange={(e) => setClientCommitment(e.target.value)} className="mt-1 rounded-2xl" placeholder="0" step="1" max="100" />
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={clientMinorChildren} onChange={(e) => setClientMinorChildren(e.target.checked)} className="rounded" />
              <span className="text-slate-700">Tem filhos menores de idade</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={clientPublicServant} onChange={(e) => setClientPublicServant(e.target.checked)} className="rounded" />
              <span className="text-slate-700">Servidor público</span>
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-2xl" onClick={onCancel}>Cancelar</Button>
            <Button
              className="rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white"
              onClick={() => setStep(2)}
              disabled={!canStep2}
            >
              Próximo <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2 — Imóvel */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Valor do imóvel (R$) *</Label>
              <Input type="number" value={propertyValue} onChange={(e) => setPropertyValue(e.target.value)} className="mt-1 rounded-2xl" placeholder="300000" />
            </div>
            <div>
              <Label className="text-xs">Valor de entrada (R$) *</Label>
              <Input type="number" value={downPayment} onChange={(e) => setDownPayment(e.target.value)} className="mt-1 rounded-2xl" placeholder="60000" />
            </div>
            <div>
              <Label className="text-xs">FGTS disponível (R$)</Label>
              <Input type="number" value={fgtsAmount} onChange={(e) => setFgtsAmount(e.target.value)} className="mt-1 rounded-2xl" placeholder="0" />
            </div>
            <div>
              <Label className="text-xs">Prazo (meses) *</Label>
              <Input type="number" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} className="mt-1 rounded-2xl" placeholder="360" min="12" max="420" />
            </div>
          </div>

          {propertyValue && downPayment && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
              <div className="font-semibold text-emerald-800">Valor a financiar</div>
              <div className="mt-1 text-2xl font-bold text-emerald-700">
                {fmtBRL(Math.max(0, (parseFloat(propertyValue) || 0) - (parseFloat(downPayment) || 0) - (parseFloat(fgtsAmount) || 0)))}
              </div>
              <div className="text-xs text-emerald-600">
                = Imóvel {fmtBRL(parseFloat(propertyValue) || 0)} − Entrada {fmtBRL(parseFloat(downPayment) || 0)}
                {parseFloat(fgtsAmount) > 0 ? ` − FGTS ${fmtBRL(parseFloat(fgtsAmount))}` : ""}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Banco *</Label>
            {banks.length === 0 ? (
              <div className="mt-1 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Nenhum banco configurado. Um administrador deve configurar as regras de bancos primeiro.
              </div>
            ) : (
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {banks.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBankId(b.id)}
                    className={cn(
                      "rounded-2xl border px-4 py-3 text-left transition",
                      selectedBankId === b.id
                        ? "border-[hsl(var(--byfrost-accent))] bg-[hsl(var(--byfrost-accent)/0.08)]"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-700">{b.bank_code}</div>
                        <div className="text-sm font-semibold text-slate-900">{b.bank_name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-[hsl(var(--byfrost-accent))]">{b.base_rate_pct}%</div>
                        <div className="text-[11px] text-slate-400">a.a. base</div>
                      </div>
                    </div>
                    {selectedBankId === b.id && clientBirthDate && (
                      <div className="mt-2 text-[11px] text-[hsl(var(--byfrost-accent))] font-semibold">
                        Taxa efetiva calculada: {fmtPct(getEffectiveRate(b.base_rate_pct, b.rate_rules_json ?? [], {
                          isPublicServant: clientPublicServant,
                          fgtsYears: parseFloat(clientFgtsYears) || 0,
                          age: calcAge(clientBirthDate),
                          hasMinorChildren: clientMinorChildren,
                        }))} a.a.
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Observações (opcional)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[hsl(var(--byfrost-accent)/0.5)] resize-none"
              placeholder="Notas adicionais sobre a proposta…"
            />
          </div>

          <div className="flex justify-between gap-2">
            <Button variant="outline" className="rounded-2xl" onClick={() => setStep(1)}>Voltar</Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => saveSimulation("draft")}
                disabled={saving || !canStep2}
              >
                Salvar rascunho
              </Button>
              <Button
                className="rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white"
                onClick={() => setStep(3)}
                disabled={!canStep3}
              >
                Ver resultado <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — Resultado */}
      {step === 3 && simResult && (
        <div className="space-y-4">
          {/* Loan summary */}
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-center">
              <div className="text-[11px] text-slate-500">Valor financiado</div>
              <div className="text-lg font-bold text-slate-900">{fmtBRL(simResult.loanValue)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-center">
              <div className="text-[11px] text-slate-500">Taxa efetiva</div>
              <div className="text-lg font-bold text-[hsl(var(--byfrost-accent))]">{fmtPct(effectiveRate)} a.a.</div>
              <div className="text-[11px] text-slate-400">{fmtPct(simResult.effectiveMonthlyRate)} a.m.</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-center">
              <div className="text-[11px] text-slate-500">CET estimado</div>
              <div className="text-lg font-bold text-slate-700">{fmtPct(simResult.cetEstimatePct)} a.a.</div>
            </div>
          </div>

          {/* SAC vs Price */}
          <div className="grid gap-3 sm:grid-cols-2">
            {/* SAC */}
            <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-bold text-white">SAC</span>
                <span className="text-xs text-slate-600">Parcelas decrescentes</span>
              </div>
              <table className="w-full text-xs">
                <tbody className="space-y-1">
                  <tr><td className="text-slate-500 py-0.5">1ª parcela</td><td className="text-right font-semibold text-blue-700">{fmtBRL(simResult.sac.firstPayment)}</td></tr>
                  <tr><td className="text-slate-500 py-0.5">Última parcela</td><td className="text-right font-semibold text-blue-600">{fmtBRL(simResult.sac.lastPayment)}</td></tr>
                  <tr><td className="text-slate-500 py-0.5">Amort. mensal</td><td className="text-right text-slate-700">{fmtBRL(simResult.sac.monthlyAmortization)}</td></tr>
                  <tr><td className="text-slate-500 py-0.5">Seguro (1º mês)</td><td className="text-right text-slate-700">{fmtBRL(simResult.sac.monthlyInsurance)}</td></tr>
                  <tr className="border-t border-blue-200"><td className="text-slate-600 font-semibold pt-1">Total pago</td><td className="text-right font-bold text-slate-900 pt-1">{fmtBRL(simResult.sac.totalPaid)}</td></tr>
                  <tr><td className="text-slate-500">Juros totais</td><td className="text-right text-slate-600">{fmtBRL(simResult.sac.totalInterest)}</td></tr>
                </tbody>
              </table>
            </div>

            {/* Price */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white">Price</span>
                <span className="text-xs text-slate-600">Parcelas fixas</span>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="text-slate-500 py-0.5">Parcela fixa</td><td className="text-right font-bold text-emerald-700 text-base">{fmtBRL(simResult.price.monthlyPayment)}</td></tr>
                  <tr><td className="text-slate-500 py-0.5">Seguro (1º mês)</td><td className="text-right text-slate-700">{fmtBRL(simResult.price.monthlyInsurance)}</td></tr>
                  <tr><td className="text-slate-500 py-0.5">Total c/ seguro</td><td className="text-right font-semibold text-slate-700">{fmtBRL(simResult.price.monthlyPayment + simResult.price.monthlyInsurance)}/mês</td></tr>
                  <tr className="border-t border-emerald-200"><td className="text-slate-600 font-semibold pt-1">Total pago</td><td className="text-right font-bold text-slate-900 pt-1">{fmtBRL(simResult.price.totalPaid)}</td></tr>
                  <tr><td className="text-slate-500">Juros totais</td><td className="text-right text-slate-600">{fmtBRL(simResult.price.totalInterest)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* TAC + renda */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
              <div className="text-[11px] text-slate-500">TAC (Tarifa de Avaliação de Crédito)</div>
              <div className="text-base font-bold text-slate-800">{fmtBRL(simResult.tac)}</div>
            </div>
            <div className={cn(
              "rounded-2xl border px-4 py-3",
              simResult.incomeIsEnough ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
            )}>
              <div className="flex items-center gap-1 text-[11px]">
                {simResult.incomeIsEnough
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                <span className={simResult.incomeIsEnough ? "text-emerald-700" : "text-amber-700"}>
                  Renda mínima necessária (Price)
                </span>
              </div>
              <div className={cn("text-base font-bold", simResult.incomeIsEnough ? "text-emerald-800" : "text-amber-800")}>
                {fmtBRL(simResult.minIncomeRequired)}
              </div>
              {clientIncome && (
                <div className="text-[11px] text-slate-500">
                  Renda declarada: {fmtBRL(parseFloat(clientIncome))}
                  {simResult.incomeIsEnough ? " ✓ suficiente" : " ✗ insuficiente"}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <Info className="h-3.5 w-3.5 flex-shrink-0" />
            Simulação com fins ilustrativos. Taxas e valores sujeitos à análise de crédito e condições do banco.
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="outline" className="rounded-2xl" onClick={() => setStep(2)}>Voltar</Button>
            <div className="flex flex-wrap gap-2">
              <FinancingSimulationPdfButton
                clientSnapshot={clientSnapshot}
                simulationParams={simulationParams}
                simResult={simResult}
                bankName={selectedBank?.bank_name ?? ""}
                referenceNumber={initialSim?.reference_number ?? "RASCUNHO"}
              />
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => saveSimulation("draft")}
                disabled={saving}
              >
                Salvar rascunho
              </Button>
              <Button
                className="rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => saveSimulation("finalized")}
                disabled={saving}
              >
                {saving ? "Salvando…" : "Finalizar proposta"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
