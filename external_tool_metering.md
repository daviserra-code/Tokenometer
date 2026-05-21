# External Tool Metering

This document defines how Tokenometer should think about metering usage from
tools and environments that are not traditional first-party apps.

Examples:

- Claude Code
- Codex-style developer tools
- open-source coding assistants
- hosted AI chat products
- internal agent shells

The goal is to separate:

1. what Tokenometer can meter well today
2. what it can meter with product work
3. what it can only reconcile after the fact
4. what is probably outside Tokenometer's control

## Core idea

Not every AI surface is equally meterable.

Tokenometer should support 3 metering strategies:

### 1. In-path metering

Tokenometer sits directly in the request path.

This is the strongest version because Tokenometer sees:

- provider
- model
- request metadata
- token usage
- latency
- cost

Use this when the tool allows:

- custom base URL
- gateway URL override
- HTTP proxy or API proxy mode

### 2. Shadow metering

The tool calls the provider directly, then usage is sent to Tokenometer in a
secondary step.

This is weaker than in-path metering, but still useful.

Use this when:

- the tool cannot route through Tokenometer cleanly
- the tool exposes token usage in responses or logs
- a wrapper process can observe usage and post to `/api/ingest`

### 3. Reconciliation metering

Tokenometer imports usage later from:

- provider APIs
- exported CSVs
- billing data
- dashboard-level usage feeds

This is the weakest form, but still valuable.

Use this when:

- Tokenometer cannot sit in the request path
- the tool is hosted by someone else
- the user has no control over transport

## The key classification

Every external tool should be classified into one of these buckets:

### Bucket A: Routable

Tokenometer can become the live transport layer.

Examples:

- tools that support a custom API base URL
- tools that support a gateway mode
- tools that support compatible provider endpoints

This is the best category.

### Bucket B: Observable

Tokenometer cannot become the transport, but usage can be captured by a local
wrapper, log parser, plugin, or shadow sender.

Examples:

- CLIs with usage logs
- local apps with response hooks
- wrappers around provider SDKs

This is the second-best category.

### Bucket C: Reconciliable

Tokenometer cannot observe individual requests but can later import provider or
account usage.

Examples:

- hosted UIs
- managed enterprise dashboards
- cloud tools owned by the provider

Useful, but less exact.

### Bucket D: Opaque

Tokenometer has no practical way to measure usage except rough manual
approximation.

Examples:

- tools with no controllable endpoint
- no usage exports
- no logs
- no provider reporting access

This category should be treated honestly in the product.

## External tool priorities

If Tokenometer is going to expand beyond first-party app integrations, the
priority order should be:

1. Claude Code
2. open-source tools with configurable backends
3. internal developer shells and wrappers
4. hosted AI UIs

Why:

- Claude Code is closest to a serious developer workflow we can possibly route
- open-source tools are often patchable
- internal shells are controllable
- hosted UIs are mostly outside our transport control

## Claude Code

Claude Code is strategically important because it sits close to real production
developer work.

### What makes it attractive

- serious token usage
- repeat usage patterns
- strong user willingness to pay for visibility
- naturally aligned with engineering teams

### What Tokenometer would need

Tokenometer should support a **Claude Code compatibility mode**.

That likely means:

- Anthropic-compatible request and response handling
- streaming-aware metering
- request-id propagation
- clear fallback behavior
- a setup path that feels native to a CLI workflow

### Product direction

The user should not need to think:

> how do I manually bend Claude Code into Tokenometer?

They should be able to think:

> connect Claude Code

That implies:

- a named integration type
- generated setup instructions
- health check
- recent usage feed
- integration-specific docs

## Open-source tools

This is probably the broadest opportunity after Claude Code.

Examples may include:

- open coding agents
- local AI shells
- self-hosted assistant UIs
- backend frameworks that let users override provider endpoints

### Product strategy

Tokenometer should not try to support each project with ad hoc docs forever.

Instead it should define **compatibility patterns**:

- OpenAI-compatible gateway mode
- Anthropic-compatible gateway mode
- Gemini-compatible gateway mode

Then map tools into those patterns.

### Desired onboarding language

Instead of:

> Here is a custom one-off adapter for Tool X

Use:

> Tool X supports OpenAI-compatible backends, so use Tokenometer OpenAI gateway mode

This scales better.

## Hosted AI UIs

Hosted UIs are useful to users, but hard for Tokenometer to meter exactly.

Examples:

- provider-owned chat products
- hosted copilots
- managed agent interfaces

### Hard truth

If the user does not control the transport path, Tokenometer usually cannot do
true request-level in-path metering.

So for hosted UIs, Tokenometer should offer:

- reconciliation import
- usage statement ingestion
- manual or semi-automatic provider mapping
- wallet and reporting visibility

But it should **not pretend** this is equivalent to first-party proxy metering.

## Product surface proposal

Tokenometer should eventually expose a dedicated section:

## External Tools

Each tool integration should show:

- Tool name
- Metering class:
  - Live
  - Shadow
  - Reconciled
  - Unsupported
- Provider family
- Setup difficulty
- Continuity risk
- Status
- Last seen

This is better than leaving users to guess whether a tool is realistically
meterable.

## Suggested integration types

Tokenometer should define explicit integration types like:

- Claude Code
- OpenAI-compatible app
- Anthropic-compatible app
- Gemini-compatible app
- Hosted usage import
- Custom shadow ingest client

These types can share internal logic while presenting a simpler product model.

## Continuity model for external tools

Because many external tools are developer-critical, continuity matters a lot.

Each integration should have a policy like:

### Observe only

- tool continues normally
- Tokenometer sees usage when possible

### Proxy with fallback

- Tokenometer is primary path
- direct provider path is backup

### Strict proxy

- all traffic must pass through Tokenometer
- strongest governance
- highest risk if Tokenometer is unavailable

For most external tools, **proxy with fallback** should be the default.

## Observability requirements

If Tokenometer wants to support external tools seriously, each integration needs:

- request ids
- per-tool activity feed
- provider and model breakdown
- failure and fallback counters
- latency metrics
- last successful meter timestamp

This lets users trust the integration instead of wondering whether it is still
working.

## Commercial value

Why this matters:

If Tokenometer only measures first-party apps, it is valuable.

If Tokenometer also measures:

- code assistants
- agent shells
- developer copilots
- mixed provider tooling

then it becomes much more strategic.

That moves it from:

> app metering dashboard

toward:

> unified control plane for AI work

## Roadmap

### Phase 1

Document the landscape honestly:

- what is live-meterable
- what is shadow-meterable
- what is reconciliation-only

### Phase 2

Build Claude Code compatibility mode.

### Phase 3

Build generic compatibility modes:

- OpenAI-compatible
- Anthropic-compatible
- Gemini-compatible

### Phase 4

Add External Tools UI:

- setup guides
- health view
- usage view
- fallback visibility

### Phase 5

Add hosted UI reconciliation pathways where possible.

## Recommendation

The next product step after first-party app integrations should be:

1. Claude Code
2. generic external tool compatibility
3. hosted UI reconciliation

That keeps Tokenometer grounded in what is most valuable and most realistically
controllable.

## Final stance

Tokenometer should not promise that every AI surface can be metered the same
way.

It should instead become excellent at:

- live metering where transport is controllable
- shadow metering where usage is observable
- reconciliation where only account-level data exists

That honesty will make the product stronger, not weaker.
