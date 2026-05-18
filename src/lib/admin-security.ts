import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptVaultSecret, encryptVaultSecret } from "@/lib/secret-store";

const PASSWORD_ITERATIONS = 210_000;
const PASSWORD_KEYLEN = 32;
const PASSWORD_DIGEST = "sha256";
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("base64url")) {
  const hash = crypto
    .pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST)
    .toString("base64url");
  return { hash, salt, iterations: PASSWORD_ITERATIONS };
}

export function verifyPassword(password: string, salt: string, iterations: number, expectedHash: string) {
  const actual = crypto
    .pbkdf2Sync(password, salt, iterations, PASSWORD_KEYLEN, PASSWORD_DIGEST)
    .toString("base64url");
  const a = Buffer.from(actual);
  const b = Buffer.from(expectedHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function ensureBootstrapAdmin() {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const existing = await prisma.adminUser.findUnique({ where: { username } });
  if (existing) return existing;

  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 16) return null;

  const org = await prisma.organization.findFirst({ select: { id: true } });
  const { hash, salt, iterations } = hashPassword(password);
  return prisma.adminUser.create({
    data: {
      username,
      organizationId: org?.id,
      passwordHash: hash,
      passwordSalt: salt,
      passwordIterations: iterations,
    },
  });
}

export async function isLoginRateLimited(identifier: string, ip?: string | null) {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const attempts = await prisma.loginAttempt.count({
    where: {
      ok: false,
      createdAt: { gte: since },
      OR: [{ identifier }, ...(ip ? [{ ip }] : [])],
    },
  });
  return attempts >= LOGIN_MAX_FAILURES;
}

export async function recordLoginAttempt(args: {
  identifier: string;
  ip?: string | null;
  ok: boolean;
  reason: string;
}) {
  await prisma.loginAttempt.create({
    data: {
      identifier: args.identifier,
      ip: args.ip ?? undefined,
      ok: args.ok,
      reason: args.reason,
    },
  });
}

export function randomTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function encryptTotpSecret(secret: string) {
  return encryptVaultSecret(secret);
}

export function decryptTotpSecret(encrypted: string) {
  return decryptVaultSecret(encrypted);
}

export function buildOtpAuthUrl(args: { issuer: string; username: string; secret: string }) {
  const label = `${args.issuer}:${args.username}`;
  const params = new URLSearchParams({
    secret: args.secret,
    issuer: args.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function verifyTotp(token: string, secret: string, window = 1) {
  const clean = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
  for (let offset = -window; offset <= window; offset++) {
    const expected = generateTotp(secret, counter + offset);
    if (safeEqualText(clean, expected)) return true;
  }
  return false;
}

function generateTotp(secret: string, counter: number) {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function safeEqualText(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function base32Encode(input: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string) {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input.toUpperCase().replace(/=+$/g, "")) {
    const idx = B32.indexOf(char);
    if (idx === -1) throw new Error("Invalid base32 secret.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
