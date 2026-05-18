import { prisma } from "@/lib/prisma";

export type Period = "7d" | "30d" | "90d" | "mtd";

export function periodStart(period: Period): Date {
  const now = new Date();
  if (period === "mtd") return new Date(now.getFullYear(), now.getMonth(), 1);
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 86400_000);
}

export async function queryUsage(args: {
  organizationId: string;
  period: Period;
  groupBy?: "provider" | "project" | "team" | "model" | "agent";
}) {
  const since = periodStart(args.period);
  const events = await prisma.usageEvent.findMany({
    where: { organizationId: args.organizationId, timestamp: { gte: since } },
    select: {
      timestamp: true,
      totalTokens: true,
      estimatedTotalCost: true,
      agentName: true,
      providerId: true,
      projectId: true,
      teamId: true,
      modelId: true,
      provider: { select: { name: true } },
      project: { select: { name: true } },
      team: { select: { name: true } },
      model: { select: { name: true } },
    },
  });
  const totals = {
    events: events.length,
    tokens: events.reduce((s, e) => s + e.totalTokens, 0),
    cost: events.reduce((s, e) => s + Number(e.estimatedTotalCost), 0),
  };
  if (!args.groupBy) {
    return { period: args.period, since: since.toISOString(), totals, groups: [] };
  }
  const map = new Map<string, { key: string; tokens: number; cost: number; events: number }>();
  for (const e of events) {
    const key =
      args.groupBy === "provider" ? e.provider?.name ?? "?" :
      args.groupBy === "project" ? e.project?.name ?? "(unassigned)" :
      args.groupBy === "team" ? e.team?.name ?? "(unassigned)" :
      args.groupBy === "model" ? e.model?.name ?? "?" :
      e.agentName ?? "(none)";
    const cur = map.get(key) ?? { key, tokens: 0, cost: 0, events: 0 };
    cur.tokens += e.totalTokens;
    cur.cost += Number(e.estimatedTotalCost);
    cur.events += 1;
    map.set(key, cur);
  }
  const groups = Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  return { period: args.period, since: since.toISOString(), totals, groups };
}

export async function getBalances(organizationId: string) {
  const wallets = await prisma.wallet.findMany({
    where: { organizationId },
    include: { provider: { select: { name: true } } },
  });
  return wallets.map((w) => ({
    provider: w.provider.name,
    balance: w.balance.toString(),
    currency: w.currency,
  }));
}

export async function forecastSpend(args: {
  organizationId: string;
  horizonDays?: number;
}) {
  const horizon = args.horizonDays ?? 30;
  const since = new Date(Date.now() - 30 * 86400_000);
  const events = await prisma.usageEvent.findMany({
    where: { organizationId: args.organizationId, timestamp: { gte: since } },
    select: { timestamp: true, estimatedTotalCost: true },
  });
  const days = new Map<string, number>();
  for (const e of events) {
    const k = e.timestamp.toISOString().slice(0, 10);
    days.set(k, (days.get(k) ?? 0) + Number(e.estimatedTotalCost));
  }
  const series = Array.from(days.values());
  const avg = series.length ? series.reduce((a, b) => a + b, 0) / series.length : 0;
  const projected = avg * horizon;
  return {
    horizonDays: horizon,
    avgDailyCost: round(avg, 4),
    projectedCost: round(projected, 2),
    samplesDays: series.length,
  };
}

export async function recommendModelSwap(organizationId: string) {
  const since = periodStart("30d");
  const usage = await prisma.usageEvent.groupBy({
    by: ["modelId"],
    where: { organizationId, timestamp: { gte: since } },
    _sum: { totalTokens: true, estimatedTotalCost: true },
  });
  const models = await prisma.model.findMany({
    where: { id: { in: usage.map((u) => u.modelId) } },
    include: { provider: { select: { name: true } } },
  });
  const allByProvider = await prisma.model.findMany({
    include: { provider: { select: { name: true } } },
  });
  const recs: Array<{
    fromModel: string;
    toModel: string;
    provider: string;
    monthlyCost: number;
    estimatedSavings: number;
  }> = [];
  for (const u of usage) {
    const m = models.find((x) => x.id === u.modelId);
    if (!m) continue;
    const cur = Number(u._sum.estimatedTotalCost ?? 0);
    if (cur < 1) continue;
    const cheaper = allByProvider
      .filter(
        (x) =>
          x.providerId === m.providerId &&
          x.id !== m.id &&
          Number(x.inputPricePerMillion) + Number(x.outputPricePerMillion) <
            Number(m.inputPricePerMillion) + Number(m.outputPricePerMillion)
      )
      .sort(
        (a, b) =>
          Number(a.inputPricePerMillion) + Number(a.outputPricePerMillion) -
          (Number(b.inputPricePerMillion) + Number(b.outputPricePerMillion))
      )[0];
    if (!cheaper) continue;
    const ratio =
      (Number(cheaper.inputPricePerMillion) + Number(cheaper.outputPricePerMillion)) /
      Math.max(
        1e-9,
        Number(m.inputPricePerMillion) + Number(m.outputPricePerMillion)
      );
    recs.push({
      fromModel: m.name,
      toModel: cheaper.name,
      provider: m.provider.name,
      monthlyCost: round(cur, 2),
      estimatedSavings: round(cur * (1 - ratio), 2),
    });
  }
  recs.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
  return recs.slice(0, 5);
}

export async function detectAnomalies(organizationId: string) {
  const now = Date.now();
  const day = 86400_000;
  const events7d = await prisma.usageEvent.findMany({
    where: {
      organizationId,
      timestamp: { gte: new Date(now - 8 * day), lt: new Date(now) },
    },
    select: {
      timestamp: true,
      estimatedTotalCost: true,
      providerId: true,
      provider: { select: { name: true } },
    },
  });
  type Bucket = { cost: number; provider: string };
  const today: Map<string, Bucket> = new Map();
  const prior: Map<string, number[]> = new Map();
  for (const e of events7d) {
    const ageDays = Math.floor((now - e.timestamp.getTime()) / day);
    const k = e.providerId;
    if (ageDays < 1) {
      const b = today.get(k) ?? { cost: 0, provider: e.provider.name };
      b.cost += Number(e.estimatedTotalCost);
      today.set(k, b);
    } else if (ageDays < 8) {
      const arr = prior.get(k) ?? [];
      arr[ageDays] = (arr[ageDays] ?? 0) + Number(e.estimatedTotalCost);
      prior.set(k, arr);
    }
  }
  const anomalies: Array<{
    provider: string;
    todayCost: number;
    avgPriorCost: number;
    deltaPct: number;
    severity: "WARNING" | "CRITICAL";
  }> = [];
  for (const [k, b] of today.entries()) {
    const arr = (prior.get(k) ?? []).filter((v) => v > 0);
    const avg = arr.length ? arr.reduce((a, c) => a + c, 0) / arr.length : 0;
    if (avg <= 0) continue;
    const delta = (b.cost - avg) / avg;
    if (delta >= 0.5) {
      anomalies.push({
        provider: b.provider,
        todayCost: round(b.cost, 2),
        avgPriorCost: round(avg, 2),
        deltaPct: round(delta * 100, 1),
        severity: delta >= 1.0 ? "CRITICAL" : "WARNING",
      });
    }
  }
  return anomalies.sort((a, b) => b.deltaPct - a.deltaPct);
}

function round(n: number, digits: number) {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

export async function defaultOrgId(): Promise<string | null> {
  const o = await prisma.organization.findFirst({ select: { id: true } });
  return o?.id ?? null;
}
