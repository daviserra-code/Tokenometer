"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "@/app/actions";

export function LoginForm() {
  const [state, action] = useFormState<LoginState, FormData>(loginAction, {});

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block font-mono text-caps text-text-muted">
          Admin user
        </span>
        <input
          type="text"
          name="username"
          required
          autoComplete="username"
          defaultValue={state.username ?? "admin"}
          className="w-full rounded-lg border border-border-subtle bg-background px-3 py-3 text-on-surface outline-none transition-colors placeholder:text-text-muted focus:border-primary"
          placeholder="admin"
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-mono text-caps text-text-muted">
          Admin password
        </span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-border-subtle bg-background px-3 py-3 text-on-surface outline-none transition-colors placeholder:text-text-muted focus:border-primary"
          placeholder="Enter admin password"
        />
      </label>
      {state.totpRequired && (
        <label className="block">
          <span className="mb-1 block font-mono text-caps text-text-muted">
            2FA code
          </span>
          <input
            type="text"
            name="token"
            inputMode="numeric"
            pattern="[0-9]{6}"
            autoComplete="one-time-code"
            className="w-full rounded-lg border border-border-subtle bg-background px-3 py-3 font-mono text-on-surface outline-none transition-colors placeholder:text-text-muted focus:border-primary"
            placeholder="123456"
          />
        </label>
      )}
      {state.error && (
        <div className="rounded-lg border border-status-exceeded/40 bg-status-exceeded/10 p-3 text-sm text-status-exceeded">
          {state.error}
        </div>
      )}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-display text-body-md font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
    >
      <span className="material-symbols-outlined text-[18px]">login</span>
      {pending ? "Signing in..." : "Sign in"}
    </button>
  );
}
