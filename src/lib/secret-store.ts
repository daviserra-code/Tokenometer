import { decryptSecret, encryptSecret } from "@/lib/crypto";

/**
 * Secret-store adapter boundary.
 *
 * The MVP uses local envelope encryption with INGEST_ENC_KEY. Production can
 * later switch this module to AWS KMS, GCP KMS, Azure Key Vault, HashiCorp
 * Vault, or SOPS without changing vault callers.
 */
export type SecretStoreProvider = "local" | "external";

export function secretStoreProvider(): SecretStoreProvider {
  return process.env.SECRET_STORE_PROVIDER === "external" ? "external" : "local";
}

export function encryptVaultSecret(plaintext: string) {
  if (secretStoreProvider() === "external") {
    throw new Error("External secret store is selected but no KMS/Vault adapter is configured yet.");
  }
  return encryptSecret(plaintext);
}

export function decryptVaultSecret(payload: string) {
  if (secretStoreProvider() === "external") {
    throw new Error("External secret store is selected but no KMS/Vault adapter is configured yet.");
  }
  return decryptSecret(payload);
}

