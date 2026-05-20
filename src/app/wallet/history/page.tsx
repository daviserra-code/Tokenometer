import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { ProviderChip } from "@/components/ProviderChip";
import { formatTokenBalance } from "@/lib/wallet";
import { listWalletApprovalHistory } from "@/lib/wallet";

export const dynamic = "force-dynamic";

type ViewFilter = "all" | "governance" | "approvals";
type WindowFilter = "24h" | "7d" | "30d" | "90d" | "all";
type GovernanceFilter = "all" | "allocation" | "policy" | "cost-center" | "chargeback";
type ApprovalFilter = "all" | "APPROVED" | "REJECTED";

type GovernanceRow = {
  id: string;
  when: string;
  action: string;
  actor: string;
  target: string;
  change: string;
  summary: string;
};

type ApprovalRow = {
  id: string;
  when: string;
  kind: string;
  provider: string;
  tokens: bigint;
  outcome: string;
  requestedBy: string;
  resolvedBy: string;
  route: string;
  diff: string;
  memo: string;
};

const ACTION_LABEL: Record<string, string> = {
  "wallet_allocation.saved": "Allocation saved",
  "wallet_allocation.deleted": "Allocation removed",
  "wallet_policy.updated": "Wallet policy updated",
  "cost_center.updated": "Cost center updated",
  "wallet_chargeback.issued": "Chargeback issued",
};

export default async function WalletHistoryPage({
  searchParams,
}: {
  searchParams?: {
    view?: string;
    window?: string;
    governance?: string;
    approvals?: string;
  };
}) {
  requireAdmin();
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  const view = normalizeView(searchParams?.view);
  const windowFilter = normalizeWindow(searchParams?.window);
  const governanceFilter = normalizeGovernance(searchParams?.governance);
  const approvalFilter = normalizeApproval(searchParams?.approvals);
  const cutoff = cutoffDate(windowFilter);

  const actionFilter =
    governanceFilter === "allocation"
      ? ["wallet_allocation.saved", "wallet_allocation.deleted"]
      : governanceFilter === "policy"
      ? ["wallet_policy.updated"]
      : governanceFilter === "cost-center"
      ? ["cost_center.updated"]
      : governanceFilter === "chargeback"
      ? ["wallet_chargeback.issued"]
      : [
          "wallet_allocation.saved",
          "wallet_allocation.deleted",
          "wallet_policy.updated",
          "cost_center.updated",
          "wallet_chargeback.issued",
        ];

  const [auditLogs, approvals] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        organizationId: org.id,
        action: { in: actionFilter },
        ...(cutoff ? { createdAt: { gte: cutoff } } : {}),
      },
      include: { adminUser: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    listWalletApprovalHistory(org.id, 100),
  ]);

  const filteredApprovals = approvals.filter((request) => {
    if (cutoff && request.createdAt < cutoff) return false;
    if (approvalFilter !== "all" && request.status !== approvalFilter) return false;
    return true;
  });

  const organizations = await prisma.organization.findMany({
    where: {
      OR: [
        { id: org.id },
        {
          id: {
            in: filteredApprovals
              .map((request) => request.targetOrganizationId)
              .filter((value): value is string => Boolean(value)),
          },
        },
      ],
    },
  });

  const adminUsers = await prisma.adminUser.findMany({
    where: {
      id: {
        in: [
          ...auditLogs
            .map((log) => log.adminUserId)
            .filter((value): value is string => Boolean(value)),
          ...filteredApprovals
            .map((request) => request.resolvedByAdminUserId)
            .filter((value): value is string => Boolean(value)),
        ],
      },
    },
  });

  const actorMap = new Map(adminUsers.map((user) => [user.id, user.username]));
  const orgMap = new Map(organizations.map((item) => [item.id, item.name]));

  const governanceRows: GovernanceRow[] = auditLogs.map((log) => {
    const metadata =
      log.metadataJson && typeof log.metadataJson === "object"
        ? (log.metadataJson as Record<string, unknown>)
        : {};
    return {
      id: log.id,
      when: new Date(log.createdAt).toLocaleString(),
      action: ACTION_LABEL[log.action] ?? log.action,
      actor: actorMap.get(log.adminUserId ?? "") ?? "admin",
      target: metadata.scopeName
        ? String(metadata.scopeName)
        : log.targetType && log.targetId
        ? `${log.targetType} ${log.targetId}`
        : log.targetType ?? "-",
      change: changeSummary(log.action, metadata),
      summary: summarizeAudit(log.action, metadata),
    };
  });

  const approvalRows: ApprovalRow[] = filteredApprovals.map((request) => {
    const metadata =
      request.metadataJson && typeof request.metadataJson === "object"
        ? (request.metadataJson as Record<string, unknown>)
        : {};
    return {
      id: request.id,
      when: new Date(request.createdAt).toLocaleString(),
      kind: request.kind,
      provider: request.provider.name,
      tokens: request.tokens,
      outcome: request.status,
      requestedBy: request.requestedBy ?? "unknown",
      resolvedBy: request.resolvedByAdminUserId
        ? actorMap.get(request.resolvedByAdminUserId) ?? request.resolvedByAdminUserId
        : "-",
      route:
        request.kind === "TRANSFER"
          ? orgMap.get(request.targetOrganizationId ?? "") ?? "another organization"
          : `Unit cost $${Number(request.unitCost).toFixed(8)}`,
      diff: request.reserveTokens > 0n ? `Reserved ${formatTokenBalance(request.reserveTokens)}` : "-",
      memo:
        request.memo ??
        (typeof metadata.rejectionReason === "string" ? metadata.rejectionReason : "") ??
        "-",
    };
  });

  const governanceColumns: Column<GovernanceRow>[] = [
    { key: "when", header: "When", cell: (row) => row.when },
    { key: "action", header: "Action", cell: (row) => row.action },
    { key: "actor", header: "Actor", cell: (row) => row.actor },
    { key: "target", header: "Target", cell: (row) => row.target },
    { key: "change", header: "Change", cell: (row) => row.change },
    { key: "summary", header: "Summary", cell: (row) => row.summary, className: "text-text-muted" },
  ];

  const approvalColumns: Column<ApprovalRow>[] = [
    { key: "when", header: "When", cell: (row) => row.when },
    { key: "kind", header: "Kind", cell: (row) => row.kind },
    {
      key: "provider",
      header: "Provider",
      cell: (row) => <ProviderChip name={row.provider} />,
    },
    {
      key: "tokens",
      header: "Tokens",
      align: "right",
      cell: (row) => formatTokenBalance(row.tokens),
    },
    { key: "outcome", header: "Outcome", cell: (row) => row.outcome },
    { key: "requestedBy", header: "Requested by", cell: (row) => row.requestedBy },
    { key: "resolvedBy", header: "Resolved by", cell: (row) => row.resolvedBy },
    { key: "route", header: "Target", cell: (row) => row.route },
    { key: "diff", header: "Diff", cell: (row) => row.diff },
    { key: "memo", header: "Memo", cell: (row) => row.memo || "-", className: "text-text-muted" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet history"
        description="Trace what changed, who changed it, and how approvals resolved over time."
      />

      <Card title="Timeline filters" description="Narrow the history to the exact window and change type you want to inspect.">
        <form method="GET" className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <FilterField label="View">
            <select name="view" defaultValue={view} className={inputCls}>
              <option value="all">All</option>
              <option value="governance">Governance only</option>
              <option value="approvals">Approvals only</option>
            </select>
          </FilterField>
          <FilterField label="Time window">
            <select name="window" defaultValue={windowFilter} className={inputCls}>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </FilterField>
          <FilterField label="Governance slice">
            <select name="governance" defaultValue={governanceFilter} className={inputCls}>
              <option value="all">All governance</option>
              <option value="allocation">Allocations</option>
              <option value="policy">Wallet policy</option>
              <option value="cost-center">Cost centers</option>
              <option value="chargeback">Chargeback issuance</option>
            </select>
          </FilterField>
          <FilterField label="Approval outcome">
            <select name="approvals" defaultValue={approvalFilter} className={inputCls}>
              <option value="all">All outcomes</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </FilterField>
          <div className="md:col-span-4 flex justify-end gap-2">
            <a
              href="/wallet/history"
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
            >
              Reset
            </a>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-primary-container"
            >
              Apply filters
            </button>
          </div>
        </form>
      </Card>

      {view !== "approvals" ? (
        <Card
          title="Allocation and governance history"
          description="Recent admin actions affecting allocations, cost centers, policy, and statement issuance."
        >
          <DataTable columns={governanceColumns} rows={governanceRows} rowKey={(row) => row.id} />
        </Card>
      ) : null}

      {view !== "governance" ? (
        <Card
          title="Resolved approval history"
          description="Top-ups and transfers that were approved or rejected after review."
        >
          <DataTable columns={approvalColumns} rows={approvalRows} rowKey={(row) => row.id} />
        </Card>
      ) : null}
    </div>
  );
}

function cutoffDate(windowFilter: WindowFilter) {
  const now = Date.now();
  if (windowFilter === "24h") return new Date(now - 24 * 60 * 60 * 1000);
  if (windowFilter === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (windowFilter === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  if (windowFilter === "90d") return new Date(now - 90 * 24 * 60 * 60 * 1000);
  return null;
}

function normalizeView(value?: string): ViewFilter {
  return value === "governance" || value === "approvals" ? value : "all";
}

function normalizeWindow(value?: string): WindowFilter {
  return value === "24h" || value === "7d" || value === "30d" || value === "90d" ? value : "all";
}

function normalizeGovernance(value?: string): GovernanceFilter {
  return value === "allocation" ||
    value === "policy" ||
    value === "cost-center" ||
    value === "chargeback"
    ? value
    : "all";
}

function normalizeApproval(value?: string): ApprovalFilter {
  return value === "APPROVED" || value === "REJECTED" ? value : "all";
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function changeSummary(action: string, metadata: Record<string, unknown>) {
  if (action === "wallet_allocation.saved") {
    const previous = metadata.previousAllocatedTokens ? String(metadata.previousAllocatedTokens) : "new";
    return `${previous} -> ${metadata.allocatedTokens ?? "0"}`;
  }
  if (action === "wallet_allocation.deleted") {
    return `${metadata.previousAllocatedTokens ?? metadata.allocatedTokens ?? "0"} -> removed`;
  }
  if (action === "wallet_policy.updated") {
    return `${metadata.previousReserveFloor ?? "0"} -> ${metadata.reserveFloor ?? "0"}`;
  }
  if (action === "cost_center.updated") {
    return `${metadata.previousCostCenterCode ?? "UNMAPPED"} -> ${metadata.costCenterCode ?? "UNMAPPED"}`;
  }
  if (action === "wallet_chargeback.issued") {
    return `${metadata.invoicesIssued ?? 0} statements`;
  }
  return "-";
}

function summarizeAudit(action: string, metadata: Record<string, unknown>) {
  if (action === "wallet_allocation.saved") {
    return `${metadata.scope ?? "Scope"} reserved ${metadata.allocatedTokens ?? "0"} tokens`;
  }
  if (action === "wallet_allocation.deleted") {
    return `Released ${metadata.allocatedTokens ?? "0"} tokens`;
  }
  if (action === "wallet_policy.updated") {
    return `Outgoing ${metadata.previousOutgoingLocked ? "locked" : "open"} -> ${
      metadata.outgoingLocked ? "locked" : "open"
    }`;
  }
  if (action === "cost_center.updated") {
    const name = metadata.costCenterName ? ` - ${metadata.costCenterName}` : "";
    return `${metadata.costCenterCode ?? "UNMAPPED"}${name}`;
  }
  if (action === "wallet_chargeback.issued") {
    return `${metadata.invoicesIssued ?? 0} statement(s) created`;
  }
  return "-";
}

const inputCls =
  "w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-on-surface placeholder:text-text-muted focus:border-primary focus:outline-none";
