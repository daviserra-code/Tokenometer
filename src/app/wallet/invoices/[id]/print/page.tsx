import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({ params }: { params: { id: string } }) {
  const inv = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { organization: true },
  });
  if (!inv) notFound();

  const data = (inv.dataJson ?? {}) as Record<string, unknown>;
  const lines: Array<[string, string]> = Object.entries(data).map(([k, v]) => [
    k,
    typeof v === "object" ? JSON.stringify(v) : String(v),
  ]);

  return (
    <div className="invoice-paper">
      <style>{`
        .invoice-paper { background: #ffffff; color: #0f172a; padding: 40px;
          font-family: ui-sans-serif, system-ui, sans-serif; min-height: 100vh; }
        .invoice-paper h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.02em; }
        .invoice-paper h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
          color: #475569; margin: 24px 0 8px; }
        .invoice-paper .header { display: flex; justify-content: space-between;
          border-bottom: 2px solid #0f172a; padding-bottom: 16px; }
        .invoice-paper .meta { text-align: right; font-size: 13px; color: #475569; }
        .invoice-paper .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 16px; }
        .invoice-paper table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .invoice-paper th, .invoice-paper td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
        .invoice-paper th { color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.06em; }
        .invoice-paper .total { text-align: right; font-size: 22px; font-weight: 600; margin-top: 24px; }
        .invoice-paper .badge { display: inline-block; padding: 3px 8px; border-radius: 6px;
          background: #f1f5f9; font-size: 11px; text-transform: uppercase; color: #334155; }
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .invoice-paper { padding: 24px; }
        }
      `}</style>

      <header className="header">
        <div>
          <h1>Tokenometer</h1>
          <div style={{ fontSize: 13, color: "#475569" }}>AI Token Wallet & FinOps</div>
        </div>
        <div className="meta">
          <div style={{ fontSize: 18, fontWeight: 600, color: "#0f172a" }}>{inv.number}</div>
          <div>{new Date(inv.createdAt).toLocaleString()}</div>
          <div className="badge" style={{ marginTop: 6 }}>{inv.type}</div>
        </div>
      </header>

      <div className="grid2">
        <div>
          <h2>From</h2>
          <div style={{ fontSize: 14 }}>{inv.issuedFrom}</div>
        </div>
        <div>
          <h2>Billed to</h2>
          <div style={{ fontSize: 14 }}>{inv.issuedTo}</div>
        </div>
      </div>

      <h2>Details</h2>
      <table>
        <thead><tr><th>Field</th><th>Value</th></tr></thead>
        <tbody>
          {lines.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td style={{ fontFamily: "ui-monospace, monospace" }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {inv.notes ? (
        <>
          <h2>Notes</h2>
          <p style={{ fontSize: 13 }}>{inv.notes}</p>
        </>
      ) : null}

      <div className="total">
        Total: {formatCurrency(Number(inv.total))} {inv.currency}
      </div>

      <div style={{ marginTop: 32, textAlign: "center" }}>
        <PrintButton />
      </div>
    </div>
  );
}
