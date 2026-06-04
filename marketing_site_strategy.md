# Tokenometer Marketing Site Strategy

Last updated: 2026-06-04

## Core Decision

Tokenometer should now have **two clearly separated public surfaces**:

1. a **marketing / product site**
2. the **actual Tokenometer app**

The current app should remain intact.

That means:

- keep the current Tokenometer web app as the real operator product
- add a separate product-facing site in front of it
- use the product site to explain, position, and sell Tokenometer

## Recommended Domain Structure

Best recommended structure:

- `tokenometer.cloud` -> marketing site
- `app.tokenometer.cloud` -> real Tokenometer app
- `demo.tokenometer.cloud` -> optional direct demo entry

Possible redirect behavior:

- `www.tokenometer.cloud` -> `tokenometer.cloud`
- `tokenometer.cloud/demo` -> redirects to demo app entry
- `tokenometer.cloud/app` -> redirects to live app entry

## Why This Separation Matters

The current Tokenometer instance is now a strong product app, but it is still primarily:

- an operator tool
- a metering/control-plane app
- an integration and governance surface

That is not the same thing as a good first-contact product site.

A first-time visitor needs answers to different questions:

- What is Tokenometer?
- Why is this needed?
- Why not just use provider dashboards?
- What makes it different?
- Who is it for?
- How do I try it?

The current app can answer some of those, but not gracefully as a public landing experience.

## Product Principle

The app should not be forced to do the job of a marketing homepage.

The product site should:

- explain
- persuade
- orient
- convert

The app should:

- operate
- meter
- attribute
- reconcile
- govern

## What the Marketing Site Should Do

The site should make Tokenometer understandable in under one minute.

It should explain:

- what Tokenometer is
- what problem it solves
- why provider history alone is not enough
- how live metering works
- why integrations matter
- why reconciliation matters
- what users can do in the product

It should not feel like a generic SaaS page full of fluff.

## Positioning Direction

Recommended framing:

> Tokenometer is the operating layer for AI usage.

Supporting framing:

- measure AI spend at call time
- attribute usage across apps, projects, teams, and workflows
- reconcile live metering with provider history
- govern AI usage with budgets, allocations, and approvals

## Primary Audience

The marketing site should speak to:

### 1. AI product builders

Teams shipping apps that call OpenAI, Gemini, Anthropic, DeepSeek, or other model providers.

### 2. AI operations / internal platforms

People managing multiple apps, agents, or internal AI workloads.

### 3. Finance / governance stakeholders

People who need clarity on usage, attribution, and cost control.

### 4. Technical decision-makers

CTOs, engineering leads, or operators who need confidence in how metering actually works.

## Site Goals

The marketing site should:

- introduce the product clearly
- show product maturity
- direct people to Demo or App
- support future commercial positioning
- make Tokenometer feel like a real category product

## Recommended Information Architecture

### 1. Hero

Purpose:

- explain the product in one sentence
- establish the product name strongly
- provide immediate CTA paths

Recommended CTA set:

- `Open Demo`
- `Open App`
- `Book a Walkthrough` or `Get in Touch`

### 2. Problem Section

Purpose:

- explain why provider dashboards are not enough

Themes:

- historical APIs are inconsistent
- admin-key restrictions exist
- attribution is weak
- live app traffic is what matters

### 3. How It Works

Purpose:

- explain the three measurement paths simply

Suggested structure:

- live metering
- provider sync / reconciliation
- CSV/manual backfill

### 4. Product Surfaces

Purpose:

- show the actual working product shape

Suggested highlights:

- Gateway
- Ledger
- Reports
- Integrations
- Wallet / Budgets / Chargeback

### 5. Why It Is Different

Purpose:

- define the moat

Suggested themes:

- live metering first
- integration identity
- metering-path transparency
- reconciliation visibility
- governance built on top of usage

### 6. Who It Is For

Purpose:

- help visitors self-identify

Suggested audiences:

- teams with multiple AI apps
- agencies managing client AI systems
- internal AI platform teams
- AI-heavy ops and finance stakeholders

### 7. Product Proof

Purpose:

- show this is real, not hypothetical

Suggested proof types:

- screenshots
- product flow diagrams
- example providers
- maybe a simplified list of integrated modes/providers

### 8. Final CTA

Purpose:

- convert the visitor cleanly

Suggested actions:

- try the demo
- open the app
- contact / request walkthrough

## Relationship to the Existing App

The current app should remain the source of truth.

The marketing site should not replace it.

That means:

- do not redesign the core app into a landing page
- do not turn the app home into a bloated marketing surface
- do not remove demo mode from the app

Instead:

- let the marketing site route users into the right app entry

## Demo Strategy

Recommended approach:

- keep demo mode inside the real app
- expose it through a clean entry from the marketing site

This means a visitor can:

1. understand the product on the marketing site
2. click into demo mode
3. inspect the real product with seeded data

That is much stronger than a fake static demo page.

## App Entry Strategy

The marketing site should offer:

- `Open Demo`
- `Open App`

Suggested behaviors:

- `Open Demo` -> demo-mode route or demo-focused app entry
- `Open App` -> login or app root

## Design Direction

The marketing site should feel:

- product-led
- clean
- modern
- credible
- technical without being cold

It should not feel:

- like a generic startup template
- like a finance-only dashboard
- like a giant block of text

It should show enough real product imagery to prove that Tokenometer is real.

## Rollout Plan

Recommended order:

### Phase 1

Write strategy and copy.

### Phase 2

Create design brief and structure.

### Phase 3

Build the marketing site while keeping the app untouched.

### Phase 4

Move domain routing cleanly:

- root = marketing
- subdomain = app

### Phase 5

Add later refinements:

- walkthrough CTA
- contact flow
- early pricing framing
- product proof deepening

## Important Constraint

The current production app must stay safe and uninterrupted during this work.

That means:

- the marketing site should be added, not mixed destructively into the current app
- domain moves should be planned carefully
- the current app instance must remain usable

## Recommendation

The correct move now is:

> build a separate marketing site for Tokenometer, keep the current app intact, and treat the app as the operational product behind the new public-facing layer.

## Next Deliverables

Recommended next artifacts:

1. `marketing_site_copy.md`
2. `marketing_site_design.md`
3. implementation plan
4. actual site build
