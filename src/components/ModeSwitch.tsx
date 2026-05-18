import clsx from "clsx";
import { setModeAction } from "@/app/actions";
import type { AppMode } from "@/lib/auth";

export function ModeSwitch({
  mode,
  admin,
  compact = false,
  redirectTo = "/",
}: {
  mode: AppMode;
  admin: boolean;
  compact?: boolean;
  redirectTo?: string;
}) {
  return (
    <form
      action={setModeAction}
      className={clsx(
        "inline-grid grid-cols-2 rounded-lg border border-border-subtle bg-surface-elevated/70 p-1",
        compact ? "text-[11px]" : "text-[12px]"
      )}
    >
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button
        name="mode"
        value="demo"
        className={clsx(
          "rounded-md px-3 py-1.5 font-mono font-semibold uppercase tracking-wider transition-colors",
          mode === "demo"
            ? "bg-tertiary-container text-on-tertiary"
            : "text-text-muted hover:text-on-surface"
        )}
      >
        Demo
      </button>
      <button
        name="mode"
        value="live"
        title={admin ? "Show live ingested/proxied usage" : "Admin login required"}
        className={clsx(
          "rounded-md px-3 py-1.5 font-mono font-semibold uppercase tracking-wider transition-colors",
          mode === "live"
            ? "bg-primary text-on-primary"
            : admin
              ? "text-text-muted hover:text-on-surface"
              : "text-slate-600"
        )}
      >
        Live
      </button>
    </form>
  );
}
