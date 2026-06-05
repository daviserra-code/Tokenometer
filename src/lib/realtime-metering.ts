import { formatNumber } from "@/lib/format";

export type RealtimeSignal = {
  label: string;
  value: string;
};

export type RealtimeProviderSummary = {
  provider: string;
  calls: number;
  streamedCalls: number;
  signals: RealtimeSignal[];
};

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asBoolean(value: unknown) {
  return value === true;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function getRealtimeSignals(
  providerName: string,
  metadata: Record<string, unknown> | null | undefined
): RealtimeSignal[] {
  if (!metadata) return [];

  if (providerName === "Google") {
    const signals: RealtimeSignal[] = [];
    if (asString(metadata.action) === "streamGenerateContent") {
      signals.push({ label: "Stream", value: "Yes" });
    }
    const thoughts = asNumber(metadata.thoughtsTokenCount);
    if (thoughts > 0) {
      signals.push({ label: "Thoughts", value: formatNumber(thoughts) });
    }
    const cached = asNumber(metadata.cachedContentTokenCount);
    if (cached > 0) {
      signals.push({ label: "Cached", value: formatNumber(cached) });
    }
    const toolUse = asNumber(metadata.toolUsePromptTokenCount);
    if (toolUse > 0) {
      signals.push({ label: "Tool-use", value: formatNumber(toolUse) });
    }
    return signals;
  }

  if (providerName === "Anthropic") {
    const signals: RealtimeSignal[] = [];
    if (asBoolean(metadata.streamed)) {
      signals.push({ label: "Stream", value: "Yes" });
    }
    const cacheRead = asNumber(metadata.cacheReadInputTokens);
    if (cacheRead > 0) {
      signals.push({ label: "Cache read", value: formatNumber(cacheRead) });
    }
    const cacheWrite = asNumber(metadata.cacheCreationInputTokens);
    if (cacheWrite > 0) {
      signals.push({ label: "Cache write", value: formatNumber(cacheWrite) });
    }
    const cacheWrite5m = asNumber(metadata.cacheCreation5mInputTokens);
    if (cacheWrite5m > 0) {
      signals.push({ label: "5m write", value: formatNumber(cacheWrite5m) });
    }
    const cacheWrite1h = asNumber(metadata.cacheCreation1hInputTokens);
    if (cacheWrite1h > 0) {
      signals.push({ label: "1h write", value: formatNumber(cacheWrite1h) });
    }
    const stopReason = asString(metadata.stopReason);
    if (stopReason) {
      signals.push({ label: "Stop", value: stopReason });
    }
    return signals;
  }

  if (providerName === "MiniMax" && asBoolean(metadata.streamed)) {
    return [{ label: "Stream", value: "Yes" }];
  }

  return [];
}

export function summarizeRealtimeProviders(
  events: Array<{
    provider: { name: string };
    metadataJson: unknown;
  }>
): RealtimeProviderSummary[] {
  const providerSummaries = new Map<string, RealtimeProviderSummary>();

  for (const event of events) {
    const provider = event.provider.name;
    if (provider !== "Google" && provider !== "Anthropic") continue;
    const metadata =
      event.metadataJson && typeof event.metadataJson === "object"
        ? (event.metadataJson as Record<string, unknown>)
        : null;

    let current = providerSummaries.get(provider);
    if (!current) {
      current = {
        provider,
        calls: 0,
        streamedCalls: 0,
        signals: [],
      };
      providerSummaries.set(provider, current);
    }

    current.calls += 1;
    if (asBoolean(metadata?.streamed) || asString(metadata?.action) === "streamGenerateContent") {
      current.streamedCalls += 1;
    }

    if (provider === "Google") {
      incrementSignal(current.signals, "Thoughts tokens", asNumber(metadata?.thoughtsTokenCount));
      incrementSignal(current.signals, "Cached tokens", asNumber(metadata?.cachedContentTokenCount));
      incrementSignal(current.signals, "Tool-use prompt", asNumber(metadata?.toolUsePromptTokenCount));
    }

    if (provider === "Anthropic") {
      incrementSignal(current.signals, "Cache read", asNumber(metadata?.cacheReadInputTokens));
      incrementSignal(current.signals, "Cache write", asNumber(metadata?.cacheCreationInputTokens));
    }
  }

  return Array.from(providerSummaries.values()).map((summary) => ({
    ...summary,
    signals: summary.signals
      .filter((signal) => Number(signal.value) > 0)
      .map((signal) => ({ ...signal, value: formatNumber(Number(signal.value)) })),
  }));
}

function incrementSignal(signals: RealtimeSignal[], label: string, amount: number) {
  if (amount <= 0) return;
  const existing = signals.find((signal) => signal.label === label);
  if (existing) {
    existing.value = String(Number(existing.value) + amount);
    return;
  }
  signals.push({ label, value: String(amount) });
}
