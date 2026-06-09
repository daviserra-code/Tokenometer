import Link from "next/link";

import { Card, PageHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { ProviderTag } from "@/components/ProviderChip";
import { requireAdmin } from "@/lib/auth";
import { getCurrentOrganization } from "@/lib/current-organization";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { evaluateIntegrationHealth } from "@/lib/integration-health";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  requireAdmin();

  const org = await getCurrentOrganization();
  if (!org) {
    return (
      <div>
        <PageHeader title="Setup" description="Tokenometer needs an organization before it can meter anything." />
        <Card>
          <p className="text-body-md text-text-muted">No organization found. Run the seed first.</p>
        </Card>
      </div>
    );
  }

  const [providers, credentials, ingestSources, integrations, latestLiveEvent] = await Promise.all([
    prisma.provider.findMany({ orderBy: { name: "asc" } }),
    prisma.providerCredential.findMany({
      where: { organizationId: org.id, active: true },
      orderBy: [{ providerId: "asc" }, { updatedAt: "desc" }],
    }),
    prisma.ingestSource.findMany({
      where: { organizationId: org.id, active: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.integration.findMany({
      where: { organizationId: org.id, active: true },
      include: {
        provider: true,
        credential: true,
        ingestSource: true,
        project: true,
      },
      orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.usageEvent.findFirst({
      where: { organizationId: org.id },
      orderBy: { timestamp: "desc" },
      include: { provider: true, model: true },
    }),
  ]);

  const ingest = ingestSources[0] ?? null;
  const fallbackCredentialByProvider = new Map<string, (typeof credentials)[number]>();
  for (const credential of credentials) {
    if (!fallbackCredentialByProvider.has(credential.providerId)) {
      fallbackCredentialByProvider.set(credential.providerId, credential);
    }
  }

  const healthRows = integrations.map((integration) =>
    evaluateIntegrationHealth({
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
      fallbackCredential: fallbackCredentialByProvider.get(integration.providerId) ?? null,
      fallbackIngestSource: ingest,
    }),
  );

  const healthyIntegrations = healthRows.filter((health) => health.status === "healthy").length;
  const brokenIntegrations = healthRows.filter((health) => health.status === "broken").length;
  const staleIntegrations = healthRows.filter((health) => health.status === "stale").length;
  const vaultedProviders = new Set(credentials.map((credential) => credential.providerId)).size;
  const activeIngestSources = ingestSources.length;

  const providerSummaries = providers
    .map((provider) => {
      const providerCredentials = credentials.filter((credential) => credential.providerId === provider.id);
      const providerIntegrations = integrations.filter((integration) => integration.providerId === provider.id);
      const providerEvent = providerIntegrations
        .map((integration) => integration.lastSeenAt)
        .filter((value): value is Date => value instanceof Date)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

      return {
        id: provider.id,
        name: provider.name,
        credentialCount: providerCredentials.length,
        integrationCount: providerIntegrations.length,
        latestSeenAt: providerEvent,
      };
    })
    .filter((provider) => provider.credentialCount > 0 || provider.integrationCount > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Setup"
        description="This is the control-plane view of Tokenometer: wire secrets, name each app integration, choose the rollout mode, then confirm the spend lands in live surfaces."
        action={
          <Link
            href="/gateway"
            className="inline-flex items-center gap-2 rounded-lg border border-primary-container/40 bg-primary-container/10 px-4 py-2 text-sm font-semibold text-primary-container hover:bg-primary-container/20"
          >
            <span className="material-symbols-outlined text-[18px]">api</span>
            Open gateway
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Vaulted providers"
          value={String(vaultedProviders)}
          hint={credentials.length ? `${credentials.length} active credentials` : "no provider keys yet"}
          icon="vpn_key"
          tone={vaultedProviders > 0 ? "success" : "warning"}
        />
        <KpiCard
          label="Named integrations"
          value={String(integrations.length)}
          hint={healthyIntegrations ? `${healthyIntegrations} healthy` : "create the first app identity"}
          icon="deployed_code"
          tone={integrations.length > 0 ? "success" : "warning"}
        />
        <KpiCard
          label="Ingest sources"
          value={String(activeIngestSources)}
          hint={ingest ? `${ingest.name} active` : "observe mode is not ready yet"}
          icon="webhook"
          tone={activeIngestSources > 0 ? "success" : "warning"}
        />
        <KpiCard
          label="Latest live event"
          value={latestLiveEvent ? formatRelativeTime(latestLiveEvent.timestamp) : "none yet"}
          hint={latestLiveEvent ? `${latestLiveEvent.provider.name} / ${latestLiveEvent.model.name}` : "run a guided provider test"}
          icon="schedule"
          tone={latestLiveEvent ? "success" : "warning"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr,1fr]">
        <Card title="How Tokenometer works" description="The product is easier to use when you keep the flow in this order.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FlowTile
              href="/settings/credentials"
              index={1}
              title="Vault provider credentials"
              body="Store the upstream API key Tokenometer needs to proxy or reconcile usage."
            />
            <FlowTile
              href="/settings/integrations"
              index={2}
              title="Create a named integration"
              body="Give each app a durable identity with provider, rollout mode, ownership, and project/team mapping."
            />
            <FlowTile
              href="/gateway"
              index={3}
              title="Choose the live rollout mode"
              body="Observe, fallback, or enforce. Tokenometer generates the env block and adapter snippets from there."
            />
            <FlowTile
              href="/ledger"
              index={4}
              title="Verify the spend lands"
              body="Use Gateway, Ledger, and Reports together to prove the request ID, usage event, and spend all line up."
            />
          </div>
        </Card>

        <Card title="What to do next" description="This is the shortest useful path for the current workspace state.">
          <div className="space-y-3 text-sm text-text-muted">
            <Meaning
              title={credentials.length === 0 ? "Start with credentials" : "Credentials are present"}
              body={
                credentials.length === 0
                  ? "No provider keys are vaulted yet. Add one key first so Tokenometer can proxy or test a real provider call."
                  : `${credentials.length} active credential${credentials.length === 1 ? "" : "s"} already exist.`
              }
            />
            <Meaning
              title={integrations.length === 0 ? "Name the first app integration" : "Integration layer is alive"}
              body={
                integrations.length === 0
                  ? "Create a named integration before wiring a real app. It keeps ownership, rollout mode, and attribution coherent."
                  : `${integrations.length} active integration${integrations.length === 1 ? "" : "s"} exist, with ${healthyIntegrations} currently healthy.`
              }
            />
            <Meaning
              title={latestLiveEvent ? "Live metering is already flowing" : "Run the first guided test"}
              body={
                latestLiveEvent
                  ? `The latest live event arrived ${formatRelativeTime(latestLiveEvent.timestamp)}. Use Reports and Ledger to make sure the spend story still feels current.`
                  : "Go to Credentials or Gateway, run a guided provider test, and then verify the event in Gateway, Ledger, and Reports."
              }
            />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr,1fr]">
        <Card title="Current readiness" description="This is the product-level snapshot across secrets, app identity, and live metering.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReadinessRow
              label="Provider credentials"
              ok={credentials.length > 0}
              value={
                credentials.length > 0
                  ? `${credentials.length} active across ${vaultedProviders} provider${vaultedProviders === 1 ? "" : "s"}`
                  : "No vaulted provider keys"
              }
            />
            <ReadinessRow
              label="Observe-mode ingest"
              ok={activeIngestSources > 0}
              value={ingest ? `${ingest.name} ready` : "No active ingest source"}
            />
            <ReadinessRow
              label="Named integrations"
              ok={integrations.length > 0}
              value={
                integrations.length > 0
                  ? `${healthyIntegrations} healthy / ${integrations.length} total`
                  : "No app integrations yet"
              }
            />
            <ReadinessRow
              label="Health drift"
              ok={brokenIntegrations === 0}
              value={
                brokenIntegrations > 0
                  ? `${brokenIntegrations} need fixing`
                  : staleIntegrations > 0
                    ? `${staleIntegrations} stale`
                    : "No major drift"
              }
            />
            <ReadinessRow
              label="Latest live request"
              ok={Boolean(latestLiveEvent)}
              value={
                latestLiveEvent
                  ? `${formatDateTime(latestLiveEvent.timestamp)} (${formatRelativeTime(latestLiveEvent.timestamp)})`
                  : "No live usage recorded yet"
              }
            />
            <ReadinessRow
              label="Best verification surfaces"
              ok
              value="Gateway -> Ledger -> Reports"
            />
          </div>
        </Card>

        <Card title="Use the right surface" description="These pages each have a clear job now.">
          <div className="space-y-3 text-sm text-text-muted">
            <Meaning title="Credentials" body="Vault provider keys and run the guided provider tests." />
            <Meaning title="Integrations" body="Name each app, assign provider ownership, and keep lifecycle metadata sane." />
            <Meaning title="Gateway" body="Generate setup snippets, choose the rollout mode, and verify live request metadata." />
            <Meaning title="Ledger and Reports" body="Confirm that raw usage events and higher-level spend views agree with the latest request." />
            <Meaning title="Settings" body="Use this for admin controls and policy, not as the first onboarding stop." />
          </div>
        </Card>
      </div>

      <Card title="Provider coverage" description="A quick way to see which providers are actually ready for live work." noPadding>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[12px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Provider</th>
                <th className="px-4 py-3 text-left">Credentials</th>
                <th className="px-4 py-3 text-left">Named integrations</th>
                <th className="px-4 py-3 text-left">Latest integration activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {providerSummaries.map((provider) => (
                <tr key={provider.id}>
                  <td className="px-4 py-3">
                    <ProviderTag name={provider.name} />
                  </td>
                  <td className="px-4 py-3 text-text-muted">{provider.credentialCount}</td>
                  <td className="px-4 py-3 text-text-muted">{provider.integrationCount}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {provider.latestSeenAt ? formatRelativeTime(provider.latestSeenAt) : "No live integration traffic"}
                  </td>
                </tr>
              ))}
              {providerSummaries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-text-muted">
                    No provider credentials or integrations yet. Start with Credentials.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Jump to the right place" description="Use this when you know the task, not the page name.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <JumpTile href="/settings/credentials" icon="vpn_key" title="Add provider key" body="Vault OpenAI, Anthropic, Gemini, Mistral, DeepSeek, MiniMax, or GitHub credentials." />
          <JumpTile href="/settings/integrations" icon="deployed_code" title="Create app identity" body="Name the app integration and bind ownership, environment, and rollout mode." />
          <JumpTile href="/gateway" icon="api" title="Generate rollout snippets" body="Get env blocks and Node/Python examples for observe, fallback, or enforce." />
          <JumpTile href="/reports" icon="query_stats" title="Check spend freshness" body="Use daily, weekly, and monthly views to confirm the live spend loop." />
        </div>
      </Card>
    </div>
  );
}

function FlowTile({
  href,
  index,
  title,
  body,
}: {
  href: string;
  index: number;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-lg border border-border-subtle bg-background p-4 transition hover:border-primary/40 hover:bg-surface-2"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-on-primary">
        {index}
      </div>
      <div>
        <strong className="block text-on-surface">{title}</strong>
        <span className="mt-1 block text-[12px] text-text-muted">{body}</span>
      </div>
    </Link>
  );
}

function ReadinessRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background p-3">
      <span className="block text-[12px] uppercase tracking-wider text-text-muted">{label}</span>
      <span className={["mt-1 block text-sm font-medium", ok ? "text-status-normal" : "text-status-warning"].join(" ")}>
        {value}
      </span>
    </div>
  );
}

function Meaning({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background p-3">
      <strong className="block text-on-surface">{title}</strong>
      <span className="mt-1 block text-[12px] text-text-muted">{body}</span>
    </div>
  );
}

function JumpTile({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-elevated/40 p-4 transition-colors hover:border-primary hover:bg-surface-2"
    >
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">{icon}</span>
        <span className="font-display font-semibold text-on-surface">{title}</span>
      </div>
      <p className="text-[12px] text-text-muted">{body}</p>
      <span className="mt-1 text-[12px] font-semibold text-primary group-hover:underline">Open -&gt;</span>
    </Link>
  );
}
