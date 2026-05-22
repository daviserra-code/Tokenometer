import clsx from "clsx";
import Link from "next/link";

import { Card, PageHeader } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { KpiCard } from "@/components/KpiCard";
import { ProviderTag } from "@/components/ProviderChip";
import { requireAdmin } from "@/lib/auth";
import {
  formatCurrency,
  formatDateTime,
  formatRelativeTime,
  formatTokens,
  toNumber,
} from "@/lib/format";
import { prisma } from "@/lib/prisma";

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

type ProviderSlug = "openai" | "anthropic" | "google" | "mistral" | "github";
type RolloutSlug = "observe" | "fallback" | "enforce";

type SearchParams = {
  provider?: string;
  mode?: string;
};

type ProviderConfig = {
  slug: ProviderSlug;
  name: string;
  endpoint: string;
  historical: string;
  live: string;
  streaming: string;
  model: string;
  envVar: string;
  nodeFunction: string;
  pythonFunction: string;
  defaultProject: string;
  defaultAgent: string;
  openAiBody?: boolean;
};

type RolloutConfig = {
  slug: RolloutSlug;
  label: string;
  runtimeMode: "shadow" | "proxy";
  fallbackAllowed: boolean;
  requiresProviderKeyInApp: boolean;
  requiresIngestSecret: boolean;
  promise: string;
  caution: string;
  bestFor: string;
};

const PROVIDERS: ProviderConfig[] = [
  {
    slug: "openai",
    name: "OpenAI",
    endpoint: "/api/proxy/openai/chat/completions",
    historical: "Admin key",
    live: "Response usage",
    streaming: "Yes",
    model: "gpt-4o-mini",
    envVar: "OPENAI_API_KEY",
    nodeFunction: "callOpenAiChat",
    pythonFunction: "call_openai_chat",
    defaultProject: "customer-support",
    defaultAgent: "support-bot",
    openAiBody: true,
  },
  {
    slug: "anthropic",
    name: "Anthropic",
    endpoint: "/api/proxy/anthropic/v1/messages",
    historical: "Admin key",
    live: "Response usage",
    streaming: "Yes",
    model: "claude-3-5-haiku-latest",
    envVar: "ANTHROPIC_API_KEY",
    nodeFunction: "callAnthropicMessages",
    pythonFunction: "call_anthropic_messages",
    defaultProject: "research-assistant",
    defaultAgent: "claude-worker",
  },
  {
    slug: "google",
    name: "Google",
    endpoint: "/api/proxy/google/v1beta/models/gemini-2.0-flash:generateContent",
    historical: "No public API",
    live: "Response usage",
    streaming: "Soon",
    model: "gemini-2.0-flash",
    envVar: "GEMINI_API_KEY",
    nodeFunction: "callGeminiGenerateContent",
    pythonFunction: "call_gemini_generate_content",
    defaultProject: "ops-assistant",
    defaultAgent: "gemini-runner",
  },
  {
    slug: "mistral",
    name: "Mistral",
    endpoint: "/api/proxy/mistral/v1/chat/completions",
    historical: "No public API",
    live: "Response usage",
    streaming: "Yes",
    model: "mistral-small-latest",
    envVar: "MISTRAL_API_KEY",
    nodeFunction: "callMistralChat",
    pythonFunction: "call_mistral_chat",
    defaultProject: "ops-assistant",
    defaultAgent: "mistral-worker",
    openAiBody: true,
  },
  {
    slug: "github",
    name: "GitHub",
    endpoint: "/api/proxy/github/chat/completions",
    historical: "No public API",
    live: "Response usage",
    streaming: "Yes",
    model: "openai/gpt-4o-mini",
    envVar: "GITHUB_MODELS_API_KEY",
    nodeFunction: "callGitHubModelsChat",
    pythonFunction: "call_github_models_chat",
    defaultProject: "internal-tooling",
    defaultAgent: "gh-models-worker",
    openAiBody: true,
  },
] as const;

const ROLLOUTS: RolloutConfig[] = [
  {
    slug: "observe",
    label: "Observe only",
    runtimeMode: "shadow",
    fallbackAllowed: true,
    requiresProviderKeyInApp: true,
    requiresIngestSecret: true,
    promise: "Your app still talks straight to the provider. Tokenometer receives a signed usage event afterward.",
    caution: "Safest first step, but only works if the app can report usage back after each call.",
    bestFor: "First production validation without putting continuity at risk.",
  },
  {
    slug: "fallback",
    label: "Observe + fallback",
    runtimeMode: "proxy",
    fallbackAllowed: true,
    requiresProviderKeyInApp: true,
    requiresIngestSecret: false,
    promise: "Your app prefers Tokenometer, but can fall back to the provider directly if the gateway is unavailable.",
    caution: "Great continuity story, but a few calls may bypass proxy metering during fallback windows.",
    bestFor: "Real rollout when continuity matters more than strict enforcement.",
  },
  {
    slug: "enforce",
    label: "Enforce through Tokenometer",
    runtimeMode: "proxy",
    fallbackAllowed: false,
    requiresProviderKeyInApp: false,
    requiresIngestSecret: false,
    promise: "Every measured call must pass through Tokenometer. This is the cleanest long-term operating model.",
    caution: "Use this after you trust the gateway path, because there is no direct provider escape hatch.",
    bestFor: "Steady-state production once the integration loop is already proven.",
  },
] as const;

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

  const resolvedSearchParams =
    searchParams && typeof (searchParams as Promise<SearchParams>).then === "function"
      ? await (searchParams as Promise<SearchParams>)
      : ((searchParams as SearchParams | undefined) ?? {});

  const selectedProvider =
    PROVIDERS.find((provider) => provider.slug === resolvedSearchParams.provider) ?? PROVIDERS[0];
  const selectedRollout =
    ROLLOUTS.find((rollout) => rollout.slug === resolvedSearchParams.mode) ?? ROLLOUTS[1];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.tokenometer.cloud";
  const ingest = await prisma.ingestSource.findFirst({
    where: { organizationId: org.id, active: true },
    orderBy: { createdAt: "desc" },
  });
  const credentials = await prisma.providerCredential.findMany({
    where: { organizationId: org.id, active: true },
    orderBy: { createdAt: "desc" },
  });
  const providers = await prisma.provider.findMany();
  const providerById = new Map(providers.map((provider) => [provider.id, provider.name]));
  const credentialByProvider = new Map<
    string,
    { id: string; label: string; keyHint: string; lastUsedAt: Date | null; updatedAt: Date }
  >();

  for (const credential of credentials) {
    const providerName = providerById.get(credential.providerId);
    if (providerName && !credentialByProvider.has(providerName)) {
      credentialByProvider.set(providerName, {
        id: credential.id,
        label: credential.label,
        keyHint: credential.keyHint,
        lastUsedAt: credential.lastUsedAt,
        updatedAt: credential.updatedAt,
      });
    }
  }

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr,1fr]">
        <Card title="Choose the provider you are wiring next" description="This is the integration surface for Epic 3. Pick one app, one provider, one rollout mode.">
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map((provider) => (
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
            {ROLLOUTS.map((rollout) => (
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
            {envBlock(appUrl, selectedProvider, selectedRollout, ingest?.name ?? "Default")}
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
        <SnippetCard title={`Node.js: ${selectedProvider.name} in ${selectedRollout.label}`} code={nodeSnippet(selectedProvider, selectedRollout)} />
        <SnippetCard title={`Python: ${selectedProvider.name} in ${selectedRollout.label}`} code={pythonSnippet(selectedProvider, selectedRollout)} />
      </div>

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
              {PROVIDERS.map((provider) => {
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

function buildGatewayHref(provider: ProviderSlug, mode: RolloutSlug) {
  return `/gateway?provider=${provider}&mode=${mode}`;
}

function getNextAction({
  ingestReady,
  providerKeyReady,
  shadowReady,
  latestEventReady,
  rollout,
}: {
  ingestReady: boolean;
  providerKeyReady: boolean;
  shadowReady: boolean;
  latestEventReady: boolean;
  rollout: RolloutConfig;
}) {
  if (!providerKeyReady) return "Vault the provider key first in Settings -> Credentials.";
  if (!ingestReady) return "Create an ingest source so the app has an x-ingest-key to send.";
  if (rollout.requiresIngestSecret && !shadowReady) return "Rotate or recreate the ingest source so shadow mode has a signing secret.";
  if (!latestEventReady) return "Run the guided provider test, then confirm the event on Gateway and Ledger.";
  if (rollout.slug === "observe") return "Wire one low-risk app in shadow mode and verify the post-call ingest event lands every time.";
  if (rollout.slug === "fallback") return "Switch one app to proxy mode with direct fallback enabled, then watch Gateway for fresh request IDs.";
  return "Move one trusted app to strict proxy mode and keep Gateway open while the first real production traffic flows.";
}

function recommendMode(isSelected: boolean, hasLiveEvent: boolean) {
  if (isSelected) return "Selected here";
  if (!hasLiveEvent) return "Observe only first";
  return "Observe + fallback";
}

function envBlock(appUrl: string, provider: ProviderConfig, rollout: RolloutConfig, ingestName: string) {
  const lines = [
    `TOKENOMETER_BASE_URL=${appUrl}`,
    `AI_METERING_MODE=${rollout.runtimeMode}`,
    `TOKENOMETER_INGEST_KEY=tmtr_ingest_key_from_${slugify(ingestName)}`,
    `TOKENOMETER_PROJECT=${provider.defaultProject}`,
    `TOKENOMETER_AGENT=${provider.defaultAgent}`,
  ];

  if (rollout.requiresProviderKeyInApp) {
    lines.push(`${provider.envVar}=your_provider_key_here`);
  }

  if (rollout.requiresIngestSecret) {
    lines.push(`TOKENOMETER_INGEST_SECRET=your_ingest_secret_here`);
  }

  if (provider.slug === "google") {
    lines.push(`GEMINI_MODEL=${provider.model}`);
  } else {
    lines.push(`OPENMODEL_NAME=${provider.model}`);
  }

  if (rollout.slug !== "enforce") {
    lines.push(`TOKENOMETER_ALLOW_DIRECT_FALLBACK=${rollout.fallbackAllowed ? "true" : "false"}`);
  }

  return lines.join("\n");
}

function nodeSnippet(provider: ProviderConfig, rollout: RolloutConfig) {
  const body = providerNodeBody(provider);
  const providerKeyArg = rollout.requiresProviderKeyInApp
    ? `,
  process.env.${provider.envVar}`
    : "";

  const invocation =
    provider.slug === "google"
      ? `const result = await ${provider.nodeFunction}(config, process.env.GEMINI_MODEL || "${provider.model}", ${body}${providerKeyArg});`
      : `const result = await ${provider.nodeFunction}(config, ${body}${providerKeyArg});`;

  return `import {
  ${provider.nodeFunction},
  type AdapterConfig,
} from "./tokenometer-adapter";

const config: AdapterConfig = {
  mode: "${rollout.runtimeMode}",
  tokenometerBaseUrl: process.env.TOKENOMETER_BASE_URL || "https://www.tokenometer.cloud",
  ingestKey: process.env.TOKENOMETER_INGEST_KEY,
  ingestSecret: process.env.TOKENOMETER_INGEST_SECRET,
  project: process.env.TOKENOMETER_PROJECT || "${provider.defaultProject}",
  agent: process.env.TOKENOMETER_AGENT || "${provider.defaultAgent}",
  allowDirectFallback: ${rollout.fallbackAllowed ? "true" : "false"},
};

${invocation}
console.log(result.requestId, result.modeUsed, result.meteredVia);`;
}

function pythonSnippet(provider: ProviderConfig, rollout: RolloutConfig) {
  const body = providerPythonBody(provider);
  const providerKeyArg = rollout.requiresProviderKeyInApp
    ? `,
    provider_api_key=os.environ.get("${provider.envVar}")`
    : "";

  const invocation =
    provider.slug === "google"
      ? `result = ${provider.pythonFunction}(
    config=config,
    model=os.environ.get("GEMINI_MODEL", "${provider.model}"),
    body=${body}${providerKeyArg},
)`
      : `result = ${provider.pythonFunction}(
    config=config,
    body=${body}${providerKeyArg},
)`;

  return `import json
import os

from tokenometer_adapter import AdapterConfig, ${provider.pythonFunction}

config = AdapterConfig(
    mode="${rollout.runtimeMode}",
    tokenometer_base_url=os.environ.get("TOKENOMETER_BASE_URL", "https://www.tokenometer.cloud"),
    ingest_key=os.environ.get("TOKENOMETER_INGEST_KEY"),
    ingest_secret=os.environ.get("TOKENOMETER_INGEST_SECRET"),
    project=os.environ.get("TOKENOMETER_PROJECT", "${provider.defaultProject}"),
    agent=os.environ.get("TOKENOMETER_AGENT", "${provider.defaultAgent}"),
    allow_direct_fallback=${rollout.fallbackAllowed ? "True" : "False"},
)

${invocation}
print(json.dumps({
    "request_id": result["request_id"],
    "mode_used": result["mode_used"],
    "metered_via": result["metered_via"],
}, indent=2))`;
}

function providerNodeBody(provider: ProviderConfig) {
  if (provider.slug === "anthropic") {
    return `{
  model: "${provider.model}",
  max_tokens: 120,
  messages: [{ role: "user", content: "Summarize our onboarding status in one sentence." }],
}`;
  }

  if (provider.slug === "google") {
    return `{
  contents: [
    {
      role: "user",
      parts: [{ text: "Summarize our onboarding status in one sentence." }],
    },
  ],
}`;
  }

  return `{
  model: "${provider.model}",
  messages: [{ role: "user", content: "Summarize our onboarding status in one sentence." }],
}`;
}

function providerPythonBody(provider: ProviderConfig) {
  if (provider.slug === "anthropic") {
    return `{
        "model": "${provider.model}",
        "max_tokens": 120,
        "messages": [{"role": "user", "content": "Summarize our onboarding status in one sentence."}],
    }`;
  }

  if (provider.slug === "google") {
    return `{
        "contents": [
            {
                "role": "user",
                "parts": [{"text": "Summarize our onboarding status in one sentence."}],
            }
        ]
    }`;
  }

  return `{
        "model": "${provider.model}",
        "messages": [{"role": "user", "content": "Summarize our onboarding status in one sentence."}],
    }`;
}

function buildRolloutChecklist(provider: ProviderConfig, rollout: RolloutConfig) {
  const items = [
    {
      title: "Vault the provider key",
      body: `Store one ${provider.name} key in Settings -> Credentials so Tokenometer can test and route it.`,
    },
    {
      title: "Keep one active ingest source",
      body: rollout.requiresIngestSecret
        ? "Shadow mode needs both the ingest key and the ingest signing secret."
        : "Proxy mode needs the ingest key so the app can authenticate to Tokenometer.",
    },
    {
      title: "Run the guided provider test",
      body: `Use the ${provider.name} test card first so you get a known-good request ID to verify in Gateway and Ledger.`,
    },
    {
      title: "Wire one low-risk app",
      body:
        rollout.slug === "observe"
          ? "Keep the live request path untouched and emit the post-call usage event."
          : rollout.slug === "fallback"
            ? "Switch the app to the Tokenometer proxy and keep direct fallback enabled for continuity."
            : "Switch the app to the Tokenometer proxy and disable direct fallback once the test loop is boringly reliable.",
    },
    {
      title: "Watch fresh spend land",
      body: "Confirm the request ID, then check Ledger and Reports for a current timestamp and the expected provider/model attribution.",
    },
  ];

  return items;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
