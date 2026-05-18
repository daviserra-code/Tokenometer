"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { postTopup, postTransfer, postExchange } from "@/lib/wallet";

const bigintFromString = z
  .string()
  .min(1, "Tokens required")
  .transform((s) => {
    const cleaned = s.replace(/[,\s_]/g, "");
    if (!/^\d+$/.test(cleaned)) throw new Error("Tokens must be a positive integer.");
    return BigInt(cleaned);
  });

// --- Top up -----------------------------------------------------------------

const TopupSchema = z.object({
  organizationId: z.string().min(1),
  providerId: z.string().min(1),
  tokens: bigintFromString,
  unitCost: z.coerce.number().min(0),
  memo: z.string().optional(),
});

export async function topupAction(formData: FormData) {
  const parsed = TopupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  await postTopup({
    organizationId: parsed.data.organizationId,
    providerId: parsed.data.providerId,
    tokens: parsed.data.tokens,
    unitCost: parsed.data.unitCost,
    memo: parsed.data.memo,
    createdBy: "ui",
  });
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
});

export async function transferAction(formData: FormData) {
  const parsed = TransferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  let toOrganizationId = parsed.data.toOrganizationId ?? parsed.data.fromOrganizationId;
  if (parsed.data.mode === "p2p") {
    const handle = (parsed.data.toHandle ?? "").trim();
    if (!handle) throw new Error("Target @handle required.");
    const normalized = handle.startsWith("@") ? handle : "@" + handle;
    const dest = await prisma.organization.findUnique({ where: { handle: normalized } });
    if (!dest) throw new Error(`No organization with handle ${normalized}.`);
    toOrganizationId = dest.id;
  }

  await postTransfer({
    fromOrganizationId: parsed.data.fromOrganizationId,
    toOrganizationId,
    providerId: parsed.data.providerId,
    tokens: parsed.data.tokens,
    memo: parsed.data.memo,
    createdBy: "ui",
  });
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
  const parsed = ExchangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

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

  await postExchange({
    organizationId: parsed.data.organizationId,
    fromProviderId: parsed.data.fromProviderId,
    toProviderId: parsed.data.toProviderId,
    fromTokens: parsed.data.fromTokens,
    rate: Number(rateRow.rate),
    memo: parsed.data.memo,
    createdBy: "ui",
  });
  revalidatePath("/wallet");
  redirect("/wallet");
}
