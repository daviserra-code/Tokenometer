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

export const runtime = "nodejs";

const UPSTREAM = "https://models.github.ai/inference/chat/completions";

type ChatBody = {
  model?: string;
  stream?: boolean;
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let body: ChatBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    const state = createProxyState(req, "GitHub", "/api/proxy/github/chat/completions");
    return jsonProxyError(state, 400, "Invalid JSON body.");
  }

  const state = createProxyState(
    req,
    "GitHub",
    "/api/proxy/github/chat/completions",
    Boolean(body.stream)
  );
  const auth = await authProxy(req, "GitHub");
  if (auth instanceof NextResponse) {
    return attachProxyHeaders(auth, state);
  }
  if (!body.model) {
    return jsonProxyError(state, 400, "`model` is required (e.g. openai/gpt-4o-mini).");
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${auth.plaintextKey}`,
      },
      body: rawBody,
    });
  } catch (error) {
    return jsonProxyError(state, 502, "GitHub Models upstream request failed.", {
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
          source: "byok-proxy:github",
          metadata: enrichMeteringMetadata(state, {
            completionId: usage.completionId,
            upstreamStatus: upstreamRes.status,
          }),
        });
      },
    });
  }

  const text = await upstreamRes.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* upstream returned non-JSON */
  }

  if (upstreamRes.ok && json?.usage && body.model) {
    const usage = json.usage as Record<string, unknown>;
    queueMetering({
      ctx: auth,
      modelName: body.model,
      inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0,
      outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0,
      totalTokens: typeof usage.total_tokens === "number" ? usage.total_tokens : undefined,
      project: state.project,
      agent: state.agent,
      source: "byok-proxy:github",
      metadata: enrichMeteringMetadata(state, {
        completionId: typeof json.id === "string" ? json.id : undefined,
        upstreamStatus: upstreamRes.status,
      }),
    });
  }

  return createTextProxyResponse(upstreamRes, text, state, {
    upstreamStatus: upstreamRes.status,
  });
}
