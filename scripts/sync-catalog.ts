/**
 * Idempotent upsert of the Provider + Model catalog using the same
 * definitions as prisma/seed.ts. Safe to run anytime — preserves
 * organizations, credentials, ingest sources, usage events, wallets.
 *
 *   npx tsx scripts/sync-catalog.ts
 */
import { PrismaClient, ProviderType, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type ModelDef = { name: string; ctx: number; in: number; out: number };
type ProviderDef = { name: string; type: ProviderType; models: ModelDef[] };

const CATALOG: ProviderDef[] = [
  {
    name: "OpenAI",
    type: ProviderType.HOSTED,
    models: [
      // GPT-5 family (2026)
      { name: "gpt-5.4",          ctx: 400000, in: 5.00,  out: 20.00 },
      { name: "gpt-5.4-thinking", ctx: 400000, in: 7.50,  out: 30.00 },
      { name: "gpt-5",            ctx: 400000, in: 4.00,  out: 16.00 },
      { name: "gpt-5-mini",       ctx: 400000, in: 0.50,  out: 2.00  },
      { name: "gpt-5-nano",       ctx: 400000, in: 0.10,  out: 0.40  },
      // Reasoning (o-series)
      { name: "o3",            ctx: 200000, in: 2.00,  out: 8.00  },
      { name: "o3-mini",       ctx: 200000, in: 1.10,  out: 4.40  },
      { name: "o4-mini",       ctx: 200000, in: 1.10,  out: 4.40  },
      // GPT-4.1 (still widely used)
      { name: "gpt-4.1",       ctx: 1047576, in: 2.00, out: 8.00  },
      { name: "gpt-4.1-mini",  ctx: 1047576, in: 0.40, out: 1.60  },
      { name: "gpt-4.1-nano",  ctx: 1047576, in: 0.10, out: 0.40  },
      // GPT-4o (legacy multimodal)
      { name: "gpt-4o",        ctx: 128000, in: 2.50,  out: 10.00 },
      { name: "gpt-4o-mini",   ctx: 128000, in: 0.15,  out: 0.60  },
    ],
  },
  {
    name: "Anthropic",
    type: ProviderType.HOSTED,
    models: [
      // Claude 4.5 / 4.6 (2026)
      { name: "claude-opus-4-6",   ctx: 1000000, in: 15.00, out: 75.00 },
      { name: "claude-sonnet-4-6", ctx: 1000000, in: 3.00,  out: 15.00 },
      { name: "claude-haiku-4-6",  ctx: 1000000, in: 1.00,  out: 5.00  },
      { name: "claude-opus-4-5",   ctx: 1000000, in: 15.00, out: 75.00 },
      { name: "claude-sonnet-4-5", ctx: 1000000, in: 3.00,  out: 15.00 },
      // Claude 4 (still GA)
      { name: "claude-opus-4",     ctx: 200000, in: 15.00, out: 75.00 },
      { name: "claude-sonnet-4",   ctx: 200000, in: 3.00,  out: 15.00 },
      { name: "claude-haiku-4",    ctx: 200000, in: 1.00,  out: 5.00  },
      // Legacy
      { name: "claude-3-7-sonnet", ctx: 200000, in: 3.00,  out: 15.00 },
      { name: "claude-3-5-sonnet", ctx: 200000, in: 3.00,  out: 15.00 },
      { name: "claude-3-5-haiku",  ctx: 200000, in: 0.80,  out: 4.00  },
    ],
  },
  {
    name: "Google",
    type: ProviderType.HOSTED,
    models: [
      // Gemini 3.x (2026)
      { name: "gemini-3.1-pro",        ctx: 2000000, in: 3.50,  out: 14.00 },
      { name: "gemini-3.1-flash",      ctx: 2000000, in: 0.40,  out: 3.00  },
      { name: "gemini-3.0-pro",        ctx: 2000000, in: 3.00,  out: 12.00 },
      { name: "gemini-3.0-flash",      ctx: 2000000, in: 0.35,  out: 2.80  },
      // Gemini 2.5
      { name: "gemini-2.5-pro",        ctx: 2000000, in: 2.50,  out: 10.00 },
      { name: "gemini-2.5-flash",      ctx: 1000000, in: 0.30,  out: 2.50  },
      { name: "gemini-2.5-flash-lite", ctx: 1000000, in: 0.10,  out: 0.40  },
      // Gemini 2.0
      { name: "gemini-2.0-flash",      ctx: 1000000, in: 0.10,  out: 0.40  },
      { name: "gemini-2.0-flash-lite", ctx: 1000000, in: 0.075, out: 0.30  },
    ],
  },
  {
    name: "xAI",
    type: ProviderType.HOSTED,
    models: [
      { name: "grok-4",            ctx: 2000000, in: 5.00,  out: 25.00 },
      { name: "grok-4.1-fast",     ctx: 2000000, in: 1.50,  out: 7.50  },
      { name: "grok-3",            ctx: 131072,  in: 3.00,  out: 15.00 },
      { name: "grok-3-mini",       ctx: 131072,  in: 0.30,  out: 0.50  },
    ],
  },
  {
    name: "Mistral",
    type: ProviderType.HOSTED,
    models: [
      { name: "mistral-large-3",       ctx: 256000, in: 2.50, out: 7.50 },
      { name: "mistral-small-3.2",     ctx: 128000, in: 0.20, out: 0.60 },
      { name: "mistral-large-latest",  ctx: 128000, in: 2.00, out: 6.00 },
      { name: "mistral-medium-latest", ctx: 128000, in: 0.40, out: 2.00 },
      { name: "mistral-small-latest",  ctx: 128000, in: 0.20, out: 0.60 },
      { name: "codestral-latest",      ctx: 256000, in: 0.30, out: 0.90 },
      { name: "pixtral-large-latest",  ctx: 128000, in: 2.00, out: 6.00 },
    ],
  },
  {
    name: "DeepSeek",
    type: ProviderType.HOSTED,
    models: [
      { name: "deepseek-v3.2",  ctx: 128000, in: 0.27, out: 1.10 },
      { name: "deepseek-r1",    ctx: 128000, in: 0.55, out: 2.19 },
      { name: "deepseek-v3",    ctx: 128000, in: 0.30, out: 1.20 },
    ],
  },
  {
    name: "Alibaba Qwen",
    type: ProviderType.HOSTED,
    models: [
      { name: "qwen3.5-397b-a17b", ctx: 1000000, in: 1.20, out: 4.80 },
      { name: "qwen3-3.5",         ctx: 1000000, in: 0.80, out: 3.20 },
      { name: "qwen3-coder",       ctx: 256000,  in: 0.50, out: 2.00 },
    ],
  },
  {
    name: "Self-hosted Llama",
    type: ProviderType.SELF_HOSTED,
    models: [
      { name: "llama-4-maverick", ctx: 1000000, in: 0.50, out: 0.50 },
      { name: "llama-4-scout",    ctx: 1000000, in: 0.25, out: 0.25 },
      { name: "llama-3.3-70b",    ctx: 128000,  in: 0.50, out: 0.80 },
      { name: "llama-3.1-405b",   ctx: 128000,  in: 2.70, out: 2.70 },
      { name: "llama-3.1-8b",     ctx: 128000,  in: 0.10, out: 0.15 },
    ],
  },
  {
    name: "GitHub",
    type: ProviderType.HOSTED,
    models: [
      // OpenAI on GitHub Models
      { name: "openai/gpt-5.4",        ctx: 400000, in: 5.00, out: 20.00 },
      { name: "openai/gpt-5",          ctx: 400000, in: 4.00, out: 16.00 },
      { name: "openai/gpt-5-mini",     ctx: 400000, in: 0.50, out: 2.00  },
      { name: "openai/gpt-4.1",        ctx: 1047576, in: 2.00, out: 8.00 },
      { name: "openai/gpt-4.1-mini",   ctx: 1047576, in: 0.40, out: 1.60 },
      { name: "openai/gpt-4.1-nano",   ctx: 1047576, in: 0.10, out: 0.40 },
      { name: "openai/gpt-4o",         ctx: 128000, in: 2.50, out: 10.00 },
      { name: "openai/gpt-4o-mini",    ctx: 128000, in: 0.15, out: 0.60  },
      { name: "openai/o3",             ctx: 200000, in: 2.00, out: 8.00  },
      { name: "openai/o4-mini",        ctx: 200000, in: 1.10, out: 4.40  },
      // Meta
      { name: "meta/Llama-4-Maverick-17B-128E-Instruct-FP8", ctx: 1000000, in: 0.50, out: 0.50 },
      { name: "meta/Llama-4-Scout-17B-16E-Instruct",         ctx: 1000000, in: 0.25, out: 0.25 },
      { name: "meta/Llama-3.3-70B-Instruct",                 ctx: 128000,  in: 0.71, out: 0.71 },
      // DeepSeek
      { name: "deepseek/DeepSeek-V3.2", ctx: 128000, in: 0.27, out: 1.10 },
      { name: "deepseek/DeepSeek-R1",   ctx: 128000, in: 0.55, out: 2.19 },
      { name: "deepseek/DeepSeek-V3",   ctx: 128000, in: 0.30, out: 1.20 },
      // Mistral via GitHub
      { name: "mistral-ai/Mistral-Large-3",    ctx: 256000, in: 2.50, out: 7.50 },
      { name: "mistral-ai/Mistral-Large-2411", ctx: 128000, in: 2.00, out: 6.00 },
      { name: "mistral-ai/Codestral-2501",     ctx: 256000, in: 0.30, out: 0.90 },
      // xAI
      { name: "xai/grok-4",        ctx: 2000000, in: 5.00, out: 25.00 },
      { name: "xai/grok-4.1-fast", ctx: 2000000, in: 1.50, out: 7.50  },
      { name: "xai/grok-3",        ctx: 131072,  in: 3.00, out: 15.00 },
      { name: "xai/grok-3-mini",   ctx: 131072,  in: 0.30, out: 0.50  },
      // Alibaba via GitHub
      { name: "alibaba/Qwen3.5-397B-A17B", ctx: 1000000, in: 1.20, out: 4.80 },
      { name: "alibaba/Qwen3-3.5",         ctx: 1000000, in: 0.80, out: 3.20 },
    ],
  },
];

(async () => {
  let providersTouched = 0;
  let modelsAdded = 0;
  let modelsUpdated = 0;

  for (const def of CATALOG) {
    const provider = await prisma.provider.upsert({
      where: { name: def.name },
      create: { name: def.name, type: def.type },
      update: { type: def.type },
    });
    providersTouched++;

    for (const m of def.models) {
      const existing = await prisma.model.findUnique({
        where: { providerId_name: { providerId: provider.id, name: m.name } },
      });
      if (existing) {
        await prisma.model.update({
          where: { id: existing.id },
          data: {
            contextWindow: m.ctx,
            inputPricePerMillion: new Prisma.Decimal(m.in.toFixed(4)),
            outputPricePerMillion: new Prisma.Decimal(m.out.toFixed(4)),
            active: true,
          },
        });
        modelsUpdated++;
      } else {
        await prisma.model.create({
          data: {
            providerId: provider.id,
            name: m.name,
            contextWindow: m.ctx,
            inputPricePerMillion: new Prisma.Decimal(m.in.toFixed(4)),
            outputPricePerMillion: new Prisma.Decimal(m.out.toFixed(4)),
          },
        });
        modelsAdded++;
      }
    }
  }

  console.log(
    `Catalog sync complete: ${providersTouched} providers, +${modelsAdded} new models, ${modelsUpdated} updated.`
  );
  await prisma.$disconnect();
})();
