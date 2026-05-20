# Tokenometer Production Metering Guide

This guide is the practical path for wiring real production apps into Tokenometer
without gambling on continuity.

## First: this is not script injection

Do not think of Tokenometer as something that gets injected into a running app.

The safe production pattern is:

1. your app stops calling the model provider directly
2. your app calls a small local adapter or wrapper instead
3. the adapter decides whether to use:
   - `direct`
   - `shadow`
   - `proxy`

That adapter layer is where continuity, fallback, and metering policy live.

## The 3 rollout modes

### `direct`

Your app calls OpenAI or Gemini directly.

Use this when:

- you are not ready to meter yet
- you need a hard bypass
- you are doing emergency rollback

### `shadow`

Your app still calls the provider directly, but after the response it also sends
the token usage to Tokenometer through `/api/ingest`.

Use this when:

- you want to validate dashboards and reports
- you do not want Tokenometer in the live request path yet
- continuity matters more than perfect enforcement

### `proxy`

Your app sends the request to Tokenometer first, and Tokenometer forwards it to
the provider using the vaulted provider key.

Use this when:

- you want live metering as the real path
- you want project and agent attribution from request headers
- you want provider dashboard limitations to matter less

## Continuity policy: fail open

For your current stage, the safest production posture is:

- try Tokenometer proxy first
- if proxy fails, fall back to direct provider mode
- log that fallback loudly

This means your app keeps working even if Tokenometer has a temporary problem.
The tradeoff is that a fallback request may bypass direct proxy metering, so the
adapter should shadow-ingest the usage afterward when possible.

## What secrets are involved

### For proxy mode

You need:

- `TOKENOMETER_INGEST_KEY`

The provider API key stays vaulted inside Tokenometer.

### For shadow mode

You need:

- `TOKENOMETER_INGEST_KEY`
- `TOKENOMETER_INGEST_SECRET`
- the provider API key inside the app

Shadow mode signs `/api/ingest` with HMAC, so it needs the ingest secret as well
as the ingest key.

### For direct mode

You only need the provider API key inside the app.

## Strong recommendation

The ingest key currently hardcoded in
[C:\Users\Davide\VS-Code Solutions\Tokenometer\tests\test_tokenometer.py](C:\Users\Davide\VS-Code Solutions\Tokenometer\tests\test_tokenometer.py)
should be treated as exposed if it is still active. Rotate it before wiring
production apps.

## OpenAI and Gemini routes

### OpenAI proxy route

`https://www.tokenometer.cloud/api/proxy/openai/chat/completions`

### Gemini proxy route

`https://www.tokenometer.cloud/api/proxy/google/v1beta/models/gemini-2.0-flash:generateContent`

Gemini proxy paths include the model and action in the URL.

## Request attribution headers

When using proxy mode, send these headers:

- `x-ingest-key`
- `x-project`
- `x-agent`
- `x-request-id`

Optional:

- `x-credential-id`

These are what let Tokenometer attribute live spend to the right project and
agent instead of just recording anonymous traffic.

## Files added for you

### Node / TypeScript adapter

[C:\Users\Davide\VS-Code Solutions\Tokenometer\examples\integration\tokenometer-adapter.ts](C:\Users\Davide\VS-Code Solutions\Tokenometer\examples\integration\tokenometer-adapter.ts)

### Python adapter

[C:\Users\Davide\VS-Code Solutions\Tokenometer\examples\integration\tokenometer_adapter.py](C:\Users\Davide\VS-Code Solutions\Tokenometer\examples\integration\tokenometer_adapter.py)

### Ready-to-run spend tests

- [C:\Users\Davide\VS-Code Solutions\Tokenometer\tests\test_spend_openai_env.py](C:\Users\Davide\VS-Code Solutions\Tokenometer\tests\test_spend_openai_env.py)
- [C:\Users\Davide\VS-Code Solutions\Tokenometer\tests\test_spend_gemini_env.py](C:\Users\Davide\VS-Code Solutions\Tokenometer\tests\test_spend_gemini_env.py)

## Recommended rollout for your 4 apps

Do not switch all 4 at once.

1. choose the least critical app
2. start with `shadow`
3. verify usage appears correctly in:
   - Home
   - Reports
   - Ledger
   - Gateway recent calls or ingest-driven records
4. move that app to `proxy`
5. keep direct fallback enabled
6. repeat for the next app

## Environment variables for app-side adapters

Use these inside each production app:

```env
AI_METERING_MODE=shadow
TOKENOMETER_BASE_URL=https://www.tokenometer.cloud
TOKENOMETER_INGEST_KEY=...
TOKENOMETER_INGEST_SECRET=...
TOKENOMETER_PROJECT=My App
TOKENOMETER_TEAM=Platform
TOKENOMETER_AGENT=support-bot
TOKENOMETER_OWNER=davide
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
GOOGLE_MODEL=gemini-2.0-flash
```

Notes:

- `TOKENOMETER_INGEST_SECRET` is needed for `shadow`
- `OPENAI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` are needed for `direct`
  and `shadow`
- in `proxy`, the app only needs the Tokenometer ingest key because the provider
  key is vaulted in Tokenometer

## How to test OpenAI spend

From PowerShell in this repo:

```powershell
$env:AI_METERING_MODE="proxy"
$env:TOKENOMETER_BASE_URL="https://www.tokenometer.cloud"
$env:TOKENOMETER_INGEST_KEY="your_ingest_key"
$env:OPENAI_MODEL="gpt-4o-mini"
python .\tests\test_spend_openai_env.py
```

If you want to test `shadow` instead:

```powershell
$env:AI_METERING_MODE="shadow"
$env:TOKENOMETER_BASE_URL="https://www.tokenometer.cloud"
$env:TOKENOMETER_INGEST_KEY="your_ingest_key"
$env:TOKENOMETER_INGEST_SECRET="your_ingest_secret"
$env:OPENAI_API_KEY="your_openai_key"
python .\tests\test_spend_openai_env.py
```

## How to test Gemini spend

```powershell
$env:AI_METERING_MODE="proxy"
$env:TOKENOMETER_BASE_URL="https://www.tokenometer.cloud"
$env:TOKENOMETER_INGEST_KEY="your_ingest_key"
$env:GOOGLE_MODEL="gemini-2.0-flash"
python .\tests\test_spend_gemini_env.py
```

For `shadow` mode:

```powershell
$env:AI_METERING_MODE="shadow"
$env:TOKENOMETER_BASE_URL="https://www.tokenometer.cloud"
$env:TOKENOMETER_INGEST_KEY="your_ingest_key"
$env:TOKENOMETER_INGEST_SECRET="your_ingest_secret"
$env:GOOGLE_GENERATIVE_AI_API_KEY="your_google_key"
python .\tests\test_spend_gemini_env.py
```

## What to verify after each run

Check these pages:

- [https://www.tokenometer.cloud](https://www.tokenometer.cloud)
- [https://www.tokenometer.cloud/reports](https://www.tokenometer.cloud/reports)
- [https://www.tokenometer.cloud/ledger](https://www.tokenometer.cloud/ledger)
- [https://www.tokenometer.cloud/gateway](https://www.tokenometer.cloud/gateway)

You want to see:

- current timestamped usage
- correct provider
- correct model
- token counts
- cost estimates
- project and agent attribution

## Current recommendation for you

For your 4 apps:

- start with one app in `shadow`
- validate the spending surfaces
- move that one app to `proxy`
- keep `allow_direct_fallback = true`

That gets you metering without making Tokenometer a single point of failure too
early.
