# Tokenometer Dummy Guide

This guide explains how to use Tokenometer in the new metering-oriented way.

No shame in the word "dummy" here. The goal is to make the product usable without remembering API jargon.

## The Big Idea

Tokenometer measures AI token usage.

The most reliable way to measure tokens is not to ask providers later.

The most reliable way is:

1. Your app sends the AI request to Tokenometer.
2. Tokenometer forwards the request to OpenAI, Anthropic, Google, Mistral, or GitHub Models.
3. The provider sends the answer back.
4. Tokenometer reads the token usage from that answer.
5. Tokenometer records the usage and cost immediately.

This is called **live metering**.

In simple words:

> Tokenometer must sit between your app and the AI provider.

## Important Words

### API Key

An API key is a password that lets software call an AI provider.

Example:

- OpenAI normal key: `sk-...`
- OpenAI admin key: `sk-admin-...`

### Normal Provider Key

This is the key your app uses to call models.

For example, a normal OpenAI `sk-...` key can call `gpt-4o-mini`.

This is enough for live metering.

### Admin Provider Key

This is a special key that can read historical organization usage.

For OpenAI, this usually starts with:

- `sk-admin-...`

You do not need this to test live metering.

You only need this if you want Tokenometer to import historical OpenAI usage directly from OpenAI's organization usage API.

### Ingest Key

This is a Tokenometer key.

Your app sends it to Tokenometer so Tokenometer knows which workspace/source is sending usage.

You will see it on the Metering Gateway page.

### Vaulted Key

This is a provider API key stored inside Tokenometer.

Tokenometer stores it encrypted.

When your app calls Tokenometer, Tokenometer uses the vaulted provider key to call the provider.

## The Correct Workflow

For MVP testing, use this order.

## Step 1: Log In as Admin

Open:

`https://www.tokenometer.cloud/login`

Use your admin username and password.

If 2FA is enabled, also enter the 6-digit code from your iPhone authenticator app.

## Step 2: Vault a Provider Key

Go to:

`https://www.tokenometer.cloud/settings/credentials`

Click or fill the form:

- Provider: choose `OpenAI` first
- Label: use something like `Default`
- API key: paste your normal OpenAI key, for example `sk-...`

Click:

**Vault credential**

What this means:

Tokenometer now has an encrypted copy of your provider key.

## Step 3: Test the Provider Key

Still on:

`/settings/credentials`

Find the stored key and click:

**Test**

What this does:

- Sends a tiny real AI request through Tokenometer
- Uses your vaulted provider key
- Proves the key can call the provider
- Records a tiny usage event if successful

If this fails, the key itself may be invalid, expired, restricted, or missing provider/model access.

## Step 4: Understand Sync vs Metering

This is the part that caused confusion.

### Test

Use **Test** to check:

> Can this key call the provider?

### Sync Now

Use **Sync now** to check:

> Can Tokenometer import historical usage from the provider?

For OpenAI, historical sync needs an admin key:

`sk-admin-...`

If you use a normal `sk-...` key, Tokenometer now falls back to one tiny live ping.

### Metering Gateway

Use **Metering Gateway** for the real product:

> Can Tokenometer measure my app's AI calls as they happen?

This is the main path.

## Step 5: Open the Metering Gateway

Go to:

`https://www.tokenometer.cloud/gateway`

You will see:

- Gateway status
- Provider routes
- Active ingest source
- Vaulted provider status
- Node.js example
- Python example
- Recent gateway calls

This page is admin-only because it shows the ingest key.

## Step 6: Copy a Code Example

On the Gateway page, copy the Node.js or Python example.

The example calls:

`/api/proxy/openai/chat/completions`

Instead of calling OpenAI directly, your app calls Tokenometer.

Tokenometer then calls OpenAI.

## Step 7: What Changes in Your App

Normally your app might call:

`https://api.openai.com/v1/chat/completions`

With Tokenometer, your app calls:

`https://www.tokenometer.cloud/api/proxy/openai/chat/completions`

Your app includes:

- `x-ingest-key`
- optional `x-project`
- optional `x-agent`

Example headers:

```txt
content-type: application/json
x-ingest-key: your-tokenometer-ingest-key
x-project: My App
x-agent: support-bot
```

Your app does not need to send the OpenAI API key directly.

Tokenometer uses the vaulted key.

What this means in real life:

- if you already have an app, you change the API URL in that app
- if you do not have an app yet, you can use the sample snippet as a temporary test script
- the snippet is not something you run "inside Tokenometer"
- the snippet is something you run on your own machine, in your own terminal

The easiest mental model is:

- Tokenometer is the server
- your test script is the client

## Step 7.5: Where Do I Run the Snippet?

Run the Node.js or Python snippet on your own computer.

The easiest place is:

- open your project in VS Code
- open the VS Code terminal
- run the script there

If you prefer, you can also run it from:

- PowerShell
- Windows Terminal
- Command Prompt

These are all fine.

### If you choose the Python snippet

1. Create a file like:

`test_tokenometer.py`

2. Paste the Python example into that file.

3. In VS Code terminal or PowerShell, run:

```powershell
python .\test_tokenometer.py
```

If `python` does not work, try:

```powershell
py .\test_tokenometer.py
```

### If you choose the Node.js snippet

1. Create a file like:

`test-tokenometer.mjs`

2. Paste the Node.js example into that file.

3. In VS Code terminal or PowerShell, run:

```powershell
node .\test-tokenometer.mjs
```

### Which one should you use?

Use whichever feels easier.

- If you already use Python sometimes, use Python.
- If you already use Node.js / JavaScript, use Node.js.

For your first proof that Tokenometer works, either one is perfectly fine.

## Step 8: Run One Real Test Call

Use the copied snippet.

Run it locally from your machine as a small test script.

The simplest setup is:

- open VS Code
- open terminal
- save the snippet to a `.py` or `.mjs` file
- run it from that terminal

If it works:

- you get an AI response
- Tokenometer records the token usage
- the usage appears in Live mode
- the Gateway page shows the recent call

If you are asking "can I run it from here, from PowerShell?" the answer is:

**Yes. PowerShell is a perfectly correct place to run it.**

## Step 9: Switch to Live Mode

Go to the dashboard:

`https://www.tokenometer.cloud`

Switch from:

**Demo**

to:

**Live**

Now the dashboard shows real usage only:

- gateway-metered calls
- provider-sync calls
- CSV/imported usage

Demo data is still preserved.

## Step 10: Check Spend

Go to:

`https://www.tokenometer.cloud/reports`

Use:

- Daily
- Weekly
- Monthly

This lets you check real spend by period.

## What Key Do I Need?

### To test live metering with OpenAI

You can use a normal OpenAI key:

`sk-...`

This is enough.

### To import old OpenAI usage history

You need an OpenAI admin key:

`sk-admin-...`

This is different from a normal key.

### To test the product today

Use a normal key first.

The best first test is:

1. Vault normal OpenAI key
2. Click Test
3. Open Gateway
4. Run Node.js or Python snippet
5. Switch dashboard to Live
6. Confirm tokens appear

## Why Provider Sync Is Not Enough

Provider sync sounds nice, but it is unreliable as the main product engine.

Reasons:

- Some providers require admin keys.
- Some providers do not expose historical usage APIs.
- Some dashboards update late.
- Some billing exports are not per-request.
- Some providers show costs but not enough model/project detail.

So Tokenometer should not depend only on provider sync.

Tokenometer should meter live traffic directly.

## What Each Button Means

### Vault credential

Stores your provider API key in encrypted form.

### Test

Sends one tiny live model call to make sure the key works.

### Sync now

Tries to import historical usage from the provider.

This may require admin keys.

### Open gateway

Shows how to route real app calls through Tokenometer.

This is the important one for accurate token measurement.

## Is My Provider Key Exposed?

The intended flow is:

- You paste the provider key once into Tokenometer.
- Tokenometer encrypts it.
- Your app sends requests to Tokenometer with an ingest key.
- Your app does not need to know the provider key anymore.

This reduces key spread.

But remember:

- If someone fully controls the VPS, they can still access server secrets.
- This is why 2FA, HTTPS, audit logs, and future external Vault/KMS matter.

## What To Do If Nothing Appears in Live Mode

Check these in order:

1. Are you logged in as admin?
2. Is the dashboard switched to **Live**?
3. Did you vault a provider key?
4. Did you create or have an active ingest source?
5. Did your code call the Tokenometer URL, not the provider URL?
6. Did your request include `x-ingest-key`?
7. Did the provider response succeed?
8. Does `/gateway` show the call in recent gateway calls?

## First Recommended Test

Use OpenAI first.

Why:

- normal `sk-...` keys can call models
- OpenAI responses include token usage
- Tokenometer can meter the response immediately

Recommended first model:

`gpt-4o-mini`

Recommended first project name:

`Tokenometer Test`

Recommended first agent name:

`manual-test`

## Mental Model

Think of Tokenometer like a smart toll booth.

Without Tokenometer:

```txt
Your App -> OpenAI
```

With Tokenometer:

```txt
Your App -> Tokenometer -> OpenAI
```

Because traffic passes through Tokenometer, Tokenometer can count it.

That is the whole product.
