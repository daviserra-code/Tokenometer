import { NextRequest, NextResponse } from "next/server";
import { authProxy, meterUsage } from "@/lib/byok";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPSTREAM = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * BYOK proxy for Anthropic Messages API.
 *
 * POST /api/proxy/anthropic/v1/messages
 *   X-Ingest-Key: <ingest source api key>
 *   X-Project / X-Agent: optional attribution
 *   body: standard Anthropic Messages JSON
 */
export async function POST(req: NextRequest) {
  const auth = await authProxy(req, "Anthropic");
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
      "x-api-key": auth.plaintextKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: rawBody,
  });

  const responseText = await upstreamRes.text();

  if (upstreamRes.ok) {
    try {
      const json = JSON.parse(responseText);
      const usage = json.usage ?? {};
      const inT: number = usage.input_tokens ?? 0;
      const outT: number = usage.output_tokens ?? 0;
      await meterUsage({
        ctx: auth,
        modelName: body.model,
        inputTokens: inT,
        outputTokens: outT,
        project: req.headers.get("x-project"),
        agent: req.headers.get("x-agent"),
        metadata: { messageId: json.id, stopReason: json.stop_reason },
      });
    } catch (e) {
      console.error("Anthropic metering failed:", e);
    }
  }

  return new NextResponse(responseText, {
    status: upstreamRes.status,
    headers: {
      "content-type": upstreamRes.headers.get("content-type") ?? "application/json",
    },
  });
}
