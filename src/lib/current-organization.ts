import { prisma } from "@/lib/prisma";
import { currentAdminUserId } from "@/lib/auth";

export type CurrentOrganization = {
  id: string;
  name: string;
  handle: string;
  currency: string;
};

export async function getCurrentOrganization(): Promise<CurrentOrganization | null> {
  const adminUserId = currentAdminUserId();

  if (adminUserId) {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminUserId },
      select: { organizationId: true },
    });

    if (admin?.organizationId) {
      const organization = await prisma.organization.findUnique({
        where: { id: admin.organizationId },
        select: { id: true, name: true, handle: true, currency: true },
      });
      if (organization) return organization;
    }
  }

  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "asc" },
    take: 2,
    select: { id: true, name: true, handle: true, currency: true },
  });

  if (organizations.length === 0) return null;
  return organizations[0];
}

export async function getCurrentOrganizationId(): Promise<string | null> {
  const organization = await getCurrentOrganization();
  return organization?.id ?? null;
}
