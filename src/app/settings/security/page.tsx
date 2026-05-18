import { Card, PageHeader } from "@/components/Card";
import { buildOtpAuthUrl, decryptTotpSecret, ensureBootstrapAdmin } from "@/lib/admin-security";
import { currentAdminUserId, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { disableTotpAction, startTotpSetupAction, verifyTotpSetupAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  requireAdmin();
  await ensureBootstrapAdmin();
  const userId = currentAdminUserId();
  const user = userId ? await prisma.adminUser.findUnique({ where: { id: userId } }) : null;
  const secret = user?.totpSecretEncrypted ? decryptTotpSecret(user.totpSecretEncrypted) : null;
  const otpauth = user && secret ? buildOtpAuthUrl({ issuer: "Tokenometer", username: user.username, secret }) : null;
  const recentAudits = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { adminUser: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        description="Admin authentication, 2FA setup, and recent vault activity."
      />

      <Card title="Admin user">
        <div className="grid grid-cols-1 gap-3 text-sm text-text-muted sm:grid-cols-3">
          <KV k="Username" v={user?.username ?? "admin"} />
          <KV k="Password storage" v="PBKDF2-SHA256 hash" />
          <KV k="2FA" v={user?.totpEnabled ? "Enabled" : "Not enabled"} tone={user?.totpEnabled ? "ok" : "warn"} />
        </div>
      </Card>

      <Card title="Two-factor authentication">
        {!user?.totpEnabled && !secret && (
          <form action={startTotpSetupAction}>
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
              Start 2FA setup
            </button>
          </form>
        )}

        {!user?.totpEnabled && secret && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Add this manual key in your authenticator app, then enter the 6-digit code.
            </p>
            <KV k="Manual setup key" v={secret} mono />
            {otpauth && <KV k="otpauth URI" v={otpauth} mono />}
            <form action={verifyTotpSetupAction} className="flex flex-col gap-3 sm:flex-row">
              <input
                name="token"
                inputMode="numeric"
                pattern="[0-9]{6}"
                required
                placeholder="123456"
                className="rounded-lg border border-border-subtle bg-background px-3 py-2 font-mono text-on-surface outline-none focus:border-primary"
              />
              <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
                Enable 2FA
              </button>
            </form>
          </div>
        )}

        {user?.totpEnabled && (
          <form action={disableTotpAction} className="flex flex-col gap-3 sm:flex-row">
            <input
              name="token"
              inputMode="numeric"
              pattern="[0-9]{6}"
              required
              placeholder="Current 2FA code"
              className="rounded-lg border border-border-subtle bg-background px-3 py-2 font-mono text-on-surface outline-none focus:border-primary"
            />
            <button className="rounded-lg border border-status-exceeded/40 px-4 py-2 text-sm font-semibold text-status-exceeded">
              Disable 2FA
            </button>
          </form>
        )}
      </Card>

      <Card title="Recent audit log" noPadding>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[12px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Admin</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {recentAudits.map((log) => (
                <tr key={log.id}>
                  <td className="px-3 py-2 text-text-muted">{log.createdAt.toLocaleString()}</td>
                  <td className="px-3 py-2">{log.adminUser?.username ?? "system"}</td>
                  <td className="px-3 py-2 font-mono text-[12px] text-primary">{log.action}</td>
                  <td className="px-3 py-2 text-text-muted">{log.targetType ?? "-"} {log.targetId ? log.targetId.slice(0, 8) : ""}</td>
                </tr>
              ))}
              {recentAudits.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-text-muted">
                    No audit entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function KV({ k, v, mono, tone }: { k: string; v: string; mono?: boolean; tone?: "ok" | "warn" }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-text-muted">{k}</div>
      <div
        className={`mt-1 break-all rounded border border-border-subtle bg-surface px-2 py-1.5 text-[12px] ${
          mono ? "font-mono " : ""
        }${tone === "ok" ? "text-status-normal" : tone === "warn" ? "text-status-warning" : "text-on-surface"}`}
      >
        {v}
      </div>
    </div>
  );
}

