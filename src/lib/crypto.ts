import crypto from "node:crypto";

/**
 * AES-256-GCM symmetric encryption for vaulting provider API keys.
 *
 * The key is derived from the env var INGEST_ENC_KEY (any string)
 * via SHA-256 to produce a deterministic 32-byte key.
 *
 * Ciphertext format (base64):
 *   [12-byte IV][16-byte auth tag][ciphertext]
 *
 * Rotate by setting a new INGEST_ENC_KEY and re-encrypting existing
 * credentials offline — there is no automatic rotation here.
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.INGEST_ENC_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      "INGEST_ENC_KEY env var is missing or too short (set a 32+ char random string)."
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function maskKey(plaintext: string): string {
  if (plaintext.length <= 4) return "••••";
  return "••••" + plaintext.slice(-4);
}

/** Constant-time HMAC-SHA256 verifier for ingest webhooks. */
export function verifyHmac(rawBody: string, secret: string, signature: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.replace(/^sha256=/, ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function generateApiKey(prefix = "tkn_live"): string {
  return `${prefix}_${crypto.randomBytes(18).toString("base64url")}`;
}

export function generateSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}
