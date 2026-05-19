import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { requireAdmin } from "@/lib/auth";
import { topupAction } from "../actions";
import { SubmitMessage } from "../_components/SubmitMessage";

export const dynamic = "force-dynamic";

export default async function TopupPage() {
  requireAdmin();
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  const providers = await prisma.provider.findMany({ orderBy: { name: "asc" } });
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  return (
    <div className="space-y-6">
      <PageHeader title="Top up wallet" description={`Organization: ${org.name} (${org.handle})`} />
      <Card>
        <form action={topupAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input type="hidden" name="organizationId" value={org.id} />
          <Field label="Provider">
            <select name="providerId" required className={selectCls}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Tokens to credit">
            <input
              type="text"
              name="tokens"
              inputMode="numeric"
              placeholder="e.g. 1000000"
              required
              className={inputCls}
            />
          </Field>
          <Field label="Unit cost (USD per token)">
            <input
              type="number"
              name="unitCost"
              step="0.00000001"
              min="0"
              placeholder="0.000002"
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
              <button
                type="submit"
                name="submitMode"
                value="execute"
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-primary-container"
              >
                Credit wallet now
              </button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-on-surface placeholder:text-text-muted focus:border-primary focus:outline-none";
const selectCls = inputCls + " font-mono";

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
