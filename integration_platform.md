# Tokenometer Integration Platform

This document reframes Tokenometer integrations from an operator toolkit into a
sellable product surface.

## Current truth

Today, Tokenometer integrations are workable but still too manual.

What exists now is good for:

- internal use
- technical founders
- careful design partners
- custom onboarding

What it is **not** yet is:

- self-serve
- low-friction
- easy for non-expert engineering teams
- easy for agencies or platform teams to deploy at scale

So the current integration layer should be treated as:

> proof of architecture, not final product form

## Product goal

Tokenometer should become:

> Add metering, attribution, and AI spend controls to your app in 10 minutes.

That is a very different experience from:

> read a long guide, choose a mode, wire headers, understand HMAC, and manage fallback logic yourself

## Productized integration thesis

The integration experience should evolve into 3 layers:

1. **Hosted SDKs**
2. **In-app onboarding and code generation**
3. **Managed runtime policies**

## 1. Hosted SDKs

The current example adapters should become real supported packages.

### Node / TypeScript

- `@tokenometer/sdk`
- `@tokenometer/openai`
- `@tokenometer/anthropic`
- `@tokenometer/google`

### Python

- `tokenometer`
- `tokenometer-openai`
- `tokenometer-anthropic`
- `tokenometer-google`

### Desired developer experience

Instead of shipping example files, the user installs a package and writes:

```ts
import { wrapOpenAI } from "@tokenometer/openai";

const client = wrapOpenAI({
  mode: "observe",
  project: "Customer Support",
  agent: "support-bot",
});
```

or:

```python
from tokenometer import wrap_anthropic

client = wrap_anthropic(
    mode="proxy",
    project="Support",
    agent="claude-bot",
)
```

That is the level of simplicity the product should aim for.

## 2. Product integration modes

The current terms `direct`, `shadow`, and `proxy` are technically accurate.
But they are not ideal product language.

They should be turned into clearer user-facing modes.

### Suggested product names

#### `Observe only`

- provider remains the active request path
- Tokenometer receives usage after the fact
- safest onboarding mode

Current internal equivalent: `shadow`

#### `Observe + fallback`

- Tokenometer proxy is primary
- direct provider fallback is automatic
- best default for production

Current internal equivalent: `proxy` with fail-open

#### `Enforce through Tokenometer`

- all traffic must pass through Tokenometer
- no direct fallback
- highest control, highest coupling

Current internal equivalent: strict proxy mode

This change matters because product language should reduce cognitive load.

## 3. In-app onboarding

The app should generate integrations instead of making users assemble them.

### Inputs the user should choose in UI

- provider:
  - OpenAI
  - Claude
  - Gemini
  - Mistral
  - GitHub Models
- language:
  - Node
  - Python
- mode:
  - Observe only
  - Observe + fallback
  - Enforce through Tokenometer
- app name
- project name
- agent name
- environment:
  - local
  - staging
  - production

### Outputs Tokenometer should generate

- install command
- environment variables
- code snippet
- rollout checklist
- verification checklist
- fallback behavior summary

This should all be rendered directly in the app, not buried in docs.

## 4. Integration architecture for scale

If the product becomes sellable, integrations should have a consistent internal
shape across providers.

### Core adapter contract

Every SDK should expose the same primitives:

- `mode`
- `project`
- `team`
- `agent`
- `owner`
- `request_id`
- `provider metadata`
- `fallback policy`

### Provider-specific plugin layer

Then each provider integration implements:

- request shape mapping
- response usage extraction
- streaming handling
- error normalization

This keeps the public API stable even when provider APIs differ.

## 5. Streaming must become first-class

For a sellable metering product, streaming support cannot feel secondary.

The integration platform should treat streaming as a first-class path for:

- OpenAI
- Anthropic
- Mistral
- later Gemini when supported in the product runtime

This means SDKs should:

- preserve streamed output
- attach request ids
- finalize metering after stream completion
- expose metering state if needed

## 6. Secret model must become simpler

The current distinction between:

- ingest key
- ingest secret
- vaulted provider key

is architecturally sound, but too complex for a broader market if exposed
without abstraction.

### Product direction

For most users, onboarding should look like:

1. connect provider
2. create app integration
3. copy one token
4. paste into app env

Under the hood Tokenometer can still manage:

- proxy auth
- ingest auth
- provider vaulting
- rotation

But the external experience should feel like one coherent integration object.

## 7. Integrations should become named app connections

Instead of talking only about raw keys, Tokenometer should let users create:

- Integration: `Support App Production`
- Integration: `Backoffice Agent Staging`
- Integration: `Claude Inbox Worker`

Each integration object should have:

- provider
- mode
- env token
- project/team attribution defaults
- allowed domains or services
- last seen
- status
- fallback enabled or disabled

This is a much more productizable abstraction than “here is your ingest key.”

## 8. Rollout UX should become guided

The product should guide users through a rollout ladder.

### Step 1

Connect provider key

### Step 2

Create integration

### Step 3

Choose mode:

- Observe only
- Observe + fallback
- Enforce through Tokenometer

### Step 4

Copy generated snippet

### Step 5

Run validation request

### Step 6

Confirm spend appears in:

- dashboard
- ledger
- provider route health
- reports

This should feel like onboarding, not infrastructure assembly.

## 9. Enterprise and agency angle

If Tokenometer becomes sellable, agency and platform-team use cases matter a lot.

That means integrations should support:

- multiple environments
- multiple apps
- key rotation
- scoped access
- auditability
- app-level health status
- app-level metering isolation

So the long-term object model should likely become:

- Workspace
- Provider connection
- App integration
- Environment token
- Metering policy

## 10. Pricing implications

A more packaged integration layer also improves pricing clarity.

Possible pricing levers:

- number of connected providers
- number of app integrations
- metered requests
- streaming request volume
- advanced controls:
  - fallback rules
  - routing
  - budgets
  - chargeback

This is easier to monetize than a pile of loose scripts.

## 11. Roadmap proposal

### Phase A - Clean operator kit

Improve what already exists:

- rotate exposed test secrets
- add Claude test scripts
- normalize adapter conventions
- improve docs

### Phase B - SDK alpha

Build first supported packages:

- Node OpenAI
- Node Anthropic
- Python OpenAI
- Python Anthropic

### Phase C - In-app integration generator

Build UI that outputs:

- env blocks
- snippets
- rollout instructions
- validation checklist

### Phase D - Named integrations

Introduce:

- app integrations
- environment tokens
- integration health
- rotation UI

### Phase E - Managed policies

Add product features for:

- fallback strategy
- retry policy
- routing policy
- budget policy
- enforcement mode

## 12. What should happen next

The best next move is not more docs alone.

The best next move is to design and implement:

1. an **Integration** domain model
2. a first **SDK-like wrapper surface**
3. an **in-app integration generator**

Those 3 together are the bridge from “technical integration pack” to “sellable
product.”

## Final judgment

The current approach is good enough to validate the core idea.

It is **not yet the experience of a polished product**.

That is normal.

What matters is that the path is now visible:

- today: examples and guided operator setup
- next: supported SDKs and generated onboarding
- later: integration platform as a first-class product surface
