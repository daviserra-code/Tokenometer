import { redirect } from "next/navigation";
import { Card } from "@/components/Card";
import { LoginForm } from "./LoginForm";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (isAdmin()) redirect("/dashboard");

  return (
    <div className="mx-auto flex min-h-[calc(100vh-160px)] max-w-md flex-col justify-center">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-subtle bg-surface">
          <span className="material-symbols-outlined text-primary">monitoring</span>
        </div>
        <div>
          <h1 className="font-display text-h1 text-on-surface">Admin login</h1>
          <p className="text-body-md text-text-muted">
            Manage live provider keys and AI spend.
          </p>
        </div>
      </div>
      <Card>
        <LoginForm />
      </Card>
    </div>
  );
}
