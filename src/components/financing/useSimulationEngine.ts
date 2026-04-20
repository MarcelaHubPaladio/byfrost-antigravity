/**
 * useSimulationEngine — cálculos de financiamento imobiliário
 * Suporta SAC (Sistema de Amortização Constante) e Price (parcelas fixas).
 * Inclui cálculo de seguro MIP+DFI estimado, TAC, CET estimado e FGTS.
 */

export interface SimulationInput {
  propertyValue: number;
  downPayment: number;
  fgtsAmount: number;        // valor de FGTS a ser usado na entrada
  termMonths: number;         // prazo em meses
  annualRatePct: number;      // taxa anual % (ex: 10.39)
  tacValue: number;           // Tarifa de Avaliação de Crédito (R$)
  // Perfil do cliente para cálculos de renda mínima
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
  cetEstimatePct: number;        // CET estimado anual
  minIncomeRequired: number;     // Renda mínima para a parcela da Price (30% regra)
  availableForFinancing: number; // Quanto da renda pode comprometer
  incomeIsEnough: boolean;
}

const INSURANCE_RATE_PER_MIL = 0.28; // MIP+DFI estimado: 0.28‰ ao mês do saldo devedor

export function calcMonthlyRate(annualRatePct: number): number {
  // Converter taxa anual nominal p/ mensal (juros compostos)
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
  // Parcela fixa pela tabela Price: PMT = PV * i / (1-(1+i)^-n)
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

  // CET estimado: usar Price como referência + TAC diluída
  const tacMonthlyEquiv = input.tacValue / input.termMonths;
  const totalWithTac = price.totalPaid + input.tacValue;
  const cetMonthly = Math.pow(totalWithTac / loanValue, 1 / input.termMonths) - 1;
  const cetEstimatePct = (Math.pow(1 + cetMonthly, 12) - 1) * 100;

  // Renda mínima (regra: parcela <= 30% da renda)
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

export function getEffectiveRate(
  baseRatePct: number,
  rateRules: Array<{ condition: string; rate_bonus_pct: number }>,
  clientProfile: {
    isPublicServant?: boolean;
    fgtsYears?: number;
    age?: number;
    hasMinorChildren?: boolean;
  }
): number {
  let rate = baseRatePct;
  for (const rule of rateRules) {
    if (rule.condition === "is_public_servant" && clientProfile.isPublicServant) {
      rate += rule.rate_bonus_pct;
    }
    if (rule.condition === "fgts_years_gt_3" && (clientProfile.fgtsYears ?? 0) > 3) {
      rate += rule.rate_bonus_pct;
    }
    if (rule.condition === "age_lt_30" && (clientProfile.age ?? 99) < 30) {
      rate += rule.rate_bonus_pct;
    }
    if (rule.condition === "age_gte_51" && (clientProfile.age ?? 0) >= 51) {
      rate += rule.rate_bonus_pct;
    }
    if (rule.condition === "has_minor_children" && clientProfile.hasMinorChildren) {
      rate += rule.rate_bonus_pct;
    }
  }
  return Math.max(0.1, rate); // mínimo de 0.1% ao ano
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
