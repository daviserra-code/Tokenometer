import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/Card";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const org = await prisma.organization.findFirst();
  if (!org) return <p className="text-text-muted">Run the seed first.</p>;

  const jobs = await prisma.importJob.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="CSV import"
        description="Bulk-load historical usage data. Required columns: timestamp, model. Optional: provider, input_tokens, output_tokens, project, team, agent, workflow, owner, source."
      />

      <Card title="Upload">
        <ImportForm organizationId={org.id} />
      </Card>

      <Card title="Sample CSV">
        <pre className="overflow-auto rounded-lg border border-border-subtle bg-background p-4 font-mono text-[12px] text-text-muted">
{`timestamp,provider,model,input_tokens,output_tokens,project,agent,owner
2026-04-20T10:15:00Z,OpenAI,gpt-4o-mini,1200,300,Support Copilot,intent-router,alice@acme.io
2026-04-20T11:02:30Z,Anthropic,claude-3-5-haiku,800,250,Marketing Insights,copywriter,bob@acme.io
2026-04-20T11:30:00Z,Google,gemini-1.5-flash,2200,600,Product Engineering,code-explainer,carol@acme.io`}
        </pre>
      </Card>

      <Card title="Recent import jobs">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-text-muted text-[12px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Filename</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Imported</th>
                <th className="px-3 py-2 text-right">Failed</th>
                <th className="px-3 py-2 text-left">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="px-3 py-2 text-text-muted">
                    {new Date(j.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{j.source}</td>
                  <td className="px-3 py-2 font-mono text-[12px]">{j.filename ?? "—"}</td>
                  <td className="px-3 py-2">{j.status}</td>
                  <td className="px-3 py-2 text-right font-mono">{j.rowsImported}</td>
                  <td className="px-3 py-2 text-right font-mono">{j.rowsFailed}</td>
                  <td className="px-3 py-2 text-[12px] text-status-warning">{j.error ?? ""}</td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-text-muted">
                    No imports yet.
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
