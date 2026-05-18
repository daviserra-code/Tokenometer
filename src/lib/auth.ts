import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

const ADMIN_COOKIE = "tokenometer-admin";
const MODE_COOKIE = "tokenometer-mode";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export type AppMode = "demo" | "live";

function sessionSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.INGEST_ENC_KEY;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET or INGEST_ENC_KEY must be set for admin auth.");
  }
  return secret;
}

export function adminPasswordConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function expectedAdminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (process.env.NODE_ENV !== "production") return "admin";
  return null;
}

function sign(value: string) {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export function createAdminSessionValue() {
  const issuedAt = String(Date.now());
  return `${issuedAt}.${sign(issuedAt)}`;
}

export function isValidAdminSession(value?: string) {
  if (!value) return false;
  const [issuedAt, mac] = value.split(".");
  if (!issuedAt || !mac) return false;
  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) return false;
  if (Date.now() - issuedAtMs > SESSION_MAX_AGE_SECONDS * 1000) return false;

  const expected = sign(issuedAt);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isAdmin() {
  return isValidAdminSession(cookies().get(ADMIN_COOKIE)?.value);
}

export function requireAdmin() {
  if (!isAdmin()) redirect("/login");
}

export function setAdminCookie() {
  cookies().set(ADMIN_COOKIE, createAdminSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearAdminCookie() {
  cookies().delete(ADMIN_COOKIE);
  cookies().set(MODE_COOKIE, "demo", { path: "/", sameSite: "lax" });
}

export function getStoredMode(): AppMode {
  return cookies().get(MODE_COOKIE)?.value === "live" ? "live" : "demo";
}

export function getAppMode(): AppMode {
  const mode = getStoredMode();
  return mode === "live" && isAdmin() ? "live" : "demo";
}

export function setModeCookie(mode: AppMode) {
  cookies().set(MODE_COOKIE, mode, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}

export function liveUsageWhere(): Prisma.UsageEventWhereInput {
  return {
    OR: [
      { source: "csv" },
      { source: { startsWith: "byok-proxy" } },
      { source: { startsWith: "provider-sync" } },
    ],
  };
}

export function modeUsageWhere(mode: AppMode): Prisma.UsageEventWhereInput {
  return mode === "live" ? liveUsageWhere() : {};
}
