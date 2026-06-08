import { streamText, tool } from "ai";
import { z } from "zod";
import {
  defaultOrgId,
  detectAnomalies,
  forecastSpend,
  getBalances,
  queryUsage,
  recommendModelSwap,
} from "@/lib/analytics";
import { getCopilotModel, resolveCopilotConfig } from "@/lib/copilot-provider";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are Tokenometer Copilot — an AI FinOps analyst for a multi-provider AI token wallet.
You help operators understand token spend, wallet balances, anomalies, and optimization opportunities
across providers (OpenAI, Anthropic, Google, Mistral, self-hosted models).
Always call the appropriate tool to ground answers in real data; never invent numbers.
Format money with currency symbols and tokens with thousands separators. Be concise and actionable.`;

export async function POST(req: Request) {
  const orgId = await defaultOrgId();
  if (!orgId) {
    return new Response(JSON.stringify({ error: "No organization seeded." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const cfg = await resolveCopilotConfig(orgId);
  if (!cfg.configured) {
    return new Response(JSON.stringify({ error: cfg.reason }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const { messages } = await req.json();

  const model = await getCopilotModel(cfg);

  const result = await streamText({
    model,
    system: SYSTEM,
    messages,
    maxSteps: 5,
    tools: {
      query_usage: tool({
        description:
          "Aggregate AI usage events for the active organization. Optionally group by dimension.",
        parameters: z.object({
          period: z.enum(["7d", "30d", "90d", "mtd"]).default("30d"),
          groupBy: z
            .enum(["provider", "project", "team", "model", "agent"])
            .optional(),
        }),
        execute: async ({ period, groupBy }) =>
          queryUsage({ organizationId: orgId, period, groupBy }),
      }),
      get_balances: tool({
        description:
          "Return token wallet balances across all providers for the active organization.",
        parameters: z.object({}),
        execute: async () => getBalances(orgId),
      }),
      forecast_spend: tool({
        description:
          "Linear forecast of fiat spend over a horizon based on the last 30 days.",
        parameters: z.object({
          horizonDays: z.number().int().min(1).max(180).default(30),
        }),
        execute: async ({ horizonDays }) =>
          forecastSpend({ organizationId: orgId, horizonDays }),
      }),
      recommend_model_swaps: tool({
        description:
          "Suggest cheaper same-provider model alternatives for the most expensive models in use.",
        parameters: z.object({}),
        execute: async () => recommendModelSwap(orgId),
      }),
      detect_anomalies: tool({
        description:
          "Find providers whose last-24h spend deviates >50% from the prior 7-day daily average.",
        parameters: z.object({}),
        execute: async () => detectAnomalies(orgId),
      }),
    },
  });

  return result.toDataStreamResponse();
}
