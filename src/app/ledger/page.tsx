import Link from "next/link";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { ProviderTag } from "@/components/ProviderChip";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  toNumber,
} from "@/lib/format";
import { liveUsageWhere } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type SearchParams = {
  from?: string;
  to?: string;
  providerId?: string;
  modelId?: string;
  integrationId?: string;
  projectId?: string;
  teamId?: string;
};

const PAGE_SIZE = 100;

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
  if (sp.from)
    where.timestamp = { ...(where.timestamp as object), gte: new Date(sp.from) };
  if (sp.to)
    where.timestamp = { ...(where.timestamp as object), lte: new Date(sp.to) };
  if (sp.providerId) where.providerId = sp.providerId;
  if (sp.modelId) where.modelId = sp.modelId;
  if (sp.integrationId) where.integrationId = sp.integrationId;
  if (sp.projectId) where.projectId = sp.projectId;
  if (sp.teamId) where.teamId = sp.teamId;

  const exportParams = new URLSearchParams();
  if (sp.from) exportParams.set("from", sp.from);
  if (sp.to) exportParams.set("to", sp.to);
  if (sp.providerId) exportParams.set("providerId", sp.providerId);
  if (sp.modelId) exportParams.set("modelId", sp.modelId);
  if (sp.integrationId) exportParams.set("integrationId", sp.integrationId);
  if (sp.projectId) exportParams.set("projectId", sp.projectId);
  if (sp.teamId) exportParams.set("teamId", sp.teamId);
  const exportHref = `/api/ledger/export${exportParams.size ? `?${exportParams.toString()}` : ""}`;

  const [events, total, providers, models, integrations, projects, teams, latestLiveEvent] = await Promise.all([
    prisma.usageEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: PAGE_SIZE,
      include: {
        provider: { select: { name: true } },
        model: { select: { name: true } },
        integration: { select: { name: true } },
        project: { select: { name: true } },
        team: { select: { name: true } },
      },
    }),
    prisma.usageEvent.count({ where }),
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

  const columns: Column<Row>[] = [
    {
      key: "ts",
      header: "Timestamp",
      cell: (r) => (
        <span className="font-mono text-data text-text-muted">
          {formatDateTime(r.timestamp)}
        </span>
      ),
    },
    {
      key: "provider",
      header: "Provider",
      cell: (r) => (
        <div className="flex items-center gap-2">
          <ProviderTag name={r.provider.name} />
          <span>{r.provider.name}</span>
        </div>
      ),
    },
    {
      key: "model",
      header: "Model",
      cell: (r) => (
        <span className="font-mono text-data text-on-surface">{r.model.name}</span>
      ),
    },
    {
      key: "integration",
      header: "Integration",
      cell: (r) => (
        <div>
          <div className="font-medium text-on-surface">{r.integration?.name ?? "—"}</div>
          <div className="font-mono text-[11px] text-text-muted">{r.source ?? "—"}</div>
        </div>
      ),
    },
    { key: "project", header: "Project", cell: (r) => r.project?.name ?? "—" },
    { key: "team", header: "Team", cell: (r) => r.team?.name ?? "—" },
    {
      key: "agent",
      header: "Agent / Workflow",
      cell: (r) => (
        <span className="font-mono text-data text-text-muted">
          {r.agentName ?? "—"} · {r.workflowName ?? "—"}
        </span>
      ),
    },
    {
      key: "input",
      header: "Input",
      align: "right",
      cell: (r) => (
        <span className="text-input-token">{formatNumber(r.inputTokens)}</span>
      ),
    },
    {
      key: "output",
      header: "Output",
      align: "right",
      cell: (r) => (
        <span className="text-output-token">{formatNumber(r.outputTokens)}</span>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: (r) => (
        <span className="font-semibold">{formatNumber(r.totalTokens)}</span>
      ),
    },
    {
      key: "cost",
      header: "Est. Cost",
      align: "right",
      cell: (r) => formatCurrency(toNumber(r.estimatedTotalCost), org.currency),
    },
    {
      key: "owner",
      header: "Owner",
      cell: (r) => (
        <span className="font-mono text-data text-text-muted">
          {r.requestOwner ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-section-gap">
      <PageHeader
        title="Token Ledger"
        description={`${total.toLocaleString()} usage events. Showing latest ${Math.min(
          PAGE_SIZE,
          events.length
        )}.`}
        action={
          <a
            href={exportHref}
            className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-2 font-display text-body-md text-on-surface transition-colors hover:border-primary-container/40 hover:text-primary-container"
          >
            <span className="material-symbols-outlined text-[18px]">file_download</span>
            Export CSV
          </a>
        }
      />

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
                  Latest live ledger event: {latestLiveEvent.provider.name} / {latestLiveEvent.model.name} at{" "}
                  {formatDateTime(latestLiveEvent.timestamp)} ({formatRelativeTime(latestLiveEvent.timestamp)}).
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
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          <Field label="From">
            <input
              type="date"
              name="from"
              defaultValue={sp.from ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              name="to"
              defaultValue={sp.to ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Provider">
            <select
              name="providerId"
              defaultValue={sp.providerId ?? ""}
              className={inputCls}
            >
              <option value="">All</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Model">
            <select
              name="modelId"
              defaultValue={sp.modelId ?? ""}
              className={inputCls}
            >
              <option value="">All</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Integration">
            <select
              name="integrationId"
              defaultValue={sp.integrationId ?? ""}
              className={inputCls}
            >
              <option value="">All</option>
              {integrations.map((integration) => (
                <option key={integration.id} value={integration.id}>
                  {integration.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project">
            <select
              name="projectId"
              defaultValue={sp.projectId ?? ""}
              className={inputCls}
            >
              <option value="">All</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Team">
            <select
              name="teamId"
              defaultValue={sp.teamId ?? ""}
              className={inputCls}
            >
              <option value="">All</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-7">
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
          rowKey={(r) => r.id}
          empty="No usage events match your filters."
        />
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
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-caps text-text-muted">{label}</span>
      {children}
    </label>
  );
}
