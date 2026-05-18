import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { Prisma, WalletEntryType } from "@prisma/client";

export type SyncResult = {
  ok: boolean;
  provider: string;
  inserted: number;
  skipped: number;
  credentialId?: string;
  label?: string;
  message?: string;
  error?: string;
};

/**
 * Pull usage from a provider's own API using the vaulted credential and
 * insert UsageEvent rows. No curl required.
 *
 * Supported: OpenAI (admin key), Anthropic (admin key).
 * Not supported (no public usage API): Google Gemini, Mistral.
 */
export async function syncProviderUsage(credentialId: string, days = 7): Promise<SyncResult> {
  const cred = await prisma.providerCredential.findUnique({
    where: { id: credentialId },
    include: { organization: true },
  });
  if (!cred) return { ok: false, provider: "?", inserted: 0, skipped: 0, error: "Credential not found." };

  const provider = await prisma.provider.findUnique({ where: { id: cred.providerId } });
  if (!provider) return { ok: false, provider: "?", inserted: 0, skipped: 0, error: "Provider not found." };

  let plaintext: string;
  try {
    plaintext = decryptSecret(cred.encryptedKey);
  } catch {
    return { ok: false, provider: provider.name, inserted: 0, skipped: 0, error: "Failed to decrypt key." };
  }

  switch (provider.name) {
    case "OpenAI":
      return syncOpenAI(cred.id, cred.label, cred.organizationId, provider.id, plaintext, days);
    case "Anthropic":
      return syncAnthropic(cred.id, cred.label, cred.organizationId, provider.id, plaintext, days);
    case "Google":
      return pingGoogle(cred.id, cred.label, cred.organizationId, provider.id, plaintext);
    case "Mistral":
      return pingMistral(cred.id, cred.label, cred.organizationId, provider.id, plaintext);
    case "GitHub":
      return pingGitHub(cred.id, cred.label, cred.organizationId, provider.id, plaintext);
    default:
      return {
        ok: false,
        provider: provider.name,
        inserted: 0,
        skipped: 0,
        error: `No sync adapter for ${provider.name}.`,
      };
  }
}

export async function syncAllActiveCredentials(days = 7): Promise<SyncResult[]> {
  const credentials = await prisma.providerCredential.findMany({
    where: { active: true },
    orderBy: [{ organizationId: "asc" }, { createdAt: "desc" }],
    select: { id: true },
  });

  const results: SyncResult[] = [];
  for (const credential of credentials) {
    results.push(await syncProviderUsage(credential.id, days));
  }
  return results;
}

// ---------------------------------------------------------------- OpenAI ----

type OpenAIUsageBucket = {
  start_time: number;
  end_time: number;
  results: Array<{
    input_tokens?: number;
    output_tokens?: number;
    num_model_requests?: number;
    model?: string;
  }>;
};

async function syncOpenAI(
  credentialId: string,
  label: string,
  organizationId: string,
  providerId: string,
  apiKey: string,
  days: number
): Promise<SyncResult> {
  const startTime = Math.floor(Date.now() / 1000) - days * 86400;
  const url = new URL("https://api.openai.com/v1/organization/usage/completions");
  url.searchParams.set("start_time", String(startTime));
  url.searchParams.set("bucket_width", "1d");
  url.searchParams.set("group_by", "model");
  url.searchParams.set("limit", String(days));

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    return {
      ok: false,
      provider: "OpenAI",
      credentialId,
      label,
      inserted: 0,
      skipped: 0,
      error:
        res.status === 401
          ? "OpenAI rejected the key. The /usage endpoint requires an Admin API key (sk-admin-...)."
          : `OpenAI ${res.status}: ${body.slice(0, 200)}`,
    };
  }
  const json = (await res.json()) as { data?: OpenAIUsageBucket[] };
  const buckets = json.data ?? [];

  let inserted = 0;
  let skipped = 0;

  for (const bucket of buckets) {
    const ts = new Date(bucket.start_time * 1000);
    for (const r of bucket.results) {
      if (!r.model) continue;
      const inT = r.input_tokens ?? 0;
      const outT = r.output_tokens ?? 0;
      if (inT + outT === 0) {
        skipped++;
        continue;
      }
      const written = await upsertSyncedUsage({
        organizationId,
        providerId,
        modelName: r.model,
        timestamp: ts,
        source: "provider-sync:openai",
        inputTokens: inT,
        outputTokens: outT,
        requests: r.num_model_requests ?? 1,
      });
      if (written) inserted++;
      else skipped++;
    }
  }

  await prisma.providerCredential.update({
    where: { id: credentialId },
    data: { lastUsedAt: new Date() },
  });

  return {
    ok: true,
    provider: "OpenAI",
    credentialId,
    label,
    inserted,
    skipped,
    message: `Synced ${inserted} new daily buckets from OpenAI (last ${days} days).`,
  };
}

// -------------------------------------------------------------- Anthropic ----

type AnthropicUsageBucket = {
  starts_at: string;
  ends_at: string;
  results: Array<{
    model?: string;
    uncached_input_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    output_tokens?: number;
  }>;
};

async function syncAnthropic(
  credentialId: string,
  label: string,
  organizationId: string,
  providerId: string,
  apiKey: string,
  days: number
): Promise<SyncResult> {
  const startsAt = new Date(Date.now() - days * 86_400_000).toISOString();
  const url = new URL("https://api.anthropic.com/v1/organizations/usage_report/messages");
  url.searchParams.set("starting_at", startsAt);
  url.searchParams.set("bucket_width", "1d");
  url.searchParams.set("group_by[]", "model");
  url.searchParams.set("limit", String(days));

  const res = await fetch(url, {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
  });
  if (!res.ok) {
    const body = await res.text();
    return {
      ok: false,
      provider: "Anthropic",
      credentialId,
      label,
      inserted: 0,
      skipped: 0,
      error:
        res.status === 401
          ? "Anthropic rejected the key. The usage_report endpoint requires an Admin API key (sk-ant-admin...)."
          : `Anthropic ${res.status}: ${body.slice(0, 200)}`,
    };
  }
  const json = (await res.json()) as { data?: AnthropicUsageBucket[] };
  const buckets = json.data ?? [];

  let inserted = 0;
  let skipped = 0;

  for (const bucket of buckets) {
    const ts = new Date(bucket.starts_at);
    for (const r of bucket.results) {
      if (!r.model) continue;
      const inT =
        (r.uncached_input_tokens ?? 0) +
        (r.cache_read_input_tokens ?? 0) +
        (r.cache_creation_input_tokens ?? 0);
      const outT = r.output_tokens ?? 0;
      if (inT + outT === 0) {
        skipped++;
        continue;
      }
      const written = await upsertSyncedUsage({
        organizationId,
        providerId,
        modelName: r.model,
        timestamp: ts,
        source: "provider-sync:anthropic",
        inputTokens: inT,
        outputTokens: outT,
        requests: 1,
      });
      if (written) inserted++;
      else skipped++;
    }
  }

  await prisma.providerCredential.update({
    where: { id: credentialId },
    data: { lastUsedAt: new Date() },
  });

  return {
    ok: true,
    provider: "Anthropic",
    credentialId,
    label,
    inserted,
    skipped,
    message: `Synced ${inserted} new daily buckets from Anthropic (last ${days} days).`,
  };
}

// --------------------------------------------------------------- helpers ----

/**
 * Insert a UsageEvent + matching SPEND wallet entry for a daily bucket,
 * skipping if we've already imported the same (source, model, timestamp) row.
 */
async function upsertSyncedUsage(args: {
  organizationId: string;
  providerId: string;
  modelName: string;
  timestamp: Date;
  source: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
}): Promise<boolean> {
  const model = await prisma.model.upsert({
    where: { providerId_name: { providerId: args.providerId, name: args.modelName } },
    create: { providerId: args.providerId, name: args.modelName },
    update: {},
  });

  const dup = await prisma.usageEvent.findFirst({
    where: {
      organizationId: args.organizationId,
      modelId: model.id,
      source: args.source,
      timestamp: args.timestamp,
    },
    select: { id: true },
  });
  if (dup) return false;

  const inP = Number(model.inputPricePerMillion);
  const outP = Number(model.outputPricePerMillion);
  const inCost = (args.inputTokens / 1_000_000) * inP;
  const outCost = (args.outputTokens / 1_000_000) * outP;
  const totT = args.inputTokens + args.outputTokens;
  const totalCost = inCost + outCost;

  await prisma.$transaction(async (tx) => {
    await tx.usageEvent.create({
      data: {
        organizationId: args.organizationId,
        providerId: args.providerId,
        modelId: model.id,
        timestamp: args.timestamp,
        source: args.source,
        requestOwner: "provider-sync",
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        totalTokens: totT,
        estimatedInputCost: new Prisma.Decimal(inCost.toFixed(6)),
        estimatedOutputCost: new Prisma.Decimal(outCost.toFixed(6)),
        estimatedTotalCost: new Prisma.Decimal(totalCost.toFixed(6)),
        metadataJson: { synced: true, requests: args.requests },
      },
    });

    const wallet = await tx.wallet.findUnique({
      where: {
        organizationId_providerId: {
          organizationId: args.organizationId,
          providerId: args.providerId,
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
          memo: `${args.modelName} (synced)`,
          createdBy: args.source,
        },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: BigInt(totT) } },
      });
    }
  });

  return true;
}

// ---------------------------------------------- Direct upstream pings ------
// For providers without a usage API (Google, Mistral): send one tiny call
// against the upstream and meter the resulting tokens. Gives users immediate
// real data the same way the BYOK proxy would.

async function pingGoogle(
  credentialId: string,
  label: string,
  organizationId: string,
  providerId: string,
  apiKey: string
): Promise<SyncResult> {
  const modelName = process.env.GOOGLE_MODEL ?? "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] }),
    });
    const json = (await res.json()) as {
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        provider: "Google",
        credentialId,
        label,
        inserted: 0,
        skipped: 0,
        error: `Google ${res.status}: ${json.error?.message ?? "rejected the call"}`,
      };
    }
    const inT = json.usageMetadata?.promptTokenCount ?? 1;
    const outT = json.usageMetadata?.candidatesTokenCount ?? 1;
    const written = await upsertSyncedUsage({
      organizationId,
      providerId,
      modelName,
      timestamp: new Date(),
      source: "provider-sync:google",
      inputTokens: inT,
      outputTokens: outT,
      requests: 1,
    });
    await prisma.providerCredential.update({
      where: { id: credentialId },
      data: { lastUsedAt: new Date() },
    });
    return {
      ok: true,
      provider: "Google",
      credentialId,
      label,
      inserted: written ? 1 : 0,
      skipped: written ? 0 : 1,
      message: `Google has no public usage API, so we sent a real ${inT}+${outT} token call to ${modelName} and metered it. Use the BYOK proxy or CSV import for bulk historical data.`,
    };
  } catch (e) {
    return {
      ok: false,
      provider: "Google",
      credentialId,
      label,
      inserted: 0,
      skipped: 0,
      error: `Google ping failed: ${(e as Error).message}`,
    };
  }
}

async function pingMistral(
  credentialId: string,
  label: string,
  organizationId: string,
  providerId: string,
  apiKey: string
): Promise<SyncResult> {
  const modelName = "mistral-small-latest";
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 5,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    const json = (await res.json()) as {
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        provider: "Mistral",
        credentialId,
        label,
        inserted: 0,
        skipped: 0,
        error: `Mistral ${res.status}: ${json.message ?? "rejected the call"}`,
      };
    }
    const inT = json.usage?.prompt_tokens ?? 1;
    const outT = json.usage?.completion_tokens ?? 1;
    const written = await upsertSyncedUsage({
      organizationId,
      providerId,
      modelName,
      timestamp: new Date(),
      source: "provider-sync:mistral",
      inputTokens: inT,
      outputTokens: outT,
      requests: 1,
    });
    await prisma.providerCredential.update({
      where: { id: credentialId },
      data: { lastUsedAt: new Date() },
    });
    return {
      ok: true,
      provider: "Mistral",
      credentialId,
      label,
      inserted: written ? 1 : 0,
      skipped: written ? 0 : 1,
      message: `Mistral has no public usage API, so we sent a real ${inT}+${outT} token call to ${modelName} and metered it. Use the BYOK proxy or CSV import for bulk historical data.`,
    };
  } catch (e) {
    return {
      ok: false,
      provider: "Mistral",
      credentialId,
      label,
      inserted: 0,
      skipped: 0,
      error: `Mistral ping failed: ${(e as Error).message}`,
    };
  }
}

async function pingGitHub(
  credentialId: string,
  label: string,
  organizationId: string,
  providerId: string,
  apiKey: string
): Promise<SyncResult> {
  const modelName = process.env.GITHUB_MODEL ?? "openai/gpt-4o-mini";
  try {
    const res = await fetch("https://models.github.ai/inference/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 5,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    const json = (await res.json()) as {
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      error?: { message?: string } | string;
      message?: string;
    };
    if (!res.ok) {
      const errMsg =
        typeof json.error === "string"
          ? json.error
          : json.error?.message ?? json.message ?? "rejected the call";
      return {
        ok: false,
        provider: "GitHub",
        credentialId,
        label,
        inserted: 0,
        skipped: 0,
        error: `GitHub Models ${res.status}: ${errMsg}`,
      };
    }
    const inT = json.usage?.prompt_tokens ?? 1;
    const outT = json.usage?.completion_tokens ?? 1;
    const written = await upsertSyncedUsage({
      organizationId,
      providerId,
      modelName,
      timestamp: new Date(),
      source: "provider-sync:github",
      inputTokens: inT,
      outputTokens: outT,
      requests: 1,
    });
    await prisma.providerCredential.update({
      where: { id: credentialId },
      data: { lastUsedAt: new Date() },
    });
    return {
      ok: true,
      provider: "GitHub",
      credentialId,
      label,
      inserted: written ? 1 : 0,
      skipped: written ? 0 : 1,
      message: `GitHub Models has no public usage API. Sent a real ${inT}+${outT} token call to ${modelName} and metered it. Use the BYOK proxy for bulk metering.`,
    };
  } catch (e) {
    return {
      ok: false,
      provider: "GitHub",
      credentialId,
      label,
      inserted: 0,
      skipped: 0,
      error: `GitHub Models ping failed: ${(e as Error).message}`,
    };
  }
}
