import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { DataTable, type Column } from "@/components/DataTable";
import { ProviderChip } from "@/components/ProviderChip";
import { formatTokenBalance } from "@/lib/wallet";
import { formatCurrency } from "@/lib/format";

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

  const wallets = await prisma.wallet.findMany({
    where: { organizationId: org.id },
    include: { provider: true },
    orderBy: { provider: { name: "asc" } },
  });

  const entries = await prisma.walletEntry.findMany({
    where: { wallet: { organizationId: org.id } },
    include: {
      wallet: { include: { provider: true } },
      counterpartyOrg: true,
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  const totalTokens = wallets.reduce((acc, w) => acc + w.balance, 0n);
  const last30Topups = await prisma.walletEntry.aggregate({
    where: {
      wallet: { organizationId: org.id },
      type: "TOPUP",
      createdAt: { gte: new Date(Date.now() - 30 * 86400_000) },
    },
    _sum: { fiatAmount: true },
  });

  const rows: EntryRow[] = entries.map((e) => ({
    id: e.id,
    when: new Date(e.createdAt).toLocaleString(),
    type: TYPE_LABEL[e.type] ?? e.type,
    provider: e.wallet.provider.name,
    tokens:
      (e.tokens >= 0n ? "+" : "−") +
      formatTokenBalance(e.tokens < 0n ? -e.tokens : e.tokens),
    fiat: Number(e.fiatAmount) ? formatCurrency(Number(e.fiatAmount)) : "—",
    counterparty: e.counterpartyOrg?.name ?? "—",
    memo: e.memo ?? "",
  }));

  const cols: Column<EntryRow>[] = [
    { key: "when", header: "When", cell: (r) => r.when },
    { key: "type", header: "Type", cell: (r) => r.type },
    {
      key: "provider",
      header: "Provider",
      cell: (r) => <ProviderChip name={r.provider} />,
    },
    { key: "tokens", header: "Tokens", align: "right", className: "font-mono", cell: (r) => r.tokens },
    { key: "fiat", header: "Fiat", align: "right", className: "font-mono", cell: (r) => r.fiat },
    { key: "counterparty", header: "Counterparty", cell: (r) => r.counterparty },
    { key: "memo", header: "Memo", className: "text-text-muted", cell: (r) => r.memo },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Wallet — ${org.name}`}
        description={`Public handle: ${org.handle}`}
        action={
          <div className="flex flex-wrap gap-2">
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
        <KpiCard
          label="Total tokens"
          value={formatTokenBalance(totalTokens)}
          icon="account_balance_wallet"
        />
        <KpiCard
          label="Wallets"
          value={String(wallets.length)}
          icon="hub"
        />
        <KpiCard
          label="Top-ups (30d)"
          value={formatCurrency(Number(last30Topups._sum.fiatAmount ?? 0))}
          icon="trending_up"
        />
        <KpiCard
          label="Entries shown"
          value={String(entries.length)}
          icon="list_alt"
        />
      </div>

      <Card title="Balances by provider">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {wallets.map((w) => (
            <div
              key={w.id}
              className="rounded-lg border border-border-subtle bg-background p-4"
            >
              <div className="flex items-center justify-between">
                <ProviderChip name={w.provider.name} />
                <span className="text-[11px] uppercase tracking-wider text-text-muted">
                  {w.currency}
                </span>
              </div>
              <p className="mt-3 font-mono text-2xl font-semibold text-on-surface">
                {formatTokenBalance(w.balance)}
              </p>
              <p className="mt-1 text-[11px] text-text-muted">
                {w.balance.toLocaleString()} tokens
              </p>
            </div>
          ))}
          {wallets.length === 0 && (
            <p className="text-body-md text-text-muted">No wallets yet.</p>
          )}
        </div>
      </Card>

      <Card title="Recent activity" description="Latest 25 ledger entries">
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />
      </Card>
    </div>
  );
}
