import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import Link from "next/link";
import { wipeDemoDataAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const org = await prisma.organization.findFirst();
  const providers = await prisma.provider.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-section-gap">
      <PageHeader
        title="Settings"
        description="Organization-level configuration. Authentication is intentionally not enabled in this MVP."
      />

      <Card title="Data ingestion" description="Feed Tokenometer with real AI usage data.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SettingsLink
            href="/settings/credentials"
            icon="key"
            title="Provider credentials"
            desc="Vault encrypted API keys per provider (OpenAI, Anthropic, …)."
          />
          <SettingsLink
            href="/settings/ingest"
            icon="webhook"
            title="Ingest API & webhooks"
            desc="HMAC-signed POST /api/ingest for your services to push usage."
          />
          <SettingsLink
            href="/settings/import"
            icon="upload_file"
            title="CSV import"
            desc="One-shot bulk upload of historical usage data."
          />
        </div>
      </Card>

      <Card
        title="Reset workspace"
        description="Delete the seeded demo data so dashboards only show real usage you've synced or proxied."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-text-muted">
            Wipes all <strong className="text-on-surface">UsageEvents, WalletEntries, Invoices, Budgets, Projects, Teams</strong> and zeroes wallet balances.
            Keeps your <strong className="text-on-surface">vaulted API keys, ingest sources and model price catalog</strong>.
            After wiping, click <em>Sync now</em> on each credential to pull real data.
          </div>
          <form action={wipeDemoDataAction}>
            <button
              type="submit"
              className="rounded-lg border border-status-exceeded/40 bg-status-exceeded/10 px-4 py-2 text-sm font-semibold text-status-exceeded hover:bg-status-exceeded/20"
            >
              Wipe demo data
            </button>
          </form>
        </div>
      </Card>

      <Card
        title="Organization Profile"
        description="Identity and base currency used across all reports."
      >
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Organization Name">
            <input
              type="text"
              defaultValue={org?.name ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Currency">
            <input
              type="text"
              defaultValue={org?.currency ?? "USD"}
              className={inputCls}
            />
          </Field>
          <Field label="Default Provider">
            <select className={inputCls} defaultValue={providers[0]?.id ?? ""}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default Pricing Source">
            <select className={inputCls} defaultValue="manual">
              <option value="manual">Manual (admin-managed)</option>
              <option value="provider-api" disabled>
                Provider API (coming soon)
              </option>
            </select>
          </Field>
        </form>
      </Card>

      <Card
        title="Platform Preferences"
        description="UX and operational toggles for this workspace."
      >
        <div className="space-y-4">
          <Toggle
            id="demo-mode"
            label="Demo Mode"
            description="Use seeded demo data for dashboards instead of live ingestion."
            defaultChecked
          />
          <Toggle
            id="alerts"
            label="Budget Alerts"
            description="Send email alerts when budgets cross 50% / 80% / 100% thresholds."
            defaultChecked
          />
          <Toggle
            id="dark"
            label="Dark Theme (Default)"
            description="Force the dark theme. Light theme is not yet available."
            defaultChecked
          />
        </div>
      </Card>

      <Card
        title="Cost Calculation Rules"
        description="Formulas used to estimate cost from raw token counts."
      >
        <div className="space-y-4">
          <pre className="overflow-auto rounded-lg border border-border-subtle bg-surface-elevated/40 p-4 font-mono text-data leading-relaxed text-text-muted">
{`input_cost  = input_tokens  / 1,000,000 * input_price_per_million
output_cost = output_tokens / 1,000,000 * output_price_per_million
total_cost  = input_cost + output_cost`}
          </pre>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Markup % (applied to total cost)">
              <input
                type="number"
                defaultValue={0}
                step="0.1"
                className={inputCls}
              />
            </Field>
            <Field label="Fallback Currency">
              <input type="text" defaultValue="USD" className={inputCls} />
            </Field>
          </div>

          <Toggle
            id="sandbox"
            label="Sandbox Mode for new pricing rules"
            description="Test cost rules without affecting reports until promoted."
          />
        </div>
      </Card>

      <Card title="About">
        <p className="text-body-md text-text-muted">
          Tokenometer is an AI FinOps platform: it tracks AI token consumption,
          model usage and operational cost across providers, models, projects
          and teams. It is <strong className="text-on-surface">not</strong> a
          cryptocurrency, trading or wallet product.
        </p>
      </Card>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 font-sans text-body-md text-on-surface outline-none transition-colors focus:border-primary-container focus:ring-1 focus:ring-primary-container";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-caps text-text-muted">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  id,
  label,
  description,
  defaultChecked,
}: {
  id: string;
  label: string;
  description: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border-subtle/60 bg-surface-elevated/30 p-4">
      <div>
        <label
          htmlFor={id}
          className="font-display text-body-md font-semibold text-on-surface"
        >
          {label}
        </label>
        <p className="mt-0.5 font-sans text-[12px] text-text-muted">
          {description}
        </p>
      </div>
      <label className="relative inline-flex cursor-pointer items-center">
        <input
          id={id}
          type="checkbox"
          defaultChecked={defaultChecked}
          className="peer sr-only"
        />
        <div className="peer h-6 w-11 rounded-full bg-slate-700 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-primary-container peer-checked:after:translate-x-full" />
      </label>
    </div>
  );
}

function SettingsLink({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-elevated/40 p-4 transition-colors hover:border-primary"
    >
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">{icon}</span>
        <span className="font-display font-semibold text-on-surface">{title}</span>
      </div>
      <p className="text-[12px] text-text-muted">{desc}</p>
      <span className="mt-1 text-[12px] font-semibold text-primary group-hover:underline">
        Open →
      </span>
    </Link>
  );
}
