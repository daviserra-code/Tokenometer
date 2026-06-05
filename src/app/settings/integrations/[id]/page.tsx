import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, PageHeader } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { ProviderChip } from "@/components/ProviderChip";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { evaluateIntegrationHealth, healthToneClasses } from "@/lib/integration-health";
import { prisma } from "@/lib/prisma";

import { markIntegrationVerifiedAction } from "../../actions";

export const dynamic = "force-dynamic";

type UsageRow = {
  id: string;
  when: string;
  model: string;
  source: string;
  requestId: string;
  tokens: number;
  owner: string;
};

type AuditRow = {
  id: string;
  when: string;
  action: string;
  actor: string;
  summary: string;
};

export default async function IntegrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  requireAdmin();
  const resolvedParams =
    params && typeof (params as Promise<{ id: string }>).then === "function"
      ? await (params as Promise<{ id: string }>)
      : (params as { id: string });

  const id = resolvedParams.id;
  const integration = await prisma.integration.findUnique({
    where: { id },
    include: {
      provider: true,
      credential: true,
      ingestSource: true,
      project: { include: { team: true } },
      team: true,
      organization: true,
      _count: { select: { usageEvents: true } },
    },
  });
  if (!integration) notFound();

  const [fallbackCredential, fallbackIngestSource, usageEvents, auditLogs, adminUsers] = await Promise.all([
    prisma.providerCredential.findFirst({
      where: { organizationId: integration.organizationId, providerId: integration.providerId, active: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.ingestSource.findFirst({
      where: { organizationId: integration.organizationId, active: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.usageEvent.findMany({
      where: { integrationId: integration.id },
      include: { model: true },
      orderBy: { timestamp: "desc" },
      take: 25,
    }),
    prisma.auditLog.findMany({
      where: {
        organizationId: integration.organizationId,
        OR: [
          { targetType: "Integration", targetId: integration.id },
          { action: "integration.verified", targetId: integration.id },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.adminUser.findMany(),
  ]);

  const actorMap = new Map(adminUsers.map((user) => [user.id, user.username]));
  const health = evaluateIntegrationHealth({
    name: integration.name,
    mode: integration.mode,
    active: integration.active,
    lastSeenAt: integration.lastSeenAt,
    lastVerifiedAt: integration.lastVerifiedAt,
    environment: integration.environment,
    ownerName: integration.ownerName,
    ownerEmail: integration.ownerEmail,
    runbookUrl: integration.runbookUrl,
    teamId: integration.teamId,
    project: integration.project
      ? { id: integration.project.id, name: integration.project.name, teamId: integration.project.teamId }
      : null,
    provider: { name: integration.provider.name },
    credential: integration.credential,
    ingestSource: integration.ingestSource,
    fallbackCredential,
    fallbackIngestSource,
  });

  const usageRows: UsageRow[] = usageEvents.map((event) => {
    const metadata =
      event.metadataJson && typeof event.metadataJson === "object"
        ? (event.metadataJson as Record<string, unknown>)
        : null;
    return {
      id: event.id,
      when: `${formatDateTime(event.timestamp)} (${formatRelativeTime(event.timestamp)})`,
      model: event.model.name,
      source: event.source ?? "byok-proxy",
      requestId: typeof metadata?.requestId === "string" ? metadata.requestId : "-",
      tokens: event.totalTokens,
      owner: event.requestOwner ?? "-",
    };
  });

  const auditRows: AuditRow[] = auditLogs.map((log) => ({
    id: log.id,
    when: `${formatDateTime(log.createdAt)} (${formatRelativeTime(log.createdAt)})`,
    action: log.action,
    actor: log.adminUserId ? actorMap.get(log.adminUserId) ?? log.adminUserId : "admin",
    summary: summarizeAudit(log.metadataJson),
  }));

  const usageColumns: Column<UsageRow>[] = [
    { key: "when", header: "When", cell: (row) => row.when },
    { key: "model", header: "Model", cell: (row) => row.model },
    { key: "source", header: "Source", cell: (row) => row.source },
    { key: "requestId", header: "Request ID", cell: (row) => <span className="font-mono text-[12px] text-text-muted">{row.requestId}</span> },
    { key: "tokens", header: "Tokens", align: "right", cell: (row) => row.tokens.toLocaleString() },
    { key: "owner", header: "Owner", cell: (row) => row.owner },
  ];

  const auditColumns: Column<AuditRow>[] = [
    { key: "when", header: "When", cell: (row) => row.when },
    { key: "action", header: "Action", cell: (row) => row.action },
    { key: "actor", header: "Actor", cell: (row) => row.actor },
    { key: "summary", header: "Summary", cell: (row) => row.summary },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={integration.name}
        description="Integration lifecycle, ownership, traffic history, and verification state."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/gateway?provider=${providerNameToSlug(integration.provider.name)}&mode=${integration.mode === "OBSERVE" ? "observe" : integration.mode === "ENFORCE" ? "enforce" : "fallback"}&integration=${integration.id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              Open in Gateway
            </Link>
            <form action={markIntegrationVerifiedAction}>
              <input type="hidden" name="id" value={integration.id} />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg border border-status-normal/40 px-4 py-2 text-sm font-semibold text-status-normal hover:bg-status-normal/10"
              >
                Mark verified
              </button>
            </form>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr,1fr]">
        <Card title="Health and lifecycle">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <ProviderChip name={integration.provider.name} />
              <span className={["rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", healthToneClasses(health.status)].join(" ")}>
                {health.label}
              </span>
              <span className="font-mono text-[12px] text-text-muted">{integration.id}</span>
            </div>
            <div className="rounded-lg border border-border-subtle bg-background p-4 text-sm text-text-muted">
              <strong className="block text-on-surface">{health.summary}</strong>
              <span className="mt-1 block">{health.nextAction}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Detail label="Mode" value={integration.mode.toLowerCase()} />
              <Detail label="Environment" value={integration.environment ?? "not set"} />
              <Detail label="Last seen" value={integration.lastSeenAt ? `${formatDateTime(integration.lastSeenAt)} (${formatRelativeTime(integration.lastSeenAt)})` : "never"} />
              <Detail label="Last verified" value={integration.lastVerifiedAt ? `${formatDateTime(integration.lastVerifiedAt)} (${formatRelativeTime(integration.lastVerifiedAt)})` : "never"} />
              <Detail label="Freshness threshold" value={`${health.staleThresholdHours}h`} />
              <Detail label="Rotation window" value={`${health.rotationWindowDays} days`} />
            </div>
          </div>
        </Card>

        <Card title="Ownership and linked secrets">
          <div className="space-y-3 text-sm text-text-muted">
            <Detail label="Owner" value={integration.ownerName ?? "not set"} />
            <Detail label="Owner email" value={integration.ownerEmail ?? "not set"} />
            <Detail label="Runbook" value={integration.runbookUrl ?? "not set"} isLink={Boolean(integration.runbookUrl)} />
            <Detail label="Resolved credential" value={health.resolvedCredentialLabel} />
            <Detail label="Resolved ingest" value={health.resolvedIngestLabel} />
            <Detail label="Project" value={integration.project?.name ?? "not set"} />
            <Detail label="Team" value={integration.team?.name ?? integration.project?.team?.name ?? "not set"} />
            <Detail label="Usage events" value={String(integration._count.usageEvents)} />
          </div>
        </Card>
      </div>

      <Card title="Open issues">
        {health.issues.length === 0 ? (
          <p className="text-sm text-status-normal">No active issues. This integration looks healthy right now.</p>
        ) : (
          <ul className="space-y-2 text-sm text-text-muted">
            {health.issues.map((issue) => (
              <li key={issue}>- {issue}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recent traffic" description="The most recent usage events recorded against this integration.">
        <DataTable columns={usageColumns} rows={usageRows} rowKey={(row) => row.id} />
      </Card>

      <Card title="Audit trail" description="Lifecycle actions taken on this integration.">
        <DataTable columns={auditColumns} rows={auditRows} rowKey={(row) => row.id} />
      </Card>
    </div>
  );
}

function Detail({
  label,
  value,
  isLink = false,
}: {
  label: string;
  value: string;
  isLink?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background p-3">
      <div className="text-[11px] uppercase tracking-wider text-text-muted">{label}</div>
      {isLink ? (
        <a href={value} target="_blank" rel="noreferrer" className="mt-1 block break-all text-[12px] text-primary hover:underline">
          {value}
        </a>
      ) : (
        <div className="mt-1 break-all text-[12px] text-on-surface">{value}</div>
      )}
    </div>
  );
}

function providerNameToSlug(name: string) {
  switch (name.toLowerCase()) {
    case "openai":
      return "openai";
    case "anthropic":
      return "anthropic";
    case "google":
      return "google";
    case "mistral":
      return "mistral";
    case "deepseek":
      return "deepseek";
    case "minimax":
      return "minimax";
    case "github":
      return "github";
    default:
      return "openai";
  }
}

function summarizeAudit(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return "-";
  const record = metadata as Record<string, unknown>;
  if (typeof record.name === "string") return record.name;
  const entries = Object.entries(record).slice(0, 3);
  if (!entries.length) return "-";
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" | ");
}
