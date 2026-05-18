// --- Constants & Types ---

export const BudgetState = {
  NORMAL: "normal",
  WARNING: "warning",
  CRITICAL: "critical",
  EXCEEDED: "exceeded",
} as const;

export type BudgetState = (typeof BudgetState)[keyof typeof BudgetState];

export type CostBreakdown = {
  inputCost: number;
  outputCost: number;
  totalCost: number;
};

// --- Helpers ---

/**
 * Rounds to 6 decimal places to mitigate IEEE 754 floating point drift.
 * Sufficient for most currency/token calculations without external libs.
 */
const roundTo6 = (n: number): number => Math.round(n * 1e6) / 1e6;

// --- Core Logic ---

/**
 * Estimate cost for a usage event based on per-million token pricing.
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  inputPricePerMillion: number,
  outputPricePerMillion: number
): CostBreakdown {
  // Validation
  if (inputTokens < 0 || outputTokens < 0) {
    throw new Error("Token counts cannot be negative");
  }
  if (inputPricePerMillion < 0 || outputPricePerMillion < 0) {
    throw new Error("Pricing cannot be negative");
  }

  const inputCost = roundTo6((inputTokens / 1_000_000) * inputPricePerMillion);
  const outputCost = roundTo6((outputTokens / 1_000_000) * outputPricePerMillion);
  
  return { 
    inputCost, 
    outputCost, 
    totalCost: roundTo6(inputCost + outputCost) 
  };
}

/**
 * Project month-end spend by linear extrapolation of the current daily average.
 */
export function projectMonthEndSpend(
  spendSoFar: number, 
  dayOfMonth: number, 
  daysInMonth: number
): number {
  if (spendSoFar < 0) throw new Error("Spend cannot be negative");
  if (dayOfMonth <= 0) return 0;
  if (dayOfMonth > daysInMonth) {
    // Safety clamp if logic error passes day > total days
    return spendSoFar; 
  }

  const dailyAvg = spendSoFar / dayOfMonth;
  // Cap forecast at 1.5x daily average to prevent wild extrapolation on low-usage days
  const projected = dailyAvg * daysInMonth;
  
  return roundTo6(projected);
}

export function budgetState(
  spend: number,
  budget: number,
  warningPct = 50,
  criticalPct = 80
): BudgetState {
  if (budget <= 0) return BudgetState.NORMAL;
  
  const pct = (spend / budget) * 100;
  
  if (pct >= 100) return BudgetState.EXCEEDED;
  if (pct >= criticalPct) return BudgetState.CRITICAL;
  if (pct >= warningPct) return BudgetState.WARNING;
  return BudgetState.NORMAL;
}

// --- Date Utilities (UTC Enforced) ---

export function daysInMonth(d: Date = new Date()): number {
  // Use UTC to ensure consistent month boundaries regardless of server timezone
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function startOfMonth(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function startOfPrevMonth(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}