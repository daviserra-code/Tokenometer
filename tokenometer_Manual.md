# Tokenometer Manual

## 1. Introduction

Tokenometer is an AI FinOps web app for measuring, organizing, and governing AI usage.

Its core job is simple:

> record AI token usage and estimated cost as close as possible to the real model call

Tokenometer is not a crypto product. In this app, "tokens" means AI model consumption units from providers such as OpenAI, Anthropic, Google, Mistral, DeepSeek, and GitHub Models.

Today, Tokenometer combines four product roles:

- a live metering gateway
- a usage ledger
- a wallet and budget controls layer
- an early internal chargeback and settlement system

Primary production URL:

- [https://www.tokenometer.cloud](https://www.tokenometer.cloud)

## 2. What Problem It Solves

Most AI products show usage only after the fact, often only through provider dashboards.

That creates predictable problems:

- historical APIs are inconsistent
- some providers require admin keys for usage export
- spend is hard to attribute to projects, teams, bots, or workflows
- usage may be visible without being governable

Tokenometer solves this by becoming the measurement and control layer between your apps and the model providers.

## 3. Core Product Idea

The cleanest version of Tokenometer works like this:

1. your app sends an AI request to Tokenometer
2. Tokenometer forwards the request to the provider
3. the provider returns the result and token usage
4. Tokenometer records the event immediately
5. Tokenometer turns that event into spend, reporting, budgets, wallet logic, and internal accountability

That is called **live metering**.

Live metering is the main engine of the product.

## 4. Demo Mode and Live Mode

Tokenometer intentionally supports two modes.

### Demo mode

Demo mode exists to show the product shape with seeded, realistic-looking data.

Use it when you want to:

- show the product to someone
- inspect the UI without setup
- keep the MVP visually rich before real integrations are connected

### Live mode

Live mode is for real usage.

Use it when you want to:

- vault real provider keys
- run guided tests
- meter real app traffic
- review actual spend
- use wallet, allocation, and chargeback features with real data

## 5. The Three Measurement Paths

Tokenometer can record usage in three different ways.

### A. Live metering gateway

This is the preferred path.

The app routes AI calls through Tokenometer proxy endpoints such as:

- `/api/proxy/openai/chat/completions`
- `/api/proxy/anthropic/v1/messages`
- `/api/proxy/google/v1beta/models/...`

This gives the strongest result because Tokenometer sees the request as it happens.

### B. Shadow ingest

In shadow mode, the app still talks directly to the provider, but then sends a signed usage event back to Tokenometer through:

- `/api/ingest`

This is useful when you want a safer first rollout without changing the live request path immediately.

### C. Historical sync or CSV import

This is strategically secondary, but still useful.

Use it for:

- importing older usage
- reconciling against provider data
- backfilling historical records

Important: this depends on provider support, and some providers require elevated admin keys.

## 6. Main Concepts

### Provider credential

A vaulted API key for a provider such as OpenAI or Anthropic.

Tokenometer stores these encrypted and uses them for testing, syncing, or proxying.

### Ingest source

A Tokenometer-side source identity made of:

- an ingest key
- an HMAC signing secret

This is used to authenticate apps or services sending usage into Tokenometer.

### Named integration

A first-class app identity inside Tokenometer.

A named integration can define:

- provider
- rollout mode
- linked credential
- linked ingest source
- project
- team
- environment
- agent name
- owner
- status and freshness

This is the bridge from onboarding into operational confidence. It turns observed app traffic into a stored product object.

### Wallet

A provider-level operating balance used inside Tokenometer.

Wallets are not external bank accounts. They are internal control objects used to model spendable capacity, reserves, approvals, and policy.

### Allocation

A reserved portion of a provider wallet assigned to a project or team.

### Chargeback

An internal usage statement that shows who consumed AI value and from which provider.

## 7. Main Areas of the Product

### Setup

Purpose:

- explain the control-plane flow
- show current readiness
- route you to the right surface

### Dashboard

Purpose:

- show top-line status
- show freshness of usage data
- summarize recent activity

### Settings -> Credentials

Purpose:

- vault provider keys
- run guided provider tests
- run historical sync where supported
- generate setup context for a selected provider and rollout mode

### Settings -> Ingest

Purpose:

- create ingest sources
- rotate ingest secrets
- obtain `X-Ingest-Key`
- understand signed shadow ingest

### Settings -> Integrations

Purpose:

- create named integrations
- link them to provider credentials and ingest sources
- assign project and team ownership
- review health, freshness, and status

### Gateway

Purpose:

- choose provider
- choose rollout mode
- generate env blocks
- generate Node and Python snippets
- inspect recent live traffic
- inspect request IDs and latency
- inspect selected integration health

### Ledger

Purpose:

- inspect raw usage events
- confirm request timestamps
- confirm provider and model attribution

### Reports

Purpose:

- review spend in daily, weekly, and monthly views
- compare live traffic with current reporting windows

### Wallet

Purpose:

- manage provider balances
- transfer, top up, and exchange balances
- watch budget guardrails
- review allocations and chargeback summaries

## 8. Recommended First Workflow

This is the best first-time path through the product.

### Step 1: Log in as admin

Use the admin login flow and 2FA if enabled.

### Step 2: Vault one provider key

Go to:

- `/settings/credentials`

Start with one easy provider, usually OpenAI, Gemini, or DeepSeek.

### Step 3: Confirm one ingest source exists

Go to:

- `/settings/ingest`

Make sure there is at least one active ingest source.

### Step 4: Create a named integration

Go to:

- `/settings/integrations`

Create a named integration for the real app you want to wire.

### Step 5: Run a guided provider test

Back on Credentials, click **Test** on a vaulted provider credential.

This sends one tiny real request and proves the pipeline works end to end.

### Step 6: Use the generated env block

Open:

- `/gateway`

Pick:

- provider
- rollout mode
- optional named integration

Then copy the env block and the Node or Python snippet.

### Step 7: Verify the result

Check:

- Gateway
- Ledger
- Reports

You should see a fresh request and current timestamp.

## 9. Rollout Modes

Tokenometer currently presents three rollout modes in product language.

### Observe only

Meaning:

- app calls provider directly
- app sends signed usage to Tokenometer afterward

Best for:

- first production validation
- low-risk rollout

### Observe + fallback

Meaning:

- app prefers Tokenometer proxy
- app can still fall back to direct provider access if needed

Best for:

- continuity-sensitive production rollout

### Enforce through Tokenometer

Meaning:

- measured traffic must pass through Tokenometer
- app can rely more on vaulted provider credentials

Best for:

- mature production flow after confidence is established

## 10. Integration Health

Named integrations now have health evaluation.

Possible states include:

- `Healthy`
- `Needs attention`
- `Stale`
- `Needs fixing`
- `Paused`

Health is based on factors such as:

- whether a usable credential exists
- whether a usable ingest source exists
- whether observe mode has a signing secret
- whether the integration has recent traffic
- whether project and team mappings are coherent
- whether ownership and runbook metadata exist

This helps answer:

> Is this app integration ready, drifting, stale, or broken?

## 11. Wallet, Budgets, and Allocations

Once usage is being measured, Tokenometer can govern it.

### Wallets

Wallets support:

- provider balances
- reserve floors
- reserved balances
- outgoing locks
- top-ups
- transfers
- exchange actions
- approval requests

### Budget guardrails

Budgets are not just visual warnings.

Depending on status, they can:

- require approvals
- restrict transfer behavior
- pause exchange behavior
- auto-lock wallets

### Allocations

Allocations let you reserve provider wallet capacity for:

- projects
- teams

This makes downstream spend more explainable and governable.

## 12. Chargeback and Internal Settlement

Tokenometer can generate internal monthly usage statements.

These statements help answer:

- which project consumed what
- which team should be accountable
- which provider carried the spend
- what the estimated cost was

This is internal chargeback, not external payment processing.

## 13. Security Model

The current production product includes:

- admin authentication
- hashed admin password storage
- optional TOTP 2FA
- rate limiting
- encrypted provider credentials
- encrypted ingest secrets
- audit logs
- HTTPS behind Nginx

For MVP and internal production testing, this is a solid base.

For future enterprise-grade hardening, likely next steps include:

- richer user auth models
- stronger rotation workflows
- external KMS or Vault backends
- more detailed integration event history

## 14. Current Product Phase

Plainly:

- Epic 1 is done enough
- Epic 2 is done enough
- Epic 3 is strong
- Epic 4 is complete enough for this phase
- Epic 5 is underway

Product-wise, Tokenometer is already beyond dashboard MVP.

It is now:

- a metering system
- a control layer
- a wallet layer
- an early internal settlement layer

## 15. Best Way to Think About Tokenometer

The cleanest mental model is this:

### Tokenometer is the operating system for AI spend.

It does three big things:

1. **measures** usage
2. **organizes** usage
3. **governs** usage

If you remember only one sentence from this manual, make it this:

> provider sync is helpful, but live metering is the engine
