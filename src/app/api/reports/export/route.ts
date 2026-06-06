import { NextRequest, NextResponse } from "next/server";

import { getAppMode, isAdmin, modeUsageWhere } from "@/lib/auth";
import { startOfMonth } from "@/lib/calc";
import { formatCurrency, formatNumber, formatTokens, toNumber } from "@/lib/format";
import { renderSpendPdfBuffer } from "@/lib/pdf-export";
import { prisma } from "@/lib/prisma";
import { getReconciliationSnapshot, summarizeReconciliation } from "@/lib/reconciliation";

export const runtime = "nodejs";

type Period = "daily" | "weekly" | "monthly";

function getPeriod(value?: string): Period {
  return value === "daily" || value === "weekly" || value === "monthly" ? value : "monthly";
}

function getPeriodStart(period: Period) {
  const now = new Date();
  if (period === "daily") return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (period === "weekly") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return startOfMonth(now);
}

function csvEscape(value: unknown) {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function section(title: string, headers: string[], rows: Array<Array<unknown>>) {
  return [
    title,
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
    "",
  ].join("\n");
}

export async function GET(request: NextRequest) {
  const modeParam = request.nextUrl.searchParams.get("mode");
  const mode = modeParam === "live" || modeParam === "demo" ? modeParam : getAppMode();
  if (mode === "live" && !isAdmin()) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) {
    return NextResponse.json({ error: "No organization found." }, { status: 404 });
  }

  const period = getPeriod(request.nextUrl.searchParams.get("period") ?? undefined);
  const format = (request.nextUrl.searchParams.get("format") ?? "csv").toLowerCase();
  const periodLabel =
    period === "daily" ? "Last 24 hours" : period === "weekly" ? "Last 7 days" : "Current month";
  const where = {
    organizationId: org.id,
    ...modeUsageWhere(mode),
    timestamp: { gte: getPeriodStart(period) },
  };

  const [totals, byProvider, byModel, byProject, byTeam, byIntegration, reconciliation] = await Promise.all([
    prisma.usageEvent.aggregate({
      where,
      _sum: { totalTokens: true, estimatedTotalCost: true, inputTokens: true, outputTokens: true },
      _count: true,
    }),
    prisma.usageEvent.groupBy({
      by: ["providerId"],
      where,
      _sum: { totalTokens: true, estimatedTotalCost: true },
    }),
    prisma.usageEvent.groupBy({
      by: ["modelId"],
      where,
      _sum: { totalTokens: true, estimatedTotalCost: true },
    }),
    prisma.usageEvent.groupBy({
      by: ["projectId"],
      where: { ...where, projectId: { not: null } },
      _sum: { totalTokens: true, estimatedTotalCost: true },
    }),
    prisma.usageEvent.groupBy({
      by: ["teamId"],
      where: { ...where, teamId: { not: null } },
      _sum: { totalTokens: true, estimatedTotalCost: true },
    }),
    prisma.usageEvent.groupBy({
      by: ["integrationId"],
      where: { ...where, integrationId: { not: null } },
      _sum: { totalTokens: true, estimatedTotalCost: true },
    }),
    getReconciliationSnapshot(org.id, period === "daily" ? 1 : period === "weekly" ? 7 : 30),
  ]);

  const providerIds = byProvider.map((row) => row.providerId);
  const modelIds = byModel.map((row) => row.modelId);
  const projectIds = byProject.map((row) => row.projectId!).filter(Boolean);
  const teamIds = byTeam.map((row) => row.teamId!).filter(Boolean);
  const integrationIds = byIntegration.map((row) => row.integrationId!).filter(Boolean);

  const [providers, models, projects, teams, integrations] = await Promise.all([
    prisma.provider.findMany({ where: { id: { in: providerIds } } }),
    prisma.model.findMany({ where: { id: { in: modelIds } }, include: { provider: true } }),
    prisma.project.findMany({ where: { id: { in: projectIds } } }),
    prisma.team.findMany({ where: { id: { in: teamIds } } }),
    prisma.integration.findMany({ where: { id: { in: integrationIds } } }),
  ]);

  const providerMap = new Map(providers.map((provider) => [provider.id, provider.name]));
  const modelMap = new Map(models.map((model) => [model.id, `${model.provider.name} / ${model.name}`]));
  const projectMap = new Map(projects.map((project) => [project.id, project.name]));
  const teamMap = new Map(teams.map((team) => [team.id, team.name]));
  const integrationMap = new Map(integrations.map((integration) => [integration.id, integration.name]));

  const providerRows = byProvider
    .map((row) => ({
      name: providerMap.get(row.providerId) ?? row.providerId,
      tokens: toNumber(row._sum.totalTokens),
      cost: toNumber(row._sum.estimatedTotalCost),
    }))
    .sort((a, b) => b.cost - a.cost);

  const modelRows = byModel
    .map((row) => ({
      name: modelMap.get(row.modelId) ?? row.modelId,
      tokens: toNumber(row._sum.totalTokens),
      cost: toNumber(row._sum.estimatedTotalCost),
    }))
    .sort((a, b) => b.cost - a.cost);

  const projectRows = byProject
    .map((row) => ({
      name: projectMap.get(row.projectId!) ?? row.projectId ?? "unassigned",
      tokens: toNumber(row._sum.totalTokens),
      cost: toNumber(row._sum.estimatedTotalCost),
    }))
    .sort((a, b) => b.cost - a.cost);

  const teamRows = byTeam
    .map((row) => ({
      name: teamMap.get(row.teamId!) ?? row.teamId ?? "unassigned",
      tokens: toNumber(row._sum.totalTokens),
      cost: toNumber(row._sum.estimatedTotalCost),
    }))
    .sort((a, b) => b.cost - a.cost);

  const integrationRows = byIntegration
    .map((row) => ({
      name: integrationMap.get(row.integrationId!) ?? row.integrationId ?? "unlinked",
      tokens: toNumber(row._sum.totalTokens),
      cost: toNumber(row._sum.estimatedTotalCost),
    }))
    .sort((a, b) => b.cost - a.cost);
  const reconciliationSummary = summarizeReconciliation(reconciliation);
  const reconciliationRows = reconciliation.rows
    .slice(0, 8)
    .map((row) => ({
      provider: row.provider,
      liveCost: row.liveCost,
      providerHistoryCost: row.providerHistoryCost,
      driftCost: row.deltaCost,
      driftPct: row.deltaPct,
      label: row.label,
    }));

  if (format === "pdf") {
    const totalCost = toNumber(totals._sum.estimatedTotalCost);
    const toSpendRows = (rows: Array<{ name: string; tokens: number; cost: number }>) =>
      rows.slice(0, 10).map((row) => ({
        name: row.name,
        tokens: formatTokens(row.tokens),
        cost: formatCurrency(row.cost, org.currency),
        share: totalCost > 0 ? `${((row.cost / totalCost) * 100).toFixed(1)}%` : "-",
      }));

    const pdf = await renderSpendPdfBuffer({
      title: "Tokenometer Spend Report",
      subtitle: `${periodLabel} | ${mode === "live" ? "Live mode" : "Demo mode"} | Generated ${new Date().toISOString().slice(0, 10)}`,
      metrics: [
        {
          label: "Total spend",
          value: formatCurrency(totalCost, org.currency),
          tone: "success",
        },
        {
          label: "Total tokens",
          value: formatTokens(toNumber(totals._sum.totalTokens)),
          tone: "input",
        },
        {
          label: "Events",
          value: formatNumber(totals._count),
          tone: "output",
        },
        {
          label: "Currency",
          value: org.currency,
        },
        {
          label: "Reconciliation",
          value: reconciliationSummary.title,
          tone:
            reconciliationSummary.tone === "success"
              ? "success"
              : reconciliationSummary.tone === "danger"
                ? "output"
                : "input",
        },
      ],
      sections: [
        {
          title: "Top providers",
          description: "Where the spend is landing first.",
          rows: toSpendRows(providerRows),
        },
        {
          title: "Top models",
          description: "Model-level breakdown for the selected period.",
          rows: toSpendRows(modelRows),
        },
        {
          title: "Top integrations",
          description: "Useful when multiple apps or rollouts share the same provider.",
          rows: toSpendRows(integrationRows),
        },
        {
          title: "Project breakdown",
          description: "Project view for reporting and chargeback.",
          rows: toSpendRows(projectRows),
        },
        {
          title: "Team breakdown",
          description: "Team view for ownership and budget tracking.",
          rows: toSpendRows(teamRows),
        },
        {
          title: "Reconciliation snapshot",
          description: `${reconciliationSummary.title}. ${reconciliationSummary.body}`,
          rows: reconciliationRows.map((row) => ({
            name: row.provider,
            tokens: `Live ${formatCurrency(row.liveCost, org.currency)} / History ${formatCurrency(row.providerHistoryCost, org.currency)}`,
            cost:
              row.driftPct == null
                ? row.label
                : `${row.label} / ${row.driftCost >= 0 ? "+" : "-"}${formatCurrency(Math.abs(row.driftCost), org.currency)} / ${row.driftPct.toFixed(1)}%`,
            share: "-",
          })),
        },
      ],
      footerNote: "Formatted spend report for operator and finance review, including reconciliation context where available.",
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="tokenometer-spend-report-${period}-${new Date()
          .toISOString()
          .slice(0, 10)}.pdf"`,
      },
    });
  }

  const csv = [
    section(
      "summary",
      ["period", "mode", "events", "input_tokens", "output_tokens", "total_tokens", "total_cost", "currency"],
      [[
        period,
        mode,
        totals._count,
        totals._sum.inputTokens ?? 0,
        totals._sum.outputTokens ?? 0,
        totals._sum.totalTokens ?? 0,
        totals._sum.estimatedTotalCost?.toString() ?? "0",
        org.currency,
      ]]
    ),
    section(
      "reconciliation_summary",
      ["title", "body", "window_start"],
      [[reconciliationSummary.title, reconciliationSummary.body, reconciliation.since.toISOString()]]
    ),
    section(
      "reconciliation_by_provider",
      ["provider", "status", "live_cost", "provider_history_cost", "drift_cost", "drift_pct", "currency"],
      reconciliation.rows.map((row) => [
        row.provider,
        row.label,
        row.liveCost.toFixed(6),
        row.providerHistoryCost.toFixed(6),
        row.deltaCost.toFixed(6),
        row.deltaPct == null ? "" : row.deltaPct.toFixed(2),
        org.currency,
      ])
    ),
    section(
      "by_provider",
      ["provider", "tokens", "cost", "currency"],
      byProvider
        .map((row) => [
          providerMap.get(row.providerId) ?? row.providerId,
          row._sum.totalTokens ?? 0,
          row._sum.estimatedTotalCost?.toString() ?? "0",
          org.currency,
        ])
        .sort((a, b) => Number(b[2]) - Number(a[2]))
    ),
    section(
      "by_model",
      ["model", "tokens", "cost", "currency"],
      byModel
        .map((row) => [
          modelMap.get(row.modelId) ?? row.modelId,
          row._sum.totalTokens ?? 0,
          row._sum.estimatedTotalCost?.toString() ?? "0",
          org.currency,
        ])
        .sort((a, b) => Number(b[2]) - Number(a[2]))
    ),
    section(
      "by_integration",
      ["integration", "tokens", "cost", "currency"],
      byIntegration
        .map((row) => [
          integrationMap.get(row.integrationId!) ?? row.integrationId ?? "unlinked",
          row._sum.totalTokens ?? 0,
          row._sum.estimatedTotalCost?.toString() ?? "0",
          org.currency,
        ])
        .sort((a, b) => Number(b[2]) - Number(a[2]))
    ),
    section(
      "by_project",
      ["project", "tokens", "cost", "currency"],
      byProject
        .map((row) => [
          projectMap.get(row.projectId!) ?? row.projectId ?? "unassigned",
          row._sum.totalTokens ?? 0,
          row._sum.estimatedTotalCost?.toString() ?? "0",
          org.currency,
        ])
        .sort((a, b) => Number(b[2]) - Number(a[2]))
    ),
    section(
      "by_team",
      ["team", "tokens", "cost", "currency"],
      byTeam
        .map((row) => [
          teamMap.get(row.teamId!) ?? row.teamId ?? "unassigned",
          row._sum.totalTokens ?? 0,
          row._sum.estimatedTotalCost?.toString() ?? "0",
          org.currency,
        ])
        .sort((a, b) => Number(b[2]) - Number(a[2]))
    ),
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tokenometer-spend-report-${period}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
