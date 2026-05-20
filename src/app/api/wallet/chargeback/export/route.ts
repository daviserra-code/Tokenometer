import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listChargebackRollups } from "@/lib/wallet-allocations";

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
