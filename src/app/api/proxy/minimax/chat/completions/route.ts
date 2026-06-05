import { NextRequest, NextResponse } from "next/server";
import { authProxy } from "@/lib/byok";
import {
  attachProxyHeaders,
  createProxyState,
  createSseProxyResponse,
  createTextProxyResponse,
  enrichMeteringMetadata,
  extractOpenAiCompatibleUsage,
  jsonProxyError,
  queueMetering,
} from "@/lib/proxy-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPSTREAM = "https://api.minimax.io/v1/chat/completions";

type MiniMaxBody = {
  model?: string;
  stream?: boolean;
  stream_options?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let body: MiniMaxBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    const state = createProxyState(req, "MiniMax", "/api/proxy/minimax/chat/completions");
    return jsonProxyError(state, 400, "Invalid JSON body.");
  }

  const state = createProxyState(
    req,
    "MiniMax",
    "/api/proxy/minimax/chat/completions",
    Boolean(body.stream)
  );
  const auth = await authProxy(req, "MiniMax");
  if (auth instanceof NextResponse) {
    return attachProxyHeaders(auth, state);
  }
  if (!body.model) {
    return jsonProxyError(state, 400, "model required.");
  }

  const forwardedBody = body.stream
    ? JSON.stringify({
        ...body,
        stream: true,
        stream_options: {
          ...(body.stream_options ?? {}),
          include_usage: true,
        },
      })
    : rawBody;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${auth.plaintextKey}`,
      },
      body: forwardedBody,
    });
  } catch (error) {
    return jsonProxyError(state, 502, "MiniMax upstream request failed.", {
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

    let usage:
      | {
          inputTokens: number;
          outputTokens: number;
          totalTokens: number;
          completionId?: string;
        }
      | null = null;

    return createSseProxyResponse({
      upstreamRes,
      state,
      onJson(payload) {
        const parsed = extractOpenAiCompatibleUsage(payload);
        if (parsed) {
          usage = {
            inputTokens: parsed.inputTokens,
            outputTokens: parsed.outputTokens,
            totalTokens: parsed.totalTokens,
            completionId: parsed.completionId,
          };
        }
      },
      onComplete() {
        if (!usage) {
          return;
        }
        queueMetering({
          ctx: auth,
          modelName: body.model!,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          project: state.project,
          agent: state.agent,
          source: "byok-proxy:minimax",
          metadata: enrichMeteringMetadata(state, {
            completionId: usage.completionId,
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
      const inputTokens: number = usage.prompt_tokens ?? 0;
      const outputTokens: number = usage.completion_tokens ?? 0;
      const totalTokens: number = usage.total_tokens ?? inputTokens + outputTokens;
      queueMetering({
        ctx: auth,
        modelName: body.model,
        inputTokens,
        outputTokens,
        totalTokens,
        project: state.project,
        agent: state.agent,
        source: "byok-proxy:minimax",
        metadata: enrichMeteringMetadata(state, {
          completionId: json.id,
          upstreamStatus: upstreamRes.status,
        }),
      });
    } catch (error) {
      console.error("MiniMax metering failed:", error);
    }
  }

  return createTextProxyResponse(upstreamRes, responseText, state, {
    upstreamStatus: upstreamRes.status,
  });
}
