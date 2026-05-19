# Tokenometer Dummy Guide

This is the plain-English guide for using Tokenometer as it exists now.

No jargon points awarded here. The goal is simple:

> help you understand what to click, why it matters, and what each part is for.

## The Big Idea

Tokenometer works best when it sits between your app and the AI provider.

That means:

1. your app sends the request to Tokenometer
2. Tokenometer forwards it to OpenAI, Anthropic, Google, Mistral, or GitHub Models
3. the provider answers
4. Tokenometer reads token usage and cost
5. Tokenometer records it immediately

This is called **live metering**.

That is the heart of the product.

## The Three Important Keys

### 1. Provider API key

This is the real provider key, like:

- OpenAI `sk-...`
- Anthropic key
- Google key

This lets Tokenometer call the provider on your behalf.

### 2. Provider admin key

This is only needed for some historical sync features.

Example:

- OpenAI `sk-admin-...`

You do **not** need this for normal live metering.

### 3. Tokenometer ingest key

This is a Tokenometer key, not a provider key.

Your test script or app sends it to Tokenometer so Tokenometer knows which source is generating usage.

## What the Main Areas Do

### Credentials

Page:

`https://www.tokenometer.cloud/settings/credentials`

Use this page to:

- vault provider API keys
- test whether a provider key can actually call a model
- run historical sync when the provider supports it

Think of this as:

> "Can Tokenometer safely hold and use my provider keys?"

### Gateway

Page:

`https://www.tokenometer.cloud/gateway`

Use this page to:

- see the live metering routes
- copy test snippets
- view recent gateway calls
- check request IDs and latency
- confirm which providers are wired

Think of this as:

> "This is the engine room."

### Wallet

Page:

`https://www.tokenometer.cloud/wallet`

Use this page to:

- see provider balances
- see reserved and spendable capacity
- top up, transfer, or exchange balances
- watch budget guardrails
- see allocation and chargeback snapshots

Think of this as:

> "Where AI spending becomes governable."

### Wallet Allocations

Page:

`https://www.tokenometer.cloud/wallet/allocations`

Use this page to:

- assign provider wallet capacity to projects
- assign provider wallet capacity to teams
- reserve tokens for downstream scopes
- remove allocations when they are no longer needed

Think of this as:

> "Who gets to spend from which provider pool?"

### Wallet Chargeback

Page:

`https://www.tokenometer.cloud/wallet/chargeback`

Use this page to:

- view current month chargeback base
- issue internal monthly usage statements
- print those statements later from invoices

Think of this as:

> "Who should be billed internally for AI usage?"

## The Correct Workflow

If you want to test Tokenometer properly, do it in this order.

## Step 1: Log In

Open:

`https://www.tokenometer.cloud/login`

Use your admin credentials.

If 2FA is enabled, also use the 6-digit code from your authenticator app.

## Step 2: Vault a Real Provider Key

Go to:

`/settings/credentials`

Add a provider key, usually OpenAI first.

This means Tokenometer stores the key encrypted and can use it for real proxy calls.

## Step 3: Test the Key

Still on the credentials page, click **Test**.

This answers:

> "Can this key actually call the provider?"

This is different from historical sync.

## Step 4: Understand Test vs Sync vs Gateway

### Test

Checks whether the provider key works for real calls.

### Sync now

Tries to import historical provider usage, when supported.

This is optional and often needs admin-level provider keys.

### Gateway

This is the real product path.

It measures live calls as they happen.

## Step 5: Open the Gateway

Go to:

`/gateway`

Here you will see:

- the URL to call
- the ingest key pattern
- sample Node.js code
- sample Python code
- recent live requests

## Step 6: Run a Test Script From Your Own Machine

This is the part people often overcomplicate, so here is the simple answer:

Yes, you run the sample script from **your own machine**.

Best options:

- VS Code terminal
- PowerShell
- Windows Terminal

All of those are fine.

Tokenometer is the server.

Your script is the client.

## Step 7: Set the Ingest Key

Before running the test script, set the Tokenometer ingest key in your terminal.

In PowerShell:

```powershell
$env:TOKENOMETER_INGEST_KEY="your_ingest_key_here"
```

## Step 8: Run the Test Script

### Python

You can use the ready-made file in this repo:

[tests/test_tokenometer.py](C:\Users\Davide\VS-Code Solutions\Tokenometer\tests\test_tokenometer.py)

Run:

```powershell
python .\tests\test_tokenometer.py
```

If needed:

```powershell
py .\tests\test_tokenometer.py
```

### Node.js

If you prefer Node, use the sample from the Gateway page and run it from your terminal with:

```powershell
node .\your-test-file.mjs
```

## Step 9: Verify That Live Metering Worked

After a successful test call:

- the provider should answer normally
- Tokenometer should create a usage event
- the Gateway page should show a recent call
- Live mode reports should reflect the usage
- wallet and project-level views can begin using that data

## Step 10: Start Using Wallet Controls

Once live metering is working, the next useful pieces are not abstract anymore.

You can now:

- top up provider balances
- transfer balances
- exchange between providers
- request approvals
- allocate provider balance to projects
- allocate provider balance to teams
- issue internal chargeback statements

This is the shift from:

> "I can see usage"

to:

> "I can govern usage"

## What the Budget Guardrail Does

The budget guardrail watches the monthly organization budget.

Depending on state:

- in healthy mode, direct wallet actions stay open
- in critical mode, transfers may require approval
- in exceeded mode, wallet actions are restricted and auto-lock behavior can kick in

So this is not just a warning banner. It now affects behavior.

## What Allocations Mean

An allocation means:

> "reserve part of a provider wallet for a specific project or team."

Example:

- OpenAI wallet has 10M tokens
- you allocate 2M to Project A
- you allocate 1M to Team B

Those allocations are now visible downstream and reduce freely spendable balance.

## What Chargeback Means

Chargeback means:

> "create internal statements showing which project or team consumed AI value."

This is for internal accountability, not external payment processing.

It helps answer:

- who used what
- which provider it came from
- what it cost this month

## If Something Still Feels Confusing

Use this mental model:

- **Credentials** = store provider keys
- **Gateway** = meter live calls
- **Wallet** = manage provider balances
- **Allocations** = reserve balance for projects or teams
- **Chargeback** = generate internal usage statements
- **Budgets** = decide when the system should get stricter

## Where We Are in the Product Journey

Right now, Tokenometer is in:

**late Phase 2, with the first slice of Phase 5**

In normal words:

- live metering works
- wallet controls work
- allocations work
- internal chargeback has begun
- provider-normalized exchange intelligence is still ahead
- policy-based smart routing is still ahead

So the app is already beyond "just a dashboard," but it is not yet the full AI financial network vision.
