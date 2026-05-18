import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { BudgetBar } from "@/components/BudgetBar";
import { DualTrendChart, type DualPoint } from "@/components/charts/TrendChart";
import { DataTable } from "@/components/DataTable";
import { ProviderTag } from "@/components/ProviderChip";
import { AutoRefresh } from "@/components/AutoRefresh";
import { formatCurrency, formatDateTime, formatTokens, toNumber } from "@/lib/format";
import {
  daysInMonth,
  projectMonthEndSpend,
  startOfMonth,
  startOfPrevMonth,
} from "@/lib/calc";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const org = await prisma.organization.findFirst();
  if (!org) return null;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const prevMonthStart = startOfPrevMonth(now);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalsThisMonth,
    totalsPrevMonth,
    inputThisMonth,
    inputPrevMonth,
    outputThisMonth,
    outputPrevMonth,
    orgBudget,
    topModels,
    topProjects,
    last30Events,
    eventCountThisMonth,
    latestEvent,
  ] = await Promise.all([
    prisma.usageEvent.aggregate({
      where: { organizationId: org.id, timestamp: { gte: monthStart } },
      _sum: { totalTokens: true, estimatedTotalCost: true },
    }),
    prisma.usageEvent.aggregate({
      where: {
        organizationId: org.id,
        timestamp: { gte: prevMonthStart, lt: monthStart },
      },
      _sum: { totalTokens: true, estimatedTotalCost: true },
    }),
    prisma.usageEvent.aggregate({
      where: { organizationId: org.id, timestamp: { gte: monthStart } },
      _sum: { inputTokens: true },
    }),
    prisma.usageEvent.aggregate({
      where: {
        organizationId: org.id,
        timestamp: { gte: prevMonthStart, lt: monthStart },
      },
      _sum: { inputTokens: true },
    }),
    prisma.usageEvent.aggregate({
      where: { organizationId: org.id, timestamp: { gte: monthStart } },
      _sum: { outputTokens: true },
    }),
    prisma.usageEvent.aggregate({
      where: {
        organizationId: org.id,
        timestamp: { gte: prevMonthStart, lt: monthStart },
      },
      _sum: { outputTokens: true },
    }),
    prisma.budget.findFirst({
      where: { organizationId: org.id, scopeType: "ORGANIZATION" },
    }),
    prisma.usageEvent.groupBy({
      by: ["modelId"],
      where: { organizationId: org.id, timestamp: { gte: monthStart } },
      _sum: { estimatedTotalCost: true, totalTokens: true },
      orderBy: { _sum: { estimatedTotalCost: "desc" } },
      take: 5,
    }),
    prisma.usageEvent.groupBy({
      by: ["projectId"],
      where: {
        organizationId: org.id,
        timestamp: { gte: monthStart },
        projectId: { not: null },
      },
      _sum: { estimatedTotalCost: true, totalTokens: true },
      orderBy: { _sum: { estimatedTotalCost: "desc" } },
      take: 5,
    }),
    prisma.usageEvent.findMany({
      where: { organizationId: org.id, timestamp: { gte: last30 } },
      select: {
        timestamp: true,
        inputTokens: true,
        outputTokens: true,
        estimatedTotalCost: true,
      },
    }),
    prisma.usageEvent.count({
      where: { organizationId: org.id, timestamp: { gte: monthStart } },
    }),
    prisma.usageEvent.findFirst({
      where: { organizationId: org.id },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true, source: true, createdAt: true },
    }),
  ]);

  const modelMap = new Map<string, { name: string; provider: string }>();
  if (topModels.length) {
    const models = await prisma.model.findMany({
      where: { id: { in: topModels.map((m) => m.modelId) } },
      include: { provider: true },
    });
    for (const m of models)
      modelMap.set(m.id, { name: m.name, provider: m.provider.name });
  }
  const projectMap = new Map<string, string>();
  if (topProjects.length) {
    const projs = await prisma.project.findMany({
      where: {
        id: { in: topProjects.map((p) => p.projectId!).filter(Boolean) },
      },
      select: { id: true, name: true },
    });
    for (const p of projs) projectMap.set(p.id, p.name);
  }

  const buckets = new Map<
    string,
    { input: number; output: number; cost: number }
  >();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), { input: 0, output: 0, cost: 0 });
  }
  for (const e of last30Events) {
    const key = e.timestamp.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (!b) continue;
    b.input += e.inputTokens;
    b.output += e.outputTokens;
    b.cost += toNumber(e.estimatedTotalCost);
  }
  const trend: DualPoint[] = [...buckets.entries()].map(([date, v]) => ({
    date: date.slice(5),
    inputTokens: v.input,
    outputTokens: v.output,
    cost: Number(v.cost.toFixed(2)),
  }));

  const tokensThisMonth = toNumber(totalsThisMonth._sum.totalTokens);
  const costThisMonth = toNumber(totalsThisMonth._sum.estimatedTotalCost);
  const tokensPrevMonth = toNumber(totalsPrevMonth._sum.totalTokens);
  const costPrevMonth = toNumber(totalsPrevMonth._sum.estimatedTotalCost);

  const inThis = toNumber(inputThisMonth._sum.inputTokens);
  const inPrev = toNumber(inputPrevMonth._sum.inputTokens);
  const outThis = toNumber(outputThisMonth._sum.outputTokens);
  const outPrev = toNumber(outputPrevMonth._sum.outputTokens);

  const budgetAmount = toNumber(orgBudget?.amount ?? 0);
  const budgetPct = budgetAmount > 0 ? (costThisMonth / budgetAmount) * 100 : 0;

  const dim = daysInMonth(now);
  const day = now.getDate();
  const projection = projectMonthEndSpend(costThisMonth, day, dim);

  const pctDelta = (cur: number, prev: number) =>
    prev > 0 ? ((cur - prev) / prev) * 100 : 0;

  return {
    org,
    tokensThisMonth,
    costThisMonth,
    tokensDelta: pctDelta(tokensThisMonth, tokensPrevMonth),
    costDelta: pctDelta(costThisMonth, costPrevMonth),
    inputTokens: inThis,
    outputTokens: outThis,
    inputDelta: pctDelta(inThis, inPrev),
    outputDelta: pctDelta(outThis, outPrev),
    budgetAmount,
    budgetPct,
    projection,
    projectionDelta: pctDelta(projection, costPrevMonth),
    trend,
    eventCountThisMonth,
    latestEvent,
    topModels: topModels.map((m) => ({
      name: modelMap.get(m.modelId)?.name ?? "—",
      provider: modelMap.get(m.modelId)?.provider ?? "—",
      cost: toNumber(m._sum.estimatedTotalCost),
      tokens: toNumber(m._sum.totalTokens),
    })),
    topProjects: topProjects.map((p) => ({
      name: projectMap.get(p.projectId!) ?? "—",
      cost: toNumber(p._sum.estimatedTotalCost),
      tokens: toNumber(p._sum.totalTokens),
    })),
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  if (!data) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <Card title="No organization found">
          <p className="text-body-md text-text-muted">
            Run{" "}
            <code className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-data">
              npm run setup
            </code>{" "}
            to initialize the database and seed demo data.
          </p>
        </Card>
      </div>
    );
  }

  const currency = data.org.currency;
  const latestTimestamp = data.latestEvent?.timestamp ?? null;
  const latestAgeHours = latestTimestamp
    ? (Date.now() - latestTimestamp.getTime()) / (1000 * 60 * 60)
    : null;
  const isStale = latestAgeHours == null || latestAgeHours > 24;

  return (
    <div className="space-y-section-gap">
      <PageHeader
        title="Dashboard"
        description="Operational overview of AI token consumption, cost and budget for the current month."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <AutoRefresh />
            <button className="inline-flex items-center gap-2 rounded-lg border border-primary-container/40 bg-primary-container/10 px-4 py-2 font-display text-body-md font-semibold text-primary-container transition-colors hover:bg-primary-container/20">
              <span className="material-symbols-outlined text-[18px]">download</span>
              Generate Report
            </button>
          </div>
        }
      />

      <div
        className={`rounded-lg border px-4 py-3 ${
          isStale
            ? "border-status-warning/40 bg-status-warning/10"
            : "border-status-normal/40 bg-status-normal/10"
        }`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className={`material-symbols-outlined mt-0.5 text-[20px] ${
                isStale ? "text-status-warning" : "text-status-normal"
              }`}
            >
              {isStale ? "schedule" : "verified"}
            </span>
            <div>
              <p className="font-display text-body-md font-semibold text-on-surface">
                {latestTimestamp
                  ? `Latest usage event: ${formatDateTime(latestTimestamp)}`
                  : "No usage events found"}
              </p>
              <p className="mt-0.5 text-[12px] text-text-muted">
                {latestTimestamp
                  ? `Source: ${data.latestEvent?.source ?? "unknown"}. Current month events: ${data.eventCountThisMonth.toLocaleString()}.`
                  : "Seed or ingest usage data to populate the dashboard."}
                {isStale && latestTimestamp
                  ? " Data is more than 24 hours old; run provider sync, use the BYOK proxy, or import current usage."
                  : ""}
              </p>
            </div>
          </div>
          <a
            href="/settings/credentials"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-[12px] font-semibold text-on-surface hover:border-primary hover:text-primary"
          >
            <span className="material-symbols-outlined text-[16px]">sync</span>
            Sync providers
          </a>
        </div>
      </div>

      {/* KPI Bento */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="MTD Spend"
          value={formatCurrency(data.costThisMonth, currency)}
          delta={{ value: data.costDelta }}
          hint="vs last month"
          icon="payments"
          tone="success"
          accent
        />
        <KpiCard
          label="Projected Month-end"
          value={formatCurrency(data.projection, currency)}
          delta={{ value: data.projectionDelta }}
          hint={
            data.budgetAmount > 0
              ? data.projection > data.budgetAmount
                ? `over by ${formatCurrency(data.projection - data.budgetAmount, currency)}`
                : `${formatCurrency(data.budgetAmount - data.projection, currency)} headroom`
              : "linear extrapolation"
          }
          icon="trending_up"
          tone={
            data.budgetAmount > 0 && data.projection > data.budgetAmount
              ? "danger"
              : "warning"
          }
          accent
        />
        <KpiCard
          label="MTD Input Tokens"
          value={formatTokens(data.inputTokens)}
          delta={{ value: data.inputDelta }}
          hint="vs last month"
          icon="login"
          tone="input"
          accent
        />
        <KpiCard
          label="MTD Output Tokens"
          value={formatTokens(data.outputTokens)}
          delta={{ value: data.outputDelta }}
          hint="vs last month"
          icon="logout"
          tone="output"
          accent
        />
      </div>

      {/* Trend (8) + Budget panel (4) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card
          title="Daily Token & Cost Trend"
          description="Last 30 days · Input vs Output"
          className="lg:col-span-8"
        >
          <DualTrendChart data={data.trend} />
        </Card>

        <Card title="Budget Consumption" className="lg:col-span-4">
          <div className="flex flex-col gap-5">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="font-display text-h2 text-on-surface">
                  {formatCurrency(data.costThisMonth, currency)}
                </span>
                <span className="font-mono text-data text-text-muted">
                  / {formatCurrency(data.budgetAmount, currency)}
                </span>
              </div>
              <p className="mt-1 font-mono text-caps text-text-muted">
                Organization · Monthly
              </p>
            </div>

            <BudgetBar
              spend={data.costThisMonth}
              budget={data.budgetAmount}
              segmented
              showLabel={false}
            />

            <div className="grid grid-cols-3 gap-3 border-t border-border-subtle/60 pt-4 text-center">
              <div>
                <p className="font-mono text-caps text-text-muted">Used</p>
                <p className="font-display text-body-lg text-on-surface">
                  {data.budgetPct.toFixed(0)}%
                </p>
              </div>
              <div>
                <p className="font-mono text-caps text-text-muted">Day</p>
                <p className="font-display text-body-lg text-on-surface">
                  {new Date().getDate()}/{daysInMonth()}
                </p>
              </div>
              <div>
                <p className="font-mono text-caps text-text-muted">Events</p>
                <p className="font-display text-body-lg text-on-surface">
                  {data.eventCountThisMonth.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-status-warning/30 bg-status-warning/5 p-3">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] text-status-warning">
                  notifications_active
                </span>
                <p className="font-sans text-[12px] text-text-muted">
                  Thresholds: <span className="text-status-normal">50%</span> /{" "}
                  <span className="text-status-warning">80%</span> /{" "}
                  <span className="text-status-exceeded">100%</span>
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Top breakdowns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Top Models"
          description="By estimated cost this month"
          noPadding
        >
          <DataTable
            rowKey={(r) => r.name + r.provider}
            columns={[
              {
                key: "model",
                header: "Model",
                cell: (r) => (
                  <div className="flex items-center gap-2">
                    <ProviderTag name={r.provider} />
                    <span>{r.name}</span>
                  </div>
                ),
              },
              {
                key: "tokens",
                header: "Tokens",
                align: "right",
                cell: (r) => formatTokens(r.tokens),
              },
              {
                key: "cost",
                header: "Cost",
                align: "right",
                cell: (r) => (
                  <span className="text-on-surface">
                    {formatCurrency(r.cost, currency)}
                  </span>
                ),
              },
            ]}
            rows={data.topModels}
          />
        </Card>

        <Card
          title="Top Projects"
          description="By estimated cost this month"
          noPadding
        >
          <DataTable
            rowKey={(r) => r.name}
            columns={[
              { key: "project", header: "Project", cell: (r) => r.name },
              {
                key: "tokens",
                header: "Tokens",
                align: "right",
                cell: (r) => formatTokens(r.tokens),
              },
              {
                key: "cost",
                header: "Cost",
                align: "right",
                cell: (r) => (
                  <span className="text-on-surface">
                    {formatCurrency(r.cost, currency)}
                  </span>
                ),
              },
            ]}
            rows={data.topProjects}
          />
        </Card>
      </div>
    </div>
  );
}
