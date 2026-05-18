# Tokenometer Product Brief

## Nature of the Product

Tokenometer is an AI FinOps and live metering platform for tracking token usage, model spend, provider costs, and budget exposure across AI providers.

The core product idea is simple:

- AI model calls cost money.
- Provider dashboards are inconsistent and often delayed.
- Some providers expose historical usage APIs only to admin keys.
- Some providers do not expose useful historical usage APIs at all.
- Therefore, Tokenometer should measure live usage directly as calls happen.

Tokenometer is not a crypto product. Its "wallet" and "tokens" language refers to AI model consumption units, provider balances, usage drawdown, and financial governance.

## Product Positioning

Tokenometer is best understood as a lightweight AI spend gateway:

> Put Tokenometer between your app and model providers, and it meters every token in real time.

The dashboard and demo data show the product potential, but the real engine is the Metering Gateway.

## Data Modes

Tokenometer now has two clear data modes:

- **Demo Mode**
  - Keeps realistic seeded demo data visible.
  - Useful for showcasing the MVP to visitors, investors, and early users.
  - Does not require admin login.

- **Live Mode**
  - Shows real synced, imported, or gateway-metered usage.
  - Requires admin login.
  - Intended for testing real provider keys and actual AI spend.

## Measurement Strategy

Tokenometer uses three measurement paths.

### 1. Live Metering Gateway

This is the primary product path.

Your application sends model requests through Tokenometer proxy endpoints instead of directly calling the provider. Tokenometer forwards the call to the provider, reads the provider response usage, and records:

- provider
- model
- input tokens
- output tokens
- total tokens
- estimated cost
- project
- agent
- source
- timestamp

This works with normal provider API keys when the provider response includes token usage.

### 2. Historical Provider Sync

This is a secondary reconciliation path.

Some providers expose historical organization usage APIs, but usually only with admin keys.

- OpenAI historical usage requires an OpenAI organization Admin API key.
- Anthropic historical usage requires an Anthropic Admin API key.
- Google, Mistral, and GitHub Models do not currently provide the same kind of reliable historical per-model usage API for this MVP path.

When an OpenAI normal project key is used, Tokenometer now falls back to a tiny live ping and meters that call instead of failing with only an admin-key message.

### 3. CSV / Billing Import

CSV import remains available for historical backfill, invoices, exports, and manual reconciliation.

## Recent Product Changes

### Deployment and Domain

- Deployed Tokenometer to the Hetzner VPS in an isolated `/opt/tokenometer` path.
- Preserved the hard rule not to touch or interfere with the existing production `ai-radar` app.
- Added Docker Compose isolation with project name `tokenometer`.
- Bound the production app port to `127.0.0.1:3100` so it is reachable only through Nginx.
- Configured Nginx for:
  - `https://tokenometer.cloud`
  - `https://www.tokenometer.cloud`
- Added Let's Encrypt HTTPS certificate.
- Updated production app URL and allowed server action origins for the new domain.

### Admin and Security

- Replaced env-only admin login with database-backed admin users.
- Added hashed admin password storage using PBKDF2-SHA256.
- Added login attempt tracking and rate limiting.
- Added optional TOTP 2FA setup.
- Added `/settings/security` page for:
  - admin user status
  - 2FA setup
  - recent audit log
- Rotated the plaintext bootstrap admin password in production after creating the hashed admin user.

### Vault and Secrets

- Provider API keys are vaulted encrypted with AES-256-GCM.
- Ingest secrets are now encrypted instead of stored as raw text.
- Added a secret-store adapter boundary for future external KMS/Vault integration.
- Current provider is local envelope encryption using `INGEST_ENC_KEY`.
- Future providers can include AWS KMS, GCP KMS, Azure Key Vault, HashiCorp Vault, or another managed secret store.

### Audit Logging

Added audit log support for sensitive admin actions, including:

- credential create/update
- credential delete
- credential test
- credential sync
- ingest source create
- ingest source secret rotation
- ingest source delete
- CSV import
- demo data wipe
- 2FA setup and enable/disable actions

### Demo / Live UX

- Added explicit Demo / Live mode switch.
- Anonymous users are effectively limited to demo data.
- Admin users can switch into Live mode.
- Dashboard and reports now filter usage based on selected mode.
- Demo data is preserved and remains valuable for MVP storytelling.

### Spend Views

- Renamed reports experience toward **Spend**.
- Added daily, weekly, and monthly period controls.
- Cost/tokens/events now adapt to the selected period.

### Mobile Direction

- Added mobile-first navigation:
  - Home
  - Spend
  - Meter
  - Wallet
  - Settings
- Created a mobile design brief at:
  - `Stitch/tokenometer_mobile_mvp_design/DESIGN.md`
- Incorporated Stitch mobile concepts into the product direction:
  - compact operational dashboard
  - mode switch
  - freshness status
  - spend period controls
  - wallet/provider balances
  - sync/setup visibility

### Metering Gateway

Added admin-only `/gateway` page.

The Gateway page includes:

- explanation of live metering as the reliable path
- provider route matrix
- active ingest source status
- vaulted provider status
- recent live gateway calls
- Node.js copy-paste snippet
- Python copy-paste snippet

Current gateway providers:

- OpenAI
- Anthropic
- Google Gemini
- Mistral
- GitHub Models

The Gateway is now the product center for real token measurement.

## Current Admin Login

Production admin login uses:

- URL: `https://www.tokenometer.cloud/login`
- username: `admin`
- password: stored as a hash in the database

2FA can be enabled from:

- `https://www.tokenometer.cloud/settings/security`

## Current Key Principle

Provider sync is optional reconciliation.

Live metering is the engine.

Tokenometer should focus next on making it extremely easy for a developer to route their app's AI calls through the Metering Gateway and immediately see accurate token and cost records in Live Mode.

## Suggested Next Steps

1. Polish OpenAI Gateway flow end-to-end.
2. Add streaming support where providers expose usage during streams.
3. Add SDK-style wrappers for Node and Python.
4. Add a guided onboarding checklist:
   - vault key
   - create ingest source
   - run test call
   - switch to live mode
   - view spend
5. Add clearer provider capability labels:
   - live metering supported
   - historical sync supported
   - admin key required
   - billing export only
6. Add token estimation fallback only when provider response usage is unavailable.
7. Add production-grade external KMS/Vault backend.

