import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { startOfMonth } from "@/lib/calc";
import { toNumber } from "@/lib/format";
import { walletSpendableBalance } from "@/lib/wallet";

type Tx = Prisma.TransactionClient;

export type WalletAllocationSummary = {
  id: string;
  walletId: string;
  providerId: string;
  providerName: string;
  scope: "PROJECT" | "TEAM";
  scopeId: string;
  scopeName: string;
  costCenterCode: string | null;
  costCenterName: string | null;
  allocatedTokens: bigint;
  usedTokens: bigint;
  remainingTokens: bigint;
  utilizationPct: number;
  spendCost: number;
};

export type ChargebackRollup = {
  costCenterCode: string | null;
  costCenterName: string | null;
  providerName: string;
  scopeCount: number;
  allocatedTokens: bigint;
  usedTokens: bigint;
  remainingTokens: bigint;
  spendCost: number;
  overAllocatedScopes: number;
};

export type FinanceCloseSnapshot = {
  totalChargeback: number;
  chargeableScopes: number;
  statementsIssued: number;
  missingStatements: number;
  mappedRollups: number;
  unmappedRollups: number;
  overAllocatedRollups: number;
  status: "ready" | "attention" | "blocked";
  summary: string;
};

type CreateWalletAllocationInput = {
  organizationId: string;
  walletId: string;
  scope: "PROJECT" | "TEAM";
  scopeId: string;
  allocatedTokens: bigint;
  createdBy?: string;
};

async function nextInvoiceNumber(tx: Tx, organizationId: string) {
  const year = new Date().getFullYear();
  const count = await tx.invoice.count({
    where: {
      organizationId,
      createdAt: {
        gte: new Date(year, 0, 1),
        lt: new Date(year + 1, 0, 1),
      },
    },
  });
  const seq = String(count + 1).padStart(5, "0");
  return `INV-${year}-${seq}`;
}

export async function createOrUpdateWalletAllocation(input: CreateWalletAllocationInput) {
  if (input.allocatedTokens < 0n) {
    throw new Error("Allocated tokens must be zero or positive.");
  }

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({
      where: { id: input.walletId },
      include: { provider: true },
    });
    if (!wallet) throw new Error("Wallet not found.");
    if (wallet.organizationId !== input.organizationId) {
      throw new Error("Wallet does not belong to the selected organization.");
    }

    const scopeTarget =
      input.scope === "PROJECT"
        ? await tx.project.findFirst({
            where: { id: input.scopeId, organizationId: input.organizationId },
            include: { team: true },
          })
        : await tx.team.findFirst({
            where: { id: input.scopeId, organizationId: input.organizationId },
          });

    if (!scopeTarget) {
      throw new Error(`${input.scope === "PROJECT" ? "Project" : "Team"} not found.`);
    }

    const existing = await tx.walletAllocation.findFirst({
      where: {
        walletId: input.walletId,
        providerId: wallet.providerId,
        projectId: input.scope === "PROJECT" ? input.scopeId : null,
        teamId: input.scope === "TEAM" ? input.scopeId : null,
      },
    });

    const previousTokens = existing?.allocatedTokens ?? 0n;
    const delta = input.allocatedTokens - previousTokens;

    if (delta > 0n && walletSpendableBalance(wallet) < delta) {
      throw new Error("Not enough spendable wallet balance to reserve that allocation.");
    }

    if (delta !== 0n) {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          reservedBalance:
            delta > 0n
              ? { increment: delta }
              : { decrement: delta < 0n ? -delta : 0n },
        },
      });
    }

    const name = scopeTarget.name;

    return tx.walletAllocation.upsert({
      where: { id: existing?.id ?? "__new_allocation__" },
      create: {
        organizationId: input.organizationId,
        walletId: input.walletId,
        providerId: wallet.providerId,
        scope: input.scope,
        projectId: input.scope === "PROJECT" ? input.scopeId : null,
        teamId: input.scope === "TEAM" ? input.scopeId : null,
        name,
        allocatedTokens: input.allocatedTokens,
        active: input.allocatedTokens > 0n,
        metadataJson: {
          createdBy: input.createdBy ?? null,
        } as Prisma.InputJsonObject,
      },
      update: {
        allocatedTokens: input.allocatedTokens,
        active: input.allocatedTokens > 0n,
        name,
      },
      include: {
        provider: true,
        wallet: true,
        project: true,
        team: true,
      },
    });
  });
}

export async function deleteWalletAllocation(allocationId: string) {
  return prisma.$transaction(async (tx) => {
    const allocation = await tx.walletAllocation.findUnique({
      where: { id: allocationId },
      include: { wallet: true },
    });
    if (!allocation) throw new Error("Allocation not found.");

    if (allocation.allocatedTokens > 0n) {
      await tx.wallet.update({
        where: { id: allocation.walletId },
        data: {
          reservedBalance: { decrement: allocation.allocatedTokens },
        },
      });
    }

    return tx.walletAllocation.delete({ where: { id: allocationId } });
  });
}

export async function listWalletAllocationSummaries(
  organizationId: string,
  periodStart = startOfMonth()
): Promise<WalletAllocationSummary[]> {
  const allocations = await prisma.walletAllocation.findMany({
    where: { organizationId, active: true },
    include: {
      provider: true,
      wallet: true,
      project: {
        include: {
          team: true,
        },
      },
      team: true,
    },
    orderBy: [{ scope: "asc" }, { name: "asc" }],
  });

  if (!allocations.length) return [];

  const usageGroups = await prisma.usageEvent.groupBy({
    by: ["providerId", "projectId", "teamId"],
    where: {
      organizationId,
      timestamp: { gte: periodStart },
      OR: [
        { projectId: { not: null } },
        { teamId: { not: null } },
      ],
    },
    _sum: {
      totalTokens: true,
      estimatedTotalCost: true,
    },
  });

  const usageMap = new Map<string, { tokens: bigint; cost: number }>();
  for (const group of usageGroups) {
    if (group.projectId) {
      usageMap.set(
        `PROJECT:${group.providerId}:${group.projectId}`,
        {
          tokens: BigInt(group._sum.totalTokens ?? 0),
          cost: toNumber(group._sum.estimatedTotalCost),
        }
      );
    }
    if (group.teamId) {
      usageMap.set(
        `TEAM:${group.providerId}:${group.teamId}`,
        {
          tokens: BigInt(group._sum.totalTokens ?? 0),
          cost: toNumber(group._sum.estimatedTotalCost),
        }
      );
    }
  }

  return allocations.map((allocation) => {
    const scopeId = allocation.scope === "PROJECT" ? allocation.projectId! : allocation.teamId!;
    const costCenterCode =
      allocation.scope === "PROJECT"
        ? allocation.project?.costCenterCode ?? allocation.project?.team?.costCenterCode ?? null
        : allocation.team?.costCenterCode ?? null;
    const costCenterName =
      allocation.scope === "PROJECT"
        ? allocation.project?.costCenterName ?? allocation.project?.team?.costCenterName ?? null
        : allocation.team?.costCenterName ?? null;
    const usage = usageMap.get(`${allocation.scope}:${allocation.providerId}:${scopeId}`) ?? {
      tokens: 0n,
      cost: 0,
    };
    const remaining = allocation.allocatedTokens - usage.tokens;
    const utilizationPct =
      allocation.allocatedTokens > 0n
        ? Math.min(999, Number((usage.tokens * 10000n) / allocation.allocatedTokens) / 100)
        : 0;

    return {
      id: allocation.id,
      walletId: allocation.walletId,
      providerId: allocation.providerId,
      providerName: allocation.provider.name,
      scope: allocation.scope,
      scopeId,
      scopeName: allocation.name,
      costCenterCode,
      costCenterName,
      allocatedTokens: allocation.allocatedTokens,
      usedTokens: usage.tokens,
      remainingTokens: remaining,
      utilizationPct,
      spendCost: usage.cost,
    };
  });
}

export async function issueChargebackInvoices(
  organizationId: string,
  createdBy?: string,
  periodStart = startOfMonth()
) {
  const summaries = await listWalletAllocationSummaries(organizationId, periodStart);
  const chargeable = summaries.filter((row) => row.usedTokens > 0n || row.spendCost > 0);
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) throw new Error("Organization not found.");

  return prisma.$transaction(async (tx) => {
    const existingInvoices = await tx.invoice.findMany({
      where: {
        organizationId,
        type: "MONTHLY_USAGE",
        createdAt: { gte: periodStart },
      },
      select: { dataJson: true },
    });
    const existingKeys = new Set(
      existingInvoices.map((invoice) => {
        const data =
          invoice.dataJson && typeof invoice.dataJson === "object"
            ? (invoice.dataJson as Record<string, unknown>)
            : {};
        return [
          String(data.scope ?? ""),
          String(data.scopeId ?? ""),
          String(data.provider ?? ""),
          String(data.periodStart ?? ""),
        ].join(":");
      })
    );

    const invoices = [];
    for (const summary of chargeable) {
      const statementKey = [
        summary.scope,
        summary.scopeId,
        summary.providerName,
        periodStart.toISOString(),
      ].join(":");
      if (existingKeys.has(statementKey)) {
        continue;
      }

      const number = await nextInvoiceNumber(tx, organizationId);
      const invoice = await tx.invoice.create({
        data: {
          organizationId,
          number,
          type: "MONTHLY_USAGE",
          total: new Prisma.Decimal(summary.spendCost.toFixed(2)),
          currency: organization.currency,
          issuedTo: summary.costCenterCode
            ? `${summary.scopeName} (${summary.costCenterCode})`
            : summary.scopeName,
          issuedFrom: `Tokenometer Chargeback - ${summary.providerName}`,
          notes: `Internal ${summary.scope.toLowerCase()} chargeback statement`,
          dataJson: {
            scope: summary.scope,
            scopeId: summary.scopeId,
            provider: summary.providerName,
            costCenterCode: summary.costCenterCode,
            costCenterName: summary.costCenterName,
            allocatedTokens: summary.allocatedTokens.toString(),
            usedTokens: summary.usedTokens.toString(),
            remainingTokens: summary.remainingTokens.toString(),
            utilizationPct: summary.utilizationPct,
            spendCost: summary.spendCost,
            periodStart: periodStart.toISOString(),
            createdBy: createdBy ?? null,
          } as Prisma.InputJsonObject,
        },
      });
      existingKeys.add(statementKey);
      invoices.push(invoice);
    }
    return invoices;
  });
}

export async function listChargebackRollups(
  organizationId: string,
  periodStart = startOfMonth()
): Promise<ChargebackRollup[]> {
  const summaries = await listWalletAllocationSummaries(organizationId, periodStart);
  const rollupMap = new Map<string, ChargebackRollup>();

  for (const summary of summaries) {
    const key = [
      summary.costCenterCode ?? "UNMAPPED",
      summary.costCenterName ?? "",
      summary.providerName,
    ].join(":");

    const existing = rollupMap.get(key);
    if (existing) {
      existing.scopeCount += 1;
      existing.allocatedTokens += summary.allocatedTokens;
      existing.usedTokens += summary.usedTokens;
      existing.remainingTokens += summary.remainingTokens;
      existing.spendCost += summary.spendCost;
      if (summary.remainingTokens < 0n) {
        existing.overAllocatedScopes += 1;
      }
      continue;
    }

    rollupMap.set(key, {
      costCenterCode: summary.costCenterCode,
      costCenterName: summary.costCenterName,
      providerName: summary.providerName,
      scopeCount: 1,
      allocatedTokens: summary.allocatedTokens,
      usedTokens: summary.usedTokens,
      remainingTokens: summary.remainingTokens,
      spendCost: summary.spendCost,
      overAllocatedScopes: summary.remainingTokens < 0n ? 1 : 0,
    });
  }

  return [...rollupMap.values()].sort((a, b) => {
    const codeA = a.costCenterCode ?? "ZZZ";
    const codeB = b.costCenterCode ?? "ZZZ";
    if (codeA !== codeB) return codeA.localeCompare(codeB);
    return a.providerName.localeCompare(b.providerName);
  });
}

export async function getFinanceCloseSnapshot(
  organizationId: string,
  periodStart = startOfMonth()
): Promise<FinanceCloseSnapshot> {
  const [summaries, rollups, invoices] = await Promise.all([
    listWalletAllocationSummaries(organizationId, periodStart),
    listChargebackRollups(organizationId, periodStart),
    prisma.invoice.findMany({
      where: {
        organizationId,
        type: "MONTHLY_USAGE",
        createdAt: { gte: periodStart },
      },
      select: { dataJson: true },
    }),
  ]);

  const chargeableScopes = summaries.filter((row) => row.usedTokens > 0n || row.spendCost > 0).length;
  const totalChargeback = summaries.reduce((sum, row) => sum + row.spendCost, 0);
  const mappedRollups = rollups.filter((row) => row.costCenterCode || row.costCenterName).length;
  const unmappedRollups = rollups.length - mappedRollups;
  const overAllocatedRollups = rollups.filter((row) => row.overAllocatedScopes > 0).length;

  const existingKeys = new Set(
    invoices.map((invoice) => {
      const data =
        invoice.dataJson && typeof invoice.dataJson === "object"
          ? (invoice.dataJson as Record<string, unknown>)
          : {};
      return [
        String(data.scope ?? ""),
        String(data.scopeId ?? ""),
        String(data.provider ?? ""),
        String(data.periodStart ?? ""),
      ].join(":");
    })
  );

  const missingStatements = summaries.filter((summary) => {
    if (!(summary.usedTokens > 0n || summary.spendCost > 0)) return false;
    const statementKey = [
      summary.scope,
      summary.scopeId,
      summary.providerName,
      periodStart.toISOString(),
    ].join(":");
    return !existingKeys.has(statementKey);
  }).length;

  let status: FinanceCloseSnapshot["status"] = "ready";
  let summary = "Month-end artifacts are in good shape. Reconciliation, mappings, and statements look ready for handoff.";

  if (unmappedRollups > 0) {
    status = "blocked";
    summary = `There ${unmappedRollups === 1 ? "is" : "are"} ${unmappedRollups} unmapped rollup${unmappedRollups === 1 ? "" : "s"}. Clear cost center gaps before sending statements out.`;
  } else if (overAllocatedRollups > 0 || missingStatements > 0) {
    status = "attention";
    summary = `Month-end still needs review. ${overAllocatedRollups > 0 ? `${overAllocatedRollups} rollup${overAllocatedRollups === 1 ? "" : "s"} exceed allocation. ` : ""}${missingStatements > 0 ? `${missingStatements} chargeable scope${missingStatements === 1 ? "" : "s"} still need statements.` : ""}`.trim();
  }

  return {
    totalChargeback,
    chargeableScopes,
    statementsIssued: invoices.length,
    missingStatements,
    mappedRollups,
    unmappedRollups,
    overAllocatedRollups,
    status,
    summary,
  };
}
