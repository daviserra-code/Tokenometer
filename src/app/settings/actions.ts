"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { generateApiKey, maskKey } from "@/lib/crypto";
import { importUsageCsv } from "@/lib/ingest";
import { newEncryptedIngestSecret } from "@/lib/ingest-secret";
import { syncProviderUsage } from "@/lib/provider-sync";
import { getProviderTestConfig } from "@/lib/provider-tests";
import { prisma } from "@/lib/prisma";
import { encryptVaultSecret } from "@/lib/secret-store";
import { cookies } from "next/headers";

// --- Provider credentials -------------------------------------------------

const CredSchema = z.object({
  organizationId: z.string().min(1),
  providerId: z.string().min(1),
  label: z.string().min(1).max(60),
  apiKey: z.string().min(8, "API key looks too short."),
});

type VerificationFlash = {
  kind: "guided-test";
  provider: string;
  ok: boolean;
  message: string;
  requestId?: string;
  model?: string;
  timestamp: string;
};

function setVerificationFlash(flash: VerificationFlash) {
  cookies().set("verification-flash", JSON.stringify(flash), {
    path: "/",
    maxAge: 5 * 60,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function saveCredentialAction(formData: FormData) {
  requireAdmin();
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
      encryptedKey: encryptVaultSecret(apiKey),
      keyHint: apiKey.slice(-4),
    },
    update: {
      encryptedKey: encryptVaultSecret(apiKey),
      keyHint: apiKey.slice(-4),
      active: true,
    },
  });
  await auditLog({
    action: "credential.upsert",
    organizationId,
    targetType: "ProviderCredential",
    metadata: { providerId, label, keyHint: apiKey.slice(-4) },
  });

  revalidatePath("/settings/credentials");
  redirect("/settings/credentials");
}

export async function deleteCredentialAction(formData: FormData) {
  requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Credential id required.");
  const existing = await prisma.providerCredential.findUnique({ where: { id } });
  await prisma.providerCredential.delete({ where: { id } });
  await auditLog({
    action: "credential.delete",
    organizationId: existing?.organizationId,
    targetType: "ProviderCredential",
    targetId: id,
  });
  revalidatePath("/settings/credentials");
}

// --- Ingest sources -------------------------------------------------------

const IngestSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1).max(60),
});

export async function createIngestSourceAction(formData: FormData) {
  requireAdmin();
  const parsed = IngestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const secret = newEncryptedIngestSecret();
  await prisma.ingestSource.create({
    data: {
      organizationId: parsed.data.organizationId,
      name: parsed.data.name,
      apiKey: generateApiKey(),
      encryptedSecret: secret.encryptedSecret,
      secretHint: secret.secretHint,
    },
  });
  await auditLog({
    action: "ingest_source.create",
    organizationId: parsed.data.organizationId,
    targetType: "IngestSource",
    metadata: { name: parsed.data.name },
  });
  revalidatePath("/settings/ingest");
  redirect("/settings/ingest");
}

export async function rotateIngestSecretAction(formData: FormData) {
  requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id required.");
  const secret = newEncryptedIngestSecret();
  const source = await prisma.ingestSource.update({
    where: { id },
    data: { encryptedSecret: secret.encryptedSecret, secretHint: secret.secretHint, secret: null },
  });
  await auditLog({
    action: "ingest_source.rotate_secret",
    organizationId: source.organizationId,
    targetType: "IngestSource",
    targetId: id,
  });
  revalidatePath("/settings/ingest");
}

export async function deleteIngestSourceAction(formData: FormData) {
  requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("id required.");
  const source = await prisma.ingestSource.findUnique({ where: { id } });
  await prisma.ingestSource.delete({ where: { id } });
  await auditLog({
    action: "ingest_source.delete",
    organizationId: source?.organizationId,
    targetType: "IngestSource",
    targetId: id,
  });
  revalidatePath("/settings/ingest");
}

// --- CSV import -----------------------------------------------------------

export type ImportActionState =
  | { ok: true; inserted: number; failed: number; jobId: string; errors: string[] }
  | { ok: false; error: string };

export async function importCsvAction(formData: FormData): Promise<ImportActionState> {
  requireAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");
  const file = formData.get("file");
  if (!organizationId) return { ok: false, error: "organizationId required." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Please select a CSV file." };
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: "File too large (>20MB)." };

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
    await auditLog({
      action: "csv.import",
      organizationId,
      targetType: "ImportJob",
      targetId: job.id,
      metadata: { filename: file.name, inserted: result.inserted, failed: result.failed },
    });
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
 * Sends a tiny provider-specific request through the appropriate BYOK proxy using the
 * caller's vaulted credential. Gives users instant proof that the pipeline
 * works end-to-end without needing a separate Admin API key.
 */
export async function testCredentialAction(formData: FormData) {
  requireAdmin();
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
  const providerName = provider?.name ?? "?";

  if (!cred || !provider) {
    message = "Credential or provider not found.";
  } else if (!ingest) {
    message = "No active ingest source for this organization. Create one in Settings -> Ingest first.";
  } else {
    const headersToken = ingest.apiKey;
    const base = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`;
    const testConfig = getProviderTestConfig(provider.name);

    try {
      if (!testConfig) {
        throw new Error(`No guided test path for provider ${provider.name}.`);
      }

      const requestId = crypto.randomUUID();
      const res = await fetch(`${base}${testConfig.endpoint}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ingest-key": headersToken,
          "x-credential-id": cred.id,
          "x-project": "Tokenometer Self-Test",
          "x-agent": "guided-provider-test",
          "x-request-id": requestId,
        },
        body: JSON.stringify(testConfig.body),
      });
      const text = await res.text();
      const echoedRequestId = res.headers.get("x-request-id")?.trim() || requestId;

      if (res.ok) {
        ok = true;
        message = `Sent a guided ${provider.name} test through ${testConfig.model}. Request ${echoedRequestId} should now appear in Gateway, Ledger, and Live reports.`;
        setVerificationFlash({
          kind: "guided-test",
          provider: provider.name,
          ok: true,
          message,
          requestId: echoedRequestId,
          model: testConfig.model,
          timestamp: new Date().toISOString(),
        });
      } else {
        message = `${provider.name} upstream rejected the call (${res.status}): ${text.slice(0, 200)}`;
        setVerificationFlash({
          kind: "guided-test",
          provider: provider.name,
          ok: false,
          message,
          requestId: echoedRequestId,
          model: testConfig.model,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) {
      const testConfigModel = getProviderTestConfig(provider.name)?.model;
      message = `Test call failed: ${(e as Error).message}`;
      setVerificationFlash({
        kind: "guided-test",
        provider: provider.name,
        ok: false,
        message,
        model: testConfigModel ?? undefined,
        timestamp: new Date().toISOString(),
      });
    }
  }

  cookies().set(
    "sync-flash",
    JSON.stringify({ provider: providerName, ok, message, inserted: ok ? 1 : 0, skipped: 0 }),
    { path: "/settings/credentials", maxAge: 30, httpOnly: false }
  );
  await auditLog({
    action: "credential.test",
    organizationId: cred?.organizationId,
    targetType: "ProviderCredential",
    targetId: id,
    metadata: { provider: providerName, ok },
  });
  revalidatePath("/", "layout");
  revalidatePath("/ledger");
  revalidatePath("/reports");
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
  requireAdmin();
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
  await auditLog({ action: "demo_data.wipe", targetType: "Organization" });
  revalidatePath("/", "layout");
  redirect("/settings/credentials");
}

export { maskKey };

// --- Pull usage directly from provider APIs -------------------------------

export async function syncCredentialAction(formData: FormData) {
  requireAdmin();
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
  await auditLog({
    action: "credential.sync",
    targetType: "ProviderCredential",
    targetId: id,
    metadata: { provider: result.provider, ok: result.ok, inserted: result.inserted, skipped: result.skipped },
  });
  revalidatePath("/settings/credentials");
  redirect("/settings/credentials");
}
