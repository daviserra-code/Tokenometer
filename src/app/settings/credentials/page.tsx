import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { ProviderChip } from "@/components/ProviderChip";
import { requireAdmin } from "@/lib/auth";
import { cookies } from "next/headers";
import {
  saveCredentialAction,
  deleteCredentialAction,
  syncCredentialAction,
  testCredentialAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function CredentialsPage() {
  requireAdmin();
  const org = await prisma.organization.findFirst();
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  // Idempotent runtime upsert so users on older seeds still see new providers.
  for (const name of ["GitHub"] as const) {
    await prisma.provider.upsert({
      where: { name },
      create: { name, type: "HOSTED" },
      update: {},
    });
    const provider = await prisma.provider.findUnique({ where: { name } });
    if (provider) {
      await prisma.wallet.upsert({
        where: {
          organizationId_providerId: { organizationId: org.id, providerId: provider.id },
        },
        create: { organizationId: org.id, providerId: provider.id, currency: org.currency, balance: BigInt(0) },
        update: {},
      });
    }
  }

  const providers = await prisma.provider.findMany({ orderBy: { name: "asc" } });
  const creds = await prisma.providerCredential.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
  });
  const providerById = Object.fromEntries(providers.map((p) => [p.id, p]));

  const flashRaw = cookies().get("sync-flash")?.value;
  let flash: { provider: string; ok: boolean; message?: string; inserted?: number; skipped?: number } | null = null;
  if (flashRaw) {
    try {
      flash = JSON.parse(flashRaw);
    } catch {
      flash = null;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Provider credentials"
        description="Vault your API key once, then click Sync to pull usage straight from the provider — no curl, no proxy required."
      />

      {flash && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            flash.ok
              ? "border-status-normal/40 bg-status-normal/10 text-status-normal"
              : "border-status-exceeded/40 bg-status-exceeded/10 text-status-exceeded"
          }`}
        >
          <strong className="font-semibold">{flash.provider} — </strong>
          <span className="break-all">{flash.message ?? (flash.ok ? "Done." : "Failed.")}</span>
          {flash.ok && typeof flash.inserted === "number" && flash.inserted > 0 && (
            <span className="ml-2 text-text-muted">
              (inserted {flash.inserted}, skipped {flash.skipped ?? 0})
            </span>
          )}
        </div>
      )}
      <Card title="Add or update a credential">
        <form action={saveCredentialAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input type="hidden" name="organizationId" value={org.id} />
          <Field label="Provider">
            <select name="providerId" required className={inputCls}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
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
              placeholder="sk-…"
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
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {creds.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">
                    <ProviderChip name={providerById[c.providerId]?.name ?? "?"} />
                  </td>
                  <td className="px-3 py-2">{c.label}</td>
                  <td className="px-3 py-2 font-mono text-text-muted">••••{c.keyHint}</td>
                  <td className="px-3 py-2 text-text-muted">
                    {c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <form action={testCredentialAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-border-subtle px-2.5 py-1 text-xs font-semibold text-on-surface hover:bg-surface-2"
                          title="Send a tiny ping through the BYOK proxy using this key"
                        >
                          Test
                        </button>
                      </form>
                      <form action={syncCredentialAction}>
                        <input type="hidden" name="id" value={c.id} />
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
                        <input type="hidden" name="id" value={c.id} />
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

      <Card title="How sync works">
        <ul className="space-y-2 text-sm text-text-muted">
          <li>
            <strong className="text-on-surface">Test</strong> — sends a real 5-token <span>&quot;ping&quot;</span> call through the BYOK proxy
            using this credential. Works with <strong>any</strong> key (not just Admin keys). Best way to verify the
            pipeline end-to-end and see numbers move on the dashboard immediately.
          </li>
          <li>
            <strong className="text-on-surface">OpenAI Sync</strong> — pulls daily totals from
            <code className="mx-1 rounded bg-surface-2 px-1">/v1/organization/usage/completions</code>.
            Requires an <strong>Admin API key</strong> (<code>sk-admin-…</code>). With a normal
            <code className="mx-1 rounded bg-surface-2 px-1">sk-...</code> project key, Tokenometer falls back to
            one tiny live ping and meters that call.
          </li>
          <li>
            <strong className="text-on-surface">Anthropic Sync</strong> — pulls from
            <code className="mx-1 rounded bg-surface-2 px-1">/v1/organizations/usage_report/messages</code>.
            Requires an <strong>Admin API key</strong>.
          </li>
          <li>
            <strong className="text-on-surface">Google &amp; Mistral</strong> — no public usage API, so Sync sends one
            small real call against the upstream and meters the resulting tokens. For bulk metering, route your app
            traffic through the BYOK proxy or import a CSV.
          </li>
          <li>
            <strong className="text-on-surface">GitHub Models</strong> — paste a fine-grained PAT with the
            <code className="mx-1 rounded bg-surface-2 px-1">models:read</code> permission. Paid usage requires
            Copilot Pro+, Business, Enterprise, or pay-as-you-go enabled at github.com/settings/billing.
          </li>
          <li>Sync is idempotent — re-running skips daily buckets already imported.</li>
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
      <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
