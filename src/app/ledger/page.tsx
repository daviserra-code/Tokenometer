import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { ProviderTag } from "@/components/ProviderChip";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  toNumber,
} from "@/lib/format";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type SearchParams = {
  from?: string;
  to?: string;
  providerId?: string;
  modelId?: string;
  projectId?: string;
  teamId?: string;
};

const PAGE_SIZE = 100;

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const org = await prisma.organization.findFirst();
  if (!org) {
    return (
      <div>
        <PageHeader title="Token Ledger" />
        <Card>
          <p className="text-body-md text-text-muted">No data. Run the seed script first.</p>
        </Card>
      </div>
    );
  }

  const where: Prisma.UsageEventWhereInput = { organizationId: org.id };
  if (sp.from)
    where.timestamp = { ...(where.timestamp as object), gte: new Date(sp.from) };
  if (sp.to)
    where.timestamp = { ...(where.timestamp as object), lte: new Date(sp.to) };
  if (sp.providerId) where.providerId = sp.providerId;
  if (sp.modelId) where.modelId = sp.modelId;
  if (sp.projectId) where.projectId = sp.projectId;
  if (sp.teamId) where.teamId = sp.teamId;

  const [events, total, providers, models, projects, teams] = await Promise.all([
    prisma.usageEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: PAGE_SIZE,
      include: {
        provider: { select: { name: true } },
        model: { select: { name: true } },
        project: { select: { name: true } },
        team: { select: { name: true } },
      },
    }),
    prisma.usageEvent.count({ where }),
    prisma.provider.findMany({ orderBy: { name: "asc" } }),
    prisma.model.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({
      where: { organizationId: org.id },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({
      where: { organizationId: org.id },
      orderBy: { name: "asc" },
    }),
  ]);

  type Row = (typeof events)[number];

  const columns: Column<Row>[] = [
    {
      key: "ts",
      header: "Timestamp",
      cell: (r) => (
        <span className="font-mono text-data text-text-muted">
          {formatDateTime(r.timestamp)}
        </span>
      ),
    },
    {
      key: "provider",
      header: "Provider",
      cell: (r) => (
        <div className="flex items-center gap-2">
          <ProviderTag name={r.provider.name} />
          <span>{r.provider.name}</span>
        </div>
      ),
    },
    {
      key: "model",
      header: "Model",
      cell: (r) => (
        <span className="font-mono text-data text-on-surface">{r.model.name}</span>
      ),
    },
    { key: "project", header: "Project", cell: (r) => r.project?.name ?? "—" },
    { key: "team", header: "Team", cell: (r) => r.team?.name ?? "—" },
    {
      key: "agent",
      header: "Agent / Workflow",
      cell: (r) => (
        <span className="font-mono text-data text-text-muted">
          {r.agentName ?? "—"} · {r.workflowName ?? "—"}
        </span>
      ),
    },
    {
      key: "input",
      header: "Input",
      align: "right",
      cell: (r) => (
        <span className="text-input-token">{formatNumber(r.inputTokens)}</span>
      ),
    },
    {
      key: "output",
      header: "Output",
      align: "right",
      cell: (r) => (
        <span className="text-output-token">{formatNumber(r.outputTokens)}</span>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: (r) => (
        <span className="font-semibold">{formatNumber(r.totalTokens)}</span>
      ),
    },
    {
      key: "cost",
      header: "Est. Cost",
      align: "right",
      cell: (r) => formatCurrency(toNumber(r.estimatedTotalCost), org.currency),
    },
    {
      key: "owner",
      header: "Owner",
      cell: (r) => (
        <span className="font-mono text-data text-text-muted">
          {r.requestOwner ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-section-gap">
      <PageHeader
        title="Token Ledger"
        description={`${total.toLocaleString()} usage events. Showing latest ${Math.min(
          PAGE_SIZE,
          events.length
        )}.`}
        action={
          <button className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-2 font-display text-body-md text-on-surface transition-colors hover:border-primary-container/40 hover:text-primary-container">
            <span className="material-symbols-outlined text-[18px]">file_download</span>
            Export CSV
          </button>
        }
      />

      <Card title="Filters">
        <form
          method="get"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6"
        >
          <Field label="From">
            <input
              type="date"
              name="from"
              defaultValue={sp.from ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              name="to"
              defaultValue={sp.to ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Provider">
            <select
              name="providerId"
              defaultValue={sp.providerId ?? ""}
              className={inputCls}
            >
              <option value="">All</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Model">
            <select
              name="modelId"
              defaultValue={sp.modelId ?? ""}
              className={inputCls}
            >
              <option value="">All</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project">
            <select
              name="projectId"
              defaultValue={sp.projectId ?? ""}
              className={inputCls}
            >
              <option value="">All</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Team">
            <select
              name="teamId"
              defaultValue={sp.teamId ?? ""}
              className={inputCls}
            >
              <option value="">All</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-6">
            <button
              type="submit"
              className="rounded-lg bg-primary-container px-4 py-2 font-display text-body-md font-semibold text-on-primary transition-colors hover:bg-primary"
            >
              Apply Filters
            </button>
            <a
              href="/ledger"
              className="rounded-lg border border-border-subtle px-4 py-2 font-display text-body-md text-text-muted hover:bg-surface-elevated"
            >
              Reset
            </a>
          </div>
        </form>
      </Card>

      <Card noPadding>
        <DataTable
          columns={columns}
          rows={events}
          rowKey={(r) => r.id}
          empty="No usage events match your filters."
        />
      </Card>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 font-sans text-body-md text-on-surface outline-none transition-colors focus:border-primary-container focus:ring-1 focus:ring-primary-container";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-caps text-text-muted">{label}</span>
      {children}
    </label>
  );
}
