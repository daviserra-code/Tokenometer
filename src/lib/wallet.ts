import { prisma } from "@/lib/prisma";
import {
  Prisma,
  WalletApprovalKind,
  WalletApprovalStatus,
  WalletEntryType,
  InvoiceType,
} from "@prisma/client";

/**
 * Wallet helpers - double-entry style ledger for AI tokens.
 *
 * A Wallet is uniquely identified by (organizationId, providerId).
 * Every WalletEntry is a signed token movement. Balance is recomputed
 * by summing entry tokens, but we also keep Wallet.balance denormalized
 * for fast reads.
 */

type Tx = Prisma.TransactionClient;

type WalletPolicyShape = {
  balance: bigint;
  reservedBalance: bigint;
  reserveFloor: bigint;
  outgoingLocked: boolean;
  lockReason: string | null;
};

// ---------- Read helpers ----------

export async function listWalletsForOrg(organizationId: string) {
  return prisma.wallet.findMany({
    where: { organizationId },
    include: { provider: true },
    orderBy: { provider: { name: "asc" } },
  });
}

export async function ensureWallet(organizationId: string, providerId: string) {
  const existing = await prisma.wallet.findUnique({
    where: { organizationId_providerId: { organizationId, providerId } },
  });
  if (existing) return existing;
  return prisma.wallet.create({
    data: {
      organizationId,
      providerId,
      balance: BigInt(0),
      reservedBalance: BigInt(0),
      reserveFloor: BigInt(0),
    },
  });
}

export async function listWalletEntries(walletId: string, take = 50) {
  return prisma.walletEntry.findMany({
    where: { walletId },
    orderBy: { createdAt: "desc" },
    include: { counterpartyOrg: true },
    take,
  });
}

export async function listOrgEntries(organizationId: string, take = 100) {
  return prisma.walletEntry.findMany({
    where: { wallet: { organizationId } },
    orderBy: { createdAt: "desc" },
    include: {
      wallet: { include: { provider: true } },
      counterpartyOrg: true,
    },
    take,
  });
}

export async function listPendingWalletApprovalRequests(organizationId: string, take = 20) {
  return prisma.walletApprovalRequest.findMany({
    where: { organizationId, status: WalletApprovalStatus.PENDING },
    include: {
      provider: true,
      organization: true,
      sourceWallet: { include: { provider: true, organization: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

// ---------- Balance helpers ----------

export function walletAvailableBalance(wallet: Pick<WalletPolicyShape, "balance" | "reservedBalance">) {
  const available = wallet.balance - wallet.reservedBalance;
  return available > 0n ? available : 0n;
}

export function walletSpendableBalance(
  wallet: Pick<WalletPolicyShape, "balance" | "reservedBalance" | "reserveFloor">
) {
  const spendable = wallet.balance - wallet.reservedBalance - wallet.reserveFloor;
  return spendable > 0n ? spendable : 0n;
}

export function walletLockSummary(wallet: Pick<WalletPolicyShape, "outgoingLocked" | "lockReason">) {
  if (!wallet.outgoingLocked) return "Open";
  return wallet.lockReason?.trim() || "Locked";
}

function assertWalletCanDebit(
  wallet: WalletPolicyShape,
  amount: bigint,
  options?: { ignoreReservedTokens?: bigint }
) {
  const ignoreReserved = options?.ignoreReservedTokens ?? 0n;
  const effectiveReserved = wallet.reservedBalance > ignoreReserved
    ? wallet.reservedBalance - ignoreReserved
    : 0n;

  if (wallet.outgoingLocked) {
    throw new Error(wallet.lockReason?.trim() || "This wallet is locked for outgoing movements.");
  }

  const available = wallet.balance - effectiveReserved;
  if (available < amount) {
    throw new Error("Insufficient available balance.");
  }

  const postMovement = wallet.balance - effectiveReserved - amount;
  if (postMovement < wallet.reserveFloor) {
    throw new Error("This movement would breach the wallet reserve floor.");
  }
}

// ---------- Invoice numbering ----------

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

// ---------- Operations ----------

export type TopupInput = {
  organizationId: string;
  providerId: string;
  tokens: bigint;
  unitCost: number;
  memo?: string;
  createdBy?: string;
};

async function txPostTopup(tx: Tx, input: TopupInput) {
  if (input.tokens <= 0n) throw new Error("Tokens must be positive.");
  if (input.unitCost < 0) throw new Error("Unit cost must be non-negative.");

  const fiat = Number(input.tokens) * input.unitCost;
  const fiatDecimal = new Prisma.Decimal(fiat.toFixed(2));
  const unitCostDecimal = new Prisma.Decimal(input.unitCost.toFixed(8));

  const wallet = await tx.wallet.upsert({
    where: {
      organizationId_providerId: {
        organizationId: input.organizationId,
        providerId: input.providerId,
      },
    },
    create: {
      organizationId: input.organizationId,
      providerId: input.providerId,
      balance: 0n,
      reservedBalance: 0n,
      reserveFloor: 0n,
    },
    update: {},
    include: { organization: true, provider: true },
  });

  const entry = await tx.walletEntry.create({
    data: {
      walletId: wallet.id,
      type: WalletEntryType.TOPUP,
      tokens: input.tokens,
      unitCost: unitCostDecimal,
      fiatAmount: fiatDecimal,
      currency: wallet.currency,
      memo: input.memo,
      createdBy: input.createdBy,
    },
  });

  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: input.tokens } },
  });

  const number = await nextInvoiceNumber(tx, input.organizationId);
  const invoice = await tx.invoice.create({
    data: {
      organizationId: input.organizationId,
      number,
      type: InvoiceType.TOPUP,
      walletEntryId: entry.id,
      total: fiatDecimal,
      currency: wallet.currency,
      issuedTo: wallet.organization.name,
      issuedFrom: wallet.provider.name,
      notes: input.memo,
      dataJson: {
        provider: wallet.provider.name,
        tokens: input.tokens.toString(),
        unitCost: input.unitCost,
        fiat,
      },
    },
  });

  return { wallet, entry, invoice };
}

export async function postTopup(input: TopupInput) {
  return prisma.$transaction((tx) => txPostTopup(tx, input));
}

export type TransferInput = {
  fromOrganizationId: string;
  toOrganizationId: string;
  providerId: string;
  tokens: bigint;
  memo?: string;
  createdBy?: string;
  internalNote?: string;
  ignoreReservedTokens?: bigint;
};

async function txPostTransfer(tx: Tx, input: TransferInput) {
  if (input.tokens <= 0n) throw new Error("Tokens must be positive.");

  const fromWallet = await tx.wallet.findUnique({
    where: {
      organizationId_providerId: {
        organizationId: input.fromOrganizationId,
        providerId: input.providerId,
      },
    },
    include: { organization: true, provider: true },
  });
  if (!fromWallet) throw new Error("Source wallet not found.");

  assertWalletCanDebit(fromWallet, input.tokens, {
    ignoreReservedTokens: input.ignoreReservedTokens,
  });

  const toWallet = await tx.wallet.upsert({
    where: {
      organizationId_providerId: {
        organizationId: input.toOrganizationId,
        providerId: input.providerId,
      },
    },
    create: {
      organizationId: input.toOrganizationId,
      providerId: input.providerId,
      balance: 0n,
      reservedBalance: 0n,
      reserveFloor: 0n,
    },
    update: {},
    include: { organization: true },
  });

  const outEntry = await tx.walletEntry.create({
    data: {
      walletId: fromWallet.id,
      type: WalletEntryType.TRANSFER_OUT,
      tokens: -input.tokens,
      currency: fromWallet.currency,
      counterpartyOrgId: toWallet.organizationId,
      counterpartyWalletId: toWallet.id,
      memo: input.memo,
      createdBy: input.createdBy,
    },
  });

  const inEntry = await tx.walletEntry.create({
    data: {
      walletId: toWallet.id,
      type: WalletEntryType.TRANSFER_IN,
      tokens: input.tokens,
      currency: toWallet.organization.currency,
      counterpartyOrgId: fromWallet.organizationId,
      counterpartyWalletId: fromWallet.id,
      relatedEntryId: outEntry.id,
      memo: input.memo,
      createdBy: input.createdBy,
    },
  });

  await tx.walletEntry.update({
    where: { id: outEntry.id },
    data: { relatedEntryId: inEntry.id },
  });

  await tx.wallet.update({
    where: { id: fromWallet.id },
    data: {
      balance: { decrement: input.tokens },
      ...(input.ignoreReservedTokens && input.ignoreReservedTokens > 0n
        ? { reservedBalance: { decrement: input.ignoreReservedTokens } }
        : {}),
    },
  });
  await tx.wallet.update({
    where: { id: toWallet.id },
    data: { balance: { increment: input.tokens } },
  });

  let invoice = null;
  if (fromWallet.organizationId !== toWallet.organizationId) {
    const number = await nextInvoiceNumber(tx, fromWallet.organizationId);
    invoice = await tx.invoice.create({
      data: {
        organizationId: fromWallet.organizationId,
        number,
        type: InvoiceType.TRANSFER_OUT,
        walletEntryId: outEntry.id,
        total: new Prisma.Decimal(0),
        currency: fromWallet.currency,
        issuedTo: toWallet.organization.name,
        issuedFrom: fromWallet.organization.name,
        notes: input.memo,
        dataJson: {
          provider: fromWallet.provider.name,
          tokens: input.tokens.toString(),
          counterparty: toWallet.organization.name,
        },
      },
    });
  }

  return { outEntry, inEntry, invoice };
}

export async function postTransfer(input: TransferInput) {
  return prisma.$transaction((tx) => txPostTransfer(tx, input));
}

export type ExchangeInput = {
  organizationId: string;
  fromProviderId: string;
  toProviderId: string;
  fromTokens: bigint;
  rate: number;
  memo?: string;
  createdBy?: string;
};

async function txPostExchange(tx: Tx, input: ExchangeInput) {
  if (input.fromTokens <= 0n) throw new Error("Tokens must be positive.");
  if (input.rate <= 0) throw new Error("Rate must be positive.");
  if (input.fromProviderId === input.toProviderId) {
    throw new Error("Cannot exchange a provider with itself.");
  }

  const toTokens = BigInt(Math.floor(Number(input.fromTokens) * input.rate));

  const fromWallet = await tx.wallet.findUnique({
    where: {
      organizationId_providerId: {
        organizationId: input.organizationId,
        providerId: input.fromProviderId,
      },
    },
    include: { provider: true, organization: true },
  });
  if (!fromWallet) throw new Error("Source wallet not found.");

  assertWalletCanDebit(fromWallet, input.fromTokens);

  const toWallet = await tx.wallet.upsert({
    where: {
      organizationId_providerId: {
        organizationId: input.organizationId,
        providerId: input.toProviderId,
      },
    },
    create: {
      organizationId: input.organizationId,
      providerId: input.toProviderId,
      balance: 0n,
      reservedBalance: 0n,
      reserveFloor: 0n,
    },
    update: {},
    include: { provider: true },
  });

  const outEntry = await tx.walletEntry.create({
    data: {
      walletId: fromWallet.id,
      type: WalletEntryType.EXCHANGE_OUT,
      tokens: -input.fromTokens,
      currency: fromWallet.currency,
      memo:
        input.memo ??
        `Exchange ${fromWallet.provider.name} -> ${toWallet.provider.name} @ ${input.rate}`,
      createdBy: input.createdBy,
    },
  });
  const inEntry = await tx.walletEntry.create({
    data: {
      walletId: toWallet.id,
      type: WalletEntryType.EXCHANGE_IN,
      tokens: toTokens,
      currency: fromWallet.currency,
      relatedEntryId: outEntry.id,
      memo: input.memo,
      createdBy: input.createdBy,
    },
  });
  await tx.walletEntry.update({
    where: { id: outEntry.id },
    data: { relatedEntryId: inEntry.id },
  });

  await tx.wallet.update({
    where: { id: fromWallet.id },
    data: { balance: { decrement: input.fromTokens } },
  });
  await tx.wallet.update({
    where: { id: toWallet.id },
    data: { balance: { increment: toTokens } },
  });

  const number = await nextInvoiceNumber(tx, input.organizationId);
  const invoice = await tx.invoice.create({
    data: {
      organizationId: input.organizationId,
      number,
      type: InvoiceType.EXCHANGE,
      walletEntryId: outEntry.id,
      total: new Prisma.Decimal(0),
      currency: fromWallet.currency,
      issuedTo: fromWallet.organization.name,
      issuedFrom: "Tokenometer Exchange",
      notes: input.memo,
      dataJson: {
        fromProvider: fromWallet.provider.name,
        toProvider: toWallet.provider.name,
        fromTokens: input.fromTokens.toString(),
        toTokens: toTokens.toString(),
        rate: input.rate,
      },
    },
  });

  return { outEntry, inEntry, invoice, toTokens };
}

export async function postExchange(input: ExchangeInput) {
  return prisma.$transaction((tx) => txPostExchange(tx, input));
}

// ---------- Approval workflows ----------

export async function createTopupApprovalRequest(input: TopupInput) {
  if (input.tokens <= 0n) throw new Error("Tokens must be positive.");
  if (input.unitCost < 0) throw new Error("Unit cost must be non-negative.");

  return prisma.walletApprovalRequest.create({
    data: {
      organizationId: input.organizationId,
      providerId: input.providerId,
      kind: WalletApprovalKind.TOPUP,
      tokens: input.tokens,
      unitCost: new Prisma.Decimal(input.unitCost.toFixed(8)),
      memo: input.memo,
      requestedBy: input.createdBy,
      metadataJson: {
        source: "wallet-ui",
      } as Prisma.InputJsonObject,
    },
    include: { provider: true, organization: true },
  });
}

export async function createTransferApprovalRequest(input: TransferInput) {
  if (input.tokens <= 0n) throw new Error("Tokens must be positive.");

  return prisma.$transaction(async (tx) => {
    const fromWallet = await tx.wallet.findUnique({
      where: {
        organizationId_providerId: {
          organizationId: input.fromOrganizationId,
          providerId: input.providerId,
        },
      },
      include: { organization: true, provider: true },
    });
    if (!fromWallet) throw new Error("Source wallet not found.");

    assertWalletCanDebit(fromWallet, input.tokens);

    const request = await tx.walletApprovalRequest.create({
      data: {
        organizationId: input.fromOrganizationId,
        providerId: input.providerId,
        sourceWalletId: fromWallet.id,
        targetOrganizationId: input.toOrganizationId,
        kind: WalletApprovalKind.TRANSFER,
        tokens: input.tokens,
        reserveTokens: input.tokens,
        memo: input.memo,
        requestedBy: input.createdBy,
        metadataJson: {
          source: "wallet-ui",
          internalNote: input.internalNote ?? null,
        } as Prisma.InputJsonObject,
      },
      include: { provider: true, organization: true, sourceWallet: true },
    });

    await tx.wallet.update({
      where: { id: fromWallet.id },
      data: { reservedBalance: { increment: input.tokens } },
    });

    return request;
  });
}

export async function approveWalletApprovalRequest(requestId: string, approvedBy?: string | null) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.walletApprovalRequest.findUnique({
      where: { id: requestId },
      include: {
        sourceWallet: true,
      },
    });
    if (!request) throw new Error("Approval request not found.");
    if (request.status !== WalletApprovalStatus.PENDING) {
      throw new Error("This request is no longer pending.");
    }

    let result: Record<string, unknown> | null = null;

    if (request.kind === WalletApprovalKind.TOPUP) {
      const topup = await txPostTopup(tx, {
        organizationId: request.organizationId,
        providerId: request.providerId,
        tokens: request.tokens,
        unitCost: Number(request.unitCost),
        memo: request.memo ?? undefined,
        createdBy: approvedBy ?? "approval",
      });
      result = {
        entryId: topup.entry.id,
        invoiceId: topup.invoice.id,
      };
    } else if (request.kind === WalletApprovalKind.TRANSFER) {
      if (!request.targetOrganizationId) {
        throw new Error("Transfer request is missing a destination organization.");
      }
      const transfer = await txPostTransfer(tx, {
        fromOrganizationId: request.organizationId,
        toOrganizationId: request.targetOrganizationId,
        providerId: request.providerId,
        tokens: request.tokens,
        memo: request.memo ?? undefined,
        createdBy: approvedBy ?? "approval",
        ignoreReservedTokens: request.reserveTokens,
      });
      result = {
        outEntryId: transfer.outEntry.id,
        inEntryId: transfer.inEntry.id,
        invoiceId: transfer.invoice?.id ?? null,
      };
    }

    const metadata = {
      ...(request.metadataJson && typeof request.metadataJson === "object"
        ? (request.metadataJson as Prisma.JsonObject)
        : {}),
      approvedResult: result as Prisma.JsonObject | null,
    } as Prisma.InputJsonObject;

    return tx.walletApprovalRequest.update({
      where: { id: request.id },
      data: {
        status: WalletApprovalStatus.APPROVED,
        resolvedAt: new Date(),
        resolvedByAdminUserId: approvedBy ?? undefined,
        metadataJson: metadata,
      },
    });
  });
}

export async function rejectWalletApprovalRequest(
  requestId: string,
  approvedBy?: string | null,
  reason?: string
) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.walletApprovalRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new Error("Approval request not found.");
    if (request.status !== WalletApprovalStatus.PENDING) {
      throw new Error("This request is no longer pending.");
    }

    if (request.kind === WalletApprovalKind.TRANSFER && request.sourceWalletId && request.reserveTokens > 0n) {
      await tx.wallet.update({
        where: { id: request.sourceWalletId },
        data: { reservedBalance: { decrement: request.reserveTokens } },
      });
    }

    const metadata = {
      ...(request.metadataJson && typeof request.metadataJson === "object"
        ? (request.metadataJson as Prisma.JsonObject)
        : {}),
      rejectionReason: reason ?? null,
    } as Prisma.InputJsonObject;

    return tx.walletApprovalRequest.update({
      where: { id: request.id },
      data: {
        status: WalletApprovalStatus.REJECTED,
        resolvedAt: new Date(),
        resolvedByAdminUserId: approvedBy ?? undefined,
        metadataJson: metadata,
      },
    });
  });
}

export async function updateWalletPolicy(input: {
  walletId: string;
  reserveFloor: bigint;
  outgoingLocked: boolean;
  lockReason?: string;
}) {
  if (input.reserveFloor < 0n) {
    throw new Error("Reserve floor cannot be negative.");
  }

  return prisma.wallet.update({
    where: { id: input.walletId },
    data: {
      reserveFloor: input.reserveFloor,
      outgoingLocked: input.outgoingLocked,
      lockReason: input.outgoingLocked ? input.lockReason?.trim() || "Locked by admin" : null,
    },
    include: { provider: true, organization: true },
  });
}

// ---------- Formatting ----------

export function formatTokenBalance(balance: bigint): string {
  const n = Number(balance);
  if (!isFinite(n)) return balance.toString();
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}
