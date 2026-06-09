import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { DataTable, type Column, type RowTone } from "@/components/DataTable";
import { BudgetBar } from "@/components/BudgetBar";
import { StatusBadge } from "@/components/StatusBadge";
import { getCurrentOrganization } from "@/lib/current-organization";
import { formatCurrency, formatTokens, toNumber } from "@/lib/format";
import { startOfMonth } from "@/lib/calc";
import { listWalletAllocationSummaries } from "@/lib/wallet-allocations";
import { formatTokenBalance } from "@/lib/wallet";
import { syncOrganizationBudgetLocks } from "@/lib/wallet-guardrails";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const org = await getCurrentOrganization();
  if (!org) {
    return (
      <div>
        <PageHeader title="Projects" />
        <Card>
          <p className="text-body-md text-text-muted">No data. Run the seed script first.</p>
        </Card>
      </div>
    );
  }
  await syncOrganizationBudgetLocks(org.id);

  const monthStart = startOfMonth();

  const [projects, agg, totals, allocations] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId: org.id },
      include: {
        team: {
          select: {
            name: true,
            costCenterCode: true,
            costCenterName: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.usageEvent.groupBy({
      by: ["projectId"],
      where: {
        organizationId: org.id,
        timestamp: { gte: monthStart },
        projectId: { not: null },
      },
      _sum: { estimatedTotalCost: true, totalTokens: true },
    }),
    prisma.usageEvent.aggregate({
      where: { organizationId: org.id, timestamp: { gte: monthStart } },
      _sum: { totalTokens: true, estimatedTotalCost: true },
    }),
    listWalletAllocationSummaries(org.id),
  ]);

  const aggMap = new Map<string, { cost: number; tokens: number }>();
  for (const a of agg) {
    aggMap.set(a.projectId!, {
      cost: toNumber(a._sum.estimatedTotalCost),
      tokens: toNumber(a._sum.totalTokens),
    });
  }

  type Row = (typeof projects)[number] & {
    spend: number;
    tokens: number;
    pct: number;
    allocatedTokens: bigint;
    remainingTokens: bigint;
    chargeback: number;
    effectiveCostCenterCode: string | null;
    effectiveCostCenterName: string | null;
  };
  const projectAllocationMap = new Map(
    allocations
      .filter((allocation) => allocation.scope === "PROJECT")
      .map((allocation) => [allocation.scopeId, allocation])
  );
  const rows: Row[] = projects.map((p) => {
    const a = aggMap.get(p.id) ?? { cost: 0, tokens: 0 };
    const budget = toNumber(p.monthlyBudget);
    const allocation = projectAllocationMap.get(p.id);
    return {
      ...p,
      spend: a.cost,
      tokens: a.tokens,
      pct: budget > 0 ? (a.cost / budget) * 100 : 0,
      allocatedTokens: allocation?.allocatedTokens ?? 0n,
      remainingTokens: allocation?.remainingTokens ?? 0n,
      chargeback: allocation?.spendCost ?? 0,
      effectiveCostCenterCode: p.costCenterCode ?? p.team?.costCenterCode ?? null,
      effectiveCostCenterName: p.costCenterName ?? p.team?.costCenterName ?? null,
    };
  });

  const health = { NORMAL: 0, WARNING: 0, EXCEEDED: 0 } as Record<string, number>;
  for (const p of projects) health[p.status] = (health[p.status] ?? 0) + 1;

  const totalSpend = toNumber(totals._sum.estimatedTotalCost);
  const totalTokens = toNumber(totals._sum.totalTokens);

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Project",
      cell: (r) => (
        <div>
          <div className="font-display text-body-md font-semibold text-on-surface">{r.name}</div>
          <div className="font-mono text-[11px] text-text-muted">Owner: {r.owner}</div>
        </div>
      ),
    },
    { key: "team", header: "Team", cell: (r) => r.team?.name ?? "-" },
    {
      key: "costCenter",
      header: "Cost center",
      cell: (r) => (
        <CostCenterCell
          code={r.effectiveCostCenterCode}
          name={r.effectiveCostCenterName}
          inherited={!r.costCenterCode && !!r.team?.costCenterCode}
        />
      ),
    },
    {
      key: "tokens",
      header: "Tokens (MTD)",
      align: "right",
      cell: (r) => formatTokens(r.tokens),
    },
    {
      key: "spend",
      header: "Spend (MTD)",
      align: "right",
      cell: (r) => formatCurrency(r.spend, org.currency),
    },
    {
      key: "budget",
      header: "Budget",
      align: "right",
      cell: (r) => formatCurrency(toNumber(r.monthlyBudget), org.currency),
    },
    {
      key: "allocated",
      header: "Allocated",
      align: "right",
      cell: (r) => formatTokenBalance(r.allocatedTokens),
    },
    {
      key: "remaining",
      header: "Remaining",
      align: "right",
      cell: (r) => formatTokenBalance(r.remainingTokens),
    },
    {
      key: "usage",
      header: "Consumption",
      cell: (r) => (
        <div className="min-w-[180px]">
          <BudgetBar
            spend={r.spend}
            budget={toNumber(r.monthlyBudget)}
            warningPct={50}
            criticalPct={80}
          />
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "chargeback",
      header: "Chargeback",
      align: "right",
      cell: (r) => formatCurrency(r.chargeback, org.currency),
    },
  ];

  const rowTone = (r: Row): RowTone =>
    r.status === "EXCEEDED" ? "exceeded" : r.status === "WARNING" ? "warning" : "default";

  return (
    <div className="space-y-section-gap">
      <PageHeader
        title="Projects"
        description="AI projects, monthly budgets, billing identity, and current spend."
        action={
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 font-display text-body-md font-semibold text-on-primary transition-colors hover:bg-primary">
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Project
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Global MTD Spend"
          value={formatCurrency(totalSpend, org.currency)}
          icon="payments"
          tone="success"
          accent
        />
        <KpiCard
          label="Total MTD Tokens"
          value={formatTokens(totalTokens)}
          icon="token"
          tone="input"
          accent
        />
        <Card title="Project Health" className="lg:col-span-1">
          <div className="grid grid-cols-3 gap-2 text-center">
            <HealthChip label="Normal" count={health.NORMAL ?? 0} tone="success" icon="check_circle" />
            <HealthChip label="Warning" count={health.WARNING ?? 0} tone="warning" icon="warning" />
            <HealthChip label="Exceeded" count={health.EXCEEDED ?? 0} tone="danger" icon="error" />
          </div>
        </Card>
      </div>

      <Card noPadding>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} rowTone={rowTone} />
      </Card>
    </div>
  );
}

function HealthChip({
  label,
  count,
  tone,
  icon,
}: {
  label: string;
  count: number;
  tone: "success" | "warning" | "danger";
  icon: string;
}) {
  const t =
    tone === "success"
      ? "text-status-normal bg-status-normal/10"
      : tone === "warning"
      ? "text-status-warning bg-status-warning/10"
      : "text-status-exceeded bg-status-exceeded/10";
  return (
    <div className={`flex flex-col items-center gap-1 rounded-lg p-2 ${t}`}>
      <span className="material-symbols-outlined text-[22px]">{icon}</span>
      <span className="font-display text-h2">{count}</span>
      <span className="font-mono text-caps">{label}</span>
    </div>
  );
}

function CostCenterCell({
  code,
  name,
  inherited = false,
}: {
  code: string | null;
  name: string | null;
  inherited?: boolean;
}) {
  if (!code && !name) {
    return <span className="text-text-muted">Unmapped</span>;
  }
  return (
    <div>
      <div className="font-mono text-[12px] font-semibold text-on-surface">{code ?? "Mapped"}</div>
      {name ? <div className="text-[12px] text-text-muted">{name}</div> : null}
      {inherited ? <div className="text-[11px] text-text-muted">Inherited from team</div> : null}
    </div>
  );
}
