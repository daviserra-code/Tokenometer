import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyHmac } from "@/lib/crypto";
import { readIngestSecret } from "@/lib/ingest-secret";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type IngestEvent = {
  timestamp: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  project?: string;
  team?: string;
  agent?: string;
  workflow?: string;
  owner?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

type IngestPayload = {
  events: IngestEvent[];
};

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-ingest-key");
  const signature = req.headers.get("x-ingest-signature");

  if (!apiKey || !signature) {
    return NextResponse.json(
      { error: "Missing X-Ingest-Key or X-Ingest-Signature header." },
      { status: 401 }
    );
  }

  const source = await prisma.ingestSource.findUnique({ where: { apiKey } });
  if (!source || !source.active) {
    return NextResponse.json({ error: "Invalid API key." }, { status: 401 });
  }

  const rawBody = await req.text();
  const hmacSecret = await readIngestSecret(source);
  if (!verifyHmac(rawBody, hmacSecret, signature)) {
    return NextResponse.json({ error: "Bad HMAC signature." }, { status: 401 });
  }

  let payload: IngestPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    return NextResponse.json({ error: "events[] required." }, { status: 400 });
  }
  if (payload.events.length > 5000) {
    return NextResponse.json(
      { error: "Max 5000 events per call." },
      { status: 413 }
    );
  }

  const job = await prisma.importJob.create({
    data: {
      organizationId: source.organizationId,
      source: "api",
      status: "PROCESSING",
      rowsTotal: payload.events.length,
    },
  });

  const providers = await prisma.provider.findMany();
  const providerByName = new Map(providers.map((p) => [p.name.toLowerCase(), p]));
  const models = await prisma.model.findMany();
  const modelByKey = new Map(
    models.map((m) => [`${m.providerId}:${m.name.toLowerCase()}`, m])
  );

  const inserts: Prisma.UsageEventCreateManyInput[] = [];
  let failed = 0;
  const errors: string[] = [];

  for (const ev of payload.events) {
    try {
      const ts = new Date(ev.timestamp);
      if (isNaN(ts.getTime())) throw new Error(`Invalid timestamp: ${ev.timestamp}`);
      const provider = providerByName.get(ev.provider.toLowerCase());
      if (!provider) throw new Error(`Unknown provider: ${ev.provider}`);
      let model = modelByKey.get(`${provider.id}:${ev.model.toLowerCase()}`);
      if (!model) {
        model = await prisma.model.create({
          data: { providerId: provider.id, name: ev.model },
        });
        modelByKey.set(`${provider.id}:${ev.model.toLowerCase()}`, model);
      }
      const inT = ev.inputTokens ?? 0;
      const outT = ev.outputTokens ?? 0;
      const totT = ev.totalTokens ?? inT + outT;
      const inP = Number(model.inputPricePerMillion);
      const outP = Number(model.outputPricePerMillion);
      const inC = (inT / 1_000_000) * inP;
      const outC = (outT / 1_000_000) * outP;
      inserts.push({
        organizationId: source.organizationId,
        providerId: provider.id,
        modelId: model.id,
        timestamp: ts,
        source: ev.source ?? source.name,
        agentName: ev.agent,
        workflowName: ev.workflow,
        requestOwner: ev.owner,
        inputTokens: inT,
        outputTokens: outT,
        totalTokens: totT,
        estimatedInputCost: new Prisma.Decimal(inC.toFixed(6)),
        estimatedOutputCost: new Prisma.Decimal(outC.toFixed(6)),
        estimatedTotalCost: new Prisma.Decimal((inC + outC).toFixed(6)),
        metadataJson: {
          ...(ev.metadata ?? {}),
          ingestJobId: job.id,
        },
      });
    } catch (e) {
      failed++;
      if (errors.length < 10) errors.push((e as Error).message);
    }
  }

  if (inserts.length) {
    const chunk = 500;
    for (let i = 0; i < inserts.length; i += chunk) {
      await prisma.usageEvent.createMany({ data: inserts.slice(i, i + chunk) });
    }
  }

  await prisma.$transaction([
    prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: failed === payload.events.length ? "FAILED" : "COMPLETED",
        rowsImported: inserts.length,
        rowsFailed: failed,
        completedAt: new Date(),
        error: errors.length ? errors.slice(0, 5).join("; ") : null,
      },
    }),
    prisma.ingestSource.update({
      where: { id: source.id },
      data: { lastSeenAt: new Date() },
    }),
  ]);

  return NextResponse.json({
    jobId: job.id,
    inserted: inserts.length,
    failed,
    errors: errors.slice(0, 10),
  });
}
