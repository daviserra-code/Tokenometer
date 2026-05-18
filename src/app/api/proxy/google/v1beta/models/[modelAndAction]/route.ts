import { NextRequest, NextResponse } from "next/server";
import { authProxy } from "@/lib/byok";
import {
  attachProxyHeaders,
  createProxyState,
  createTextProxyResponse,
  enrichMeteringMetadata,
  jsonProxyError,
  queueMetering,
} from "@/lib/proxy-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: { modelAndAction: string } }
) {
  const state = createProxyState(
    req,
    "Google",
    `/api/proxy/google/v1beta/models/${ctx.params.modelAndAction}`
  );
  const auth = await authProxy(req, "Google");
  if (auth instanceof NextResponse) {
    return attachProxyHeaders(auth, state);
  }

  const seg = ctx.params.modelAndAction;
  const [modelName, action] = seg.split(":");
  if (!modelName || !action) {
    return jsonProxyError(
      state,
      400,
      "URL must be /api/proxy/google/v1beta/models/{model}:{action}"
    );
  }
  if (action.startsWith("stream")) {
    return jsonProxyError(
      createProxyState(
        req,
        "Google",
        `/api/proxy/google/v1beta/models/${ctx.params.modelAndAction}`,
        true
      ),
      400,
      "Streaming is not supported for the Google proxy yet."
    );
  }

  const rawBody = await req.text();
  const upstream = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:${action}?key=${encodeURIComponent(
    auth.plaintextKey
  )}`;

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

  const responseText = await upstreamRes.text();

  if (upstreamRes.ok && action === "generateContent") {
    try {
      const json = JSON.parse(responseText);
      const meta = json.usageMetadata ?? {};
      const inputTokens: number = meta.promptTokenCount ?? 0;
      const outputTokens: number = meta.candidatesTokenCount ?? 0;
      const totalTokens: number = meta.totalTokenCount ?? inputTokens + outputTokens;
      queueMetering({
        ctx: auth,
        modelName,
        inputTokens,
        outputTokens,
        totalTokens,
        project: state.project,
        agent: state.agent,
        metadata: enrichMeteringMetadata(state, { action, upstreamStatus: upstreamRes.status }),
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
