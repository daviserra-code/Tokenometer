import Link from "next/link";
import clsx from "clsx";

import { Card } from "@/components/Card";

type SurfaceKey = "credentials" | "integrations" | "gateway";

const SURFACE_DEFS: Record<
  SurfaceKey,
  {
    title: string;
    href: string;
    icon: string;
    role: string;
  }
> = {
  credentials: {
    title: "Credentials",
    href: "/settings/credentials",
    icon: "vpn_key",
    role: "Vault provider keys and run the guided provider tests.",
  },
  integrations: {
    title: "Integrations",
    href: "/settings/integrations",
    icon: "deployed_code",
    role: "Name each app identity, assign ownership, and keep rollout metadata healthy.",
  },
  gateway: {
    title: "Gateway",
    href: "/gateway",
    icon: "api",
    role: "Generate rollout snippets, choose the mode, and verify live request metadata.",
  },
};

export function SetupSurfaceGuide({
  current,
  nextHref,
  nextLabel,
  nextBody,
}: {
  current: SurfaceKey;
  nextHref: string;
  nextLabel: string;
  nextBody: string;
}) {
  return (
    <Card
      title="Control-plane flow"
      description="These three surfaces now work as one sequence: secrets, app identity, then rollout and verification."
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr,1fr]">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {(Object.keys(SURFACE_DEFS) as SurfaceKey[]).map((key, index) => {
            const surface = SURFACE_DEFS[key];
            const active = key === current;
            return (
              <Link
                key={key}
                href={surface.href}
                className={clsx(
                  "rounded-lg border p-4 transition",
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border-subtle bg-background hover:border-primary/40 hover:bg-surface-2",
                )}
              >
                <div className="flex items-center gap-2">
                  <div className={clsx("flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold", active ? "bg-primary text-on-primary" : "bg-surface-elevated text-text-muted")}>
                    {index + 1}
                  </div>
                  <span className="material-symbols-outlined text-primary">{surface.icon}</span>
                </div>
                <strong className="mt-3 block text-on-surface">{surface.title}</strong>
                <span className="mt-1 block text-[12px] text-text-muted">{surface.role}</span>
                <span className={clsx("mt-3 block text-[12px] font-semibold", active ? "text-primary" : "text-text-muted")}>
                  {active ? "Current surface" : "Open surface"}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="rounded-lg border border-border-subtle bg-background p-4">
          <div className="text-[12px] uppercase tracking-wider text-text-muted">Best next move from here</div>
          <strong className="mt-2 block text-on-surface">{nextLabel}</strong>
          <p className="mt-1 text-sm text-text-muted">{nextBody}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={nextHref}
              className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              Open next step
            </Link>
            <Link
              href="/setup"
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold text-on-surface hover:border-primary/40"
            >
              <span className="material-symbols-outlined text-[18px]">checklist</span>
              Open setup hub
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
