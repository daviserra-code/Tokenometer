import { DeploymentMode, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type PlanDefinition = {
  label: string;
  hosted: boolean;
  limits: {
    credentials: number | null;
    ingestSources: number | null;
    integrations: number | null;
  };
  retentionDays: number;
  financeEnabled: boolean;
  pdfExportsEnabled: boolean;
  assistantEnabled: boolean;
  supportLabel: string;
};

const PLAN_DEFINITIONS: Record<SubscriptionPlan, PlanDefinition> = {
  STARTER: {
    label: "Starter",
    hosted: true,
    limits: { credentials: 3, ingestSources: 2, integrations: 5 },
    retentionDays: 30,
    financeEnabled: false,
    pdfExportsEnabled: true,
    assistantEnabled: false,
    supportLabel: "Email support",
  },
  TEAM: {
    label: "Team",
    hosted: true,
    limits: { credentials: 8, ingestSources: 5, integrations: 20 },
    retentionDays: 90,
    financeEnabled: true,
    pdfExportsEnabled: true,
    assistantEnabled: true,
    supportLabel: "Priority email support",
  },
  BUSINESS: {
    label: "Business",
    hosted: true,
    limits: { credentials: 20, ingestSources: 12, integrations: 60 },
    retentionDays: 180,
    financeEnabled: true,
    pdfExportsEnabled: true,
    assistantEnabled: true,
    supportLabel: "Priority support and onboarding help",
  },
  ENTERPRISE: {
    label: "Enterprise",
    hosted: false,
    limits: { credentials: null, ingestSources: null, integrations: null },
    retentionDays: 365,
    financeEnabled: true,
    pdfExportsEnabled: true,
    assistantEnabled: true,
    supportLabel: "SLA / private deployment support",
  },
};

export type LimitedResource = "credentials" | "ingestSources" | "integrations";

export function getPlanDefinition(plan: SubscriptionPlan) {
  return PLAN_DEFINITIONS[plan];
}

export function formatDeploymentMode(mode: DeploymentMode) {
  switch (mode) {
    case "HOSTED":
      return "Hosted SaaS";
    case "SELF_HOSTED":
      return "Self-hosted";
    case "PRIVATE_CLOUD":
      return "Private cloud";
    case "DESKTOP_COMPANION":
      return "Desktop companion";
    default:
      return mode;
  }
}

export function formatSubscriptionStatus(status: SubscriptionStatus) {
  switch (status) {
    case "TRIAL":
      return "Trial";
    case "ACTIVE":
      return "Active";
    case "PAST_DUE":
      return "Past due";
    case "PAUSED":
      return "Paused";
    case "CANCELED":
      return "Canceled";
    default:
      return status;
  }
}

export async function getOrganizationCommercialSnapshot(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      deploymentMode: true,
      subscriptionPlan: true,
      subscriptionStatus: true,
      retentionDays: true,
      seatCapacity: true,
      _count: {
        select: {
          adminUsers: true,
          credentials: true,
          ingestSources: true,
          integrations: true,
        },
      },
    },
  });

  if (!organization) {
    throw new Error("Organization not found.");
  }

  const plan = getPlanDefinition(organization.subscriptionPlan);
  const effectiveRetentionDays = Math.min(organization.retentionDays, plan.retentionDays);
  const isHostedCommercial =
    organization.deploymentMode === "HOSTED" || organization.deploymentMode === "PRIVATE_CLOUD";

  return {
    organization,
    plan,
    effectiveRetentionDays,
    isHostedCommercial,
    counts: {
      seats: organization._count.adminUsers,
      credentials: organization._count.credentials,
      ingestSources: organization._count.ingestSources,
      integrations: organization._count.integrations,
    },
  };
}

export async function assertCommercialLimit(
  organizationId: string,
  resource: LimitedResource,
  creating = true,
) {
  if (!creating) return;

  const snapshot = await getOrganizationCommercialSnapshot(organizationId);
  const limit = snapshot.plan.limits[resource];
  if (limit === null) return snapshot;

  const currentCount = snapshot.counts[resource];
  if (currentCount >= limit) {
    const resourceLabel =
      resource === "credentials"
        ? "vaulted provider credentials"
        : resource === "ingestSources"
          ? "ingest sources"
          : "named integrations";
    throw new Error(
      `${snapshot.plan.label} allows up to ${limit} ${resourceLabel}. ${snapshot.organization.name} is already at that limit. Upgrade the hosted plan or remove an existing item first.`,
    );
  }

  return snapshot;
}
