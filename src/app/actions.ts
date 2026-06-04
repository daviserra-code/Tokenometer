"use server";

import { redirect } from "next/navigation";
import {
  clearAdminCookie,
  requireAdmin,
  setAdminUserCookie,
  setModeCookie,
  type AppMode,
} from "@/lib/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  decryptTotpSecret,
  ensureBootstrapAdmin,
  isLoginRateLimited,
  recordLoginAttempt,
  verifyPassword,
  verifyTotp,
} from "@/lib/admin-security";

export type LoginState = { error?: string; username?: string; totpRequired?: boolean };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  await ensureBootstrapAdmin();
  const username = String(formData.get("username") ?? "admin").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const token = String(formData.get("token") ?? "");
  const ip = clientIp();

  if (await isLoginRateLimited(username, ip)) {
    await recordLoginAttempt({ identifier: username, ip, ok: false, reason: "rate_limited" });
    return { error: "Too many failed attempts. Try again in a few minutes.", username };
  }

  const user = await prisma.adminUser.findUnique({ where: { username } });
  if (!user || !user.active) {
    await recordLoginAttempt({ identifier: username, ip, ok: false, reason: "unknown_user" });
    return { error: "Invalid admin credentials.", username };
  }

  if (!verifyPassword(password, user.passwordSalt, user.passwordIterations, user.passwordHash)) {
    await recordLoginAttempt({ identifier: username, ip, ok: false, reason: "bad_password" });
    return { error: "Invalid admin credentials.", username };
  }

  if (user.totpEnabled) {
    if (!user.totpSecretEncrypted) {
      await recordLoginAttempt({ identifier: username, ip, ok: false, reason: "totp_misconfigured" });
      return { error: "2FA is enabled but not configured. Check the server.", username };
    }
    if (!token) {
      return { username, totpRequired: true };
    }
    if (!verifyTotp(token, decryptTotpSecret(user.totpSecretEncrypted))) {
      await recordLoginAttempt({ identifier: username, ip, ok: false, reason: "bad_totp" });
      return { error: "Invalid 2FA code.", username, totpRequired: true };
    }
  }

  await recordLoginAttempt({ identifier: username, ip, ok: true, reason: "ok" });
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  setAdminUserCookie(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  clearAdminCookie();
  redirect("/");
}

export async function setModeAction(formData: FormData) {
  const mode = String(formData.get("mode")) === "live" ? "live" : "demo";
  const redirectTo = String(formData.get("redirectTo") ?? "/");
  const safeRedirectTo = redirectTo.startsWith("/") && !redirectTo.startsWith("//")
    ? redirectTo
    : "/";
  if (mode === "live") requireAdmin();
  setModeCookie(mode as AppMode);
  redirect(safeRedirectTo);
}

function clientIp() {
  const h = headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
}
