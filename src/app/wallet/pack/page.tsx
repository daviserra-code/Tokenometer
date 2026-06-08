import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { formatCurrency } from "@/lib/format";
import { getFinanceCloseSnapshot, listChargebackRollups } from "@/lib/wallet-allocations";

export const dynamic = "force-dynamic";

export default async function WalletPackPage() {
  requireAdmin();
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  const [rollups, invoices, close] = await Promise.all([
    listChargebackRollups(org.id),
    prisma.invoice.findMany({
      where: { organizationId: org.id, type: "MONTHLY_USAGE" },
      orderBy: { createdAt: "desc" },
      take: 24,
    }),
    getFinanceCloseSnapshot(org.id),
  ]);

  const totalChargeback = rollups.reduce((sum, row) => sum + row.spendCost, 0);
  const mappedRollups = rollups.filter((row) => row.costCenterCode || row.costCenterName).length;
  const unmappedRollups = rollups.length - mappedRollups;
  const overAllocatedRollups = rollups.filter((row) => row.overAllocatedScopes > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly close pack"
        description="Download the current finance artifacts and open statement-ready views for the month."
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
          <strong>Month-end posture:</strong> {close.summary}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Chargeback pool"
          value={formatCurrency(totalChargeback, org.currency)}
          icon="payments"
          tone="success"
          accent
        />
        <KpiCard label="Statements issued" value={String(invoices.length)} icon="receipt_long" />
        <KpiCard label="Mapped rollups" value={`${mappedRollups}/${rollups.length}`} icon="domain" tone="input" />
        <KpiCard label="Missing statements" value={String(close.missingStatements)} icon="assignment_late" tone={close.missingStatements > 0 ? "warning" : "default"} />
      </div>

      <Card
        title="Month-end checklist"
        description="A simple operator sequence for turning live usage into finance-ready output."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ChecklistStep
            n="1"
            title="Review reconciliation"
            body="Start in Wallet Reconciliation and confirm provider totals look sane before exporting anything."
            href="/wallet/reconciliation"
            cta="Open reconciliation"
          />
          <ChecklistStep
            n="2"
            title="Resolve exceptions"
            body={`Unmapped rollups: ${unmappedRollups}. Over-allocated rollups: ${overAllocatedRollups}. Clear these first when possible.`}
            href="/wallet/allocations"
            cta="Open allocations"
          />
          <ChecklistStep
            n="3"
            title="Issue statements"
            body="Generate monthly internal statements once the pool and mappings look right."
            href="/wallet/chargeback"
            cta="Open chargeback"
          />
          <ChecklistStep
            n="4"
            title="Export the pack"
            body="Download the finance artifacts and use the printable statements for handoff."
          />
        </div>
      </Card>

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
          title="Audit trail"
          description="History of allocation, policy, cost center, and approval changes behind the close."
          href="/wallet/history"
          label="Open wallet history"
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

function ChecklistStep({
  n,
  title,
  body,
  href,
  cta,
}: {
  n: string;
  title: string;
  body: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background p-4">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-slate-900">
        {n}
      </div>
      <h3 className="font-semibold text-on-surface">{title}</h3>
      <p className="mt-1 text-[12px] text-text-muted">{body}</p>
      {href && cta ? (
        <Link href={href} className="mt-3 inline-flex text-xs font-semibold text-primary hover:underline">
          {cta}
        </Link>
      ) : null}
    </div>
  );
}
