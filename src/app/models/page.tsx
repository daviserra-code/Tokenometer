import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { ProviderTag } from "@/components/ProviderChip";
import { formatCurrency, toNumber } from "@/lib/format";
import clsx from "clsx";

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const providers = await prisma.provider.findMany({
    include: { models: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });

  const allModels = providers.flatMap((p) =>
    p.models.map((m) => ({ ...m, providerName: p.name }))
  );

  return (
    <div className="space-y-section-gap">
      <PageHeader
        title="Models & Pricing"
        description="Per-million token prices used for cost estimation across providers."
        action={
          <button className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-2 font-display text-body-md text-on-surface transition-colors hover:border-primary-container/40 hover:text-primary-container">
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Refresh Prices
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {allModels.map((m) => (
          <article
            key={m.id}
            className="group relative flex flex-col gap-4 rounded-xl border border-border-subtle bg-surface p-card-padding transition-colors hover:border-primary-container/40"
          >
            <header className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <ProviderTag name={m.providerName} />
                <span className="font-display text-body-md text-text-muted">
                  {m.providerName}
                </span>
              </div>
              <span
                className={clsx(
                  "inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ring-1 ring-inset",
                  m.active
                    ? "bg-status-normal/10 text-status-normal ring-status-normal/30"
                    : "bg-slate-800/60 text-text-muted ring-slate-700"
                )}
              >
                {m.active ? "Active" : "Legacy"}
              </span>
            </header>

            <h3 className="font-display text-body-lg font-semibold text-on-surface">
              {m.name}
            </h3>

            <dl className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg border border-border-subtle/60 bg-surface-elevated/40 p-3">
                <dt className="font-mono text-caps text-text-muted">Context</dt>
                <dd className="mt-1 font-display text-body-lg text-on-surface">
                  {m.contextWindow >= 1_000_000
                    ? `${(m.contextWindow / 1_000_000).toFixed(1)}M`
                    : `${(m.contextWindow / 1000).toFixed(0)}K`}
                </dd>
              </div>
              <div className="rounded-lg border border-border-subtle/60 bg-surface-elevated/40 p-3">
                <dt className="font-mono text-caps text-text-muted">Currency</dt>
                <dd className="mt-1 font-display text-body-lg text-on-surface">
                  {m.currency}
                </dd>
              </div>
            </dl>

            <div className="grid grid-cols-2 gap-2">
              <PriceBox
                label="Input / 1M"
                value={formatCurrency(toNumber(m.inputPricePerMillion), m.currency)}
                tone="input"
              />
              <PriceBox
                label="Output / 1M"
                value={formatCurrency(toNumber(m.outputPricePerMillion), m.currency)}
                tone="output"
              />
            </div>
          </article>
        ))}
      </div>

      {allModels.length === 0 && (
        <Card>
          <p className="text-body-md text-text-muted">
            No models configured. Run the seed script first.
          </p>
        </Card>
      )}
    </div>
  );
}

function PriceBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "input" | "output";
}) {
  const toneCls =
    tone === "input"
      ? "border-input-token/30 bg-input-token/5"
      : "border-output-token/30 bg-output-token/5";
  const labelCls = tone === "input" ? "text-input-token" : "text-output-token";
  return (
    <div className={clsx("rounded-lg border p-3 text-center", toneCls)}>
      <p className={clsx("font-mono text-caps", labelCls)}>{label}</p>
      <p className="mt-1 font-display text-body-lg font-semibold text-on-surface">
        {value}
      </p>
    </div>
  );
}
