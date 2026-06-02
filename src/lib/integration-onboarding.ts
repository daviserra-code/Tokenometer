export type ProviderSlug = "openai" | "anthropic" | "google" | "mistral" | "deepseek" | "github";
export type RolloutSlug = "observe" | "fallback" | "enforce";

export type ProviderConfig = {
  slug: ProviderSlug;
  name: string;
  endpoint: string;
  historical: string;
  live: string;
  streaming: string;
  model: string;
  modelEnvVar: string;
  envVar: string;
  nodeFunction: string;
  pythonFunction: string;
  defaultProject: string;
  defaultAgent: string;
};

export type RolloutConfig = {
  slug: RolloutSlug;
  label: string;
  runtimeMode: "shadow" | "proxy";
  fallbackAllowed: boolean;
  requiresProviderKeyInApp: boolean;
  requiresIngestSecret: boolean;
  promise: string;
  caution: string;
  bestFor: string;
};

type IntegrationEnvOptions = {
  integrationId?: string | null;
  project?: string | null;
  agent?: string | null;
};

export const INTEGRATION_PROVIDERS: ProviderConfig[] = [
  {
    slug: "openai",
    name: "OpenAI",
    endpoint: "/api/proxy/openai/chat/completions",
    historical: "Admin key",
    live: "Response usage",
    streaming: "Yes",
    model: "gpt-4o-mini",
    modelEnvVar: "OPENAI_MODEL",
    envVar: "OPENAI_API_KEY",
    nodeFunction: "callOpenAiChat",
    pythonFunction: "call_openai_chat",
    defaultProject: "customer-support",
    defaultAgent: "support-bot",
  },
  {
    slug: "anthropic",
    name: "Anthropic",
    endpoint: "/api/proxy/anthropic/v1/messages",
    historical: "Admin key",
    live: "Response usage",
    streaming: "Yes",
    model: "claude-3-5-haiku-latest",
    modelEnvVar: "ANTHROPIC_MODEL",
    envVar: "ANTHROPIC_API_KEY",
    nodeFunction: "callAnthropicMessages",
    pythonFunction: "call_anthropic_messages",
    defaultProject: "research-assistant",
    defaultAgent: "claude-worker",
  },
  {
    slug: "google",
    name: "Google",
    endpoint: "/api/proxy/google/v1beta/models/gemini-2.0-flash:generateContent",
    historical: "No public API",
    live: "Response usage",
    streaming: "Soon",
    model: "gemini-2.0-flash",
    modelEnvVar: "GEMINI_MODEL",
    envVar: "GEMINI_API_KEY",
    nodeFunction: "callGeminiGenerateContent",
    pythonFunction: "call_gemini_generate_content",
    defaultProject: "ops-assistant",
    defaultAgent: "gemini-runner",
  },
  {
    slug: "mistral",
    name: "Mistral",
    endpoint: "/api/proxy/mistral/v1/chat/completions",
    historical: "No public API",
    live: "Response usage",
    streaming: "Yes",
    model: "mistral-small-latest",
    modelEnvVar: "MISTRAL_MODEL",
    envVar: "MISTRAL_API_KEY",
    nodeFunction: "callMistralChat",
    pythonFunction: "call_mistral_chat",
    defaultProject: "ops-assistant",
    defaultAgent: "mistral-worker",
  },
  {
    slug: "deepseek",
    name: "DeepSeek",
    endpoint: "/api/proxy/deepseek/chat/completions",
    historical: "No public usage API",
    live: "Response usage",
    streaming: "Yes",
    model: "deepseek-v4-flash",
    modelEnvVar: "DEEPSEEK_MODEL",
    envVar: "DEEPSEEK_API_KEY",
    nodeFunction: "callDeepSeekChat",
    pythonFunction: "call_deepseek_chat",
    defaultProject: "coding-agent",
    defaultAgent: "deepseek-worker",
  },
  {
    slug: "github",
    name: "GitHub",
    endpoint: "/api/proxy/github/chat/completions",
    historical: "No public API",
    live: "Response usage",
    streaming: "Yes",
    model: "openai/gpt-4o-mini",
    modelEnvVar: "GITHUB_MODEL",
    envVar: "GITHUB_MODELS_API_KEY",
    nodeFunction: "callGitHubModelsChat",
    pythonFunction: "call_github_models_chat",
    defaultProject: "internal-tooling",
    defaultAgent: "gh-models-worker",
  },
];

export const INTEGRATION_ROLLOUTS: RolloutConfig[] = [
  {
    slug: "observe",
    label: "Observe only",
    runtimeMode: "shadow",
    fallbackAllowed: true,
    requiresProviderKeyInApp: true,
    requiresIngestSecret: true,
    promise: "Your app still talks straight to the provider. Tokenometer receives a signed usage event afterward.",
    caution: "Safest first step, but only works if the app can report usage back after each call.",
    bestFor: "First production validation without putting continuity at risk.",
  },
  {
    slug: "fallback",
    label: "Observe + fallback",
    runtimeMode: "proxy",
    fallbackAllowed: true,
    requiresProviderKeyInApp: true,
    requiresIngestSecret: false,
    promise: "Your app prefers Tokenometer, but can fall back to the provider directly if the gateway is unavailable.",
    caution: "Great continuity story, but a few calls may bypass proxy metering during fallback windows.",
    bestFor: "Real rollout when continuity matters more than strict enforcement.",
  },
  {
    slug: "enforce",
    label: "Enforce through Tokenometer",
    runtimeMode: "proxy",
    fallbackAllowed: false,
    requiresProviderKeyInApp: false,
    requiresIngestSecret: false,
    promise: "Every measured call must pass through Tokenometer. This is the cleanest long-term operating model.",
    caution: "Use this after you trust the gateway path, because there is no direct provider escape hatch.",
    bestFor: "Steady-state production once the integration loop is already proven.",
  },
];

export function getProviderConfig(slug?: string) {
  return INTEGRATION_PROVIDERS.find((provider) => provider.slug === slug) ?? INTEGRATION_PROVIDERS[0];
}

export function getRolloutConfig(slug?: string) {
  return INTEGRATION_ROLLOUTS.find((rollout) => rollout.slug === slug) ?? INTEGRATION_ROLLOUTS[1];
}

export function buildGatewayHref(provider: ProviderSlug, mode: RolloutSlug, integrationId?: string) {
  const params = new URLSearchParams({ provider, mode });
  if (integrationId) params.set("integration", integrationId);
  return `/gateway?${params.toString()}`;
}

export function getNextAction({
  ingestReady,
  providerKeyReady,
  shadowReady,
  latestEventReady,
  rollout,
}: {
  ingestReady: boolean;
  providerKeyReady: boolean;
  shadowReady: boolean;
  latestEventReady: boolean;
  rollout: RolloutConfig;
}) {
  if (!providerKeyReady) return "Vault the provider key first in Settings -> Credentials.";
  if (!ingestReady) return "Create an ingest source so the app has an x-ingest-key to send.";
  if (rollout.requiresIngestSecret && !shadowReady) return "Rotate or recreate the ingest source so shadow mode has a signing secret.";
  if (!latestEventReady) return "Run the guided provider test, then confirm the event on Gateway and Ledger.";
  if (rollout.slug === "observe") return "Wire one low-risk app in shadow mode and verify the post-call ingest event lands every time.";
  if (rollout.slug === "fallback") return "Switch one app to proxy mode with direct fallback enabled, then watch Gateway for fresh request IDs.";
  return "Move one trusted app to strict proxy mode and keep Gateway open while the first real production traffic flows.";
}

export function recommendMode(isSelected: boolean, hasLiveEvent: boolean) {
  if (isSelected) return "Selected here";
  if (!hasLiveEvent) return "Observe only first";
  return "Observe + fallback";
}

export function envBlock(
  appUrl: string,
  provider: ProviderConfig,
  rollout: RolloutConfig,
  ingestName: string,
  integration?: IntegrationEnvOptions,
) {
  const lines = [
    `TOKENOMETER_BASE_URL=${appUrl}`,
    `AI_METERING_MODE=${rollout.runtimeMode}`,
    `TOKENOMETER_INGEST_KEY=tmtr_ingest_key_from_${slugify(ingestName)}`,
    `TOKENOMETER_PROJECT=${integration?.project ?? provider.defaultProject}`,
    `TOKENOMETER_AGENT=${integration?.agent ?? provider.defaultAgent}`,
  ];

  if (integration?.integrationId) {
    lines.push(`TOKENOMETER_INTEGRATION_ID=${integration.integrationId}`);
  }

  if (rollout.requiresProviderKeyInApp) {
    lines.push(`${provider.envVar}=your_provider_key_here`);
  }

  if (rollout.requiresIngestSecret) {
    lines.push(`TOKENOMETER_INGEST_SECRET=your_ingest_secret_here`);
  }

  lines.push(`${provider.modelEnvVar}=${provider.model}`);

  if (rollout.slug !== "enforce") {
    lines.push(`TOKENOMETER_ALLOW_DIRECT_FALLBACK=${rollout.fallbackAllowed ? "true" : "false"}`);
  }

  return lines.join("\n");
}

export function nodeSnippet(provider: ProviderConfig, rollout: RolloutConfig, integration?: IntegrationEnvOptions) {
  const modelExpression = `process.env.${provider.modelEnvVar} || "${provider.model}"`;
  const body = providerNodeBody(provider, modelExpression);
  const providerKeyArg = rollout.requiresProviderKeyInApp
    ? `,
  process.env.${provider.envVar}`
    : "";

  const invocation =
    provider.slug === "google"
      ? `const result = await ${provider.nodeFunction}(config, ${modelExpression}, ${body}${providerKeyArg});`
      : `const result = await ${provider.nodeFunction}(config, ${body}${providerKeyArg});`;

  return `import {
  ${provider.nodeFunction},
  type AdapterConfig,
} from "./tokenometer-adapter";

const config: AdapterConfig = {
  mode: "${rollout.runtimeMode}",
  tokenometerBaseUrl: process.env.TOKENOMETER_BASE_URL || "https://www.tokenometer.cloud",
  ingestKey: process.env.TOKENOMETER_INGEST_KEY,
  ingestSecret: process.env.TOKENOMETER_INGEST_SECRET,
  project: process.env.TOKENOMETER_PROJECT || "${integration?.project ?? provider.defaultProject}",
  agent: process.env.TOKENOMETER_AGENT || "${integration?.agent ?? provider.defaultAgent}",
  integrationId: process.env.TOKENOMETER_INTEGRATION_ID${integration?.integrationId ? ` || "${integration.integrationId}"` : ""},
  allowDirectFallback: ${rollout.fallbackAllowed ? "true" : "false"},
};

${invocation}
console.log(result.requestId, result.modeUsed, result.meteredVia);`;
}

export function pythonSnippet(provider: ProviderConfig, rollout: RolloutConfig, integration?: IntegrationEnvOptions) {
  const modelExpression = `os.environ.get("${provider.modelEnvVar}", "${provider.model}")`;
  const body = providerPythonBody(provider, modelExpression);
  const providerKeyArg = rollout.requiresProviderKeyInApp
    ? `,
    provider_api_key=os.environ.get("${provider.envVar}")`
    : "";

  const invocation =
    provider.slug === "google"
      ? `result = ${provider.pythonFunction}(
    config=config,
    model=${modelExpression},
    body=${body}${providerKeyArg},
)`
      : `result = ${provider.pythonFunction}(
    config=config,
    body=${body}${providerKeyArg},
)`;

  return `import json
import os

from tokenometer_adapter import AdapterConfig, ${provider.pythonFunction}

config = AdapterConfig(
    mode="${rollout.runtimeMode}",
    tokenometer_base_url=os.environ.get("TOKENOMETER_BASE_URL", "https://www.tokenometer.cloud"),
    ingest_key=os.environ.get("TOKENOMETER_INGEST_KEY"),
    ingest_secret=os.environ.get("TOKENOMETER_INGEST_SECRET"),
    project=os.environ.get("TOKENOMETER_PROJECT", "${integration?.project ?? provider.defaultProject}"),
    agent=os.environ.get("TOKENOMETER_AGENT", "${integration?.agent ?? provider.defaultAgent}"),
    integration_id=os.environ.get("TOKENOMETER_INTEGRATION_ID"${integration?.integrationId ? `, "${integration.integrationId}"` : ""}),
    allow_direct_fallback=${rollout.fallbackAllowed ? "True" : "False"},
) 

${invocation}
print(json.dumps({
    "request_id": result["request_id"],
    "mode_used": result["mode_used"],
    "metered_via": result["metered_via"],
}, indent=2))`;
}

export function buildRolloutChecklist(provider: ProviderConfig, rollout: RolloutConfig) {
  return [
    {
      title: "Vault the provider key",
      body: `Store one ${provider.name} key in Settings -> Credentials so Tokenometer can test and route it.`,
    },
    {
      title: "Keep one active ingest source",
      body: rollout.requiresIngestSecret
        ? "Shadow mode needs both the ingest key and the ingest signing secret."
        : "Proxy mode needs the ingest key so the app can authenticate to Tokenometer.",
    },
    {
      title: "Run the guided provider test",
      body: `Use the ${provider.name} test card first so you get a known-good request ID to verify in Gateway and Ledger.`,
    },
    {
      title: "Wire one low-risk app",
      body:
        rollout.slug === "observe"
          ? "Keep the live request path untouched and emit the post-call usage event."
          : rollout.slug === "fallback"
            ? "Switch the app to the Tokenometer proxy and keep direct fallback enabled for continuity."
            : "Switch the app to the Tokenometer proxy and disable direct fallback once the test loop is boringly reliable.",
    },
    {
      title: "Watch fresh spend land",
      body: "Confirm the request ID, then check Ledger and Reports for a current timestamp and the expected provider/model attribution.",
    },
  ];
}

function providerNodeBody(provider: ProviderConfig, modelExpression: string) {
  if (provider.slug === "anthropic") {
    return `{
  model: ${modelExpression},
  max_tokens: 120,
  messages: [{ role: "user", content: "Summarize our onboarding status in one sentence." }],
}`;
  }

  if (provider.slug === "google") {
    return `{
  contents: [
    {
      role: "user",
      parts: [{ text: "Summarize our onboarding status in one sentence." }],
    },
  ],
}`;
  }

  return `{
  model: ${modelExpression},
  messages: [{ role: "user", content: "Summarize our onboarding status in one sentence." }],
}`;
}

function providerPythonBody(provider: ProviderConfig, modelExpression: string) {
  if (provider.slug === "anthropic") {
    return `{
        "model": ${modelExpression},
        "max_tokens": 120,
        "messages": [{"role": "user", "content": "Summarize our onboarding status in one sentence."}],
    }`;
  }

  if (provider.slug === "google") {
    return `{
        "contents": [
            {
                "role": "user",
                "parts": [{"text": "Summarize our onboarding status in one sentence."}],
            }
        ]
    }`;
  }

  return `{
        "model": ${modelExpression},
        "messages": [{"role": "user", "content": "Summarize our onboarding status in one sentence."}],
    }`;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
