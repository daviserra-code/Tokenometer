import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { DataTable, type Column } from "@/components/DataTable";
import { HBarChart } from "@/components/charts/HBarChart";
import { ProviderTag } from "@/components/ProviderChip";
import { ModeSwitch } from "@/components/ModeSwitch";
import { formatCurrency, formatDateTime, formatRelativeTime, formatTokens, toNumber } from "@/lib/format";
import { startOfMonth } from "@/lib/calc";
import { getAppMode, isAdmin, liveUsageWhere, modeUsageWhere } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Row = { name: string; subname?: string; tokens: number; cost: number };
type Period = "daily" | "weekly" | "monthly";
type VerificationFlashState = {
  kind: "guided-test";
  provider: string;
  ok: boolean;
  message: string;
  requestId?: string;
  model?: string;
  timestamp: string;
};

function getPeriod(value?: string): Period {
  return value === "daily" || value === "weekly" || value === "monthly"
    ? value
    : "monthly";
}

function getPeriodStart(period: Period) {
  const now = new Date();
  if (period === "daily") return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (period === "weekly") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return startOfMonth(now);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: { period?: string };
}) {
  const org = await prisma.organization.findFirst();
  if (!org) {
    return (
      <div>
        <PageHeader title="Usage Trends" />
        <Card>
          <p className="text-body-md text-text-muted">No data. Run the seed script first.</p>
        </Card>
      </div>
    );
  }

  const mode = getAppMode();
  const admin = isAdmin();
  const period = getPeriod(searchParams?.period);
  const periodStart = getPeriodStart(period);
  const periodLabel =
    period === "daily" ? "last 24 hours" : period === "weekly" ? "last 7 days" : "current month";
  const kpiSuffix = period === "monthly" ? "MTD" : period === "weekly" ? "7D" : "24H";
  const csvReportHref = `/api/reports/export?period=${period}&mode=${mode}&format=csv`;
  const pdfReportHref = `/api/reports/export?period=${period}&mode=${mode}&format=pdf`;
  const where = {
    organizationId: org.id,
    ...modeUsageWhere(mode),
    timestamp: { gte: periodStart },
  };

  const [
    byProvider,
    byModel,
    byProject,
    byTeam,
    totals,
    models,
    projects,
    teams,
    providers,
    latestLiveEvent,
  ] = await Promise.all([
    prisma.usageEvent.groupBy({
      by: ["providerId"],
      where,
      _sum: { totalTokens: true, estimatedTotalCost: true },
    }),
    prisma.usageEvent.groupBy({
      by: ["modelId"],
      where,
      _sum: { totalTokens: true, estimatedTotalCost: true },
    }),
    prisma.usageEvent.groupBy({
      by: ["projectId"],
      where: { ...where, projectId: { not: null } },
      _sum: { totalTokens: true, estimatedTotalCost: true },
    }),
    prisma.usageEvent.groupBy({
      by: ["teamId"],
      where: { ...where, teamId: { not: null } },
      _sum: { totalTokens: true, estimatedTotalCost: true },
    }),
    prisma.usageEvent.aggregate({
      where,
      _sum: { totalTokens: true, estimatedTotalCost: true },
      _count: true,
    }),
    prisma.model.findMany({ include: { provider: true } }),
    prisma.project.findMany({ where: { organizationId: org.id } }),
    prisma.team.findMany({ where: { organizationId: org.id } }),
    prisma.provider.findMany(),
    prisma.usageEvent.findFirst({
      where: {
        organizationId: org.id,
        ...liveUsageWhere(),
      },
      orderBy: { timestamp: "desc" },
      include: {
        provider: true,
        model: true,
      },
    }),
  ]);

  const verificationRaw = cookies().get("verification-flash")?.value;
  let verification: VerificationFlashState | null = null;
  if (verificationRaw) {
    try {
      verification = JSON.parse(verificationRaw) as VerificationFlashState;
    } catch {
      verification = null;
    }
  }

  const providerMap = new Map(providers.map((p) => [p.id, p.name]));
  const modelMap = new Map(
    models.map((m) => [m.id, { name: m.name, provider: m.provider.name }])
  );
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  const totalCost = toNumber(totals._sum.estimatedTotalCost);
  const totalTokens = toNumber(totals._sum.totalTokens);

  const providerRows: Row[] = byProvider
    .map((g) => ({
      name: providerMap.get(g.providerId) ?? "—",
      tokens: toNumber(g._sum.totalTokens),
      cost: toNumber(g._sum.estimatedTotalCost),
    }))
    .sort((a, b) => b.cost - a.cost);

  const modelRows: Row[] = byModel
    .map((g) => {
      const m = modelMap.get(g.modelId);
      return {
        name: m?.name ?? "—",
        subname: m?.provider,
        tokens: toNumber(g._sum.totalTokens),
        cost: toNumber(g._sum.estimatedTotalCost),
      };
    })
    .sort((a, b) => b.cost - a.cost);

  const projectRows: Row[] = byProject
    .map((g) => ({
      name: projectMap.get(g.projectId!) ?? "—",
      tokens: toNumber(g._sum.totalTokens),
      cost: toNumber(g._sum.estimatedTotalCost),
    }))
    .sort((a, b) => b.cost - a.cost);

  const teamRows: Row[] = byTeam
    .map((g) => ({
      name: teamMap.get(g.teamId!) ?? "—",
      tokens: toNumber(g._sum.totalTokens),
      cost: toNumber(g._sum.estimatedTotalCost),
    }))
    .sort((a, b) => b.cost - a.cost);

  const cols: Column<Row>[] = [
    {
      key: "name",
      header: "Name",
      cell: (r) => (
        <div className="flex items-center gap-2">
          {r.subname && <ProviderTag name={r.subname} />}
          <div>
            <div className="font-display text-body-md font-semibold text-on-surface">
              {r.name}
            </div>
            {r.subname && (
              <div className="font-mono text-[11px] text-text-muted">
                {r.subname}
              </div>
            )}
          </div>
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
      cell: (r) => formatCurrency(r.cost, org.currency),
    },
    {
      key: "share",
      header: "Share",
      align: "right",
      cell: (r) => (
        <span className="text-primary-container">
          {totalCost > 0 ? `${((r.cost / totalCost) * 100).toFixed(1)}%` : "—"}
        </span>
      ),
    },
  ];

  const latestLiveInPeriod = latestLiveEvent ? latestLiveEvent.timestamp >= periodStart : false;

  return (
    <div className="space-y-section-gap">
      <PageHeader
        title="Spend"
        description={`Cost breakdown for ${periodLabel}. ${
          mode === "live"
            ? "Live mode includes only real synced/imported/proxied usage."
            : "Demo mode uses the seeded MVP dataset."
        }`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <ModeSwitch mode={mode} admin={admin} compact redirectTo={`/reports?period=${period}`} />
            <a
              href={csvReportHref}
              download
              className="inline-flex items-center gap-2 rounded-lg border border-primary-container/40 bg-primary-container/10 px-4 py-2 font-display text-body-md font-semibold text-primary-container transition-colors hover:bg-primary-container/20"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Download CSV report
            </a>
            <a
              href={pdfReportHref}
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-2 font-display text-body-md text-on-surface transition-colors hover:border-primary-container/40 hover:text-primary-container"
            >
              <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
              Download PDF report
            </a>
          </div>
        }
      />

      {(verification || latestLiveEvent) && (
        <div
          className={`rounded-lg border px-4 py-3 ${
            mode === "demo"
              ? "border-status-warning/40 bg-status-warning/10"
              : "border-status-normal/40 bg-status-normal/10"
          }`}
        >
          <div className="space-y-1">
            {mode === "demo" ? (
              <p className="text-sm text-on-surface">
                <strong>You are viewing demo mode.</strong>{" "}
                {latestLiveEvent
                  ? `A live request was seen ${formatRelativeTime(latestLiveEvent.timestamp)}. Switch to Live to inspect real spend.`
                  : "Any guided test you run will land in live data, not in the seeded demo view below."}
              </p>
            ) : latestLiveEvent ? (
              <p className="text-sm text-on-surface">
                <strong>Latest live request:</strong> {latestLiveEvent.provider.name} / {latestLiveEvent.model.name} at{" "}
                {formatDateTime(latestLiveEvent.timestamp)} ({formatRelativeTime(latestLiveEvent.timestamp)}).
              </p>
            ) : (
              <p className="text-sm text-on-surface">
                <strong>No live spend yet.</strong> Run a guided provider test or route one real app call through the gateway.
              </p>
            )}
            {verification && (
              <p className="text-[12px] text-text-muted">
                Guided test status: {verification.message}
                {verification.requestId ? ` Request ID: ${verification.requestId}.` : ""}
              </p>
            )}
            {mode === "live" && latestLiveEvent && !latestLiveInPeriod && (
              <p className="text-[12px] text-text-muted">
                The latest live request is outside the current {periodLabel} window, so the totals below may not move until you change period.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="inline-flex rounded-lg border border-border-subtle bg-surface-elevated/70 p-1 text-[12px] font-semibold">
        {(["daily", "weekly", "monthly"] as const).map((p) => (
          <a
            key={p}
            href={`/reports?period=${p}`}
            className={`rounded-md px-3 py-1.5 capitalize transition-colors ${
              period === p
                ? "bg-primary text-on-primary"
                : "text-text-muted hover:text-on-surface"
            }`}
          >
            {p}
          </a>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label={`Total Spend (${kpiSuffix})`}
          value={formatCurrency(totalCost, org.currency)}
          icon="payments"
          tone="success"
          accent
        />
        <KpiCard
          label={`Total Tokens (${kpiSuffix})`}
          value={formatTokens(totalTokens)}
          icon="token"
          tone="input"
          accent
        />
        <KpiCard
          label={`Events (${kpiSuffix})`}
          value={totals._count.toLocaleString()}
          icon="bolt"
          tone="output"
          accent
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Cost by provider" description="Top providers by spend">
          <HBarChart
            data={providerRows.slice(0, 8).map((r) => ({
              name: r.name,
              value: r.cost,
            }))}
          />
        </Card>
        <Card title="Cost by project" description="Top projects by spend">
          <HBarChart
            data={projectRows.slice(0, 8).map((r) => ({
              name: r.name,
              value: r.cost,
            }))}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Cost by model" noPadding>
          <DataTable columns={cols} rows={modelRows} rowKey={(r) => r.name} />
        </Card>
        <Card title="Cost by team" noPadding>
          <DataTable columns={cols} rows={teamRows} rowKey={(r) => r.name} />
        </Card>
      </div>
    </div>
  );
}
