import { NextRequest, NextResponse } from "next/server";
import { authProxy, meterUsage } from "@/lib/byok";

export const runtime = "nodejs";

const UPSTREAM = "https://models.github.ai/inference/chat/completions";

type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
type ChatBody = { model?: string; stream?: boolean; usage?: Usage };

export async function POST(req: NextRequest) {
  const auth = await authProxy(req, "GitHub");
  if (auth instanceof NextResponse) return auth;

  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (body.stream) {
    return NextResponse.json(
      { error: "Streaming not supported by this proxy. Set stream=false." },
      { status: 400 }
    );
  }
  if (!body.model) {
    return NextResponse.json(
      { error: "`model` is required (e.g. openai/gpt-4o-mini)." },
      { status: 400 }
    );
  }

  const upstream = await fetch(UPSTREAM, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${auth.plaintextKey}`,
    },
    body: JSON.stringify(body),
  });

  const text = await upstream.text();
  let json: ChatBody | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* upstream returned non-JSON */
  }

  if (upstream.ok && json?.usage) {
    await meterUsage({
      ctx: auth,
      modelName: body.model,
      inputTokens: json.usage.prompt_tokens ?? 0,
      outputTokens: json.usage.completion_tokens ?? 0,
      totalTokens: json.usage.total_tokens,
      project: req.headers.get("x-project"),
      agent: req.headers.get("x-agent"),
      source: "byok-proxy:github",
    });
  }

  return new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
