import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tokenometer | AI usage operating layer",
  description:
    "Measure AI spend at call time, attribute usage across apps and teams, reconcile provider history, and govern consumption with budgets, wallets, and chargeback.",
};

const featureCards = [
  {
    title: "Live metering",
    body: "Route requests through Tokenometer, or report signed usage back after a direct provider call. This is the primary truth source.",
  },
  {
    title: "Provider reconciliation",
    body: "Import provider history where available, compare it to live totals, and detect drift instead of pretending every provider tells the same story.",
  },
  {
    title: "Governance on top",
    body: "Turn raw usage into budgets, allocations, approvals, wallet controls, and chargeback without separating finance from the underlying request path.",
  },
];

const surfaceCards = [
  {
    title: "Gateway",
    body: "Choose provider and rollout mode, generate env blocks, inspect request IDs, and validate real app traffic.",
    image: "/marketing/credentials.png",
  },
  {
    title: "Ledger",
    body: "Inspect raw usage events with provider, model, integration, workflow, metering path, tokens, and cost.",
    image: "/marketing/ledger.png",
  },
  {
    title: "Reports",
    body: "Track daily, weekly, and monthly spend with reconciliation context included in the view, PDF, and CSV exports.",
    image: "/marketing/spend.png",
  },
  {
    title: "Governance",
    body: "Manage wallets, reserves, allocations, approvals, and early internal chargeback from the same operating layer.",
    image: "/marketing/wallet.png",
  },
];

const differentiation = [
  "Live metering first, provider history second",
  "Named integrations with ownership, health, and environment context",
  "Metering-path transparency on every event",
  "Reconciliation visible where spend is reviewed",
  "Budgets, wallets, and chargeback built on top of usage",
];

const audiences = [
  {
    title: "AI product teams",
    body: "For teams shipping apps on OpenAI, Gemini, Anthropic, DeepSeek, Mistral, or mixed-provider stacks.",
  },
  {
    title: "Internal AI platforms",
    body: "For operators managing multiple apps, agents, and environments who need trustworthy usage visibility across the estate.",
  },
  {
    title: "Finance and governance",
    body: "For people who need cost clarity, attribution, budget control, and a sane bridge between product traffic and provider history.",
  },
];

export default function MarketingSitePage() {
  return (
    <div className="bg-[#09111d] text-on-background">
      <section className="relative min-h-[100svh] overflow-hidden border-b border-white/10">
        <Image
          src="/marketing/dashboard.png"
          alt="Tokenometer dashboard"
          fill
          priority
          className="object-cover object-top opacity-40"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,10,18,0.3)_0%,rgba(5,10,18,0.76)_42%,rgba(5,10,18,0.94)_100%)]" />
        <div className="relative mx-auto flex min-h-[100svh] max-w-[1280px] flex-col justify-between px-6 pb-10 pt-8 sm:px-8 lg:px-12">
          <header className="flex items-center justify-between gap-4">
            <Link
              href="/site"
              className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-primary"
            >
              <span className="material-symbols-outlined text-[22px]">monitoring</span>
              <span>Tokenometer</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="rounded-lg border border-white/15 bg-black/15 px-4 py-2 text-sm font-semibold text-white/90 transition hover:border-primary/50 hover:text-primary"
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

          <div className="max-w-3xl pb-14 pt-16 md:pb-24 lg:pb-28">
            <div className="mb-5 inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              AI usage operating layer
            </div>
            <h1 className="max-w-4xl font-display text-[42px] leading-[1.04] text-white sm:text-[54px] lg:text-[72px]">
              Measure AI spend at call time.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
              Tokenometer meters live AI traffic, attributes usage across apps and teams, reconciles
              against provider history when available, and turns token consumption into something
              governable.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-primary-container"
              >
                Open Demo
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-primary/50 hover:text-primary"
              >
                Open App
              </Link>
              <a
                href="mailto:hello@tokenometer.cloud?subject=Tokenometer%20Walkthrough"
                className="rounded-lg border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                Book a Walkthrough
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              {[
                "Live metering gateway",
                "Provider reconciliation",
                "Named integrations",
                "Wallets, budgets, and chargeback",
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-medium text-slate-200"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-300">
            <span className="material-symbols-outlined text-[18px] text-primary">south</span>
            See why provider dashboards are not enough
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0b1524]">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-6 py-16 sm:px-8 lg:grid-cols-[1.1fr,0.9fr] lg:px-12 lg:py-20">
          <div>
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Why Tokenometer
            </div>
            <h2 className="font-display text-3xl text-white sm:text-4xl">
              Provider dashboards are not enough.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
              Provider billing views are useful, but they are not the same thing as operational truth.
              Teams shipping real AI products run into the same problems quickly: inconsistent history
              APIs, admin-key restrictions, weak attribution, and spend that shows up after the fact
              instead of where decisions happen.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              "Historical APIs differ wildly",
              "Admin keys are often required",
              "App-level attribution gets muddy",
              "Finance sees usage too late",
            ].map((item) => (
              <div
                key={item}
                className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-200"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#09111d]">
        <div className="mx-auto max-w-[1280px] px-6 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="mb-10 max-w-3xl">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              How it works
            </div>
            <h2 className="font-display text-3xl text-white sm:text-4xl">
              Three ways usage enters Tokenometer.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Live metering is the primary path. Provider history and CSV backfill are supporting
              paths that improve confidence and recovery, not replacements for measuring the app
              traffic itself.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {featureCards.map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-white/10 bg-[#0f1a2d] p-6"
              >
                <h3 className="font-display text-xl text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0b1524]">
        <div className="mx-auto max-w-[1280px] px-6 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="mb-10 max-w-3xl">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Product surfaces
            </div>
            <h2 className="font-display text-3xl text-white sm:text-4xl">
              Built for real operator work.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Tokenometer is not just a spend dashboard. It is a working control plane for AI usage,
              from rollout to ledger verification to governance.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {surfaceCards.map((item) => (
              <article key={item.title} className="overflow-hidden rounded-lg border border-white/10 bg-[#0f1a2d]">
                <div className="relative aspect-[16/10] overflow-hidden border-b border-white/10">
                  <Image src={item.image} alt={item.title} fill className="object-cover object-top" />
                </div>
                <div className="p-6">
                  <h3 className="font-display text-xl text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#09111d]">
        <div className="mx-auto max-w-[1280px] px-6 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="mb-10 max-w-3xl">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Why it is different
            </div>
            <h2 className="font-display text-3xl text-white sm:text-4xl">
              Built around live usage, not after-the-fact billing.
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {differentiation.map((item) => (
              <div
                key={item}
                className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-200"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0b1524]">
        <div className="mx-auto max-w-[1280px] px-6 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="mb-10 max-w-3xl">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Who it is for
            </div>
            <h2 className="font-display text-3xl text-white sm:text-4xl">
              For teams shipping serious AI products.
            </h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {audiences.map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-white/10 bg-[#0f1a2d] p-6"
              >
                <h3 className="font-display text-xl text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#09111d]">
        <div className="mx-auto max-w-[1100px] px-6 py-20 text-center sm:px-8 lg:px-12 lg:py-24">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Final call
          </div>
          <h2 className="font-display text-3xl text-white sm:text-4xl">
            See how AI usage looks when it is measured properly.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-300">
            Try the demo to understand the product shape, or open the app to work with the real
            control plane that already meters live traffic from production integrations.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-primary-container"
            >
              Open Demo
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-primary/50 hover:text-primary"
            >
              Open App
            </Link>
            <a
              href="mailto:hello@tokenometer.cloud?subject=Tokenometer%20Walkthrough"
              className="rounded-lg border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
            >
              Contact
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
