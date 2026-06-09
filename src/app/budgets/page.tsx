import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { DataTable, type Column, type RowTone } from "@/components/DataTable";
import { BudgetBar } from "@/components/BudgetBar";
import { getCurrentOrganization } from "@/lib/current-organization";
import { formatCurrency, toNumber } from "@/lib/format";
import { daysInMonth, projectMonthEndSpend, startOfMonth } from "@/lib/calc";
import { syncOrganizationBudgetLocks } from "@/lib/wallet-guardrails";
import clsx from "clsx";

export const dynamic = "force-dynamic";

type BudgetRow = {
  id: string;
  scope: string;
  scopeName: string;
  period: string;
  budget: number;
  spend: number;
  pct: number;
  projection: number;
  state: "normal" | "warning" | "critical" | "exceeded";
};

function stateForPct(pct: number): BudgetRow["state"] {
  if (pct >= 100) return "exceeded";
  if (pct >= 80) return "critical";
  if (pct >= 50) return "warning";
  return "normal";
}

export default async function BudgetsPage() {
  const org = await getCurrentOrganization();
  if (!org) {
    return (
      <div>
        <PageHeader title="Budgets" />
        <Card>
          <p className="text-body-md text-text-muted">No data. Run the seed script first.</p>
        </Card>
      </div>
    );
  }
  await syncOrganizationBudgetLocks(org.id);

  const monthStart = startOfMonth();
  const now = new Date();
  const dim = daysInMonth(now);
  const day = now.getDate();

  const [
    budgets,
    projects,
    teams,
    models,
    orgAgg,
    projectAggs,
    teamAggs,
    modelAggs,
  ] = await Promise.all([
    prisma.budget.findMany({ where: { organizationId: org.id } }),
    prisma.project.findMany({ where: { organizationId: org.id } }),
    prisma.team.findMany({ where: { organizationId: org.id } }),
    prisma.model.findMany({ include: { provider: true } }),
    prisma.usageEvent.aggregate({
      where: { organizationId: org.id, timestamp: { gte: monthStart } },
      _sum: { estimatedTotalCost: true },
    }),
    prisma.usageEvent.groupBy({
      by: ["projectId"],
      where: {
        organizationId: org.id,
        timestamp: { gte: monthStart },
        projectId: { not: null },
      },
      _sum: { estimatedTotalCost: true },
    }),
    prisma.usageEvent.groupBy({
      by: ["teamId"],
      where: {
        organizationId: org.id,
        timestamp: { gte: monthStart },
        teamId: { not: null },
      },
      _sum: { estimatedTotalCost: true },
    }),
    prisma.usageEvent.groupBy({
      by: ["modelId"],
      where: { organizationId: org.id, timestamp: { gte: monthStart } },
      _sum: { estimatedTotalCost: true },
    }),
  ]);

  const orgSpend = toNumber(orgAgg._sum.estimatedTotalCost);
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));
  const modelMap = new Map(
    models.map((m) => [m.id, `${m.provider.name} · ${m.name}`])
  );

  const projectSpendMap = new Map(
    projectAggs.map((a) => [a.projectId!, toNumber(a._sum.estimatedTotalCost)])
  );
  const teamSpendMap = new Map(
    teamAggs.map((a) => [a.teamId!, toNumber(a._sum.estimatedTotalCost)])
  );
  const modelSpendMap = new Map(
    modelAggs.map((a) => [a.modelId, toNumber(a._sum.estimatedTotalCost)])
  );

  const rows: BudgetRow[] = budgets.map((b) => {
    let scopeName = "—";
    let spend = 0;
    if (b.scopeType === "ORGANIZATION") {
      scopeName = org.name;
      spend = orgSpend;
    } else if (b.scopeType === "PROJECT" && b.scopeId) {
      scopeName = projectMap.get(b.scopeId) ?? "Unknown project";
      spend = projectSpendMap.get(b.scopeId) ?? 0;
    } else if (b.scopeType === "TEAM" && b.scopeId) {
      scopeName = teamMap.get(b.scopeId) ?? "Unknown team";
      spend = teamSpendMap.get(b.scopeId) ?? 0;
    } else if (b.scopeType === "MODEL" && b.scopeId) {
      scopeName = modelMap.get(b.scopeId) ?? "Unknown model";
      spend = modelSpendMap.get(b.scopeId) ?? 0;
    }
    const budget = toNumber(b.amount);
    const pct = budget > 0 ? (spend / budget) * 100 : 0;
    return {
      id: b.id,
      scope: b.scopeType,
      scopeName,
      period: b.period,
      budget,
      spend,
      pct,
      projection: projectMonthEndSpend(spend, day, dim),
      state: stateForPct(pct),
    };
  });

  rows.sort((a, b) => b.pct - a.pct);

  // KPI strip
  const totalBudget = rows.reduce((acc, r) => acc + r.budget, 0);
  const totalSpend = rows.reduce((acc, r) => acc + r.spend, 0);
  const overCount = rows.filter((r) => r.state === "exceeded").length;

  const stateMap = {
    normal: "bg-status-normal/10 text-status-normal ring-status-normal/30",
    warning: "bg-input-token/10 text-input-token ring-input-token/30",
    critical: "bg-status-warning/10 text-status-warning ring-status-warning/30",
    exceeded: "bg-status-exceeded/10 text-status-exceeded ring-status-exceeded/30",
  } as const;

  const cols: Column<BudgetRow>[] = [
    {
      key: "scope",
      header: "Scope",
      cell: (r) => (
        <div>
          <div className="font-display text-body-md font-semibold text-on-surface">
            {r.scopeName}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
            {r.scope}
          </div>
        </div>
      ),
    },
    { key: "period", header: "Period", cell: (r) => r.period },
    {
      key: "budget",
      header: "Budget",
      align: "right",
      cell: (r) => formatCurrency(r.budget, org.currency),
    },
    {
      key: "spend",
      header: "Spend (MTD)",
      align: "right",
      cell: (r) => formatCurrency(r.spend, org.currency),
    },
    {
      key: "projection",
      header: "Projected",
      align: "right",
      cell: (r) => (
        <span
          className={clsx(
            r.budget > 0 &&
              r.projection > r.budget &&
              "font-semibold text-status-exceeded"
          )}
        >
          {formatCurrency(r.projection, org.currency)}
        </span>
      ),
    },
    {
      key: "usage",
      header: "Consumption",
      cell: (r) => (
        <div className="min-w-[200px]">
          <BudgetBar
            spend={r.spend}
            budget={r.budget}
            warningPct={50}
            criticalPct={80}
          />
        </div>
      ),
    },
    {
      key: "state",
      header: "State",
      cell: (r) => (
        <span
          className={clsx(
            "inline-flex items-center rounded font-mono text-[10px] uppercase tracking-wider ring-1 ring-inset px-2 py-0.5",
            stateMap[r.state]
          )}
        >
          {r.state}
        </span>
      ),
    },
  ];

  const rowTone = (r: BudgetRow): RowTone =>
    r.state === "exceeded"
      ? "exceeded"
      : r.state === "critical"
      ? "warning"
      : "default";

  return (
    <div className="space-y-section-gap">
      <PageHeader
        title="Budgets"
        description="Monthly budgets across organization, projects, teams and models. Visual thresholds: 50% / 80% / 100%."
        action={
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 font-display text-body-md font-semibold text-on-primary transition-colors hover:bg-primary">
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Budget
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total Budget Pool"
          value={formatCurrency(totalBudget, org.currency)}
          icon="account_balance_wallet"
          tone="default"
        />
        <KpiCard
          label="Total Committed"
          value={formatCurrency(totalSpend, org.currency)}
          hint={`${
            totalBudget > 0
              ? ((totalSpend / totalBudget) * 100).toFixed(0)
              : 0
          }% utilization`}
          icon="trending_up"
          tone="input"
          accent
        />
        <KpiCard
          label="Budgets Over Limit"
          value={String(overCount)}
          hint={`of ${rows.length} budgets`}
          icon="error"
          tone={overCount > 0 ? "danger" : "success"}
          accent
        />
      </div>

      <Card noPadding>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} rowTone={rowTone} />
      </Card>
    </div>
  );
}
