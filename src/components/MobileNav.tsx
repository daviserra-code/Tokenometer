"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { MOBILE_NAV_ITEMS } from "./nav-items";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-stretch justify-around border-t border-slate-800/80 bg-slate-950/95 backdrop-blur-md lg:hidden">
      {MOBILE_NAV_ITEMS.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "flex flex-1 flex-col items-center justify-center gap-1 px-1 text-center font-display text-[11px] transition-colors",
              active ? "text-primary" : "text-slate-400 hover:text-slate-200"
            )}
          >
            <span
              className={clsx(
                "material-symbols-outlined text-[22px]",
                active && "filled"
              )}
            >
              {item.icon}
            </span>
            <span className="leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
