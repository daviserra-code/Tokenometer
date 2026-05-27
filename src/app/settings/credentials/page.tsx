import Link from "next/link";
import { cookies } from "next/headers";

import { Card, PageHeader } from "@/components/Card";
import { ProviderChip } from "@/components/ProviderChip";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import {
  buildGatewayHref,
  envBlock,
  getNextAction,
  getProviderConfig,
  getRolloutConfig,
  INTEGRATION_PROVIDERS,
  INTEGRATION_ROLLOUTS,
  type ProviderSlug,
  type RolloutSlug,
} from "@/lib/integration-onboarding";
import { PROVIDER_TESTS } from "@/lib/provider-tests";
import { prisma } from "@/lib/prisma";
import { ensureRuntimeProviderCatalog } from "@/lib/runtime-provider-catalog";

import {
  deleteCredentialAction,
  saveCredentialAction,
  syncCredentialAction,
  testCredentialAction,
} from "../actions";

export const dynamic = "force-dynamic";

type FlashState = {
  provider: string;
  ok: boolean;
  message?: string;
  inserted?: number;
  skipped?: number;
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

type SearchParams = {
  provider?: string;
  mode?: string;
  integration?: string;
};

type IntegrationStatusRow = {
  key: string;
  provider: string;
  integrationName: string;
  project: string;
  agent: string;
  source: string;
  model: string;
  lastSeen: Date;
  calls: number;
};

export default async function CredentialsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  requireAdmin();
  const org = await prisma.organization.findFirst();
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;
  await ensureRuntimeProviderCatalog(org.id, org.currency);

  const resolvedSearchParams =
    searchParams && typeof (searchParams as Promise<SearchParams>).then === "function"
      ? await (searchParams as Promise<SearchParams>)
      : ((searchParams as SearchParams | undefined) ?? {});

  const providers = await prisma.provider.findMany({ orderBy: { name: "asc" } });
  const creds = await prisma.providerCredential.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
  });
  const ingest = await prisma.ingestSource.findFirst({
    where: { organizationId: org.id, active: true },
    orderBy: { createdAt: "desc" },
  });
  const [recentProxyEvents, integrations] = await Promise.all([
    prisma.usageEvent.findMany({
      where: {
        organizationId: org.id,
        source: { startsWith: "byok-proxy" },
      },
      orderBy: { timestamp: "desc" },
      take: 50,
      include: { provider: true, model: true, project: true, team: true },
    }),
    prisma.integration.findMany({
      where: { organizationId: org.id },
      include: {
        provider: true,
        credential: true,
        ingestSource: true,
        project: true,
        team: true,
        _count: { select: { usageEvents: true } },
      },
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
    }),
  ]);

  const providerById = Object.fromEntries(providers.map((provider) => [provider.id, provider]));
  const credentialByProvider = new Map(
    creds
      .map((credential) => {
        const providerName = providerById[credential.providerId]?.name;
        return providerName ? [providerName, credential] : null;
      })
      .filter((entry): entry is [string, (typeof creds)[number]] => Boolean(entry)),
  );
  const latestProxyByProvider = new Map<string, Date>();
  for (const event of recentProxyEvents) {
    if (!latestProxyByProvider.has(event.provider.name)) {
      latestProxyByProvider.set(event.provider.name, event.timestamp);
    }
  }
  const latestProxyEvent = recentProxyEvents[0] ?? null;
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
  const selectedCredential = credentialByProvider.get(selectedProvider.name);
  const selectedLatestEvent = latestProxyByProvider.get(selectedProvider.name);
  const shadowReady = Boolean(ingest?.secret || ingest?.encryptedSecret || ingest?.secretHint);
  const modeReady =
    Boolean(ingest) &&
    (!selectedRollout.requiresProviderKeyInApp || Boolean(selectedCredential)) &&
    (!selectedRollout.requiresIngestSecret || shadowReady);
  const nextAction = getNextAction({
    ingestReady: Boolean(ingest),
    providerKeyReady: Boolean(selectedCredential),
    shadowReady,
    latestEventReady: Boolean(selectedLatestEvent),
    rollout: selectedRollout,
  });
  const integrationRows = buildIntegrationRows(recentProxyEvents);

  const flashRaw = cookies().get("sync-flash")?.value;
  const verificationRaw = cookies().get("verification-flash")?.value;
  let flash: FlashState | null = null;
  let verification: VerificationFlashState | null = null;
  if (flashRaw) {
    try {
      flash = JSON.parse(flashRaw) as FlashState;
    } catch {
      flash = null;
    }
  }
  if (verificationRaw) {
    try {
      verification = JSON.parse(verificationRaw) as VerificationFlashState;
    } catch {
      verification = null;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Provider credentials"
        description="Vault provider keys here, then prove the spending loop with one real test request. Historical sync is optional; live metering is the main path."
      />

      {flash && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            flash.ok
              ? "border-status-normal/40 bg-status-normal/10 text-status-normal"
              : "border-status-exceeded/40 bg-status-exceeded/10 text-status-exceeded"
          }`}
        >
          <strong className="font-semibold">{flash.provider} - </strong>
          <span className="break-all">{flash.message ?? (flash.ok ? "Done." : "Failed.")}</span>
          {flash.ok && typeof flash.inserted === "number" && flash.inserted > 0 && (
            <span className="ml-2 text-text-muted">(inserted {flash.inserted}, skipped {flash.skipped ?? 0})</span>
          )}
        </div>
      )}

      {verification && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            verification.ok
              ? "border-status-normal/40 bg-status-normal/10 text-status-normal"
              : "border-status-warning/40 bg-status-warning/10 text-status-warning"
          }`}
        >
          <strong className="font-semibold">{verification.provider} guided test</strong>
          <span className="ml-2">{verification.message}</span>
          <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-text-muted">
            {verification.model && <span>Model: {verification.model}</span>}
            {verification.requestId && <span>Request ID: {verification.requestId}</span>}
            <span>{formatRelativeTime(verification.timestamp)}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr,1fr]">
        <Card
          title="Fastest path to see spend"
          description="This is the shortest reliable loop for proving Tokenometer is measuring live usage."
          action={
            <Link
              href="/gateway"
              className="rounded-lg border border-primary/40 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              Open gateway
            </Link>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <QuickStep
              n="1"
              title="Vault one key"
              body="Add one provider credential below. OpenAI, Gemini, or DeepSeek is the easiest first pass."
            />
            <QuickStep
              n="2"
              title="Confirm ingest source"
              body={ingest ? `Active now: ${ingest.name}` : "Create one active ingest source so proxy tests have a signed path."}
              href="/settings/ingest"
              cta={ingest ? "View ingest settings" : "Create ingest source"}
            />
            <QuickStep
              n="3"
              title="Click Test"
              body="Use Test on the vaulted credential. It sends one tiny real request through the gateway."
            />
            <QuickStep
              n="4"
              title="Verify the result"
              body="Check Dashboard, Gateway, Ledger, and Reports for the fresh request and spend."
              href="/gateway"
              cta="Open verification surfaces"
            />
          </div>
        </Card>

        <Card title="Live metering readiness">
          <div className="space-y-3 text-sm">
            <StatusRow label="Active ingest source" value={ingest ? ingest.name : "Missing"} ok={Boolean(ingest)} />
            <StatusRow label="Vaulted providers" value={String(credentialByProvider.size)} ok={credentialByProvider.size > 0} />
            <StatusRow
              label="Latest live request"
              value={latestProxyEvent ? formatDateTime(latestProxyEvent.timestamp) : "No live traffic yet"}
              ok={Boolean(latestProxyEvent)}
            />
          </div>
          <div className="mt-4 rounded-lg border border-border-subtle bg-background p-3 text-sm text-text-muted">
            {latestProxyEvent
              ? "Good sign: Tokenometer has already seen live proxy traffic. You can keep testing with more providers or move to app integration."
              : "No live request has landed yet. The next move is simple: ensure ingest exists, then hit Test on one credential."}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr,1fr]">
        <Card
          title="App setup generator"
          description="Pick the provider and rollout mode you want to wire next. This keeps setup, testing, and app rollout in one place."
          action={
            <Link
              href={buildGatewayHref(selectedProvider.slug, selectedRollout.slug)}
              className="rounded-lg border border-primary/40 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              Open full gateway flow
            </Link>
          }
        >
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-text-muted">Provider</div>
              <div className="flex flex-wrap gap-2">
                {INTEGRATION_PROVIDERS.map((provider) => (
                  <ChoiceLink
                    key={provider.slug}
                    href={buildCredentialsHref(provider.slug, selectedRollout.slug)}
                    active={provider.slug === selectedProvider.slug}
                    label={provider.name}
                    sublabel={provider.model}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-text-muted">Rollout mode</div>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                {INTEGRATION_ROLLOUTS.map((rollout) => (
                  <ChoiceLink
                    key={rollout.slug}
                    href={buildCredentialsHref(selectedProvider.slug, rollout.slug)}
                    active={rollout.slug === selectedRollout.slug}
                    label={rollout.label}
                    sublabel={rollout.bestFor}
                    block
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr,1fr]">
              <div className="rounded-lg border border-border-subtle bg-background p-4">
                <div className="flex items-center gap-2">
                  <ProviderChip name={selectedProvider.name} />
                  <strong className="text-on-surface">{selectedRollout.label}</strong>
                </div>
                {selectedIntegration && (
                  <div className="mt-2 text-[12px] text-text-muted">
                    Using named integration <span className="font-mono text-on-surface">{selectedIntegration.name}</span>
                    {" "}({selectedIntegration.id.slice(0, 10)}...)
                  </div>
                )}
                <p className="mt-2 text-sm text-text-muted">{selectedRollout.promise}</p>
                <pre className="mt-3 overflow-auto rounded-lg border border-border-subtle bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-text-muted">
                  {envBlock(
                    process.env.NEXT_PUBLIC_APP_URL ?? "https://www.tokenometer.cloud",
                    selectedProvider,
                    selectedRollout,
                    ingest?.name ?? "Default",
                    selectedIntegration
                      ? {
                          integrationId: selectedIntegration.id,
                          project: selectedIntegration.project?.name ?? undefined,
                          agent: selectedIntegration.agentName ?? undefined,
                        }
                      : undefined,
                  )}
                </pre>
              </div>

              <div className="rounded-lg border border-border-subtle bg-background p-4">
                <div className="space-y-2 text-sm">
                  <StatusRow
                    label="Vaulted key"
                    value={selectedCredential ? `${selectedCredential.label} / ****${selectedCredential.keyHint}` : "Missing"}
                    ok={Boolean(selectedCredential)}
                  />
                  <StatusRow label="Ingest source" value={ingest ? ingest.name : "Missing"} ok={Boolean(ingest)} />
                  <StatusRow
                    label="Latest live event"
                    value={selectedLatestEvent ? formatRelativeTime(selectedLatestEvent) : "None yet"}
                    ok={Boolean(selectedLatestEvent)}
                  />
                  <StatusRow
                    label="Mode readiness"
                    value={modeReady ? "Ready to wire" : "Needs one setup step"}
                    ok={modeReady}
                  />
                </div>
                <div className="mt-3 rounded-lg border border-border-subtle bg-surface-2 p-3 text-[12px] text-text-muted">
                  <strong className="block text-on-surface">Best next move</strong>
                  <span className="mt-1 block">{nextAction}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="What each secret really does">
          <div className="space-y-3 text-sm text-text-muted">
            <SecretMeaning
              title={`${selectedProvider.envVar}`}
              body={
                selectedRollout.requiresProviderKeyInApp
                  ? "Lives in your app when you are in Observe only or Observe + fallback mode."
                  : "Can stay vaulted inside Tokenometer once you move to Enforce through Tokenometer."
              }
            />
            <SecretMeaning
              title="TOKENOMETER_INGEST_KEY"
              body="Identifies the app to Tokenometer. This is required for every gateway path."
            />
            <SecretMeaning
              title="TOKENOMETER_INGEST_SECRET"
              body="Only needed for Observe only, where the app signs the post-call usage event."
            />
            <SecretMeaning
              title="TOKENOMETER_PROJECT + TOKENOMETER_AGENT"
              body="These are the names that make later spend views understandable. Think app/workload and worker/bot."
            />
            <SecretMeaning
              title="TOKENOMETER_INTEGRATION_ID"
              body="Optional, but strongly recommended now. It binds runtime traffic to a named integration with an explicit provider, mode, and secret ownership story."
            />
          </div>
        </Card>
      </div>

      <Card
        title="Named integrations"
        description="Epic 4 starts here: define apps as first-class objects instead of relying only on inferred traffic."
        action={
          <Link
            href="/settings/integrations"
            className="rounded-lg border border-primary/40 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            Manage integrations
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {integrations.slice(0, 6).map((integration) => (
            <Link
              key={integration.id}
              href={buildCredentialsHref(
                providerNameToSlug(integration.provider.name),
                integration.mode === "OBSERVE" ? "observe" : integration.mode === "ENFORCE" ? "enforce" : "fallback",
                integration.id,
              )}
              className="rounded-lg border border-border-subtle bg-background p-4 transition hover:border-primary/40 hover:bg-surface-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ProviderChip name={integration.provider.name} />
                    <strong className="text-on-surface">{integration.name}</strong>
                  </div>
                  <div className="mt-2 text-[12px] text-text-muted">
                    Mode {integration.mode.toLowerCase()} | Agent {integration.agentName ?? "not set"}
                  </div>
                  <div className="mt-1 text-[12px] text-text-muted">
                    Last seen {integration.lastSeenAt ? formatRelativeTime(integration.lastSeenAt) : "never"} | {integration._count.usageEvents} usage events
                  </div>
                </div>
                <span className="text-xs font-semibold text-primary">Use in setup</span>
              </div>
            </Link>
          ))}
          {integrations.length === 0 && (
            <div className="rounded-lg border border-dashed border-border-subtle bg-background p-4 text-sm text-text-muted">
              No named integrations yet. Create one in Settings -&gt; Integrations so your app setup can carry a stable identity.
            </div>
          )}
        </div>
      </Card>

      <Card title="Add or update a credential">
        <form action={saveCredentialAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input type="hidden" name="organizationId" value={org.id} />
          <Field label="Provider">
            <select name="providerId" required className={inputCls}>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Label">
            <input type="text" name="label" required defaultValue="Default" className={inputCls} />
          </Field>
          <Field label="API key (write-only)">
            <input
              type="password"
              name="apiKey"
              required
              minLength={8}
              autoComplete="off"
              placeholder="sk-..."
              className={inputCls + " font-mono"}
            />
          </Field>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-primary-container"
            >
              Vault credential
            </button>
          </div>
        </form>
      </Card>

      <Card title="Stored credentials">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-text-muted text-[12px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left">Provider</th>
                <th className="px-3 py-2 text-left">Label</th>
                <th className="px-3 py-2 text-left">Key</th>
                <th className="px-3 py-2 text-left">Last used</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {creds.map((credential) => (
                <tr key={credential.id}>
                  <td className="px-3 py-2">
                    <ProviderChip name={providerById[credential.providerId]?.name ?? "?"} />
                  </td>
                  <td className="px-3 py-2">{credential.label}</td>
                  <td className="px-3 py-2 font-mono text-text-muted">****{credential.keyHint}</td>
                  <td className="px-3 py-2 text-text-muted">
                    {credential.lastUsedAt ? new Date(credential.lastUsedAt).toLocaleString() : "-"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <form action={testCredentialAction}>
                        <input type="hidden" name="id" value={credential.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-border-subtle px-2.5 py-1 text-xs font-semibold text-on-surface hover:bg-surface-2"
                          title="Send a tiny ping through the BYOK proxy using this key"
                        >
                          Test
                        </button>
                      </form>
                      <form action={syncCredentialAction}>
                        <input type="hidden" name="id" value={credential.id} />
                        <input type="hidden" name="days" value="7" />
                        <button
                          type="submit"
                          className="rounded-md border border-primary/40 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                          title="Pull last 7 days of usage from the provider's own API (Admin key required)"
                        >
                          Sync now
                        </button>
                      </form>
                      <form action={deleteCredentialAction}>
                        <input type="hidden" name="id" value={credential.id} />
                        <button className="text-status-exceeded hover:underline">Delete</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {creds.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-text-muted">
                    No credentials vaulted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Recommended path: live metering"
        description="Historical provider sync is useful, but it depends on admin keys and provider support. Live metering is the product engine."
        action={
          <Link
            href="/gateway"
            className="rounded-lg border border-primary/40 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            Open gateway
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-3 text-sm text-text-muted sm:grid-cols-3">
          <div className="rounded-lg border border-border-subtle bg-background p-3">
            <strong className="block text-on-surface">Test key</strong>
            Sends one tiny call to prove the vaulted key can call the provider.
          </div>
          <div className="rounded-lg border border-border-subtle bg-background p-3">
            <strong className="block text-on-surface">Historical sync</strong>
            Imports old usage only when the provider exposes an admin usage API.
          </div>
          <div className="rounded-lg border border-border-subtle bg-background p-3">
            <strong className="block text-on-surface">Live metering</strong>
            Routes real app calls through Tokenometer and records tokens immediately.
          </div>
        </div>
      </Card>

      <Card title="Guided provider tests" description="Each test uses a provider-specific tiny request so the expected outcome is clear.">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {PROVIDER_TESTS.map((test) => {
            const credential = credentialByProvider.get(test.providerName);
            const latestEvent = latestProxyByProvider.get(test.providerName);
            return (
              <div key={test.providerName} className="rounded-lg border border-border-subtle bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <ProviderChip name={test.providerName} />
                      <strong className="text-on-surface">{test.title}</strong>
                    </div>
                    <p className="mt-2 text-[12px] text-text-muted">{test.summary}</p>
                  </div>
                  <span className="rounded-md border border-border-subtle px-2 py-1 font-mono text-[11px] text-text-muted">
                    {test.model}
                  </span>
                </div>
                <div className="mt-3 space-y-2 text-[12px] text-text-muted">
                  <p>{test.verifyHint}</p>
                  <p>{test.historicalNote}</p>
                  <p>
                    Latest live event:{" "}
                    <span className="text-on-surface">
                      {latestEvent ? `${formatDateTime(latestEvent)} (${formatRelativeTime(latestEvent)})` : "none yet"}
                    </span>
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {credential ? (
                    <form action={testCredentialAction}>
                      <input type="hidden" name="id" value={credential.id} />
                      <button
                        type="submit"
                        className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-primary-container"
                      >
                        Run {test.providerName} test
                      </button>
                    </form>
                  ) : (
                    <span className="rounded-lg border border-status-warning/40 px-3 py-2 text-xs font-semibold text-status-warning">
                      Vault a {test.providerName} key first
                    </span>
                  )}
                  <Link href="/gateway" className="rounded-lg border border-border-subtle px-3 py-2 text-xs font-semibold text-text-muted hover:border-primary hover:text-primary">
                    Verify in Gateway
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr,1fr]">

        <Card title="Readiness by provider" noPadding>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[12px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Provider</th>
                  <th className="px-4 py-3 text-left">Credential</th>
                  <th className="px-4 py-3 text-left">Latest live event</th>
                  <th className="px-4 py-3 text-left">Best next step</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {providers.map((provider) => {
                  const credential = credentialByProvider.get(provider.name);
                  const latestEvent = latestProxyByProvider.get(provider.name);
                  const nextStep = !credential
                    ? "Vault a key"
                    : !ingest
                      ? "Create ingest source"
                      : !latestEvent
                        ? "Click Test"
                        : "Route app traffic";

                  return (
                    <tr key={provider.id}>
                      <td className="px-4 py-3">
                        <ProviderChip name={provider.name} />
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {credential ? `${credential.label} / ****${credential.keyHint}` : "Not vaulted"}
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {latestEvent ? formatDateTime(latestEvent) : "No live event"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={nextStep === "Route app traffic" ? "text-status-normal" : "text-status-warning"}>
                          {nextStep}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Where to verify spend">
          <div className="space-y-3 text-sm text-text-muted">
            <VerifyLink
              href="/"
              title="Dashboard"
              body="Freshness banner, top-line totals, and the latest usage timestamp."
            />
            <VerifyLink
              href="/gateway"
              title="Gateway"
              body="Recent live requests, request IDs, latency, provider, model, and stream status."
            />
            <VerifyLink
              href="/ledger"
              title="Ledger"
              body="Raw usage events for the exact request that just landed."
            />
            <VerifyLink
              href="/reports"
              title="Reports"
              body="Daily, weekly, and monthly spend views after usage is recorded."
            />
          </div>
        </Card>
      </div>

      <Card
        title="Observed app traffic"
        description="This is still the inferred traffic view. It is useful, but named integrations above are now the preferred identity layer."
        noPadding
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[12px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Integration</th>
                <th className="px-4 py-3 text-left">Provider</th>
                <th className="px-4 py-3 text-left">Model</th>
                <th className="px-4 py-3 text-left">Last seen</th>
                <th className="px-4 py-3 text-left">Calls</th>
                <th className="px-4 py-3 text-left">Next action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {integrationRows.map((row) => (
                <tr key={row.key}>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <strong className="block text-on-surface">{row.integrationName}</strong>
                      <div className="text-[12px] text-text-muted">
                        Project: {row.project} | Agent: {row.agent}
                      </div>
                      <div className="text-[12px] text-text-muted">Source: {row.source}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ProviderChip name={row.provider} />
                  </td>
                  <td className="px-4 py-3 text-text-muted">{row.model}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {formatDateTime(row.lastSeen)} ({formatRelativeTime(row.lastSeen)})
                  </td>
                  <td className="px-4 py-3 text-text-muted">{row.calls}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={buildGatewayHref(providerNameToSlug(row.provider), row.calls > 0 ? "fallback" : "observe")}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Open {row.provider} onboarding
                    </Link>
                  </td>
                </tr>
              ))}
              {integrationRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-text-muted">
                    No live app traffic yet. Run a guided test first, then route one real app through Tokenometer.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="How test and sync behave">
        <ul className="space-y-2 text-sm text-text-muted">
          <li>
            <strong className="text-on-surface">Test</strong> - sends a real 5-token <span>&quot;ping&quot;</span> call through the BYOK proxy
            using this credential. Works with <strong>any</strong> key (not just Admin keys). Best way to verify the
            pipeline end-to-end and see numbers move on the dashboard immediately.
          </li>
          <li>
            <strong className="text-on-surface">OpenAI Sync</strong> - pulls daily totals from
            <code className="mx-1 rounded bg-surface-2 px-1">/v1/organization/usage/completions</code>.
            Requires an <strong>Admin API key</strong> (<code>sk-admin-...</code>). With a normal
            <code className="mx-1 rounded bg-surface-2 px-1">sk-...</code> project key, Tokenometer falls back to
            one tiny live ping and meters that call.
          </li>
          <li>
            <strong className="text-on-surface">Anthropic Sync</strong> - pulls from
            <code className="mx-1 rounded bg-surface-2 px-1">/v1/organizations/usage_report/messages</code>.
            Requires an <strong>Admin API key</strong>.
          </li>
          <li>
            <strong className="text-on-surface">Google, Mistral, and DeepSeek</strong> - no public usage API, so Sync
            sends one small real call against the upstream and meters the resulting tokens. For bulk metering, route
            your app traffic through the BYOK proxy or import a CSV.
          </li>
          <li>
            <strong className="text-on-surface">GitHub Copilot / Models</strong> - paste a fine-grained PAT with the
            <code className="mx-1 rounded bg-surface-2 px-1">models:read</code> permission. Paid usage requires
            Copilot Pro+, Business, Enterprise, or pay-as-you-go enabled at github.com/settings/billing.
          </li>
          <li>Sync is idempotent - re-running skips daily buckets already imported.</li>
        </ul>
      </Card>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-on-surface placeholder:text-text-muted focus:border-primary focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      {children}
    </label>
  );
}

function QuickStep({
  n,
  title,
  body,
  href,
  cta,
}: {
  n: string;
  title: string;
  body: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background p-4">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-slate-900">
        {n}
      </div>
      <h3 className="font-semibold text-on-surface">{title}</h3>
      <p className="mt-1 text-[12px] text-text-muted">{body}</p>
      {href && cta && (
        <Link href={href} className="mt-3 inline-flex text-xs font-semibold text-primary hover:underline">
          {cta}
        </Link>
      )}
    </div>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle/60 pb-2 last:border-0 last:pb-0">
      <span className="text-text-muted">{label}</span>
      <span className={ok ? "text-status-normal" : "text-status-warning"}>{value}</span>
    </div>
  );
}

function VerifyLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-border-subtle bg-background p-3 transition hover:border-primary/40 hover:bg-surface-2"
    >
      <strong className="block text-on-surface">{title}</strong>
      <span className="mt-1 block text-[12px] text-text-muted">{body}</span>
    </Link>
  );
}

function ChoiceLink({
  href,
  active,
  label,
  sublabel,
  block = false,
}: {
  href: string;
  active: boolean;
  label: string;
  sublabel: string;
  block?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-lg border px-3 py-3 transition",
        block ? "block" : "inline-flex items-center gap-3",
        active
          ? "border-primary bg-primary/10 text-on-surface"
          : "border-border-subtle bg-background text-text-muted hover:border-primary/40 hover:bg-surface-2",
      ].join(" ")}
    >
      <span className="block font-semibold">{label}</span>
      <span className="block text-[12px] text-text-muted">{sublabel}</span>
    </Link>
  );
}

function SecretMeaning({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background p-3">
      <strong className="block text-on-surface">{title}</strong>
      <span className="mt-1 block text-[12px] text-text-muted">{body}</span>
    </div>
  );
}

function buildCredentialsHref(provider: ProviderSlug, mode: RolloutSlug, integrationId?: string) {
  const params = new URLSearchParams({ provider, mode });
  if (integrationId) params.set("integration", integrationId);
  return `/settings/credentials?${params.toString()}`;
}

function providerNameToSlug(providerName: string): ProviderSlug {
  const found = INTEGRATION_PROVIDERS.find((provider) => provider.name === providerName);
  return found?.slug ?? "openai";
}

function buildIntegrationRows(
  events: Array<{
    provider: { name: string };
    model: { name: string };
    project: { name: string } | null;
    team: { name: string } | null;
    source: string | null;
    agentName: string | null;
    workflowName: string | null;
    requestOwner: string | null;
    timestamp: Date;
  }>,
): IntegrationStatusRow[] {
  const grouped = new Map<string, IntegrationStatusRow>();

  for (const event of events) {
    const project = event.project?.name ?? event.requestOwner ?? event.workflowName ?? event.team?.name ?? "Unassigned";
    const agent = event.agentName ?? "Unknown agent";
    const source = event.source ?? "byok-proxy";
    const integrationName = event.workflowName ?? event.requestOwner ?? `${project} / ${agent}`;
    const key = [event.provider.name, project, agent, source].join("|");
    const existing = grouped.get(key);

    if (existing) {
      existing.calls += 1;
      if (event.timestamp > existing.lastSeen) {
        existing.lastSeen = event.timestamp;
        existing.model = event.model.name;
        existing.integrationName = integrationName;
      }
      continue;
    }

    grouped.set(key, {
      key,
      provider: event.provider.name,
      integrationName,
      project,
      agent,
      source,
      model: event.model.name,
      lastSeen: event.timestamp,
      calls: 1,
    });
  }

  return Array.from(grouped.values()).sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
}
