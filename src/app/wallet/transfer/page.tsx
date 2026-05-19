import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { requireAdmin } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { getOrganizationWalletGuardrail, syncOrganizationBudgetLocks } from "@/lib/wallet-guardrails";
import { transferAction } from "../actions";
import { SubmitMessage } from "../_components/SubmitMessage";
import { formatTokenBalance } from "@/lib/wallet";

export const dynamic = "force-dynamic";

export default async function TransferPage() {
  requireAdmin();
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;
  await syncOrganizationBudgetLocks(org.id);
  const guardrail = await getOrganizationWalletGuardrail(org.id);
  const wallets = await prisma.wallet.findMany({
    where: { organizationId: org.id },
    include: { provider: true },
    orderBy: { provider: { name: "asc" } },
  });
  const otherOrgs = await prisma.organization.findMany({
    where: { id: { not: org.id } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transfer tokens"
        description="Move tokens between wallets in your org or to a partner organization. Approval requests reserve tokens until they are approved or rejected."
      />

      <Card title="Budget policy" description="Transfer rules are tied to the monthly organization budget.">
        <p className="font-display text-body-md font-semibold text-on-surface">{guardrail.message}</p>
        <p className="mt-2 text-[12px] text-text-muted">
          Budget {formatCurrency(guardrail.budget, org.currency)} · Spend {formatCurrency(guardrail.spend, org.currency)} ·
          Projection {formatCurrency(guardrail.projection, org.currency)}
        </p>
      </Card>

      <Card title="Cross-organization (P2P)">
        <form action={transferAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input type="hidden" name="fromOrganizationId" value={org.id} />
          <input type="hidden" name="mode" value="p2p" />
          <Field label="Provider (your wallet)">
            <select name="providerId" required className={inputCls}>
              {wallets.map((w) => (
                <option key={w.id} value={w.providerId}>
                  {w.provider.name} — {formatTokenBalance(w.balance)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Recipient @handle">
            <input
              type="text"
              name="toHandle"
              required
              placeholder="@globex"
              className={inputCls}
              list="known-handles"
            />
            <datalist id="known-handles">
              {otherOrgs.map((o) => (
                <option key={o.id} value={o.handle}>{o.name}</option>
              ))}
            </datalist>
          </Field>
          <Field label="Tokens">
            <input
              type="text"
              name="tokens"
              inputMode="numeric"
              required
              placeholder="1000000"
              className={inputCls}
            />
          </Field>
          <Field label="Memo (optional)">
            <input type="text" name="memo" maxLength={140} className={inputCls} />
          </Field>
          <div className="sm:col-span-2 flex items-center justify-between gap-3">
            <SubmitMessage />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                name="submitMode"
                value="request"
                className="rounded-lg border border-border-subtle bg-surface px-5 py-2.5 text-sm font-semibold text-on-surface hover:border-primary"
              >
                Request approval
              </button>
              {guardrail.allowsDirectTransfer ? (
                <button
                  type="submit"
                  name="submitMode"
                  value="execute"
                  className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-primary-container"
                >
                  Send now
                </button>
              ) : (
                <span className="rounded-lg bg-status-warning/10 px-4 py-2 text-sm font-semibold text-status-warning">
                  Direct send paused by budget policy
                </span>
              )}
            </div>
          </div>
        </form>
      </Card>

      <Card
        title="Internal transfer (between teams/projects)"
        description="Move tokens to another organization in your group. (For per-project sub-allocations within an org, use Budgets.)"
      >
        <form action={transferAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input type="hidden" name="fromOrganizationId" value={org.id} />
          <input type="hidden" name="mode" value="internal" />
          <Field label="Provider">
            <select name="providerId" required className={inputCls}>
              {wallets.map((w) => (
                <option key={w.id} value={w.providerId}>
                  {w.provider.name} — {formatTokenBalance(w.balance)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Destination organization">
            <select name="toOrganizationId" required className={inputCls}>
              {otherOrgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Tokens">
            <input
              type="text"
              name="tokens"
              inputMode="numeric"
              required
              className={inputCls}
            />
          </Field>
          <Field label="Memo (optional)">
            <input type="text" name="memo" maxLength={140} className={inputCls} />
          </Field>
          <div className="sm:col-span-2 flex items-center justify-between gap-3">
            <SubmitMessage />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                name="submitMode"
                value="request"
                className="rounded-lg border border-border-subtle bg-surface px-5 py-2.5 text-sm font-semibold text-on-surface hover:border-primary"
              >
                Request approval
              </button>
              {guardrail.allowsDirectTransfer ? (
                <button
                  type="submit"
                  name="submitMode"
                  value="execute"
                  className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-primary-container"
                >
                  Move now
                </button>
              ) : (
                <span className="rounded-lg bg-status-warning/10 px-4 py-2 text-sm font-semibold text-status-warning">
                  Direct move paused by budget policy
                </span>
              )}
            </div>
          </div>
        </form>
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
