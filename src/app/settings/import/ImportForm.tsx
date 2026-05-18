"use client";

import { useFormState, useFormStatus } from "react-dom";
import { importCsvAction, type ImportActionState } from "../actions";

export function ImportForm({ organizationId }: { organizationId: string }) {
  const [state, formAction] = useFormState<ImportActionState | null, FormData>(
    async (_prev, fd) => importCsvAction(fd),
    null
  );

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="organizationId" value={organizationId} />
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-text-muted">
            CSV file
          </span>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="block w-full rounded-lg border border-border-subtle bg-background p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-900 hover:file:bg-primary-container"
          />
        </label>
        <SubmitBtn />
      </form>

      {state && state.ok && (
        <div className="rounded-lg border border-status-normal/50 bg-status-normal/10 p-3 text-sm">
          <div className="font-semibold text-status-normal">Import complete</div>
          <div className="text-text-muted">
            Inserted {state.inserted}, failed {state.failed}. Job: {state.jobId}
          </div>
          {state.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-[12px] text-status-warning">
              {state.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state && !state.ok && (
        <div className="rounded-lg border border-status-exceeded/50 bg-status-exceeded/10 p-3 text-sm text-status-exceeded">
          {state.error}
        </div>
      )}
    </div>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-primary-container disabled:opacity-60"
    >
      {pending ? "Importing…" : "Import CSV"}
    </button>
  );
}
