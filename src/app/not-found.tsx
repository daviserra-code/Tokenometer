import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="font-mono text-caps text-primary-container">404</p>
      <h1 className="mt-2 font-display text-h1 text-on-surface">Page not found</h1>
      <p className="mt-2 max-w-md font-sans text-body-md text-text-muted">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex items-center gap-2 rounded-lg border border-primary-container/40 bg-primary-container/10 px-4 py-2 font-display text-body-md font-semibold text-primary-container transition-colors hover:bg-primary-container/20"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Back to Dashboard
      </Link>
    </div>
  );
}
