"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  encryptSecret,
  generateApiKey,
  generateSecret,
  maskKey,
} from "@/lib/crypto";
import { importUsageCsv } from "@/lib/ingest";
import { syncProviderUsage } from "@/lib/provider-sync";
import { cookies } from "next/headers";

// --- Provider credentials -------------------------------------------------

const CredSchema = z.object({
  organizationId: z.string().min(1),
  providerId: z.string().min(1),
  label: z.string().min(1).max(60),
  apiKey: z.string().min(8, "API key looks too short."),
});

export async function saveCredentialAction(formData: FormData) {
  const parsed = CredSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const { organizationId, providerId, label, apiKey } = parsed.data;

  await prisma.providerCredential.upsert({
    where: {
      organizationId_providerId_label: { organizationId, providerId, label },
    },
    create: {
      organizationId,
      providerId,
      label,
      encryptedKey: encryptSecret(apiKey),
      keyHint: apiKey.slice(-4),
    },
    update: {
      encryptedKey: encryptSecret(apiKey),
      keyHint: apiKey.slice(-4),
      active: true,
    },
  });

  revalidatePath("/settings/credentials");
  redirect("/settings/credentials");
}

export async function deleteCredentialAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Credential id required.");
  await prisma.providerCredential.delete({ where: { id } });
  revalidatePath("/settings/credentials");
}

// --- Ingest sources -------------------------------------------------------

const IngestSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1).max(60),
});

export async function createIngestSourceAction(formData: FormData) {
  const parsed = IngestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  await prisma.ingestSource.create({
    data: {
      organizationId: parsed.data.organizationId,
      name: parsed.data.name,
      apiKey: generateApiKey(),
      secret: generateSecret(),
    },
  });
  revalidatePath("/settings/ingest");
  redirect("/settings/ingest");
}

export async function rotateIngestSecretAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id required.");
  await prisma.ingestSource.update({
    where: { id },
    data: { secret: generateSecret() },
  });
  revalidatePath("/settings/ingest");
}

export async function deleteIngestSourceAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id required.");
  await prisma.ingestSource.delete({ where: { id } });
  revalidatePath("/settings/ingest");
}

// --- CSV import -----------------------------------------------------------

export type ImportActionState =
  | { ok: true; inserted: number; failed: number; jobId: string; errors: string[] }
  | { ok: false; error: string };

export async function importCsvAction(formData: FormData): Promise<ImportActionState> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const file = formData.get("file");
  if (!organizationId) return { ok: false, error: "organizationId required." };
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "Please select a CSV file." };
  if (file.size > 20 * 1024 * 1024)
    return { ok: false, error: "File too large (>20MB)." };

  const text = await file.text();
  const job = await prisma.importJob.create({
    data: {
      organizationId,
      source: "csv",
      filename: file.name,
      status: "PROCESSING",
    },
  });
  try {
    const result = await importUsageCsv(organizationId, text, job.id);
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: result.inserted === 0 ? "FAILED" : "COMPLETED",
        rowsTotal: result.inserted + result.failed,
        rowsImported: result.inserted,
        rowsFailed: result.failed,
        completedAt: new Date(),
        error: result.errors.length ? result.errors.slice(0, 5).join("; ") : null,
      },
    });
    revalidatePath("/settings/import");
    return {
      ok: true,
      inserted: result.inserted,
      failed: result.failed,
      jobId: job.id,
      errors: result.errors,
    };
  } catch (e) {
    await prisma.importJob.update({
      where: { id: job.id },
      data: { status: "FAILED", completedAt: new Date(), error: (e as Error).message },
    });
    return { ok: false, error: (e as Error).message };
  }
}

// --- Test a vaulted credential by sending one real proxied call ----------

/**
 * Sends a 1-token chat-completion through the appropriate BYOK proxy using the
 * caller's vaulted credential. Gives users instant proof that the pipeline
 * works end-to-end without needing a separate Admin API key.
 */
export async function testCredentialAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Credential id required.");

  const cred = await prisma.providerCredential.findUnique({
    where: { id },
    include: { organization: true },
  });
  const provider = cred ? await prisma.provider.findUnique({ where: { id: cred.providerId } }) : null;
  const ingest = cred
    ? await prisma.ingestSource.findFirst({
        where: { organizationId: cred.organizationId, active: true },
      })
    : null;

  let ok = false;
  let message = "Unknown error.";
  let providerName = provider?.name ?? "?";

  if (!cred || !provider) {
    message = "Credential or provider not found.";
  } else if (!ingest) {
    message = "No active ingest source for this organization. Create one in Settings → Ingest first.";
  } else {
    const headersToken = ingest.apiKey;
    const base =
      process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`;
    try {
      let url: string;
      let body: unknown;
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-ingest-key": headersToken,
        "x-credential-id": cred.id,
        "x-project": "Tokenometer Self-Test",
      };
      switch (provider.name) {
        case "OpenAI":
          url = `${base}/api/proxy/openai/chat/completions`;
          body = {
            model: "gpt-4o-mini",
            max_tokens: 5,
            messages: [{ role: "user", content: "ping" }],
          };
          break;
        case "Anthropic":
          url = `${base}/api/proxy/anthropic/v1/messages`;
          body = {
            model: "claude-3-5-haiku-latest",
            max_tokens: 5,
            messages: [{ role: "user", content: "ping" }],
          };
          break;
        case "Google":
          url = `${base}/api/proxy/google/v1beta/models/gemini-2.0-flash:generateContent`;
          body = { contents: [{ parts: [{ text: "ping" }] }] };
          break;
        case "Mistral":
          url = `${base}/api/proxy/mistral/v1/chat/completions`;
          body = {
            model: "mistral-small-latest",
            max_tokens: 5,
            messages: [{ role: "user", content: "ping" }],
          };
          break;
        case "GitHub":
          url = `${base}/api/proxy/github/chat/completions`;
          body = {
            model: "openai/gpt-4o-mini",
            max_tokens: 5,
            messages: [{ role: "user", content: "ping" }],
          };
          break;
        default:
          throw new Error(`No test path for provider ${provider.name}.`);
      }
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (res.ok) {
        ok = true;
        message = `Sent a 5-token call through ${provider.name}. Refresh the dashboard to see it.`;
      } else {
        message = `${provider.name} upstream rejected the call (${res.status}): ${text.slice(0, 200)}`;
      }
    } catch (e) {
      message = `Test call failed: ${(e as Error).message}`;
    }
  }

  cookies().set(
    "sync-flash",
    JSON.stringify({ provider: providerName, ok, message, inserted: ok ? 1 : 0, skipped: 0 }),
    { path: "/settings/credentials", maxAge: 30, httpOnly: false }
  );
  revalidatePath("/", "layout");
  redirect("/settings/credentials");
}

// --- Wipe demo data -------------------------------------------------------

/**
 * Removes everything generated by the seed (usage events, wallet entries,
 * invoices, exchange rates, budgets, projects, teams) but PRESERVES:
 *   - Organization, Provider, Model price catalog
 *   - ProviderCredential (vaulted keys)
 *   - IngestSource
 *   - Wallets (balances reset to 0)
 *
 * After wiping, click "Sync now" on each credential to repopulate with
 * real data pulled from the provider's own API.
 */
export async function wipeDemoDataAction() {
  await prisma.$transaction([
    prisma.insight.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.walletEntry.deleteMany(),
    prisma.exchangeRate.deleteMany(),
    prisma.usageEvent.deleteMany(),
    prisma.budget.deleteMany(),
    prisma.importJob.deleteMany(),
    prisma.project.deleteMany(),
    prisma.team.deleteMany(),
    prisma.wallet.updateMany({ data: { balance: BigInt(0) } }),
  ]);
  cookies().set(
    "sync-flash",
    JSON.stringify({
      provider: "Demo",
      ok: true,
      message:
        "Demo data wiped. Vaulted credentials, ingest sources and model prices were preserved. Click Sync now to pull real usage.",
      inserted: 0,
      skipped: 0,
    }),
    { path: "/settings/credentials", maxAge: 30, httpOnly: false }
  );
  revalidatePath("/", "layout");
  redirect("/settings/credentials");
}

export { maskKey };

// --- Pull usage directly from provider APIs -------------------------------

export async function syncCredentialAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const days = Number(formData.get("days") ?? 7);
  if (!id) throw new Error("Credential id required.");
  const result = await syncProviderUsage(id, Number.isFinite(days) ? days : 7);
  cookies().set(
    "sync-flash",
    JSON.stringify({
      provider: result.provider,
      ok: result.ok,
      message: result.ok ? result.message ?? `Inserted ${result.inserted} rows.` : result.error,
      inserted: result.inserted,
      skipped: result.skipped,
    }),
    { path: "/settings/credentials", maxAge: 30, httpOnly: false }
  );
  revalidatePath("/settings/credentials");
  redirect("/settings/credentials");
}
