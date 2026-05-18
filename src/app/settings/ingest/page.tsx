import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import {
  createIngestSourceAction,
  rotateIngestSecretAction,
  deleteIngestSourceAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function IngestPage() {
  const org = await prisma.organization.findFirst();
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  const sources = await prisma.ingestSource.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
  });

  const sampleEvent = JSON.stringify(
    {
      events: [
        {
          timestamp: new Date().toISOString(),
          provider: "OpenAI",
          model: "gpt-4o-mini",
          inputTokens: 1200,
          outputTokens: 300,
          project: "Support Copilot",
          agent: "intent-router",
          owner: "alice@acme.io",
        },
      ],
    },
    null,
    2
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ingest API & webhooks"
        description="Push usage events from your services with HMAC-signed POST /api/ingest."
      />

      <Card title="Create a new ingest source">
        <form action={createIngestSourceAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input type="hidden" name="organizationId" value={org.id} />
          <Field label="Name (e.g. 'Production backend')">
            <input type="text" name="name" required maxLength={60} className={inputCls} />
          </Field>
          <div className="flex items-end justify-end">
            <button
              type="submit"
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-primary-container"
            >
              Generate API key + secret
            </button>
          </div>
        </form>
      </Card>

      <Card title="Active sources">
        {sources.length === 0 ? (
          <p className="text-text-muted">No ingest sources yet.</p>
        ) : (
          <div className="space-y-3">
            {sources.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-border-subtle bg-background p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-display font-semibold text-on-surface">{s.name}</div>
                    <div className="text-[12px] text-text-muted">
                      Last seen: {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString() : "never"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <form action={rotateIngestSecretAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="rounded border border-border-subtle px-3 py-1.5 text-xs hover:border-primary">
                        Rotate secret
                      </button>
                    </form>
                    <form action={deleteIngestSourceAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="rounded border border-border-subtle px-3 py-1.5 text-xs text-status-exceeded hover:border-status-exceeded">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <KV k="X-Ingest-Key" v={s.apiKey} mono />
                  <KV
                    k="HMAC secret"
                    v={s.secret}
                    mono
                    warn
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="How to call /api/ingest" description="Sign the raw body with HMAC-SHA256 using your secret.">
        <div className="space-y-3">
          <h4 className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">
            Curl example
          </h4>
          <pre className="overflow-auto rounded-lg border border-border-subtle bg-background p-4 font-mono text-[12px] text-text-muted">
{`# 1. Compute the signature
BODY='${sampleEvent.replace(/\n/g, " ")}'
SIG=$(printf "%s" "$BODY" | openssl dgst -sha256 -hmac "<your-secret>" -hex | cut -d' ' -f2)

# 2. Send the request
curl -X POST http://localhost:3000/api/ingest \\
  -H "Content-Type: application/json" \\
  -H "X-Ingest-Key: <your-api-key>" \\
  -H "X-Ingest-Signature: sha256=$SIG" \\
  -d "$BODY"`}
          </pre>

          <h4 className="text-[12px] font-semibold uppercase tracking-wider text-text-muted mt-4">
            Sample payload
          </h4>
          <pre className="overflow-auto rounded-lg border border-border-subtle bg-background p-4 font-mono text-[12px] text-text-muted">
{sampleEvent}
          </pre>
        </div>
      </Card>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-on-surface placeholder:text-text-muted focus:border-primary focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function KV({ k, v, mono, warn }: { k: string; v: string; mono?: boolean; warn?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-text-muted">{k}</div>
      <div
        className={
          "mt-1 break-all rounded border border-border-subtle bg-surface px-2 py-1.5 text-[12px] " +
          (mono ? "font-mono " : "") +
          (warn ? "text-status-warning" : "text-on-surface")
        }
      >
        {v}
      </div>
    </div>
  );
}
