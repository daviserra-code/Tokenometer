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
import {
  getReconciliationSnapshot,
  reconciliationToneClasses,
  summarizeReconciliation,
} from "@/lib/reconciliation";
import { summarizeRealtimeProviders } from "@/lib/realtime-metering";

export const dynamic = "force-dynamic";

type Row = { name: string; subname?: string; tokens: number; cost: number };
type Period = "daily" | "weekly" | "monthly";
type ReportsSearchParams = {
  period?: string;
  providerId?: string;
  projectId?: string;
  teamId?: string;
  integrationId?: string;
};
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
  searchParams?: ReportsSearchParams;
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
  const scopeParams = new URLSearchParams();
  if (searchParams?.providerId) scopeParams.set("providerId", searchParams.providerId);
  if (searchParams?.projectId) scopeParams.set("projectId", searchParams.projectId);
  if (searchParams?.teamId) scopeParams.set("teamId", searchParams.teamId);
  if (searchParams?.integrationId) scopeParams.set("integrationId", searchParams.integrationId);
  const scopedQuery = scopeParams.toString();
  const csvReportHref = `/api/reports/export?period=${period}&mode=${mode}&format=csv${scopedQuery ? `&${scopedQuery}` : ""}`;
  const pdfReportHref = `/api/reports/export?period=${period}&mode=${mode}&format=pdf${scopedQuery ? `&${scopedQuery}` : ""}`;
  const where = {
    organizationId: org.id,
    ...modeUsageWhere(mode),
    timestamp: { gte: periodStart },
    ...(searchParams?.providerId ? { providerId: searchParams.providerId } : {}),
    ...(searchParams?.projectId ? { projectId: searchParams.projectId } : {}),
    ...(searchParams?.teamId ? { teamId: searchParams.teamId } : {}),
    ...(searchParams?.integrationId ? { integrationId: searchParams.integrationId } : {}),
  };

  const [
    byProvider,
    byModel,
    byProject,
    byTeam,
    byIntegration,
    totals,
    models,
    projects,
    teams,
    integrations,
    providers,
    latestLiveEvent,
    reconciliation,
    realtimeEvents,
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
    prisma.usageEvent.groupBy({
      by: ["integrationId"],
      where: { ...where, integrationId: { not: null } },
      _sum: { totalTokens: true, estimatedTotalCost: true },
    }),
    prisma.usageEvent.aggregate({
      where,
      _sum: { totalTokens: true, estimatedTotalCost: true },
      _count: true,
    }),
    prisma.model.findMany({ include: { provider: true } }),
    prisma.project.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }),
    prisma.integration.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }),
    prisma.provider.findMany({ orderBy: { name: "asc" } }),
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
    getReconciliationSnapshot(org.id, period === "daily" ? 1 : period === "weekly" ? 7 : 30),
    prisma.usageEvent.findMany({
      where: {
        ...where,
        provider: {
          name: {
            in: ["Google", "Anthropic"],
          },
        },
      },
      orderBy: { timestamp: "desc" },
      take: 500,
      include: {
        provider: { select: { name: true } },
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
  const integrationMap = new Map(integrations.map((i) => [i.id, i.name]));

  const totalCost = toNumber(totals._sum.estimatedTotalCost);
  const totalTokens = toNumber(totals._sum.totalTokens);

  const providerRows: Row[] = byProvider
    .map((g) => ({
      name: providerMap.get(g.providerId) ?? "-",
      tokens: toNumber(g._sum.totalTokens),
      cost: toNumber(g._sum.estimatedTotalCost),
    }))
    .sort((a, b) => b.cost - a.cost);

  const modelRows: Row[] = byModel
    .map((g) => {
      const m = modelMap.get(g.modelId);
      return {
        name: m?.name ?? "-",
        subname: m?.provider,
        tokens: toNumber(g._sum.totalTokens),
        cost: toNumber(g._sum.estimatedTotalCost),
      };
    })
    .sort((a, b) => b.cost - a.cost);

  const projectRows: Row[] = byProject
    .map((g) => ({
      name: projectMap.get(g.projectId!) ?? "-",
      tokens: toNumber(g._sum.totalTokens),
      cost: toNumber(g._sum.estimatedTotalCost),
    }))
    .sort((a, b) => b.cost - a.cost);

  const teamRows: Row[] = byTeam
    .map((g) => ({
      name: teamMap.get(g.teamId!) ?? "-",
      tokens: toNumber(g._sum.totalTokens),
      cost: toNumber(g._sum.estimatedTotalCost),
    }))
    .sort((a, b) => b.cost - a.cost);

  const integrationRows: Row[] = byIntegration
    .map((g) => ({
      name: integrationMap.get(g.integrationId!) ?? "-",
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
          {totalCost > 0 ? `${((r.cost / totalCost) * 100).toFixed(1)}%` : "-"}
        </span>
      ),
    },
  ];

  const latestLiveInPeriod = latestLiveEvent ? latestLiveEvent.timestamp >= periodStart : false;
  const reconciliationSummary = summarizeReconciliation(reconciliation);
  const reconciliationRows = reconciliation.rows.slice(0, 4);
  const realtimeProviderRows = summarizeRealtimeProviders(realtimeEvents);
  const selectedProvider = providers.find((provider) => provider.id === searchParams?.providerId) ?? null;
  const selectedProject = projects.find((project) => project.id === searchParams?.projectId) ?? null;
  const selectedTeam = teams.find((team) => team.id === searchParams?.teamId) ?? null;
  const selectedIntegration =
    integrations.find((integration) => integration.id === searchParams?.integrationId) ?? null;
  const scopeParts = [
    selectedProvider ? `Provider: ${selectedProvider.name}` : null,
    selectedProject ? `Project: ${selectedProject.name}` : null,
    selectedTeam ? `Team: ${selectedTeam.name}` : null,
    selectedIntegration ? `Integration: ${selectedIntegration.name}` : null,
  ].filter(Boolean) as string[];
  const scopeLabel = scopeParts.length ? scopeParts.join(" | ") : "Whole organization";

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
            <ModeSwitch mode={mode} admin={admin} compact redirectTo={`/reports?period=${period}${scopedQuery ? `&${scopedQuery}` : ""}`} />
            {scopeParts.length > 0 && (
              <span className="rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-[12px] font-medium text-text-muted">
                {scopeLabel}
              </span>
            )}
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

      <Card
        title="Report scope"
        description="Keep the same spend view, export, and reconciliation window while narrowing it to one provider, project, team, or named integration."
      >
        <form method="get" className="grid grid-cols-1 gap-4 lg:grid-cols-[repeat(4,minmax(0,1fr)),auto,auto]">
          <input type="hidden" name="period" value={period} />
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-text-muted">Provider</span>
            <select
              name="providerId"
              defaultValue={searchParams?.providerId ?? ""}
              className="w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-on-surface focus:border-primary focus:outline-none"
            >
              <option value="">All</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-text-muted">Project</span>
            <select
              name="projectId"
              defaultValue={searchParams?.projectId ?? ""}
              className="w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-on-surface focus:border-primary focus:outline-none"
            >
              <option value="">All</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-text-muted">Team</span>
            <select
              name="teamId"
              defaultValue={searchParams?.teamId ?? ""}
              className="w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-on-surface focus:border-primary focus:outline-none"
            >
              <option value="">All</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-text-muted">Integration</span>
            <select
              name="integrationId"
              defaultValue={searchParams?.integrationId ?? ""}
              className="w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-on-surface focus:border-primary focus:outline-none"
            >
              <option value="">All</option>
              {integrations.map((integration) => (
                <option key={integration.id} value={integration.id}>
                  {integration.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 font-display text-body-md font-semibold text-slate-900 transition-colors hover:bg-primary-container"
            >
              Apply
            </button>
            <a
              href={`/reports?period=${period}`}
              className="rounded-lg border border-border-subtle px-4 py-2 font-display text-body-md text-text-muted transition-colors hover:border-primary-container/40 hover:text-primary-container"
            >
              Reset
            </a>
          </div>
        </form>

        <div className="mt-4 rounded-lg border border-border-subtle bg-background p-4 text-sm text-text-muted">
          <strong className="text-on-surface">Current scope:</strong> {scopeLabel}. Exports, KPIs, reconciliation, and the breakdown tables below all follow this same filter set.
        </div>
      </Card>

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

      <Card
        title="Reconciliation"
        description="This adds confidence context to spend. Live metering stays primary; provider history is compared when it exists."
      >
        <div
          className={`rounded-lg border px-4 py-3 ${
            reconciliationSummary.tone === "success"
              ? "border-status-normal/40 bg-status-normal/10"
              : reconciliationSummary.tone === "warning"
                ? "border-status-warning/40 bg-status-warning/10"
                : reconciliationSummary.tone === "danger"
                  ? "border-status-exceeded/40 bg-status-exceeded/10"
                  : "border-border-subtle bg-background"
          }`}
        >
          <p className="text-sm text-on-surface">
            <strong>{reconciliationSummary.title}.</strong> {reconciliationSummary.body}
          </p>
          <p className="mt-1 text-[12px] text-text-muted">
            Window starts {formatDateTime(reconciliation.since)}. Missing provider history often just means the provider is being treated as live-only or no sync/import has been run for this period.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <KpiCard label="In range" value={String(reconciliation.counts.matched)} hint="live and provider history broadly agree" icon="sync" tone="success" />
          <KpiCard label="Drift" value={String(reconciliation.counts.drift)} hint="needs finance review" icon="compare_arrows" tone="warning" />
          <KpiCard label="Live only" value={String(reconciliation.counts.live_only)} hint="normal for live-first providers" icon="bolt" tone="input" />
          <KpiCard label="History only" value={String(reconciliation.counts.history_only)} hint="check missing live traffic" icon="history" tone="danger" />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[12px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Provider</th>
                <th className="px-4 py-3 text-left">Live</th>
                <th className="px-4 py-3 text-left">Provider history</th>
                <th className="px-4 py-3 text-left">Drift</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {reconciliationRows.map((row) => (
                <tr key={row.providerId}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-on-surface">{row.provider}</div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    <div>{formatCurrency(row.liveCost, org.currency)}</div>
                    <div className="text-[12px]">{formatTokens(row.liveTokens)}</div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    <div>{formatCurrency(row.providerHistoryCost, org.currency)}</div>
                    <div className="text-[12px]">{formatTokens(row.providerHistoryTokens)}</div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {row.comparable ? (
                      <>
                        <div>
                          {row.deltaCost >= 0 ? "+" : "-"}
                          {formatCurrency(Math.abs(row.deltaCost), org.currency)}
                        </div>
                        <div className="text-[12px]">
                          {row.deltaPct === null ? "n/a" : `${row.deltaPct.toFixed(1)}%`}
                        </div>
                      </>
                    ) : (
                      "n/a"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        reconciliationToneClasses(row.status),
                      ].join(" ")}
                    >
                      {row.label}
                    </span>
                  </td>
                </tr>
              ))}
              {reconciliationRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-text-muted">
                    No reconciliation rows yet for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Live metering detail"
        description="Provider-specific realtime signals for Gemini and Anthropic in the current window."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[12px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Provider</th>
                <th className="px-4 py-3 text-left">Calls</th>
                <th className="px-4 py-3 text-left">Streamed</th>
                <th className="px-4 py-3 text-left">Realtime signals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {realtimeProviderRows.map((row) => (
                <tr key={row.provider}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ProviderTag name={row.provider} />
                      <span className="font-semibold text-on-surface">{row.provider}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{row.calls.toLocaleString()}</td>
                  <td className="px-4 py-3 text-text-muted">{row.streamedCalls.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {row.signals.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {row.signals.map((signal) => (
                          <span
                            key={`${row.provider}-${signal.label}`}
                            className="inline-flex rounded-full border border-border-subtle bg-background px-2 py-0.5 text-[11px] font-medium text-text-muted"
                          >
                            {signal.label}: {signal.value}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text-muted">No provider-specific realtime signals yet.</span>
                    )}
                  </td>
                </tr>
              ))}
              {realtimeProviderRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-text-muted">
                    No Gemini or Anthropic live detail in this period yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="inline-flex rounded-lg border border-border-subtle bg-surface-elevated/70 p-1 text-[12px] font-semibold">
            {(["daily", "weekly", "monthly"] as const).map((p) => (
          <a
            key={p}
            href={`/reports?period=${p}${scopedQuery ? `&${scopedQuery}` : ""}`}
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

      <Card
        title="Cost interpretation"
        description="A quick note so row-level exports and period totals tell the same story."
      >
        <div className="rounded-lg border border-border-subtle bg-background p-4 text-sm text-text-muted">
          Period totals are summed from the full underlying event costs. In ledger exports, very small per-event costs can appear as <span className="font-mono text-on-surface">&lt;$0.01</span> even when the total period spend is materially higher.
        </div>
      </Card>

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

      <Card title="Cost by integration" noPadding>
        <DataTable columns={cols} rows={integrationRows} rowKey={(r) => r.name} />
      </Card>
    </div>
  );
}

