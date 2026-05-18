import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { currentAdminUserId } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

export async function auditLog(args: {
  action: string;
  organizationId?: string | null;
  targetType?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const h = headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const userAgent = h.get("user-agent");
  await prisma.auditLog.create({
    data: {
      organizationId: args.organizationId ?? undefined,
      adminUserId: currentAdminUserId() ?? undefined,
      action: args.action,
      targetType: args.targetType,
      targetId: args.targetId ?? undefined,
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
      metadataJson: args.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
