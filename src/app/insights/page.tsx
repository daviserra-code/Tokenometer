import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { generateInsightsAction, resolveInsightAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const org = await prisma.organization.findFirst();
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  const insights = await prisma.insight.findMany({
    where: { organizationId: org.id },
    orderBy: [{ resolved: "asc" }, { createdAt: "desc" }],
    take: 50,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI insights"
        description="Auto-detected anomalies, forecasts, and savings recommendations grounded in your real usage data."
        action={
          <form action={generateInsightsAction}>
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-primary-container"
            >
              <span className="material-symbols-outlined align-middle text-base mr-1">
                auto_awesome
              </span>
              Run insight generation
            </button>
          </form>
        }
      />

      {insights.length === 0 ? (
        <Card title="No insights yet">
          <p className="text-text-muted">
            Click <strong>Run insight generation</strong> to scan your usage for anomalies and
            optimization opportunities.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {insights.map((i) => (
            <div
              key={i.id}
              className={`rounded-lg border p-4 ${
                i.resolved
                  ? "border-border-subtle bg-background/40 opacity-60"
                  : i.severity === "CRITICAL"
                  ? "border-status-exceeded/60 bg-status-exceeded/10"
                  : i.severity === "WARNING"
                  ? "border-status-warning/60 bg-status-warning/10"
                  : "border-border-subtle bg-surface-elevated/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={i.severity} kind={i.kind} />
                    <span className="text-[12px] text-text-muted">
                      {new Date(i.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <h3 className="mt-2 font-display font-semibold text-on-surface">{i.title}</h3>
                  <p className="mt-1 text-[13px] text-text-muted">{i.body}</p>
                </div>
                {!i.resolved && (
                  <form action={resolveInsightAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <button
                      type="submit"
                      title="Mark resolved"
                      className="rounded border border-border-subtle px-2 py-1 text-[11px] hover:border-primary"
                    >
                      Resolve
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ severity, kind }: { severity: string; kind: string }) {
  const tone =
    severity === "CRITICAL"
      ? "bg-status-exceeded/30 text-status-exceeded"
      : severity === "WARNING"
      ? "bg-status-warning/30 text-status-warning"
      : "bg-primary/20 text-primary";
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}>
      {kind} · {severity}
    </span>
  );
}
