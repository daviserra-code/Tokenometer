"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";
import { currentAdminUserId, requireAdmin } from "@/lib/auth";
import { getOrganizationWalletGuardrail, syncOrganizationBudgetLocks } from "@/lib/wallet-guardrails";
import {
  createOrUpdateWalletAllocation,
  deleteWalletAllocation,
  issueChargebackInvoices,
} from "@/lib/wallet-allocations";
import {
  approveWalletApprovalRequest,
  createTopupApprovalRequest,
  createTransferApprovalRequest,
  postExchange,
  postTopup,
  postTransfer,
  rejectWalletApprovalRequest,
  updateWalletPolicy,
} from "@/lib/wallet";

const bigintFromString = z
  .string()
  .min(1, "Tokens required")
  .transform((s) => {
    const cleaned = s.replace(/[,\s_]/g, "");
    if (!/^\d+$/.test(cleaned)) throw new Error("Tokens must be a positive integer.");
    return BigInt(cleaned);
  });

const reserveBigintFromString = z
  .string()
  .default("0")
  .transform((s) => {
    const cleaned = s.replace(/[,\s_]/g, "");
    if (!cleaned) return 0n;
    if (!/^\d+$/.test(cleaned)) throw new Error("Reserve floor must be a non-negative integer.");
    return BigInt(cleaned);
  });

// --- Top up -----------------------------------------------------------------

const TopupSchema = z.object({
  organizationId: z.string().min(1),
  providerId: z.string().min(1),
  tokens: bigintFromString,
  unitCost: z.coerce.number().min(0),
  memo: z.string().optional(),
  submitMode: z.enum(["execute", "request"]).default("execute"),
});

export async function topupAction(formData: FormData) {
  requireAdmin();
  const parsed = TopupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  await syncOrganizationBudgetLocks(parsed.data.organizationId);

  const userId = currentAdminUserId();
  if (parsed.data.submitMode === "request") {
    const request = await createTopupApprovalRequest({
      organizationId: parsed.data.organizationId,
      providerId: parsed.data.providerId,
      tokens: parsed.data.tokens,
      unitCost: parsed.data.unitCost,
      memo: parsed.data.memo,
      createdBy: userId ?? "ui",
    });
    await auditLog({
      action: "wallet_approval.requested",
      organizationId: parsed.data.organizationId,
      targetType: "WalletApprovalRequest",
      targetId: request.id,
      metadata: {
        kind: "TOPUP",
        tokens: parsed.data.tokens.toString(),
        unitCost: parsed.data.unitCost,
      },
    });
  } else {
    const result = await postTopup({
      organizationId: parsed.data.organizationId,
      providerId: parsed.data.providerId,
      tokens: parsed.data.tokens,
      unitCost: parsed.data.unitCost,
      memo: parsed.data.memo,
      createdBy: userId ?? "ui",
    });
    await auditLog({
      action: "wallet_topup.created",
      organizationId: parsed.data.organizationId,
      targetType: "WalletEntry",
      targetId: result.entry.id,
      metadata: {
        tokens: parsed.data.tokens.toString(),
        unitCost: parsed.data.unitCost,
        invoiceId: result.invoice.id,
      },
    });
  }

  revalidatePath("/wallet");
  redirect("/wallet");
}

// --- Transfer ---------------------------------------------------------------

const TransferSchema = z.object({
  fromOrganizationId: z.string().min(1),
  providerId: z.string().min(1),
  tokens: bigintFromString,
  memo: z.string().optional(),
  mode: z.enum(["internal", "p2p"]),
  toHandle: z.string().optional(),
  toOrganizationId: z.string().optional(),
  submitMode: z.enum(["execute", "request"]).default("request"),
});

export async function transferAction(formData: FormData) {
  requireAdmin();
  const parsed = TransferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  await syncOrganizationBudgetLocks(parsed.data.fromOrganizationId);

  let toOrganizationId = parsed.data.toOrganizationId ?? parsed.data.fromOrganizationId;
  if (parsed.data.mode === "p2p") {
    const handle = (parsed.data.toHandle ?? "").trim();
    if (!handle) throw new Error("Target @handle required.");
    const normalized = handle.startsWith("@") ? handle : `@${handle}`;
    const dest = await prisma.organization.findUnique({ where: { handle: normalized } });
    if (!dest) throw new Error(`No organization with handle ${normalized}.`);
    toOrganizationId = dest.id;
  }

  const guardrail = await getOrganizationWalletGuardrail(parsed.data.fromOrganizationId);
  const userId = currentAdminUserId();
  if (parsed.data.submitMode === "request") {
    const request = await createTransferApprovalRequest({
      fromOrganizationId: parsed.data.fromOrganizationId,
      toOrganizationId,
      providerId: parsed.data.providerId,
      tokens: parsed.data.tokens,
      memo: parsed.data.memo,
      createdBy: userId ?? "ui",
      internalNote: parsed.data.mode,
    });
    await auditLog({
      action: "wallet_approval.requested",
      organizationId: parsed.data.fromOrganizationId,
      targetType: "WalletApprovalRequest",
      targetId: request.id,
      metadata: {
        kind: "TRANSFER",
        mode: parsed.data.mode,
        tokens: parsed.data.tokens.toString(),
        toOrganizationId,
      },
    });
  } else {
    if (!guardrail.allowsDirectTransfer) {
      throw new Error(guardrail.message);
    }
    const result = await postTransfer({
      fromOrganizationId: parsed.data.fromOrganizationId,
      toOrganizationId,
      providerId: parsed.data.providerId,
      tokens: parsed.data.tokens,
      memo: parsed.data.memo,
      createdBy: userId ?? "ui",
    });
    await auditLog({
      action: "wallet_transfer.created",
      organizationId: parsed.data.fromOrganizationId,
      targetType: "WalletEntry",
      targetId: result.outEntry.id,
      metadata: {
        mode: parsed.data.mode,
        tokens: parsed.data.tokens.toString(),
        invoiceId: result.invoice?.id ?? null,
      },
    });
  }

  revalidatePath("/wallet");
  redirect("/wallet");
}

// --- Exchange ---------------------------------------------------------------

const ExchangeSchema = z.object({
  organizationId: z.string().min(1),
  fromProviderId: z.string().min(1),
  toProviderId: z.string().min(1),
  fromTokens: bigintFromString,
  memo: z.string().optional(),
});

export async function exchangeAction(formData: FormData) {
  requireAdmin();
  const parsed = ExchangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  await syncOrganizationBudgetLocks(parsed.data.organizationId);

  if (parsed.data.fromProviderId === parsed.data.toProviderId) {
    throw new Error("Cannot exchange a provider with itself.");
  }

  const rateRow = await prisma.exchangeRate.findUnique({
    where: {
      organizationId_fromProviderId_toProviderId: {
        organizationId: parsed.data.organizationId,
        fromProviderId: parsed.data.fromProviderId,
        toProviderId: parsed.data.toProviderId,
      },
    },
  });
  if (!rateRow || !rateRow.active) {
    throw new Error("No active exchange rate for that pair.");
  }

  const guardrail = await getOrganizationWalletGuardrail(parsed.data.organizationId);
  if (!guardrail.allowsDirectExchange) {
    throw new Error(guardrail.message);
  }

  const result = await postExchange({
    organizationId: parsed.data.organizationId,
    fromProviderId: parsed.data.fromProviderId,
    toProviderId: parsed.data.toProviderId,
    fromTokens: parsed.data.fromTokens,
    rate: Number(rateRow.rate),
    memo: parsed.data.memo,
    createdBy: currentAdminUserId() ?? "ui",
  });
  await auditLog({
    action: "wallet_exchange.created",
    organizationId: parsed.data.organizationId,
    targetType: "WalletEntry",
    targetId: result.outEntry.id,
    metadata: {
      fromTokens: parsed.data.fromTokens.toString(),
      toTokens: result.toTokens.toString(),
      rate: Number(rateRow.rate),
    },
  });

  revalidatePath("/wallet");
  redirect("/wallet");
}

// --- Policy -----------------------------------------------------------------

const WalletPolicySchema = z.object({
  walletId: z.string().min(1),
  reserveFloor: reserveBigintFromString,
  outgoingLocked: z.enum(["true", "false"]).transform((value) => value === "true"),
  lockReason: z.string().optional(),
});

export async function updateWalletPolicyAction(formData: FormData) {
  requireAdmin();
  const parsed = WalletPolicySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const previous = await prisma.wallet.findUnique({
    where: { id: parsed.data.walletId },
    select: {
      id: true,
      organizationId: true,
      reserveFloor: true,
      outgoingLocked: true,
      lockReason: true,
    },
  });
  if (!previous) throw new Error("Wallet not found.");

  const wallet = await updateWalletPolicy({
    walletId: parsed.data.walletId,
    reserveFloor: parsed.data.reserveFloor,
    outgoingLocked: parsed.data.outgoingLocked,
    lockReason: parsed.data.lockReason,
  });

  await auditLog({
    action: "wallet_policy.updated",
    organizationId: wallet.organizationId,
    targetType: "Wallet",
    targetId: wallet.id,
    metadata: {
      reserveFloor: parsed.data.reserveFloor.toString(),
      outgoingLocked: parsed.data.outgoingLocked,
      lockReason: parsed.data.lockReason ?? null,
      previousReserveFloor: previous.reserveFloor.toString(),
      previousOutgoingLocked: previous.outgoingLocked,
      previousLockReason: previous.lockReason ?? null,
    },
  });

  revalidatePath("/wallet");
  redirect("/wallet");
}

// --- Allocations ------------------------------------------------------------

const AllocationSchema = z.object({
  organizationId: z.string().min(1),
  walletId: z.string().min(1),
  scope: z.enum(["PROJECT", "TEAM"]),
  scopeId: z.string().min(1),
  allocatedTokens: bigintFromString,
});

export async function saveWalletAllocationAction(formData: FormData) {
  requireAdmin();
  const parsed = AllocationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  await syncOrganizationBudgetLocks(parsed.data.organizationId);
  const previous = await prisma.walletAllocation.findFirst({
    where: {
      walletId: parsed.data.walletId,
      projectId: parsed.data.scope === "PROJECT" ? parsed.data.scopeId : null,
      teamId: parsed.data.scope === "TEAM" ? parsed.data.scopeId : null,
    },
    select: {
      id: true,
      allocatedTokens: true,
      active: true,
    },
  });

  const allocation = await createOrUpdateWalletAllocation({
    organizationId: parsed.data.organizationId,
    walletId: parsed.data.walletId,
    scope: parsed.data.scope,
    scopeId: parsed.data.scopeId,
    allocatedTokens: parsed.data.allocatedTokens,
    createdBy: currentAdminUserId() ?? "admin",
  });

  await auditLog({
    action: "wallet_allocation.saved",
    organizationId: parsed.data.organizationId,
    targetType: "WalletAllocation",
    targetId: allocation.id,
    metadata: {
      scope: allocation.scope,
      scopeName: allocation.name,
      allocatedTokens: allocation.allocatedTokens.toString(),
      providerId: allocation.providerId,
      previousAllocationId: previous?.id ?? null,
      previousAllocatedTokens: previous?.allocatedTokens?.toString() ?? null,
      previousActive: previous?.active ?? null,
    },
  });

  revalidatePath("/wallet");
  revalidatePath("/wallet/allocations");
  revalidatePath("/wallet/chargeback");
  revalidatePath("/wallet/reconciliation");
  revalidatePath("/projects");
  redirect("/wallet/allocations");
}

const DeleteAllocationSchema = z.object({
  allocationId: z.string().min(1),
});

export async function deleteWalletAllocationAction(formData: FormData) {
  requireAdmin();
  const parsed = DeleteAllocationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const allocation = await deleteWalletAllocation(parsed.data.allocationId);
  await auditLog({
    action: "wallet_allocation.deleted",
    organizationId: allocation.organizationId,
    targetType: "WalletAllocation",
    targetId: allocation.id,
    metadata: {
      scope: allocation.scope,
      allocatedTokens: allocation.allocatedTokens.toString(),
      previousAllocatedTokens: allocation.allocatedTokens.toString(),
    },
  });

  revalidatePath("/wallet");
  revalidatePath("/wallet/allocations");
  revalidatePath("/wallet/chargeback");
  revalidatePath("/wallet/reconciliation");
  revalidatePath("/projects");
  redirect("/wallet/allocations");
}

// --- Chargeback -------------------------------------------------------------

const ChargebackSchema = z.object({
  organizationId: z.string().min(1),
});

export async function issueChargebackStatementsAction(formData: FormData) {
  requireAdmin();
  const parsed = ChargebackSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const invoices = await issueChargebackInvoices(
    parsed.data.organizationId,
    currentAdminUserId() ?? "admin"
  );

  await auditLog({
    action: "wallet_chargeback.issued",
    organizationId: parsed.data.organizationId,
    targetType: "Invoice",
    metadata: {
      invoicesIssued: invoices.length,
      invoiceIds: invoices.map((invoice) => invoice.id),
    },
  });

  revalidatePath("/wallet/chargeback");
  revalidatePath("/wallet/reconciliation");
  revalidatePath("/wallet/invoices");
  revalidatePath("/wallet");
  revalidatePath("/projects");
  redirect("/wallet/chargeback");
}

// --- Cost centers ----------------------------------------------------------

const nullableTrimmed = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed.length ? trimmed : null;
  });

const CostCenterSchema = z.object({
  organizationId: z.string().min(1),
  scope: z.enum(["PROJECT", "TEAM"]),
  scopeId: z.string().min(1),
  costCenterCode: nullableTrimmed,
  costCenterName: nullableTrimmed,
});

export async function updateCostCenterMappingAction(formData: FormData) {
  requireAdmin();
  const parsed = CostCenterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const previous =
    parsed.data.scope === "PROJECT"
      ? await prisma.project.findUnique({
          where: { id: parsed.data.scopeId },
          select: {
            name: true,
            costCenterCode: true,
            costCenterName: true,
          },
        })
      : await prisma.team.findUnique({
          where: { id: parsed.data.scopeId },
          select: {
            name: true,
            costCenterCode: true,
            costCenterName: true,
          },
        });
  if (!previous) throw new Error(`${parsed.data.scope} not found.`);

  const normalizedCode = parsed.data.costCenterCode?.toUpperCase() ?? null;
  const target =
    parsed.data.scope === "PROJECT"
      ? await prisma.project.update({
          where: { id: parsed.data.scopeId },
          data: {
            costCenterCode: normalizedCode,
            costCenterName: parsed.data.costCenterName,
          },
        })
      : await prisma.team.update({
          where: { id: parsed.data.scopeId },
          data: {
            costCenterCode: normalizedCode,
            costCenterName: parsed.data.costCenterName,
          },
        });

  await auditLog({
    action: "cost_center.updated",
    organizationId: parsed.data.organizationId,
    targetType: parsed.data.scope,
    targetId: parsed.data.scopeId,
    metadata: {
      costCenterCode: normalizedCode,
      costCenterName: parsed.data.costCenterName,
      scopeName: "name" in target ? target.name : null,
      previousCostCenterCode: previous.costCenterCode ?? null,
      previousCostCenterName: previous.costCenterName ?? null,
    },
  });

  revalidatePath("/projects");
  revalidatePath("/wallet");
  revalidatePath("/wallet/allocations");
  revalidatePath("/wallet/chargeback");
  revalidatePath("/wallet/reconciliation");
  redirect("/wallet/allocations");
}

// --- Approvals --------------------------------------------------------------

const ApprovalSchema = z.object({
  requestId: z.string().min(1),
});

export async function approveWalletApprovalAction(formData: FormData) {
  requireAdmin();
  const parsed = ApprovalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const request = await approveWalletApprovalRequest(
    parsed.data.requestId,
    currentAdminUserId() ?? "admin"
  );

  await auditLog({
    action: "wallet_approval.approved",
    organizationId: request.organizationId,
    targetType: "WalletApprovalRequest",
    targetId: request.id,
    metadata: {
      kind: request.kind,
      tokens: request.tokens.toString(),
      status: request.status,
      targetOrganizationId: request.targetOrganizationId ?? null,
      reserveTokens: request.reserveTokens.toString(),
    },
  });

  revalidatePath("/wallet");
  revalidatePath("/wallet/history");
  redirect("/wallet");
}

const RejectApprovalSchema = z.object({
  requestId: z.string().min(1),
  reason: z.string().optional(),
});

export async function rejectWalletApprovalAction(formData: FormData) {
  requireAdmin();
  const parsed = RejectApprovalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const request = await rejectWalletApprovalRequest(
    parsed.data.requestId,
    currentAdminUserId() ?? "admin",
    parsed.data.reason
  );

  await auditLog({
    action: "wallet_approval.rejected",
    organizationId: request.organizationId,
    targetType: "WalletApprovalRequest",
    targetId: request.id,
    metadata: {
      kind: request.kind,
      tokens: request.tokens.toString(),
      status: request.status,
      targetOrganizationId: request.targetOrganizationId ?? null,
      reserveTokens: request.reserveTokens.toString(),
      reason: parsed.data.reason ?? null,
    },
  });

  revalidatePath("/wallet");
  revalidatePath("/wallet/history");
  redirect("/wallet");
}
