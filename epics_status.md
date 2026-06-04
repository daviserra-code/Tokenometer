# Tokenometer Epics Status

Last updated: 2026-06-04

## Current Product Position

Tokenometer is no longer just a dashboard MVP.

It is now:

- a live AI metering gateway
- a usage ledger
- an integration control plane
- a wallet and governance layer
- an early reconciliation and internal chargeback system

Real app traffic is already flowing through or into Tokenometer from multiple integrated apps.

## Executive Summary

Plainly:

- **Epic 1** is done enough
- **Epic 2** is done enough
- **Epic 3** is strong
- **Epic 4** is strong enough for this phase
- **Epic 5** is in good shape

After those epics, the product gained an additional maturity layer:

- provider capability truth
- metering-path labeling
- reconciliation snapshot logic

That means Tokenometer can now explain:

- how usage was measured
- how trustworthy the measurement path is
- whether provider-side history roughly agrees with live totals

## Epic 1 - Core Metering UX

Status:

- `done enough`

What exists:

- clearer Credentials flow
- clearer Gateway flow
- test vs sync vs live metering made explicit
- provider-aware messaging
- much better first-time understanding of what Tokenometer actually does

Why it matters:

- users can now understand the difference between setup and real metering

## Epic 2 - Spending Verification Loop

Status:

- `done enough`

What exists:

- guided provider tests
- request IDs
- freshness cues
- Ledger and Reports used as real verification surfaces

Why it matters:

- the loop from “send request” to “see spend” is now productized rather than accidental

## Epic 3 - Integration Onboarding

Status:

- `strong`

What exists:

- Gateway onboarding flow
- rollout mode selection
- provider selection
- generated env blocks
- Node and Python snippets
- app setup generator
- app identity-aware setup flow
- DeepSeek and GitHub/Copilot support added

Why it matters:

- Tokenometer can now teach people how to integrate apps, instead of depending on repo-side notes only

## Epic 4 - Integration Object Model and Operational Confidence

Status:

- `strong enough for this phase`

What exists:

- named integrations
- stored integration identity
- linked provider credential
- linked ingest source
- linked project and team ownership
- integration health states
- owner metadata
- runbook metadata
- verification timestamp
- last-seen and status handling

Why it matters:

- integrations are now first-class operational objects, not just inferred traffic

## Epic 5 - Product Coherence

Status:

- `good shape`

What exists:

- Setup hub
- clearer navigation structure
- calmer admin flow
- less duplicated explanation across Credentials, Integrations, and Gateway
- updated manual that reflects the actual current product

Why it matters:

- the web app now feels much more like one product instead of several good ideas stacked together

## Post-Epic Maturity Layer

These are not a separate formal epic, but they are important product maturity work added after the earlier foundation:

### Provider capability matrix

Exists in Credentials.

Shows:

- live metering support
- historical sync reality
- admin-key requirements
- fallback path
- recommended strategy

### Metering-path labels

Exists in:

- Gateway
- Ledger
- Ledger CSV export

Current labels include:

- Proxy captured
- Signed ingest
- Shadow reported
- Provider sync
- CSV import
- Estimated

### Reconciliation snapshot

Exists in Credentials.

Shows, per provider:

- live metering totals
- provider-history totals
- manual backfill totals
- drift amount
- drift percent
- status summary

Current statuses:

- In range
- Drift
- Live only
- History only
- Manual only

Why it matters:

- Tokenometer can now explain confidence, not only measurement

## Real-World Integrations Already Running

Tokenometer is already seeing real traffic from:

- `Shopfloor-Copilot (staging)`
- `AI-Portable (production)`
- `AI-Radar (production)`
- `MachinaOS Demo (production)`

Why this matters:

- the product is no longer validated only by internal test scripts
- Ledger, Gateway, and Reports now have genuine operational meaning

## Current Best Product Description

Tokenometer is currently best described as:

> a live AI usage operating layer that measures, attributes, explains, and governs AI consumption

## What Is Still Ahead

Important work still available:

- surface reconciliation more directly in Reports
- further finance-grade reporting polish
- more real-world integrations
- longer observation windows on production apps
- desktop Phase A polish
- later reconsideration of desktop Phase B
- multi-tenant SaaS hardening if commercial hosted rollout becomes the priority

## Recommended Next Direction

Best near-term move:

- bring reconciliation visibility into **Reports**

Why:

- that is where spend interpretation naturally happens
- it would connect finance confidence with the actual spending views
- it builds directly on the current capability matrix and reconciliation work without disturbing integrations

## One-Sentence Reality Check

Tokenometer is now beyond MVP confusion and into product hardening: the web app is coherent, the integration model is real, and live production metering is already happening.
