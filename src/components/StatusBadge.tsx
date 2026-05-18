import clsx from "clsx";

export function StatusBadge({
  status,
  size = "md",
}: {
  status: "NORMAL" | "WARNING" | "EXCEEDED" | string;
  size?: "sm" | "md";
}) {
  const map: Record<string, { label: string; cls: string }> = {
    NORMAL: {
      label: "Normal",
      cls: "bg-status-normal/10 text-status-normal ring-status-normal/30",
    },
    WARNING: {
      label: "Warning",
      cls: "bg-status-warning/10 text-status-warning ring-status-warning/30",
    },
    EXCEEDED: {
      label: "Exceeded",
      cls: "bg-status-exceeded/10 text-status-exceeded ring-status-exceeded/30",
    },
  };
  const cfg =
    map[status] ?? { label: status, cls: "bg-slate-800/60 text-text-muted ring-slate-700" };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded font-mono uppercase tracking-wider ring-1 ring-inset",
        cfg.cls,
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
      )}
    >
      {cfg.label}
    </span>
  );
}
