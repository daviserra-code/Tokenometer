import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { DataTable, type Column } from "@/components/DataTable";
import { ProviderChip } from "@/components/ProviderChip";
import { formatCurrency } from "@/lib/format";
import { formatTokenBalance } from "@/lib/wallet";
import {
  getFinanceCloseSnapshot,
  listChargebackRollups,
  listWalletAllocationSummaries,
  type ChargebackRollup,
} from "@/lib/wallet-allocations";

export const dynamic = "force-dynamic";

type ProviderRow = {
  providerName: string;
  scopeCount: number;
  allocatedTokens: bigint;
  usedTokens: bigint;
  remainingTokens: bigint;
  spendCost: number;
};

export default async function WalletReconciliationPage() {
  requireAdmin();
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  const [rollups, summaries, invoices, close] = await Promise.all([
    listChargebackRollups(org.id),
    listWalletAllocationSummaries(org.id),
    prisma.invoice.findMany({
      where: { organizationId: org.id, type: "MONTHLY_USAGE" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    getFinanceCloseSnapshot(org.id),
  ]);

  const totalChargeback = rollups.reduce((sum, row) => sum + row.spendCost, 0);
  const mappedRollups = rollups.filter((row) => row.costCenterCode || row.costCenterName).length;
  const unmappedRollups = rollups.length - mappedRollups;
  const overAllocatedRollups = rollups.filter((row) => row.overAllocatedScopes > 0).length;

  const providerMap = new Map<string, ProviderRow>();
  for (const summary of summaries) {
    const existing = providerMap.get(summary.providerName);
    if (existing) {
      existing.scopeCount += 1;
      existing.allocatedTokens += summary.allocatedTokens;
      existing.usedTokens += summary.usedTokens;
      existing.remainingTokens += summary.remainingTokens;
      existing.spendCost += summary.spendCost;
      continue;
    }
    providerMap.set(summary.providerName, {
      providerName: summary.providerName,
      scopeCount: 1,
      allocatedTokens: summary.allocatedTokens,
      usedTokens: summary.usedTokens,
      remainingTokens: summary.remainingTokens,
      spendCost: summary.spendCost,
    });
  }
  const providerRows = [...providerMap.values()].sort((a, b) => b.spendCost - a.spendCost);

  const rollupColumns: Column<ChargebackRollup>[] = [
    {
      key: "costCenter",
      header: "Cost center",
      cell: (row) => (
        <div>
          <div className="font-mono text-[12px] font-semibold text-on-surface">
            {row.costCenterCode ?? "UNMAPPED"}
          </div>
          {row.costCenterName ? <div className="text-[12px] text-text-muted">{row.costCenterName}</div> : null}
        </div>
      ),
    },
    {
      key: "provider",
      header: "Provider",
      cell: (row) => <ProviderChip name={row.providerName} />,
    },
    {
      key: "scopeCount",
      header: "Scopes",
      align: "right",
      cell: (row) => String(row.scopeCount),
    },
    {
      key: "allocated",
      header: "Allocated",
      align: "right",
      cell: (row) => formatTokenBalance(row.allocatedTokens),
    },
    {
      key: "used",
      header: "Used",
      align: "right",
      cell: (row) => formatTokenBalance(row.usedTokens),
    },
    {
      key: "remaining",
      header: "Remaining",
      align: "right",
      cell: (row) => formatTokenBalance(row.remainingTokens),
    },
    {
      key: "chargeback",
      header: "Chargeback",
      align: "right",
      cell: (row) => formatCurrency(row.spendCost, org.currency),
    },
  ];

  const providerColumns: Column<ProviderRow>[] = [
    {
      key: "provider",
      header: "Provider",
      cell: (row) => <ProviderChip name={row.providerName} />,
    },
    { key: "scopeCount", header: "Scopes", align: "right", cell: (row) => String(row.scopeCount) },
    {
      key: "allocated",
      header: "Allocated",
      align: "right",
      cell: (row) => formatTokenBalance(row.allocatedTokens),
    },
    {
      key: "used",
      header: "Used",
      align: "right",
      cell: (row) => formatTokenBalance(row.usedTokens),
    },
    {
      key: "remaining",
      header: "Remaining",
      align: "right",
      cell: (row) => formatTokenBalance(row.remainingTokens),
    },
    {
      key: "spend",
      header: "Chargeback",
      align: "right",
      cell: (row) => formatCurrency(row.spendCost, org.currency),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly reconciliation"
        description="Roll up internal AI spend by cost center and provider before it leaves Tokenometer."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/wallet/pack"
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
            >
              <span className="material-symbols-outlined text-[18px]">folder_zip</span>
              Finance pack
            </Link>
            <Link
              href="/api/wallet/chargeback/export?view=rollups"
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Export rollups CSV
            </Link>
            <Link
              href="/api/wallet/chargeback/export?view=invoices"
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
            >
              <span className="material-symbols-outlined text-[18px]">receipt_long</span>
              Export statements CSV
            </Link>
            <Link
              href="/api/wallet/chargeback/export?view=provider_summary"
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
            >
              <span className="material-symbols-outlined text-[18px]">bar_chart</span>
              Provider summary CSV
            </Link>
            <Link
              href="/wallet/value"
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
            >
              <span className="material-symbols-outlined text-[18px]">query_stats</span>
              Provider value view
            </Link>
          </div>
        }
      />

      <div
        className={`rounded-lg border px-4 py-3 ${
          close.status === "ready"
            ? "border-status-normal/40 bg-status-normal/10"
            : close.status === "attention"
              ? "border-status-warning/40 bg-status-warning/10"
              : "border-status-exceeded/40 bg-status-exceeded/10"
        }`}
      >
        <p className="text-sm text-on-surface">
          <strong>Reconciliation posture:</strong> {close.summary}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Chargeback pool" value={formatCurrency(totalChargeback, org.currency)} icon="payments" tone="success" accent />
        <KpiCard label="Mapped rollups" value={String(mappedRollups)} icon="domain" tone="input" />
        <KpiCard label="Unmapped rollups" value={String(unmappedRollups)} icon="warning" tone={unmappedRollups > 0 ? "warning" : "default"} />
        <KpiCard label="Statements issued" value={String(invoices.length)} icon="receipt_long" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Chargeable scopes" value={String(close.chargeableScopes)} icon="account_tree" tone="input" />
        <KpiCard label="Missing statements" value={String(close.missingStatements)} icon="assignment_late" tone={close.missingStatements > 0 ? "warning" : "default"} />
        <KpiCard label="Over-allocated rollups" value={String(close.overAllocatedRollups)} icon="priority_high" tone={close.overAllocatedRollups > 0 ? "warning" : "default"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Cost center rollups" description="Month-to-date internal settlement view by cost center and provider.">
          <DataTable columns={rollupColumns} rows={rollups} rowKey={(row, idx) => `${row.providerName}-${row.costCenterCode ?? "unmapped"}-${idx}`} />
        </Card>
        <Card title="Provider reconciliation" description="Provider totals across all allocated scopes.">
          <DataTable columns={providerColumns} rows={providerRows} rowKey={(row) => row.providerName} />
        </Card>
      </div>

      <Card
        title="Exceptions"
        description="These are the places worth looking first before statements go out."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ExceptionStat
            label="Over-allocated rollups"
            value={String(overAllocatedRollups)}
            tone={overAllocatedRollups > 0 ? "warning" : "default"}
          />
          <ExceptionStat
            label="Unmapped cost centers"
            value={String(unmappedRollups)}
            tone={unmappedRollups > 0 ? "warning" : "default"}
          />
          <ExceptionStat
            label="Scopes with usage"
            value={String(summaries.filter((summary) => summary.usedTokens > 0n).length)}
            tone="default"
          />
        </div>
      </Card>
    </div>
  );
}

function ExceptionStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "warning";
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`mt-1 font-mono text-lg ${tone === "warning" ? "text-status-warning" : "text-on-surface"}`}>
        {value}
      </p>
    </div>
  );
}
