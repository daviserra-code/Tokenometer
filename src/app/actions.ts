"use server";

import { redirect } from "next/navigation";
import {
  clearAdminCookie,
  expectedAdminPassword,
  requireAdmin,
  setAdminCookie,
  setModeCookie,
  type AppMode,
} from "@/lib/auth";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const expected = expectedAdminPassword();
  if (!expected) {
    return { error: "Admin login is not configured. Set ADMIN_PASSWORD on the server." };
  }
  if (password !== expected) {
    return { error: "Invalid admin password." };
  }

  setAdminCookie();
  redirect("/");
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
