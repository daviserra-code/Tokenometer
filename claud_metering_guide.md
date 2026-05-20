# Claude Metering Guide

This guide is for teams integrating **Claude**, **OpenAI**, or **Gemini** apps
with Tokenometer from another codebase.

It is written as a production handoff document, not as an internal note for
this repo.

## Goal

Meter real model spend without breaking app continuity.

The safe pattern is:

1. keep your app logic unchanged as much as possible
2. wrap model calls in one small adapter layer
3. let that adapter decide whether to use:
   - `direct`
   - `shadow`
   - `proxy`

Do **not** think of Tokenometer as script injection into a running app.
Think of it as a metering-aware transport layer around your model calls.

## The 3 modes

### `direct`

Your app calls the provider directly.

Use this when:

- you need a hard bypass
- you are rolling back
- you are not ready to meter yet

### `shadow`

Your app still calls the provider directly, then separately sends usage data to
Tokenometer using `/api/ingest`.

Use this when:

- you want to validate Tokenometer dashboards first
- you do not want Tokenometer in the critical request path yet
- continuity matters more than enforcement

### `proxy`

Your app calls Tokenometer first, and Tokenometer forwards the request to the
provider using the vaulted key stored in Tokenometer.

Use this when:

- you want live metering as the primary path
- you want project and agent attribution from request headers
- you want provider dashboard limitations to matter less

## Continuity recommendation

For production, use **fail-open** behavior.

That means:

1. try Tokenometer proxy
2. if proxy fails, fall back to direct provider mode
3. log the fallback clearly
4. if possible, send a shadow ingest record afterward

This avoids making Tokenometer a single point of failure too early.

## Required secrets

### Proxy mode

Needs:

- `TOKENOMETER_INGEST_KEY`

The provider key stays vaulted in Tokenometer.

### Shadow mode

Needs:

- `TOKENOMETER_INGEST_KEY`
- `TOKENOMETER_INGEST_SECRET`
- the provider API key inside the app

Shadow mode signs `/api/ingest` with HMAC-SHA256.

### Direct mode

Needs:

- the provider API key inside the app

## Tokenometer proxy routes

### Claude / Anthropic

`https://www.tokenometer.cloud/api/proxy/anthropic/v1/messages`

Notes:

- request body uses Anthropic Messages API format
- `stream: true` is supported
- Tokenometer forwards with:
  - `x-api-key`
  - `anthropic-version: 2023-06-01`

### OpenAI

`https://www.tokenometer.cloud/api/proxy/openai/chat/completions`

Notes:

- request body uses standard OpenAI chat completions format
- `stream: true` is supported
- Tokenometer automatically adds `stream_options.include_usage = true` when needed

### Gemini

`https://www.tokenometer.cloud/api/proxy/google/v1beta/models/gemini-2.0-flash:generateContent`

Notes:

- the model and action live in the URL path
- current Tokenometer support is for non-streaming Gemini proxy calls

## Request attribution headers

When using proxy mode, send:

- `x-ingest-key`
- `x-project`
- `x-agent`
- `x-request-id`

Optional:

- `x-credential-id`

These headers are what make Tokenometer useful as a spending tool instead of a
blind pass-through proxy.

## Claude proxy example

```bash
curl -X POST "https://www.tokenometer.cloud/api/proxy/anthropic/v1/messages" \
  -H "content-type: application/json" \
  -H "x-ingest-key: $TOKENOMETER_INGEST_KEY" \
  -H "x-project: support-app" \
  -H "x-agent: claude-bot" \
  -H "x-request-id: req-123" \
  -d '{
    "model": "claude-3-5-haiku-latest",
    "max_tokens": 200,
    "messages": [
      { "role": "user", "content": "Say hello from Tokenometer." }
    ]
  }'
```

## Claude shadow-mode pattern

In shadow mode:

1. call Anthropic directly
2. read usage from the response:
   - `usage.input_tokens`
   - `usage.output_tokens`
3. send a signed `/api/ingest` request to Tokenometer

Example payload:

```json
{
  "events": [
    {
      "timestamp": "2026-05-20T18:30:00Z",
      "provider": "Anthropic",
      "model": "claude-3-5-haiku-latest",
      "inputTokens": 120,
      "outputTokens": 48,
      "totalTokens": 168,
      "project": "support-app",
      "team": "platform",
      "agent": "claude-bot",
      "owner": "davide",
      "source": "shadow-claude",
      "metadata": {
        "requestId": "req-123"
      }
    }
  ]
}
```

The raw JSON body must be HMAC-signed as:

- header: `x-ingest-signature`
- value: `sha256=<hex_digest>`

## OpenAI proxy example

```bash
curl -X POST "https://www.tokenometer.cloud/api/proxy/openai/chat/completions" \
  -H "content-type: application/json" \
  -H "x-ingest-key: $TOKENOMETER_INGEST_KEY" \
  -H "x-project: customer-ops" \
  -H "x-agent: support-bot" \
  -H "x-request-id: req-456" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "user", "content": "Say hello from Tokenometer." }
    ]
  }'
```

## Adapter contract for other codebases

If another app team asks what they need to implement, the answer is:

### Inputs

- provider name
- model name
- request body
- app metadata:
  - project
  - team
  - agent
  - owner
- mode:
  - `direct`
  - `shadow`
  - `proxy`

### Behavior

- in `direct`, call provider only
- in `shadow`, call provider then send usage to `/api/ingest`
- in `proxy`, call Tokenometer route first
- if `proxy` fails and fallback is enabled, call provider directly

### Outputs

- upstream response body
- request id
- mode used
- metering path:
  - `proxy`
  - `ingest`
  - `none`

## Suggested environment variables

```env
AI_METERING_MODE=shadow
TOKENOMETER_BASE_URL=https://www.tokenometer.cloud
TOKENOMETER_INGEST_KEY=...
TOKENOMETER_INGEST_SECRET=...
TOKENOMETER_PROJECT=Customer Support
TOKENOMETER_TEAM=Platform
TOKENOMETER_AGENT=claude-bot
TOKENOMETER_OWNER=davide

ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-haiku-latest

OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

GOOGLE_GENERATIVE_AI_API_KEY=AIza...
GOOGLE_MODEL=gemini-2.0-flash
```

## Recommended rollout for mixed LLM estates

If some apps use Claude and some use OpenAI:

1. pick the least critical app first
2. start with `shadow`
3. confirm Tokenometer shows:
   - current timestamps
   - correct provider
   - correct model
   - token counts
   - cost estimates
   - project and agent attribution
4. move that app to `proxy`
5. keep direct fallback enabled
6. repeat provider by provider

Do **not** switch all apps at once.

## What to verify in Tokenometer

After each test, check:

- [https://www.tokenometer.cloud](https://www.tokenometer.cloud)
- [https://www.tokenometer.cloud/reports](https://www.tokenometer.cloud/reports)
- [https://www.tokenometer.cloud/ledger](https://www.tokenometer.cloud/ledger)
- [https://www.tokenometer.cloud/gateway](https://www.tokenometer.cloud/gateway)

You want to see:

- fresh timestamps
- correct provider
- correct model
- realistic token counts
- realistic estimated cost
- request attribution matching your app metadata

## Files already available in this repo

Reusable examples:

- [C:\Users\Davide\VS-Code Solutions\Tokenometer\examples\integration\tokenometer-adapter.ts](C:\Users\Davide\VS-Code Solutions\Tokenometer\examples\integration\tokenometer-adapter.ts)
- [C:\Users\Davide\VS-Code Solutions\Tokenometer\examples\integration\tokenometer_adapter.py](C:\Users\Davide\VS-Code Solutions\Tokenometer\examples\integration\tokenometer_adapter.py)

Spend tests:

- [C:\Users\Davide\VS-Code Solutions\Tokenometer\tests\test_spend_openai_env.py](C:\Users\Davide\VS-Code Solutions\Tokenometer\tests\test_spend_openai_env.py)
- [C:\Users\Davide\VS-Code Solutions\Tokenometer\tests\test_spend_gemini_env.py](C:\Users\Davide\VS-Code Solutions\Tokenometer\tests\test_spend_gemini_env.py)

## Final recommendation

For Claude-powered apps, I would start with:

- `shadow` first
- `proxy` second
- `allow_direct_fallback = true`

That gives you confidence in the spending layer before Tokenometer becomes part
of the live request path.
