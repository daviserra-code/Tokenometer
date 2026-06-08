# Tokenometer Commercial Deployment Strategy

## Purpose

This document defines how Tokenometer should be packaged, hosted, sold, and deployed as a real product.

The goal is to avoid drifting into three half-products at once:

- a hosted SaaS
- a self-hosted installable platform
- a desktop MSI application

Tokenometer can eventually support all three, but they are not equal in priority.

## Recommended product shape

Tokenometer should be offered in three layers:

1. hosted web app as the primary commercial product
2. self-hosted edition as a premium / enterprise option
3. desktop MSI as a companion product, not the core commercial form

This is the most coherent model for both revenue and product development.

## Core recommendation

### Primary product: hosted SaaS web app

This should be the default product that most customers buy.

In this model:

- Tokenometer is hosted by us
- customers log into a shared cloud product
- each customer manages their own:
  - integrations
  - provider credentials
  - ingest keys
  - projects
  - teams
  - budgets
  - reports
  - wallet / chargeback logic

This is the cleanest go-to-market path because it gives:

- lowest onboarding friction
- recurring subscription revenue
- centralized updates
- centralized support
- faster product iteration
- better visibility into customer adoption

This should be the default public offer.

### Secondary product: self-hosted edition

This should exist, but it should not be the first thing every customer is asked to do.

In this model:

- customers deploy Tokenometer on their own infrastructure
- they manage their own:
  - VPS or cloud environment
  - database
  - secrets
  - backups
  - network and TLS
  - upgrade process

This option is important for:

- privacy-sensitive teams
- regulated customers
- enterprise IT departments
- organizations unwilling to store API keys in a third-party cloud

This should be positioned as:

- Enterprise
- Private deployment
- Self-hosted edition

### Third product layer: desktop MSI companion

The MSI should not be the main commercial packaging of Tokenometer.

It should be positioned as a companion application that helps with:

- local integrations
- developer tool metering
- secure local secret handling
- local bridge / proxy behavior
- external tool support such as CLI and desktop AI tooling

The desktop app is strategically useful, but it should extend the web product rather than replace it.

## What Tokenometer should not become first

### Not MSI-first

Tokenometer should not be sold primarily as:

"download the MSI and manage everything yourself"

Reasons:

- too much onboarding friction
- weak upgrade control
- harder support
- harder analytics
- higher customer setup burden

The MSI can be valuable, but not as the default commercial form.

### Not self-host-everything-first

Tokenometer should not require every customer to deploy their own VPS before they can use the product.

Reasons:

- slower adoption
- less product control
- weaker sales funnel
- more deployment variability
- harder support burden

Self-hosting is valuable, but should be an option, not the default.

### Not one dedicated server per small customer

We should avoid an early model where every small customer gets a manually managed single-tenant instance.

Reasons:

- operationally expensive
- brittle
- hard to scale
- slows down product iteration

Single-tenant hosting may later exist for premium customers, but it should not become the standard operating model for the early commercial product.

## Recommended commercial structure

### Offer 1: Hosted SaaS

This is the main product.

Possible packaging:

- Starter
- Team
- Business

Likely characteristics:

- managed cloud hosting
- recurring monthly or annual fee
- usage-based or integration-based pricing
- support tiers

### Offer 2: Self-hosted / Private deployment

This is the premium offer.

Possible packaging:

- Enterprise
- Private Cloud
- On-Prem

Likely characteristics:

- higher annual contract value
- deployment support
- controlled upgrade path
- optional SLA
- customer-managed infrastructure

### Offer 3: Desktop companion

This is a supporting offer.

Possible packaging:

- free companion for hosted customers
- included in paid plans
- enterprise desktop bridge

Likely characteristics:

- local bridge for developer tools
- local secure store
- local agent or proxy support
- sync to hosted control plane or self-hosted control plane

## Strategic product framing

Tokenometer should be presented primarily as:

"the control plane for AI usage, spend, and integrations"

The hosted web app is the control plane.

The self-hosted edition is the private version of that control plane.

The MSI is a local edge tool that connects external tools and local environments back to that control plane.

## Near-term business recommendation

### Phase 1

Sell Tokenometer as a hosted web app.

This is the fastest way to:

- prove demand
- learn onboarding pain points
- improve product velocity
- establish recurring revenue

### Phase 2

Offer self-hosted deployment for customers who require it.

This should happen once:

- tenant boundaries are solid
- deployment docs are stable
- upgrade flow is reliable
- secrets and auth are hardened

### Phase 3

Expand the desktop app into a serious companion for:

- local AI tools
- developer workflows
- external tool metering
- private local bridging

## Technical implications of this strategy

### If hosted SaaS is the primary product

We must strengthen:

- tenant isolation
- tenant-aware authentication
- tenant-scoped integrations
- tenant-scoped secrets
- tenant-scoped ingest sources
- billing and subscription logic
- audit visibility
- admin boundaries

This is the most important architectural consequence.

### If self-hosted is an enterprise option

We must provide:

- reliable Docker / Compose deployment
- clean environment configuration
- upgrade instructions
- backup / restore guidance
- secret management expectations
- production hardening checklist

### If desktop is a companion

We must design for:

- local secure storage
- local tool adapters
- proxy or bridge modes
- sync with hosted or self-hosted control plane
- versioned desktop update path

## Commercial decision summary

### Recommended default

Hosted SaaS web app

### Recommended premium option

Self-hosted / private deployment

### Recommended companion

Desktop MSI

## Clear answer to the deployment question

Yes, the likely long-term model is:

- we host a multi-customer Tokenometer SaaS
- customers pay a recurring fee
- each customer manages their own integrations and API keys inside their tenant

But this should only happen after multi-tenant isolation and secret handling are hardened enough.

At the same time:

- some customers should be able to deploy Tokenometer on their own VPS or internal infrastructure
- the MSI should help with local tool integrations, not replace the main product

## Final recommendation

Tokenometer should be commercialized as:

1. a hosted SaaS web app first
2. a self-hosted enterprise option second
3. a desktop companion third

This keeps the product coherent, scalable, and commercially credible.

It also matches the current product reality:

- the web app is already the strongest product surface
- the self-hosted path is strategically important
- the desktop app is promising, but should remain a supporting layer for now

## Follow-up

See also:

- [saas_hardening_checklist.md](C:\Users\Davide\VS-Code Solutions\Tokenometer\saas_hardening_checklist.md)

That checklist turns this strategy into concrete product and platform hardening work.
