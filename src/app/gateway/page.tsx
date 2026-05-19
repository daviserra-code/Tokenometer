import Link from "next/link";
import { Card, PageHeader } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { DataTable, type Column } from "@/components/DataTable";
import { ProviderTag } from "@/components/ProviderChip";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDateTime, formatTokens, toNumber } from "@/lib/format";
import { requireAdmin } from "@/lib/auth";

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

const PROVIDERS = [
  {
    name: "OpenAI",
    endpoint: "/api/proxy/openai/chat/completions",
    historical: "Admin key",
    live: "Response usage",
    streaming: "Yes",
    model: "gpt-4o-mini",
  },
  {
    name: "Anthropic",
    endpoint: "/api/proxy/anthropic/v1/messages",
    historical: "Admin key",
    live: "Response usage",
    streaming: "Yes",
    model: "claude-3-5-haiku-latest",
  },
  {
    name: "Google",
    endpoint: "/api/proxy/google/v1beta/models/gemini-2.0-flash:generateContent",
    historical: "No public API",
    live: "Response usage",
    streaming: "Soon",
    model: "gemini-2.0-flash",
  },
  {
    name: "Mistral",
    endpoint: "/api/proxy/mistral/v1/chat/completions",
    historical: "No public API",
    live: "Response usage",
    streaming: "Yes",
    model: "mistral-small-latest",
  },
  {
    name: "GitHub",
    endpoint: "/api/proxy/github/chat/completions",
    historical: "No public API",
    live: "Response usage",
    streaming: "Yes",
    model: "openai/gpt-4o-mini",
  },
] as const;

export default async function GatewayPage() {
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.tokenometer.cloud";
  const ingest = await prisma.ingestSource.findFirst({
    where: { organizationId: org.id, active: true },
    orderBy: { createdAt: "desc" },
  });
  const credentials = await prisma.providerCredential.findMany({
    where: { organizationId: org.id, active: true },
    orderBy: { createdAt: "desc" },
    include: { organization: true },
  });
  const providers = await prisma.provider.findMany();
  const providerById = new Map(providers.map((provider) => [provider.id, provider.name]));
  const credentialByProvider = new Map<string, { id: string; label: string; keyHint: string }>();
  for (const credential of credentials) {
    const providerName = providerById.get(credential.providerId);
    if (providerName && !credentialByProvider.has(providerName)) {
      credentialByProvider.set(providerName, {
        id: credential.id,
        label: credential.label,
        keyHint: credential.keyHint,
      });
    }
  }

  const events = await prisma.usageEvent.findMany({
    where: {
      organizationId: org.id,
      source: { startsWith: "byok-proxy" },
    },
    orderBy: { timestamp: "desc" },
    take: 10,
    include: { provider: true, model: true },
  });
  const rows: GatewayRow[] = events.map((event) => {
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
        description="Route live model calls through Tokenometer to measure tokens and cost immediately. Provider sync is only for historical reconciliation."
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Live metering" description="The reliable path" className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Step n="1" title="Vault provider key" body="Store the upstream key once. It stays encrypted in Tokenometer." />
            <Step n="2" title="Call gateway URL" body="Your app calls Tokenometer instead of calling the provider directly." />
            <Step n="3" title="See live spend" body="Tokenometer records usage, cost, model, project, and agent immediately." />
          </div>
        </Card>
        <Card title="Gateway status">
          <div className="space-y-3 text-sm">
            <StatusRow label="Active ingest source" value={ingest ? ingest.name : "Missing"} ok={Boolean(ingest)} />
            <StatusRow label="Vaulted providers" value={String(credentialByProvider.size)} ok={credentialByProvider.size > 0} />
            <StatusRow label="Recent gateway calls" value={String(rows.length)} ok={rows.length > 0} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Recent calls"
          value={String(rows.length)}
          hint="latest live traces"
          icon="quick_reference"
        />
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
        <KpiCard
          label="Busiest provider"
          value={busiestProvider}
          hint="from recent traces"
          icon="hub"
        />
      </div>

      <Card title="Provider routes" description="Historical sync is optional; live metering works when responses include usage data." noPadding>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[12px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Provider</th>
                <th className="px-4 py-3 text-left">Gateway endpoint</th>
                <th className="px-4 py-3 text-left">Vault</th>
                <th className="px-4 py-3 text-left">Historical sync</th>
                <th className="px-4 py-3 text-left">Live metering</th>
                <th className="px-4 py-3 text-left">Streaming</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {PROVIDERS.map((provider) => {
                const cred = credentialByProvider.get(provider.name);
                return (
                  <tr key={provider.name}>
                    <td className="px-4 py-3"><ProviderTag name={provider.name} /></td>
                    <td className="px-4 py-3 font-mono text-[12px] text-text-muted">{provider.endpoint}</td>
                    <td className="px-4 py-3">
                      {cred ? (
                        <span className="text-status-normal">{cred.label} / ****{cred.keyHint}</span>
                      ) : (
                        <span className="text-status-warning">No key</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{provider.historical}</td>
                    <td className="px-4 py-3 text-status-normal">{provider.live}</td>
                    <td className="px-4 py-3 text-text-muted">{provider.streaming}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SnippetCard
          title="Node.js: OpenAI through Tokenometer"
          code={nodeSnippet(appUrl)}
        />
        <SnippetCard
          title="Python: OpenAI through Tokenometer"
          code={pythonSnippet(appUrl)}
        />
      </div>

      <Card title="Benchmark from your machine" description="Use the local script to get a first read on gateway overhead.">
        <pre className="overflow-auto rounded-lg border border-border-subtle bg-background p-4 font-mono text-[12px] leading-relaxed text-text-muted">{benchmarkSnippet()}</pre>
      </Card>

      <Card title="Recent gateway calls" description="Only live metered BYOK proxy calls, not demo data." noPadding>
        <DataTable columns={cols} rows={rows} rowKey={(row) => row.id} />
      </Card>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-background p-4">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-on-primary">
        {n}
      </div>
      <h3 className="font-display text-body-md font-semibold text-on-surface">{title}</h3>
      <p className="mt-1 text-[12px] text-text-muted">{body}</p>
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

function SnippetCard({ title, code }: { title: string; code: string }) {
  return (
    <Card title={title}>
      <pre className="overflow-auto rounded-lg border border-border-subtle bg-background p-4 font-mono text-[12px] leading-relaxed text-text-muted">
        {code}
      </pre>
    </Card>
  );
}

function nodeSnippet(appUrl: string) {
  return `const ingestKey = process.env.TOKENOMETER_INGEST_KEY;
if (!ingestKey) throw new Error("Set TOKENOMETER_INGEST_KEY first.");

const res = await fetch("${appUrl}/api/proxy/openai/chat/completions", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-ingest-key": ingestKey,
    "x-project": "My App",
    "x-agent": "support-bot",
    "x-request-id": crypto.randomUUID()
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    stream: true,
    messages: [{ role: "user", content: "Hello from Tokenometer" }]
  })
});

console.log(res.headers.get("x-request-id"));
console.log(await res.text());`;
}

function pythonSnippet(appUrl: string) {
  return `import os
import uuid

import requests

ingest_key = os.environ.get("TOKENOMETER_INGEST_KEY")
if not ingest_key:
    raise RuntimeError("Set TOKENOMETER_INGEST_KEY first.")

res = requests.post(
    "${appUrl}/api/proxy/openai/chat/completions",
    headers={
        "content-type": "application/json",
        "x-ingest-key": ingest_key,
        "x-project": "My App",
        "x-agent": "support-bot",
        "x-request-id": str(uuid.uuid4()),
    },
    json={
        "model": "gpt-4o-mini",
        "stream": False,
        "messages": [{"role": "user", "content": "Hello from Tokenometer"}],
    },
)

print(res.headers.get("x-request-id"))
print(res.json())`;
}

function benchmarkSnippet() {
  return `$env:TOKENOMETER_INGEST_KEY="your_ingest_key"
$env:TOKENOMETER_REQUESTS="5"
$env:TOKENOMETER_CONCURRENCY="2"
python .\\tests\\benchmark_tokenometer.py`;
}
