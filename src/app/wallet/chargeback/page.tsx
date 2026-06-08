import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getCurrentOrganization } from "@/lib/current-organization";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { DataTable, type Column } from "@/components/DataTable";
import { ProviderChip } from "@/components/ProviderChip";
import { formatCurrency } from "@/lib/format";
import { formatTokenBalance } from "@/lib/wallet";
import { issueChargebackStatementsAction } from "../actions";
import { getFinanceCloseSnapshot, listWalletAllocationSummaries } from "@/lib/wallet-allocations";

export const dynamic = "force-dynamic";

type ChargebackRow = {
  id: string;
  scope: string;
  name: string;
  costCenterCode: string | null;
  costCenterName: string | null;
  provider: string;
  allocated: bigint;
  used: bigint;
  remaining: bigint;
  utilizationPct: number;
  spend: number;
};

export default async function ChargebackPage() {
  requireAdmin();
  const org = await getCurrentOrganization();
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  const [summaries, recentInvoices, close] = await Promise.all([
    listWalletAllocationSummaries(org.id),
    prisma.invoice.findMany({
      where: { organizationId: org.id, type: "MONTHLY_USAGE" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    getFinanceCloseSnapshot(org.id),
  ]);

  const rows: ChargebackRow[] = summaries.map((summary) => ({
    id: summary.id,
    scope: summary.scope,
    name: summary.scopeName,
    costCenterCode: summary.costCenterCode,
    costCenterName: summary.costCenterName,
    provider: summary.providerName,
    allocated: summary.allocatedTokens,
    used: summary.usedTokens,
    remaining: summary.remainingTokens,
    utilizationPct: summary.utilizationPct,
    spend: summary.spendCost,
  }));

  const totalSpend = rows.reduce((sum, row) => sum + row.spend, 0);

  const columns: Column<ChargebackRow>[] = [
    { key: "scope", header: "Scope", cell: (row) => row.scope },
    { key: "name", header: "Name", cell: (row) => row.name },
    {
      key: "costCenter",
      header: "Cost center",
      cell: (row) => <CostCenterCell code={row.costCenterCode} name={row.costCenterName} />,
    },
    {
      key: "provider",
      header: "Provider",
      cell: (row) => <ProviderChip name={row.provider} />,
    },
    {
      key: "allocated",
      header: "Allocated",
      align: "right",
      cell: (row) => formatTokenBalance(row.allocated),
    },
    {
      key: "used",
      header: "Used",
      align: "right",
      cell: (row) => formatTokenBalance(row.used),
    },
    {
      key: "remaining",
      header: "Remaining",
      align: "right",
      cell: (row) => formatTokenBalance(row.remaining),
    },
    {
      key: "utilizationPct",
      header: "Utilization",
      align: "right",
      cell: (row) => `${row.utilizationPct.toFixed(1)}%`,
    },
    {
      key: "spend",
      header: "Chargeback",
      align: "right",
      cell: (row) => formatCurrency(row.spend, org.currency),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Internal chargeback"
        description="Project and team statements built from provider allocations plus real usage."
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
              href="/wallet/reconciliation"
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
            >
              <span className="material-symbols-outlined text-[18px]">finance_mode</span>
              Reconciliation
            </Link>
            <Link
              href="/api/wallet/chargeback/export?view=rollups"
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Export CSV
            </Link>
            <form action={issueChargebackStatementsAction}>
              <input type="hidden" name="organizationId" value={org.id} />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-primary-container"
              >
                <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                Issue statements
              </button>
            </form>
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
          <strong>Chargeback readiness:</strong> {close.summary}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Chargeable scopes" value={String(close.chargeableScopes)} icon="account_tree" tone="input" />
        <KpiCard label="Statements issued" value={String(close.statementsIssued)} icon="receipt_long" />
        <KpiCard label="Missing statements" value={String(close.missingStatements)} icon="assignment_late" tone={close.missingStatements > 0 ? "warning" : "default"} />
        <KpiCard label="Unmapped rollups" value={String(close.unmappedRollups)} icon="warning" tone={close.unmappedRollups > 0 ? "warning" : "default"} />
      </div>

      <Card
        title="Month-to-date statement base"
        description={`Current internal chargeback pool: ${formatCurrency(totalSpend, org.currency)}`}
      >
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />
      </Card>

      <Card
        title="Recent issued statements"
        description="Generated as internal monthly usage invoices."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[12px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Number</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Issued to</th>
                <th className="px-3 py-2 text-left">Cost center</th>
                <th className="px-3 py-2 text-left">Issued by</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {recentInvoices.map((invoice) => {
                const data =
                  invoice.dataJson && typeof invoice.dataJson === "object"
                    ? (invoice.dataJson as Record<string, unknown>)
                    : {};
                const code = typeof data.costCenterCode === "string" ? data.costCenterCode : null;
                const name = typeof data.costCenterName === "string" ? data.costCenterName : null;
                return (
                  <tr key={invoice.id}>
                    <td className="px-3 py-2 font-mono">{invoice.number}</td>
                    <td className="px-3 py-2">{new Date(invoice.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{invoice.issuedTo}</td>
                    <td className="px-3 py-2">
                      <CostCenterCell code={code} name={name} />
                    </td>
                    <td className="px-3 py-2">{invoice.issuedFrom}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatCurrency(Number(invoice.total), org.currency)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/wallet/invoices/${invoice.id}/print`}
                        target="_blank"
                        className="text-primary hover:underline"
                      >
                        Print
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {recentInvoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-text-muted">
                    No chargeback statements issued yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CostCenterCell({
  code,
  name,
}: {
  code: string | null;
  name: string | null;
}) {
  if (!code && !name) {
    return <span className="text-text-muted">Unmapped</span>;
  }
  return (
    <div>
      <div className="font-mono text-[12px] font-semibold text-on-surface">{code ?? "Mapped"}</div>
      {name ? <div className="text-[12px] text-text-muted">{name}</div> : null}
    </div>
  );
}
