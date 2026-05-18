import clsx from "clsx";

const PROVIDER_STYLES: Record<
  string,
  { code: string; bg: string; text: string; dot: string }
> = {
  openai: {
    code: "OAI",
    bg: "bg-status-normal/15",
    text: "text-status-normal",
    dot: "bg-status-normal",
  },
  anthropic: {
    code: "ANT",
    bg: "bg-status-warning/15",
    text: "text-status-warning",
    dot: "bg-status-warning",
  },
  google: {
    code: "GGL",
    bg: "bg-input-token/15",
    text: "text-input-token",
    dot: "bg-input-token",
  },
  mistral: {
    code: "MST",
    bg: "bg-output-token/15",
    text: "text-output-token",
    dot: "bg-output-token",
  },
  meta: {
    code: "META",
    bg: "bg-secondary/15",
    text: "text-secondary",
    dot: "bg-secondary",
  },
};

function styleFor(name: string) {
  const key = name.toLowerCase();
  for (const k of Object.keys(PROVIDER_STYLES)) {
    if (key.includes(k)) return PROVIDER_STYLES[k];
  }
  // Fallback
  return {
    code: name.slice(0, 3).toUpperCase(),
    bg: "bg-slate-800",
    text: "text-text-muted",
    dot: "bg-slate-500",
  };
}

export function ProviderChip({
  name,
  showDot = true,
  showCode = true,
}: {
  name: string;
  showDot?: boolean;
  showCode?: boolean;
}) {
  const s = styleFor(name);
  return (
    <span className="inline-flex items-center gap-2 font-sans text-body-md text-on-surface">
      {showDot && <span className={clsx("h-2 w-2 rounded-full", s.dot)} />}
      <span>{name}</span>
      {showCode && (
        <span
          className={clsx(
            "rounded px-1.5 py-px font-mono text-[10px] font-bold uppercase",
            s.bg,
            s.text
          )}
        >
          {s.code}
        </span>
      )}
    </span>
  );
}

export function ProviderTag({ name }: { name: string }) {
  const s = styleFor(name);
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide",
        s.bg,
        s.text
      )}
    >
      {s.code}
    </span>
  );
}
