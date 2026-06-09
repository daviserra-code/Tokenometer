"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { assertCommercialLimit } from "@/lib/commercial-plans";
import { generateApiKey, maskKey } from "@/lib/crypto";
import { importUsageCsv } from "@/lib/ingest";
import { newEncryptedIngestSecret } from "@/lib/ingest-secret";
import { syncProviderUsage } from "@/lib/provider-sync";
import { getProviderTestConfig } from "@/lib/provider-tests";
import { prisma } from "@/lib/prisma";
import { assertCurrentOrganizationId, requireCurrentOrganization } from "@/lib/current-organization";
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

type AnthropicModelResolution =
  | { ok: true; model: string }
  | { ok: false; message: string };

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
  const { providerId, label, apiKey } = parsed.data;
  const organizationId = await assertCurrentOrganizationId(parsed.data.organizationId);
  const existing = await prisma.providerCredential.findUnique({
    where: {
      organizationId_providerId_label: { organizationId, providerId, label },
    },
    select: { id: true },
  });
  await assertCommercialLimit(organizationId, "credentials", !existing);

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
  await assertCurrentOrganizationId(existing?.organizationId);
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

const IntegrationSchema = z.object({
  id: z.string().optional(),
  organizationId: z.string().min(1),
  providerId: z.string().min(1),
  credentialId: z.string().optional(),
  ingestSourceId: z.string().optional(),
  projectId: z.string().optional(),
  teamId: z.string().optional(),
  name: z.string().min(2).max(80),
  agentName: z.string().max(80).optional(),
  ownerName: z.string().max(80).optional(),
  ownerEmail: z.string().email("Owner email must be valid.").max(120).optional().or(z.literal("")),
  runbookUrl: z.string().url("Runbook URL must be a valid URL.").max(300).optional().or(z.literal("")),
  environment: z.string().max(40).optional(),
  mode: z.enum(["OBSERVE", "FALLBACK", "ENFORCE"]),
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value !== "false"),
  notes: z.string().max(500).optional(),
});

export async function createIngestSourceAction(formData: FormData) {
  requireAdmin();
  const parsed = IngestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const organizationId = await assertCurrentOrganizationId(parsed.data.organizationId);
  await assertCommercialLimit(organizationId, "ingestSources");
  const secret = newEncryptedIngestSecret();
  await prisma.ingestSource.create({
    data: {
      organizationId,
      name: parsed.data.name,
      apiKey: generateApiKey(),
      encryptedSecret: secret.encryptedSecret,
      secretHint: secret.secretHint,
    },
  });
  await auditLog({
    action: "ingest_source.create",
    organizationId,
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
  const existing = await prisma.ingestSource.findUnique({ where: { id } });
  await assertCurrentOrganizationId(existing?.organizationId);
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
  await assertCurrentOrganizationId(source?.organizationId);
  await prisma.ingestSource.delete({ where: { id } });
  await auditLog({
    action: "ingest_source.delete",
    organizationId: source?.organizationId,
    targetType: "IngestSource",
    targetId: id,
  });
  revalidatePath("/settings/ingest");
}

// --- Named integrations ---------------------------------------------------

export async function saveIntegrationAction(formData: FormData) {
  requireAdmin();
  const parsed = IntegrationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const {
    id,
    providerId,
    credentialId,
    ingestSourceId,
    projectId,
    teamId,
    name,
    agentName,
    ownerName,
    ownerEmail,
    runbookUrl,
    environment,
    mode,
    active,
    notes,
  } = parsed.data;
  const organizationId = await assertCurrentOrganizationId(parsed.data.organizationId);
  await assertCommercialLimit(organizationId, "integrations", !id);

  const provider = await prisma.provider.findUnique({ where: { id: providerId } });
  if (!provider) throw new Error("Provider not found.");

  if (credentialId) {
    const credential = await prisma.providerCredential.findUnique({ where: { id: credentialId } });
    if (!credential || credential.organizationId !== organizationId || credential.providerId !== providerId) {
      throw new Error("Selected credential does not belong to this organization/provider.");
    }
  }

  if (ingestSourceId) {
    const source = await prisma.ingestSource.findUnique({ where: { id: ingestSourceId } });
    if (!source || source.organizationId !== organizationId) {
      throw new Error("Selected ingest source does not belong to this organization.");
    }
  }

  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.organizationId !== organizationId) {
      throw new Error("Selected project does not belong to this organization.");
    }
  }

  if (teamId) {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.organizationId !== organizationId) {
      throw new Error("Selected team does not belong to this organization.");
    }
  }

  const data = {
    organizationId,
    providerId,
    credentialId: credentialId || null,
    ingestSourceId: ingestSourceId || null,
    projectId: projectId || null,
    teamId: teamId || null,
    name,
    agentName: emptyToNull(agentName),
    ownerName: emptyToNull(ownerName),
    ownerEmail: emptyToNull(ownerEmail),
    runbookUrl: emptyToNull(runbookUrl),
    environment: emptyToNull(environment),
    mode,
    active,
    notes: emptyToNull(notes),
  };

  const integration = id
    ? await prisma.integration.update({
        where: { id },
        data,
      })
    : await prisma.integration.create({
        data,
      });

  await auditLog({
    action: id ? "integration.update" : "integration.create",
    organizationId,
    targetType: "Integration",
    targetId: integration.id,
    metadata: {
      providerId,
      name,
      mode,
      active,
      credentialId: credentialId || null,
      ingestSourceId: ingestSourceId || null,
      projectId: projectId || null,
      teamId: teamId || null,
      environment: emptyToNull(environment),
      ownerName: emptyToNull(ownerName),
      ownerEmail: emptyToNull(ownerEmail),
      runbookUrl: emptyToNull(runbookUrl),
    },
  });
  revalidatePath("/settings/integrations");
  revalidatePath("/settings/credentials");
  revalidatePath("/gateway");
  redirect("/settings/integrations");
}

export async function markIntegrationVerifiedAction(formData: FormData) {
  requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Integration id required.");
  const existing = await prisma.integration.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  await assertCurrentOrganizationId(existing?.organizationId);
  const integration = await prisma.integration.update({
    where: { id },
    data: { lastVerifiedAt: new Date() },
  });
  await auditLog({
    action: "integration.verified",
    organizationId: integration.organizationId,
    targetType: "Integration",
    targetId: integration.id,
    metadata: { name: integration.name },
  });
  revalidatePath("/settings/integrations");
  revalidatePath(`/settings/integrations/${integration.id}`);
  revalidatePath("/settings/credentials");
  revalidatePath("/gateway");
}

export async function deleteIntegrationAction(formData: FormData) {
  requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Integration id required.");
  const existing = await prisma.integration.findUnique({ where: { id } });
  await assertCurrentOrganizationId(existing?.organizationId);
  await prisma.integration.delete({ where: { id } });
  await auditLog({
    action: "integration.delete",
    organizationId: existing?.organizationId,
    targetType: "Integration",
    targetId: id,
    metadata: { name: existing?.name ?? null },
  });
  revalidatePath("/settings/integrations");
  revalidatePath("/settings/credentials");
  revalidatePath("/gateway");
}

// --- CSV import -----------------------------------------------------------

export type ImportActionState =
  | { ok: true; inserted: number; failed: number; jobId: string; errors: string[] }
  | { ok: false; error: string };

export async function importCsvAction(formData: FormData): Promise<ImportActionState> {
  requireAdmin();
  const organizationId = await assertCurrentOrganizationId(String(formData.get("organizationId") ?? ""));
  const file = formData.get("file");
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
  const modelOverride = String(formData.get("modelOverride") ?? "").trim();
  if (!id) throw new Error("Credential id required.");

  const cred = await prisma.providerCredential.findUnique({
    where: { id },
    include: { organization: true },
  });
  await assertCurrentOrganizationId(cred?.organizationId);
  const provider = cred ? await prisma.provider.findUnique({ where: { id: cred.providerId } }) : null;
  const ingest = cred
    ? await prisma.ingestSource.findFirst({
        where: { organizationId: cred.organizationId, active: true },
      })
    : null;

  let ok = false;
  let message = "Unknown error.";
  const providerName = provider?.name ?? "?";
  let lastAttemptedModel = "";

  if (!cred || !provider) {
    message = "Credential or provider not found.";
  } else if (!ingest) {
    message = "No active ingest source for this organization. Create one in Settings -> Ingest first.";
  } else {
    const headersToken = ingest.apiKey;
    const testConfig = getProviderTestConfig(provider.name);

    try {
      if (!testConfig) {
        throw new Error(`No guided test path for provider ${provider.name}.`);
      }

      const requestId = crypto.randomUUID();
      const defaultCandidateModels = testConfig.candidateModels?.length
        ? testConfig.candidateModels
        : [testConfig.model];
      let candidateModels =
        modelOverride && testConfig.allowModelOverride
          ? [modelOverride]
          : defaultCandidateModels;
      lastAttemptedModel = candidateModels[0] ?? testConfig.model;
      if (provider.name === "Anthropic" && modelOverride && testConfig.allowModelOverride) {
        const resolved = resolveAnthropicDirectModel(modelOverride);
        if (!resolved.ok) {
          message = resolved.message;
          setVerificationFlash({
            kind: "guided-test",
            provider: provider.name,
            ok: false,
            message,
            model: modelOverride,
            timestamp: new Date().toISOString(),
          });
          await auditLog({
            action: "credential.test",
            organizationId: cred?.organizationId,
            targetType: "ProviderCredential",
            targetId: id,
            metadata: { provider: providerName, ok, message, modelOverride },
          });
          revalidatePath("/", "layout");
          revalidatePath("/ledger");
          revalidatePath("/reports");
          redirect("/settings/credentials");
        }
        candidateModels = [resolved.model];
        lastAttemptedModel = resolved.model;
      }
      const requestHeaders = headers();
      const forwardedProto = requestHeaders.get("x-forwarded-proto");
      const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
      const localBase =
        forwardedProto && forwardedHost
          ? `${forwardedProto}://${forwardedHost}`
          : process.env.NEXT_PUBLIC_APP_URL ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`;

      let finalModel = candidateModels[0];
      let res: Response | null = null;
      let text = "";
      let echoedRequestId = requestId;

      for (const candidateModel of candidateModels) {
        finalModel = candidateModel;
        lastAttemptedModel = candidateModel;
        const endpoint = rewriteGuidedTestEndpoint(testConfig.endpoint, provider.name, candidateModel);
        const body = rewriteGuidedTestBody(testConfig.body, provider.name, candidateModel);
        res = await fetch(`${localBase}${endpoint}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-ingest-key": headersToken,
            "x-credential-id": cred.id,
            "x-project": "Tokenometer Self-Test",
            "x-agent": "guided-provider-test",
            "x-request-id": requestId,
          },
          body: JSON.stringify(body),
        });
        echoedRequestId = res.headers.get("x-request-id")?.trim() || requestId;
        if (res.ok) {
          break;
        }
        text = await safeReadResponseText(res);
        if (!shouldRetryGuidedModel(res.status, text)) {
          break;
        }
      }

      if (!res) {
        throw new Error("No guided test request could be sent.");
      }

      if (res.ok) {
        ok = true;
        message = `Sent a guided ${provider.name} test through ${finalModel}. Request ${echoedRequestId} should now appear in Gateway, Ledger, and Live reports.`;
        setVerificationFlash({
          kind: "guided-test",
          provider: provider.name,
          ok: true,
          message,
          requestId: echoedRequestId,
          model: finalModel,
          timestamp: new Date().toISOString(),
        });
      } else {
        const detail = text.trim() ? text.slice(0, 200) : "Upstream rejected the request without a readable error body.";
        const providerHint =
          provider.name === "Anthropic" && res.status === 404
            ? " This usually means the key does not have access to that direct Anthropic model, or the organization is actually using Bedrock or Vertex rather than the direct Anthropic API."
            : "";
        message = `${provider.name} upstream rejected the call after trying ${candidateModels.length} model candidate${candidateModels.length === 1 ? "" : "s"}, last attempt ${finalModel} (${res.status}): ${detail}${providerHint}`;
        setVerificationFlash({
          kind: "guided-test",
          provider: provider.name,
          ok: false,
          message,
          requestId: echoedRequestId,
          model: finalModel,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) {
      const errorMessage = (e as Error).message;
      if (provider.name === "Anthropic" && errorMessage.toLowerCase().includes("terminated")) {
        message =
          "Anthropic ended the failed response before Tokenometer could read the full error body. This usually means the key is valid but the chosen direct Anthropic model is unavailable for that key, or the organization is actually using Bedrock or Vertex instead of the direct Anthropic API.";
      } else {
        message = `Test call failed: ${errorMessage}`;
      }
      setVerificationFlash({
        kind: "guided-test",
        provider: provider.name,
        ok: false,
        message,
        model: lastAttemptedModel || getProviderTestConfig(provider.name)?.model || undefined,
        timestamp: new Date().toISOString(),
      });
    }
  }

  cookies().delete("sync-flash");
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

function rewriteGuidedTestEndpoint(endpoint: string, providerName: string, model: string) {
  if (providerName === "Google") {
    return endpoint.replace(/models\/[^:]+:/, `models/${model}:`);
  }
  return endpoint;
}

function rewriteGuidedTestBody(
  body: Record<string, unknown>,
  providerName: string,
  model: string
) {
  if (providerName === "Anthropic" || providerName === "OpenAI" || providerName === "Mistral" || providerName === "DeepSeek" || providerName === "MiniMax" || providerName === "GitHub") {
    return { ...body, model };
  }
  return body;
}

function shouldRetryGuidedModel(status: number, text: string) {
  if (status === 404) return true;
  const lowered = text.toLowerCase();
  return (
    lowered.includes("model") &&
    (lowered.includes("not found") ||
      lowered.includes("unsupported") ||
      lowered.includes("not available") ||
      lowered.includes("does not exist"))
  );
}

function resolveAnthropicDirectModel(input: string): AnthropicModelResolution {
  const raw = input.trim();
  const lowered = raw.toLowerCase();

  if (!raw) {
    return { ok: false, message: "Enter a direct Anthropic API model ID first." };
  }

  if (lowered.startsWith("arn:aws:bedrock:") || lowered.startsWith("us.anthropic.") || lowered.includes(":0")) {
    return {
      ok: false,
      message:
        "That looks like an Amazon Bedrock Anthropic model ID, not a direct Anthropic API model ID. Tokenometer's guided Anthropic test currently targets the direct Anthropic API route only. Try a direct ID like claude-sonnet-4-20250514.",
    };
  }

  if (lowered.includes("@")) {
    return {
      ok: false,
      message:
        "That looks like a Vertex Anthropic model ID, not a direct Anthropic API model ID. Tokenometer's guided Anthropic test currently targets the direct Anthropic API route only. Try a direct ID like claude-sonnet-4-20250514.",
    };
  }

  if (/\bsonnet\b.*\b4\.6\b/.test(lowered) || /\b4\.6\b.*\bsonnet\b/.test(lowered)) {
    return {
      ok: false,
      message:
        "\"Claude Sonnet 4.6\" looks like a product label or non-direct alias, not a documented direct Anthropic API model ID. For the direct Anthropic API, try claude-sonnet-4-20250514.",
    };
  }

  if (
    lowered === "sonnet" ||
    lowered === "sonnet 4" ||
    lowered === "claude sonnet 4" ||
    lowered === "claude-sonnet-4"
  ) {
    return { ok: true, model: "claude-sonnet-4-20250514" };
  }
  if (
    lowered === "opus" ||
    lowered === "opus 4" ||
    lowered === "claude opus 4" ||
    lowered === "claude-opus-4"
  ) {
    return { ok: true, model: "claude-opus-4-20250514" };
  }
  if (
    lowered === "claude 3.7 sonnet" ||
    lowered === "sonnet 3.7" ||
    lowered === "claude-sonnet-3.7" ||
    lowered === "claude 3-7 sonnet"
  ) {
    return { ok: true, model: "claude-3-7-sonnet-20250219" };
  }
  if (
    lowered === "claude 3.5 haiku" ||
    lowered === "haiku 3.5" ||
    lowered === "claude haiku 3.5" ||
    lowered === "claude-haiku-3.5"
  ) {
    return { ok: true, model: "claude-3-5-haiku-20241022" };
  }

  return { ok: true, model: raw };
}

async function safeReadResponseText(response: Response) {
  try {
    return await response.text();
  } catch (error) {
    return error instanceof Error ? `Unreadable upstream error body (${error.message}).` : "Unreadable upstream error body.";
  }
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
  const organization = await requireCurrentOrganization();
  await prisma.$transaction([
    prisma.insight.deleteMany({ where: { organizationId: organization.id } }),
    prisma.invoice.deleteMany({ where: { organizationId: organization.id } }),
    prisma.walletEntry.deleteMany({ where: { wallet: { organizationId: organization.id } } }),
    prisma.exchangeRate.deleteMany({ where: { organizationId: organization.id } }),
    prisma.usageEvent.deleteMany({ where: { organizationId: organization.id } }),
    prisma.budget.deleteMany({ where: { organizationId: organization.id } }),
    prisma.importJob.deleteMany({ where: { organizationId: organization.id } }),
    prisma.project.deleteMany({ where: { organizationId: organization.id } }),
    prisma.team.deleteMany({ where: { organizationId: organization.id } }),
    prisma.wallet.updateMany({ where: { organizationId: organization.id }, data: { balance: BigInt(0) } }),
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
  await auditLog({
    action: "demo_data.wipe",
    organizationId: organization.id,
    targetType: "Organization",
    targetId: organization.id,
  });
  revalidatePath("/", "layout");
  redirect("/settings/credentials");
}

export { maskKey };

function emptyToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

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

