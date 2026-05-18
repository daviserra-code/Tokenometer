import { NextRequest, NextResponse } from "next/server";
import { authProxy, meterUsage } from "@/lib/byok";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * BYOK proxy for Google Generative Language API (Gemini).
 *
 * POST /api/proxy/google/v1beta/models/[model]:[action]
 *   X-Ingest-Key: <ingest source api key>
 *   body: Gemini generateContent JSON
 *
 * Examples of [action]: generateContent, streamGenerateContent (stream rejected),
 * countTokens (no metering needed).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: { modelAndAction: string } }
) {
  const auth = await authProxy(req, "Google");
  if (auth instanceof NextResponse) return auth;

  const seg = ctx.params.modelAndAction; // e.g. "gemini-1.5-flash:generateContent"
  const [modelName, action] = seg.split(":");
  if (!modelName || !action) {
    return NextResponse.json(
      { error: "URL must be /api/proxy/google/v1beta/models/{model}:{action}" },
      { status: 400 }
    );
  }
  if (action.startsWith("stream")) {
    return NextResponse.json(
      { error: "Streaming not yet supported by Tokenometer proxy." },
      { status: 400 }
    );
  }

  const rawBody = await req.text();

  const upstream = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:${action}?key=${encodeURIComponent(
    auth.plaintextKey
  )}`;

  const upstreamRes = await fetch(upstream, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });

  const responseText = await upstreamRes.text();

  if (upstreamRes.ok && action === "generateContent") {
    try {
      const json = JSON.parse(responseText);
      const meta = json.usageMetadata ?? {};
      const inT: number = meta.promptTokenCount ?? 0;
      const outT: number = meta.candidatesTokenCount ?? 0;
      const totT: number = meta.totalTokenCount ?? inT + outT;
      await meterUsage({
        ctx: auth,
        modelName,
        inputTokens: inT,
        outputTokens: outT,
        totalTokens: totT,
        project: req.headers.get("x-project"),
        agent: req.headers.get("x-agent"),
        metadata: { action },
      });
    } catch (e) {
      console.error("Gemini metering failed:", e);
    }
  }

  return new NextResponse(responseText, {
    status: upstreamRes.status,
    headers: {
      "content-type": upstreamRes.headers.get("content-type") ?? "application/json",
    },
  });
}
