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

### Scheduled provider sync

For an always-on deployment, call the protected sync endpoint from cron:

```bash
curl -X POST "https://your-domain.example/api/cron/sync?days=7" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Recommended cadence: every 15 minutes for current metering pings, or hourly if
you mostly rely on provider usage APIs. OpenAI and Anthropic historical sync
require admin keys; Google, Mistral, and GitHub Models should be kept current by
routing live traffic through the BYOK proxy because they do not expose equivalent
bulk usage APIs.

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
