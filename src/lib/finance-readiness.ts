import type { FinanceCloseSnapshot } from "@/lib/wallet-allocations";
import type { ReconciliationSnapshot } from "@/lib/reconciliation";

export type FinanceReadinessStatus = "ready" | "provisional" | "attention" | "blocked";

export type FinanceReadinessSnapshot = {
  status: FinanceReadinessStatus;
  title: string;
  summary: string;
  nextAction: string;
};

export function financeReadinessToneClasses(status: FinanceReadinessStatus) {
  switch (status) {
    case "ready":
      return "border-status-normal/40 bg-status-normal/10 text-status-normal";
    case "provisional":
      return "border-primary/30 bg-primary/10 text-primary";
    case "attention":
      return "border-status-warning/40 bg-status-warning/10 text-status-warning";
    case "blocked":
    default:
      return "border-status-exceeded/40 bg-status-exceeded/10 text-status-exceeded";
  }
}

export function getFinanceReadinessSnapshot(args: {
  close: FinanceCloseSnapshot;
  reconciliation: ReconciliationSnapshot;
}): FinanceReadinessSnapshot {
  const { close, reconciliation } = args;

  if (close.status === "blocked") {
    return {
      status: "blocked",
      title: "Finance handoff blocked",
      summary:
        "Internal chargeback is not ready for handoff yet because core close conditions are still failing, usually around unmapped cost centers or missing settlement structure.",
      nextAction:
        "Resolve mapping gaps and close blockers first, then re-check reconciliation before issuing or exporting statements.",
    };
  }

  if (reconciliation.counts.drift > 0 || reconciliation.counts.history_only > 0) {
    return {
      status: "attention",
      title: "Finance review required",
      summary:
        "The close may be operationally usable, but provider reconciliation still shows drift or provider-history rows without matching live traffic in the current window.",
      nextAction:
        "Review provider drift and history-only rows before treating this month as finance-grade settled output.",
    };
  }

  if (
    close.status === "attention" ||
    reconciliation.counts.live_only > 0 ||
    reconciliation.counts.manual_only > 0
  ) {
    return {
      status: "provisional",
      title: "Provisionally ready",
      summary:
        "The month is internally coherent enough to keep moving, but parts of the evidence base still rely on live-only or manual coverage rather than stronger provider-history confirmation.",
      nextAction:
        "Use the pack and statements as working finance output, while keeping the remaining live-only or manual-only providers explicitly provisional.",
    };
  }

  return {
    status: "ready",
    title: "Finance-ready",
    summary:
      "Internal close conditions are healthy and the comparable providers in the current window are broadly reconciling, so the pack is in a good state for month-end handoff.",
    nextAction:
      "Proceed with statement issuance and export the month-end pack for downstream review or accounting handoff.",
  };
}
