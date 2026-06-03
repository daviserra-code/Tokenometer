# Tokenometer Manual

## 1. What Tokenometer Is

Tokenometer is a web app for measuring and governing AI usage.

Its main job is:

> measure tokens and estimated cost as close as possible to the real model call

In practice, Tokenometer helps you:

- meter real AI traffic
- see raw usage events
- attribute usage to apps, projects, teams, agents, and workflows
- compare live metering with provider-side history when available
- organize usage into budgets, wallets, allocations, and chargeback

Primary URL:

- [https://www.tokenometer.cloud](https://www.tokenometer.cloud)

## 2. The Most Important Mental Model

There are **three different ways** usage can arrive in Tokenometer.

### A. Live metering

This is the preferred path.

Your app either:

- sends the request through Tokenometer, or
- calls the provider directly and then sends the usage back to Tokenometer

This is the product’s main truth source.

### B. Provider history

This means usage imported from the provider’s own history endpoints.

Important:

- some providers support this well
- some support it only with admin-level keys
- some barely support it at all

This is mainly for **reconciliation**, not the core engine.

### C. CSV/manual backfill

This is for:

- older data
- manual imports
- provider exports
- historical cleanup

Useful, but not the main path.

## 3. Demo Mode vs Live Mode

### Demo mode

Use Demo mode when you want to:

- present the app
- inspect the UI
- keep the seeded MVP data visible

### Live mode

Use Live mode when you want to:

- vault real keys
- test providers
- wire real apps
- inspect real token spending

## 4. The Pages and What They Are For

## Setup

Page:

- `/setup`

Use it as the orientation hub.

It tells you the control-plane flow:

1. Credentials
2. Integrations
3. Gateway

If you feel lost, start here.

## Credentials

Page:

- `/settings/credentials`

This page is for:

- vaulting provider keys
- running guided provider tests
- running historical sync when supported
- seeing provider capability reality
- seeing reconciliation snapshots

Think of it as:

> provider truth + setup truth

### What the buttons mean

#### Test

Sends one tiny real request.

Use it to answer:

> “Can this key really call the provider?”

#### Sync now

Tries to import provider-side usage history.

Use it to answer:

> “Can this provider expose past usage directly?”

Important: this is often limited by provider rules, not by Tokenometer.

#### Vault credential

Stores the provider key in Tokenometer securely so it can be used for tests, sync, or proxy paths.

## Integrations

Page:

- `/settings/integrations`

This is where an app becomes a first-class object inside Tokenometer.

A named integration stores:

- app identity
- provider
- rollout mode
- project
- team
- environment
- owner
- health
- last seen

Think of it as:

> “This app is real, known, and trackable.”

Examples:

- `Shopfloor-Copilot (staging)`
- `AI-Radar (production)`
- `MachinaOS Demo (production)`

## Gateway

Page:

- `/gateway`

This is the rollout and live-validation surface.

Use it to:

- choose provider
- choose rollout mode
- choose a named integration
- copy env blocks
- copy Python or Node snippets
- inspect recent live calls
- inspect latency, request IDs, and metering path

Think of it as:

> “How do I wire this app, and what is it doing right now?”

## Ledger

Page:

- `/ledger`

This is the raw event view.

Use it to inspect:

- timestamp
- provider
- model
- project
- team
- integration
- workflow
- tokens
- cost
- metering path

Ledger is the best place to answer:

> “Did the event really land?”

## Reports

Page:

- `/reports`

This is the spend view.

Use it for:

- daily view
- weekly view
- monthly view
- CSV and PDF exports

Reports answer:

> “How is spending moving over time?”

## Wallet

Page:

- `/wallet`

This is the control layer around provider balances and governance.

Use it for:

- balances
- reserves
- allocations
- approvals
- transfers
- exchanges
- chargeback

This matters, but it is not the first place to go when validating a new app integration.

## 5. The Current Recommended Workflow

If you are wiring a real app, this is the clean path:

1. Go to **Credentials**
2. Vault the provider key
3. Create or confirm an **Ingest source**
4. Create a **Named integration**
5. Go to **Gateway**
6. Choose provider + rollout mode + integration
7. Copy the env block or adapter
8. Trigger real app traffic
9. Verify in:
   - Gateway
   - Ledger
   - Reports

## 6. The Rollout Modes

Tokenometer uses three rollout modes.

### Observe only

The app still calls the provider directly.

Then it reports usage back to Tokenometer afterward.

Use this when:

- the app is already in production
- continuity matters a lot
- you want the safest first rollout

This is how we integrated your sensitive production apps first.

### Observe + fallback

Tokenometer becomes the preferred path, but the app can still fall back.

Use this when:

- you want stronger control
- but still want continuity protection

### Enforce

Tokenometer becomes the actual request path.

Use this when:

- you trust the integration
- you want stronger control and cleaner metering

## 7. What the New Metering Labels Mean

You now see metering-path labels in Ledger and Gateway.

### Proxy captured

The request passed through Tokenometer directly.

Best confidence.

### Signed ingest

The app made the provider call itself, then sent the usage back to Tokenometer through the ingest API.

Also strong confidence.

### Shadow reported

Very similar spirit to signed ingest: provider call happens in-app, usage is then reported back.

### Provider sync

Usage was imported from the provider’s own historical or sync path.

Useful for reconciliation, but not the core live truth.

### CSV import

Usage came from a manual file import.

### Estimated

Tokens were estimated rather than returned directly by the provider.

Lower confidence than provider-returned usage.

## 8. What the New Reconciliation Section Means

On **Credentials**, there is now a **Reconciliation snapshot**.

This compares, per provider:

- live metering totals
- provider-history totals
- manual backfill totals

It gives you statuses like:

### In range

Live metering and provider history are close enough for the selected time window.

Good sign.

### Drift

There is a meaningful mismatch between live totals and provider-history totals.

This does **not** automatically mean Tokenometer is wrong.

Possible reasons:

- provider history is delayed
- imported history covers a different scope
- live metering saw app-level traffic that provider history groups differently
- sync/import has gaps

### Live only

Tokenometer has live traffic, but no provider-history rows for that provider in the current window.

Usually fine.

This often means:

- no admin key
- no useful provider-history API
- sync has not been run

### History only

Provider-history rows exist, but Tokenometer did not see matching live traffic in the same window.

This deserves inspection.

### Manual only

Only CSV/manual backfill exists in that window.

## 9. Provider Reality, Plainly

This is the key product truth:

- **live metering is the main truth source**
- **provider history is reconciliation**

Why?

Because providers differ a lot.

Examples:

- OpenAI: live usage is good, historical org usage often needs admin access
- Anthropic: same story
- Gemini: live usage is good, historical direct usage is weaker
- DeepSeek: live usage is good, exports are available but not the same as rich admin history

So Tokenometer is built to be strongest when it meters the real app traffic itself.

## 10. Real Apps Already Integrated

At this point, Tokenometer is already seeing real traffic from apps such as:

- `Shopfloor-Copilot (staging)`
- `AI-Portable (production)`
- `AI-Radar (production)`
- `MachinaOS Demo (production)`

That is why Ledger, Gateway, and Reports are becoming much more meaningful now.

## 11. If You Feel Lost, Use This Rule

If your question is:

### “Can the provider key work?”

Go to:

- **Credentials**

### “Is this app wired correctly?”

Go to:

- **Gateway**

### “Did the event really land?”

Go to:

- **Ledger**

### “Is spend increasing over time?”

Go to:

- **Reports**

### “Why do live totals and provider totals differ?”

Go to:

- **Credentials -> Reconciliation snapshot**

## 12. The Simplest Practical Loop

When in doubt, do this:

1. pick one app integration
2. open **Gateway**
3. filter to that integration
4. trigger one real workflow
5. open **Ledger**
6. confirm provider, model, tokens, project, integration, and metering path
7. open **Reports**
8. confirm the spend shows up in the right period

That is the clearest way to validate Tokenometer today.

## 13. Final Product Principle

Tokenometer is not just:

- a dashboard
- or a key vault
- or a billing import tool

It is becoming:

> the operating layer that measures, attributes, explains, and governs AI consumption

If you only remember one thing, remember this:

> **Credentials explains the provider reality.  
> Gateway validates the app wiring.  
> Ledger proves the event.  
> Reports show the spend.**
