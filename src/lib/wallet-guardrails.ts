import { prisma } from "@/lib/prisma";
import { budgetState, projectMonthEndSpend, startOfMonth, daysInMonth, BudgetState } from "@/lib/calc";
import { toNumber } from "@/lib/format";

export type WalletBudgetGuardrail = {
  enabled: boolean;
  state: "normal" | "warning" | "critical" | "exceeded";
  budget: number;
  spend: number;
  projection: number;
  warningPct: number;
  criticalPct: number;
  allowsDirectTransfer: boolean;
  allowsDirectExchange: boolean;
  requiresTransferApproval: boolean;
  message: string;
};

const severityRank: Record<WalletBudgetGuardrail["state"], number> = {
  normal: 0,
  warning: 1,
  critical: 2,
  exceeded: 3,
};

function maxState(a: WalletBudgetGuardrail["state"], b: WalletBudgetGuardrail["state"]) {
  return severityRank[a] >= severityRank[b] ? a : b;
}

function toGuardrailState(value: BudgetState): WalletBudgetGuardrail["state"] {
  return value;
}

export async function getOrganizationWalletGuardrail(
  organizationId: string
): Promise<WalletBudgetGuardrail> {
  const budget = await prisma.budget.findFirst({
    where: {
      organizationId,
      scopeType: "ORGANIZATION",
      period: "MONTHLY",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!budget) {
    return {
      enabled: false,
      state: "normal",
      budget: 0,
      spend: 0,
      projection: 0,
      warningPct: 50,
      criticalPct: 80,
      allowsDirectTransfer: true,
      allowsDirectExchange: true,
      requiresTransferApproval: false,
      message: "No monthly organization budget is configured yet.",
    };
  }

  const monthStart = startOfMonth();
  const now = new Date();
  const spendAgg = await prisma.usageEvent.aggregate({
    where: {
      organizationId,
      timestamp: { gte: monthStart },
    },
    _sum: { estimatedTotalCost: true },
  });

  const spend = toNumber(spendAgg._sum.estimatedTotalCost);
  const budgetAmount = toNumber(budget.amount);
  const projection = projectMonthEndSpend(spend, now.getDate(), daysInMonth(now));
  const spendState = toGuardrailState(
    budgetState(spend, budgetAmount, budget.warningThresholdPercentage, budget.criticalThresholdPercentage)
  );
  const projectionState = toGuardrailState(
    budgetState(
      projection,
      budgetAmount,
      budget.warningThresholdPercentage,
      budget.criticalThresholdPercentage
    )
  );
  const state = maxState(spendState, projectionState);

  if (state === "exceeded") {
    return {
      enabled: true,
      state,
      budget: budgetAmount,
      spend,
      projection,
      warningPct: budget.warningThresholdPercentage,
      criticalPct: budget.criticalThresholdPercentage,
      allowsDirectTransfer: false,
      allowsDirectExchange: false,
      requiresTransferApproval: true,
      message:
        "Monthly organization budget is exceeded. Direct transfers and exchanges are paused until an admin reviews them.",
    };
  }

  if (state === "critical") {
    return {
      enabled: true,
      state,
      budget: budgetAmount,
      spend,
      projection,
      warningPct: budget.warningThresholdPercentage,
      criticalPct: budget.criticalThresholdPercentage,
      allowsDirectTransfer: false,
      allowsDirectExchange: true,
      requiresTransferApproval: true,
      message:
        "Monthly organization budget is in the critical zone. Transfers require approval; exchanges stay open so balances can be re-routed.",
    };
  }

  if (state === "warning") {
    return {
      enabled: true,
      state,
      budget: budgetAmount,
      spend,
      projection,
      warningPct: budget.warningThresholdPercentage,
      criticalPct: budget.criticalThresholdPercentage,
      allowsDirectTransfer: true,
      allowsDirectExchange: true,
      requiresTransferApproval: false,
      message:
        "Monthly organization budget is in the warning zone. Direct moves remain open, but this is the moment to watch approvals and reserve floors closely.",
    };
  }

  return {
    enabled: true,
    state,
    budget: budgetAmount,
    spend,
    projection,
    warningPct: budget.warningThresholdPercentage,
    criticalPct: budget.criticalThresholdPercentage,
    allowsDirectTransfer: true,
    allowsDirectExchange: true,
    requiresTransferApproval: false,
      message: "Monthly organization budget is healthy. Direct moves and exchanges are open.",
  };
}

const AUTO_LOCK_REASON = "Auto-lock: monthly organization budget exceeded.";

export async function syncOrganizationBudgetLocks(organizationId: string) {
  const guardrail = await getOrganizationWalletGuardrail(organizationId);

  if (!guardrail.enabled) return guardrail;

  if (guardrail.state === "exceeded") {
    await prisma.wallet.updateMany({
      where: {
        organizationId,
        OR: [
          { outgoingLocked: false },
          { lockReason: AUTO_LOCK_REASON },
        ],
      },
      data: {
        outgoingLocked: true,
        lockReason: AUTO_LOCK_REASON,
      },
    });
    return guardrail;
  }

  await prisma.wallet.updateMany({
    where: {
      organizationId,
      outgoingLocked: true,
      lockReason: AUTO_LOCK_REASON,
    },
    data: {
      outgoingLocked: false,
      lockReason: null,
    },
  });

  return guardrail;
}
