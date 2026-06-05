import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptVaultSecret } from "@/lib/secret-store";
import { Prisma, WalletEntryType } from "@prisma/client";

export type ProxyContext = {
  source: { id: string; name: string; organizationId: string };
  providerId: string;
  providerName: string;
  credentialId: string;
  plaintextKey: string;
  integration?: {
    id: string;
    name: string;
    agentName: string | null;
    projectName: string | null;
    teamId: string | null;
    mode: string;
  } | null;
};

/**
 * Authenticate the request via X-Ingest-Key, look up the org's vaulted
 * credential for `providerName`, and return everything the proxy needs.
 */
export async function authProxy(
  req: NextRequest,
  providerName: string
): Promise<ProxyContext | NextResponse> {
  const apiKey = req.headers.get("x-ingest-key");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing X-Ingest-Key header." },
      { status: 401 }
    );
  }
  const source = await prisma.ingestSource.findUnique({ where: { apiKey } });
  if (!source || !source.active) {
    return NextResponse.json({ error: "Invalid API key." }, { status: 401 });
  }
  void prisma.ingestSource
    .update({
      where: { id: source.id },
      data: { lastSeenAt: new Date() },
    })
    .catch((error) => {
      console.error("Failed to update ingest source lastSeenAt:", error);
    });

  const provider = await prisma.provider.findUnique({ where: { name: providerName } });
  if (!provider) {
    return NextResponse.json(
      { error: `${providerName} provider not configured.` },
      { status: 500 }
    );
  }

  const requestedIntegrationId = req.headers.get("x-integration-id");
  const integration = requestedIntegrationId
    ? await prisma.integration.findFirst({
        where: {
          id: requestedIntegrationId,
          organizationId: source.organizationId,
          providerId: provider.id,
          active: true,
        },
        include: { project: true },
      })
    : null;
  if (requestedIntegrationId && !integration) {
    return NextResponse.json(
      { error: "The selected integration is missing, inactive, or belongs to another organization/provider." },
      { status: 412 }
    );
  }
  if (integration?.ingestSourceId && integration.ingestSourceId !== source.id) {
    return NextResponse.json(
      { error: "This integration is bound to a different ingest source." },
      { status: 412 }
    );
  }

  const requestedCredentialId = req.headers.get("x-credential-id");
  const preferredCredentialId = requestedCredentialId || integration?.credentialId || null;
  const cred = preferredCredentialId
    ? await prisma.providerCredential.findFirst({
        where: {
          id: preferredCredentialId,
          organizationId: source.organizationId,
          providerId: provider.id,
          active: true,
        },
      })
    : await prisma.providerCredential.findFirst({
        where: { organizationId: source.organizationId, providerId: provider.id, active: true },
        orderBy: { createdAt: "desc" },
      });
  if (!cred) {
    return NextResponse.json(
      {
        error: requestedCredentialId
          ? `The selected ${providerName} credential is missing, inactive, or belongs to another organization.`
          : integration?.credentialId
            ? `The credential attached to integration "${integration.name}" is missing or inactive.`
          : `No ${providerName} credential vaulted for this organization. Add one in Settings.`,
      },
      { status: 412 }
    );
  }

  let plaintext: string;
  try {
    plaintext = decryptVaultSecret(cred.encryptedKey);
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt vaulted credential. Re-add the key." },
      { status: 500 }
    );
  }

  return {
    source: {
      id: source.id,
      name: source.name,
      organizationId: source.organizationId,
    },
    providerId: provider.id,
    providerName,
    credentialId: cred.id,
    plaintextKey: plaintext,
    integration: integration
      ? {
          id: integration.id,
          name: integration.name,
          agentName: integration.agentName,
          projectName: integration.project?.name ?? null,
          teamId: integration.teamId,
          mode: integration.mode,
        }
      : null,
  };
}

/**
 * Record a UsageEvent + SPEND wallet entry and decrement the wallet balance.
 * Best-effort — never throws into the proxied response.
 */
export async function meterUsage(args: {
  ctx: ProxyContext;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  project?: string | null;
  agent?: string | null;
  metadata?: Record<string, unknown>;
  source?: string;
  estimatedInputCost?: number;
  estimatedOutputCost?: number;
  estimatedTotalCost?: number;
}) {
  try {
    const totT =
      args.totalTokens ?? args.inputTokens + args.outputTokens;

    const model = await prisma.model.upsert({
      where: {
        providerId_name: {
          providerId: args.ctx.providerId,
          name: args.modelName,
        },
      },
      create: { providerId: args.ctx.providerId, name: args.modelName },
      update: {},
    });

    const inP = Number(model.inputPricePerMillion);
    const outP = Number(model.outputPricePerMillion);
    const inCost =
      typeof args.estimatedInputCost === "number" ? args.estimatedInputCost : (args.inputTokens / 1_000_000) * inP;
    const outCost =
      typeof args.estimatedOutputCost === "number" ? args.estimatedOutputCost : (args.outputTokens / 1_000_000) * outP;
    const totalCost =
      typeof args.estimatedTotalCost === "number" ? args.estimatedTotalCost : inCost + outCost;

    const projectRow = args.project
      ? await prisma.project.findFirst({
          where: { organizationId: args.ctx.source.organizationId, name: args.project },
        })
      : args.ctx.integration?.projectName
        ? await prisma.project.findFirst({
            where: { organizationId: args.ctx.source.organizationId, name: args.ctx.integration.projectName },
          })
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.usageEvent.create({
        data: {
          organizationId: args.ctx.source.organizationId,
          integrationId: args.ctx.integration?.id ?? null,
          providerId: args.ctx.providerId,
          modelId: model.id,
          projectId: projectRow?.id,
          teamId: projectRow?.teamId ?? args.ctx.integration?.teamId ?? null,
          timestamp: new Date(),
          source: args.source ?? "byok-proxy",
          agentName: args.agent ?? args.ctx.integration?.agentName ?? undefined,
          requestOwner: args.ctx.source.name,
          inputTokens: args.inputTokens,
          outputTokens: args.outputTokens,
          totalTokens: totT,
          estimatedInputCost: new Prisma.Decimal(inCost.toFixed(6)),
          estimatedOutputCost: new Prisma.Decimal(outCost.toFixed(6)),
          estimatedTotalCost: new Prisma.Decimal(totalCost.toFixed(6)),
          metadataJson: {
            proxied: true,
            provider: args.ctx.providerName,
            model: args.modelName,
            integrationId: args.ctx.integration?.id,
            integrationName: args.ctx.integration?.name,
            ...(args.metadata ?? {}),
          },
        },
      });

      const wallet = await tx.wallet.findUnique({
        where: {
          organizationId_providerId: {
            organizationId: args.ctx.source.organizationId,
            providerId: args.ctx.providerId,
          },
        },
      });
      if (wallet) {
        await tx.walletEntry.create({
          data: {
            walletId: wallet.id,
            type: WalletEntryType.SPEND,
            tokens: BigInt(-totT),
            fiatAmount: new Prisma.Decimal(totalCost.toFixed(2)),
            currency: wallet.currency,
            memo: `${args.modelName} via BYOK proxy`,
            createdBy: "byok-proxy",
          },
        });
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: BigInt(totT) } },
        });
      }

      if (args.ctx.integration?.id) {
        await tx.integration.update({
          where: { id: args.ctx.integration.id },
          data: { lastSeenAt: new Date() },
        });
      }
    });

    await prisma.providerCredential.update({
      where: { id: args.ctx.credentialId },
      data: { lastUsedAt: new Date() },
    });
  } catch (e) {
    console.error("BYOK metering failed:", e);
  }
}
