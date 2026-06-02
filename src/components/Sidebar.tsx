"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { NAV_SECTIONS, SECONDARY_NAV } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-64px)] w-64 shrink-0 flex-col border-r border-slate-800/80 bg-slate-950 lg:flex">
      {/* Brand block */}
      <div className="flex items-center gap-3 border-b border-slate-800/50 p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-surface">
          <span className="material-symbols-outlined text-primary">radar</span>
        </div>
        <div>
          <h2 className="font-display text-body-lg font-semibold leading-tight text-white">
            Tokenometer
          </h2>
          <p className="font-mono text-caps text-slate-400">AI Token Wallet & FinOps</p>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="px-3 pb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
              {section.label}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "group flex items-center gap-3 rounded-lg px-3 py-2.5 font-display text-[14px] transition-all",
                      active
                        ? "border-r-2 border-primary-container bg-primary-container/10 text-primary"
                        : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                    )}
                  >
                    <span
                      className={clsx(
                        "material-symbols-outlined text-[20px]",
                        active && "filled"
                      )}
                    >
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Secondary section */}
      <div className="border-t border-slate-800/50 p-4">
        <div className="mb-3 px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
          Admin controls
        </div>
        <div className="mb-4 flex flex-col gap-1">
          {SECONDARY_NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 font-mono text-caps transition-colors",
                  active
                    ? "bg-slate-900 text-slate-100"
                    : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-100"
                )}
                href={item.href}
              >
                <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
        <Link
          href="/wallet/pack"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 py-2 font-mono text-caps text-primary transition-all hover:bg-primary hover:text-on-primary"
        >
          <span className="material-symbols-outlined text-[16px]">folder_zip</span>
          Monthly Close Pack
        </Link>
      </div>
    </aside>
  );
}
