import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { ProviderChip } from "@/components/ProviderChip";
import { formatTokenBalance } from "@/lib/wallet";
import { listWalletApprovalHistory } from "@/lib/wallet";

export const dynamic = "force-dynamic";

type GovernanceRow = {
  id: string;
  when: string;
  action: string;
  actor: string;
  target: string;
  summary: string;
};

type ApprovalRow = {
  id: string;
  when: string;
  kind: string;
  provider: string;
  tokens: bigint;
  status: string;
  requestedBy: string;
  resolvedBy: string;
  target: string;
  memo: string;
};

const ACTION_LABEL: Record<string, string> = {
  "wallet_allocation.saved": "Allocation saved",
  "wallet_allocation.deleted": "Allocation removed",
  "wallet_policy.updated": "Wallet policy updated",
  "cost_center.updated": "Cost center updated",
  "wallet_chargeback.issued": "Chargeback issued",
};

export default async function WalletHistoryPage() {
  requireAdmin();
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  const [auditLogs, approvals] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        organizationId: org.id,
        action: {
          in: [
            "wallet_allocation.saved",
            "wallet_allocation.deleted",
            "wallet_policy.updated",
            "cost_center.updated",
            "wallet_chargeback.issued",
          ],
        },
      },
      include: {
        adminUser: true,
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    listWalletApprovalHistory(org.id, 60),
  ]);
  const organizations = await prisma.organization.findMany({
    where: {
      OR: [
        { id: org.id },
        {
          id: {
            in: approvals
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
          ...approvals
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
      summary: summarizeAudit(log.action, metadata),
    };
  });

  const approvalRows: ApprovalRow[] = approvals.map((request) => {
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
      status: request.status,
      requestedBy: request.requestedBy ?? "unknown",
      resolvedBy: request.resolvedByAdminUserId
        ? actorMap.get(request.resolvedByAdminUserId) ?? request.resolvedByAdminUserId
        : "-",
      target:
        request.kind === "TRANSFER"
          ? orgMap.get(request.targetOrganizationId ?? "") ?? "another organization"
          : `Unit cost $${Number(request.unitCost).toFixed(8)}`,
      memo:
        request.memo ??
        (typeof metadata.rejectionReason === "string" ? metadata.rejectionReason : ""),
    };
  });

  const governanceColumns: Column<GovernanceRow>[] = [
    { key: "when", header: "When", cell: (row) => row.when },
    { key: "action", header: "Action", cell: (row) => row.action },
    { key: "actor", header: "Actor", cell: (row) => row.actor },
    { key: "target", header: "Target", cell: (row) => row.target },
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
    { key: "status", header: "Status", cell: (row) => row.status },
    { key: "requestedBy", header: "Requested by", cell: (row) => row.requestedBy },
    { key: "resolvedBy", header: "Resolved by", cell: (row) => row.resolvedBy },
    { key: "target", header: "Target", cell: (row) => row.target },
    { key: "memo", header: "Memo", cell: (row) => row.memo || "-", className: "text-text-muted" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet history"
        description="Trace how balances were governed: allocations, policy changes, chargeback issuance, and resolved approvals."
      />

      <Card
        title="Allocation and governance history"
        description="Recent admin actions affecting allocations, cost centers, policy, and statement issuance."
      >
        <DataTable columns={governanceColumns} rows={governanceRows} rowKey={(row) => row.id} />
      </Card>

      <Card
        title="Resolved approval history"
        description="Top-ups and transfers that were approved or rejected after review."
      >
        <DataTable columns={approvalColumns} rows={approvalRows} rowKey={(row) => row.id} />
      </Card>
    </div>
  );
}

function summarizeAudit(action: string, metadata: Record<string, unknown>) {
  if (action === "wallet_allocation.saved") {
    return `${metadata.scope ?? "Scope"} reserved ${metadata.allocatedTokens ?? "0"} tokens`;
  }
  if (action === "wallet_allocation.deleted") {
    return `Released ${metadata.allocatedTokens ?? "0"} tokens`;
  }
  if (action === "wallet_policy.updated") {
    return `Reserve floor ${metadata.reserveFloor ?? "0"} · outgoing ${
      metadata.outgoingLocked ? "locked" : "open"
    }`;
  }
  if (action === "cost_center.updated") {
    return `${metadata.costCenterCode ?? "Unmapped"}${metadata.costCenterName ? ` · ${metadata.costCenterName}` : ""}`;
  }
  if (action === "wallet_chargeback.issued") {
    return `${metadata.invoicesIssued ?? 0} statement(s) created`;
  }
  return "-";
}
