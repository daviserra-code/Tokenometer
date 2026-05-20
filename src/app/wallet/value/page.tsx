import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard } from "@/components/KpiCard";
import { ProviderChip } from "@/components/ProviderChip";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { formatTokenBalance } from "@/lib/wallet";
import { listProviderValueRows, type ProviderValueRow } from "@/lib/provider-value";

export const dynamic = "force-dynamic";

export default async function WalletValuePage() {
  requireAdmin();
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  const rows = await listProviderValueRows(org.id);
  const liveRows = rows.filter((row) => row.observedCostPerMillion != null);
  const cheapestLive = [...liveRows].sort(
    (a, b) =>
      (a.observedCostPerMillion ?? Number.POSITIVE_INFINITY) -
      (b.observedCostPerMillion ?? Number.POSITIVE_INFINITY)
  )[0];
  const bestCatalog = [...rows]
    .filter((row) => row.catalogFloorPerMillion != null)
    .sort(
      (a, b) =>
        (a.catalogFloorPerMillion ?? Number.POSITIVE_INFINITY) -
        (b.catalogFloorPerMillion ?? Number.POSITIVE_INFINITY)
    )[0];
  const largestGap = [...rows]
    .filter((row) => row.optimizationHeadroomPct != null)
    .sort(
      (a, b) =>
        (b.optimizationHeadroomPct ?? Number.NEGATIVE_INFINITY) -
        (a.optimizationHeadroomPct ?? Number.NEGATIVE_INFINITY)
    )[0];

  const columns: Column<ProviderValueRow>[] = [
    {
      key: "provider",
      header: "Provider",
      cell: (row) => (
        <div className="space-y-1">
          <ProviderChip name={row.providerName} />
          <div className="text-[12px] text-text-muted">
            {row.cheapestModelName ? `Floor model: ${row.cheapestModelName}` : "No active pricing catalog"}
          </div>
        </div>
      ),
    },
    {
      key: "valueIndex",
      header: "Value index",
      align: "right",
      cell: (row) => (
        <div>
          <div className="font-mono text-sm text-on-surface">
            {row.effectiveValueIndex != null ? formatNumber(Number(row.effectiveValueIndex.toFixed(1))) : "-"}
          </div>
          <div className="text-[11px] text-text-muted">
            {row.effectiveValueBasis === "LIVE"
              ? "Live basis"
              : row.effectiveValueBasis === "CATALOG"
              ? "Catalog basis"
              : "No basis"}
          </div>
        </div>
      ),
    },
    {
      key: "liveUsage",
      header: "Live usage",
      align: "right",
      cell: (row) => (
        <div>
          <div className="font-mono text-sm text-on-surface">{formatTokenBalance(row.liveTokenCount)}</div>
          <div className="text-[11px] text-text-muted">{row.liveEventCount} events</div>
        </div>
      ),
    },
    {
      key: "spend",
      header: "Spend",
      align: "right",
      cell: (row) => formatCurrency(row.liveSpendCost, org.currency),
    },
    {
      key: "observedRate",
      header: "Observed $ / 1M",
      align: "right",
      cell: (row) =>
        row.observedCostPerMillion != null
          ? formatCurrency(row.observedCostPerMillion, org.currency)
          : "-",
    },
    {
      key: "catalogRate",
      header: "Catalog floor / 1M",
      align: "right",
      cell: (row) =>
        row.catalogFloorPerMillion != null
          ? formatCurrency(row.catalogFloorPerMillion, org.currency)
          : "-",
    },
    {
      key: "headroom",
      header: "Headroom",
      align: "right",
      cell: (row) =>
        row.optimizationHeadroomPct != null ? formatPercent(row.optimizationHeadroomPct, 1) : "-",
    },
    {
      key: "dominantModel",
      header: "Dominant live model",
      cell: (row) =>
        row.dominantModelName ? (
          <div>
            <div className="text-sm text-on-surface">{row.dominantModelName}</div>
            <div className="text-[11px] text-text-muted">
              {formatCurrency(row.dominantModelSpend, org.currency)}
            </div>
          </div>
        ) : (
          "-"
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Provider value view"
        description="A cost-normalized comparison of providers using live metered usage first, then pricing catalog floors when live data is thin."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/api/wallet/chargeback/export?view=value"
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Export value CSV
            </Link>
            <Link
              href="/models"
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
              Open pricing catalog
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Providers compared"
          value={String(rows.length)}
          hint={`${liveRows.length} with live basis`}
          icon="compare_arrows"
          tone="input"
        />
        <KpiCard
          label="Cheapest live provider"
          value={cheapestLive?.providerName ?? "-"}
          hint={
            cheapestLive?.observedCostPerMillion != null
              ? `${formatCurrency(cheapestLive.observedCostPerMillion, org.currency)} / 1M`
              : "Need live usage"
          }
          icon="savings"
          tone="success"
          accent
        />
        <KpiCard
          label="Best catalog floor"
          value={bestCatalog?.providerName ?? "-"}
          hint={
            bestCatalog?.catalogFloorPerMillion != null
              ? `${formatCurrency(bestCatalog.catalogFloorPerMillion, org.currency)} / 1M`
              : "No active models"
          }
          icon="price_check"
          tone="output"
        />
        <KpiCard
          label="Largest optimization gap"
          value={largestGap?.providerName ?? "-"}
          hint={
            largestGap?.optimizationHeadroomPct != null
              ? `${formatPercent(largestGap.optimizationHeadroomPct, 1)} above floor`
              : "No live/catalog gap yet"
          }
          icon="insights"
          tone={largestGap?.optimizationHeadroomPct && largestGap.optimizationHeadroomPct > 0 ? "warning" : "default"}
        />
      </div>

      <Card
        title="Method"
        description="This is the first Phase 3 slice, so the score is intentionally honest and narrow."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <MethodBlock
            title="Live first"
            body="If Tokenometer has live metered traffic for a provider in the last 30 days, the score uses observed cost per 1M tokens."
          />
          <MethodBlock
            title="Catalog fallback"
            body="If live traffic is too thin, the score falls back to the cheapest active model in the provider catalog."
          />
          <MethodBlock
            title="Not a quality score"
            body="This compares price efficiency, not intelligence, latency, or benchmark quality. It is a routing and finance aid, not a universal winner label."
          />
        </div>
      </Card>

      <Card
        title="Provider-normalized comparison"
        description="Value index is anchored so the cheapest basis in the compared set scores 100."
      >
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.providerId} />
      </Card>
    </div>
  );
}

function MethodBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background px-4 py-3">
      <p className="text-sm font-semibold text-on-surface">{title}</p>
      <p className="mt-2 text-[12px] leading-5 text-text-muted">{body}</p>
    </div>
  );
}
