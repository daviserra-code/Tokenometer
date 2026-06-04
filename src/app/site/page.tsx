import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tokenometer | AI usage operating layer",
  description:
    "Measure AI spend at call time, attribute usage across apps and teams, reconcile provider history, and govern consumption with budgets, wallets, and chargeback.",
};

const pathways = [
  {
    title: "Live metering",
    body: "Measure the request where it actually happens, either through the Tokenometer gateway or signed observe-mode ingest.",
    accent: "text-primary",
  },
  {
    title: "Provider reconciliation",
    body: "Import provider-side history when available and compare it against live totals instead of pretending every provider exposes the same data.",
    accent: "text-status-normal",
  },
  {
    title: "Governance",
    body: "Turn usage into budgets, allocations, approvals, wallet controls, and chargeback without splitting the finance story from the traffic story.",
    accent: "text-secondary",
  },
];

const proofGrid = [
  {
    title: "Gateway",
    body: "Roll out integrations safely, choose the metering path, inspect request IDs, and validate real app traffic.",
    image: "/marketing/credentials.png",
  },
  {
    title: "Ledger",
    body: "Inspect raw events with provider, model, integration, project, workflow, token totals, and metering path.",
    image: "/marketing/ledger.png",
  },
  {
    title: "Reports",
    body: "See daily, weekly, and monthly spend with reconciliation context inside the same reporting surface.",
    image: "/marketing/spend.png",
  },
  {
    title: "Governance",
    body: "Move from observation into control with wallets, reserves, allocations, approvals, and early chargeback.",
    image: "/marketing/wallet.png",
  },
];

const comparisonRows = [
  {
    left: "Provider dashboards show billing after the fact",
    right: "Tokenometer measures the app traffic itself and explains how each event was captured",
  },
  {
    left: "Historical usage APIs differ by provider and often need elevated access",
    right: "Tokenometer treats provider history as reconciliation, not the only source of truth",
  },
  {
    left: "App-level attribution gets muddy across projects, teams, workflows, and environments",
    right: "Named integrations make usage attributable to the real app identity behind the traffic",
  },
  {
    left: "Finance and ops often look at different systems",
    right: "Reconciliation, budgets, wallets, and exports sit on top of the same metered usage layer",
  },
];

const audiences = [
  "AI product teams shipping multiple provider-backed apps",
  "Internal AI platform operators responsible for visibility across environments",
  "Finance and governance stakeholders who need spend clarity with attribution",
];

export default function MarketingSitePage() {
  return (
    <div className="bg-[#07101c] text-on-background">
      <section className="relative min-h-[100svh] overflow-hidden border-b border-white/10">
        <Image
          src="/marketing/dashboard.png"
          alt="Tokenometer dashboard"
          fill
          priority
          className="object-cover object-top opacity-35"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,8,15,0.2)_0%,rgba(4,8,15,0.72)_40%,rgba(4,8,15,0.96)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-[linear-gradient(180deg,rgba(8,16,28,0)_0%,#07101c_100%)]" />

        <div className="relative mx-auto flex min-h-[100svh] max-w-[1320px] flex-col px-6 pb-8 pt-8 sm:px-8 lg:px-12">
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

          <div className="flex flex-1 flex-col justify-center pb-16 pt-12 lg:pb-24">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                AI usage operating layer
              </div>
              <h1 className="max-w-4xl font-display text-[42px] leading-[1.02] text-white sm:text-[56px] lg:text-[76px]">
                Measure AI spend at call time.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
                Tokenometer meters live AI traffic, attributes usage across apps and teams,
                reconciles provider history when it exists, and turns token consumption into
                something governable.
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
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                "Live metering gateway",
                "Provider reconciliation",
                "Named integrations",
                "Wallets, budgets, and chargeback",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-slate-100 backdrop-blur-sm"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border border-white/10 bg-[#081220]/80 p-4 backdrop-blur-md sm:grid-cols-3">
            <Metric label="Reality" value="Live traffic first" hint="Provider history is reconciliation, not the main truth source." />
            <Metric label="Identity" value="Named integrations" hint="Apps become attributable objects with health, owner, and environment context." />
            <Metric label="Confidence" value="Metering path visible" hint="Every event can show whether it was proxy-captured, signed-ingest, synced, or imported." />
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#091321]">
        <div className="mx-auto max-w-[1320px] px-6 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="mb-10 max-w-3xl">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Why Tokenometer
            </div>
            <h2 className="font-display text-3xl text-white sm:text-4xl">
              Provider dashboards are useful. They are not enough.
            </h2>
          </div>

          <div className="overflow-hidden rounded-xl border border-white/10">
            {comparisonRows.map((row, index) => (
              <div
                key={row.left}
                className={`grid gap-4 px-5 py-5 lg:grid-cols-[0.95fr,1.05fr] ${
                  index % 2 === 0 ? "bg-[#0d1829]" : "bg-[#0a1322]"
                }`}
              >
                <div className="text-sm leading-7 text-slate-400">{row.left}</div>
                <div className="text-sm leading-7 text-slate-100">{row.right}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#07101c]">
        <div className="mx-auto max-w-[1320px] px-6 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="mb-10 max-w-3xl">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              How it works
            </div>
            <h2 className="font-display text-3xl text-white sm:text-4xl">
              Three paths, one operating layer.
            </h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {pathways.map((item) => (
              <div key={item.title} className="rounded-xl border border-white/10 bg-[#0c1526] p-6">
                <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${item.accent}`}>
                  {item.title}
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-300">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#091321]">
        <div className="mx-auto max-w-[1320px] px-6 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="mb-10 max-w-3xl">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Product proof
            </div>
            <h2 className="font-display text-3xl text-white sm:text-4xl">
              Real operator surfaces, not product sketches.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Tokenometer already exposes the working control plane: rollout, ledger verification,
              spend views, reconciliation, and governance.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <article className="overflow-hidden rounded-xl border border-white/10 bg-[#0f1a2d] lg:col-span-7">
              <div className="relative aspect-[16/10] border-b border-white/10">
                <Image src="/marketing/dashboard.png" alt="Tokenometer dashboard" fill className="object-cover object-top" />
              </div>
              <div className="p-6">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  Dashboard and spend visibility
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  See top-line cost, provider distribution, project attribution, and freshness of
                  live usage data without losing the operational context underneath it.
                </p>
              </div>
            </article>

            <div className="grid gap-6 lg:col-span-5">
              {proofGrid.slice(0, 2).map((item) => (
                <article key={item.title} className="overflow-hidden rounded-xl border border-white/10 bg-[#0f1a2d]">
                  <div className="relative aspect-[16/9] border-b border-white/10">
                    <Image src={item.image} alt={item.title} fill className="object-cover object-top" />
                  </div>
                  <div className="p-5">
                    <h3 className="font-display text-xl text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {proofGrid.slice(2).map((item) => (
              <article key={item.title} className="overflow-hidden rounded-xl border border-white/10 bg-[#0f1a2d]">
                <div className="relative aspect-[16/9] border-b border-white/10">
                  <Image src={item.image} alt={item.title} fill className="object-cover object-top" />
                </div>
                <div className="p-5">
                  <h3 className="font-display text-xl text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-300">{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#07101c]">
        <div className="mx-auto max-w-[1320px] px-6 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="mb-10 max-w-3xl">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Why it is different
            </div>
            <h2 className="font-display text-3xl text-white sm:text-4xl">
              Built around live usage, not after-the-fact billing.
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              "Live metering first, provider history second",
              "Named integrations with owner, health, and environment context",
              "Metering-path transparency on each event",
              "Reconciliation visible where spend is reviewed",
              "Budgets, wallets, and chargeback built on the same usage layer",
            ].map((item) => (
              <div key={item} className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#091321]">
        <div className="mx-auto max-w-[1320px] px-6 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="mb-10 max-w-3xl">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Who it is for
            </div>
            <h2 className="font-display text-3xl text-white sm:text-4xl">
              For teams shipping serious AI products.
            </h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {audiences.map((item, index) => (
              <div key={item} className="rounded-xl border border-white/10 bg-[#0f1a2d] p-6">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <p className="text-sm leading-7 text-slate-200">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#07101c]">
        <div className="mx-auto max-w-[1120px] px-6 py-20 text-center sm:px-8 lg:px-12 lg:py-24">
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

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/10 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 font-display text-xl text-white">{value}</div>
      <p className="mt-2 text-sm leading-6 text-slate-300">{hint}</p>
    </div>
  );
}
