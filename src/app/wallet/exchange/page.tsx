import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { requireAdmin } from "@/lib/auth";
import { exchangeAction } from "../actions";
import { SubmitMessage } from "../_components/SubmitMessage";
import { formatTokenBalance } from "@/lib/wallet";

export const dynamic = "force-dynamic";

export default async function ExchangePage() {
  requireAdmin();
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  const wallets = await prisma.wallet.findMany({
    where: { organizationId: org.id },
    include: { provider: true },
    orderBy: { provider: { name: "asc" } },
  });
  const providers = await prisma.provider.findMany({ orderBy: { name: "asc" } });
  const rates = await prisma.exchangeRate.findMany({
    where: { organizationId: org.id, active: true },
    include: { fromProvider: true, toProvider: true },
    orderBy: [{ fromProvider: { name: "asc" } }, { toProvider: { name: "asc" } }],
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Exchange tokens" description="Swap tokens across providers using configured rates." />

      <Card>
        <form action={exchangeAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input type="hidden" name="organizationId" value={org.id} />
          <Field label="From provider">
            <select name="fromProviderId" required className={inputCls}>
              {wallets.map((w) => (
                <option key={w.id} value={w.providerId}>
                  {w.provider.name} — {formatTokenBalance(w.balance)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To provider">
            <select name="toProviderId" required className={inputCls}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Tokens to exchange">
            <input
              type="text"
              name="fromTokens"
              inputMode="numeric"
              required
              placeholder="500000"
              className={inputCls}
            />
          </Field>
          <Field label="Memo (optional)">
            <input type="text" name="memo" maxLength={140} className={inputCls} />
          </Field>
          <div className="sm:col-span-2 flex items-center justify-between gap-3">
            <SubmitMessage />
            <button
              type="submit"
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-primary-container"
            >
              Execute exchange
            </button>
          </div>
        </form>
      </Card>

      <Card title="Active exchange rates" description="Tokens of `to` per 1 token of `from`">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-text-muted text-[12px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left">From</th>
                <th className="px-3 py-2 text-left">To</th>
                <th className="px-3 py-2 text-right">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rates.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{r.fromProvider.name}</td>
                  <td className="px-3 py-2">{r.toProvider.name}</td>
                  <td className="px-3 py-2 text-right font-mono">{Number(r.rate).toFixed(4)}</td>
                </tr>
              ))}
              {rates.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-text-muted">
                    No exchange rates configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
