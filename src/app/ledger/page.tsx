import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { DataTable, type Column } from "@/components/DataTable";
import { ProviderTag } from "@/components/ProviderChip";
import {
  formatCurrency,
  formatDateTime,
  formatEventCurrency,
  formatNumber,
  formatRelativeTime,
  toNumber,
} from "@/lib/format";
import { liveUsageWhere } from "@/lib/auth";
import { classifyMeteringPath, meteringPathToneClasses } from "@/lib/provider-capabilities";
import { getRealtimeSignals } from "@/lib/realtime-metering";

export const dynamic = "force-dynamic";

type SearchParams = {
  from?: string;
  to?: string;
  providerId?: string;
  modelId?: string;
  integrationId?: string;
  projectId?: string;
  teamId?: string;
  page?: string;
  pageSize?: string;
};

const DEFAULT_PAGE_SIZE = 100;
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const;

type VerificationFlashState = {
  kind: "guided-test";
  provider: string;
  ok: boolean;
  message: string;
  requestId?: string;
  model?: string;
  timestamp: string;
};

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const requestedPageSize = Number(sp.pageSize ?? DEFAULT_PAGE_SIZE);
  const pageSize = PAGE_SIZE_OPTIONS.includes(requestedPageSize as (typeof PAGE_SIZE_OPTIONS)[number])
    ? requestedPageSize
    : DEFAULT_PAGE_SIZE;
  const requestedPage = Math.max(1, Number(sp.page ?? 1) || 1);

  const org = await prisma.organization.findFirst();
  if (!org) {
    return (
      <div>
        <PageHeader title="Token Ledger" />
        <Card>
          <p className="text-body-md text-text-muted">No data. Run the seed script first.</p>
        </Card>
      </div>
    );
  }

  const where: Prisma.UsageEventWhereInput = { organizationId: org.id };
  if (sp.from) where.timestamp = { ...(where.timestamp as object), gte: new Date(sp.from) };
  if (sp.to) where.timestamp = { ...(where.timestamp as object), lte: new Date(sp.to) };
  if (sp.providerId) where.providerId = sp.providerId;
  if (sp.modelId) where.modelId = sp.modelId;
  if (sp.integrationId) where.integrationId = sp.integrationId;
  if (sp.projectId) where.projectId = sp.projectId;
  if (sp.teamId) where.teamId = sp.teamId;

  const hasActiveFilters = Boolean(
    sp.from ||
      sp.to ||
      sp.providerId ||
      sp.modelId ||
      sp.integrationId ||
      sp.projectId ||
      sp.teamId
  );

  const baseExportParams = new URLSearchParams();
  if (sp.from) baseExportParams.set("from", sp.from);
  if (sp.to) baseExportParams.set("to", sp.to);
  if (sp.providerId) baseExportParams.set("providerId", sp.providerId);
  if (sp.modelId) baseExportParams.set("modelId", sp.modelId);
  if (sp.integrationId) baseExportParams.set("integrationId", sp.integrationId);
  if (sp.projectId) baseExportParams.set("projectId", sp.projectId);
  if (sp.teamId) baseExportParams.set("teamId", sp.teamId);
  baseExportParams.set("pageSize", String(pageSize));

  const csvParams = new URLSearchParams(baseExportParams);
  csvParams.set("format", "csv");
  const pdfParams = new URLSearchParams(baseExportParams);
  pdfParams.set("format", "pdf");
  const csvExportHref = `/api/ledger/export${csvParams.size ? `?${csvParams.toString()}` : ""}`;
  const pdfExportHref = `/api/ledger/export${pdfParams.size ? `?${pdfParams.toString()}` : ""}`;

  const [total, totals, providers, models, integrations, projects, teams, latestLiveEvent] =
    await Promise.all([
      prisma.usageEvent.count({ where }),
      prisma.usageEvent.aggregate({
        where,
        _sum: {
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          estimatedTotalCost: true,
        },
      }),
      prisma.provider.findMany({ orderBy: { name: "asc" } }),
      prisma.model.findMany({ orderBy: { name: "asc" } }),
      prisma.integration.findMany({
        where: { organizationId: org.id, active: true },
        orderBy: { name: "asc" },
      }),
      prisma.project.findMany({
        where: { organizationId: org.id },
        orderBy: { name: "asc" },
      }),
      prisma.team.findMany({
        where: { organizationId: org.id },
        orderBy: { name: "asc" },
      }),
      prisma.usageEvent.findFirst({
        where: {
          organizationId: org.id,
          ...liveUsageWhere(),
        },
        orderBy: { timestamp: "desc" },
        include: {
          provider: { select: { name: true } },
          model: { select: { name: true } },
        },
      }),
    ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageOffset = (currentPage - 1) * pageSize;

  const events = await prisma.usageEvent.findMany({
    where,
    orderBy: { timestamp: "desc" },
    skip: pageOffset,
    take: pageSize,
    include: {
      provider: { select: { name: true } },
      model: { select: { name: true } },
      integration: { select: { name: true } },
      project: { select: { name: true } },
      team: { select: { name: true } },
    },
  });

  const verificationRaw = cookies().get("verification-flash")?.value;
  let verification: VerificationFlashState | null = null;
  if (verificationRaw) {
    try {
      verification = JSON.parse(verificationRaw) as VerificationFlashState;
    } catch {
      verification = null;
    }
  }

  type Row = (typeof events)[number];

  const totalInputTokens = toNumber(totals._sum.inputTokens);
  const totalOutputTokens = toNumber(totals._sum.outputTokens);
  const totalTokens = toNumber(totals._sum.totalTokens);
  const totalCost = toNumber(totals._sum.estimatedTotalCost);
  const averageCostPerEvent = total > 0 ? totalCost / total : 0;

  const columns: Column<Row>[] = [
    {
      key: "ts",
      header: "Timestamp",
      cell: (row) => (
        <span className="font-mono text-data text-text-muted">
          {formatDateTime(row.timestamp)}
        </span>
      ),
    },
    {
      key: "provider",
      header: "Provider",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <ProviderTag name={row.provider.name} />
          <span>{row.provider.name}</span>
        </div>
      ),
    },
    {
      key: "model",
      header: "Model",
      cell: (row) => (
        <span className="font-mono text-data text-on-surface">{row.model.name}</span>
      ),
    },
    {
      key: "integration",
      header: "Integration",
      cell: (row) => (
        <div>
          <div className="font-medium text-on-surface">{row.integration?.name ?? "-"}</div>
          <div className="font-mono text-[11px] text-text-muted">{row.source ?? "-"}</div>
        </div>
      ),
    },
    {
      key: "metering",
      header: "Metering",
      cell: (row) => {
        const metadata =
          row.metadataJson && typeof row.metadataJson === "object"
            ? (row.metadataJson as Record<string, unknown>)
            : null;
        const path = classifyMeteringPath(
          row.source,
          metadata,
        );
        const realtimeSignals = getRealtimeSignals(row.provider.name, metadata);

        return (
          <div className="space-y-1">
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meteringPathToneClasses(path)}`}
            >
              {path.label}
            </span>
            <div className="max-w-[220px] text-[11px] text-text-muted">{path.detail}</div>
            {realtimeSignals.length > 0 && (
              <div className="flex max-w-[220px] flex-wrap gap-1 pt-1">
                {realtimeSignals.map((signal) => (
                  <span
                    key={`${row.id}-${signal.label}`}
                    className="inline-flex rounded-full border border-border-subtle bg-background px-2 py-0.5 text-[10px] font-medium text-text-muted"
                  >
                    {signal.label}: {signal.value}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      },
    },
    { key: "project", header: "Project", cell: (row) => row.project?.name ?? "-" },
    { key: "team", header: "Team", cell: (row) => row.team?.name ?? "-" },
    {
      key: "agent",
      header: "Agent / Workflow",
      cell: (row) => (
        <span className="font-mono text-data text-text-muted">
          {row.agentName ?? "-"} · {row.workflowName ?? "-"}
        </span>
      ),
    },
    {
      key: "input",
      header: "Input",
      align: "right",
      cell: (row) => <span className="text-input-token">{formatNumber(row.inputTokens)}</span>,
    },
    {
      key: "output",
      header: "Output",
      align: "right",
      cell: (row) => <span className="text-output-token">{formatNumber(row.outputTokens)}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: (row) => <span className="font-semibold">{formatNumber(row.totalTokens)}</span>,
    },
    {
      key: "cost",
      header: "Est. Cost",
      align: "right",
      cell: (row) => formatEventCurrency(toNumber(row.estimatedTotalCost), org.currency),
    },
    {
      key: "owner",
      header: "Owner",
      cell: (row) => (
        <span className="font-mono text-data text-text-muted">{row.requestOwner ?? "-"}</span>
      ),
    },
  ];

  return (
    <div className="space-y-section-gap">
      <PageHeader
        title="Token Ledger"
        description={`${total.toLocaleString()} usage events. Page ${currentPage} of ${totalPages}, showing ${events.length} matching rows.`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={csvExportHref}
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-2 font-display text-body-md text-on-surface transition-colors hover:border-primary-container/40 hover:text-primary-container"
            >
              <span className="material-symbols-outlined text-[18px]">table_view</span>
              Export CSV
            </a>
            <a
              href={pdfExportHref}
              className="inline-flex items-center gap-2 rounded-lg border border-primary-container/40 bg-primary-container/10 px-4 py-2 font-display text-body-md font-semibold text-primary-container transition-colors hover:bg-primary-container/20"
            >
              <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
              Export PDF
            </a>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={hasActiveFilters ? "Filtered spend" : "Visible spend"}
          value={formatCurrency(totalCost, org.currency)}
          hint={hasActiveFilters ? "updates with current filters" : "latest matching live usage"}
          icon="payments"
          tone="success"
          accent
        />
        <KpiCard
          label={hasActiveFilters ? "Filtered total tokens" : "Visible total tokens"}
          value={formatNumber(totalTokens)}
          hint={`${formatNumber(totalInputTokens)} in · ${formatNumber(totalOutputTokens)} out`}
          icon="token"
          tone="input"
          accent
        />
        <KpiCard
          label="Matching events"
          value={formatNumber(total)}
          hint={hasActiveFilters ? "current filter result size" : "all rows in this ledger view"}
          icon="bolt"
          tone="output"
          accent
        />
        <KpiCard
          label="Average cost / event"
          value={formatCurrency(averageCostPerEvent, org.currency)}
          hint="quick sanity check after each rollout"
          icon="insights"
          tone="default"
        />
      </div>

      {(verification || latestLiveEvent) && (
        <div
          className={`rounded-lg border px-4 py-3 ${
            verification?.ok || latestLiveEvent
              ? "border-status-normal/40 bg-status-normal/10"
              : "border-status-warning/40 bg-status-warning/10"
          }`}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              {verification && (
                <p className="text-sm text-on-surface">
                  <strong>{verification.provider} guided test:</strong> {verification.message}
                </p>
              )}
              {latestLiveEvent && (
                <p className="text-[12px] text-text-muted">
                  Latest live ledger event: {latestLiveEvent.provider.name} /{" "}
                  {latestLiveEvent.model.name} at {formatDateTime(latestLiveEvent.timestamp)} (
                  {formatRelativeTime(latestLiveEvent.timestamp)}).
                  {verification?.requestId ? ` Request ID to watch for: ${verification.requestId}.` : ""}
                </p>
              )}
              {!verification && !latestLiveEvent && (
                <p className="text-[12px] text-text-muted">No recent live gateway event yet.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="/ledger"
                className="rounded-lg border border-border-subtle px-3 py-2 text-xs font-semibold text-on-surface hover:border-primary hover:text-primary"
              >
                Clear filters
              </a>
              <Link
                href="/gateway"
                className="rounded-lg border border-border-subtle px-3 py-2 text-xs font-semibold text-on-surface hover:border-primary hover:text-primary"
              >
                Open Gateway
              </Link>
            </div>
          </div>
        </div>
      )}

      <Card title="Filters">
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-8">
          <Field label="From">
            <input type="date" name="from" defaultValue={sp.from ?? ""} className={inputCls} />
          </Field>
          <Field label="To">
            <input type="date" name="to" defaultValue={sp.to ?? ""} className={inputCls} />
          </Field>
          <Field label="Provider">
            <select name="providerId" defaultValue={sp.providerId ?? ""} className={inputCls}>
              <option value="">All</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Model">
            <select name="modelId" defaultValue={sp.modelId ?? ""} className={inputCls}>
              <option value="">All</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Integration">
            <select name="integrationId" defaultValue={sp.integrationId ?? ""} className={inputCls}>
              <option value="">All</option>
              {integrations.map((integration) => (
                <option key={integration.id} value={integration.id}>
                  {integration.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project">
            <select name="projectId" defaultValue={sp.projectId ?? ""} className={inputCls}>
              <option value="">All</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Team">
            <select name="teamId" defaultValue={sp.teamId ?? ""} className={inputCls}>
              <option value="">All</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Page size">
            <select name="pageSize" defaultValue={String(pageSize)} className={inputCls}>
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} rows
                </option>
              ))}
            </select>
          </Field>
          <input type="hidden" name="page" value="1" />
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-8">
            <button
              type="submit"
              className="rounded-lg bg-primary-container px-4 py-2 font-display text-body-md font-semibold text-on-primary transition-colors hover:bg-primary"
            >
              Apply Filters
            </button>
            <a
              href="/ledger"
              className="rounded-lg border border-border-subtle px-4 py-2 font-display text-body-md text-text-muted hover:bg-surface-elevated"
            >
              Reset
            </a>
          </div>
        </form>
      </Card>

      <Card noPadding>
        <DataTable
          columns={columns}
          rows={events}
          rowKey={(row) => row.id}
          empty="No usage events match your filters."
        />
      </Card>

      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-text-muted">
            Showing rows{" "}
            <span className="font-semibold text-on-surface">
              {total === 0 ? 0 : pageOffset + 1}-{Math.min(pageOffset + events.length, total)}
            </span>{" "}
            of <span className="font-semibold text-on-surface">{total.toLocaleString()}</span>.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PagerLink
              disabled={currentPage <= 1}
              href={buildLedgerHref(sp, { page: String(currentPage - 1), pageSize: String(pageSize) })}
            >
              Previous
            </PagerLink>
            <div className="rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-sm font-semibold text-on-surface">
              Page {currentPage} / {totalPages}
            </div>
            <PagerLink
              disabled={currentPage >= totalPages}
              href={buildLedgerHref(sp, { page: String(currentPage + 1), pageSize: String(pageSize) })}
            >
              Next
            </PagerLink>
          </div>
        </div>
      </Card>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 font-sans text-body-md text-on-surface outline-none transition-colors focus:border-primary-container focus:ring-1 focus:ring-primary-container";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-caps text-text-muted">{label}</span>
      {children}
    </label>
  );
}

function buildLedgerHref(
  searchParams: SearchParams,
  overrides: Partial<Record<keyof SearchParams, string>>
) {
  const params = new URLSearchParams();
  const merged: SearchParams = { ...searchParams, ...overrides };

  (Object.entries(merged) as Array<[keyof SearchParams, string | undefined]>).forEach(
    ([key, value]) => {
      if (value) params.set(key, value);
    }
  );

  const query = params.toString();
  return query ? `/ledger?${query}` : "/ledger";
}

function PagerLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold text-text-muted opacity-60">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold text-on-surface transition-colors hover:border-primary hover:text-primary"
    >
      {children}
    </Link>
  );
}


