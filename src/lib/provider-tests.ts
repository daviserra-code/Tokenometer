export type ProviderTestConfig = {
  providerName: string;
  endpoint: string;
  model: string;
  candidateModels?: string[];
  modelLabel?: string;
  allowModelOverride?: boolean;
  title: string;
  summary: string;
  verifyHint: string;
  historicalNote: string;
  body: Record<string, unknown>;
};

export const PROVIDER_TESTS: ProviderTestConfig[] = [
  {
    providerName: "OpenAI",
    endpoint: "/api/proxy/openai/chat/completions",
    model: "gpt-4o-mini",
    title: "OpenAI guided test",
    summary: "Runs one tiny chat completion through Tokenometer using gpt-4o-mini.",
    verifyHint: "Expect a fresh request ID, a small token count, and immediate visibility in Gateway, Ledger, and Live reports.",
    historicalNote: "Historical sync needs an Admin API key. The guided test works with a normal project key.",
    body: {
      model: "gpt-4o-mini",
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    },
  },
  {
    providerName: "Anthropic",
    endpoint: "/api/proxy/anthropic/v1/messages",
    model: "claude-3-5-haiku-20241022",
    candidateModels: [
      "claude-3-5-haiku-20241022",
      "claude-3-7-sonnet-20250219",
      "claude-sonnet-4-20250514",
      "claude-opus-4-20250514",
    ],
    modelLabel: "tries current official Claude IDs automatically",
    allowModelOverride: true,
    title: "Anthropic guided test",
    summary: "Runs one tiny messages request through Tokenometer using documented Claude model IDs, with fallback across current Anthropic generations.",
    verifyHint: "Expect a fresh request ID and a small usage event in Gateway and Ledger. Historical sync still needs an Admin key.",
    historicalNote: "Historical sync needs an Admin API key. The guided test works with a normal API key.",
    body: {
      model: "claude-3-5-haiku-20241022",
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    },
  },
  {
    providerName: "Google",
    endpoint: "/api/proxy/google/v1beta/models/gemini-2.5-flash:generateContent",
    model: "gemini-2.5-flash",
    candidateModels: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
    modelLabel: "starts with gemini-2.5-flash, falls back if needed",
    title: "Gemini guided test",
    summary: "Runs one tiny Gemini generateContent call through Tokenometer using a stable Gemini model, with fallback if a specific model code is unavailable.",
    verifyHint: "Expect a fresh request ID and a small usage event in Gateway and Ledger. This is the recommended Google verification path.",
    historicalNote: "Google does not expose a public historical usage API, so the guided test is the main proof path.",
    body: {
      contents: [{ parts: [{ text: "ping" }] }],
    },
  },
  {
    providerName: "Mistral",
    endpoint: "/api/proxy/mistral/v1/chat/completions",
    model: "mistral-small-latest",
    title: "Mistral guided test",
    summary: "Runs one tiny chat completion through Tokenometer using mistral-small-latest.",
    verifyHint: "Expect a fresh request ID and immediate live metering in Gateway and Ledger.",
    historicalNote: "Mistral does not expose a public historical usage API, so guided testing is the main proof path.",
    body: {
      model: "mistral-small-latest",
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    },
  },
  {
    providerName: "DeepSeek",
    endpoint: "/api/proxy/deepseek/chat/completions",
    model: "deepseek-v4-flash",
    title: "DeepSeek guided test",
    summary: "Runs one tiny chat completion through Tokenometer using DeepSeek V4 Flash.",
    verifyHint: "Expect a fresh request ID, a small usage event, and immediate live metering in Gateway and Ledger.",
    historicalNote: "DeepSeek does not expose a public historical usage API, so guided testing is the main proof path.",
    body: {
      model: "deepseek-v4-flash",
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    },
  },
  {
    providerName: "MiniMax",
    endpoint: "/api/proxy/minimax/chat/completions",
    model: "MiniMax-M2.7",
    modelLabel: "MiniMax-M2.7",
    title: "MiniMax guided test",
    summary: "Runs one tiny OpenAI-compatible chat completion through Tokenometer using MiniMax-M2.7.",
    verifyHint: "Expect a fresh request ID, a small usage event, and immediate live metering in Gateway and Ledger.",
    historicalNote: "MiniMax does not expose a public historical usage API, so guided testing is the main proof path.",
    body: {
      model: "MiniMax-M2.7",
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    },
  },
  {
    providerName: "GitHub",
    endpoint: "/api/proxy/github/chat/completions",
    model: "openai/gpt-4o-mini",
    modelLabel: "openai/gpt-4o-mini",
    title: "GitHub Copilot / Models guided test",
    summary: "Runs one tiny chat completion through Tokenometer using GitHub Models and openai/gpt-4o-mini.",
    verifyHint: "Expect a fresh request ID and a small usage event if the PAT has models:read and billing access is enabled.",
    historicalNote: "GitHub Models has no public historical usage API, so guided testing is the main verification path.",
    body: {
      model: "openai/gpt-4o-mini",
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    },
  },
];

export function getProviderTestConfig(providerName: string) {
  return PROVIDER_TESTS.find((config) => config.providerName === providerName) ?? null;
}
