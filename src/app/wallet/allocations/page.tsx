import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { ProviderChip } from "@/components/ProviderChip";
import { formatCurrency } from "@/lib/format";
import { formatTokenBalance } from "@/lib/wallet";
import { listWalletAllocationSummaries } from "@/lib/wallet-allocations";
import {
  deleteWalletAllocationAction,
  saveWalletAllocationAction,
  updateCostCenterMappingAction,
} from "../actions";

export const dynamic = "force-dynamic";

type AllocationRow = {
  id: string;
  provider: string;
  scope: string;
  name: string;
  costCenterCode: string | null;
  costCenterName: string | null;
  allocated: bigint;
  used: bigint;
  remaining: bigint;
  spend: number;
  utilizationPct: number;
};

export default async function WalletAllocationsPage() {
  requireAdmin();
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  const [wallets, projects, teams, summaries] = await Promise.all([
    prisma.wallet.findMany({
      where: { organizationId: org.id },
      include: { provider: true },
      orderBy: { provider: { name: "asc" } },
    }),
    prisma.project.findMany({
      where: { organizationId: org.id },
      include: { team: true },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({
      where: { organizationId: org.id },
      orderBy: { name: "asc" },
    }),
    listWalletAllocationSummaries(org.id),
  ]);

  const rows: AllocationRow[] = summaries.map((summary) => ({
    id: summary.id,
    provider: summary.providerName,
    scope: summary.scope,
    name: summary.scopeName,
    costCenterCode: summary.costCenterCode,
    costCenterName: summary.costCenterName,
    allocated: summary.allocatedTokens,
    used: summary.usedTokens,
    remaining: summary.remainingTokens,
    spend: summary.spendCost,
    utilizationPct: summary.utilizationPct,
  }));

  const columns: Column<AllocationRow>[] = [
    {
      key: "provider",
      header: "Provider",
      cell: (row) => <ProviderChip name={row.provider} />,
    },
    { key: "scope", header: "Scope", cell: (row) => row.scope },
    { key: "name", header: "Name", cell: (row) => row.name },
    {
      key: "costCenter",
      header: "Cost center",
      cell: (row) => <CostCenterCell code={row.costCenterCode} name={row.costCenterName} />,
    },
    {
      key: "allocated",
      header: "Allocated",
      align: "right",
      cell: (row) => formatTokenBalance(row.allocated),
    },
    {
      key: "used",
      header: "Used (MTD)",
      align: "right",
      cell: (row) => formatTokenBalance(row.used),
    },
    {
      key: "remaining",
      header: "Remaining",
      align: "right",
      cell: (row) => formatTokenBalance(row.remaining),
    },
    {
      key: "spend",
      header: "Spend (MTD)",
      align: "right",
      cell: (row) => formatCurrency(row.spend, org.currency),
    },
    {
      key: "utilization",
      header: "Utilization",
      align: "right",
      cell: (row) => `${row.utilizationPct.toFixed(1)}%`,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <form action={deleteWalletAllocationAction}>
          <input type="hidden" name="allocationId" value={row.id} />
          <button
            type="submit"
            className="rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-xs font-semibold text-on-surface hover:border-status-warning"
          >
            Remove
          </button>
        </form>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sub-wallet allocations"
        description="Reserve provider wallet balances for projects and teams so they behave like operating budgets, not just soft targets."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Allocate to project">
          <form action={saveWalletAllocationAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input type="hidden" name="organizationId" value={org.id} />
            <input type="hidden" name="scope" value="PROJECT" />
            <Field label="Provider wallet">
              <select name="walletId" required className={inputCls}>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.provider.name} - {formatTokenBalance(wallet.balance)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project">
              <select name="scopeId" required className={inputCls}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Allocated tokens">
              <input
                type="text"
                name="allocatedTokens"
                inputMode="numeric"
                required
                placeholder="500000"
                className={inputCls}
              />
            </Field>
            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-primary-container"
              >
                Save project allocation
              </button>
            </div>
          </form>
        </Card>

        <Card title="Allocate to team">
          <form action={saveWalletAllocationAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input type="hidden" name="organizationId" value={org.id} />
            <input type="hidden" name="scope" value="TEAM" />
            <Field label="Provider wallet">
              <select name="walletId" required className={inputCls}>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.provider.name} - {formatTokenBalance(wallet.balance)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Team">
              <select name="scopeId" required className={inputCls}>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Allocated tokens">
              <input
                type="text"
                name="allocatedTokens"
                inputMode="numeric"
                required
                placeholder="1000000"
                className={inputCls}
              />
            </Field>
            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-primary-container"
              >
                Save team allocation
              </button>
            </div>
          </form>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card
          title="Map project cost center"
          description="Projects can override the team-level billing identity for chargeback and reporting."
        >
          <form action={updateCostCenterMappingAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input type="hidden" name="organizationId" value={org.id} />
            <input type="hidden" name="scope" value="PROJECT" />
            <Field label="Project">
              <select name="scopeId" required className={inputCls}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Current team fallback">
              <div className="rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-text-muted">
                Project chargeback falls back to the owning team when no project-specific cost center is set.
              </div>
            </Field>
            <Field label="Cost center code">
              <input
                type="text"
                name="costCenterCode"
                placeholder="ENG-PLATFORM"
                className={inputCls}
              />
            </Field>
            <Field label="Cost center name">
              <input
                type="text"
                name="costCenterName"
                placeholder="Engineering Platform"
                className={inputCls}
              />
            </Field>
            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-primary-container"
              >
                Save project mapping
              </button>
            </div>
          </form>
        </Card>

        <Card
          title="Map team cost center"
          description="Team mappings act as the default billing identity for team allocations and project fallback."
        >
          <form action={updateCostCenterMappingAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input type="hidden" name="organizationId" value={org.id} />
            <input type="hidden" name="scope" value="TEAM" />
            <Field label="Team">
              <select name="scopeId" required className={inputCls}>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Use case">
              <div className="rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-text-muted">
                Useful when several projects roll up to the same finance owner or operating budget.
              </div>
            </Field>
            <Field label="Cost center code">
              <input
                type="text"
                name="costCenterCode"
                placeholder="MKT-OPS"
                className={inputCls}
              />
            </Field>
            <Field label="Cost center name">
              <input
                type="text"
                name="costCenterName"
                placeholder="Marketing Operations"
                className={inputCls}
              />
            </Field>
            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-primary-container"
              >
                Save team mapping
              </button>
            </div>
          </form>
        </Card>
      </div>

      <Card
        title="Active allocations"
        description="These commitments reserve tokens from the provider wallets immediately."
      >
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />
      </Card>
    </div>
  );
}

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

function CostCenterCell({
  code,
  name,
}: {
  code: string | null;
  name: string | null;
}) {
  if (!code && !name) {
    return <span className="text-text-muted">Unmapped</span>;
  }
  return (
    <div>
      <div className="font-mono text-[12px] font-semibold text-on-surface">{code ?? "Mapped"}</div>
      {name ? <div className="text-[12px] text-text-muted">{name}</div> : null}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-on-surface placeholder:text-text-muted focus:border-primary focus:outline-none";
