import crypto from "node:crypto";

export type MeteringMode = "direct" | "shadow" | "proxy";
export type MeteringPath = "proxy" | "ingest" | "none";

export type AdapterConfig = {
  mode: MeteringMode;
  tokenometerBaseUrl: string;
  ingestKey?: string;
  ingestSecret?: string;
  project?: string;
  team?: string;
  agent?: string;
  owner?: string;
  source?: string;
  credentialId?: string;
  allowDirectFallback?: boolean;
  timeoutMs?: number;
};

export type ProviderKeyConfig = AdapterConfig & {
  providerApiKey?: string;
};

export type OpenAiConfig = ProviderKeyConfig;
export type AnthropicConfig = ProviderKeyConfig;
export type GeminiConfig = ProviderKeyConfig;
export type MistralConfig = ProviderKeyConfig;
export type DeepSeekConfig = ProviderKeyConfig;
export type GitHubModelsConfig = ProviderKeyConfig;

export type MeteredResult<T> = {
  data: T;
  requestId: string;
  modeUsed: MeteringMode | "proxy-fallback-direct";
  meteredVia: MeteringPath;
};

type OpenAiChatBody = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  [key: string]: unknown;
};

type AnthropicMessagesBody = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens: number;
  [key: string]: unknown;
};

type GeminiGenerateContentBody = {
  contents: Array<{
    role?: string;
    parts: Array<{ text: string }>;
  }>;
  [key: string]: unknown;
};

export async function callOpenAiChat<T = unknown>(
  config: OpenAiConfig,
  body: OpenAiChatBody
): Promise<MeteredResult<T>> {
  const requestId = crypto.randomUUID();

  if (config.mode === "proxy") {
    try {
      const data = await postJson<T>({
        url: `${trimSlash(config.tokenometerBaseUrl)}/api/proxy/openai/chat/completions`,
        headers: proxyHeaders(config, requestId),
        body,
        timeoutMs: config.timeoutMs,
      });
      return { data, requestId, modeUsed: "proxy", meteredVia: "proxy" };
    } catch (error) {
      if (!config.allowDirectFallback || !config.providerApiKey) {
        throw error;
      }
      const direct = await callOpenAiCompatibleDirect<T>({
        config,
        body,
        requestId,
        providerName: "OpenAI",
        directUrl: "https://api.openai.com/v1/chat/completions",
        directHeaders: {
          "content-type": "application/json",
          authorization: `Bearer ${config.providerApiKey}`,
        },
        sourceName: "shadow-openai",
        fallbackReason: "proxy_unavailable",
      });
      return { ...direct, modeUsed: "proxy-fallback-direct" };
    }
  }

  return callOpenAiCompatibleDirect<T>({
    config,
    body,
    requestId,
    providerName: "OpenAI",
    directUrl: "https://api.openai.com/v1/chat/completions",
    directHeaders: {
      "content-type": "application/json",
      authorization: `Bearer ${config.providerApiKey}`,
    },
    sourceName: "shadow-openai",
  });
}

export async function callAnthropicMessages<T = unknown>(
  config: AnthropicConfig,
  body: AnthropicMessagesBody
): Promise<MeteredResult<T>> {
  const requestId = crypto.randomUUID();

  if (config.mode === "proxy") {
    try {
      const data = await postJson<T>({
        url: `${trimSlash(config.tokenometerBaseUrl)}/api/proxy/anthropic/v1/messages`,
        headers: proxyHeaders(config, requestId),
        body,
        timeoutMs: config.timeoutMs,
      });
      return { data, requestId, modeUsed: "proxy", meteredVia: "proxy" };
    } catch (error) {
      if (!config.allowDirectFallback || !config.providerApiKey) {
        throw error;
      }
      const direct = await callAnthropicDirect<T>(config, body, requestId, "proxy_unavailable");
      return { ...direct, modeUsed: "proxy-fallback-direct" };
    }
  }

  return callAnthropicDirect<T>(config, body, requestId);
}

export async function callGeminiGenerateContent<T = unknown>(
  config: GeminiConfig,
  model: string,
  body: GeminiGenerateContentBody
): Promise<MeteredResult<T>> {
  const requestId = crypto.randomUUID();
  const action = "generateContent";

  if (config.mode === "proxy") {
    try {
      const data = await postJson<T>({
        url: `${trimSlash(config.tokenometerBaseUrl)}/api/proxy/google/v1beta/models/${encodeURIComponent(model)}:${action}`,
        headers: proxyHeaders(config, requestId),
        body,
        timeoutMs: config.timeoutMs,
      });
      return { data, requestId, modeUsed: "proxy", meteredVia: "proxy" };
    } catch (error) {
      if (!config.allowDirectFallback || !config.providerApiKey) {
        throw error;
      }
      const direct = await callGeminiDirect<T>(config, model, body, requestId, "proxy_unavailable");
      return { ...direct, modeUsed: "proxy-fallback-direct" };
    }
  }

  return callGeminiDirect<T>(config, model, body, requestId);
}

export async function callMistralChat<T = unknown>(
  config: MistralConfig,
  body: OpenAiChatBody
): Promise<MeteredResult<T>> {
  const requestId = crypto.randomUUID();

  if (config.mode === "proxy") {
    try {
      const data = await postJson<T>({
        url: `${trimSlash(config.tokenometerBaseUrl)}/api/proxy/mistral/v1/chat/completions`,
        headers: proxyHeaders(config, requestId),
        body,
        timeoutMs: config.timeoutMs,
      });
      return { data, requestId, modeUsed: "proxy", meteredVia: "proxy" };
    } catch (error) {
      if (!config.allowDirectFallback || !config.providerApiKey) {
        throw error;
      }
      const direct = await callOpenAiCompatibleDirect<T>({
        config,
        body,
        requestId,
        providerName: "Mistral",
        directUrl: "https://api.mistral.ai/v1/chat/completions",
        directHeaders: {
          "content-type": "application/json",
          authorization: `Bearer ${config.providerApiKey}`,
        },
        sourceName: "shadow-mistral",
        fallbackReason: "proxy_unavailable",
      });
      return { ...direct, modeUsed: "proxy-fallback-direct" };
    }
  }

  return callOpenAiCompatibleDirect<T>({
    config,
    body,
    requestId,
    providerName: "Mistral",
    directUrl: "https://api.mistral.ai/v1/chat/completions",
    directHeaders: {
      "content-type": "application/json",
      authorization: `Bearer ${config.providerApiKey}`,
    },
    sourceName: "shadow-mistral",
  });
}

export async function callDeepSeekChat<T = unknown>(
  config: DeepSeekConfig,
  body: OpenAiChatBody
): Promise<MeteredResult<T>> {
  const requestId = crypto.randomUUID();

  if (config.mode === "proxy") {
    try {
      const data = await postJson<T>({
        url: `${trimSlash(config.tokenometerBaseUrl)}/api/proxy/deepseek/chat/completions`,
        headers: proxyHeaders(config, requestId),
        body,
        timeoutMs: config.timeoutMs,
      });
      return { data, requestId, modeUsed: "proxy", meteredVia: "proxy" };
    } catch (error) {
      if (!config.allowDirectFallback || !config.providerApiKey) {
        throw error;
      }
      const direct = await callOpenAiCompatibleDirect<T>({
        config,
        body,
        requestId,
        providerName: "DeepSeek",
        directUrl: "https://api.deepseek.com/chat/completions",
        directHeaders: {
          "content-type": "application/json",
          authorization: `Bearer ${config.providerApiKey}`,
        },
        sourceName: "shadow-deepseek",
        fallbackReason: "proxy_unavailable",
      });
      return { ...direct, modeUsed: "proxy-fallback-direct" };
    }
  }

  return callOpenAiCompatibleDirect<T>({
    config,
    body,
    requestId,
    providerName: "DeepSeek",
    directUrl: "https://api.deepseek.com/chat/completions",
    directHeaders: {
      "content-type": "application/json",
      authorization: `Bearer ${config.providerApiKey}`,
    },
    sourceName: "shadow-deepseek",
  });
}

export async function callGitHubModelsChat<T = unknown>(
  config: GitHubModelsConfig,
  body: OpenAiChatBody
): Promise<MeteredResult<T>> {
  const requestId = crypto.randomUUID();

  if (config.mode === "proxy") {
    try {
      const data = await postJson<T>({
        url: `${trimSlash(config.tokenometerBaseUrl)}/api/proxy/github/chat/completions`,
        headers: proxyHeaders(config, requestId),
        body,
        timeoutMs: config.timeoutMs,
      });
      return { data, requestId, modeUsed: "proxy", meteredVia: "proxy" };
    } catch (error) {
      if (!config.allowDirectFallback || !config.providerApiKey) {
        throw error;
      }
      const direct = await callOpenAiCompatibleDirect<T>({
        config,
        body,
        requestId,
        providerName: "GitHub",
        directUrl: "https://models.github.ai/inference/chat/completions",
        directHeaders: {
          "content-type": "application/json",
          authorization: `Bearer ${config.providerApiKey}`,
        },
        sourceName: "shadow-github",
        fallbackReason: "proxy_unavailable",
      });
      return { ...direct, modeUsed: "proxy-fallback-direct" };
    }
  }

  return callOpenAiCompatibleDirect<T>({
    config,
    body,
    requestId,
    providerName: "GitHub",
    directUrl: "https://models.github.ai/inference/chat/completions",
    directHeaders: {
      "content-type": "application/json",
      authorization: `Bearer ${config.providerApiKey}`,
    },
    sourceName: "shadow-github",
  });
}

async function callOpenAiCompatibleDirect<T>({
  config,
  body,
  requestId,
  providerName,
  directUrl,
  directHeaders,
  sourceName,
  fallbackReason,
}: {
  config: ProviderKeyConfig;
  body: OpenAiChatBody;
  requestId: string;
  providerName: "OpenAI" | "Mistral" | "DeepSeek" | "GitHub";
  directUrl: string;
  directHeaders: Record<string, string>;
  sourceName: string;
  fallbackReason?: string;
}): Promise<MeteredResult<T>> {
  assertProviderKey(config.providerApiKey, providerName);

  const data = await postJson<T>({
    url: directUrl,
    headers: directHeaders,
    body,
    timeoutMs: config.timeoutMs,
  });

  if (config.mode === "shadow" || fallbackReason) {
    await bestEffortShadowIngest(
      config,
      buildOpenAiCompatibleEvent(providerName, body.model, data, config, requestId, sourceName, fallbackReason)
    );
  }

  return {
    data,
    requestId,
    modeUsed: config.mode,
    meteredVia: config.mode === "shadow" || fallbackReason ? "ingest" : "none",
  };
}

async function callAnthropicDirect<T>(
  config: AnthropicConfig,
  body: AnthropicMessagesBody,
  requestId: string,
  fallbackReason?: string
): Promise<MeteredResult<T>> {
  assertProviderKey(config.providerApiKey, "Anthropic");

  const data = await postJson<T>({
    url: "https://api.anthropic.com/v1/messages",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.providerApiKey!,
      "anthropic-version": "2023-06-01",
    },
    body,
    timeoutMs: config.timeoutMs,
  });

  if (config.mode === "shadow" || fallbackReason) {
    await bestEffortShadowIngest(config, buildAnthropicEvent(body.model, data, config, requestId, fallbackReason));
  }

  return {
    data,
    requestId,
    modeUsed: config.mode,
    meteredVia: config.mode === "shadow" || fallbackReason ? "ingest" : "none",
  };
}

async function callGeminiDirect<T>(
  config: GeminiConfig,
  model: string,
  body: GeminiGenerateContentBody,
  requestId: string,
  fallbackReason?: string
): Promise<MeteredResult<T>> {
  assertProviderKey(config.providerApiKey, "Gemini");

  const data = await postJson<T>({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
      config.providerApiKey!
    )}`,
    headers: {
      "content-type": "application/json",
    },
    body,
    timeoutMs: config.timeoutMs,
  });

  if (config.mode === "shadow" || fallbackReason) {
    await bestEffortShadowIngest(config, buildGeminiEvent(model, data, config, requestId, fallbackReason));
  }

  return {
    data,
    requestId,
    modeUsed: config.mode,
    meteredVia: config.mode === "shadow" || fallbackReason ? "ingest" : "none",
  };
}

async function bestEffortShadowIngest(config: AdapterConfig, event: Record<string, unknown>) {
  if (!config.ingestKey || !config.ingestSecret) {
    console.warn("Tokenometer shadow ingest skipped: ingest key/secret missing.");
    return;
  }

  const rawBody = JSON.stringify({ events: [event] });
  const signature = `sha256=${crypto
    .createHmac("sha256", config.ingestSecret)
    .update(rawBody)
    .digest("hex")}`;

  try {
    await fetch(`${trimSlash(config.tokenometerBaseUrl)}/api/ingest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ingest-key": config.ingestKey,
        "x-ingest-signature": signature,
      },
      body: rawBody,
    });
  } catch (error) {
    console.warn("Tokenometer shadow ingest failed:", error);
  }
}

function proxyHeaders(config: AdapterConfig, requestId: string) {
  if (!config.ingestKey) {
    throw new Error("TOKENOMETER_INGEST_KEY is required for proxy mode.");
  }

  return {
    "content-type": "application/json",
    "x-ingest-key": config.ingestKey,
    "x-request-id": requestId,
    ...(config.project ? { "x-project": config.project } : {}),
    ...(config.agent ? { "x-agent": config.agent } : {}),
    ...(config.credentialId ? { "x-credential-id": config.credentialId } : {}),
  };
}

function buildOpenAiCompatibleEvent(
  providerName: "OpenAI" | "Mistral" | "DeepSeek" | "GitHub",
  model: string,
  response: unknown,
  config: AdapterConfig,
  requestId: string,
  sourceName: string,
  fallbackReason?: string
) {
  const json = asRecord(response);
  const usage = asRecord(json.usage);
  const inputTokens = toNumber(usage.prompt_tokens);
  const outputTokens = toNumber(usage.completion_tokens);
  const totalTokens = toNumber(usage.total_tokens) || inputTokens + outputTokens;

  return {
    timestamp: new Date().toISOString(),
    provider: providerName,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    project: config.project,
    team: config.team,
    agent: config.agent,
    owner: config.owner,
    source: config.source ?? sourceName,
    metadata: {
      requestId,
      upstreamId: typeof json.id === "string" ? json.id : null,
      fallbackReason: fallbackReason ?? null,
    },
  };
}

function buildAnthropicEvent(
  model: string,
  response: unknown,
  config: AdapterConfig,
  requestId: string,
  fallbackReason?: string
) {
  const json = asRecord(response);
  const usage = asRecord(json.usage);
  const inputTokens = toNumber(usage.input_tokens);
  const outputTokens = toNumber(usage.output_tokens);
  const totalTokens = inputTokens + outputTokens;

  return {
    timestamp: new Date().toISOString(),
    provider: "Anthropic",
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    project: config.project,
    team: config.team,
    agent: config.agent,
    owner: config.owner,
    source: config.source ?? "shadow-anthropic",
    metadata: {
      requestId,
      upstreamId: typeof json.id === "string" ? json.id : null,
      stopReason: typeof json.stop_reason === "string" ? json.stop_reason : null,
      fallbackReason: fallbackReason ?? null,
    },
  };
}

function buildGeminiEvent(
  model: string,
  response: unknown,
  config: AdapterConfig,
  requestId: string,
  fallbackReason?: string
) {
  const json = asRecord(response);
  const usage = asRecord(json.usageMetadata);
  const inputTokens = toNumber(usage.promptTokenCount);
  const outputTokens = toNumber(usage.candidatesTokenCount);
  const totalTokens = toNumber(usage.totalTokenCount) || inputTokens + outputTokens;

  return {
    timestamp: new Date().toISOString(),
    provider: "Google",
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    project: config.project,
    team: config.team,
    agent: config.agent,
    owner: config.owner,
    source: config.source ?? "shadow-gemini",
    metadata: {
      requestId,
      fallbackReason: fallbackReason ?? null,
    },
  };
}

async function postJson<T>({
  url,
  headers,
  body,
  timeoutMs,
}: {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timer = timeoutMs && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    return JSON.parse(text) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function assertProviderKey(value: string | undefined, providerName: string) {
  if (!value) {
    throw new Error(`${providerName} direct/shadow mode requires the provider API key in the app environment.`);
  }
}
