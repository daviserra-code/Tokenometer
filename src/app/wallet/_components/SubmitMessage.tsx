"use client";

import { useFormStatus } from "react-dom";

export function SubmitMessage() {
  const { pending } = useFormStatus();
  return (
    <span className="text-[12px] text-text-muted">
      {pending ? "Submitting…" : "All amounts are in raw tokens."}
    </span>
  );
}
