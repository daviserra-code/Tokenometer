import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { formatCurrency } from "@/lib/format";
import { listChargebackRollups } from "@/lib/wallet-allocations";

export const dynamic = "force-dynamic";

export default async function WalletPackPage() {
  requireAdmin();
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  const [rollups, invoices] = await Promise.all([
    listChargebackRollups(org.id),
    prisma.invoice.findMany({
      where: { organizationId: org.id, type: "MONTHLY_USAGE" },
      orderBy: { createdAt: "desc" },
      take: 24,
    }),
  ]);

  const totalChargeback = rollups.reduce((sum, row) => sum + row.spendCost, 0);
  const mappedRollups = rollups.filter((row) => row.costCenterCode || row.costCenterName).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly close pack"
        description="Download the current finance artifacts and open statement-ready views for the month."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Chargeback pool"
          value={formatCurrency(totalChargeback, org.currency)}
          icon="payments"
          tone="success"
          accent
        />
        <KpiCard label="Statements issued" value={String(invoices.length)} icon="receipt_long" />
        <KpiCard label="Mapped rollups" value={`${mappedRollups}/${rollups.length}`} icon="domain" tone="input" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <PackCard
          title="Cost center rollups"
          description="Internal settlement rollups by cost center and provider."
          href="/api/wallet/chargeback/export?view=rollups"
          label="Download rollups CSV"
        />
        <PackCard
          title="Statement ledger"
          description="Issued monthly usage statements with cost center metadata."
          href="/api/wallet/chargeback/export?view=invoices"
          label="Download statements CSV"
        />
        <PackCard
          title="Provider summary"
          description="Provider-level monthly totals across all allocated scopes."
          href="/api/wallet/chargeback/export?view=provider_summary"
          label="Download provider CSV"
        />
        <PackCard
          title="Provider value comparison"
          description="Cost-normalized provider comparison using live basis first, then catalog floors."
          href="/api/wallet/chargeback/export?view=value"
          label="Download value CSV"
        />
      </div>

      <Card
        title="Recent printable statements"
        description="Open statement pages in a print-friendly layout for month-end handoff."
      >
        <div className="space-y-3">
          {invoices.slice(0, 12).map((invoice) => (
            <div
              key={invoice.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-background px-4 py-3"
            >
              <div>
                <div className="font-mono text-sm text-on-surface">{invoice.number}</div>
                <div className="text-[12px] text-text-muted">
                  {invoice.issuedTo} - {new Date(invoice.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-on-surface">
                  {formatCurrency(Number(invoice.total), org.currency)}
                </span>
                <Link
                  href={`/wallet/invoices/${invoice.id}/print`}
                  target="_blank"
                  className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm font-semibold text-on-surface hover:border-primary"
                >
                  <span className="material-symbols-outlined text-[18px]">print</span>
                  Open statement
                </Link>
              </div>
            </div>
          ))}
          {invoices.length === 0 ? (
            <p className="text-body-md text-text-muted">No monthly usage statements issued yet.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function PackCard({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href: string;
  label: string;
}) {
  return (
    <Card title={title} description={description}>
      <Link
        href={href}
        className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
      >
        <span className="material-symbols-outlined text-[18px]">download</span>
        {label}
      </Link>
    </Card>
  );
}
