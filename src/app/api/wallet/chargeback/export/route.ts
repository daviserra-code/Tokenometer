import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listChargebackRollups } from "@/lib/wallet-allocations";
import { listProviderValueRows } from "@/lib/provider-value";

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

  const view = request.nextUrl.searchParams.get("view") ?? "rollups";

  if (view === "invoices") {
    const invoices = await prisma.invoice.findMany({
      where: { organizationId: org.id, type: "MONTHLY_USAGE" },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const csv = toCsv(
      [
        "invoice_number",
        "created_at",
        "issued_to",
        "cost_center_code",
        "cost_center_name",
        "provider",
        "scope",
        "scope_id",
        "allocated_tokens",
        "used_tokens",
        "remaining_tokens",
        "chargeback_total",
        "currency",
      ],
      invoices.map((invoice) => {
        const data =
          invoice.dataJson && typeof invoice.dataJson === "object"
            ? (invoice.dataJson as Record<string, unknown>)
            : {};
        return [
          invoice.number,
          invoice.createdAt.toISOString(),
          invoice.issuedTo,
          data.costCenterCode ?? "",
          data.costCenterName ?? "",
          data.provider ?? "",
          data.scope ?? "",
          data.scopeId ?? "",
          data.allocatedTokens ?? "",
          data.usedTokens ?? "",
          data.remainingTokens ?? "",
          invoice.total.toString(),
          invoice.currency,
        ];
      })
    );

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tokenometer-chargeback-statements-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
      },
    });
  }

  if (view === "provider_summary") {
    const rollups = await listChargebackRollups(org.id);
    const providerMap = new Map<
      string,
      {
        providerName: string;
        scopeCount: number;
        allocatedTokens: bigint;
        usedTokens: bigint;
        remainingTokens: bigint;
        chargebackTotal: number;
      }
    >();

    for (const row of rollups) {
      const existing = providerMap.get(row.providerName);
      if (existing) {
        existing.scopeCount += row.scopeCount;
        existing.allocatedTokens += row.allocatedTokens;
        existing.usedTokens += row.usedTokens;
        existing.remainingTokens += row.remainingTokens;
        existing.chargebackTotal += row.spendCost;
        continue;
      }

      providerMap.set(row.providerName, {
        providerName: row.providerName,
        scopeCount: row.scopeCount,
        allocatedTokens: row.allocatedTokens,
        usedTokens: row.usedTokens,
        remainingTokens: row.remainingTokens,
        chargebackTotal: row.spendCost,
      });
    }

    const csv = toCsv(
      [
        "provider",
        "scope_count",
        "allocated_tokens",
        "used_tokens",
        "remaining_tokens",
        "chargeback_total",
        "currency",
      ],
      [...providerMap.values()]
        .sort((a, b) => b.chargebackTotal - a.chargebackTotal)
        .map((row) => [
          row.providerName,
          row.scopeCount,
          row.allocatedTokens.toString(),
          row.usedTokens.toString(),
          row.remainingTokens.toString(),
          row.chargebackTotal.toFixed(2),
          org.currency,
        ])
    );

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tokenometer-provider-summary-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
      },
    });
  }

  if (view === "value") {
    const rows = await listProviderValueRows(org.id);
    const csv = toCsv(
      [
        "provider",
        "live_event_count",
        "live_token_count",
        "live_spend_cost",
        "observed_cost_per_million",
        "observed_value_index",
        "catalog_floor_per_million",
        "catalog_value_index",
        "effective_value_index",
        "effective_value_basis",
        "optimization_headroom_pct",
        "cheapest_model",
        "dominant_live_model",
        "dominant_live_model_spend",
        "currency",
      ],
      rows.map((row) => [
        row.providerName,
        row.liveEventCount,
        row.liveTokenCount.toString(),
        row.liveSpendCost.toFixed(2),
        row.observedCostPerMillion?.toFixed(4) ?? "",
        row.observedValueIndex?.toFixed(1) ?? "",
        row.catalogFloorPerMillion?.toFixed(4) ?? "",
        row.catalogValueIndex?.toFixed(1) ?? "",
        row.effectiveValueIndex?.toFixed(1) ?? "",
        row.effectiveValueBasis,
        row.optimizationHeadroomPct?.toFixed(1) ?? "",
        row.cheapestModelName ?? "",
        row.dominantModelName ?? "",
        row.dominantModelSpend.toFixed(2),
        org.currency,
      ])
    );

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tokenometer-provider-value-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
      },
    });
  }

  const rollups = await listChargebackRollups(org.id);
  const csv = toCsv(
    [
      "cost_center_code",
      "cost_center_name",
      "provider",
      "scope_count",
      "allocated_tokens",
      "used_tokens",
      "remaining_tokens",
      "over_allocated_scopes",
      "chargeback_total",
      "currency",
    ],
    rollups.map((row) => [
      row.costCenterCode ?? "",
      row.costCenterName ?? "",
      row.providerName,
      row.scopeCount,
      row.allocatedTokens.toString(),
      row.usedTokens.toString(),
      row.remainingTokens.toString(),
      row.overAllocatedScopes,
      row.spendCost.toFixed(2),
      org.currency,
    ])
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tokenometer-chargeback-rollups-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
