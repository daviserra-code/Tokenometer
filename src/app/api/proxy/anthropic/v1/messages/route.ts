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
  safeReadUpstreamText,
} from "@/lib/proxy-runtime";
import { prisma } from "@/lib/prisma";

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
      const responseText = await safeReadUpstreamText(upstreamRes);
      return createTextProxyResponse(upstreamRes, responseText, state, {
        upstreamStatus: upstreamRes.status,
      });
    }

    const usage = {
      inputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheCreation5mInputTokens: 0,
      cacheCreation1hInputTokens: 0,
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
        if (parsed.cacheReadInputTokens) {
          usage.cacheReadInputTokens = parsed.cacheReadInputTokens;
        }
        if (parsed.cacheCreationInputTokens) {
          usage.cacheCreationInputTokens = parsed.cacheCreationInputTokens;
        }
        if (parsed.cacheCreation5mInputTokens) {
          usage.cacheCreation5mInputTokens = parsed.cacheCreation5mInputTokens;
        }
        if (parsed.cacheCreation1hInputTokens) {
          usage.cacheCreation1hInputTokens = parsed.cacheCreation1hInputTokens;
        }
        if (parsed.outputTokens) {
          usage.outputTokens = parsed.outputTokens;
        }
        if (parsed.stopReason) {
          usage.stopReason = parsed.stopReason;
        }
      },
      async onComplete() {
        const effectiveInputTokens =
          usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
        if (effectiveInputTokens === 0 && usage.outputTokens === 0) {
          return;
        }
        const { inputCost, outputCost, totalCost } = await estimateAnthropicCosts(
          auth.providerId,
          body.model!,
          {
            baseInputTokens: usage.inputTokens,
            cacheReadInputTokens: usage.cacheReadInputTokens,
            cacheCreationInputTokens: usage.cacheCreationInputTokens,
            cacheCreation5mInputTokens: usage.cacheCreation5mInputTokens,
            cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
            outputTokens: usage.outputTokens,
          }
        );
        queueMetering({
          ctx: auth,
          modelName: body.model!,
          inputTokens: effectiveInputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: effectiveInputTokens + usage.outputTokens,
          project: state.project,
          agent: state.agent,
          source: "byok-proxy:anthropic",
          estimatedInputCost: inputCost,
          estimatedOutputCost: outputCost,
          estimatedTotalCost: totalCost,
          metadata: enrichMeteringMetadata(state, {
            messageId: usage.messageId,
            stopReason: usage.stopReason,
            cacheReadInputTokens: usage.cacheReadInputTokens,
            cacheCreationInputTokens: usage.cacheCreationInputTokens,
            cacheCreation5mInputTokens: usage.cacheCreation5mInputTokens,
            cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
            upstreamStatus: upstreamRes.status,
          }),
        });
      },
    });
  }

  const responseText = await safeReadUpstreamText(upstreamRes);

  if (upstreamRes.ok) {
    try {
      const json = JSON.parse(responseText);
      const usage = json.usage ?? {};
      const baseInputTokens: number = usage.input_tokens ?? 0;
      const cacheReadInputTokens: number = usage.cache_read_input_tokens ?? 0;
      const cacheCreationInputTokens: number = usage.cache_creation_input_tokens ?? 0;
      const cacheCreation5mInputTokens: number = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;
      const cacheCreation1hInputTokens: number = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
      const outputTokens: number = usage.output_tokens ?? 0;
      const inputTokens =
        baseInputTokens + cacheReadInputTokens + cacheCreationInputTokens;
      const { inputCost, outputCost, totalCost } = await estimateAnthropicCosts(
        auth.providerId,
        body.model,
        {
          baseInputTokens,
          cacheReadInputTokens,
          cacheCreationInputTokens,
          cacheCreation5mInputTokens,
          cacheCreation1hInputTokens,
          outputTokens,
        }
      );
      queueMetering({
        ctx: auth,
        modelName: body.model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        project: state.project,
        agent: state.agent,
        source: "byok-proxy:anthropic",
        estimatedInputCost: inputCost,
        estimatedOutputCost: outputCost,
        estimatedTotalCost: totalCost,
        metadata: enrichMeteringMetadata(state, {
          messageId: json.id,
          stopReason: json.stop_reason,
          cacheReadInputTokens,
          cacheCreationInputTokens,
          cacheCreation5mInputTokens,
          cacheCreation1hInputTokens,
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

async function estimateAnthropicCosts(
  providerId: string,
  modelName: string,
  usage: {
    baseInputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    cacheCreation5mInputTokens: number;
    cacheCreation1hInputTokens: number;
    outputTokens: number;
  }
) {
  const model = await prisma.model.upsert({
    where: {
      providerId_name: {
        providerId,
        name: modelName,
      },
    },
    create: { providerId, name: modelName },
    update: {},
  });

  const baseInputRate = Number(model.inputPricePerMillion);
  const outputRate = Number(model.outputPricePerMillion);
  const unspecifiedCacheCreationTokens = Math.max(
    0,
    usage.cacheCreationInputTokens -
      usage.cacheCreation5mInputTokens -
      usage.cacheCreation1hInputTokens
  );

  const inputCost =
    (usage.baseInputTokens / 1_000_000) * baseInputRate +
    (usage.cacheReadInputTokens / 1_000_000) * baseInputRate * 0.1 +
    (usage.cacheCreation5mInputTokens / 1_000_000) * baseInputRate * 1.25 +
    (usage.cacheCreation1hInputTokens / 1_000_000) * baseInputRate * 2 +
    (unspecifiedCacheCreationTokens / 1_000_000) * baseInputRate * 1.25;
  const outputCost = (usage.outputTokens / 1_000_000) * outputRate;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}
