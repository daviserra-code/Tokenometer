"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentAdminUserId, requireAdmin } from "@/lib/auth";
import { decryptTotpSecret, encryptTotpSecret, randomTotpSecret, verifyTotp } from "@/lib/admin-security";
import { auditLog } from "@/lib/audit";

export async function startTotpSetupAction() {
  requireAdmin();
  const userId = currentAdminUserId();
  if (!userId) throw new Error("Admin user session required.");
  const secret = randomTotpSecret();
  await prisma.adminUser.update({
    where: { id: userId },
    data: { totpSecretEncrypted: encryptTotpSecret(secret), totpEnabled: false },
  });
  await auditLog({ action: "admin_2fa.setup_started", targetType: "AdminUser", targetId: userId });
  revalidatePath("/settings/security");
}

export async function verifyTotpSetupAction(formData: FormData) {
  requireAdmin();
  const userId = currentAdminUserId();
  if (!userId) throw new Error("Admin user session required.");
  const token = String(formData.get("token") ?? "");
  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user?.totpSecretEncrypted) throw new Error("Start 2FA setup first.");
  const secret = decryptTotpSecret(user.totpSecretEncrypted);
  if (!verifyTotp(token, secret)) throw new Error("Invalid 2FA code.");
  await prisma.adminUser.update({
    where: { id: userId },
    data: { totpEnabled: true },
  });
  await auditLog({ action: "admin_2fa.enabled", targetType: "AdminUser", targetId: userId });
  revalidatePath("/settings/security");
  redirect("/settings/security");
}

export async function disableTotpAction(formData: FormData) {
  requireAdmin();
  const userId = currentAdminUserId();
  if (!userId) throw new Error("Admin user session required.");
  const token = String(formData.get("token") ?? "");
  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user?.totpSecretEncrypted || !user.totpEnabled) return;
  const secret = decryptTotpSecret(user.totpSecretEncrypted);
  if (!verifyTotp(token, secret)) throw new Error("Invalid 2FA code.");
  await prisma.adminUser.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecretEncrypted: null },
  });
  await auditLog({ action: "admin_2fa.disabled", targetType: "AdminUser", targetId: userId });
  revalidatePath("/settings/security");
}
