# Tokenometer Desktop Strategy

This document defines how Tokenometer should approach desktop distribution and
why the **web app remains the primary product**.

## First principle

Tokenometer should remain **web-first**.

That means:

- the hosted web app is the main product
- the cloud backend remains the system of record
- the web UI remains the default operating surface
- desktop should extend the product, not replace it

So to be very explicit:

> what we have now, the web app, stays the first choice

Desktop is a second surface, not the new center of gravity.

## Why consider desktop at all

A desktop app can still be valuable because it can do things the web app cannot
do as easily:

- native Windows distribution with `.msi`
- better local integration with developer tools
- stronger local secret handling
- easier background helpers
- more natural integration with tools like Claude Code and other local agents

So desktop should be thought of as:

> an extension of Tokenometer's operating reach

not:

> a replacement for the hosted web platform

## Why Tauri is attractive

Tauri is a strong candidate because:

- it supports Windows installers including `.msi`
- it is lighter than Electron
- it gives access to native capabilities through Rust
- it is well suited to secure local integration helpers

This makes it especially interesting for:

- Windows distribution
- local tool metering bridges
- secure desktop-side integrations

## Important architectural truth

The current Tokenometer app is not a simple drop-in Tauri target.

The current app depends heavily on:

- dynamic Next.js pages
- server actions
- Node runtime routes
- Prisma
- PostgreSQL
- live backend APIs

Tauri's usual Next.js path works best when the frontend is exported as a static
site. That is not what Tokenometer is today.

So the desktop strategy should **not** be:

> rewrite the current product into a pure Tauri-local app immediately

That would be premature and expensive.

## Recommended strategy

The right path is:

### Phase A first

Build a **Tauri desktop shell** around the existing hosted web app.

### Phase B second

Extend the Tauri app into a **desktop companion** with local integration
capabilities.

This sequence is important because it preserves product focus.

## Phase A - Tauri shell MVP

Phase A should be intentionally modest.

The purpose is:

- package Tokenometer as a Windows desktop app
- distribute it as `.msi`
- give users a branded desktop experience
- validate whether desktop distribution actually matters

### What Phase A should include

- Tokenometer desktop shell built with Tauri
- desktop window that loads the hosted Tokenometer web app
- application branding:
  - app name
  - icon
  - MSI installer
- basic desktop behaviors:
  - remembered session if appropriate
  - launch shortcuts
  - native window shell

### What Phase A should *not* include

- local-first data model
- replacing the hosted backend
- major duplication of the web product
- a separate feature roadmap from the web app

### Why Phase A is good

It gives us:

- a real installable desktop product
- a low-risk desktop experiment
- a path to Windows users without architectural disruption

### What Phase A proves

It answers:

- do users want Tokenometer as a desktop app?
- does desktop distribution improve trust or adoption?
- do teams prefer installed tooling for FinOps and metering tasks?

## Phase B - Desktop companion

Once Phase A is working and useful, Phase B can turn desktop from a wrapper
into a meaningful companion.

This is where Tauri becomes strategically interesting.

### What Phase B should include

- native secure local secret storage
- local integration helpers for external tools
- local metering bridge for:
  - Claude Code
  - OpenAI-compatible tools
  - Anthropic-compatible tools
  - Gemini-compatible tools
- optional background service behavior
- sync back to Tokenometer cloud

### Product role of Phase B

The desktop app becomes:

> the local bridge between developer tools and the Tokenometer cloud platform

This is much stronger than “desktop wrapper.”

### Why this matters

The web app is strongest as:

- control plane
- reporting surface
- wallet and budget layer
- finance and governance surface

The desktop app can become strongest as:

- local collector
- local integration host
- secure bridge for tools the browser cannot reach cleanly

That separation is healthy.

## Product roles by surface

### Web app

Primary product.

Responsible for:

- dashboard
- reports
- ledger
- budgets
- wallet
- chargeback
- governance
- integration setup
- long-term record of truth

### Desktop app

Companion product.

Responsible for:

- installable shell
- local integrations
- background helpers
- secure local secrets
- tool-aware metering bridges

## Why web-first must remain the rule

There are good reasons not to invert the architecture:

### 1. The current product is already web-native

Most of Tokenometer's value is in:

- shared data
- multi-device access
- hosted dashboards
- central budgets and finance views

These naturally belong to the web platform.

### 2. Desktop-first would create fragmentation too early

If the desktop app became the main product too soon, we would risk:

- duplicated interfaces
- conflicting priorities
- sync complexity
- product drift

### 3. The cloud app is the right control plane

The cloud product is where the user should ultimately:

- configure providers
- manage wallet rules
- review budgets
- read reports
- administer integrations

Desktop should feed that system, not replace it.

## Tauri product options

There are 3 realistic desktop approaches.

### Option 1 - Shell only

Desktop app is mostly a native wrapper for the hosted product.

Best for:

- quick MSI distribution
- validating desktop demand

### Option 2 - Hybrid companion

Desktop app uses the hosted product for the main UI, but also contains local
Rust-powered capabilities and helper logic.

Best for:

- local tool integrations
- secure secret handling
- background agent bridges

### Option 3 - Local-first Tokenometer

Desktop app has its own local database and major standalone behavior.

Best for:

- highly specialized enterprise/offline scenarios

But this is much too early for now.

### Recommendation

Choose:

- **Phase A: Option 1**
- **Phase B: move toward Option 2**

Do not pursue Option 3 now.

## Phase A implementation outline

### Scope

- scaffold Tauri app
- configure Windows MSI build
- load hosted Tokenometer URL
- set branding and icons
- validate login/session experience

### Success criteria

- installer builds cleanly on Windows
- app launches reliably
- hosted Tokenometer is usable inside the shell
- no major UX breakage versus browser use

## Phase B implementation outline

### Scope

- local secure storage
- local settings for integration tokens
- local metering helper modules
- background desktop bridge for external tools
- health/sync visibility into the web app

### Success criteria

- external tools can be metered through desktop-side helpers
- secrets no longer need to live only in app env files
- the web app can display integration health from desktop agents

## Risks

### Phase A risks

- desktop wrapper may feel too thin if not clearly valuable
- session handling inside shell may need care
- Windows signing/distribution adds operational work

### Phase B risks

- desktop helper complexity grows quickly
- sync logic can become messy
- local/remote state boundaries must stay very clear

## Recommended product message

If we ship desktop, the message should be:

> Tokenometer Desktop brings local integrations and installable access to the Tokenometer platform.

Not:

> Tokenometer is now a different desktop product.

That keeps the product story coherent.

## Suggested roadmap

### Step 1

Write the desktop architecture and product boundaries clearly.

### Step 2

Build Phase A Tauri shell.

### Step 3

Package `.msi` and test the distribution experience.

### Step 4

Validate user demand and usage patterns.

### Step 5

Start Phase B local integration work.

## Final recommendation

Yes, Tauri + Rust is a good direction **if** we use it in the right order.

That order is:

1. **Phase A first** - desktop shell for the hosted web app
2. **Phase B second** - local integration companion features

And the non-negotiable rule is:

> the hosted web app remains Tokenometer's primary product

That keeps the product grounded while still opening the door to a stronger
desktop future.
