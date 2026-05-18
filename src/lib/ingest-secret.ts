import { prisma } from "@/lib/prisma";
import { generateSecret } from "@/lib/crypto";
import { decryptVaultSecret, encryptVaultSecret } from "@/lib/secret-store";

type IngestSourceSecret = {
  id: string;
  secret: string | null;
  encryptedSecret: string | null;
};

export function newEncryptedIngestSecret() {
  const plaintext = generateSecret();
  return {
    plaintext,
    encryptedSecret: encryptVaultSecret(plaintext),
    secretHint: plaintext.slice(-4),
  };
}

export async function readIngestSecret(source: IngestSourceSecret) {
  if (source.encryptedSecret) return decryptVaultSecret(source.encryptedSecret);
  if (!source.secret) throw new Error("Ingest source has no HMAC secret.");

  const encryptedSecret = encryptVaultSecret(source.secret);
  await prisma.ingestSource.update({
    where: { id: source.id },
    data: {
      encryptedSecret,
      secretHint: source.secret.slice(-4),
      secret: null,
    },
  });
  return source.secret;
}
