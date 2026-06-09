import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { isAdmin } from "@/lib/auth";
import { getCurrentOrganization } from "@/lib/current-organization";
import { formatCurrency, formatDateTime, formatEventCurrency, formatNumber, toNumber } from "@/lib/format";
import { classifyMeteringPath } from "@/lib/provider-capabilities";
import { renderLedgerPdfBuffer } from "@/lib/pdf-export";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

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

function buildSubtitle(filters: {
  from: string | null;
  to: string | null;
  providerId: string | null;
  modelId: string | null;
  integrationId: string | null;
  projectId: string | null;
  teamId: string | null;
}) {
  const parts: string[] = [];
  if (filters.from) parts.push(`From ${filters.from}`);
  if (filters.to) parts.push(`To ${filters.to}`);
  if (filters.providerId) parts.push("Provider filtered");
  if (filters.modelId) parts.push("Model filtered");
  if (filters.integrationId) parts.push("Integration filtered");
  if (filters.projectId) parts.push("Project filtered");
  if (filters.teamId) parts.push("Team filtered");
  return parts.length ? parts.join(" - ") : "No filters applied";
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const org = await getCurrentOrganization();
  if (!org) {
    return NextResponse.json({ error: "No organization found." }, { status: 404 });
  }

  const search = request.nextUrl.searchParams;
  const format = (search.get("format") ?? "csv").toLowerCase();
  const requestedPage = parsePositiveInt(search.get("page"), 1, 10_000);
  const requestedPageSize = parsePositiveInt(search.get("pageSize"), 100, 250);
  const where: Prisma.UsageEventWhereInput = { organizationId: org.id };

  const filters = {
    from: search.get("from"),
    to: search.get("to"),
    providerId: search.get("providerId"),
    modelId: search.get("modelId"),
    integrationId: search.get("integrationId"),
    projectId: search.get("projectId"),
    teamId: search.get("teamId"),
  };

  if (filters.from) where.timestamp = { ...(where.timestamp as object), gte: new Date(filters.from) };
  if (filters.to) where.timestamp = { ...(where.timestamp as object), lte: new Date(filters.to) };
  if (filters.providerId) where.providerId = filters.providerId;
  if (filters.modelId) where.modelId = filters.modelId;
  if (filters.integrationId) where.integrationId = filters.integrationId;
  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.teamId) where.teamId = filters.teamId;

  const totals = await prisma.usageEvent.aggregate({
    where,
    _sum: {
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      estimatedTotalCost: true,
    },
    _count: true,
  });

  const totalMatching = totals._count;
  const totalPages = Math.max(1, Math.ceil(totalMatching / requestedPageSize));
  const currentPage = Math.min(requestedPage, totalPages);

  const events = await prisma.usageEvent.findMany({
    where,
    orderBy: { timestamp: "desc" },
    skip: format === "pdf" ? (currentPage - 1) * requestedPageSize : 0,
    take: format === "pdf" ? requestedPageSize : 5000,
    include: {
      provider: { select: { name: true } },
      model: { select: { name: true } },
      integration: { select: { name: true } },
      project: { select: { name: true } },
      team: { select: { name: true } },
    },
  });

  if (format === "pdf") {
    const pdf = await renderLedgerPdfBuffer({
      title: "Tokenometer Ledger Export",
      subtitle: `${buildSubtitle(filters)} | Page ${currentPage} of ${totalPages} | Generated ${new Date().toISOString().slice(0, 10)}`,
      metrics: [
        { label: "Matching events", value: formatNumber(totalMatching), tone: "output" },
        { label: "Events shown", value: formatNumber(events.length), tone: "default" },
        { label: "Input tokens", value: formatNumber(toNumber(totals._sum.inputTokens)), tone: "input" },
        { label: "Output tokens", value: formatNumber(toNumber(totals._sum.outputTokens)), tone: "output" },
        {
          label: "Total spend",
          value: formatCurrency(toNumber(totals._sum.estimatedTotalCost), org.currency),
          tone: "success",
        },
      ],
      entries: events.map((event) => ({
        ...(() => {
          const metadata =
            event.metadataJson && typeof event.metadataJson === "object"
              ? (event.metadataJson as Record<string, unknown>)
              : null;
          const metering = classifyMeteringPath(event.source, metadata);
          return {
            source: `${metering.label} / ${event.source ?? "-"}`,
          };
        })(),
        timestamp: formatDateTime(event.timestamp),
        provider: event.provider.name,
        model: event.model.name,
        integration: event.integration?.name ?? "-",
        project: event.project?.name ?? "-",
        team: event.team?.name ?? "-",
        agent: event.agentName ?? "-",
        workflow: event.workflowName ?? "-",
        owner: event.requestOwner ?? "-",
        inputTokens: formatNumber(event.inputTokens),
        outputTokens: formatNumber(event.outputTokens),
        totalTokens: formatNumber(event.totalTokens),
        cost: formatEventCurrency(toNumber(event.estimatedTotalCost), org.currency),
      })),
      footerNote:
        totalMatching > events.length
          ? `PDF shows page ${currentPage} of ${totalPages} for readability. Event costs below one cent are shown with higher precision.`
          : "Readable ledger export for the current filters and current metering-path labels. Event costs below one cent are shown with higher precision.",
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="tokenometer-ledger-${new Date()
          .toISOString()
          .slice(0, 10)}.pdf"`,
      },
    });
  }

  const csv = toCsv(
    [
      "timestamp",
      "provider",
      "model",
      "integration",
      "project",
      "team",
      "source",
      "metering_source",
      "metering_confidence",
      "streamed",
      "thoughts_token_count",
      "cached_content_token_count",
      "tool_use_prompt_token_count",
      "anthropic_cache_read_input_tokens",
      "anthropic_cache_creation_input_tokens",
      "anthropic_cache_creation_5m_input_tokens",
      "anthropic_cache_creation_1h_input_tokens",
      "stop_reason",
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
      const metering = classifyMeteringPath(event.source, metadata);

      return [
        event.timestamp.toISOString(),
        event.provider.name,
        event.model.name,
        event.integration?.name ?? "",
        event.project?.name ?? "",
        event.team?.name ?? "",
        event.source ?? "",
        metering.label,
        metering.confidence,
        metadata.streamed === true ? "true" : "",
        typeof metadata.thoughtsTokenCount === "number" ? metadata.thoughtsTokenCount : "",
        typeof metadata.cachedContentTokenCount === "number" ? metadata.cachedContentTokenCount : "",
        typeof metadata.toolUsePromptTokenCount === "number" ? metadata.toolUsePromptTokenCount : "",
        typeof metadata.cacheReadInputTokens === "number" ? metadata.cacheReadInputTokens : "",
        typeof metadata.cacheCreationInputTokens === "number" ? metadata.cacheCreationInputTokens : "",
        typeof metadata.cacheCreation5mInputTokens === "number" ? metadata.cacheCreation5mInputTokens : "",
        typeof metadata.cacheCreation1hInputTokens === "number" ? metadata.cacheCreation1hInputTokens : "",
        typeof metadata.stopReason === "string" ? metadata.stopReason : "",
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
