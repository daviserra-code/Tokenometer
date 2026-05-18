import { NextRequest, NextResponse } from "next/server";
import { authProxy, meterUsage } from "@/lib/byok";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPSTREAM = "https://api.mistral.ai/v1/chat/completions";

/**
 * BYOK proxy for Mistral chat completions (OpenAI-compatible shape).
 *
 * POST /api/proxy/mistral/v1/chat/completions
 *   X-Ingest-Key: <ingest source api key>
 */
export async function POST(req: NextRequest) {
  const auth = await authProxy(req, "Mistral");
  if (auth instanceof NextResponse) return auth;

  const rawBody = await req.text();
  let body: { model?: string; stream?: boolean };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (body.stream) {
    return NextResponse.json(
      { error: "Streaming not yet supported by Tokenometer proxy. Set stream:false." },
      { status: 400 }
    );
  }
  if (!body.model) {
    return NextResponse.json({ error: "model required." }, { status: 400 });
  }

  const upstreamRes = await fetch(UPSTREAM, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${auth.plaintextKey}`,
    },
    body: rawBody,
  });

  const responseText = await upstreamRes.text();

  if (upstreamRes.ok) {
    try {
      const json = JSON.parse(responseText);
      const usage = json.usage ?? {};
      const inT: number = usage.prompt_tokens ?? 0;
      const outT: number = usage.completion_tokens ?? 0;
      const totT: number = usage.total_tokens ?? inT + outT;
      await meterUsage({
        ctx: auth,
        modelName: body.model,
        inputTokens: inT,
        outputTokens: outT,
        totalTokens: totT,
        project: req.headers.get("x-project"),
        agent: req.headers.get("x-agent"),
        metadata: { completionId: json.id },
      });
    } catch (e) {
      console.error("Mistral metering failed:", e);
    }
  }

  return new NextResponse(responseText, {
    status: upstreamRes.status,
    headers: {
      "content-type": upstreamRes.headers.get("content-type") ?? "application/json",
    },
  });
}
