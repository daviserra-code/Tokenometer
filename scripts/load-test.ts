/**
 * scripts/load-test.ts
 *
 * Fires N realistic chat completions through your local Tokenometer BYOK
 * proxies so the dashboard populates with real usage + spend data.
 *
 * Usage:
 *   npx tsx scripts/load-test.ts                 # defaults: 5 calls per provider
 *   npx tsx scripts/load-test.ts --n 10          # 10 calls per provider
 *   npx tsx scripts/load-test.ts --only github   # one provider only
 *   npx tsx scripts/load-test.ts --base http://localhost:3000
 *
 * Required env (or auto-resolved from DB):
 *   INGEST_KEY   X-Ingest-Key for one of your IngestSources
 *   BASE_URL     defaults to http://localhost:3000
 *
 * If INGEST_KEY is not set, the script grabs the most recent active
 * IngestSource from the DB.
 *
 * Cost: real money. Each call is ~30-60 input tokens + ~80 output tokens.
 * 5 calls across 4 providers ≈ a fraction of a cent.
 */

import { PrismaClient } from "@prisma/client";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i]?.replace(/^--/, "");
  const v = process.argv[i + 1];
  if (k && v) args.set(k, v);
}

const N = Number(args.get("n") ?? "5");
const ONLY = args.get("only")?.toLowerCase();
const BASE = args.get("base") ?? process.env.BASE_URL ?? "http://localhost:3000";

const PROMPTS = [
  "In one sentence, what's the capital of Japan?",
  "Give me one short tip for writing clean TypeScript.",
  "Name a famous algorithm in two words.",
  "What's 17 times 23? Just the number.",
  "Suggest a single emoji for 'productivity'.",
  "One word for the color of the sky at noon.",
  "Pick a random Greek letter.",
  "Reply with the string 'pong'.",
];

type Provider = {
  key: string;
  providerName: string; // matches DB Provider.name
  endpoint: string; // path under BASE
  defaultModel: string;
  build: (prompt: string, model: string) => unknown;
};

const PROVIDERS: Provider[] = [
  {
    key: "openai",
    providerName: "OpenAI",
    endpoint: "/api/proxy/openai/chat/completions",
    defaultModel: "gpt-4o-mini",
    build: (prompt, model) => ({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 60,
    }),
  },
  {
    key: "anthropic",
    providerName: "Anthropic",
    endpoint: "/api/proxy/anthropic/v1/messages",
    defaultModel: "claude-3-5-haiku-latest",
    build: (prompt, model) => ({
      model,
      max_tokens: 60,
      messages: [{ role: "user", content: prompt }],
    }),
  },
  {
    key: "google",
    providerName: "Google",
    endpoint: "/api/proxy/google/v1beta/models/gemini-2.0-flash:generateContent",
    defaultModel: "gemini-2.0-flash",
    build: (prompt) => ({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 60 },
    }),
  },
  {
    key: "mistral",
    providerName: "Mistral",
    endpoint: "/api/proxy/mistral/v1/chat/completions",
    defaultModel: "mistral-small-latest",
    build: (prompt, model) => ({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 60,
    }),
  },
  {
    key: "github",
    providerName: "GitHub",
    endpoint: "/api/proxy/github/chat/completions",
    defaultModel: "openai/gpt-4o-mini",
    build: (prompt, model) => ({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 60,
    }),
  },
];

async function resolveIngestKey(): Promise<string> {
  if (process.env.INGEST_KEY) return process.env.INGEST_KEY;
  const p = new PrismaClient();
  try {
    const src = await p.ingestSource.findFirst({
      where: { active: true },
      orderBy: { createdAt: "desc" },
    });
    if (!src) throw new Error("No active IngestSource in DB. Create one in Settings → Ingest.");
    return src.apiKey;
  } finally {
    await p.$disconnect();
  }
}

async function vaultedProviders(): Promise<Set<string>> {
  const p = new PrismaClient();
  try {
    const creds = await p.providerCredential.findMany({
      where: { active: true },
      include: {},
    });
    const provs = await p.provider.findMany();
    const byId = new Map(provs.map((x) => [x.id, x.name]));
    return new Set(creds.map((c) => byId.get(c.providerId)).filter(Boolean) as string[]);
  } finally {
    await p.$disconnect();
  }
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

async function fire(p: Provider, ingestKey: string, i: number) {
  const prompt = pick(PROMPTS, i);
  const url = `${BASE}${p.endpoint}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ingest-key": ingestKey,
        "x-project": "load-test",
        "x-agent": `load-test/${p.key}`,
      },
      body: JSON.stringify(p.build(prompt, p.defaultModel)),
    });
    const ms = Date.now() - t0;
    const text = await res.text();
    if (!res.ok) {
      console.log(`  [${p.key}] #${i + 1} ${res.status} (${ms}ms) → ${text.slice(0, 140)}`);
      return false;
    }
    let usage = "";
    try {
      const j = JSON.parse(text);
      const u = j.usage ?? j.usageMetadata;
      if (u) {
        const inT = u.prompt_tokens ?? u.input_tokens ?? u.promptTokenCount ?? "?";
        const outT = u.completion_tokens ?? u.output_tokens ?? u.candidatesTokenCount ?? "?";
        usage = `  ${inT}→${outT} tok`;
      }
    } catch {
      /* ignore */
    }
    console.log(`  [${p.key}] #${i + 1} 200 (${ms}ms)${usage}`);
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  [${p.key}] #${i + 1} ERROR ${msg}`);
    return false;
  }
}

(async () => {
  const ingestKey = await resolveIngestKey();
  const vaulted = await vaultedProviders();

  const targets = PROVIDERS.filter((p) => {
    if (ONLY && p.key !== ONLY) return false;
    if (!vaulted.has(p.providerName)) {
      console.log(`Skip ${p.key}: no ${p.providerName} credential vaulted.`);
      return false;
    }
    return true;
  });

  if (targets.length === 0) {
    console.log("Nothing to do. Add credentials in /settings/credentials first.");
    return;
  }

  console.log(`Base: ${BASE}`);
  console.log(`Targets: ${targets.map((t) => t.key).join(", ")}  (N=${N} each)`);
  console.log("");

  let ok = 0;
  let fail = 0;
  for (const p of targets) {
    console.log(`→ ${p.key} (${p.defaultModel})`);
    for (let i = 0; i < N; i++) {
      const success = await fire(p, ingestKey, i);
      success ? ok++ : fail++;
    }
    console.log("");
  }

  console.log(`Done. ok=${ok} fail=${fail}`);
  console.log(`Open http://localhost:3000/  — usage and wallets should reflect the new traffic.`);
})();
