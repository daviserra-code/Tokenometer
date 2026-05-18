import { NextRequest, NextResponse } from "next/server";
import { meterUsage, type ProxyContext } from "@/lib/byok";

type MeterUsageArgs = Parameters<typeof meterUsage>[0];

export type ProxyRequestState = {
  requestId: string;
  provider: string;
  route: string;
  startedAt: number;
  stream: boolean;
  project: string | null;
  agent: string | null;
};

type SseStreamOptions = {
  upstreamRes: Response;
  state: ProxyRequestState;
  onJson?: (payload: unknown) => void;
  onComplete?: () => void;
};

export function createProxyState(
  req: NextRequest,
  provider: string,
  route: string,
  stream = false
): ProxyRequestState {
  const requestId = req.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  return {
    requestId,
    provider,
    route,
    startedAt: performance.now(),
    stream,
    project: req.headers.get("x-project"),
    agent: req.headers.get("x-agent"),
  };
}

export function attachProxyHeaders(
  response: NextResponse,
  state: ProxyRequestState,
  durationMs?: number
) {
  response.headers.set("x-request-id", state.requestId);
  response.headers.set("x-tokenometer-provider", state.provider);
  const exposed = response.headers.get("access-control-expose-headers");
  const exposeHeaders = new Set(
    (exposed ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  exposeHeaders.add("x-request-id");
  exposeHeaders.add("x-tokenometer-provider");
  exposeHeaders.add("server-timing");
  response.headers.set(
    "access-control-expose-headers",
    Array.from(exposeHeaders).join(", ")
  );
  if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
    response.headers.set("server-timing", `proxy;dur=${durationMs}`);
  }
  return response;
}

export function jsonProxyError(
  state: ProxyRequestState,
  status: number,
  error: string,
  extra?: Record<string, unknown>
) {
  const durationMs = elapsedMs(state);
  logProxyResult(state, status, { durationMs, error, ...extra });
  return attachProxyHeaders(
    NextResponse.json({ error, requestId: state.requestId }, { status }),
    state,
    durationMs
  );
}

export function createTextProxyResponse(
  upstreamRes: Response,
  body: string,
  state: ProxyRequestState,
  extra?: Record<string, unknown>
) {
  const durationMs = elapsedMs(state);
  logProxyResult(state, upstreamRes.status, { durationMs, ...extra });
  return attachProxyHeaders(
    new NextResponse(body, {
      status: upstreamRes.status,
      headers: cloneProxyHeaders(upstreamRes.headers),
    }),
    state,
    durationMs
  );
}

export function createSseProxyResponse(options: SseStreamOptions) {
  const { upstreamRes, state, onJson, onComplete } = options;
  if (!upstreamRes.body) {
    return attachProxyHeaders(
      new NextResponse(null, {
        status: upstreamRes.status,
        headers: cloneProxyHeaders(upstreamRes.headers),
      }),
      state,
      elapsedMs(state)
    );
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const stream = upstreamRes.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        buffer += decoder.decode(chunk, { stream: true });
        buffer = processSseFrames(buffer, (payload) => {
          onJson?.(payload);
        });
      },
      flush() {
        buffer += decoder.decode();
        buffer = processSseFrames(
          buffer,
          (payload) => {
            onJson?.(payload);
          },
          true
        );
        onComplete?.();
        logProxyResult(state, upstreamRes.status, {
          durationMs: elapsedMs(state),
          streamed: true,
        });
      },
    })
  );

  return attachProxyHeaders(
    new NextResponse(stream, {
      status: upstreamRes.status,
      headers: cloneProxyHeaders(upstreamRes.headers),
    }),
    state
  );
}

export function queueMetering(args: MeterUsageArgs) {
  const schedule =
    typeof setImmediate === "function"
      ? setImmediate
      : (callback: () => void) => setTimeout(callback, 0);
  schedule(() => {
    void meterUsage(args);
  });
}

export function elapsedMs(state: ProxyRequestState) {
  return Math.round(performance.now() - state.startedAt);
}

export function logProxyResult(
  state: ProxyRequestState,
  status: number,
  extra?: Record<string, unknown>
) {
  const payload = {
    event: "tokenometer.proxy",
    provider: state.provider,
    route: state.route,
    requestId: state.requestId,
    status,
    stream: state.stream,
    project: state.project,
    agent: state.agent,
    ...extra,
  };
  console.info(JSON.stringify(payload));
}

export function enrichMeteringMetadata(
  state: ProxyRequestState,
  extra?: Record<string, unknown>
) {
  return {
    requestId: state.requestId,
    latencyMs: elapsedMs(state),
    streamed: state.stream,
    ...(extra ?? {}),
  };
}

function cloneProxyHeaders(source: Headers) {
  const headers = new Headers(source);
  headers.delete("content-length");
  return headers;
}

function processSseFrames(input: string, onPayload: (payload: unknown) => void, flush = false) {
  let working = input;
  while (true) {
    const boundary = working.search(/\r?\n\r?\n/);
    if (boundary === -1) {
      break;
    }

    const match = working.match(/\r?\n\r?\n/);
    if (!match) {
      break;
    }
    const frame = working.slice(0, boundary);
    working = working.slice(boundary + match[0].length);
    parseSseFrame(frame, onPayload);
  }

  if (flush && working.trim()) {
    parseSseFrame(working, onPayload);
    return "";
  }

  return working;
}

function parseSseFrame(frame: string, onPayload: (payload: unknown) => void) {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();

  if (!data || data === "[DONE]") {
    return;
  }

  try {
    onPayload(JSON.parse(data));
  } catch (error) {
    console.warn("Failed to parse SSE payload:", error);
  }
}

export function extractOpenAiCompatibleUsage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const json = payload as Record<string, unknown>;
  const usage = json.usage;
  if (!usage || typeof usage !== "object") {
    return null;
  }
  const usageJson = usage as Record<string, unknown>;
  const inputTokens = asNumber(usageJson.prompt_tokens);
  const outputTokens = asNumber(usageJson.completion_tokens);
  const totalTokens = asNumber(usageJson.total_tokens) || inputTokens + outputTokens;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    completionId: typeof json.id === "string" ? json.id : undefined,
  };
}

export function extractAnthropicUsage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const json = payload as Record<string, unknown>;
  const type = typeof json.type === "string" ? json.type : "";

  if (type === "message_start") {
    const message =
      json.message && typeof json.message === "object"
        ? (json.message as Record<string, unknown>)
        : null;
    const usage =
      message?.usage && typeof message.usage === "object"
        ? (message.usage as Record<string, unknown>)
        : null;
    return {
      kind: type,
      messageId: typeof message?.id === "string" ? message.id : undefined,
      inputTokens: asNumber(usage?.input_tokens),
      outputTokens: 0,
      stopReason: undefined as string | undefined,
    };
  }

  if (type === "message_delta") {
    const usage =
      json.usage && typeof json.usage === "object"
        ? (json.usage as Record<string, unknown>)
        : null;
    const delta =
      json.delta && typeof json.delta === "object"
        ? (json.delta as Record<string, unknown>)
        : null;
    return {
      kind: type,
      messageId: undefined,
      inputTokens: 0,
      outputTokens: asNumber(usage?.output_tokens),
      stopReason: typeof delta?.stop_reason === "string" ? delta.stop_reason : undefined,
    };
  }

  return null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
