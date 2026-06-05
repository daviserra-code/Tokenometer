import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host");
  const baseUrl =
    forwardedProto && forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : `${url.protocol}//${url.host}`;

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Tokenometer Public API",
      version: "1.0.0",
      description:
        "Endpoints exposed by Tokenometer for ingest, BYOK proxying, and FinOps insights. Designed for use as a custom action in OpenAI Agent Builder / GPT Actions.",
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        IngestKey: {
          type: "apiKey",
          in: "header",
          name: "X-Ingest-Key",
        },
        IngestSignature: {
          type: "apiKey",
          in: "header",
          name: "X-Ingest-Signature",
          description: "HMAC-SHA256 of the raw request body, prefixed sha256=",
        },
      },
      schemas: {
        IngestEvent: {
          type: "object",
          required: ["timestamp", "model"],
          properties: {
            timestamp: { type: "string", format: "date-time" },
            provider: { type: "string", example: "OpenAI" },
            model: { type: "string", example: "gpt-4o-mini" },
            inputTokens: { type: "integer", minimum: 0 },
            outputTokens: { type: "integer", minimum: 0 },
            project: { type: "string" },
            team: { type: "string" },
            agent: { type: "string" },
            workflow: { type: "string" },
            owner: { type: "string" },
            source: { type: "string" },
          },
        },
        IngestResponse: {
          type: "object",
          properties: {
            jobId: { type: "string" },
            inserted: { type: "integer" },
            failed: { type: "integer" },
            errors: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    paths: {
      "/api/ingest": {
        post: {
          summary: "Push usage events",
          description:
            "Accepts up to 5000 usage events per call. Requires X-Ingest-Key and X-Ingest-Signature headers.",
          security: [{ IngestKey: [], IngestSignature: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["events"],
                  properties: {
                    events: {
                      type: "array",
                      maxItems: 5000,
                      items: { $ref: "#/components/schemas/IngestEvent" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Import result",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/IngestResponse" },
                },
              },
            },
            "401": { description: "Bad key or signature" },
          },
        },
      },
      "/api/proxy/openai/chat/completions": {
        post: {
          summary: "BYOK proxy for OpenAI chat completions",
          description:
            "Forwards to OpenAI using the vaulted org credential and meters tokens automatically. Set X-Project / X-Agent for attribution. Streaming is supported and responses expose X-Request-Id for tracing.",
          security: [{ IngestKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", description: "Standard OpenAI chat completion request" },
              },
            },
          },
          responses: {
            "200": {
              description: "Upstream OpenAI response (passed through)",
            },
          },
        },
      },
      "/api/proxy/anthropic/v1/messages": {
        post: {
          summary: "BYOK proxy for Anthropic Messages API",
          description:
            "Forwards to api.anthropic.com using the vaulted Anthropic credential and meters tokens automatically. Streaming is supported and responses expose X-Request-Id for tracing.",
          security: [{ IngestKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", description: "Standard Anthropic /v1/messages request" },
              },
            },
          },
          responses: { "200": { description: "Upstream Anthropic response (passed through)" } },
        },
      },
      "/api/proxy/google/v1beta/models/{modelAndAction}": {
        post: {
          summary: "BYOK proxy for Google Generative Language API (Gemini)",
          description:
            "Path segment must be of the form `<model>:<action>` e.g. `gemini-2.0-flash:generateContent` or `gemini-2.0-flash:streamGenerateContent`. Forwards to generativelanguage.googleapis.com using the vaulted Google credential. Streaming is supported and responses expose X-Request-Id for tracing.",
          security: [{ IngestKey: [] }],
          parameters: [
            {
              name: "modelAndAction",
              in: "path",
              required: true,
              schema: { type: "string", example: "gemini-2.0-flash:generateContent" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", description: "Gemini generateContent request body" },
              },
            },
          },
          responses: { "200": { description: "Upstream Gemini response (passed through)" } },
        },
      },
      "/api/proxy/mistral/v1/chat/completions": {
        post: {
          summary: "BYOK proxy for Mistral chat completions",
          description:
            "Forwards to api.mistral.ai using the vaulted Mistral credential. OpenAI-compatible request shape. Streaming is supported and responses expose X-Request-Id for tracing.",
          security: [{ IngestKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", description: "Standard Mistral chat completion request" },
              },
            },
          },
          responses: { "200": { description: "Upstream Mistral response (passed through)" } },
        },
      },
      "/api/proxy/deepseek/chat/completions": {
        post: {
          summary: "BYOK proxy for DeepSeek chat completions",
          description:
            "Forwards to api.deepseek.com using the vaulted DeepSeek credential. OpenAI-compatible request shape. Streaming is supported and responses expose X-Request-Id for tracing.",
          security: [{ IngestKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", description: "Standard DeepSeek chat completion request" },
              },
            },
          },
          responses: { "200": { description: "Upstream DeepSeek response (passed through)" } },
        },
      },
      "/api/proxy/minimax/chat/completions": {
        post: {
          summary: "BYOK proxy for MiniMax chat completions",
          description:
            "Forwards to api.minimax.io/v1/chat/completions using the vaulted MiniMax credential. OpenAI-compatible request shape. Streaming is supported and responses expose X-Request-Id for tracing.",
          security: [{ IngestKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", description: "Standard MiniMax OpenAI-compatible chat completion request" },
              },
            },
          },
          responses: { "200": { description: "Upstream MiniMax response (passed through)" } },
        },
      },
      "/api/proxy/github/chat/completions": {
        post: {
          summary: "BYOK proxy for GitHub Models / Copilot-backed models",
          description:
            "Forwards to models.github.ai/inference using a vaulted GitHub PAT (`models:read` scope). OpenAI-compatible. Model names use `<publisher>/<model>` form, e.g. `openai/gpt-4o-mini`. Streaming is supported and responses expose X-Request-Id for tracing.",
          security: [{ IngestKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", description: "OpenAI-compatible chat completion request" },
              },
            },
          },
          responses: { "200": { description: "Upstream GitHub Models response (passed through)" } },
        },
      },
      "/api/assistant": {
        post: {
          summary: "Tokenometer Copilot streaming chat",
          description:
            "Agentic chat endpoint (Vercel AI SDK protocol). Tools available: query_usage, get_balances, forecast_spend, recommend_model_swaps, detect_anomalies.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    messages: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          role: { type: "string", enum: ["user", "assistant", "system"] },
                          content: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Streaming AI SDK response" } },
        },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
