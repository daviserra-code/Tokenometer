import clsx from "clsx";
import Link from "next/link";

import { Card, PageHeader } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard } from "@/components/KpiCard";
import { ProviderTag } from "@/components/ProviderChip";
import { SetupSurfaceGuide } from "@/components/SetupSurfaceGuide";
import { requireAdmin } from "@/lib/auth";
import {
  formatCurrency,
  formatDateTime,
  formatRelativeTime,
  formatTokens,
  toNumber,
} from "@/lib/format";
import { evaluateIntegrationHealth, healthToneClasses } from "@/lib/integration-health";
import {
  buildGatewayHref,
  buildRolloutChecklist,
  envBlock,
  getNextAction,
  getProviderConfig,
  getRolloutConfig,
  INTEGRATION_PROVIDERS,
  INTEGRATION_ROLLOUTS,
  nodeSnippet,
  pythonSnippet,
  recommendMode,
} from "@/lib/integration-onboarding";
import { prisma } from "@/lib/prisma";
import { ensureRuntimeProviderCatalog } from "@/lib/runtime-provider-catalog";

export const dynamic = "force-dynamic";

type GatewayRow = {
  id: string;
  timestamp: Date;
  provider: string;
  model: string;
  source: string;
  requestId: string;
  latencyMs: number | null;
  streamed: boolean;
  tokens: number;
  cost: number;
  owner: string;
};

type SearchParams = {
  provider?: string;
  mode?: string;
  integration?: string;
};

export default async function GatewayPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  requireAdmin();
  const org = await prisma.organization.findFirst();
  if (!org) {
    return (
      <div>
        <PageHeader title="Metering Gateway" />
        <Card>
          <p className="text-body-md text-text-muted">No organization found. Run the seed first.</p>
        </Card>
      </div>
    );
  }

  await ensureRuntimeProviderCatalog(org.id, org.currency);

  const resolvedSearchParams =
    searchParams && typeof (searchParams as Promise<SearchParams>).then === "function"
      ? await (searchParams as Promise<SearchParams>)
      : ((searchParams as SearchParams | undefined) ?? {});

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.tokenometer.cloud";
  const ingest = await prisma.ingestSource.findFirst({
    where: { organizationId: org.id, active: true },
    orderBy: { createdAt: "desc" },
  });
  const credentials = await prisma.providerCredential.findMany({
    where: { organizationId: org.id, active: true },
    orderBy: { createdAt: "desc" },
  });
  const integrations = await prisma.integration.findMany({
    where: { organizationId: org.id, active: true },
    include: {
      provider: true,
      credential: true,
      ingestSource: true,
      project: true,
      _count: { select: { usageEvents: true } },
    },
    orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
  });
  const providers = await prisma.provider.findMany();
  const providerById = new Map(providers.map((provider) => [provider.id, provider.name]));
  const credentialByProvider = new Map<
    string,
    { id: string; label: string; keyHint: string; active: boolean; lastUsedAt: Date | null; updatedAt: Date }
  >();

  for (const credential of credentials) {
    const providerName = providerById.get(credential.providerId);
    if (providerName && !credentialByProvider.has(providerName)) {
      credentialByProvider.set(providerName, {
        id: credential.id,
        label: credential.label,
        keyHint: credential.keyHint,
        active: credential.active,
        lastUsedAt: credential.lastUsedAt,
        updatedAt: credential.updatedAt,
      });
    }
  }
  const fallbackCredentialByProvider = credentialByProvider;

  const events = await prisma.usageEvent.findMany({
    where: {
      organizationId: org.id,
      source: { startsWith: "byok-proxy" },
    },
    orderBy: { timestamp: "desc" },
    take: 50,
    include: { provider: true, model: true },
  });

  const latestProxyByProvider = new Map<string, Date>();
  for (const event of events) {
    if (!latestProxyByProvider.has(event.provider.name)) {
      latestProxyByProvider.set(event.provider.name, event.timestamp);
    }
  }

  const rows: GatewayRow[] = events.slice(0, 10).map((event) => {
    const metadata =
      event.metadataJson && typeof event.metadataJson === "object"
        ? (event.metadataJson as Record<string, unknown>)
        : null;

    return {
      id: event.id,
      timestamp: event.timestamp,
      provider: event.provider.name,
      model: event.model.name,
      source: event.source ?? "byok-proxy",
      requestId: typeof metadata?.requestId === "string" ? metadata.requestId : "-",
      latencyMs: typeof metadata?.latencyMs === "number" ? metadata.latencyMs : null,
      streamed: Boolean(metadata?.streamed),
      tokens: event.totalTokens,
      cost: toNumber(event.estimatedTotalCost),
      owner: event.requestOwner ?? "-",
    };
  });

  const selectedIntegration =
    integrations.find((integration) => integration.id === resolvedSearchParams.integration) ?? null;
  const selectedProvider = getProviderConfig(
    resolvedSearchParams.provider ?? providerNameToSlug(selectedIntegration?.provider.name ?? "openai"),
  );
  const selectedRollout = getRolloutConfig(
    resolvedSearchParams.mode ??
      (selectedIntegration
        ? selectedIntegration.mode === "OBSERVE"
          ? "observe"
          : selectedIntegration.mode === "ENFORCE"
            ? "enforce"
            : "fallback"
        : undefined),
  );
  const latestProxyEvent = rows[0] ?? null;
  const selectedCredential = credentialByProvider.get(selectedProvider.name) ?? null;
  const selectedLatestEvent = latestProxyByProvider.get(selectedProvider.name) ?? null;
  const shadowReady = Boolean(ingest?.secret || ingest?.encryptedSecret || ingest?.secretHint);
  const providerKeyReady = Boolean(selectedCredential);
  const modeReady =
    Boolean(ingest) &&
    (!selectedRollout.requiresProviderKeyInApp || providerKeyReady) &&
    (!selectedRollout.requiresIngestSecret || shadowReady);
  const nextAction = getNextAction({
    ingestReady: Boolean(ingest),
    providerKeyReady,
    shadowReady,
    latestEventReady: Boolean(selectedLatestEvent),
    rollout: selectedRollout,
  });

  const latencySamples = rows
    .map((row) => row.latencyMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const avgLatencyMs = latencySamples.length
    ? Math.round(latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length)
    : null;
  const p95LatencyMs = latencySamples.length
    ? latencySamples
        .slice()
        .sort((a, b) => a - b)[Math.min(latencySamples.length - 1, Math.floor(latencySamples.length * 0.95))]
    : null;
  const streamedRows = rows.filter((row) => row.streamed).length;
  const providerCounts = new Map<string, number>();
  rows.forEach((row) => {
    providerCounts.set(row.provider, (providerCounts.get(row.provider) ?? 0) + 1);
  });
  const busiestProvider = Array.from(providerCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
  const selectedIntegrationHealth = selectedIntegration
    ? evaluateIntegrationHealth({
        name: selectedIntegration.name,
        mode: selectedIntegration.mode,
        active: selectedIntegration.active,
        lastSeenAt: selectedIntegration.lastSeenAt,
        lastVerifiedAt: selectedIntegration.lastVerifiedAt,
        environment: selectedIntegration.environment,
        ownerName: selectedIntegration.ownerName,
        ownerEmail: selectedIntegration.ownerEmail,
        runbookUrl: selectedIntegration.runbookUrl,
        teamId: selectedIntegration.teamId,
        project: selectedIntegration.project
          ? { id: selectedIntegration.project.id, name: selectedIntegration.project.name, teamId: selectedIntegration.project.teamId }
          : null,
        provider: { name: selectedIntegration.provider.name },
        credential: selectedIntegration.credential,
        ingestSource: selectedIntegration.ingestSource,
        fallbackCredential: fallbackCredentialByProvider.get(selectedIntegration.provider.name) ?? null,
        fallbackIngestSource: ingest,
      })
    : null;
  const providerIntegrations = integrations
    .filter((integration) => integration.provider.name === selectedProvider.name)
    .slice(0, 6)
    .map((integration) => ({
      integration,
      health: evaluateIntegrationHealth({
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
        fallbackCredential: fallbackCredentialByProvider.get(integration.provider.name) ?? null,
        fallbackIngestSource: ingest,
      }),
    }));

  const cols: Column<GatewayRow>[] = [
    {
      key: "when",
      header: "When",
      cell: (row) => formatDateTime(row.timestamp),
    },
    {
      key: "provider",
      header: "Provider",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <ProviderTag name={row.provider} />
          <span>{row.model}</span>
        </div>
      ),
    },
    {
      key: "request",
      header: "Request",
      cell: (row) => (
        <div className="space-y-1">
          <div className="font-mono text-[12px] text-text-muted">{row.requestId}</div>
          <div className="text-[12px] text-text-muted">
            {row.latencyMs !== null ? `${row.latencyMs} ms` : "Latency n/a"}
            {row.streamed ? " | stream" : ""}
          </div>
        </div>
      ),
    },
    { key: "source", header: "Source", cell: (row) => row.source },
    { key: "tokens", header: "Tokens", align: "right", cell: (row) => formatTokens(row.tokens) },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      cell: (row) => formatCurrency(row.cost, org.currency),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metering Gateway"
        description="Choose a provider, choose a rollout mode, and let Tokenometer generate the cleanest path from first test to real production traffic."
        action={
          <Link
            href="/settings/credentials"
            className="inline-flex items-center gap-2 rounded-lg border border-primary-container/40 bg-primary-container/10 px-4 py-2 text-sm font-semibold text-primary-container hover:bg-primary-container/20"
          >
            <span className="material-symbols-outlined text-[18px]">key</span>
            Vault keys
          </Link>
        }
      />

      <SetupSurfaceGuide
        current="gateway"
        nextHref="/ledger"
        nextLabel="Confirm the request in Ledger and Reports"
        nextBody="Gateway proves the request path and metadata. The final confidence check is making sure the raw event lands in Ledger and then shows up in the spend views you care about."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr,1fr]">
        <Card title="Choose the provider you are wiring next" description="This is the integration surface for Epic 3. Pick one app, one provider, one rollout mode.">
          <div className="flex flex-wrap gap-2">
            {INTEGRATION_PROVIDERS.map((provider) => (
              <SelectorPill
                key={provider.slug}
                href={buildGatewayHref(provider.slug, selectedRollout.slug)}
                active={provider.slug === selectedProvider.slug}
                label={provider.name}
                sublabel={provider.model}
              />
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-border-subtle bg-background p-4">
            <div className="flex items-center gap-2">
              <ProviderTag name={selectedProvider.name} />
              <strong className="text-on-surface">{selectedProvider.model}</strong>
            </div>
            <p className="mt-2 text-sm text-text-muted">
              {selectedProvider.name} uses <span className="font-mono text-[12px]">{selectedProvider.endpoint}</span>.
              Historical sync is <strong>{selectedProvider.historical}</strong>, but the main story here is live metering
              through response usage.
            </p>
          </div>
        </Card>

        <Card title="Choose the rollout mode" description="Product language first. Architecture second.">
          <div className="space-y-2">
            {INTEGRATION_ROLLOUTS.map((rollout) => (
              <SelectorPill
                key={rollout.slug}
                href={buildGatewayHref(selectedProvider.slug, rollout.slug)}
                active={rollout.slug === selectedRollout.slug}
                label={rollout.label}
                sublabel={rollout.bestFor}
                vertical
              />
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr,1fr]">
        <Card title="Integration health" description="This tells you whether the selected provider and mode are ready for a real app rollout.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReadinessRow label="Vaulted provider key" ok={providerKeyReady} value={providerKeyReady ? `${selectedCredential?.label} / ****${selectedCredential?.keyHint}` : "Missing"} />
            <ReadinessRow label="Active ingest key" ok={Boolean(ingest)} value={ingest ? ingest.name : "Missing"} />
            <ReadinessRow label="Shadow secret" ok={!selectedRollout.requiresIngestSecret || shadowReady} value={shadowReady ? `Ready / ****${ingest?.secretHint ?? ""}` : "Not available"} />
            <ReadinessRow label="Latest live request" ok={Boolean(selectedLatestEvent)} value={selectedLatestEvent ? `${formatRelativeTime(selectedLatestEvent)} (${formatDateTime(selectedLatestEvent)})` : "No live traffic yet"} />
            <ReadinessRow
              label="Provider credential use"
              ok={providerKeyReady}
              value={
                selectedCredential?.lastUsedAt
                  ? `Last used ${formatRelativeTime(selectedCredential.lastUsedAt)}`
                  : providerKeyReady
                    ? `Stored ${formatRelativeTime(selectedCredential?.updatedAt ?? new Date())}`
                    : "Never used"
              }
            />
            <ReadinessRow label="Mode readiness" ok={modeReady} value={modeReady ? "Ready to integrate" : "Needs one more setup step"} />
          </div>

          <div className="mt-4 rounded-lg border border-border-subtle bg-background p-4 text-sm text-text-muted">
            <p>
              <strong className="text-on-surface">{selectedRollout.label}:</strong> {selectedRollout.promise}
            </p>
            <p className="mt-2">
              <strong className="text-on-surface">Best next action:</strong> {nextAction}
            </p>
            <p className="mt-2">
              <strong className="text-on-surface">Caution:</strong> {selectedRollout.caution}
            </p>
          </div>
        </Card>

        <Card title="Read this mode like a teammate would" description="The app should teach the rollout, not make you reverse-engineer it.">
          <div className="space-y-3 text-sm text-text-muted">
            <ModeCallout
              title="What the app keeps doing"
              body={
                selectedRollout.requiresProviderKeyInApp
                  ? "Your app still needs the upstream provider key in its own environment."
                  : "Your app can rely on the vaulted provider key inside Tokenometer."
              }
            />
            <ModeCallout
              title="What Tokenometer adds"
              body={
                selectedRollout.slug === "observe"
                  ? "A signed ingest event after each provider call, so spend appears without changing the live request path."
                  : "A metered gateway path with request IDs, provider/model attribution, and fresh spend the moment the request returns."
              }
            />
            <ModeCallout
              title="When to use it"
              body={selectedRollout.bestFor}
            />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Recent calls" value={String(rows.length)} hint="latest live traces" icon="quick_reference" />
        <KpiCard
          label="Average latency"
          value={avgLatencyMs !== null ? `${avgLatencyMs} ms` : "n/a"}
          hint={p95LatencyMs !== null ? `p95 ${p95LatencyMs} ms` : "p95 n/a"}
          icon="timer"
          tone={avgLatencyMs !== null && avgLatencyMs > 2500 ? "warning" : "success"}
          accent
        />
        <KpiCard
          label="Streamed calls"
          value={String(streamedRows)}
          hint={`${rows.length ? Math.round((streamedRows / rows.length) * 100) : 0}% of recent traffic`}
          icon="waterfall_chart"
          tone="input"
        />
        <KpiCard label="Busiest provider" value={busiestProvider} hint="from recent traces" icon="hub" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr,1fr]">
        <Card title="Environment block" description="This is the smallest useful env setup for the selected provider and rollout mode.">
          <pre className="overflow-auto rounded-lg border border-border-subtle bg-background p-4 font-mono text-[12px] leading-relaxed text-text-muted">
            {envBlock(appUrl, selectedProvider, selectedRollout, ingest?.name ?? "Default", selectedIntegration ? {
              integrationId: selectedIntegration.id,
              project: selectedIntegration.project?.name ?? undefined,
              agent: selectedIntegration.agentName ?? undefined,
            } : undefined)}
          </pre>
        </Card>

        <Card title="Rollout checklist" description="Use this sequence for the first app. It keeps the test loop tight and continuity safe.">
          <div className="space-y-3">
            {buildRolloutChecklist(selectedProvider, selectedRollout).map((item, index) => (
              <ChecklistItem key={`${index}-${item.title}`} index={index + 1} title={item.title} body={item.body} />
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SnippetCard title={`Node.js: ${selectedProvider.name} in ${selectedRollout.label}`} code={nodeSnippet(selectedProvider, selectedRollout, selectedIntegration ? {
          integrationId: selectedIntegration.id,
          project: selectedIntegration.project?.name ?? undefined,
          agent: selectedIntegration.agentName ?? undefined,
        } : undefined)} />
        <SnippetCard title={`Python: ${selectedProvider.name} in ${selectedRollout.label}`} code={pythonSnippet(selectedProvider, selectedRollout, selectedIntegration ? {
          integrationId: selectedIntegration.id,
          project: selectedIntegration.project?.name ?? undefined,
          agent: selectedIntegration.agentName ?? undefined,
        } : undefined)} />
      </div>

      {selectedIntegration && selectedIntegrationHealth && (
        <Card title="Selected integration health" description="This is the app-specific status view for the integration currently loaded into the setup generator.">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr,1fr]">
            <div className="rounded-lg border border-border-subtle bg-background p-4">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-on-surface">{selectedIntegration.name}</strong>
                <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", healthToneClasses(selectedIntegrationHealth.status))}>
                  {selectedIntegrationHealth.label}
                </span>
                <span className="font-mono text-[11px] text-text-muted">{selectedIntegration.id.slice(0, 10)}...</span>
              </div>
              <div className="mt-2 text-sm text-text-muted">{selectedIntegrationHealth.summary}</div>
              <div className="mt-2 text-sm text-text-muted">
                <strong className="text-on-surface">Next action:</strong> {selectedIntegrationHealth.nextAction}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ReadinessRow label="Resolved credential" ok={selectedIntegrationHealth.resolvedCredentialLabel !== "Missing"} value={selectedIntegrationHealth.resolvedCredentialLabel} />
              <ReadinessRow label="Resolved ingest" ok={selectedIntegrationHealth.resolvedIngestLabel !== "Missing"} value={selectedIntegrationHealth.resolvedIngestLabel} />
              <ReadinessRow label="Freshness threshold" ok value={`${selectedIntegrationHealth.staleThresholdHours}h`} />
              <ReadinessRow label="Usage events" ok={selectedIntegration._count.usageEvents > 0} value={String(selectedIntegration._count.usageEvents)} />
            </div>
          </div>
        </Card>
      )}

      <Card
        title="Named integrations for this provider"
        description="Choose one if you want the generated setup to carry a stable integration ID, owned credential, and last-seen status."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {providerIntegrations.map(({ integration, health }) => (
              <Link
                key={integration.id}
                href={`/gateway?provider=${selectedProvider.slug}&mode=${selectedRollout.slug}&integration=${integration.id}`}
                className={clsx(
                  "rounded-lg border p-4 transition",
                  selectedIntegration?.id === integration.id
                    ? "border-primary bg-primary/10"
                    : "border-border-subtle bg-background hover:border-primary/40 hover:bg-surface-2",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <strong className="block text-on-surface">{integration.name}</strong>
                    <div className="mt-1 text-[12px] text-text-muted">
                      Mode {integration.mode.toLowerCase()} | Agent {integration.agentName ?? "not set"}
                    </div>
                    <div className="mt-1 text-[12px] text-text-muted">
                      Last seen {integration.lastSeenAt ? formatRelativeTime(integration.lastSeenAt) : "never"} | {integration._count.usageEvents} usage events
                    </div>
                    <div className="mt-2">
                      <span
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                          healthToneClasses(health.status),
                        )}
                      >
                        {health.label}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-text-muted">{integration.id.slice(0, 8)}...</span>
                </div>
              </Link>
            ))}
          {providerIntegrations.length === 0 && (
            <div className="rounded-lg border border-dashed border-border-subtle bg-background p-4 text-sm text-text-muted">
              No named {selectedProvider.name} integrations yet. Create one in Settings -&gt; Integrations to make onboarding and audit history more explicit.
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr,1fr]">
        <Card title="Verification loop" description="These are the four surfaces that should confirm a healthy rollout.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <VerifyTile
              href="/settings/credentials"
              title="1. Run a guided provider test"
              body={`Use the ${selectedProvider.name} test card to stamp a request ID and prove the path.`}
            />
            <VerifyTile
              href={buildGatewayHref(selectedProvider.slug, selectedRollout.slug)}
              title="2. Check Gateway"
              body="Confirm provider, model, request ID, latency, and whether the call streamed."
            />
            <VerifyTile
              href="/ledger"
              title="3. Check Ledger"
              body="Make sure the raw event landed with the current timestamp and the right source."
            />
            <VerifyTile
              href="/reports"
              title="4. Check Reports"
              body="Daily, weekly, and monthly spend should now have a fresh live event to anchor them."
            />
          </div>
        </Card>

        <Card title="What metadata should always be attached">
          <div className="space-y-3 text-sm text-text-muted">
            <ModeCallout title="x-project" body="Use one stable project slug per app or workload. This is how the spend views stay understandable later." />
            <ModeCallout title="x-agent" body="Use the worker or bot name so you can separate flows inside the same app." />
            <ModeCallout title="x-integration-id" body="Use this when you created a named integration. It gives the request a durable Tokenometer identity and lets the app inherit the linked provider credential and ingest rules." />
            <ModeCallout title="x-request-id" body="Keep it unique per request. It is your best debugging handle when one app call looks wrong." />
            <ModeCallout title="Provider model name" body="Keep the real upstream model in the request body so Tokenometer records the right cost basis." />
          </div>
        </Card>
      </div>

      <Card
        title="Provider routes"
        description="This is still the reference matrix. Epic 3 just wraps it in a cleaner rollout flow."
        noPadding
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[12px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Provider</th>
                <th className="px-4 py-3 text-left">Gateway endpoint</th>
                <th className="px-4 py-3 text-left">Vault</th>
                <th className="px-4 py-3 text-left">Latest live event</th>
                <th className="px-4 py-3 text-left">Historical sync</th>
                <th className="px-4 py-3 text-left">Streaming</th>
                <th className="px-4 py-3 text-left">Recommended mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {INTEGRATION_PROVIDERS.map((provider) => {
                const credential = credentialByProvider.get(provider.name);
                const latestEvent = latestProxyByProvider.get(provider.name);

                return (
                  <tr key={provider.slug}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ProviderTag name={provider.name} />
                        <span className="text-text-muted">{provider.model}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-text-muted">{provider.endpoint}</td>
                    <td className="px-4 py-3">
                      {credential ? (
                        <span className="text-status-normal">
                          {credential.label} / ****{credential.keyHint}
                        </span>
                      ) : (
                        <span className="text-status-warning">No key</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {latestEvent ? formatDateTime(latestEvent) : "No live event"}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{provider.historical}</td>
                    <td className="px-4 py-3 text-text-muted">{provider.streaming}</td>
                    <td className="px-4 py-3">
                      <span className={provider.name === selectedProvider.name ? "text-status-normal" : "text-text-muted"}>
                        {recommendMode(provider.name === selectedProvider.name, Boolean(latestEvent))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Recent gateway calls" description="Only live metered BYOK proxy calls, not demo data." noPadding>
        <DataTable columns={cols} rows={rows} rowKey={(row) => row.id} />
      </Card>
    </div>
  );
}

function SelectorPill({
  href,
  active,
  label,
  sublabel,
  vertical = false,
}: {
  href: string;
  active: boolean;
  label: string;
  sublabel: string;
  vertical?: boolean;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "rounded-lg border px-4 py-3 transition",
        vertical ? "block" : "inline-flex items-center gap-3",
        active
          ? "border-primary bg-primary/10 text-on-surface"
          : "border-border-subtle bg-background text-text-muted hover:border-primary/40 hover:bg-surface-2"
      )}
    >
      <span className="block font-semibold">{label}</span>
      <span className={clsx("block text-[12px]", active ? "text-text-muted" : "text-text-muted")}>{sublabel}</span>
    </Link>
  );
}

function ReadinessRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background p-3">
      <span className="block text-[12px] uppercase tracking-wider text-text-muted">{label}</span>
      <span className={clsx("mt-1 block text-sm font-medium", ok ? "text-status-normal" : "text-status-warning")}>
        {value}
      </span>
    </div>
  );
}

function ModeCallout({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background p-3">
      <strong className="block text-on-surface">{title}</strong>
      <span className="mt-1 block text-[12px] text-text-muted">{body}</span>
    </div>
  );
}

function ChecklistItem({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border-subtle bg-background p-3">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-on-primary">
        {index}
      </div>
      <div>
        <strong className="block text-on-surface">{title}</strong>
        <span className="mt-1 block text-[12px] text-text-muted">{body}</span>
      </div>
    </div>
  );
}

function VerifyTile({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-border-subtle bg-background p-4 transition hover:border-primary/40 hover:bg-surface-2"
    >
      <strong className="block text-on-surface">{title}</strong>
      <span className="mt-1 block text-[12px] text-text-muted">{body}</span>
    </Link>
  );
}

function SnippetCard({ title, code }: { title: string; code: string }) {
  return (
    <Card title={title}>
      <pre className="overflow-auto rounded-lg border border-border-subtle bg-background p-4 font-mono text-[12px] leading-relaxed text-text-muted">
        {code}
      </pre>
    </Card>
  );
}

function providerNameToSlug(name: string) {
  const found = INTEGRATION_PROVIDERS.find((provider) => provider.name === name);
  return found?.slug ?? "openai";
}
