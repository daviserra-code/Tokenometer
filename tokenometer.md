# Tokenometer Product Brief

## What Tokenometer Is

Tokenometer is an AI FinOps platform centered on one core idea:

> measure AI usage at call time, not only after the fact.

It sits between an application and model providers, meters real requests, estimates cost, and then organizes that data into wallets, budgets, allocations, approvals, and internal settlement views.

Tokenometer is not a crypto app. In this product, "tokens" means AI model consumption units and provider balances.

## Product Positioning

Today, Tokenometer is best described as:

- a live metering gateway
- an AI spend ledger
- a wallet and controls layer for provider balances
- an internal AI chargeback system in progress

The dashboard matters, but the real product center is the gateway plus the wallet logic behind it.

## Demo and Live Modes

Tokenometer intentionally keeps both modes:

- **Demo mode**
  - shows realistic seeded data
  - stays public and useful for product storytelling
  - lets people understand the shape of the app without needing credentials

- **Live mode**
  - shows real metered, synced, or imported data
  - is admin-oriented
  - is the correct mode for testing real keys and real spend

The demo data remains part of the MVP by design.

## How Tokenometer Measures Usage

Tokenometer now works through three paths.

### 1. Live Metering Gateway

This is the primary path.

Applications send requests to Tokenometer proxy endpoints instead of calling providers directly. Tokenometer forwards the call, reads usage from the provider response, and records:

- provider
- model
- input tokens
- output tokens
- total tokens
- estimated cost
- project
- team
- agent
- source
- timestamp

This is the most reliable path for the product.

### 2. Historical Provider Sync

This is secondary and best understood as reconciliation.

Some providers expose historical usage APIs only with elevated admin keys.

- OpenAI org usage requires an admin key
- Anthropic usage reports require an admin key
- other providers are weaker or more inconsistent for this path

Tokenometer still supports sync where possible, but sync is not the foundation of the product.

### 3. CSV and Billing Import

This remains useful for:

- historical backfill
- provider exports
- invoice reconciliation
- manual migration into the platform

## Security and Admin Foundations

The current production build includes:

- database-backed admin user
- hashed password storage
- login rate limiting
- optional TOTP 2FA
- encrypted provider vault entries
- encrypted ingest secrets
- audit logging for sensitive admin actions
- HTTPS via Nginx and Let's Encrypt
- app container bound to `127.0.0.1:3100` behind reverse proxy

This is solid MVP-grade protection for testing real keys, while still leaving room for future enterprise hardening such as external KMS/Vault backends and richer auth models.

## Gateway Status

The admin-only Gateway page is now a real operational surface, not just a concept.

It includes:

- provider route matrix
- ingest source status
- vaulted provider status
- recent gateway calls
- request IDs
- latency metadata
- streaming support visibility
- Node.js and Python examples
- benchmark guidance

Gateway hardening already includes:

- `X-Request-Id`
- `Server-Timing`
- async metering writes
- streaming support across the supported proxy routes

## Wallet System Status

The wallet system has moved beyond simple balances.

Current wallet capabilities include:

- provider balances
- reserve floors
- reserved balances
- direct top-ups
- transfers
- provider exchange
- approval requests
- budget-aware action gating
- automatic wallet locking when the monthly org budget is exceeded

This means the wallet has become a policy surface, not just a display.

## New Allocation and Chargeback Capabilities

Tokenometer now supports the first real internal AI wallet economy features.

### Project and Team Allocations

Admin users can allocate provider wallet capacity to:

- projects
- teams

Allocations reserve spendable balance and expose a simple downstream view of who has been assigned what.

### Internal Chargeback Statements

Tokenometer can now issue internal monthly usage statements based on:

- allocation scope
- provider
- actual scoped usage

Chargeback issuance is idempotent for the period, so repeated clicks do not create duplicate monthly statements for the same scope/provider/month combination.

### Project Visibility

Projects now surface:

- allocated balance
- remaining balance
- chargeback amount

This makes project pages feel more like operating views and less like passive reports.

## Current Roadmap Phase

Tokenometer is currently in:

**late Phase 2, with an early foothold in Phase 5**

What that means in plain terms:

- **Phase 1 is real**: live metering gateway, vaulting, ledger, budgets, spend views
- **Phase 2 is substantially underway**: wallet semantics, approvals, reserves, allocations, budget locks
- **Phase 5 has started in a narrow internal form**: chargeback statements and internal invoice-like settlement artifacts

What is **not** built yet:

- provider-normalized exchange intelligence as a serious engine
- policy-based model routing
- external credit marketplace or exchange

So the honest answer is:

> Tokenometer is no longer just in the "metering MVP" phase. It is now in the internal wallet-economy phase, with the first settlement mechanics already live.

## Production Notes

Production deployment currently runs:

- on the Hetzner VPS
- in isolated path `/opt/tokenometer`
- with isolated Docker Compose project `tokenometer`
- under:
  - `https://tokenometer.cloud`
  - `https://www.tokenometer.cloud`

`ai-radar` remains separate and untouched.

## Best Next Steps

The strongest next product moves are:

1. project/team sub-wallet UX polish
2. cost center mapping for chargeback
3. provider-normalized value models
4. policy-based routing
5. richer financial statements and export workflows
6. optional external KMS/Vault backend

## Core Principle

Provider sync is optional reconciliation.

Live metering is the engine.

Wallet controls make the engine governable.

Chargeback begins turning it into infrastructure.
