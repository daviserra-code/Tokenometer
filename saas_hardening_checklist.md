# Tokenometer SaaS Hardening Checklist

Last updated: 2026-06-08

## Purpose

This checklist turns the commercial deployment strategy into concrete platform work.

It is intentionally focused on the hosted SaaS shape first:

- `tokenometer.cloud` as the marketing surface
- hosted app as the main commercial product
- self-hosted and desktop as secondary offers

## Current reality

Tokenometer already has:

- real live metering
- named integrations
- vaulted provider credentials
- ingest keys and secrets
- wallet, allocation, and chargeback logic
- real production app traffic

That means the next commercial risk is no longer “does the product basically work?”

It is:

- tenant isolation
- security boundaries
- operational reliability
- billing and plan enforcement

## Phase 1: Tenant safety

These are the first non-negotiables before serious multi-customer SaaS rollout.

### 1. Tenant-scoped auth

- every user must belong to an organization explicitly
- admin status must be organization-scoped, not global by convenience
- login/session handling must not let one tenant see another tenant’s data

### 2. Tenant-scoped queries audit

- audit all routes, server actions, and helper functions
- ensure reads and writes always filter by `organizationId`
- remove any “first organization” shortcuts that only exist because the product started single-tenant

### 3. Secret isolation

- provider credentials must be tenant-scoped everywhere
- ingest sources must be tenant-scoped everywhere
- rotation actions must not be callable across tenants
- audit logs must record which tenant and actor touched which secret-bearing object

### 4. Integration isolation

- integrations must only resolve credentials and ingest sources inside the same organization
- request-time lookup paths must not fall back across tenants

## Phase 2: Commercial controls

### 5. Plan model

Define what is limited by plan:

- number of integrations
- number of provider credentials
- number of ingest sources
- data retention window
- finance features
- export features
- assistant/copilot features

### 6. Billing model

Decide how customers pay:

- flat subscription
- usage-based
- hybrid

Tokenometer is likely strongest with:

- base subscription
- optional integration or usage tiers

### 7. Retention and data lifecycle

Define:

- how long live event data is kept by default
- what happens on downgrade
- what happens on account closure

## Phase 3: Operational hardening

### 8. Backups and recovery

- documented Postgres backup cadence
- restore drill
- secret rotation recovery procedure
- deployment rollback procedure

### 9. Observability

- app health checks
- proxy failure rate monitoring
- ingest failure monitoring
- provider sync failure monitoring
- slow query / high-latency alerting

### 10. Rate limiting and abuse prevention

- auth endpoints
- ingest endpoints
- proxy endpoints
- export endpoints

### 11. Audit and compliance posture

- retain meaningful audit logs for credential, ingest, integration, and finance actions
- define what can be exported for customer review
- define what support staff can and cannot inspect

## Phase 4: Customer-facing readiness

### 12. Tenant onboarding

- clean signup path
- first-organization creation
- first-admin bootstrap
- first integration checklist

### 13. Support boundary

Define:

- what hosted customers can self-serve
- what requires support
- what requires enterprise support only

### 14. Docs

At minimum:

- hosted onboarding
- provider setup
- guided test loop
- finance/export interpretation
- self-hosted docs for enterprise

## Immediate next engineering moves

These are the most leverage-heavy next hardening tasks:

1. remove any remaining single-org shortcuts
2. audit server actions for strict organization scoping
3. document the hosted plan model
4. add retention and export policy decisions
5. define rollback and backup procedures clearly

## Summary

Tokenometer is ready for product hardening, not just feature invention.

The main SaaS question now is not:

> can we meter AI usage?

It is:

> can multiple paying customers trust us to isolate, store, explain, and govern their AI operations safely?

This checklist is the path to being able to answer “yes” without bluffing.
