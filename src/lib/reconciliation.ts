import { prisma } from "@/lib/prisma";
import { getProviderCapability } from "@/lib/provider-capabilities";
import { toNumber } from "@/lib/format";

type AggregateBucket = {
  providerId: string;
  _sum: {
    totalTokens: number | null;
    estimatedTotalCost: unknown;
  };
  _count: {
    _all: number;
  };
};

export type ReconciliationStatus =
  | "matched"
  | "drift"
  | "live_only"
  | "history_only"
  | "manual_only";

export type ProviderReconciliationRow = {
  providerId: string;
  provider: string;
  liveTokens: number;
  liveCost: number;
  liveEvents: number;
  providerHistoryTokens: number;
  providerHistoryCost: number;
  providerHistoryEvents: number;
  manualImportTokens: number;
  manualImportCost: number;
  manualImportEvents: number;
  comparable: boolean;
  deltaCost: number;
  deltaPct: number | null;
  status: ReconciliationStatus;
  label: string;
  note: string;
};

export type ReconciliationSnapshot = {
  days: number;
  since: Date;
  rows: ProviderReconciliationRow[];
  counts: Record<ReconciliationStatus, number>;
};

export function reconciliationToneClasses(status: ReconciliationStatus) {
  switch (status) {
    case "matched":
      return "border-status-normal/40 bg-status-normal/10 text-status-normal";
    case "drift":
      return "border-status-warning/40 bg-status-warning/10 text-status-warning";
    case "history_only":
      return "border-status-exceeded/40 bg-status-exceeded/10 text-status-exceeded";
    case "live_only":
      return "border-border-subtle bg-background text-text-muted";
    case "manual_only":
    default:
      return "border-primary/30 bg-primary/10 text-primary";
  }
}

export function summarizeReconciliation(snapshot: ReconciliationSnapshot) {
  const hasDrift = snapshot.counts.drift > 0;
  const hasHistoryOnly = snapshot.counts.history_only > 0;
  const hasLiveOnly = snapshot.counts.live_only > 0;
  const hasMatched = snapshot.counts.matched > 0;
  const comparedProviders = snapshot.counts.matched + snapshot.counts.drift;

  if (hasDrift) {
    return {
      tone: "warning" as const,
      title: "Reconciliation needs review",
      body: `${snapshot.counts.drift} provider${snapshot.counts.drift === 1 ? "" : "s"} show meaningful drift between live metering and provider history in the current window.`,
    };
  }

  if (hasHistoryOnly) {
    return {
      tone: "danger" as const,
      title: "Provider history exists without matching live traffic",
      body: `${snapshot.counts.history_only} provider${snapshot.counts.history_only === 1 ? "" : "s"} have provider-history rows but no matching live traffic in the current window.`,
    };
  }

  if (hasMatched && comparedProviders > 0) {
    return {
      tone: "success" as const,
      title: "Reconciliation is broadly in range",
      body: `${snapshot.counts.matched} provider${snapshot.counts.matched === 1 ? "" : "s"} have live totals that broadly align with imported provider history in the current window.`,
    };
  }

  if (hasLiveOnly) {
    return {
      tone: "neutral" as const,
      title: "This view is mainly live-metered",
      body: `${snapshot.counts.live_only} provider${snapshot.counts.live_only === 1 ? "" : "s"} currently show live-only usage. That is often expected when provider history is weak or admin access is unavailable.`,
    };
  }

  return {
    tone: "neutral" as const,
    title: "No reconciliation signal yet",
    body: "There is not enough live or provider-history data in the current window to compare reliably yet.",
  };
}

function aggregateMap(groups: AggregateBucket[]) {
  return new Map(
    groups.map((group) => [
      group.providerId,
      {
        tokens: group._sum.totalTokens ?? 0,
        cost: toNumber(group._sum.estimatedTotalCost),
        events: group._count._all,
      },
    ]),
  );
}

function compareDrift(liveCost: number, historyCost: number) {
  const deltaCost = liveCost - historyCost;
  const absDelta = Math.abs(deltaCost);
  const deltaPct = historyCost > 0 ? (absDelta / historyCost) * 100 : null;
  const matched = absDelta <= 0.25 || (deltaPct !== null && deltaPct <= 15);
  return { deltaCost, deltaPct, matched };
}

export async function getReconciliationSnapshot(
  organizationId: string,
  days = 30,
): Promise<ReconciliationSnapshot> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [providers, liveGroups, providerHistoryGroups, manualImportGroups] =
    await Promise.all([
      prisma.provider.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.usageEvent.groupBy({
        by: ["providerId"],
        where: {
          organizationId,
          timestamp: { gte: since },
          NOT: [
            { source: "csv" },
            { source: { startsWith: "provider-sync:" } },
          ],
          OR: [
            { integrationId: { not: null } },
            { source: { startsWith: "byok-proxy" } },
            { source: { startsWith: "shadow-" } },
          ],
        },
        _sum: { totalTokens: true, estimatedTotalCost: true },
        _count: { _all: true },
      }),
      prisma.usageEvent.groupBy({
        by: ["providerId"],
        where: {
          organizationId,
          timestamp: { gte: since },
          source: { startsWith: "provider-sync:" },
        },
        _sum: { totalTokens: true, estimatedTotalCost: true },
        _count: { _all: true },
      }),
      prisma.usageEvent.groupBy({
        by: ["providerId"],
        where: {
          organizationId,
          timestamp: { gte: since },
          source: "csv",
        },
        _sum: { totalTokens: true, estimatedTotalCost: true },
        _count: { _all: true },
      }),
    ]);

  const liveMap = aggregateMap(liveGroups as AggregateBucket[]);
  const providerHistoryMap = aggregateMap(providerHistoryGroups as AggregateBucket[]);
  const manualImportMap = aggregateMap(manualImportGroups as AggregateBucket[]);

  const rows = providers
    .filter((provider) => {
      return liveMap.has(provider.id) || providerHistoryMap.has(provider.id) || manualImportMap.has(provider.id);
    })
    .map((provider) => {
      const capability = getProviderCapability(provider.name);
      const live = liveMap.get(provider.id) ?? { tokens: 0, cost: 0, events: 0 };
      const providerHistory = providerHistoryMap.get(provider.id) ?? { tokens: 0, cost: 0, events: 0 };
      const manualImport = manualImportMap.get(provider.id) ?? { tokens: 0, cost: 0, events: 0 };
      const comparable = live.cost > 0 && providerHistory.cost > 0;

      let status: ReconciliationStatus;
      let label: string;
      let note: string;
      let deltaCost = 0;
      let deltaPct: number | null = null;

      if (comparable) {
        const compared = compareDrift(live.cost, providerHistory.cost);
        deltaCost = compared.deltaCost;
        deltaPct = compared.deltaPct;
        status = compared.matched ? "matched" : "drift";
        label = compared.matched ? "In range" : "Drift";
        note = compared.matched
          ? "Live metering and provider history are close enough for this window."
          : "Live metering and provider history are meaningfully apart in this window.";
      } else if (live.cost > 0) {
        status = "live_only";
        label = "Live only";
        note = capability.adminKeyRequired
          ? "Live traffic is present, but provider history usually needs admin-level access."
          : "Live traffic is present. No provider-history rows have been imported for this window yet.";
      } else if (providerHistory.cost > 0) {
        status = "history_only";
        label = "History only";
        note = "Provider history exists here, but Tokenometer has not seen matching live traffic in this window.";
      } else {
        status = "manual_only";
        label = "Manual only";
        note =
          manualImport.cost > 0
            ? "This provider only has manual backfill rows in the current window."
            : "No comparable live or provider-history rows in the current window.";
      }

      if (manualImport.cost > 0 && providerHistory.cost === 0) {
        note += ` CSV/manual backfill also covers ${manualImport.events} event${manualImport.events === 1 ? "" : "s"}.`;
      }

      return {
        providerId: provider.id,
        provider: provider.name,
        liveTokens: live.tokens,
        liveCost: live.cost,
        liveEvents: live.events,
        providerHistoryTokens: providerHistory.tokens,
        providerHistoryCost: providerHistory.cost,
        providerHistoryEvents: providerHistory.events,
        manualImportTokens: manualImport.tokens,
        manualImportCost: manualImport.cost,
        manualImportEvents: manualImport.events,
        comparable,
        deltaCost,
        deltaPct,
        status,
        label,
        note,
      };
    })
    .sort((a, b) => {
      const spendDelta =
        b.liveCost + b.providerHistoryCost + b.manualImportCost - (a.liveCost + a.providerHistoryCost + a.manualImportCost);
      if (spendDelta !== 0) return spendDelta;
      return a.provider.localeCompare(b.provider);
    });

  const counts = rows.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    {
      matched: 0,
      drift: 0,
      live_only: 0,
      history_only: 0,
      manual_only: 0,
    } satisfies Record<ReconciliationStatus, number>,
  );

  return { days, since, rows, counts };
}
