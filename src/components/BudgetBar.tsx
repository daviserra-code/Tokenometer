import clsx from "clsx";

export function BudgetBar({
  spend,
  budget,
  warningPct = 50,
  criticalPct = 80,
  showLabel = true,
  segmented = false,
}: {
  spend: number;
  budget: number;
  warningPct?: number;
  criticalPct?: number;
  showLabel?: boolean;
  /** Show segmented look (5 segments) like the Stitch budget bar. */
  segmented?: boolean;
}) {
  const pct = budget > 0 ? Math.min((spend / budget) * 100, 100) : 0;
  const rawPct = budget > 0 ? (spend / budget) * 100 : 0;
  const overBudget = budget > 0 && spend > budget;
  const tone =
    overBudget || rawPct >= 100
      ? "bg-status-exceeded"
      : rawPct >= criticalPct
      ? "bg-status-warning"
      : rawPct >= warningPct
      ? "bg-input-token"
      : "bg-status-normal";

  const textTone =
    overBudget || rawPct >= 100
      ? "text-status-exceeded"
      : rawPct >= criticalPct
      ? "text-status-warning"
      : rawPct >= warningPct
      ? "text-input-token"
      : "text-status-normal";

  return (
    <div className="w-full">
      {showLabel && (
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className={clsx("font-mono font-semibold", textTone)}>
            {rawPct.toFixed(0)}%
          </span>
          {overBudget && (
            <span className="font-mono text-caps text-status-exceeded">Over</span>
          )}
        </div>
      )}
      <div
        className={clsx(
          "h-2 w-full overflow-hidden rounded-full bg-slate-800/80",
          segmented &&
            "[background-image:repeating-linear-gradient(to_right,transparent_0,transparent_calc(20%-1px),#0F172A_calc(20%-1px),#0F172A_20%)]"
        )}
      >
        <div
          className={clsx("h-full rounded-full transition-all", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
