import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tokenometer | AI usage operating layer",
  description:
    "Measure AI spend at call time, attribute usage across apps and teams, reconcile provider history, and govern consumption with budgets, wallets, and chargeback.",
};

const operatorLoop = [
  {
    step: "01",
    title: "Wire one app safely",
    body: "Start in observe mode, keep production continuity intact, and validate live requests without forcing traffic through a new path on day one.",
  },
  {
    step: "02",
    title: "See the raw event",
    body: "Every request can carry provider, model, integration, project, team, workflow, request ID, metering path, and token totals.",
  },
  {
    step: "03",
    title: "Reconcile reality",
    body: "Pull provider-side history when it exists and compare it against live metering instead of pretending the providers all expose the same truth.",
  },
  {
    step: "04",
    title: "Govern spend",
    body: "Move from observation into approvals, budgets, wallet controls, allocations, and chargeback on top of the same usage layer.",
  },
];

const proofPanels = [
  {
    title: "Gateway",
    body: "Choose observe, fallback, or enforce. Generate snippets, validate integrations, and inspect the request path without losing app identity.",
    image: "/marketing/credentials.png",
  },
  {
    title: "Ledger",
    body: "Inspect the raw event stream with filters, live totals, integration labels, and metering-path visibility.",
    image: "/marketing/ledger.png",
  },
  {
    title: "Spend",
    body: "Read daily, weekly, and monthly usage with reconciliation context instead of a disconnected cost chart.",
    image: "/marketing/spend.png",
  },
];

const comparisonRows = [
  {
    problem: "Provider dashboards tell you what you spent after the fact.",
    answer: "Tokenometer measures the request where it happened and keeps the raw usage event attributable to the app behind it.",
  },
  {
    problem: "Historical APIs are inconsistent and often require elevated keys.",
    answer: "Tokenometer treats provider history as reconciliation input, not the only source of truth.",
  },
  {
    problem: "Finance, ops, and product look at different surfaces.",
    answer: "Ledger, reports, allocations, and exports all sit on top of the same usage layer.",
  },
];

const audiences = [
  {
    name: "AI product teams",
    body: "Teams shipping multiple provider-backed apps and needing clearer attribution than provider dashboards usually give them.",
  },
  {
    name: "Platform operators",
    body: "People responsible for rollout safety, continuity, provider choice, model drift, and integration visibility across environments.",
  },
  {
    name: "Finance and governance",
    body: "Stakeholders who need a spend story they can trust, with reconciliation, ownership, exportability, and policy controls.",
  },
];

export default function MarketingSitePage() {
  return (
    <div className="bg-[#06101b] text-on-background">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(34,211,238,0.14),transparent_32%),radial-gradient(circle_at_88%_12%,rgba(124,58,237,0.16),transparent_34%),linear-gradient(180deg,#08111d_0%,#06101b_62%,#07111d_100%)]" />

        <div className="relative mx-auto max-w-[1380px] px-6 pb-12 pt-8 sm:px-8 lg:px-12 lg:pb-16">
          <header className="flex items-center justify-between gap-5">
            <Link href="/site" className="flex items-center gap-3">
              <Image
                src="/marketing/tokenometer-logo-gradient-transparent.png"
                alt="Tokenometer"
                width={280}
                height={84}
                className="h-10 w-auto sm:h-11"
                priority
              />
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/90 transition hover:border-primary/40 hover:text-primary"
              >
                Open Demo
              </Link>
              <Link
                href="/login"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-primary-container"
              >
                Open App
              </Link>
            </div>
          </header>

          <div className="grid gap-10 pb-10 pt-12 lg:grid-cols-[0.95fr,1.05fr] lg:items-center lg:pt-16">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Live AI usage operating layer
              </div>
              <h1 className="font-display text-[42px] leading-[0.96] text-white sm:text-[58px] lg:text-[82px]">
                AI spend that starts from the request, not the invoice.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
                Tokenometer measures real AI traffic, attributes it to named app identities,
                reconciles provider history when it exists, and turns token consumption into
                something teams can actually govern.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/"
                  className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-primary-container"
                >
                  Explore the demo
                </Link>
                <Link
                  href="/login"
                  className="rounded-lg border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white transition hover:border-primary/50 hover:text-primary"
                >
                  Open the app
                </Link>
                <a
                  href="mailto:hello@tokenometer.cloud?subject=Tokenometer%20Walkthrough"
                  className="rounded-lg border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
                >
                  Book a walkthrough
                </a>
              </div>

              <div className="mt-10 grid gap-6 border-t border-white/10 pt-8 sm:grid-cols-3">
                <HeroMetric
                  label="Truth source"
                  value="Live traffic first"
                  body="Provider history is useful reconciliation, not the only accounting story."
                />
                <HeroMetric
                  label="Identity layer"
                  value="Named integrations"
                  body="Apps become attributable objects with ownership, health, environment, and rollout state."
                />
                <HeroMetric
                  label="Governance"
                  value="Same layer"
                  body="Budgets, approvals, allocations, and chargeback ride on the exact usage events."
                />
              </div>
            </div>

            <div className="relative">
              <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(12,21,38,0.92),rgba(8,15,27,0.82))] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                      Inside the product
                    </div>
                    <div className="mt-1 font-display text-2xl text-white">
                      Product proof, not a mockup
                    </div>
                  </div>
                  <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                    Demo + live modes
                  </div>
                </div>

                <p className="mb-4 max-w-2xl text-sm leading-7 text-slate-300">
                  Tokenometer already ships the operator surfaces that matter: rollout,
                  verification, reporting, reconciliation, and governance.
                </p>

                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0b1626]">
                  <div className="absolute inset-x-0 top-0 z-10 h-20 bg-[linear-gradient(180deg,rgba(6,16,27,0.16),rgba(6,16,27,0))]" />
                  <div className="relative aspect-[16/10]">
                    <Image
                      src="/marketing/dashboard.png"
                      alt="Tokenometer dashboard"
                      fill
                      priority
                      className="object-cover object-top"
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <BadgeRow title="Gateway" body="Wire and validate one app safely" />
                  <BadgeRow title="Ledger" body="Verify the raw usage event" />
                  <BadgeRow title="Reports" body="Read spend with reconciliation context" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#081220]">
        <div className="mx-auto max-w-[1380px] px-6 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.56fr,1.44fr]">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Why this exists
              </div>
              <h2 className="mt-3 font-display text-3xl text-white sm:text-4xl">
                Provider billing surfaces are part of the picture, not the whole picture.
              </h2>
            </div>

            <div className="overflow-hidden rounded-xl border border-white/10">
              {comparisonRows.map((row, index) => (
                <div
                  key={row.problem}
                  className={`grid gap-4 px-5 py-5 lg:grid-cols-[0.92fr,1.08fr] ${
                    index % 2 === 0 ? "bg-[#0b1627]" : "bg-[#0d1a2d]"
                  }`}
                >
                  <div className="text-sm leading-7 text-slate-400">{row.problem}</div>
                  <div className="text-sm leading-7 text-slate-100">{row.answer}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#06101b]">
        <div className="mx-auto max-w-[1380px] px-6 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.48fr,1.52fr]">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Operator loop
              </div>
              <h2 className="mt-3 font-display text-3xl text-white sm:text-4xl">
                A calmer way to wire AI products into accountability.
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {operatorLoop.map((item) => (
                <article
                  key={item.step}
                  className="min-h-[220px] border-t border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))] px-5 py-5"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                    {item.step}
                  </div>
                  <h3 className="mt-4 font-display text-xl text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#081220]">
        <div className="mx-auto max-w-[1380px] px-6 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Product proof
              </div>
              <h2 className="mt-3 font-display text-3xl text-white sm:text-4xl">
                A control plane with working operator surfaces already in place.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-slate-300">
              Tokenometer is already built around real surfaces for rollout, verification,
              reporting, reconciliation, and governance. This is the product, not a teaser.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.2fr,0.8fr]">
            <article className="overflow-hidden rounded-xl border border-white/10 bg-[#0c1526]">
              <div className="relative aspect-[16/10] border-b border-white/10">
                <Image
                  src="/marketing/dashboard.png"
                  alt="Tokenometer dashboard"
                  fill
                  className="object-cover object-top"
                />
              </div>
              <div className="grid gap-5 p-6 lg:grid-cols-[0.56fr,1.44fr]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  Dashboard
                </div>
                <p className="text-sm leading-7 text-slate-300">
                  Watch live usage, provider distribution, project attribution, and reporting
                  freshness without losing the operational detail underneath the topline numbers.
                </p>
              </div>
            </article>

            <div className="grid gap-6">
              {proofPanels.map((item) => (
                <article
                  key={item.title}
                  className="grid overflow-hidden rounded-xl border border-white/10 bg-[#0c1526] md:grid-cols-[0.95fr,1.05fr]"
                >
                  <div className="relative min-h-[220px] border-b border-white/10 md:border-b-0 md:border-r">
                    <Image src={item.image} alt={item.title} fill className="object-cover object-top" />
                  </div>
                  <div className="p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                      {item.title}
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#06101b]">
        <div className="mx-auto max-w-[1380px] px-6 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="mb-10 max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Who it is for
            </div>
            <h2 className="mt-3 font-display text-3xl text-white sm:text-4xl">
              For teams treating AI usage as infrastructure, not as an afterthought.
            </h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {audiences.map((item) => (
              <article
                key={item.name}
                className="border-t border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0))] px-5 py-6"
              >
                <h3 className="font-display text-xl text-white">{item.name}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#081220]">
        <div className="mx-auto max-w-[1240px] px-6 py-20 sm:px-8 lg:px-12 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-[0.9fr,1.1fr] lg:items-end">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Try it properly
              </div>
              <h2 className="mt-3 font-display text-3xl text-white sm:text-4xl">
                See how AI usage looks when the measurement layer is part of the product.
              </h2>
            </div>

            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link
                href="/"
                className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-primary-container"
              >
                Open demo mode
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white transition hover:border-primary/50 hover:text-primary"
              >
                Open the app
              </Link>
              <a
                href="mailto:hello@tokenometer.cloud?subject=Tokenometer%20Walkthrough"
                className="rounded-lg border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                Contact
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function HeroMetric({
  label,
  value,
  body,
}: {
  label: string;
  value: string;
  body: string;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 font-display text-xl text-white">{value}</div>
      <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>
    </div>
  );
}

function BadgeRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
        {title}
      </div>
      <div className="mt-1 text-sm text-slate-200">{body}</div>
    </div>
  );
}
