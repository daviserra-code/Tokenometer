import { Prisma, ProviderType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const RUNTIME_PROVIDERS = [
  {
    name: "GitHub",
    type: ProviderType.HOSTED,
    models: [
      { name: "openai/gpt-4o-mini", contextWindow: 128000, input: 0.15, output: 0.6 },
      { name: "openai/gpt-4.1-mini", contextWindow: 1047576, input: 0.4, output: 1.6 },
      { name: "deepseek/DeepSeek-V3", contextWindow: 128000, input: 0.3, output: 1.2 },
      { name: "deepseek/DeepSeek-R1", contextWindow: 128000, input: 1.5, output: 5.0 },
    ],
  },
  {
    name: "DeepSeek",
    type: ProviderType.HOSTED,
    models: [
      { name: "deepseek-v4-flash", contextWindow: 1_000_000, input: 0.14, output: 0.28 },
      { name: "deepseek-v4-pro", contextWindow: 1_000_000, input: 0.435, output: 0.87 },
      { name: "deepseek-chat", contextWindow: 1_000_000, input: 0.14, output: 0.28 },
      { name: "deepseek-reasoner", contextWindow: 1_000_000, input: 0.14, output: 0.28 },
    ],
  },
  {
    name: "MiniMax",
    type: ProviderType.HOSTED,
    models: [
      { name: "MiniMax-M2.7", contextWindow: 204_800, input: 0.3, output: 1.2 },
      { name: "MiniMax-M2.7-highspeed", contextWindow: 204_800, input: 0.6, output: 2.4 },
      { name: "MiniMax-M2.5", contextWindow: 204_800, input: 0.3, output: 1.2 },
      { name: "MiniMax-M2.5-highspeed", contextWindow: 204_800, input: 0.6, output: 2.4 },
      { name: "MiniMax-M2.1", contextWindow: 204_800, input: 0.3, output: 1.2 },
      { name: "MiniMax-M2.1-highspeed", contextWindow: 204_800, input: 0.6, output: 2.4 },
      { name: "M2-her", contextWindow: 64_000, input: 0.3, output: 1.2 },
    ],
  },
] as const;

export async function ensureRuntimeProviderCatalog(organizationId: string, currency: string) {
  for (const providerDef of RUNTIME_PROVIDERS) {
    const provider = await prisma.provider.upsert({
      where: { name: providerDef.name },
      create: { name: providerDef.name, type: providerDef.type },
      update: {},
    });

    await prisma.wallet.upsert({
      where: {
        organizationId_providerId: {
          organizationId,
          providerId: provider.id,
        },
      },
      create: {
        organizationId,
        providerId: provider.id,
        currency,
        balance: BigInt(0),
      },
      update: {},
    });

    for (const model of providerDef.models) {
      await prisma.model.upsert({
        where: {
          providerId_name: {
            providerId: provider.id,
            name: model.name,
          },
        },
        create: {
          providerId: provider.id,
          name: model.name,
          contextWindow: model.contextWindow,
          inputPricePerMillion: new Prisma.Decimal(model.input),
          outputPricePerMillion: new Prisma.Decimal(model.output),
        },
        update: {
          contextWindow: model.contextWindow,
          inputPricePerMillion: new Prisma.Decimal(model.input),
          outputPricePerMillion: new Prisma.Decimal(model.output),
        },
      });
    }
  }
}
