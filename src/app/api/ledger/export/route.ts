import { NextRequest, NextResponse } from "next/server";

import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

function csvEscape(value: unknown) {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers: string[], rows: Array<Array<unknown>>) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");
}

export async function GET(request: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) {
    return NextResponse.json({ error: "No organization found." }, { status: 404 });
  }

  const search = request.nextUrl.searchParams;
  const where: Prisma.UsageEventWhereInput = { organizationId: org.id };

  const from = search.get("from");
  const to = search.get("to");
  const providerId = search.get("providerId");
  const modelId = search.get("modelId");
  const integrationId = search.get("integrationId");
  const projectId = search.get("projectId");
  const teamId = search.get("teamId");

  if (from) where.timestamp = { ...(where.timestamp as object), gte: new Date(from) };
  if (to) where.timestamp = { ...(where.timestamp as object), lte: new Date(to) };
  if (providerId) where.providerId = providerId;
  if (modelId) where.modelId = modelId;
  if (integrationId) where.integrationId = integrationId;
  if (projectId) where.projectId = projectId;
  if (teamId) where.teamId = teamId;

  const events = await prisma.usageEvent.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: 5000,
    include: {
      provider: { select: { name: true } },
      model: { select: { name: true } },
      integration: { select: { name: true } },
      project: { select: { name: true } },
      team: { select: { name: true } },
    },
  });

  const csv = toCsv(
    [
      "timestamp",
      "provider",
      "model",
      "integration",
      "project",
      "team",
      "source",
      "agent",
      "workflow",
      "owner",
      "input_tokens",
      "output_tokens",
      "total_tokens",
      "estimated_total_cost",
      "request_id",
      "upstream_id",
    ],
    events.map((event) => {
      const metadata =
        event.metadataJson && typeof event.metadataJson === "object"
          ? (event.metadataJson as Record<string, unknown>)
          : {};

      return [
        event.timestamp.toISOString(),
        event.provider.name,
        event.model.name,
        event.integration?.name ?? "",
        event.project?.name ?? "",
        event.team?.name ?? "",
        event.source ?? "",
        event.agentName ?? "",
        event.workflowName ?? "",
        event.requestOwner ?? "",
        event.inputTokens,
        event.outputTokens,
        event.totalTokens,
        event.estimatedTotalCost.toString(),
        typeof metadata.requestId === "string" ? metadata.requestId : "",
        typeof metadata.upstreamId === "string" ? metadata.upstreamId : "",
      ];
    })
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tokenometer-ledger-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
