"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  defaultOrgId,
  detectAnomalies,
  forecastSpend,
  recommendModelSwap,
} from "@/lib/analytics";

export async function generateInsightsAction(_formData?: FormData): Promise<void> {
  const orgId = await defaultOrgId();
  if (!orgId) return;

  const [anomalies, recs, forecast] = await Promise.all([
    detectAnomalies(orgId),
    recommendModelSwap(orgId),
    forecastSpend({ organizationId: orgId, horizonDays: 30 }),
  ]);

  const created: string[] = [];

  for (const a of anomalies) {
    const insight = await prisma.insight.create({
      data: {
        organizationId: orgId,
        kind: "anomaly",
        severity: a.severity,
        title: `${a.provider} spend up ${a.deltaPct}% in 24h`,
        body: `Today's spend $${a.todayCost.toFixed(2)} vs prior 7-day average $${a.avgPriorCost.toFixed(2)}. Investigate recent agents/projects on ${a.provider}.`,
        dataJson: a as unknown as object,
      },
    });
    created.push(insight.id);
  }

  for (const r of recs.slice(0, 3)) {
    const insight = await prisma.insight.create({
      data: {
        organizationId: orgId,
        kind: "recommendation",
        severity: "INFO",
        title: `Switch ${r.fromModel} → ${r.toModel} on ${r.provider}`,
        body: `Estimated monthly savings: $${r.estimatedSavings.toFixed(2)} (current $${r.monthlyCost.toFixed(2)}/mo).`,
        dataJson: r as unknown as object,
      },
    });
    created.push(insight.id);
  }

  if (forecast.projectedCost > 0) {
    const insight = await prisma.insight.create({
      data: {
        organizationId: orgId,
        kind: "forecast",
        severity: "INFO",
        title: `30-day forecast: $${forecast.projectedCost.toFixed(2)}`,
        body: `Based on $${forecast.avgDailyCost.toFixed(2)}/day avg over the last ${forecast.samplesDays} days.`,
        dataJson: forecast as unknown as object,
      },
    });
    created.push(insight.id);
  }

  revalidatePath("/insights");
}

export async function resolveInsightAction(formData: FormData) {
  const id = String(formData.get("id"));
  await prisma.insight.update({ where: { id }, data: { resolved: true } });
  revalidatePath("/insights");
}
