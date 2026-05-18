"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 60_000;

export function AutoRefresh() {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setLastRefresh(new Date());
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [router]);

  return (
    <button
      type="button"
      onClick={() => {
        router.refresh();
        setLastRefresh(new Date());
      }}
      className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-[12px] font-semibold text-text-muted transition-colors hover:border-primary hover:text-primary"
      title={`Auto-refreshes every ${REFRESH_INTERVAL_MS / 1000} seconds while this tab is visible`}
    >
      <span className="material-symbols-outlined text-[16px]">refresh</span>
      Refreshed {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </button>
  );
}
