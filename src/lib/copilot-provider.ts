import type { LanguageModel } from "ai";
import { prisma } from "@/lib/prisma";
import { decryptVaultSecret } from "@/lib/secret-store";

export type CopilotProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "mistral"
  | "deepseek"
  | "minimax"
  | "github";

export type CopilotConfig = {
  provider: CopilotProvider;
  modelId: string;
  configured: boolean;
  reason?: string;
  source?: "env" | "vault";
  credentialLabel?: string;
  apiKey?: string;
};

const PROVIDER_DB_NAMES: Record<CopilotProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  minimax: "MiniMax",
  github: "GitHub",
};

const DEFAULT_MODELS: Record<CopilotProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-20250514",
  google: "gemini-2.5-flash",
  mistral: "mistral-small-latest",
  deepseek: "deepseek-v4-flash",
  minimax: "MiniMax-M2.7",
  github: "openai/gpt-4o-mini",
};

function envModelVar(provider: CopilotProvider): string {
  switch (provider) {
    case "openai":
      return "OPENAI_MODEL";
    case "anthropic":
      return "ANTHROPIC_MODEL";
    case "google":
      return "GOOGLE_MODEL";
    case "mistral":
      return "MISTRAL_MODEL";
    case "deepseek":
      return "DEEPSEEK_MODEL";
    case "minimax":
      return "MINIMAX_MODEL";
    case "github":
      return "GITHUB_MODEL";
  }
}

function resolveEnvConfig(provider: CopilotProvider): CopilotConfig | null {
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return {
      provider,
      modelId: process.env.OPENAI_MODEL ?? DEFAULT_MODELS.openai,
      configured: true,
      source: "env",
      apiKey: process.env.OPENAI_API_KEY,
    };
  }
  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return {
      provider,
      modelId: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODELS.anthropic,
      configured: true,
      source: "env",
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }
  if (provider === "google" && process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      provider,
      modelId: process.env.GOOGLE_MODEL ?? DEFAULT_MODELS.google,
      configured: true,
      source: "env",
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    };
  }
  if (provider === "mistral" && process.env.MISTRAL_API_KEY) {
    return {
      provider,
      modelId: process.env.MISTRAL_MODEL ?? DEFAULT_MODELS.mistral,
      configured: true,
      source: "env",
      apiKey: process.env.MISTRAL_API_KEY,
    };
  }
  if (provider === "deepseek" && process.env.DEEPSEEK_API_KEY) {
    return {
      provider,
      modelId: process.env.DEEPSEEK_MODEL ?? DEFAULT_MODELS.deepseek,
      configured: true,
      source: "env",
      apiKey: process.env.DEEPSEEK_API_KEY,
    };
  }
  if (provider === "minimax" && process.env.MINIMAX_API_KEY) {
    return {
      provider,
      modelId: process.env.MINIMAX_MODEL ?? DEFAULT_MODELS.minimax,
      configured: true,
      source: "env",
      apiKey: process.env.MINIMAX_API_KEY,
    };
  }
  if (provider === "github" && (process.env.GITHUB_MODELS_API_KEY || process.env.GITHUB_TOKEN)) {
    return {
      provider,
      modelId: process.env.GITHUB_MODEL ?? DEFAULT_MODELS.github,
      configured: true,
      source: "env",
      apiKey: process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN ?? "",
    };
  }

  return null;
}

async function resolveVaultConfig(
  provider: CopilotProvider,
  organizationId: string
): Promise<CopilotConfig | null> {
  const providerRecord = await prisma.provider.findUnique({
    where: { name: PROVIDER_DB_NAMES[provider] },
    select: { id: true },
  });
  if (!providerRecord) return null;

  const credential = await prisma.providerCredential.findFirst({
    where: {
      organizationId,
      providerId: providerRecord.id,
      active: true,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  if (!credential) return null;

  try {
    return {
      provider,
      modelId: process.env[envModelVar(provider)] ?? DEFAULT_MODELS[provider],
      configured: true,
      source: "vault",
      credentialLabel: credential.label,
      apiKey: decryptVaultSecret(credential.encryptedKey),
    };
  } catch {
    return {
      provider,
      modelId: DEFAULT_MODELS[provider],
      configured: false,
      source: "vault",
      credentialLabel: credential.label,
      reason: `The vaulted ${PROVIDER_DB_NAMES[provider]} credential could not be decrypted. Re-add the key in Credentials.`,
    };
  }
}

/**
 * Picks a Copilot provider based on AI_PROVIDER env var, falling back to
 * whichever provider has an API key set. It prefers Tokenometer's vaulted
 * provider credentials when an organization is available, then falls back to
 * raw server environment variables.
 */
export async function resolveCopilotConfig(organizationId?: string | null): Promise<CopilotConfig> {
  const explicit = (process.env.AI_PROVIDER ?? "").toLowerCase() as CopilotProvider;
  const order: CopilotProvider[] = explicit
    ? [explicit, "openai", "anthropic", "google", "mistral", "deepseek", "minimax", "github"]
    : ["openai", "anthropic", "google", "mistral", "deepseek", "minimax", "github"];

  for (const provider of order) {
    if (organizationId) {
      const vaultConfig = await resolveVaultConfig(provider, organizationId);
      if (vaultConfig) return vaultConfig;
    }

    const envConfig = resolveEnvConfig(provider);
    if (envConfig) return envConfig;
  }

  return {
    provider: explicit || "openai",
    modelId: "",
    configured: false,
    reason:
      "No AI provider key found. Add a vaulted provider credential in Tokenometer Credentials, or set OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, MISTRAL_API_KEY, DEEPSEEK_API_KEY, MINIMAX_API_KEY, or GITHUB_MODELS_API_KEY/GITHUB_TOKEN in the server environment.",
  };
}

export async function getCopilotModel(cfg: CopilotConfig): Promise<LanguageModel> {
  switch (cfg.provider) {
    case "openai": {
      const { createOpenAI, openai } = await import("@ai-sdk/openai");
      if (cfg.apiKey) {
        return createOpenAI({ apiKey: cfg.apiKey })(cfg.modelId);
      }
      return openai(cfg.modelId);
    }
    case "anthropic": {
      const { anthropic, createAnthropic } = await import("@ai-sdk/anthropic");
      if (cfg.apiKey) {
        return createAnthropic({ apiKey: cfg.apiKey })(cfg.modelId);
      }
      return anthropic(cfg.modelId);
    }
    case "google": {
      const { createGoogleGenerativeAI, google } = await import("@ai-sdk/google");
      if (cfg.apiKey) {
        return createGoogleGenerativeAI({ apiKey: cfg.apiKey })(cfg.modelId);
      }
      return google(cfg.modelId);
    }
    case "mistral": {
      const { createMistral, mistral } = await import("@ai-sdk/mistral");
      if (cfg.apiKey) {
        return createMistral({ apiKey: cfg.apiKey })(cfg.modelId);
      }
      return mistral(cfg.modelId);
    }
    case "deepseek": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const provider = createOpenAI({
        apiKey: cfg.apiKey ?? process.env.DEEPSEEK_API_KEY ?? "",
        baseURL: "https://api.deepseek.com",
      });
      return provider(cfg.modelId);
    }
    case "minimax": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const provider = createOpenAI({
        apiKey: cfg.apiKey ?? process.env.MINIMAX_API_KEY ?? "",
        baseURL: "https://api.minimax.io/v1",
      });
      return provider(cfg.modelId);
    }
    case "github": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const provider = createOpenAI({
        apiKey: cfg.apiKey ?? process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN ?? "",
        baseURL: "https://models.github.ai/inference",
      });
      return provider(cfg.modelId);
    }
  }
}
