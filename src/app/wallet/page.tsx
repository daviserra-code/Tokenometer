import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { Card, PageHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { DataTable, type Column } from "@/components/DataTable";
import { ProviderChip } from "@/components/ProviderChip";
import {
  formatTokenBalance,
  listPendingWalletApprovalRequests,
  walletAvailableBalance,
  walletLockSummary,
  walletSpendableBalance,
} from "@/lib/wallet";
import { formatCurrency } from "@/lib/format";
import { getOrganizationWalletGuardrail, syncOrganizationBudgetLocks, type WalletBudgetGuardrail } from "@/lib/wallet-guardrails";
import { listWalletAllocationSummaries } from "@/lib/wallet-allocations";
import {
  approveWalletApprovalAction,
  rejectWalletApprovalAction,
  updateWalletPolicyAction,
} from "./actions";

export const dynamic = "force-dynamic";

type EntryRow = {
  id: string;
  when: string;
  type: string;
  provider: string;
  tokens: string;
  fiat: string;
  counterparty: string;
  memo: string;
};

const TYPE_LABEL: Record<string, string> = {
  TOPUP: "Top-up",
  SPEND: "Spend",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  EXCHANGE_IN: "Exchange in",
  EXCHANGE_OUT: "Exchange out",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
};

export default async function WalletPage() {
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) {
    return (
      <div>
        <PageHeader title="Wallet" />
        <Card>
          <p className="text-body-md text-text-muted">
            No organization yet. Run <code>npm run db:seed</code>.
          </p>
        </Card>
      </div>
    );
  }

  const admin = isAdmin();
  await syncOrganizationBudgetLocks(org.id);
  const [wallets, entries, last30Topups, pendingApprovals, organizations, guardrail, allocationSummaries] = await Promise.all([
    prisma.wallet.findMany({
      where: { organizationId: org.id },
      include: { provider: true },
      orderBy: { provider: { name: "asc" } },
    }),
    prisma.walletEntry.findMany({
      where: { wallet: { organizationId: org.id } },
      include: {
        wallet: { include: { provider: true } },
        counterpartyOrg: true,
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.walletEntry.aggregate({
      where: {
        wallet: { organizationId: org.id },
        type: "TOPUP",
        createdAt: { gte: new Date(Date.now() - 30 * 86400_000) },
      },
      _sum: { fiatAmount: true },
    }),
    admin ? listPendingWalletApprovalRequests(org.id, 12) : Promise.resolve([]),
    prisma.organization.findMany({
      where: { OR: [{ id: org.id }, { id: { in: [] } }] },
    }),
    getOrganizationWalletGuardrail(org.id),
    listWalletAllocationSummaries(org.id),
  ]);

  const orgNames = new Map(
    (
      admin
        ? await prisma.organization.findMany({
            where: {
              OR: [
                { id: org.id },
                {
                  id: {
                    in: pendingApprovals
                      .map((request) => request.targetOrganizationId)
                      .filter((value): value is string => Boolean(value)),
                  },
                },
              ],
            },
          })
        : organizations
    ).map((item) => [item.id, item.name])
  );

  const totalTokens = wallets.reduce((acc, wallet) => acc + wallet.balance, 0n);
  const reservedTokens = wallets.reduce((acc, wallet) => acc + wallet.reservedBalance, 0n);
  const availableTokens = wallets.reduce(
    (acc, wallet) => acc + walletAvailableBalance(wallet),
    0n
  );
  const allocatedTokens = allocationSummaries.reduce(
    (acc, allocation) => acc + allocation.allocatedTokens,
    0n
  );
  const chargebackPool = allocationSummaries.reduce((sum, allocation) => sum + allocation.spendCost, 0);

  const rows: EntryRow[] = entries.map((entry) => ({
    id: entry.id,
    when: new Date(entry.createdAt).toLocaleString(),
    type: TYPE_LABEL[entry.type] ?? entry.type,
    provider: entry.wallet.provider.name,
    tokens: `${entry.tokens >= 0n ? "+" : "-"}${formatTokenBalance(entry.tokens < 0n ? -entry.tokens : entry.tokens)}`,
    fiat: Number(entry.fiatAmount) ? formatCurrency(Number(entry.fiatAmount)) : "-",
    counterparty: entry.counterpartyOrg?.name ?? "-",
    memo: entry.memo ?? "",
  }));

  const cols: Column<EntryRow>[] = [
    { key: "when", header: "When", cell: (row) => row.when },
    { key: "type", header: "Type", cell: (row) => row.type },
    {
      key: "provider",
      header: "Provider",
      cell: (row) => <ProviderChip name={row.provider} />,
    },
    {
      key: "tokens",
      header: "Tokens",
      align: "right",
      className: "font-mono",
      cell: (row) => row.tokens,
    },
    { key: "fiat", header: "Fiat", align: "right", className: "font-mono", cell: (row) => row.fiat },
    { key: "counterparty", header: "Counterparty", cell: (row) => row.counterparty },
    { key: "memo", header: "Memo", className: "text-text-muted", cell: (row) => row.memo },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Wallet - ${org.name}`}
        description={`Public handle: ${org.handle}`}
        action={
          <div className="flex flex-wrap gap-2">
            {admin ? (
              <>
                <Link
                  href="/wallet/topup"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-primary-container"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Top up
                </Link>
                <Link
                  href="/wallet/transfer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
                >
                  <span className="material-symbols-outlined text-[18px]">send</span>
                  Transfer
                </Link>
                <Link
                  href="/wallet/exchange"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
                >
                  <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                  Exchange
                </Link>
                <Link
                  href="/wallet/allocations"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
                >
                  <span className="material-symbols-outlined text-[18px]">account_tree</span>
                  Allocations
                </Link>
                <Link
                  href="/wallet/chargeback"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
                >
                  <span className="material-symbols-outlined text-[18px]">request_quote</span>
                  Chargeback
                </Link>
              </>
            ) : (
              <span className="rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm text-text-muted">
                Log in as admin to change balances, approvals, or policies.
              </span>
            )}
            <Link
              href="/wallet/invoices"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
            >
              <span className="material-symbols-outlined text-[18px]">receipt</span>
              Invoices
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total balance" value={formatTokenBalance(totalTokens)} icon="account_balance_wallet" />
        <KpiCard
          label="Available now"
          value={formatTokenBalance(availableTokens)}
          icon="token"
          tone="success"
          accent
        />
        <KpiCard
          label="Reserved"
          value={formatTokenBalance(reservedTokens)}
          icon="shield_lock"
          tone={reservedTokens > 0n ? "warning" : "default"}
        />
        <KpiCard
          label="Committed downstream"
          value={formatTokenBalance(allocatedTokens)}
          hint={`${allocationSummaries.length} active allocations`}
          icon="account_tree"
          tone={allocatedTokens > 0n ? "input" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Allocation snapshot" description="Reserved by provider allocations for projects and teams.">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Active allocations" value={String(allocationSummaries.length)} />
            <Metric label="Allocated tokens" value={formatTokenBalance(allocatedTokens)} />
            <Metric label="Pending approvals" value={String(pendingApprovals.length)} muted={pendingApprovals.length > 0} />
            <Metric label="Wallet locks" value={String(wallets.filter((wallet) => wallet.outgoingLocked).length)} muted={wallets.some((wallet) => wallet.outgoingLocked)} />
          </div>
        </Card>
        <Card title="Chargeback snapshot" description="Month-to-date internal settlement base from allocations plus real usage.">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Chargeback pool" value={formatCurrency(chargebackPool, org.currency)} />
            <Metric
              label="Top-up volume (30d)"
              value={formatCurrency(Number(last30Topups._sum.fiatAmount ?? 0), org.currency)}
            />
            <Metric
              label="Allocations with usage"
              value={String(allocationSummaries.filter((allocation) => allocation.usedTokens > 0n).length)}
            />
            <Metric
              label="Over-allocated scopes"
              value={String(allocationSummaries.filter((allocation) => allocation.remainingTokens < 0n).length)}
              muted={allocationSummaries.some((allocation) => allocation.remainingTokens < 0n)}
            />
          </div>
        </Card>
      </div>

      <Card
        title="Budget guardrail"
        description="Direct wallet actions now respond to the monthly organization budget."
        className={guardrailCardClass(guardrail)}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="font-display text-body-lg font-semibold text-on-surface">
              {guardrail.message}
            </p>
            <p className="mt-2 text-[12px] text-text-muted">
              Budget {formatCurrency(guardrail.budget, org.currency)} · Spend{" "}
              {formatCurrency(guardrail.spend, org.currency)} · Projection{" "}
              {formatCurrency(guardrail.projection, org.currency)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <GuardrailMetric label="State" value={guardrail.state.toUpperCase()} tone={guardrail.state} />
            <GuardrailMetric
              label="Transfers"
              value={guardrail.allowsDirectTransfer ? "Direct" : "Approval"}
              tone={guardrail.allowsDirectTransfer ? "normal" : "critical"}
            />
            <GuardrailMetric
              label="Exchanges"
              value={guardrail.allowsDirectExchange ? "Direct" : "Paused"}
              tone={guardrail.allowsDirectExchange ? "normal" : "exceeded"}
            />
            <GuardrailMetric
              label="Budget"
              value={guardrail.enabled ? "Active" : "Not set"}
              tone={guardrail.enabled ? "warning" : "normal"}
            />
          </div>
        </div>
      </Card>

      <Card title="Balances by provider" description="Spendable reflects reservations and reserve floors.">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {wallets.map((wallet) => (
            <div key={wallet.id} className="rounded-lg border border-border-subtle bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <ProviderChip name={wallet.provider.name} />
                <span className="text-[11px] uppercase tracking-wider text-text-muted">{wallet.currency}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Metric label="Balance" value={formatTokenBalance(wallet.balance)} />
                <Metric label="Available" value={formatTokenBalance(walletAvailableBalance(wallet))} />
                <Metric label="Spendable" value={formatTokenBalance(walletSpendableBalance(wallet))} />
                <Metric label="Reserved" value={formatTokenBalance(wallet.reservedBalance)} />
                <Metric label="Reserve floor" value={formatTokenBalance(wallet.reserveFloor)} />
                <Metric label="Status" value={walletLockSummary(wallet)} muted={wallet.outgoingLocked} />
              </div>

              {admin && (
                <form action={updateWalletPolicyAction} className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-border-subtle/70 bg-surface p-3 md:grid-cols-4">
                  <input type="hidden" name="walletId" value={wallet.id} />
                  <PolicyField label="Reserve floor">
                    <input
                      type="text"
                      name="reserveFloor"
                      inputMode="numeric"
                      defaultValue={wallet.reserveFloor.toString()}
                      className={inputCls}
                    />
                  </PolicyField>
                  <PolicyField label="Outgoing">
                    <select
                      name="outgoingLocked"
                      defaultValue={wallet.outgoingLocked ? "true" : "false"}
                      className={inputCls}
                    >
                      <option value="false">Open</option>
                      <option value="true">Locked</option>
                    </select>
                  </PolicyField>
                  <PolicyField label="Lock reason">
                    <input
                      type="text"
                      name="lockReason"
                      defaultValue={wallet.lockReason ?? ""}
                      placeholder="Budget hold, monthly close, etc."
                      className={inputCls}
                    />
                  </PolicyField>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
                    >
                      Save policy
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
          {wallets.length === 0 && <p className="text-body-md text-text-muted">No wallets yet.</p>}
        </div>
      </Card>

      {admin && (
        <Card
          title="Approval queue"
          description="Transfers reserve tokens immediately. Top-ups wait here until an admin approves them."
        >
          <div className="space-y-3">
            {pendingApprovals.length === 0 && (
              <p className="text-body-md text-text-muted">No pending approval requests.</p>
            )}
            {pendingApprovals.map((request) => (
              <div
                key={request.id}
                className="grid grid-cols-1 gap-3 rounded-lg border border-border-subtle bg-background p-4 lg:grid-cols-[1.5fr_1fr_auto]"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-primary-container/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-container">
                      {request.kind}
                    </span>
                    <ProviderChip name={request.provider.name} />
                  </div>
                  <p className="font-display text-body-md font-semibold text-on-surface">
                    {formatTokenBalance(request.tokens)}
                  </p>
                  <p className="text-[12px] text-text-muted">
                    {request.kind === "TRANSFER"
                      ? `To ${orgNames.get(request.targetOrganizationId ?? "") ?? "another organization"}`
                      : `Unit cost $${Number(request.unitCost).toFixed(8)} per token`}
                  </p>
                  {request.memo && <p className="text-[12px] text-text-muted">{request.memo}</p>}
                </div>
                <div className="text-[12px] text-text-muted">
                  <p>Requested: {new Date(request.createdAt).toLocaleString()}</p>
                  <p>By: {request.requestedBy ?? "unknown"}</p>
                  {request.reserveTokens > 0n && <p>Reserved: {formatTokenBalance(request.reserveTokens)}</p>}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                  <form action={approveWalletApprovalAction}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-primary-container"
                    >
                      Approve
                    </button>
                  </form>
                  <form action={rejectWalletApprovalAction}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <button
                      type="submit"
                      className="w-full rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-status-warning"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Recent activity" description="Latest 25 ledger entries">
        <DataTable columns={cols} rows={rows} rowKey={(row) => row.id} />
      </Card>
    </div>
  );
}

function Metric({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`mt-1 font-mono text-sm ${muted ? "text-status-warning" : "text-on-surface"}`}>{value}</p>
    </div>
  );
}

function PolicyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function GuardrailMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: WalletBudgetGuardrail["state"];
}) {
  const toneClass =
    tone === "exceeded"
      ? "text-status-exceeded"
      : tone === "critical"
      ? "text-status-warning"
      : tone === "warning"
      ? "text-input-token"
      : "text-status-normal";

  return (
    <div className="rounded-lg border border-border-subtle bg-background px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`mt-1 font-mono text-sm ${toneClass}`}>{value}</p>
    </div>
  );
}

function guardrailCardClass(guardrail: WalletBudgetGuardrail) {
  if (guardrail.state === "exceeded") {
    return "border-status-exceeded/40";
  }
  if (guardrail.state === "critical") {
    return "border-status-warning/40";
  }
  if (guardrail.state === "warning") {
    return "border-input-token/40";
  }
  return "border-status-normal/30";
}

const inputCls =
  "w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-on-surface placeholder:text-text-muted focus:border-primary focus:outline-none";
