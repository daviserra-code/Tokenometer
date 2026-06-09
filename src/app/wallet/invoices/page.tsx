import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { getCurrentOrganization } from "@/lib/current-organization";
import { formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const org = await getCurrentOrganization();
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  const invoices = await prisma.invoice.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description={`Issued for ${org.name}`}
        action={
          <Link
            href="/api/wallet/chargeback/export?view=invoices"
            className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Export statements CSV
          </Link>
        }
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-text-muted text-[12px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left">Number</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Issued by</th>
                <th className="px-3 py-2 text-left">Issued to</th>
                <th className="px-3 py-2 text-left">Cost center</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {invoices.map((inv) => {
                const data =
                  inv.dataJson && typeof inv.dataJson === "object"
                    ? (inv.dataJson as Record<string, unknown>)
                    : {};
                const costCenterCode =
                  typeof data.costCenterCode === "string" ? data.costCenterCode : null;
                const costCenterName =
                  typeof data.costCenterName === "string" ? data.costCenterName : null;

                return (
                  <tr key={inv.id} className="hover:bg-background/50">
                    <td className="px-3 py-2 font-mono">{inv.number}</td>
                    <td className="px-3 py-2 text-text-muted">
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">{inv.type}</td>
                    <td className="px-3 py-2">{inv.issuedFrom}</td>
                    <td className="px-3 py-2">{inv.issuedTo}</td>
                    <td className="px-3 py-2">
                      {costCenterCode || costCenterName ? (
                        <div>
                          <div className="font-mono text-[12px] font-semibold text-on-surface">
                            {costCenterCode ?? "Mapped"}
                          </div>
                          {costCenterName ? (
                            <div className="text-[12px] text-text-muted">{costCenterName}</div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatCurrency(Number(inv.total))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/wallet/invoices/${inv.id}/print`}
                        target="_blank"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <span className="material-symbols-outlined text-[16px]">print</span>
                        Print
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-text-muted">
                    No invoices yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
