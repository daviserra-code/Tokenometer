import Link from "next/link";
import { logoutAction } from "@/app/actions";

export function AdminAuthButton({ admin }: { admin: boolean }) {
  if (!admin) {
    return (
      <Link
        href="/login"
        className="hidden rounded-lg border border-border-subtle px-3 py-2 text-[12px] font-semibold text-text-muted transition-colors hover:border-primary hover:text-primary sm:inline-flex"
      >
        Admin login
      </Link>
    );
  }

  return (
    <form action={logoutAction} className="hidden sm:block">
      <button
        type="submit"
        className="rounded-lg border border-status-normal/40 bg-status-normal/10 px-3 py-2 text-[12px] font-semibold text-status-normal transition-colors hover:bg-status-normal/20"
      >
        Admin
      </button>
    </form>
  );
}
