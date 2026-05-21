# Web App Epics Before Phase B

This document defines the web app work that should be completed before starting
Desktop Phase B.

The decision behind this roadmap is simple:

> the web app remains the primary product

So before adding desktop-side complexity such as local bridges, local secret
storage, and background helpers, the hosted Tokenometer product should feel
clear, trustworthy, and operationally coherent.

## Goal

Stabilize the web product enough that Desktop Phase B becomes:

- targeted
- useful
- low-regret

instead of:

- premature
- sprawling
- built around product flows that are still moving

## Core principle

Desktop Phase B should extend a stable web control plane.

That means the hosted web app should already be strong at:

- metering
- visibility
- attribution
- integration onboarding
- admin confidence
- product clarity

## Recommended epic order

1. Core metering UX
2. Spending verification loop
3. Integration onboarding
4. Integration object model and security confidence
5. Product coherence and navigation tightening
6. Desktop Phase A polish
7. Re-evaluate Phase B scope

## Epic 1 - Core metering UX

### Why it matters

This is the engine of the product.

If users cannot easily understand:

- what is being measured
- how it is being measured
- what path a request took
- why usage is or is not appearing

then everything else becomes fragile.

### What should be improved

- clearer separation between:
  - test key
  - historical sync
  - live metering
- stronger Gateway page guidance
- clearer provider support matrix
- clearer empty states
- clearer failure states
- better explanation of attribution:
  - project
  - team
  - agent
  - request id

### Done enough means

A user can answer these questions without confusion:

- is my provider key valid?
- am I syncing history or measuring live traffic?
- where do I see recent calls?
- why is a provider showing no spend?
- what metadata is attached to a metered request?

## Epic 2 - Spending verification loop

### Why it matters

Before more platform work, the product must make the “I sent a real call and I
see the spend” loop feel solid.

### What should be improved

- simplest possible provider connection path
- guided test for OpenAI
- guided test for Gemini
- later guided test for Anthropic
- recent call inspection
- timestamp freshness confidence
- reports reflecting new traffic quickly enough

### Done enough means

A user can do this smoothly:

1. vault a provider key
2. run a real request
3. see the request in Gateway or Ledger
4. see cost and tokens appear in reporting surfaces

without needing manual detective work.

## Epic 3 - Integration onboarding

### Why it matters

Right now integrations are powerful but still a bit operator-heavy.

Before Desktop Phase B, the web app should be much better at generating a clean
integration experience.

### What should be improved

- provider-specific onboarding panels
- generated snippets
- mode choice in product language:
  - Observe only
  - Observe + fallback
  - Enforce through Tokenometer
- rollout checklist
- test checklist
- integration health messaging

### Done enough means

A user can onboard an app from the web UI with:

- one clear provider choice
- one clear mode choice
- generated env values/snippet guidance
- a known path to verify success

without having to read several docs first.

## Epic 4 - Integration object model and security confidence

### Why it matters

Desktop Phase B will eventually want:

- local secrets
- named integrations
- per-app bridges

That should rest on a cleaner web-side model first.

### What should be improved

- move conceptually from raw ingest keys toward named integrations
- better secret rotation path
- better surfacing of:
  - last seen
  - integration status
  - health
  - auditability
- cleaner distinction between:
  - provider credential
  - ingest source
  - app integration

### Done enough means

The product can explain clearly:

- which secret belongs to what
- which app is talking to Tokenometer
- what was last active
- which provider credential is being used

## Epic 5 - Product coherence and navigation tightening

### Why it matters

Tokenometer already has many strong ideas:

- metering
- gateway
- wallets
- budgets
- chargeback
- provider value
- external tools

That is exciting, but it also creates a risk that the app feels like multiple
good systems loosely joined together.

### What should be improved

- stronger navigation hierarchy
- clearer grouping between:
  - metering
  - finance
  - integrations
  - governance
- reduce places where similar concepts appear with slightly different language
- improve “what should I do next?” guidance

### Done enough means

A new user can understand:

- what Tokenometer is for
- where to start
- where to verify spend
- where to manage finance controls
- where integrations live

without bouncing across too many sections.

## Epic 6 - Desktop Phase A polish

### Why it matters

Before starting Phase B, we should make sure Phase A feels like a respectable
desktop shell and not just a technical proof.

### What should be improved

- replace default Tauri icons with Tokenometer branding
- polish app naming and bundle metadata
- maybe add:
  - About dialog
  - app menu polish
  - better fallback screen copy
- validate login/session behavior inside the shell

### Done enough means

The MSI feels presentable to a real user, even if still minimal.

## Epic 7 - Re-evaluate Phase B scope

### Why it matters

By the time the web epics above are tighter, we may see that only a narrow slice
of Phase B is truly needed first.

That is good.

It means we start Phase B with precision instead of ambition drift.

### Questions to answer before Phase B

- what exact local integration do we need first?
- is Claude Code really the first desktop-side bridge?
- do we need local secure storage first, or can that wait?
- do we need a background helper immediately?
- which desktop features create the most leverage with the least complexity?

### Done enough means

We can define a **Phase B.1** instead of a vague “desktop companion” blob.

## Suggested execution sequence

### Step 1

Finish the metering UX and verification loop.

This is the highest-leverage product work.

### Step 2

Tighten integration onboarding and identity model.

This will improve both web product quality and future desktop work.

### Step 3

Improve coherence and polish the desktop shell.

### Step 4

Re-scope Desktop Phase B based on what still feels painful.

## Phase B gate

Desktop Phase B should begin only when these statements feel true:

1. live metering is easy to understand
2. spend verification is easy to perform
3. integration onboarding is much cleaner
4. the web app clearly acts as the control plane
5. the desktop shell is respectable enough not to distract from the product
6. we know exactly which desktop capability should come first

## What should probably be first after this doc

If choosing one epic to start immediately, the best first move is:

### Start with Epic 1 + Epic 2 together

In practice they are tightly linked:

- metering UX
- spend verification loop

That is where the product either becomes trustworthy or stays “promising but a
bit slippery.”

## Final recommendation

Yes:

> we should finalize the web app epics before Phase B

And the most important thing to finalize first is not finance polish or desktop
locality.

It is:

- the live metering story
- the request-to-spend verification experience
- the integration onboarding experience

Once those are stronger, Desktop Phase B will be much easier to scope and much
more likely to matter.
