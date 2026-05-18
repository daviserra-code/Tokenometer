import type { LanguageModel } from "ai";

export type CopilotProvider = "openai" | "anthropic" | "google" | "mistral" | "github";

export type CopilotConfig = {
  provider: CopilotProvider;
  modelId: string;
  configured: boolean;
  reason?: string;
};

/**
 * Picks a Copilot provider based on AI_PROVIDER env var, falling back to
 * whichever provider has an API key set. Returns config metadata so the
 * caller can render a useful "not configured" message.
 */
export function resolveCopilotConfig(): CopilotConfig {
  const explicit = (process.env.AI_PROVIDER ?? "").toLowerCase() as CopilotProvider;
  const order: CopilotProvider[] = explicit
    ? [explicit, "openai", "anthropic", "google", "mistral", "github"]
    : ["openai", "anthropic", "google", "mistral", "github"];

  for (const provider of order) {
    if (provider === "openai" && process.env.OPENAI_API_KEY) {
      return {
        provider,
        modelId: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        configured: true,
      };
    }
    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      return {
        provider,
        modelId: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest",
        configured: true,
      };
    }
    if (provider === "google" && process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return {
        provider,
        modelId: process.env.GOOGLE_MODEL ?? "gemini-2.0-flash",
        configured: true,
      };
    }
    if (provider === "mistral" && process.env.MISTRAL_API_KEY) {
      return {
        provider,
        modelId: process.env.MISTRAL_MODEL ?? "mistral-small-latest",
        configured: true,
      };
    }
    if (provider === "github" && process.env.GITHUB_TOKEN) {
      return {
        provider,
        modelId: process.env.GITHUB_MODEL ?? "openai/gpt-4o-mini",
        configured: true,
      };
    }
  }

  return {
    provider: explicit || "openai",
    modelId: "",
    configured: false,
    reason:
      "No AI provider key found. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, MISTRAL_API_KEY, or GITHUB_TOKEN in .env.",
  };
}

export async function getCopilotModel(cfg: CopilotConfig): Promise<LanguageModel> {
  switch (cfg.provider) {
    case "openai": {
      const { openai } = await import("@ai-sdk/openai");
      return openai(cfg.modelId);
    }
    case "anthropic": {
      const { anthropic } = await import("@ai-sdk/anthropic");
      return anthropic(cfg.modelId);
    }
    case "google": {
      const { google } = await import("@ai-sdk/google");
      return google(cfg.modelId);
    }
    case "mistral": {
      const { mistral } = await import("@ai-sdk/mistral");
      return mistral(cfg.modelId);
    }
    case "github": {
      // GitHub Models is OpenAI-compatible — reuse the OpenAI adapter with a
      // custom baseURL and the user's PAT (GITHUB_TOKEN).
      const { createOpenAI } = await import("@ai-sdk/openai");
      const provider = createOpenAI({
        apiKey: process.env.GITHUB_TOKEN ?? "",
        baseURL: "https://models.github.ai/inference",
      });
      return provider(cfg.modelId);
    }
  }
}
