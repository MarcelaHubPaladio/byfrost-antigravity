import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  runMultiBankSimulation,
  calcAge,
  fmtBRL,
  fmtPct,
  type BankSimResult,
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
  Loader2,
  UserX,
  Clock,
  RefreshCw,
  Star,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

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
};

interface Props {
  initialSim?: any;
  onSaved: () => void;
  onCancel: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Cliente", icon: User2 },
  { id: 2, label: "Imóvel", icon: Home },
  { id: 3, label: "Comparativo", icon: TrendingUp },
];

const MARITAL_OPTIONS = [
  { value: "", label: "Não informado" },
  { value: "solteiro", label: "Solteiro(a)" },
  { value: "casado", label: "Casado(a)" },
  { value: "divorciado", label: "Divorciado(a)" },
  { value: "viuvo", label: "Viúvo(a)" },
  { value: "uniao_estavel", label: "União Estável" },
];

const DRAFT_KEY_PREFIX = "byfrost_financing_wizard_";

function cpfDigits(cpf: string) { return cpf.replace(/\D/g, ""); }

function formatCpf(raw: string) {
  const d = cpfDigits(raw).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FinancingSimulationWizard({ initialSim, onSaved, onCancel }: Props) {
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const qc = useQueryClient();
  const draftKey = `${DRAFT_KEY_PREFIX}${activeTenantId}`;
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // ─ Draft banner ────────────────────────────────────────────────────────────
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftDate, setDraftDate] = useState<string | null>(null);

  // ─ Step 1: cliente ─────────────────────────────────────────────────────────
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
  const [cpfSearching, setCpfSearching] = useState(false);
  const [cpfNotFound, setCpfNotFound] = useState(false);
  const [showNameSearch, setShowNameSearch] = useState(false);
  const [entitySearch, setEntitySearch] = useState("");
  const [entityResults, setEntityResults] = useState<Entity[]>([]);
  const [nameSearching, setNameSearching] = useState(false);

  // ─ Step 2: imóvel ──────────────────────────────────────────────────────────
  const [propertyValue, setPropertyValue] = useState("");
  const [fgtsAmount, setFgtsAmount] = useState("");
  const [termMonths, setTermMonths] = useState("360");
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  // ─ Step 3: resultados ──────────────────────────────────────────────────────
  const [bankResults, setBankResults] = useState<BankSimResult[]>([]);

  // ─ Banks query ─────────────────────────────────────────────────────────────
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

  // ─ Derived: auto down payment per selected bank ───────────────────────────
  const autoDownPct = useMemo(() => {
    if (selectedBankIds.length === 0) return 20;
    const selectedBanks = banks.filter((b) => selectedBankIds.includes(b.id));
    // Use the most conservative (highest down pct) among selected banks
    const pcts = selectedBanks.map((b) => b.tac_json?.min_down_pct ?? 20);
    return Math.max(...pcts);
  }, [selectedBankIds, banks]);

  const autoDownValue = useMemo(() => {
    const pv = parseFloat(propertyValue) || 0;
    return (pv * autoDownPct) / 100;
  }, [propertyValue, autoDownPct]);

  // ─ Draft: serialize current form state ────────────────────────────────────
  const serializeDraft = useCallback(() => ({
    step,
    clientName, clientCpf, clientBirthDate, clientIncome,
    clientMarital, clientMinorChildren, clientFgtsYears,
    clientPublicServant, clientCommitment,
    selectedEntityId: selectedEntity?.id ?? null,
    propertyValue, fgtsAmount, termMonths,
    selectedBankIds, notes,
    savedAt: new Date().toISOString(),
  }), [step, clientName, clientCpf, clientBirthDate, clientIncome, clientMarital,
      clientMinorChildren, clientFgtsYears, clientPublicServant, clientCommitment,
      selectedEntity, propertyValue, fgtsAmount, termMonths, selectedBankIds, notes]);

  // Auto-save draft on meaningful state changes (debounced 1.5s)
  useEffect(() => {
    if (initialSim?.id) return; // don't override existing sim
    if (!activeTenantId) return;
    if (!clientName && !propertyValue) return; // nothing to save yet
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify(serializeDraft())); } catch { /* ignore */ }
    }, 1500);
    return () => { if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current); };
  }, [serializeDraft, activeTenantId, draftKey, initialSim, clientName, propertyValue]);

  // Restore draft or initialSim on mount
  useEffect(() => {
    if (initialSim) {
      // Editing existing simulation
      const c = initialSim.client_snapshot_json ?? {};
      const p = initialSim.simulation_params_json ?? {};
      setClientName(c.name ?? "");
      setClientCpf(formatCpf(c.cpf ?? ""));
      setClientBirthDate(c.birth_date ?? "");
      setClientIncome(String(c.gross_income ?? ""));
      setClientMarital(c.marital_status ?? "");
      setClientMinorChildren(Boolean(c.has_minor_children));
      setClientFgtsYears(String(c.fgts_years ?? ""));
      setClientPublicServant(Boolean(c.is_public_servant));
      setClientCommitment(String(c.income_commitment_pct ?? ""));
      setPropertyValue(String(p.property_value ?? ""));
      setFgtsAmount(String(p.fgts_amount ?? ""));
      setTermMonths(String(p.term_months ?? 360));
      // Backward compat: support both new (selected_bank_ids[]) and old (bank_rule_id)
      const bankIds = p.selected_bank_ids?.length
        ? p.selected_bank_ids
        : p.bank_rule_id
        ? [p.bank_rule_id]
        : [];
      setSelectedBankIds(bankIds);
      setNotes(initialSim.notes ?? "");
      return;
    }

    // Try restoring from localStorage draft
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      const age = (Date.now() - new Date(draft.savedAt).getTime()) / (1000 * 60 * 60);
      if (age > 24) { localStorage.removeItem(draftKey); return; }
      setDraftRestored(true);
      setDraftDate(new Date(draft.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }));
      applyDraft(draft);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyDraft = (d: any) => {
    if (d.clientName) setClientName(d.clientName);
    if (d.clientCpf) setClientCpf(d.clientCpf);
    if (d.clientBirthDate) setClientBirthDate(d.clientBirthDate);
    if (d.clientIncome) setClientIncome(d.clientIncome);
    if (d.clientMarital) setClientMarital(d.clientMarital);
    setClientMinorChildren(Boolean(d.clientMinorChildren));
    if (d.clientFgtsYears) setClientFgtsYears(d.clientFgtsYears);
    setClientPublicServant(Boolean(d.clientPublicServant));
    if (d.clientCommitment) setClientCommitment(d.clientCommitment);
    if (d.propertyValue) setPropertyValue(d.propertyValue);
    if (d.fgtsAmount) setFgtsAmount(d.fgtsAmount);
    if (d.termMonths) setTermMonths(d.termMonths);
    if (d.selectedBankIds?.length) setSelectedBankIds(d.selectedBankIds);
    if (d.notes) setNotes(d.notes);
    if (d.step && d.step > 1) setStep(d.step);
  };

  const clearDraft = () => {
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    setDraftRestored(false);
  };

  const resetForm = () => {
    clearDraft();
    setStep(1);
    setClientName(""); setClientCpf(""); setClientBirthDate(""); setClientIncome("");
    setClientMarital(""); setClientMinorChildren(false); setClientFgtsYears("");
    setClientPublicServant(false); setClientCommitment("");
    setSelectedEntity(null); setCpfNotFound(false);
    setPropertyValue(""); setFgtsAmount(""); setTermMonths("360");
    setSelectedBankIds([]); setNotes(""); setBankResults([]);
  };

  // ─ Entity lookup ───────────────────────────────────────────────────────────
  const fillFromEntity = useCallback((e: Entity) => {
    setSelectedEntity(e);
    setClientName(e.display_name);
    if (e.cpf) setClientCpf(formatCpf(e.cpf));
    if (e.birth_date) setClientBirthDate(e.birth_date);
    if (e.gross_income) setClientIncome(String(e.gross_income));
    if (e.marital_status) setClientMarital(e.marital_status);
    if (e.has_minor_children != null) setClientMinorChildren(Boolean(e.has_minor_children));
    if (e.fgts_years) setClientFgtsYears(String(e.fgts_years));
    if (e.is_public_servant != null) setClientPublicServant(Boolean(e.is_public_servant));
    if (e.income_commitment_pct) setClientCommitment(String(e.income_commitment_pct));
    setEntityResults([]); setEntitySearch(""); setShowNameSearch(false); setCpfNotFound(false);
  }, []);

  const lookupByCpf = useCallback(async (digits: string) => {
    if (!activeTenantId || digits.length !== 11) return;
    setCpfSearching(true); setCpfNotFound(false);
    try {
      const { data } = await supabase
        .from("core_entities")
        .select("id,display_name,cpf,birth_date,gross_income,marital_status,has_minor_children,fgts_years,is_public_servant,income_commitment_pct")
        .eq("tenant_id", activeTenantId)
        .eq("entity_type", "party")
        .is("deleted_at", null)
        .ilike("cpf", `%${digits}%`)
        .limit(1)
        .maybeSingle();
      if (data) { fillFromEntity(data as Entity); }
      else { setCpfNotFound(true); setSelectedEntity(null); }
    } catch { /* silent */ } finally { setCpfSearching(false); }
  }, [activeTenantId, fillFromEntity]);

  const handleCpfChange = (raw: string) => {
    const formatted = formatCpf(raw);
    setClientCpf(formatted);
    const digits = cpfDigits(formatted);
    if (digits.length < 11) { setCpfNotFound(false); if (selectedEntity) setSelectedEntity(null); }
    else { lookupByCpf(digits); }
  };

  const searchByName = async () => {
    if (!activeTenantId || entitySearch.trim().length < 2) return;
    setNameSearching(true);
    try {
      const { data } = await supabase
        .from("core_entities")
        .select("id,display_name,cpf,birth_date,gross_income,marital_status,has_minor_children,fgts_years,is_public_servant,income_commitment_pct")
        .eq("tenant_id", activeTenantId)
        .eq("entity_type", "party")
        .is("deleted_at", null)
        .ilike("display_name", `%${entitySearch}%`)
        .limit(10);
      setEntityResults((data ?? []) as Entity[]);
    } catch { /* ignore */ } finally { setNameSearching(false); }
  };

  // ─ Bank toggle ─────────────────────────────────────────────────────────────
  const toggleBank = (id: string) => {
    setSelectedBankIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // ─ Compute comparison proactively whenever inputs change ─────────────────
  // (not gated on step===3 so results are always fresh when user reaches step 3)
  useEffect(() => {
    const selectedBanks = banks.filter((b) => selectedBankIds.includes(b.id));
    if (selectedBanks.length === 0 || !propertyValue) {
      setBankResults([]);
      return;
    }

    const age = calcAge(clientBirthDate);
    const results = runMultiBankSimulation(selectedBanks, {
      propertyValue: parseFloat(propertyValue) || 0,
      fgtsAmount: parseFloat(fgtsAmount) || 0,
      termMonths: parseInt(termMonths) || 360,
      grossIncome: parseFloat(clientIncome) || undefined,
      incomeCommitmentPct: parseFloat(clientCommitment) || 0,
    }, {
      isPublicServant: clientPublicServant,
      fgtsYears: parseFloat(clientFgtsYears) || 0,
      age,
      hasMinorChildren: clientMinorChildren,
    });
    setBankResults(results);
  }, [selectedBankIds, banks, propertyValue, fgtsAmount, termMonths, clientIncome,
      clientCommitment, clientPublicServant, clientFgtsYears, clientBirthDate, clientMinorChildren]);

  // ─ Client snapshot ─────────────────────────────────────────────────────────
  const clientSnapshot = useMemo(() => ({
    name: clientName,
    cpf: cpfDigits(clientCpf) || null,
    birth_date: clientBirthDate || null,
    gross_income: parseFloat(clientIncome) || null,
    marital_status: clientMarital || null,
    has_minor_children: clientMinorChildren,
    fgts_years: parseFloat(clientFgtsYears) || null,
    is_public_servant: clientPublicServant,
    income_commitment_pct: parseFloat(clientCommitment) || null,
  }), [clientName, clientCpf, clientBirthDate, clientIncome, clientMarital,
      clientMinorChildren, clientFgtsYears, clientPublicServant, clientCommitment]);

  // ─ Save simulation ─────────────────────────────────────────────────────────
  const saveSimulation = async (status: "draft" | "finalized") => {
    if (!activeTenantId || !user?.id) return;
    setSaving(true);
    try {
      if (selectedEntity) {
        const patch: Record<string, any> = {};
        const digits = cpfDigits(clientCpf);
        if (!selectedEntity.cpf && digits) patch.cpf = digits;
        if (!selectedEntity.birth_date && clientBirthDate) patch.birth_date = clientBirthDate;
        if (!selectedEntity.gross_income && clientIncome) patch.gross_income = parseFloat(clientIncome);
        if (!selectedEntity.marital_status && clientMarital) patch.marital_status = clientMarital;
        if (selectedEntity.has_minor_children == null) patch.has_minor_children = clientMinorChildren;
        if (!selectedEntity.fgts_years && clientFgtsYears) patch.fgts_years = parseFloat(clientFgtsYears);
        if (selectedEntity.is_public_servant == null) patch.is_public_servant = clientPublicServant;
        if (!selectedEntity.income_commitment_pct && clientCommitment) patch.income_commitment_pct = parseFloat(clientCommitment);
        if (Object.keys(patch).length > 0) {
          await supabase.from("core_entities").update(patch).eq("id", selectedEntity.id);
        }
      }

      const payload = {
        tenant_id: activeTenantId,
        entity_id: selectedEntity?.id ?? null,
        created_by: user.id,
        status,
        client_snapshot_json: clientSnapshot,
        simulation_params_json: {
          property_value: parseFloat(propertyValue) || 0,
          fgts_amount: parseFloat(fgtsAmount) || 0,
          term_months: parseInt(termMonths) || 360,
          selected_bank_ids: selectedBankIds,
          auto_down_payment: true,
        },
        results_json: {
          banks: bankResults.map((r) => ({
            bankId: r.bankId, bankName: r.bankName, bankCode: r.bankCode,
            effectiveRatePct: r.effectiveRatePct,
            downPayment: r.downPayment, loanValue: r.loanValue, minDownPct: r.minDownPct,
            sac: r.sac, price: r.price, tac: r.tac,
            cetEstimatePct: r.cetEstimatePct, minIncomeRequired: r.minIncomeRequired,
          })),
          property_value: parseFloat(propertyValue) || 0,
        },
        notes: notes || null,
      };

      if (initialSim?.id) {
        const { error } = await supabase.from("financing_simulations").update(payload).eq("id", initialSim.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("financing_simulations").insert(payload);
        if (error) throw error;
      }

      clearDraft();
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
  const canStep3 = Boolean(propertyValue) && selectedBankIds.length > 0 && Boolean(termMonths);
  const cpfComplete = cpfDigits(clientCpf).length === 11;

  // ─ Helper: find best (lowest) value bank for a given metric ───────────────
  const bestBankId = (getter: (r: BankSimResult) => number) => {
    if (bankResults.length < 2) return null;
    return bankResults.reduce((best, r) => getter(r) < getter(best) ? r : best).bankId;
  };

  const cellClass = (bankId: string, getter: (r: BankSimResult) => number) => {
    const best = bestBankId(getter);
    return cn(
      "py-2.5 px-3 text-right text-xs",
      best === bankId ? "bg-emerald-50 font-bold text-emerald-700" : "text-slate-700"
    );
  };

  // ─ Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
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
                  active ? "bg-[hsl(var(--byfrost-accent))] text-white shadow-sm"
                    : done ? "bg-emerald-100 text-emerald-700 cursor-pointer hover:bg-emerald-200"
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

      {/* Draft banner */}
      {draftRestored && !initialSim && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-amber-800">
            <Clock className="h-4 w-4 flex-shrink-0" />
            <span>📋 Rascunho restaurado de <span className="font-semibold">{draftDate}</span></span>
          </div>
          <button
            type="button"
            onClick={resetForm}
            className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-900 hover:underline"
          >
            <RefreshCw className="h-3 w-3" />
            Começar do zero
          </button>
        </div>
      )}

      {/* ─── STEP 1: Cliente ───────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* CPF principal */}
          <div>
            <Label className="text-xs font-semibold text-slate-700">CPF</Label>
            <div className="relative mt-1.5">
              <Input
                value={clientCpf}
                onChange={(e) => handleCpfChange(e.target.value)}
                placeholder="000.000.000-00"
                maxLength={14}
                className={cn(
                  "rounded-2xl pr-10 font-mono tracking-wide",
                  cpfComplete && selectedEntity && "border-emerald-400 bg-emerald-50/40",
                  cpfComplete && cpfNotFound && "border-amber-400 bg-amber-50/40",
                )}
                autoFocus
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {cpfSearching && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                {!cpfSearching && cpfComplete && selectedEntity && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {!cpfSearching && cpfComplete && cpfNotFound && <UserX className="h-4 w-4 text-amber-500" />}
              </div>
            </div>
            {cpfComplete && selectedEntity && (
              <div className="mt-1.5 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5">
                <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Encontrado: <span className="font-semibold">{selectedEntity.display_name}</span></span>
                </div>
                <button type="button" onClick={() => { setSelectedEntity(null); setCpfNotFound(false); setClientName(""); }} className="text-[11px] text-emerald-600 underline hover:text-emerald-800">desvincular</button>
              </div>
            )}
            {cpfComplete && cpfNotFound && (
              <div className="mt-1.5 flex items-center gap-1.5 rounded-xl bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-700">
                <UserX className="h-3.5 w-3.5 flex-shrink-0" />
                CPF não encontrado no cadastro. Preencha o nome abaixo para criar nova proposta.
              </div>
            )}
          </div>

          {/* Busca por nome (colapsável) */}
          <div>
            <button type="button" onClick={() => setShowNameSearch((v) => !v)} className="text-[11px] font-semibold text-[hsl(var(--byfrost-accent))] hover:underline">
              {showNameSearch ? "▲ Ocultar busca por nome" : "▼ Buscar cliente por nome"}
            </button>
            {showNameSearch && (
              <div className="mt-1.5 space-y-2">
                <div className="flex gap-2">
                  <Input value={entitySearch} onChange={(e) => setEntitySearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchByName()} placeholder="Nome do cliente…" className="rounded-2xl" />
                  <Button variant="outline" onClick={searchByName} disabled={nameSearching || entitySearch.length < 2} className="rounded-2xl">
                    {nameSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {entityResults.map((e) => (
                  <button key={e.id} type="button" onClick={() => fillFromEntity(e)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-[hsl(var(--byfrost-accent)/0.4)] transition">
                    <span className="font-semibold text-slate-900">{e.display_name}</span>
                    {e.cpf && <span className="ml-2 text-xs text-slate-500">CPF: {formatCpf(e.cpf)}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Campos do cliente */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-xs">Nome completo *</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} className="mt-1 rounded-2xl" placeholder="Maria da Silva" />
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
              <select value={clientMarital} onChange={(e) => setClientMarital(e.target.value)} className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none">
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
            <Button className="rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white" onClick={() => setStep(2)} disabled={!canStep2}>
              Próximo <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── STEP 2: Imóvel ────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Valor do imóvel — único obrigatório */}
            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-slate-700">Valor de mercado do imóvel (R$) *</Label>
              <Input
                type="number"
                value={propertyValue}
                onChange={(e) => setPropertyValue(e.target.value)}
                className="mt-1 rounded-2xl text-base"
                placeholder="300000"
                autoFocus
              />
            </div>

            {/* Down payment: calculado automaticamente */}
            <div>
              <Label className="text-xs">Valor de entrada</Label>
              <div className="mt-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                {propertyValue ? (
                  <div>
                    <div className="text-sm font-bold text-slate-800">{fmtBRL(autoDownValue)}</div>
                    <div className="text-[11px] text-slate-500">
                      {selectedBankIds.length > 0
                        ? `Calculado automaticamente (${autoDownPct}% mín. dos bancos selecionados)`
                        : `Calculado automaticamente (20% padrão — selecione bancos para ajustar)`}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">Informe o valor do imóvel primeiro</div>
                )}
              </div>
            </div>

            {/* FGTS opcional */}
            <div>
              <Label className="text-xs">FGTS disponível (R$) <span className="text-slate-400">— opcional</span></Label>
              <Input type="number" value={fgtsAmount} onChange={(e) => setFgtsAmount(e.target.value)} className="mt-1 rounded-2xl" placeholder="0 (pode ser 0)" />
              {fgtsAmount && parseFloat(fgtsAmount) > 0 && autoDownValue > 0 && (
                <div className="mt-1 text-[11px] text-emerald-700">
                  Valor financiado estimado: {fmtBRL(Math.max(0, (parseFloat(propertyValue) || 0) - autoDownValue - (parseFloat(fgtsAmount) || 0)))}
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs">Prazo (meses) *</Label>
              <Input type="number" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} className="mt-1 rounded-2xl" placeholder="360" min="12" max="420" />
            </div>
          </div>

          {/* Loan preview */}
          {propertyValue && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-xs font-semibold text-emerald-800 mb-1">Estimativa de financiamento</div>
              <div className="grid grid-cols-3 gap-2 text-xs text-emerald-700">
                <div>
                  <div className="text-[11px] text-emerald-600">Valor do imóvel</div>
                  <div className="font-bold">{fmtBRL(parseFloat(propertyValue) || 0)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-emerald-600">Entrada ({autoDownPct}%)</div>
                  <div className="font-bold">{fmtBRL(autoDownValue)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-emerald-600">A financiar</div>
                  <div className="font-bold text-emerald-800">
                    {fmtBRL(Math.max(0, (parseFloat(propertyValue) || 0) - autoDownValue - (parseFloat(fgtsAmount) || 0)))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Seleção multi-banco */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold text-slate-700">
                Selecione os bancos para o comparativo *
              </Label>
              {selectedBankIds.length > 0 && (
                <span className="rounded-full bg-[hsl(var(--byfrost-accent))] px-2 py-0.5 text-[11px] font-bold text-white">
                  {selectedBankIds.length} banco{selectedBankIds.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            {banks.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Nenhum banco configurado. Um administrador deve configurar as regras de bancos primeiro.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {banks.map((b) => {
                  const selected = selectedBankIds.includes(b.id);
                  const minDown = b.tac_json?.min_down_pct ?? 20;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => toggleBank(b.id)}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left transition relative",
                        selected
                          ? "border-[hsl(var(--byfrost-accent))] bg-[hsl(var(--byfrost-accent)/0.08)] shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      )}
                    >
                      {selected && (
                        <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--byfrost-accent))] shadow-sm">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                      <div className="flex items-start justify-between pr-6">
                        <div>
                          <div className="text-xs font-bold text-slate-500">{b.bank_code}</div>
                          <div className="text-sm font-semibold text-slate-900">{b.bank_name}</div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            Entrada mín.: <span className="font-semibold">{minDown}%</span>
                            {" · "}TAC: <span className="font-semibold">{fmtBRL(b.tac_json?.fixed ?? 0)}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-[hsl(var(--byfrost-accent))]">{b.base_rate_pct}%</div>
                          <div className="text-[11px] text-slate-400">a.a. base</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedBankIds.length === 0 && banks.length > 0 && (
              <p className="mt-1 text-[11px] text-amber-600">Selecione ao menos um banco para continuar.</p>
            )}
          </div>

          <div>
            <Label className="text-xs">Observações (opcional)</Label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[hsl(var(--byfrost-accent)/0.5)] resize-none" placeholder="Notas adicionais sobre a proposta…" />
          </div>

          <div className="flex justify-between gap-2">
            <Button variant="outline" className="rounded-2xl" onClick={() => setStep(1)}>Voltar</Button>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-2xl" onClick={() => saveSimulation("draft")} disabled={saving || !canStep2}>
                Salvar rascunho
              </Button>
              <Button className="rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white" onClick={() => setStep(3)} disabled={!canStep3}>
                Ver comparativo <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP 3: Comparativo ───────────────────────────────────────────── */}
      {step === 3 && bankResults.length > 0 && (
        <div className="space-y-4">
          {/* Cabeçalho resumo */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
            <div className="grid gap-2 sm:grid-cols-3 text-xs text-slate-600">
              <div>Imóvel: <span className="font-bold text-slate-900">{fmtBRL(parseFloat(propertyValue) || 0)}</span></div>
              <div>FGTS: <span className="font-bold text-slate-900">{fgtsAmount ? fmtBRL(parseFloat(fgtsAmount)) : "Não utilizado"}</span></div>
              <div>Prazo: <span className="font-bold text-slate-900">{termMonths} meses</span></div>
            </div>
          </div>

          {/* Tabela comparativa */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-xs">
              {/* Header: bancos como colunas */}
              <thead>
                <tr className="border-b border-slate-200 bg-slate-800">
                  <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-300 w-40">
                    Indicadores
                  </th>
                  {bankResults.map((r) => (
                    <th key={r.bankId} className={cn(
                      "py-3 px-3 text-center text-[11px] font-semibold text-white min-w-[130px]",
                      r.bankId === bestBankId((x) => x.price.monthlyPayment) && "bg-emerald-700"
                    )}>
                      <div className="font-bold">{r.bankCode}</div>
                      <div className="text-slate-300 font-normal">{r.bankName}</div>
                      <div className={cn(
                        "mt-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold inline-block",
                        r.bankId === bestBankId((x) => x.price.monthlyPayment)
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-600 text-slate-300"
                      )}>
                        {fmtPct(r.effectiveRatePct)} a.a.
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Financiamento por banco */}
                <tr className="bg-slate-50 border-b border-slate-200">
                  <td className="py-2 px-4 font-semibold text-slate-500 text-[11px]" colSpan={bankResults.length + 1}>CONDIÇÕES DO FINANCIAMENTO</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2.5 px-4 text-slate-600">Entrada mín. (%)</td>
                  {bankResults.map((r) => (
                    <td key={r.bankId} className="py-2.5 px-3 text-right text-slate-700">
                      {fmtPct(r.minDownPct, 0)} = <span className="font-semibold">{fmtBRL(r.downPayment)}</span>
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2.5 px-4 text-slate-600">Valor financiado</td>
                  {bankResults.map((r) => (
                    <td key={r.bankId} className={cellClass(r.bankId, (x) => x.loanValue)}>
                      {fmtBRL(r.loanValue)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2.5 px-4 text-slate-600">TAC</td>
                  {bankResults.map((r) => (
                    <td key={r.bankId} className={cellClass(r.bankId, (x) => x.tac)}>{fmtBRL(r.tac)}</td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2.5 px-4 text-slate-600">CET estimado</td>
                  {bankResults.map((r) => (
                    <td key={r.bankId} className={cellClass(r.bankId, (x) => x.cetEstimatePct)}>{fmtPct(r.cetEstimatePct)} a.a.</td>
                  ))}
                </tr>

                {/* SAC */}
                <tr className="bg-blue-50 border-b border-slate-200">
                  <td className="py-2 px-4 font-semibold text-blue-700 text-[11px]" colSpan={bankResults.length + 1}>
                    SAC — SISTEMA DE AMORTIZAÇÃO CONSTANTE
                  </td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2.5 px-4 text-slate-600">1ª Parcela</td>
                  {bankResults.map((r) => (
                    <td key={r.bankId} className={cellClass(r.bankId, (x) => x.sac.firstPayment)}>{fmtBRL(r.sac.firstPayment)}</td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2.5 px-4 text-slate-600">Última Parcela</td>
                  {bankResults.map((r) => (
                    <td key={r.bankId} className={cellClass(r.bankId, (x) => x.sac.lastPayment)}>{fmtBRL(r.sac.lastPayment)}</td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2.5 px-4 text-slate-600">Seguro MIP+DFI (1º mês)</td>
                  {bankResults.map((r) => (
                    <td key={r.bankId} className="py-2.5 px-3 text-right text-slate-600">{fmtBRL(r.sac.monthlyInsurance)}</td>
                  ))}
                </tr>


                {/* Price */}
                <tr className="bg-emerald-50 border-b border-slate-200">
                  <td className="py-2 px-4 font-semibold text-emerald-700 text-[11px]" colSpan={bankResults.length + 1}>
                    PRICE — TABELA PRICE (PARCELAS FIXAS)
                  </td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2.5 px-4 text-slate-600">Parcela fixa</td>
                  {bankResults.map((r) => (
                    <td key={r.bankId} className={cn(cellClass(r.bankId, (x) => x.price.monthlyPayment), "text-base")}>{fmtBRL(r.price.monthlyPayment)}</td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2.5 px-4 text-slate-600">Total c/ seguro (1º mês)</td>
                  {bankResults.map((r) => (
                    <td key={r.bankId} className={cellClass(r.bankId, (x) => x.price.monthlyPayment + x.price.monthlyInsurance)}>
                      {fmtBRL(r.price.monthlyPayment + r.price.monthlyInsurance)}
                    </td>
                  ))}
                </tr>


                <tr className="border-b border-slate-100">
                  <td className="py-2.5 px-4 text-slate-600">Renda mín. necessária</td>
                  {bankResults.map((r) => (
                    <td key={r.bankId} className="py-2.5 px-3 text-right">
                      {clientIncome ? (
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                          r.incomeIsEnough
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        )}>
                          {r.incomeIsEnough ? "✓ Renda suficiente" : "✗ Renda insuficiente"}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Informe a renda</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap gap-4 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-emerald-100 border border-emerald-300" />
              Menor valor entre os bancos
            </div>
            {bestBankId((x) => x.price.monthlyPayment) && (
              <div className="flex items-center gap-1.5">
                <Star className="h-3 w-3 text-emerald-600" />
                <span>Cabeçalho em verde = banco com menor parcela Price</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <Info className="h-3.5 w-3.5 flex-shrink-0" />
            Simulação com fins ilustrativos. Taxas e valores sujeitos à análise de crédito e condições vigentes de cada banco.
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="outline" className="rounded-2xl" onClick={() => setStep(2)}>Voltar</Button>
            <div className="flex flex-wrap gap-2">
              {bankResults.length > 0 && (
                <FinancingSimulationPdfButton
                  clientSnapshot={clientSnapshot}
                  simulationParams={{
                    property_value: parseFloat(propertyValue) || 0,
                    fgts_amount: parseFloat(fgtsAmount) || 0,
                    term_months: parseInt(termMonths) || 360,
                    effective_rate_pct: 0,
                  }}
                  bankResults={bankResults}
                  referenceNumber={initialSim?.reference_number ?? "RASCUNHO"}
                />
              )}
              <Button variant="outline" className="rounded-2xl" onClick={() => saveSimulation("draft")} disabled={saving}>
                Salvar rascunho
              </Button>
              <Button className="rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => saveSimulation("finalized")} disabled={saving}>
                {saving ? "Salvando…" : "Finalizar proposta"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
