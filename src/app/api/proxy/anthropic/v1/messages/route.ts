import { NextRequest, NextResponse } from "next/server";
import { authProxy } from "@/lib/byok";
import {
  attachProxyHeaders,
  createProxyState,
  createSseProxyResponse,
  createTextProxyResponse,
  enrichMeteringMetadata,
  extractAnthropicUsage,
  jsonProxyError,
  queueMetering,
} from "@/lib/proxy-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPSTREAM = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

type AnthropicBody = {
  model?: string;
  stream?: boolean;
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let body: AnthropicBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    const state = createProxyState(req, "Anthropic", "/api/proxy/anthropic/v1/messages");
    return jsonProxyError(state, 400, "Invalid JSON body.");
  }

  const state = createProxyState(
    req,
    "Anthropic",
    "/api/proxy/anthropic/v1/messages",
    Boolean(body.stream)
  );
  const auth = await authProxy(req, "Anthropic");
  if (auth instanceof NextResponse) {
    return attachProxyHeaders(auth, state);
  }
  if (!body.model) {
    return jsonProxyError(state, 400, "model required.");
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": auth.plaintextKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: rawBody,
    });
  } catch (error) {
    return jsonProxyError(state, 502, "Anthropic upstream request failed.", {
      upstreamError: error instanceof Error ? error.message : "Unknown fetch error",
    });
  }

  if (body.stream) {
    if (!upstreamRes.ok || !upstreamRes.body) {
      const responseText = await upstreamRes.text();
      return createTextProxyResponse(upstreamRes, responseText, state, {
        upstreamStatus: upstreamRes.status,
      });
    }

    const usage = {
      inputTokens: 0,
      outputTokens: 0,
      messageId: undefined as string | undefined,
      stopReason: undefined as string | undefined,
    };

    return createSseProxyResponse({
      upstreamRes,
      state,
      onJson(payload) {
        const parsed = extractAnthropicUsage(payload);
        if (!parsed) {
          return;
        }
        if (parsed.messageId) {
          usage.messageId = parsed.messageId;
        }
        if (parsed.inputTokens) {
          usage.inputTokens = parsed.inputTokens;
        }
        if (parsed.outputTokens) {
          usage.outputTokens = parsed.outputTokens;
        }
        if (parsed.stopReason) {
          usage.stopReason = parsed.stopReason;
        }
      },
      onComplete() {
        if (usage.inputTokens === 0 && usage.outputTokens === 0) {
          return;
        }
        queueMetering({
          ctx: auth,
          modelName: body.model!,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          project: state.project,
          agent: state.agent,
          metadata: enrichMeteringMetadata(state, {
            messageId: usage.messageId,
            stopReason: usage.stopReason,
            upstreamStatus: upstreamRes.status,
          }),
        });
      },
    });
  }

  const responseText = await upstreamRes.text();

  if (upstreamRes.ok) {
    try {
      const json = JSON.parse(responseText);
      const usage = json.usage ?? {};
      const inputTokens: number = usage.input_tokens ?? 0;
      const outputTokens: number = usage.output_tokens ?? 0;
      queueMetering({
        ctx: auth,
        modelName: body.model,
        inputTokens,
        outputTokens,
        project: state.project,
        agent: state.agent,
        metadata: enrichMeteringMetadata(state, {
          messageId: json.id,
          stopReason: json.stop_reason,
          upstreamStatus: upstreamRes.status,
        }),
      });
    } catch (error) {
      console.error("Anthropic metering failed:", error);
    }
  }

  return createTextProxyResponse(upstreamRes, responseText, state, {
    upstreamStatus: upstreamRes.status,
  });
}
