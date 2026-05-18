import Link from "next/link";

export function Topbar() {
  return (
    <header className="sticky top-0 z-50 flex h-16 w-full items-center gap-3 border-b border-slate-800/50 bg-slate-950/80 px-4 backdrop-blur-md sm:px-6">
      {/* Brand (left) */}
      <Link
        href="/"
        className="flex shrink-0 items-center gap-2 font-display text-lg font-bold tracking-tighter text-primary-container sm:text-xl"
      >
        <span className="material-symbols-outlined text-[22px] text-primary-container">
          radar
        </span>
        <span className="hidden sm:inline">Tokenometer</span>
      </Link>

      {/* Search (md+) */}
      <div className="mx-2 hidden min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 md:flex">
        <span className="material-symbols-outlined shrink-0 text-[18px] text-slate-500">
          search
        </span>
        <input
          type="text"
          placeholder="Search projects, models, agents…"
          className="w-full min-w-0 bg-transparent font-sans text-body-md text-slate-200 placeholder:text-slate-500 focus:outline-none"
        />
      </div>

      {/* Spacer when search hidden */}
      <div className="flex-1 md:hidden" />

      {/* Right actions */}
      <div className="flex shrink-0 items-center gap-1">
        <IconButton href="#" label="Notifications" icon="notifications" />
        <IconButton href="/settings" label="Settings" icon="settings" />
        <IconButton href="#" label="Help" icon="help" />
        <div
          aria-label="Account"
          title="Account"
          className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-800 bg-surface-elevated"
        >
          <span className="material-symbols-outlined text-[18px] text-text-muted">
            person
          </span>
        </div>
      </div>
    </header>
  );
}

function IconButton({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-900/60 hover:text-primary"
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
    </Link>
  );
}
