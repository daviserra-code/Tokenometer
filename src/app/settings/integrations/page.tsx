import Link from "next/link";

import { Card, PageHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { ProviderChip } from "@/components/ProviderChip";
import { SetupSurfaceGuide } from "@/components/SetupSurfaceGuide";
import { requireAdmin } from "@/lib/auth";
import { getCurrentOrganization } from "@/lib/current-organization";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { evaluateIntegrationHealth, healthToneClasses } from "@/lib/integration-health";
import {
  envBlock,
  getProviderConfig,
  getRolloutConfig,
  type ProviderSlug,
} from "@/lib/integration-onboarding";
import { prisma } from "@/lib/prisma";

import { deleteIntegrationAction, markIntegrationVerifiedAction, saveIntegrationAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  requireAdmin();
  const org = await getCurrentOrganization();
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  const [providers, credentials, ingestSources, projects, teams, integrations] = await Promise.all([
    prisma.provider.findMany({ orderBy: { name: "asc" } }),
    prisma.providerCredential.findMany({
      where: { organizationId: org.id, active: true },
      orderBy: [{ providerId: "asc" }, { label: "asc" }],
    }),
    prisma.ingestSource.findMany({
      where: { organizationId: org.id, active: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.findMany({
      where: { organizationId: org.id },
      include: { team: true },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({
      where: { organizationId: org.id },
      orderBy: { name: "asc" },
    }),
    prisma.integration.findMany({
      where: { organizationId: org.id },
      include: {
        provider: true,
        credential: true,
        ingestSource: true,
        project: { include: { team: true } },
        team: true,
        _count: { select: { usageEvents: true } },
      },
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
    }),
  ]);

  const ingest = ingestSources[0] ?? null;
  const fallbackCredentialByProvider = new Map<string, (typeof credentials)[number]>();
  for (const credential of credentials) {
    if (!fallbackCredentialByProvider.has(credential.providerId)) {
      fallbackCredentialByProvider.set(credential.providerId, credential);
    }
  }
  const integrationRows = integrations.map((integration) => ({
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
      fallbackCredential: fallbackCredentialByProvider.get(integration.providerId) ?? null,
      fallbackIngestSource: ingest,
    }),
  }));
  const healthCounts = integrationRows.reduce(
    (acc, row) => {
      acc[row.health.status] += 1;
      return acc;
    },
    { healthy: 0, attention: 0, stale: 0, broken: 0, paused: 0 } as Record<
      "healthy" | "attention" | "stale" | "broken" | "paused",
      number
    >,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Named integrations"
        description="Turn app wiring into a first-class object: provider, mode, credential ownership, ingest source, project/team mapping, and last-seen status."
        action={
          <Link
            href="/gateway"
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
          >
            Open gateway
          </Link>
        }
      />

      <SetupSurfaceGuide
        current="integrations"
        nextHref="/gateway"
        nextLabel="Move into Gateway for rollout and verification"
        nextBody="After the app identity exists, use Gateway to generate the right env block or adapter snippet for observe, fallback, or enforce, then run the verification loop."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Healthy" value={String(healthCounts.healthy)} hint="ready for normal traffic" icon="verified" tone="success" />
        <KpiCard label="Needs attention" value={String(healthCounts.attention)} hint="mostly wired, still worth checking" icon="notification_important" tone="warning" />
        <KpiCard label="Stale" value={String(healthCounts.stale)} hint="freshness threshold exceeded" icon="schedule" tone="input" />
        <KpiCard label="Needs fixing" value={String(healthCounts.broken)} hint="blocked by secrets or mappings" icon="error" tone="danger" />
        <KpiCard label="Paused" value={String(healthCounts.paused)} hint="intentionally inactive" icon="pause_circle" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr,1fr]">
        <Card
          title="Create a named integration"
          description="This is the durable identity your app can carry into proxy mode, shadow ingest, and later audit trails."
        >
          <IntegrationForm
            organizationId={org.id}
            providers={providers}
            credentials={credentials}
            ingestSources={ingestSources}
            projects={projects}
            teams={teams}
          />
        </Card>

        <Card title="Before you create one">
          <div className="space-y-3 text-sm text-text-muted">
            <Meaning
              title="Use one integration per real app or workload"
              body="Treat this like an app identity, not a temporary test label. It should stay meaningful in audit logs and spend reports."
            />
            <Meaning
              title="Bind the owner and environment early"
              body="Owner, environment, and runbook fields keep the integration healthy later, especially once more than one app is live."
            />
            <Meaning
              title="Keep secret ownership explicit"
              body="Link the right provider credential and ingest source so proxy traffic and observe-mode events resolve to the same app identity."
            />
          </div>
        </Card>
      </div>

      <Card title="Stored integrations" description="Edit these in place. The integration ID is the piece your app can carry in env vars or request headers.">
        <div className="space-y-4">
          {integrationRows.map(({ integration, health }) => {
            const providerConfig = getProviderConfig(providerNameToSlug(integration.provider.name));
            const rollout = integration.mode === "OBSERVE" ? "observe" : integration.mode === "ENFORCE" ? "enforce" : "fallback";
            return (
              <div key={integration.id} className="rounded-lg border border-border-subtle bg-background p-4">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ProviderChip name={integration.provider.name} />
                      <strong className="text-on-surface">{integration.name}</strong>
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                          healthToneClasses(health.status),
                        ].join(" ")}
                      >
                        {health.label}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-text-muted">
                      <span>Mode: {integration.mode.toLowerCase()}</span>
                      <span>Environment: {integration.environment ?? "not set"}</span>
                      <span>Agent: {integration.agentName ?? "not set"}</span>
                      <span>Owner: {integration.ownerName ?? "not set"}</span>
                      <span>Usage events: {integration._count.usageEvents}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-text-muted">
                      Last seen:{" "}
                      {integration.lastSeenAt
                        ? `${formatDateTime(integration.lastSeenAt)} (${formatRelativeTime(integration.lastSeenAt)})`
                        : "never"}
                    </div>
                    <div className="mt-1 text-[12px] text-text-muted">
                      Last verified:{" "}
                      {integration.lastVerifiedAt
                        ? `${formatDateTime(integration.lastVerifiedAt)} (${formatRelativeTime(integration.lastVerifiedAt)})`
                        : "never"}
                    </div>
                    <div className="mt-3 rounded-lg border border-border-subtle bg-surface-2 p-3 text-[12px] text-text-muted">
                      <strong className="block text-on-surface">{health.summary}</strong>
                      <span className="mt-1 block">{health.nextAction}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/gateway?provider=${providerNameToSlug(integration.provider.name)}&mode=${rollout}&integration=${integration.id}`}
                      className="rounded-lg border border-primary/40 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
                    >
                      Open onboarding
                    </Link>
                    <Link
                      href={`/settings/integrations/${integration.id}`}
                      className="rounded-lg border border-border-subtle px-3 py-2 text-xs font-semibold text-on-surface hover:border-primary"
                    >
                      Details
                    </Link>
                    <form action={markIntegrationVerifiedAction}>
                      <input type="hidden" name="id" value={integration.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-status-normal/40 px-3 py-2 text-xs font-semibold text-status-normal hover:bg-status-normal/10"
                      >
                        Mark verified
                      </button>
                    </form>
                    <form action={deleteIntegrationAction}>
                      <input type="hidden" name="id" value={integration.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-status-exceeded/40 px-3 py-2 text-xs font-semibold text-status-exceeded hover:bg-status-exceeded/10"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr,1fr]">
                  <form action={saveIntegrationAction} className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input type="hidden" name="id" value={integration.id} />
                    <input type="hidden" name="organizationId" value={org.id} />

                    <Field label="Integration name">
                      <input name="name" defaultValue={integration.name} required className={inputCls} />
                    </Field>

                    <Field label="Provider">
                      <select name="providerId" defaultValue={integration.providerId} className={inputCls}>
                        {providers.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Rollout mode">
                      <select name="mode" defaultValue={integration.mode} className={inputCls}>
                        <option value="OBSERVE">Observe only</option>
                        <option value="FALLBACK">Observe + fallback</option>
                        <option value="ENFORCE">Enforce through Tokenometer</option>
                      </select>
                    </Field>

                    <Field label="Environment">
                      <input name="environment" defaultValue={integration.environment ?? ""} placeholder="production" className={inputCls} />
                    </Field>

                    <Field label="Agent name">
                      <input name="agentName" defaultValue={integration.agentName ?? ""} placeholder="support-bot" className={inputCls} />
                    </Field>

                    <Field label="Owner name">
                      <input name="ownerName" defaultValue={integration.ownerName ?? ""} placeholder="Platform Team" className={inputCls} />
                    </Field>

                    <Field label="Owner email">
                      <input name="ownerEmail" defaultValue={integration.ownerEmail ?? ""} placeholder="platform@example.com" className={inputCls} />
                    </Field>

                    <Field label="Runbook URL">
                      <input name="runbookUrl" defaultValue={integration.runbookUrl ?? ""} placeholder="https://docs.example.com/tokenometer-runbook" className={inputCls} />
                    </Field>

                    <Field label="Active">
                      <select name="active" defaultValue={integration.active ? "true" : "false"} className={inputCls}>
                        <option value="true">Active</option>
                        <option value="false">Paused</option>
                      </select>
                    </Field>

                    <Field label="Credential">
                      <select name="credentialId" defaultValue={integration.credentialId ?? ""} className={inputCls}>
                        <option value="">Use latest org credential</option>
                        {credentials
                          .filter((credential) => credential.providerId === integration.providerId)
                          .map((credential) => (
                            <option key={credential.id} value={credential.id}>
                              {credential.label} / ****{credential.keyHint}
                            </option>
                          ))}
                      </select>
                    </Field>

                    <Field label="Ingest source">
                      <select name="ingestSourceId" defaultValue={integration.ingestSourceId ?? ""} className={inputCls}>
                        <option value="">No fixed ingest source</option>
                        {ingestSources.map((source) => (
                          <option key={source.id} value={source.id}>
                            {source.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Project">
                      <select name="projectId" defaultValue={integration.projectId ?? ""} className={inputCls}>
                        <option value="">No fixed project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Team">
                      <select name="teamId" defaultValue={integration.teamId ?? ""} className={inputCls}>
                        <option value="">No fixed team</option>
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Notes" full>
                      <textarea
                        name="notes"
                        defaultValue={integration.notes ?? ""}
                        rows={3}
                        placeholder="Why this integration exists, who owns it, rollout notes..."
                        className={inputCls}
                      />
                    </Field>

                    <div className="md:col-span-2 flex justify-end">
                      <button
                        type="submit"
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-primary-container"
                      >
                        Save integration
                      </button>
                    </div>
                  </form>

                  <div className="space-y-3">
                    <div className="rounded-lg border border-border-subtle bg-surface-2 p-3">
                      <div className="text-[11px] uppercase tracking-wider text-text-muted">Integration ID</div>
                      <div className="mt-1 break-all font-mono text-[12px] text-on-surface">{integration.id}</div>
                    </div>
                    <div className="rounded-lg border border-border-subtle bg-surface-2 p-3">
                      <div className="text-[11px] uppercase tracking-wider text-text-muted">Linked secrets</div>
                      <div className="mt-1 text-[12px] text-text-muted">
                        Credential: {health.resolvedCredentialLabel}
                      </div>
                      <div className="mt-1 text-[12px] text-text-muted">
                        Ingest source: {health.resolvedIngestLabel}
                      </div>
                      <div className="mt-1 text-[12px] text-text-muted">
                        Freshness threshold: {health.staleThresholdHours}h
                      </div>
                      <div className="mt-1 text-[12px] text-text-muted">
                        Rotation window: {health.rotationWindowDays} days
                      </div>
                    </div>
                    <div className="rounded-lg border border-border-subtle bg-surface-2 p-3">
                      <div className="text-[11px] uppercase tracking-wider text-text-muted">Health checks</div>
                      {health.issues.length === 0 ? (
                        <div className="mt-2 text-[12px] text-status-normal">No active issues.</div>
                      ) : (
                        <ul className="mt-2 space-y-1 text-[12px] text-text-muted">
                          {health.issues.map((issue) => (
                            <li key={issue}>- {issue}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="rounded-lg border border-border-subtle bg-surface-2 p-3">
                      <div className="text-[11px] uppercase tracking-wider text-text-muted">Status action</div>
                      <div className="mt-2 text-[12px] text-text-muted">{health.nextAction}</div>
                      <div className="mt-2 text-[12px] text-text-muted">
                        Provider fallback: {integration.credential ? "fixed credential" : "org default or app-managed"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border-subtle bg-surface-2 p-3">
                      <div className="text-[11px] uppercase tracking-wider text-text-muted">Ownership</div>
                      <div className="mt-1 text-[12px] text-text-muted">Owner: {integration.ownerName ?? "not set"}</div>
                      <div className="mt-1 text-[12px] text-text-muted">Email: {integration.ownerEmail ?? "not set"}</div>
                      <div className="mt-1 text-[12px] text-text-muted">
                        Runbook: {integration.runbookUrl ? "attached" : "missing"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border-subtle bg-surface-2 p-3">
                      <div className="text-[11px] uppercase tracking-wider text-text-muted">Suggested env block</div>
                      <pre className="mt-2 overflow-auto font-mono text-[12px] leading-relaxed text-text-muted">
                        {envBlock(
                          process.env.NEXT_PUBLIC_APP_URL ?? "https://www.tokenometer.cloud",
                          providerConfig,
                          getRolloutConfig(
                            integration.mode === "OBSERVE"
                              ? "observe"
                              : integration.mode === "ENFORCE"
                                ? "enforce"
                                : "fallback",
                          ),
                          integration.ingestSource?.name ?? ingest?.name ?? "Default",
                          {
                            integrationId: integration.id,
                            project: integration.project?.name ?? undefined,
                            agent: integration.agentName ?? undefined,
                          },
                        )}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {integrations.length === 0 && (
            <div className="rounded-lg border border-dashed border-border-subtle bg-background p-6 text-center text-sm text-text-muted">
              No named integrations yet. Create the first one above, then use its ID in your app env or proxy headers.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function IntegrationForm({
  organizationId,
  providers,
  credentials,
  ingestSources,
  projects,
  teams,
}: {
  organizationId: string;
  providers: Array<{ id: string; name: string }>;
  credentials: Array<{ id: string; providerId: string; label: string; keyHint: string }>;
  ingestSources: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string; team: { name: string } | null }>;
  teams: Array<{ id: string; name: string }>;
}) {
  return (
    <form action={saveIntegrationAction} className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <input type="hidden" name="organizationId" value={organizationId} />

      <Field label="Integration name">
        <input name="name" required placeholder="customer-support-prod" className={inputCls} />
      </Field>

      <Field label="Provider">
        <select name="providerId" required className={inputCls}>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Rollout mode">
        <select name="mode" defaultValue="FALLBACK" className={inputCls}>
          <option value="OBSERVE">Observe only</option>
          <option value="FALLBACK">Observe + fallback</option>
          <option value="ENFORCE">Enforce through Tokenometer</option>
        </select>
      </Field>

      <Field label="Environment">
        <input name="environment" placeholder="production" className={inputCls} />
      </Field>

      <Field label="Agent name">
        <input name="agentName" placeholder="support-bot" className={inputCls} />
      </Field>

      <Field label="Owner name">
        <input name="ownerName" placeholder="Platform Team" className={inputCls} />
      </Field>

      <Field label="Owner email">
        <input name="ownerEmail" placeholder="platform@example.com" className={inputCls} />
      </Field>

      <Field label="Runbook URL">
        <input name="runbookUrl" placeholder="https://docs.example.com/tokenometer-runbook" className={inputCls} />
      </Field>

      <Field label="Credential">
        <select name="credentialId" className={inputCls}>
          <option value="">Use latest org credential</option>
          {credentials.map((credential) => (
            <option key={credential.id} value={credential.id}>
              {credential.label} / ****{credential.keyHint}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Ingest source">
        <select name="ingestSourceId" className={inputCls}>
          <option value="">No fixed ingest source</option>
          {ingestSources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Project">
        <select name="projectId" className={inputCls}>
          <option value="">No fixed project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
              {project.team ? ` (${project.team.name})` : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Team">
        <select name="teamId" className={inputCls}>
          <option value="">No fixed team</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Active">
        <select name="active" defaultValue="true" className={inputCls}>
          <option value="true">Active</option>
          <option value="false">Paused</option>
        </select>
      </Field>

      <Field label="Notes" full>
        <textarea
          name="notes"
          rows={3}
          placeholder="Owner, deployment, or rollout note"
          className={inputCls}
        />
      </Field>

      <div className="md:col-span-2 flex justify-end">
        <button
          type="submit"
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-primary-container"
        >
          Create integration
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={full ? "md:col-span-2" : ""}>
      <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      {children}
    </label>
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

function providerNameToSlug(name: string): ProviderSlug {
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

const inputCls =
  "w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-on-surface placeholder:text-text-muted focus:border-primary focus:outline-none";
