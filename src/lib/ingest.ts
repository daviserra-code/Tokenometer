import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Minimal RFC-4180-ish CSV parser. Handles quoted fields with embedded
 * commas, escaped quotes (""), and CRLF/LF. Returns an array of rows.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type CsvUsageRow = {
  timestamp: string;
  provider: string;
  model: string;
  inputTokens: string | number;
  outputTokens: string | number;
  totalTokens?: string | number;
  project?: string;
  team?: string;
  agent?: string;
  workflow?: string;
  owner?: string;
  source?: string;
};

const HEADER_ALIASES: Record<string, keyof CsvUsageRow> = {
  timestamp: "timestamp",
  ts: "timestamp",
  date: "timestamp",
  time: "timestamp",
  provider: "provider",
  vendor: "provider",
  model: "model",
  model_name: "model",
  input_tokens: "inputTokens",
  prompt_tokens: "inputTokens",
  in_tokens: "inputTokens",
  output_tokens: "outputTokens",
  completion_tokens: "outputTokens",
  out_tokens: "outputTokens",
  total_tokens: "totalTokens",
  project: "project",
  project_name: "project",
  team: "team",
  team_name: "team",
  agent: "agent",
  agent_name: "agent",
  workflow: "workflow",
  workflow_name: "workflow",
  owner: "owner",
  user: "owner",
  source: "source",
};

function normalizeHeader(h: string): keyof CsvUsageRow | null {
  const k = h.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  return HEADER_ALIASES[k] ?? null;
}

export type ImportResult = {
  inserted: number;
  failed: number;
  errors: string[];
};

/**
 * Import a CSV-formatted usage feed into UsageEvent rows.
 * - Resolves provider/model by name (creates Model on the fly if absent).
 * - Resolves project/team by name (skipped if absent — usage is org-level).
 */
export async function importUsageCsv(
  organizationId: string,
  csvText: string,
  jobId: string
): Promise<ImportResult> {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return { inserted: 0, failed: 0, errors: ["CSV is empty or has no data rows."] };
  }
  const headers = rows[0].map((h) => normalizeHeader(h));
  if (!headers.includes("timestamp") || !headers.includes("model")) {
    return {
      inserted: 0,
      failed: 0,
      errors: [
        "CSV must include at least 'timestamp' and 'model' columns. Optional: provider, input_tokens, output_tokens, project, team, agent, workflow, owner, source.",
      ],
    };
  }

  // Cache providers, models, projects, teams to avoid N+1
  const providers = await prisma.provider.findMany();
  const providerByName = new Map(providers.map((p) => [p.name.toLowerCase(), p]));
  const models = await prisma.model.findMany();
  const modelByKey = new Map(models.map((m) => [`${m.providerId}:${m.name.toLowerCase()}`, m]));
  const projects = await prisma.project.findMany({ where: { organizationId } });
  const projectByName = new Map(projects.map((p) => [p.name.toLowerCase(), p]));
  const teams = await prisma.team.findMany({ where: { organizationId } });
  const teamByName = new Map(teams.map((t) => [t.name.toLowerCase(), t]));

  const events: Prisma.UsageEventCreateManyInput[] = [];
  const errors: string[] = [];
  let failed = 0;

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const obj: Partial<CsvUsageRow> = {};
    headers.forEach((h, idx) => {
      if (h) (obj as Record<string, string>)[h] = (cols[idx] ?? "").trim();
    });

    try {
      const ts = new Date(obj.timestamp ?? "");
      if (isNaN(ts.getTime())) throw new Error(`Row ${i + 1}: invalid timestamp '${obj.timestamp}'.`);

      const providerName = (obj.provider ?? "").toLowerCase();
      const modelName = (obj.model ?? "").toLowerCase();
      if (!modelName) throw new Error(`Row ${i + 1}: missing model.`);

      let provider =
        (providerName && providerByName.get(providerName)) ||
        // Fall back: search models by name
        providers.find((p) => modelByKey.has(`${p.id}:${modelName}`));

      if (!provider) throw new Error(`Row ${i + 1}: unknown provider '${obj.provider}'.`);

      let model = modelByKey.get(`${provider.id}:${modelName}`);
      if (!model) {
        model = await prisma.model.create({
          data: { providerId: provider.id, name: obj.model ?? modelName },
        });
        modelByKey.set(`${provider.id}:${modelName}`, model);
      }

      const inT = Number(obj.inputTokens ?? 0) || 0;
      const outT = Number(obj.outputTokens ?? 0) || 0;
      const totT = Number(obj.totalTokens ?? inT + outT) || inT + outT;

      const inPrice = Number(model.inputPricePerMillion);
      const outPrice = Number(model.outputPricePerMillion);
      const inCost = (inT / 1_000_000) * inPrice;
      const outCost = (outT / 1_000_000) * outPrice;

      const projectMatch = obj.project ? projectByName.get(obj.project.toLowerCase()) : undefined;
      const teamMatch = obj.team ? teamByName.get(obj.team.toLowerCase()) : undefined;

      events.push({
        organizationId,
        projectId: projectMatch?.id ?? null,
        teamId: teamMatch?.id ?? projectMatch?.teamId ?? null,
        providerId: provider.id,
        modelId: model.id,
        timestamp: ts,
        source: obj.source || "csv",
        agentName: obj.agent || null,
        workflowName: obj.workflow || null,
        requestOwner: obj.owner || null,
        inputTokens: inT,
        outputTokens: outT,
        totalTokens: totT,
        estimatedInputCost: new Prisma.Decimal(inCost.toFixed(6)),
        estimatedOutputCost: new Prisma.Decimal(outCost.toFixed(6)),
        estimatedTotalCost: new Prisma.Decimal((inCost + outCost).toFixed(6)),
        metadataJson: { importJobId: jobId },
      });
    } catch (e) {
      failed++;
      if (errors.length < 20) errors.push((e as Error).message);
    }
  }

  if (events.length) {
    const chunk = 500;
    for (let i = 0; i < events.length; i += chunk) {
      await prisma.usageEvent.createMany({ data: events.slice(i, i + chunk) });
    }
  }

  return { inserted: events.length, failed, errors };
}
