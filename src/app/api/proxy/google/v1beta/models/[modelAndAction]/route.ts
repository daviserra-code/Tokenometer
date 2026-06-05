import { NextRequest, NextResponse } from "next/server";
import { authProxy } from "@/lib/byok";
import {
  attachProxyHeaders,
  createProxyState,
  createSseProxyResponse,
  createTextProxyResponse,
  enrichMeteringMetadata,
  extractGeminiUsage,
  jsonProxyError,
  queueMetering,
} from "@/lib/proxy-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: { modelAndAction: string } }
) {
  const seg = ctx.params.modelAndAction;
  const [modelName, action] = seg.split(":");
  const state = createProxyState(
    req,
    "Google",
    `/api/proxy/google/v1beta/models/${ctx.params.modelAndAction}`,
    action === "streamGenerateContent"
  );
  const auth = await authProxy(req, "Google");
  if (auth instanceof NextResponse) {
    return attachProxyHeaders(auth, state);
  }

  if (!modelName || !action) {
    return jsonProxyError(
      state,
      400,
      "URL must be /api/proxy/google/v1beta/models/{model}:{action}"
    );
  }
  if (action !== "generateContent" && action !== "streamGenerateContent") {
    return jsonProxyError(state, 400, "Only generateContent and streamGenerateContent are supported.");
  }

  const rawBody = await req.text();
  const upstream = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:${action}?key=${encodeURIComponent(
    auth.plaintextKey
  )}${action === "streamGenerateContent" ? "&alt=sse" : ""}`;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
    });
  } catch (error) {
    return jsonProxyError(state, 502, "Google upstream request failed.", {
      upstreamError: error instanceof Error ? error.message : "Unknown fetch error",
    });
  }

  if (action === "streamGenerateContent") {
    if (!upstreamRes.ok || !upstreamRes.body) {
      const responseText = await upstreamRes.text();
      return createTextProxyResponse(upstreamRes, responseText, state, {
        action,
        upstreamStatus: upstreamRes.status,
      });
    }

    let usage:
      | {
          inputTokens: number;
          outputTokens: number;
          totalTokens: number;
          thoughtsTokenCount: number;
          cachedContentTokenCount: number;
          toolUsePromptTokenCount: number;
        }
      | null = null;

    return createSseProxyResponse({
      upstreamRes,
      state,
      onJson(payload) {
        const parsed = extractGeminiUsage(payload);
        if (!parsed) {
          return;
        }
        usage = parsed;
      },
      onComplete() {
        if (!usage) {
          return;
        }
        queueMetering({
          ctx: auth,
          modelName,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          project: state.project,
          agent: state.agent,
          source: "byok-proxy:google",
          metadata: enrichMeteringMetadata(state, {
            action,
            thoughtsTokenCount: usage.thoughtsTokenCount,
            cachedContentTokenCount: usage.cachedContentTokenCount,
            toolUsePromptTokenCount: usage.toolUsePromptTokenCount,
            upstreamStatus: upstreamRes.status,
          }),
        });
      },
    });
  }

  const responseText = await upstreamRes.text();

  if (upstreamRes.ok && action === "generateContent") {
    try {
      const json = JSON.parse(responseText);
      const meta = extractGeminiUsage(json);
      const inputTokens: number = meta?.inputTokens ?? 0;
      const outputTokens: number = meta?.outputTokens ?? 0;
      const totalTokens: number = meta?.totalTokens ?? inputTokens + outputTokens;
      queueMetering({
        ctx: auth,
        modelName,
        inputTokens,
        outputTokens,
        totalTokens,
        project: state.project,
        agent: state.agent,
        source: "byok-proxy:google",
        metadata: enrichMeteringMetadata(state, {
          action,
          thoughtsTokenCount: meta?.thoughtsTokenCount ?? 0,
          cachedContentTokenCount: meta?.cachedContentTokenCount ?? 0,
          toolUsePromptTokenCount: meta?.toolUsePromptTokenCount ?? 0,
          upstreamStatus: upstreamRes.status,
        }),
      });
    } catch (error) {
      console.error("Gemini metering failed:", error);
    }
  }

  return createTextProxyResponse(upstreamRes, responseText, state, {
    action,
    upstreamStatus: upstreamRes.status,
  });
}
