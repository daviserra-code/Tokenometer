import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/format";

export type ProviderValueRow = {
  providerId: string;
  providerName: string;
  liveEventCount: number;
  liveTokenCount: bigint;
  liveSpendCost: number;
  observedCostPerMillion: number | null;
  observedValueIndex: number | null;
  catalogFloorPerMillion: number | null;
  catalogValueIndex: number | null;
  effectiveValueIndex: number | null;
  effectiveValueBasis: "LIVE" | "CATALOG" | "NONE";
  optimizationHeadroomPct: number | null;
  cheapestModelName: string | null;
  dominantModelName: string | null;
  dominantModelSpend: number;
};

export async function listProviderValueRows(
  organizationId: string,
  since = new Date(Date.now() - 30 * 86400_000)
): Promise<ProviderValueRow[]> {
  const [providers, usageGroups] = await Promise.all([
    prisma.provider.findMany({
      include: {
        models: {
          where: { active: true },
          orderBy: [{ inputPricePerMillion: "asc" }, { outputPricePerMillion: "asc" }, { name: "asc" }],
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.usageEvent.groupBy({
      by: ["providerId", "modelId"],
      where: {
        organizationId,
        timestamp: { gte: since },
      },
      _sum: {
        totalTokens: true,
        estimatedTotalCost: true,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const models = await prisma.model.findMany({
    where: { id: { in: usageGroups.map((group) => group.modelId) } },
  });
  const modelMap = new Map(models.map((model) => [model.id, model]));

  const rows = providers.map<ProviderValueRow>((provider) => {
    const groups = usageGroups.filter((group) => group.providerId === provider.id);
    const liveEventCount = groups.reduce((sum, group) => sum + group._count._all, 0);
    const liveTokenCount = groups.reduce((sum, group) => sum + BigInt(group._sum.totalTokens ?? 0), 0n);
    const liveSpendCost = groups.reduce((sum, group) => sum + toNumber(group._sum.estimatedTotalCost), 0);

    const observedCostPerMillion =
      liveTokenCount > 0n ? (liveSpendCost / Number(liveTokenCount)) * 1_000_000 : null;

    const cheapestModel = provider.models
      .map((model) => ({
        name: model.name,
        blendedPerMillion:
          toNumber(model.inputPricePerMillion) + toNumber(model.outputPricePerMillion),
      }))
      .sort((a, b) => a.blendedPerMillion - b.blendedPerMillion)[0];

    const dominantGroup = groups
      .map((group) => ({
        modelName: modelMap.get(group.modelId)?.name ?? "Unknown model",
        spend: toNumber(group._sum.estimatedTotalCost),
      }))
      .sort((a, b) => b.spend - a.spend)[0];

    const catalogFloorPerMillion = cheapestModel?.blendedPerMillion ?? null;
    const optimizationHeadroomPct =
      observedCostPerMillion != null &&
      catalogFloorPerMillion != null &&
      catalogFloorPerMillion > 0
        ? ((observedCostPerMillion - catalogFloorPerMillion) / catalogFloorPerMillion) * 100
        : null;

    return {
      providerId: provider.id,
      providerName: provider.name,
      liveEventCount,
      liveTokenCount,
      liveSpendCost,
      observedCostPerMillion,
      observedValueIndex: null,
      catalogFloorPerMillion,
      catalogValueIndex: null,
      effectiveValueIndex: null,
      effectiveValueBasis: observedCostPerMillion != null ? "LIVE" : catalogFloorPerMillion != null ? "CATALOG" : "NONE",
      optimizationHeadroomPct,
      cheapestModelName: cheapestModel?.name ?? null,
      dominantModelName: dominantGroup?.modelName ?? null,
      dominantModelSpend: dominantGroup?.spend ?? 0,
    };
  });

  const observedBaseline = rows
    .map((row) => row.observedCostPerMillion)
    .filter((value): value is number => value != null && value > 0)
    .sort((a, b) => a - b)[0];

  const catalogBaseline = rows
    .map((row) => row.catalogFloorPerMillion)
    .filter((value): value is number => value != null && value > 0)
    .sort((a, b) => a - b)[0];

  for (const row of rows) {
    row.observedValueIndex =
      observedBaseline && row.observedCostPerMillion
        ? (observedBaseline / row.observedCostPerMillion) * 100
        : null;
    row.catalogValueIndex =
      catalogBaseline && row.catalogFloorPerMillion
        ? (catalogBaseline / row.catalogFloorPerMillion) * 100
        : null;
    row.effectiveValueIndex =
      row.observedValueIndex ?? row.catalogValueIndex ?? null;
    row.effectiveValueBasis =
      row.observedValueIndex != null
        ? "LIVE"
        : row.catalogValueIndex != null
        ? "CATALOG"
        : "NONE";
  }

  return rows.sort((a, b) => {
    const scoreA = a.effectiveValueIndex ?? -1;
    const scoreB = b.effectiveValueIndex ?? -1;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.providerName.localeCompare(b.providerName);
  });
}
