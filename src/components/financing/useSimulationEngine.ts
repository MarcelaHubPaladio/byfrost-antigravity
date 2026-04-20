/**
 * useSimulationEngine — cálculos de financiamento imobiliário
 * Suporta SAC (Sistema de Amortização Constante) e Price (parcelas fixas).
 * Inclui cálculo de seguro MIP+DFI estimado, TAC, CET estimado, FGTS e comparação multi-banco.
 */

export interface SimulationInput {
  propertyValue: number;
  downPayment: number;
  fgtsAmount: number;        // valor de FGTS a ser usado na entrada
  termMonths: number;         // prazo em meses
  annualRatePct: number;      // taxa anual % (ex: 10.39)
  tacValue: number;           // Tarifa de Avaliação de Crédito (R$)
  grossIncome?: number;
  incomeCommitmentPct?: number;
}

export interface SACResult {
  firstPayment: number;
  lastPayment: number;
  totalPaid: number;
  totalInterest: number;
  monthlyAmortization: number;
  monthlyInsurance: number;
  schedule: Array<{ month: number; amortization: number; interest: number; insurance: number; total: number; balance: number }>;
}

export interface PriceResult {
  monthlyPayment: number;
  totalPaid: number;
  totalInterest: number;
  monthlyInsurance: number;
  schedule: Array<{ month: number; amortization: number; interest: number; insurance: number; total: number; balance: number }>;
}

export interface SimulationResult {
  loanValue: number;
  effectiveMonthlyRate: number;
  sac: SACResult;
  price: PriceResult;
  tac: number;
  cetEstimatePct: number;
  minIncomeRequired: number;
  availableForFinancing: number;
  incomeIsEnough: boolean;
}

/** Result for one bank in a multi-bank comparison */
export interface BankSimResult {
  bankId: string;
  bankName: string;
  bankCode: string;
  effectiveRatePct: number;
  sac: Pick<SACResult, "firstPayment" | "lastPayment" | "totalPaid" | "totalInterest" | "monthlyAmortization" | "monthlyInsurance">;
  price: Pick<PriceResult, "monthlyPayment" | "totalPaid" | "totalInterest" | "monthlyInsurance">;
  tac: number;
  cetEstimatePct: number;
  minIncomeRequired: number;
  incomeIsEnough: boolean;
  loanValue: number;
  downPayment: number;
  minDownPct: number;         // cota mínima de entrada deste banco
  maxFinancingPct: number;    // 100 - minDownPct
}

export interface MultiBankInput {
  propertyValue: number;
  fgtsAmount: number;
  termMonths: number;
  grossIncome?: number;
  incomeCommitmentPct?: number;
}

const INSURANCE_RATE_PER_MIL = 0.28;

export function calcMonthlyRate(annualRatePct: number): number {
  return Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
}

export function calcSAC(loanValue: number, monthlyRate: number, termMonths: number): SACResult {
  const monthlyAmort = loanValue / termMonths;
  let balance = loanValue;
  let totalInterest = 0;
  let totalPaid = 0;
  const schedule: SACResult["schedule"] = [];

  for (let m = 1; m <= termMonths; m++) {
    const interest = balance * monthlyRate;
    const insurance = (balance / 1000) * INSURANCE_RATE_PER_MIL;
    const total = monthlyAmort + interest + insurance;
    balance -= monthlyAmort;
    totalInterest += interest;
    totalPaid += total;
    schedule.push({ month: m, amortization: monthlyAmort, interest, insurance, total, balance: Math.max(0, balance) });
  }

  const firstPayment = schedule[0]?.total ?? 0;
  const lastPayment = schedule[schedule.length - 1]?.total ?? 0;
  const monthlyInsurance = schedule[0]?.insurance ?? 0;

  return { firstPayment, lastPayment, totalPaid, totalInterest, monthlyAmortization: monthlyAmort, monthlyInsurance, schedule };
}

export function calcPrice(loanValue: number, monthlyRate: number, termMonths: number): PriceResult {
  const pmt = (loanValue * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
  let balance = loanValue;
  let totalInterest = 0;
  let totalPaid = 0;
  const schedule: PriceResult["schedule"] = [];

  for (let m = 1; m <= termMonths; m++) {
    const interest = balance * monthlyRate;
    const amortization = pmt - interest;
    const insurance = (balance / 1000) * INSURANCE_RATE_PER_MIL;
    const total = pmt + insurance;
    balance -= amortization;
    totalInterest += interest;
    totalPaid += total;
    schedule.push({ month: m, amortization, interest, insurance, total, balance: Math.max(0, balance) });
  }

  const monthlyInsurance = schedule[0]?.insurance ?? 0;
  return { monthlyPayment: pmt, totalPaid, totalInterest, monthlyInsurance, schedule };
}

export function runSimulation(input: SimulationInput): SimulationResult {
  const loanValue = Math.max(0, input.propertyValue - input.downPayment - input.fgtsAmount);
  const monthlyRate = calcMonthlyRate(input.annualRatePct);

  const sac = calcSAC(loanValue, monthlyRate, input.termMonths);
  const price = calcPrice(loanValue, monthlyRate, input.termMonths);

  const totalWithTac = price.totalPaid + input.tacValue;
  const cetMonthly = loanValue > 0 ? Math.pow(totalWithTac / loanValue, 1 / input.termMonths) - 1 : 0;
  const cetEstimatePct = (Math.pow(1 + cetMonthly, 12) - 1) * 100;

  const minIncomeRequired = price.monthlyPayment / 0.30;
  const alreadyCommitted = ((input.incomeCommitmentPct ?? 0) / 100) * (input.grossIncome ?? 0);
  const availableForFinancing = (input.grossIncome ?? 0) * 0.30 - alreadyCommitted;
  const incomeIsEnough = availableForFinancing >= price.monthlyPayment;

  return {
    loanValue,
    effectiveMonthlyRate: monthlyRate * 100,
    sac,
    price,
    tac: input.tacValue,
    cetEstimatePct,
    minIncomeRequired,
    availableForFinancing,
    incomeIsEnough,
  };
}

/** Run simulation for multiple banks and return comparison array */
export function runMultiBankSimulation(
  banks: Array<{
    id: string;
    bank_name: string;
    bank_code: string;
    base_rate_pct: number;
    rate_rules_json: any[];
    tac_json: Record<string, any>;
    max_term_months: number | null;
  }>,
  input: MultiBankInput,
  clientProfile: { isPublicServant?: boolean; fgtsYears?: number; age?: number; hasMinorChildren?: boolean }
): BankSimResult[] {
  return banks.map((bank) => {
    const rate = getEffectiveRate(bank.base_rate_pct, bank.rate_rules_json ?? [], clientProfile);
    const tac = bank.tac_json?.fixed ?? 0;
    const minDownPct: number = bank.tac_json?.min_down_pct ?? 20;
    const maxFinancingPct = 100 - minDownPct;
    const downPayment = (input.propertyValue * minDownPct) / 100;
    const loanValue = Math.max(0, input.propertyValue - downPayment - (input.fgtsAmount || 0));
    const term = Math.min(input.termMonths, bank.max_term_months ?? input.termMonths);

    const monthlyRate = calcMonthlyRate(rate);
    const sac = calcSAC(loanValue, monthlyRate, term);
    const price = calcPrice(loanValue, monthlyRate, term);

    const totalWithTac = price.totalPaid + tac;
    const cetMonthly = loanValue > 0 ? Math.pow(totalWithTac / loanValue, 1 / term) - 1 : 0;
    const cetEstimatePct = (Math.pow(1 + cetMonthly, 12) - 1) * 100;
    const minIncomeRequired = price.monthlyPayment / 0.30;
    const alreadyCommitted = ((input.incomeCommitmentPct ?? 0) / 100) * (input.grossIncome ?? 0);
    const availableForFinancing = (input.grossIncome ?? 0) * 0.30 - alreadyCommitted;
    const incomeIsEnough = availableForFinancing >= price.monthlyPayment;

    return {
      bankId: bank.id,
      bankName: bank.bank_name,
      bankCode: bank.bank_code,
      effectiveRatePct: rate,
      sac: {
        firstPayment: sac.firstPayment,
        lastPayment: sac.lastPayment,
        totalPaid: sac.totalPaid,
        totalInterest: sac.totalInterest,
        monthlyAmortization: sac.monthlyAmortization,
        monthlyInsurance: sac.monthlyInsurance,
      },
      price: {
        monthlyPayment: price.monthlyPayment,
        totalPaid: price.totalPaid,
        totalInterest: price.totalInterest,
        monthlyInsurance: price.monthlyInsurance,
      },
      tac,
      cetEstimatePct,
      minIncomeRequired,
      incomeIsEnough,
      loanValue,
      downPayment,
      minDownPct,
      maxFinancingPct,
    };
  });
}

export function getEffectiveRate(
  baseRatePct: number,
  rateRules: Array<{ condition: string; rate_bonus_pct: number }>,
  clientProfile: { isPublicServant?: boolean; fgtsYears?: number; age?: number; hasMinorChildren?: boolean }
): number {
  let rate = baseRatePct;
  for (const rule of rateRules) {
    if (rule.condition === "is_public_servant" && clientProfile.isPublicServant) rate += rule.rate_bonus_pct;
    if (rule.condition === "fgts_years_gt_3" && (clientProfile.fgtsYears ?? 0) > 3) rate += rule.rate_bonus_pct;
    if (rule.condition === "age_lt_30" && (clientProfile.age ?? 99) < 30) rate += rule.rate_bonus_pct;
    if (rule.condition === "age_gte_51" && (clientProfile.age ?? 0) >= 51) rate += rule.rate_bonus_pct;
    if (rule.condition === "has_minor_children" && clientProfile.hasMinorChildren) rate += rule.rate_bonus_pct;
  }
  return Math.max(0.1, rate);
}

export function calcAge(birthDate: string | null | undefined): number | undefined {
  if (!birthDate) return undefined;
  const today = new Date();
  const bd = new Date(birthDate);
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

export function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function fmtPct(v: number, decimals = 2) {
  return `${v.toFixed(decimals)}%`;
}
