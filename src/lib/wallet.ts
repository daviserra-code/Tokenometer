import { prisma } from "@/lib/prisma";
import { Prisma, WalletEntryType, InvoiceType } from "@prisma/client";

/**
 * Wallet helpers — double-entry style ledger for AI tokens.
 *
 * A Wallet is uniquely identified by (organizationId, providerId).
 * Every WalletEntry is a SIGNED token movement. Balance is recomputed
 * by summing entry tokens, BUT we also keep `Wallet.balance` denormalized
 * for fast reads — it's updated atomically inside the same transaction.
 */

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
    data: { organizationId, providerId, balance: BigInt(0) },
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

// ---------- Invoice numbering ----------

async function nextInvoiceNumber(organizationId: string) {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
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
  unitCost: number; // $/token
  memo?: string;
  createdBy?: string;
};

export async function postTopup(input: TopupInput) {
  if (input.tokens <= BigInt(0)) throw new Error("Tokens must be positive.");
  if (input.unitCost < 0) throw new Error("Unit cost must be non-negative.");

  const fiat = Number(input.tokens) * input.unitCost;
  const fiatDecimal = new Prisma.Decimal(fiat.toFixed(2));
  const unitCostDecimal = new Prisma.Decimal(input.unitCost.toFixed(8));

  return prisma.$transaction(async (tx) => {
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
        balance: BigInt(0),
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

    const number = await nextInvoiceNumber(input.organizationId);
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
  });
}

export type TransferInput = {
  fromOrganizationId: string;
  toOrganizationId: string; // can equal fromOrganizationId for internal between teams (memo holds the team)
  providerId: string;
  tokens: bigint;
  memo?: string;
  createdBy?: string;
  internalNote?: string;
};

export async function postTransfer(input: TransferInput) {
  if (input.tokens <= BigInt(0)) throw new Error("Tokens must be positive.");

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
    if (fromWallet.balance < input.tokens)
      throw new Error("Insufficient balance.");

    // Ensure destination wallet exists (create if first transfer to that org)
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
        balance: BigInt(0),
      },
      update: {},
      include: { organization: true },
    });

    const cost = fromWallet.balance > BigInt(0)
      ? Number(input.tokens) * 0 // pure transfer; fiat valuation = 0 for internal book entry
      : 0;

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
      data: { balance: { decrement: input.tokens } },
    });
    await tx.wallet.update({
      where: { id: toWallet.id },
      data: { balance: { increment: input.tokens } },
    });

    let invoice = null;
    if (fromWallet.organizationId !== toWallet.organizationId) {
      const number = await nextInvoiceNumber(fromWallet.organizationId);
      invoice = await tx.invoice.create({
        data: {
          organizationId: fromWallet.organizationId,
          number,
          type: InvoiceType.TRANSFER_OUT,
          walletEntryId: outEntry.id,
          total: new Prisma.Decimal(cost.toFixed(2)),
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
  });
}

export type ExchangeInput = {
  organizationId: string;
  fromProviderId: string;
  toProviderId: string;
  fromTokens: bigint;
  rate: number; // toTokens per fromToken
  memo?: string;
  createdBy?: string;
};

export async function postExchange(input: ExchangeInput) {
  if (input.fromTokens <= BigInt(0)) throw new Error("Tokens must be positive.");
  if (input.rate <= 0) throw new Error("Rate must be positive.");
  if (input.fromProviderId === input.toProviderId)
    throw new Error("Cannot exchange a provider with itself.");

  const toTokensFloat = Number(input.fromTokens) * input.rate;
  const toTokens = BigInt(Math.floor(toTokensFloat));

  return prisma.$transaction(async (tx) => {
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
    if (fromWallet.balance < input.fromTokens)
      throw new Error("Insufficient balance.");

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
        balance: BigInt(0),
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
          `Exchange ${fromWallet.provider.name} → ${toWallet.provider.name} @ ${input.rate}`,
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

    const number = await nextInvoiceNumber(input.organizationId);
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
