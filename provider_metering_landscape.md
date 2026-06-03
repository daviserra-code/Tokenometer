# Provider Metering Landscape

## Why this matters

Tokenometer needs to measure AI usage even when providers do not expose a clean,
historical, account-wide usage API.

There are two different realities to keep separate:

1. **Per-call metering**
   A provider returns token usage in the response of a single API call.

2. **Historical/account metering**
   A provider exposes dashboards, exports, or usage APIs for past usage across
   keys, projects, or organizations.

Many providers are decent at the first and weak, restricted, or inconsistent at
the second.

That is why Tokenometer must stay **metering-first**, not **provider-report-first**.

---

## The core rule

**Provider-side history is reconciliation.**

**Live metering from real requests is the primary source of truth.**

That means:

- when a provider returns usage in the response, Tokenometer should capture it
  immediately
- when a provider exposes historical billing or usage APIs, Tokenometer should
  use them as backfill, audit, or finance support
- when a provider exposes neither well, Tokenometer must rely on proxy,
  shadow-ingest, or estimation

---

## Current landscape

| Provider | Per-call usage returned | Historical usage access | Main limitation | Best Tokenometer strategy |
|---|---|---|---|---|
| OpenAI | Yes | Yes, but admin usage needs admin-level keying | normal app keys can call models but not always read org-wide history | meter live from responses, use provider history only as reconciliation |
| Anthropic | Yes | Yes, but admin usage report needs admin key | same split between app keys and org-level history | meter live from responses, import admin report when available |
| Gemini | Yes | weaker direct account-history story | no equally clean public org-wide usage API in the docs we reviewed | meter live from response metadata, use Google billing export if on GCP/Vertex |
| Mistral | Yes | partial dashboard/admin visibility | centralized programmatic history is weaker than per-call usage | meter live, reconcile with workspace/admin reporting |
| DeepSeek | Yes | dashboard export / usage visibility | less enterprise-grade historical API shape | meter live, import/export as needed |
| GitHub Models | Mixed | billing/usage reporting exists | with BYOK, visibility shifts to the underlying provider | meter through GitHub when GitHub bills; otherwise meter through provider or Tokenometer |
| Local / Ollama / OSS | usually no external billing source | none | no provider-side truth source | self-meter in app/gateway; estimate only if necessary |

---

## Provider notes

### OpenAI

**What works**

- per-call responses include usage
- streaming can also expose usage
- dashboard and historical usage tools exist

**What breaks**

- historical organization usage is tied to admin-level access, not ordinary app
  key usage

**Tokenometer strategy**

- treat OpenAI response usage as the first source of truth
- use Admin Usage APIs or dashboard exports only for reconciliation
- separate projects, integrations, and environments clearly to reduce ambiguity

### Anthropic

**What works**

- per-call usage is returned in normal responses
- historical usage reporting exists for admin scenarios

**What breaks**

- app keys and org-level reporting capabilities are not the same thing

**Tokenometer strategy**

- meter live from response usage
- import admin usage reports if the customer has that access

### Gemini

**What works**

- response metadata includes token usage information
- this is enough for reliable live metering

**What breaks**

- the public Gemini-side story for historical org-wide usage is not as clean as
  OpenAI or Anthropic

**Tokenometer strategy**

- meter live from `usageMetadata`
- when the customer uses Gemini through Google Cloud / Vertex, rely on Cloud
  Billing export for reconciliation

### Mistral

**What works**

- response usage is available
- some admin/workspace-level monitoring exists

**What breaks**

- historical and finance-grade centralized usage access is not always as
  polished as the per-call path

**Tokenometer strategy**

- meter every request live
- use workspace reporting as a secondary check

### DeepSeek

**What works**

- response usage is available
- dashboard/API-key-level usage visibility exists

**What breaks**

- historical reporting is less standardized for enterprise-style finance flows

**Tokenometer strategy**

- meter live from every request
- use exports or dashboard data for validation

### GitHub Models / Copilot

**What works**

- GitHub has billing and usage visibility for GitHub-billed model usage

**What breaks**

- if the user brings their own provider key, cost visibility belongs to the
  underlying provider, not GitHub

**Tokenometer strategy**

- if GitHub is the biller, reconcile with GitHub reporting
- if BYOK is used, meter via provider response or Tokenometer integration path

### Local models / Ollama / open-source runtimes

**What works**

- full control over the request path

**What breaks**

- no provider billing truth exists
- some frameworks do not return token usage directly

**Tokenometer strategy**

- self-meter at the gateway or adapter layer
- estimate token counts when runtime does not return them
- be explicit when a count is estimated instead of provider-returned

---

## Workaround hierarchy

This is the recommended order of reliability.

### 1. Live metering from provider responses

Best option.

Capture:

- provider
- model
- input tokens
- output tokens
- total tokens
- estimated cost
- request metadata

This is the strongest path because it is:

- immediate
- provider-authentic
- integration-friendly
- independent of billing dashboard limitations

### 2. Shadow metering

App calls the provider directly, then sends a signed usage event to Tokenometer.

Best when:

- continuity is critical
- rollout risk must stay low
- production apps cannot immediately move behind the gateway

### 3. Proxy metering

App routes calls through Tokenometer first.

Best when:

- you want strongest control
- you want consistent metadata attachment
- you want integration governance and future routing policies

### 4. Historical import / reconciliation

Use:

- admin APIs
- billing exports
- CSV exports
- dashboard-derived finance data

Best when:

- filling gaps
- validating finance numbers
- rebuilding past periods

### 5. Token estimation

Fallback only.

Useful when:

- provider does not return usage
- local models are involved
- external tool integration is partially opaque

This should always be labeled internally as **estimated**, not **provider-reported**.

---

## Product implications for Tokenometer

Tokenometer should support all of these modes:

1. **Live in-path metering**
2. **Shadow metering**
3. **Historical reconciliation**
4. **Estimated usage fallback**

But the product should be positioned around this sentence:

> Tokenometer measures spend best when it sees real requests in real time.

That keeps the product honest.

---

## Recommended product stance

### What we should say

- Tokenometer is a live AI metering and control plane
- provider history is optional reconciliation
- some providers restrict org-wide historical usage access
- Tokenometer works around that by metering real app traffic directly

### What we should avoid saying

- that every provider exposes equally good historical usage APIs
- that provider-side dashboards are enough on their own
- that admin-key-based historical usage is the primary model

---

## Bottom line

The provider landscape is uneven.

That is not a reason to weaken Tokenometer.
It is the reason Tokenometer exists.

If the product depends only on provider-side historical reporting, it inherits:

- admin-key restrictions
- missing APIs
- delayed data
- inconsistent provider behavior

If the product meters each real call as it happens, it owns the operational
truth and uses provider history only to reconcile, validate, and enrich it.

That is the correct architecture and the correct product story.
