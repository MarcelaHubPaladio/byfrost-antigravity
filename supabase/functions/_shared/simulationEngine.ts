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
