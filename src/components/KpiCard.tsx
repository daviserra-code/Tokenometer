import clsx from "clsx";
import type { ReactNode } from "react";

type Tone = "default" | "success" | "warning" | "danger" | "input" | "output";

const ICON_TONE: Record<Tone, string> = {
  default: "text-text-muted",
  success: "text-status-normal",
  warning: "text-status-warning",
  danger: "text-status-exceeded",
  input: "text-input-token",
  output: "text-output-token",
};

const ACCENT_BAR: Record<Tone, string | null> = {
  default: null,
  success: "from-status-normal to-transparent",
  warning: "from-status-warning to-transparent",
  danger: "from-status-exceeded to-transparent",
  input: "from-input-token to-transparent",
  output: "from-output-token to-transparent",
};

export type Delta = {
  value: number;
  /**
   * If true, a positive delta is good (green). If false (default for cost/usage), a positive delta is bad.
   */
  positiveIsGood?: boolean;
  /** Override label shown after the percentage. Defaults to "%". */
  suffix?: string;
};

export function KpiCard({
  label,
  value,
  hint,
  delta,
  icon,
  tone = "default",
  accent = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: Delta;
  icon?: string; // Material Symbols name
  tone?: Tone;
  accent?: boolean; // shows the bottom gradient bar
}) {
  const renderDelta = () => {
    if (!delta || !isFinite(delta.value)) return null;
    const positiveIsGood = delta.positiveIsGood ?? false;
    const isUp = delta.value >= 0;
    const good = positiveIsGood ? isUp : !isUp;
    const color = good
      ? "bg-status-normal/10 text-status-normal"
      : "bg-status-warning/10 text-status-warning";
    return (
      <span
        className={clsx(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-caps",
          color
        )}
      >
        <span className="material-symbols-outlined text-[12px]">
          {isUp ? "trending_up" : "trending_down"}
        </span>
        {(delta.value >= 0 ? "+" : "") + delta.value.toFixed(1)}
        {delta.suffix ?? "%"}
      </span>
    );
  };

  const accentCls = accent ? ACCENT_BAR[tone] : null;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface p-card-padding transition-colors hover:border-primary/40">
      <div className="mb-4 flex items-start justify-between">
        <span className="font-mono text-caps text-text-muted">{label}</span>
        {icon && (
          <span
            className={clsx(
              "material-symbols-outlined text-[20px]",
              ICON_TONE[tone]
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mb-2 font-display text-kpi text-on-surface">{value}</div>
      <div className="mt-auto flex items-center gap-2">
        {renderDelta()}
        {hint && (
          <span className="font-mono text-[11px] text-text-muted">{hint}</span>
        )}
      </div>
      {accentCls && (
        <div
          className={clsx(
            "absolute bottom-0 left-0 h-[3px] w-1/3 bg-gradient-to-r",
            accentCls
          )}
        />
      )}
    </div>
  );
}
