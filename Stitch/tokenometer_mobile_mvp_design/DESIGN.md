---
name: Tokenometer Mobile MVP
product: Tokenometer
domain: AI FinOps, AI token metering, provider cost governance
platform: Mobile web first, responsive PWA-ready
primary_viewport: 390x844
secondary_viewports:
  - 375x812
  - 430x932
  - 768x1024
theme: Dark operational FinOps UI
colors:
  background: "#0F172A"
  surface: "#1E293B"
  surface-elevated: "#334155"
  border-subtle: "#1E293B"
  on-surface: "#dde4e5"
  text-muted: "#94A3B8"
  primary: "#8aebff"
  primary-container: "#22d3ee"
  status-normal: "#10B981"
  status-warning: "#F59E0B"
  status-exceeded: "#EF4444"
  input-token: "#38BDF8"
  output-token: "#818CF8"
typography:
  display: Space Grotesk
  body: Manrope
  data: Inter
icons: Material Symbols Outlined or lucide-style line icons
radius:
  controls: 8px
  cards: 8px
---

# Tokenometer Mobile MVP Design Brief

## Product Positioning

Tokenometer is an AI FinOps cockpit for founders, builders, and operators who want to understand and control AI token spend across OpenAI, Anthropic, Google, Mistral, GitHub Models, and self-hosted models.

The mobile experience should feel like a compact operational console, not a marketing landing page. The first screen must be the actual app experience: cost, freshness, budgets, wallet balances, and sync status.

Do not design a crypto wallet. Tokens are AI model consumption units.

## MVP Mode: Demo + Admin Reality

The product needs two modes that can coexist:

1. Demo Mode
   - Shows realistic seeded usage, costs, models, budgets, projects, and wallet balances.
   - Purpose: communicate the potential of the product immediately to visitors, investors, or early users.
   - Demo data must be visibly labeled as demo data.

2. Admin / Real Data Mode
   - User logs in as admin.
   - Admin can vault provider API keys.
   - Admin can sync or meter usage.
   - Admin can review daily, weekly, and monthly spend.
   - Admin can compare demo data against live data without losing the demo presentation value.

Recommended UI pattern: a clear top pill or segmented switch:

- Demo
- Live

Live mode should show freshness and setup state prominently.

## Mobile Information Architecture

Use bottom navigation with 5 primary destinations:

- Home
- Spend
- Wallet
- Sync
- Settings

Secondary destinations can live under Settings or contextual links:

- Models
- Projects
- Budgets
- Ledger
- Reports
- API / Ingest
- Admin

## Screen 1: Mobile Home

Goal: answer “am I spending money right now, and is my data fresh?”

Top area:

- Tokenometer wordmark with radar icon
- Mode pill: Demo / Live
- Small freshness status:
  - Fresh
  - Stale
  - Never synced

Hero KPI band:

- MTD Spend
- Projected Month-end
- Budget Used %

Use compact, dense metric cards. Avoid oversized hero typography that pushes the operational content below the fold.

Required elements:

- Latest usage event timestamp
- Source of latest data, e.g. byok-proxy, provider-sync:openai, csv
- Warning state if data is older than 24 hours
- Tiny 7-day spend sparkline
- Top provider by spend
- Top project by spend

Primary actions:

- Sync now
- Add API key
- View ledger

## Screen 2: Spend

Goal: daily, weekly, monthly cost control.

Use a segmented control:

- Daily
- Weekly
- Monthly

Each view should show:

- Total cost
- Input tokens
- Output tokens
- Total requests/events
- Delta vs previous period
- Cost by provider
- Cost by model
- Cost by project

Visualization:

- Small stacked bar or line chart
- Provider list with compact horizontal bars
- Model list sorted by cost

Empty state:

- “No live usage yet”
- Actions: “Sync providers”, “Route traffic through proxy”, “Import CSV”

## Screen 3: Wallet

Goal: understand token balances and spend drawdown.

Show:

- Total estimated wallet value
- Provider balances
- Recent wallet entries
- Top-ups, spend, transfers, exchanges

Provider balance cards:

- Provider chip
- Token balance
- 30-day spend
- Status:
  - Healthy
  - Low balance
  - Overdrawn

Keep wallet language careful:

- AI token wallet
- Provider token balance
- Not crypto

## Screen 4: Sync

Goal: make live data setup obvious and trustworthy.

This is the key admin screen on mobile.

Sections:

1. Sync Health
   - Last successful sync
   - Last failed sync
   - Active credentials count
   - Ingest sources count

2. Provider Credentials
   - Provider
   - Label
   - Key hint
   - Last used
   - Status
   - Actions: Test, Sync

3. Recommended Setup
   - OpenAI / Anthropic: Admin API usage sync
   - Google / Mistral / GitHub Models: route live traffic through BYOK proxy for accurate metering
   - CSV import for historical backfill

Credential cards should be easy to scan and must never reveal full API keys.

## Screen 5: Settings / Admin

Goal: safe control surface for authenticated users.

Include:

- Account / organization
- Currency
- Demo mode toggle
- Live mode setup status
- Provider credentials
- Ingest API keys
- Cron sync status
- Danger zone:
  - Wipe demo data
  - Reset live data

Destructive actions must require confirmation.

## Authentication Design

MVP auth should be simple and production-safe:

- Login screen
- Admin-only access to Settings, Sync, Credentials, and Ingest
- Public/demo dashboard can remain visible if desired

Recommended product behavior:

- Anonymous user sees Demo Mode only.
- Logged-in admin can switch Demo / Live.
- Vaulted keys and live costs are only visible to authenticated admin users.

Login screen tone:

- Minimal
- Dark
- Direct
- “Sign in to manage live provider keys and AI spend”

## Visual Style

Keep the existing Tokenometer visual language:

- Dark navy background
- Slate surfaces
- Cyan primary accent
- Green / amber / red status colors
- Mono numeric labels
- Compact cards
- Dense but calm information hierarchy

Avoid:

- Marketing hero sections
- Decorative gradients
- Floating nested cards
- One-note purple/blue gradients
- Crypto visual language
- Excessively rounded pill-heavy layout

## Mobile Layout Rules

- Use full-width bands and compact cards.
- Keep cards radius at 8px.
- Use sticky bottom navigation.
- Use sticky top freshness/mode bar where useful.
- Keep primary actions thumb-accessible.
- Never place long tables on mobile; transform tables into stacked rows/cards.
- Use horizontal scrolling only for short metric chips, not primary data.
- Ensure numbers fit without wrapping awkwardly.
- Keep all tap targets at least 44px high.

## Required Mobile Components

- App shell with top bar and bottom nav
- Mode segmented control: Demo / Live
- Freshness banner
- KPI mini-card
- Sparkline card
- Provider spend row
- Model spend row
- Credential status card
- Sync result toast
- Empty live-data state
- Admin login screen
- Confirmation dialog

## Suggested Stitch Outputs

Please generate mobile screens for:

1. Home - Demo Mode with populated realistic data
2. Home - Live Mode stale data warning
3. Spend - Monthly view
4. Spend - Daily view
5. Wallet - Provider balances
6. Sync - Credential list and sync health
7. Sync - Empty setup state
8. Settings / Admin
9. Login

Also generate one tablet layout at 768x1024 for Home and Spend.

## Copy Guidelines

Use concise operational copy:

- “Latest usage”
- “Data stale”
- “Sync providers”
- “Vault API key”
- “MTD spend”
- “Projected month-end”
- “Budget used”
- “Live metering”
- “Demo data”

Avoid vague feature descriptions or onboarding paragraphs inside the main app.

## Product Decisions To Preserve

- Demo data is valuable and should remain part of the MVP.
- Live admin mode is for real cost tracking.
- Provider sync is not equally capable across providers.
- BYOK proxy is the preferred source of accurate live metering for providers without historical usage APIs.
- The mobile app should make data freshness impossible to miss.
