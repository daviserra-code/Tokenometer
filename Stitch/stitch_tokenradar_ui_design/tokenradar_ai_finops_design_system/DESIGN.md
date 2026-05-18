---
name: TokenRadar AI FinOps Design System
colors:
  surface: '#1E293B'
  surface-dim: '#0e1416'
  surface-bright: '#343a3c'
  surface-container-lowest: '#090f11'
  surface-container-low: '#161d1e'
  surface-container: '#1a2122'
  surface-container-high: '#242b2d'
  surface-container-highest: '#2f3638'
  on-surface: '#dde4e5'
  on-surface-variant: '#bbc9cd'
  inverse-surface: '#dde4e5'
  inverse-on-surface: '#2b3233'
  outline: '#859397'
  outline-variant: '#3c494c'
  surface-tint: '#2fd9f4'
  primary: '#8aebff'
  on-primary: '#00363e'
  primary-container: '#22d3ee'
  on-primary-container: '#005763'
  inverse-primary: '#006877'
  secondary: '#bdc2ff'
  on-secondary: '#131e8c'
  secondary-container: '#2f3aa3'
  on-secondary-container: '#a8afff'
  tertiary: '#ffd6a3'
  on-tertiary: '#462b00'
  tertiary-container: '#ffb13b'
  on-tertiary-container: '#6e4600'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#a2eeff'
  primary-fixed-dim: '#2fd9f4'
  on-primary-fixed: '#001f25'
  on-primary-fixed-variant: '#004e5a'
  secondary-fixed: '#e0e0ff'
  secondary-fixed-dim: '#bdc2ff'
  on-secondary-fixed: '#000767'
  on-secondary-fixed-variant: '#2f3aa3'
  tertiary-fixed: '#ffddb5'
  tertiary-fixed-dim: '#ffb957'
  on-tertiary-fixed: '#2a1800'
  on-tertiary-fixed-variant: '#643f00'
  background: '#0F172A'
  on-background: '#dde4e5'
  surface-variant: '#2f3638'
  surface-elevated: '#334155'
  status-normal: '#10B981'
  status-warning: '#F59E0B'
  status-exceeded: '#EF4444'
  input-token: '#38BDF8'
  output-token: '#818CF8'
  border-subtle: '#1E293B'
  text-muted: '#94A3B8'
typography:
  display:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  h1:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
  h2:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  kpi-value:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1'
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  data-mono:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.02em
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  container-margin: 24px
  gutter: 16px
  card-padding: 20px
  section-gap: 32px
---

# TokenRadar — AI FinOps

Financial governance for AI token consumption. Track usage, cost, budgets and
forecasts across providers, models, projects and teams.

> **Not** a cryptocurrency, wallet, exchange, or trading product.
> "Tokens" here mean **AI model consumption units** — like compute time, API calls,
> or GPU hours.

---

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** (custom dark FinOps theme)
- **Prisma** ORM + **PostgreSQL** (Docker Compose for local dev)
- **Recharts** for charts
- **Zod** for validation (ready to use in API routes)
- **lucide-react** icons

Authentication is intentionally not included in the MVP — the architecture supports adding
NextAuth or Clerk later without restructuring.

---

## MVP scope (implemented)

- **Dashboard** — month-to-date tokens & spend, deltas vs. last month, budget
  consumption, projected month-end spend, daily token & cost trends, top models &
  top projects, avg. cost per 1K tasks.
- **Token Ledger** — filterable table of usage events (date range, provider, model,
  project, team) with input/output/total tokens and estimated cost.
- **Projects** — list with team, MTD spend, MTD tokens, monthly budget, usage bar,
  status (Normal / Warning / Exceeded).
- **Models & Pricing** — providers grouped, per-million input & output prices,
  context window, active flag.
- **Budgets** — organization, project, team and model budgets with thresholds at
  50% / 80% / 100%, plus simple month-end forecast.
- **Reports** — monthly cost & tokens by provider, model, project and team.
- **Settings** — organization, currency, default provider, demo mode toggle,
  cost calculation rules, product disclaimer.

---

## Quick start

Requires: **Node 20+**, **Docker Desktop**, **npm**.

```bash
# 1) Install dependencies
npm install

# 2) Copy env (defaults work with the bundled docker-compose)
cp .env.example .env   # on Windows PowerShell: Copy-Item .env.example .env

# 3) One-shot: start Postgres, push schema, seed demo data
npm run setup

# 4) Run the app
npm run dev
```

Open http://localhost:3000.

### Useful scripts

| Script              | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Start the Next.js dev server                          |
| `npm run db:up`     | Start the Postgres container                          |
| `npm run db:down`   | Stop the Postgres container                           |
| `npm run db:push`   | Push the Prisma schema to the DB                      |
| `npm run db:seed`   | Seed realistic demo data (90 days, 4,500 events)      |
| `npm run db:reset`  | Drop & recreate the DB, then re-seed                  |
| `npm run setup`     | `db:up` + `db:push` + `db:seed`                       |
| `npm run build`     | Production build                                      |
| `npm run start`     | Run the production build                              |

---

## Cost calculation

```
input_cost  = input_tokens  / 1,000,000 * input_price_per_million
output_cost = output_tokens / 1,000,000 * output_price_per_million
total_cost  = input_cost + output_cost
```

Forecast for the current month is a linear extrapolation of the daily average so far.

---

## Data model (Prisma)

Entities: `Organization`, `Team`, `Project`, `Provider`, `Model`, `UsageEvent`, `Budget`.
See [prisma/schema.prisma](prisma/schema.prisma).

---

## Folder structure

```
prisma/
  schema.prisma           # Data model
  seed.ts                 # Realistic demo seed
src/
  app/
    layout.tsx            # Sidebar + topbar shell
    page.tsx              # Dashboard
    ledger/page.tsx       # Token Ledger
    projects/page.tsx     # Projects
    models/page.tsx       # Models & Pricing
    budgets/page.tsx      # Budgets
    reports/page.tsx      # Reports
    settings/page.tsx     # Settings
  components/             # Card, KpiCard, DataTable, BudgetBar, charts/
  lib/
    prisma.ts             # Prisma client singleton
    calc.ts               # Cost & forecast helpers
    format.ts             # Currency / token / date formatting
docker-compose.yml        # Local Postgres
```

---

## Roadmap (post-MVP)

- Authentication (NextAuth / Clerk) and multi-tenant org scoping
- CSV/JSON ingestion of usage events + provider API connectors
- Per-feature / per-customer chargeback reports
- Anomaly detection on token spikes
- CSV / Excel export of all reports
- Alerting (email / Slack) on budget thresholds
