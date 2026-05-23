import { PrismaClient, ProjectStatus, ProviderType, BudgetScope, BudgetPeriod, WalletEntryType, InvoiceType, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// --- Helpers ---------------------------------------------------------------

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function randInt(min: number, max: number) {
  return Math.floor(rand(min, max));
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length)];
}

function calcCost(inputTokens: number, outputTokens: number, inP: number, outP: number) {
  const inputCost = (inputTokens / 1_000_000) * inP;
  const outputCost = (outputTokens / 1_000_000) * outP;
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

// --- Seed -------------------------------------------------------------------

async function main() {
  console.log("⏳ Resetting demo data…");
  await prisma.invoice.deleteMany();
  await prisma.walletEntry.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.exchangeRate.deleteMany();
  await prisma.usageEvent.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.project.deleteMany();
  await prisma.team.deleteMany();
  await prisma.model.deleteMany();
  await prisma.provider.deleteMany();
  await prisma.organization.deleteMany();

  console.log("🏢 Creating organizations…");
  const org = await prisma.organization.create({
    data: { name: "Acme AI Holdings", handle: "@acme", currency: "USD" },
  });
  const partnerOrg = await prisma.organization.create({
    data: { name: "Globex AI", handle: "@globex", currency: "USD" },
  });

  console.log("👥 Creating teams…");
  const teamsData = [
    { name: "Customer Support", owner: "Maria Rossi", costCenterCode: "SUP-OPS", costCenterName: "Support Operations" },
    { name: "Product Engineering", owner: "John Doe", costCenterCode: "ENG-PLATFORM", costCenterName: "Engineering Platform" },
    { name: "Data & Analytics", owner: "Lin Wei", costCenterCode: "DATA-OPS", costCenterName: "Data and Analytics" },
    { name: "Marketing Ops", owner: "Sara Bianchi", costCenterCode: "MKT-OPS", costCenterName: "Marketing Operations" },
    { name: "Internal Tools", owner: "Ahmed Khan", costCenterCode: "INT-OPS", costCenterName: "Internal Operations" },
  ];
  const teams = await Promise.all(
    teamsData.map((t) =>
      prisma.team.create({ data: { ...t, organizationId: org.id } })
    )
  );

  console.log("📁 Creating projects…");
  const projectsData = [
    { name: "Support Copilot",        team: 0, owner: "Maria Rossi",  budget: 4500, costCenterCode: "SUP-COPILOT", costCenterName: "Support Copilot Program" },
    { name: "Ticket Auto-Triage",     team: 0, owner: "Maria Rossi",  budget: 1800 },
    { name: "Code Review Assistant",  team: 1, owner: "John Doe",     budget: 6000, costCenterCode: "ENG-CODE-QUAL", costCenterName: "Engineering Code Quality" },
    { name: "Spec → Code Generator",  team: 1, owner: "John Doe",     budget: 3500 },
    { name: "Sales Insights Engine",  team: 2, owner: "Lin Wei",      budget: 5000, costCenterCode: "DATA-SALES", costCenterName: "Sales Intelligence" },
    { name: "Document Summarizer",    team: 2, owner: "Lin Wei",      budget: 2500 },
    { name: "Campaign Copy Studio",   team: 3, owner: "Sara Bianchi", budget: 2200, costCenterCode: "MKT-CAMPAIGN", costCenterName: "Campaign Studio" },
    { name: "SEO Content Pipeline",   team: 3, owner: "Sara Bianchi", budget: 1500 },
    { name: "Internal HR Bot",        team: 4, owner: "Ahmed Khan",   budget: 800  },
    { name: "DevOps Incident Agent",  team: 4, owner: "Ahmed Khan",   budget: 1200, costCenterCode: "INT-SRE", costCenterName: "Site Reliability and Ops" },
  ];
  const projects = await Promise.all(
    projectsData.map((p) =>
      prisma.project.create({
        data: {
          organizationId: org.id,
          teamId: teams[p.team].id,
          name: p.name,
          owner: p.owner,
          costCenterCode: p.costCenterCode,
          costCenterName: p.costCenterName,
          monthlyBudget: new Prisma.Decimal(p.budget),
          status: ProjectStatus.NORMAL,
        },
      })
    )
  );

  console.log("🤖 Creating providers & models…");
  const providersDef = [
    {
      name: "OpenAI",
      type: ProviderType.HOSTED,
      models: [
        // Reasoning flagships
        { name: "o3",             ctx: 200000, in: 2.00,  out: 8.00  },
        { name: "o3-mini",        ctx: 200000, in: 1.10,  out: 4.40  },
        { name: "o4-mini",        ctx: 200000, in: 1.10,  out: 4.40  },
        // GPT-4.1 family (chat flagships)
        { name: "gpt-4.1",        ctx: 1047576, in: 2.00, out: 8.00  },
        { name: "gpt-4.1-mini",   ctx: 1047576, in: 0.40, out: 1.60  },
        { name: "gpt-4.1-nano",   ctx: 1047576, in: 0.10, out: 0.40  },
        // GPT-4o (multimodal, still widely used)
        { name: "gpt-4o",         ctx: 128000, in: 2.50,  out: 10.00 },
        { name: "gpt-4o-mini",    ctx: 128000, in: 0.15,  out: 0.60  },
      ],
    },
    {
      name: "Anthropic",
      type: ProviderType.HOSTED,
      models: [
        { name: "claude-opus-4",       ctx: 200000, in: 15.00, out: 75.00 },
        { name: "claude-sonnet-4",     ctx: 200000, in: 3.00,  out: 15.00 },
        { name: "claude-haiku-4",      ctx: 200000, in: 1.00,  out: 5.00  },
        { name: "claude-3-7-sonnet",   ctx: 200000, in: 3.00,  out: 15.00 },
        { name: "claude-3-5-sonnet",   ctx: 200000, in: 3.00,  out: 15.00 },
        { name: "claude-3-5-haiku",    ctx: 200000, in: 0.80,  out: 4.00  },
      ],
    },
    {
      name: "Google",
      type: ProviderType.HOSTED,
      models: [
        // Gemini 2.5 (current flagships)
        { name: "gemini-2.5-pro",       ctx: 2000000, in: 2.50,  out: 10.00 },
        { name: "gemini-2.5-flash",     ctx: 1000000, in: 0.30,  out: 2.50  },
        { name: "gemini-2.5-flash-lite", ctx: 1000000, in: 0.10, out: 0.40  },
        // Gemini 2.0 (still in service)
        { name: "gemini-2.0-flash",     ctx: 1000000, in: 0.10,  out: 0.40  },
        { name: "gemini-2.0-flash-lite", ctx: 1000000, in: 0.075, out: 0.30 },
      ],
    },
    {
      name: "Mistral",
      type: ProviderType.HOSTED,
      models: [
        { name: "mistral-large-latest",  ctx: 128000, in: 2.00,  out: 6.00 },
        { name: "mistral-medium-latest", ctx: 128000, in: 0.40,  out: 2.00 },
        { name: "mistral-small-latest",  ctx: 128000, in: 0.20,  out: 0.60 },
        { name: "codestral-latest",      ctx: 256000, in: 0.30,  out: 0.90 },
        { name: "pixtral-large-latest",  ctx: 128000, in: 2.00,  out: 6.00 },
      ],
    },
    {
      name: "DeepSeek",
      type: ProviderType.HOSTED,
      models: [
        { name: "deepseek-v4-flash",    ctx: 1000000, in: 0.14,  out: 0.28 },
        { name: "deepseek-v4-pro",      ctx: 1000000, in: 0.435, out: 0.87 },
        { name: "deepseek-chat",        ctx: 1000000, in: 0.14,  out: 0.28 },
        { name: "deepseek-reasoner",    ctx: 1000000, in: 0.14,  out: 0.28 },
      ],
    },
    {
      name: "Self-hosted Llama",
      type: ProviderType.SELF_HOSTED,
      models: [
        { name: "llama-3.3-70b", ctx: 128000, in: 0.50, out: 0.80 },
        { name: "llama-3.1-405b", ctx: 128000, in: 2.70, out: 2.70 },
        { name: "llama-3.1-8b",  ctx: 128000, in: 0.10, out: 0.15 },
      ],
    },
    {
      name: "GitHub",
      type: ProviderType.HOSTED,
      models: [
        // OpenAI through GitHub Models
        { name: "openai/gpt-4.1",              ctx: 1047576, in: 2.00, out: 8.00  },
        { name: "openai/gpt-4.1-mini",         ctx: 1047576, in: 0.40, out: 1.60  },
        { name: "openai/gpt-4.1-nano",         ctx: 1047576, in: 0.10, out: 0.40  },
        { name: "openai/gpt-4o",               ctx: 128000, in: 2.50, out: 10.00 },
        { name: "openai/gpt-4o-mini",          ctx: 128000, in: 0.15, out: 0.60  },
        { name: "openai/o3",                   ctx: 200000, in: 2.00, out: 8.00  },
        { name: "openai/o4-mini",              ctx: 200000, in: 1.10, out: 4.40  },
        // Meta
        { name: "meta/Llama-3.3-70B-Instruct", ctx: 128000, in: 0.71, out: 0.71 },
        { name: "meta/Llama-4-Maverick-17B-128E-Instruct-FP8", ctx: 1000000, in: 0.50, out: 0.50 },
        { name: "meta/Llama-4-Scout-17B-16E-Instruct",         ctx: 1000000, in: 0.25, out: 0.25 },
        // DeepSeek
        { name: "deepseek/DeepSeek-R1",        ctx: 128000, in: 1.50, out: 5.00 },
        { name: "deepseek/DeepSeek-V3",        ctx: 128000, in: 0.30, out: 1.20 },
        // Mistral via GitHub
        { name: "mistral-ai/Mistral-Large-2411", ctx: 128000, in: 2.00, out: 6.00 },
        { name: "mistral-ai/Codestral-2501",     ctx: 256000, in: 0.30, out: 0.90 },
        // xAI
        { name: "xai/grok-3",                  ctx: 131072, in: 3.00, out: 15.00 },
        { name: "xai/grok-3-mini",             ctx: 131072, in: 0.30, out: 0.50  },
      ],
    },
  ];

  const allModels: Array<{
    id: string;
    providerId: string;
    in: number;
    out: number;
  }> = [];
  const providers: Array<{ id: string; name: string; type: ProviderType }> = [];

  for (const p of providersDef) {
    const provider = await prisma.provider.create({
      data: { name: p.name, type: p.type },
    });
    providers.push({ id: provider.id, name: provider.name, type: provider.type });
    for (const m of p.models) {
      const created = await prisma.model.create({
        data: {
          providerId: provider.id,
          name: m.name,
          contextWindow: m.ctx,
          inputPricePerMillion: new Prisma.Decimal(m.in),
          outputPricePerMillion: new Prisma.Decimal(m.out),
        },
      });
      allModels.push({
        id: created.id,
        providerId: provider.id,
        in: m.in,
        out: m.out,
      });
    }
  }

  console.log("💰 Creating budgets…");
  await prisma.budget.create({
    data: {
      organizationId: org.id,
      scopeType: BudgetScope.ORGANIZATION,
      scopeId: org.id,
      period: BudgetPeriod.MONTHLY,
      amount: new Prisma.Decimal(30000),
    },
  });
  for (const project of projects) {
    await prisma.budget.create({
      data: {
        organizationId: org.id,
        scopeType: BudgetScope.PROJECT,
        scopeId: project.id,
        period: BudgetPeriod.MONTHLY,
        amount: project.monthlyBudget,
      },
    });
  }

  console.log("📊 Generating usage events (90 days)…");

  const agents = ["triage-agent", "summary-agent", "rag-retriever", "qa-agent", "router-agent", "writer-agent", "reviewer-agent"];
  const workflows = ["ticket-resolution", "doc-ingest", "weekly-report", "code-review", "lead-enrichment", "campaign-brief", "incident-response"];
  const owners = ["alice@acme.io", "bob@acme.io", "carol@acme.io", "dan@acme.io", "eve@acme.io", "frank@acme.io"];
  const sources = ["api", "scheduled-job", "ui-action", "webhook", "agent-loop"];

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 90);

  const eventsBatch: Prisma.UsageEventCreateManyInput[] = [];
  const totalEvents = 4500;

  for (let i = 0; i < totalEvents; i++) {
    // bias: more events in recent days
    const bias = Math.pow(Math.random(), 0.6);
    const ts = new Date(start.getTime() + bias * (now.getTime() - start.getTime()));

    const project = pick(projects);
    const model = pick(allModels);

    // Token amounts vary by workflow type
    const inputTokens = randInt(200, 12000);
    const outputTokens = randInt(50, 4000);
    const totalTokens = inputTokens + outputTokens;

    const { inputCost, outputCost, totalCost } = calcCost(inputTokens, outputTokens, model.in, model.out);

    eventsBatch.push({
      organizationId: org.id,
      projectId: project.id,
      teamId: project.teamId,
      providerId: model.providerId,
      modelId: model.id,
      timestamp: ts,
      source: pick(sources),
      agentName: pick(agents),
      workflowName: pick(workflows),
      requestOwner: pick(owners),
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedInputCost: new Prisma.Decimal(inputCost.toFixed(6)),
      estimatedOutputCost: new Prisma.Decimal(outputCost.toFixed(6)),
      estimatedTotalCost: new Prisma.Decimal(totalCost.toFixed(6)),
      metadataJson: {
        latencyMs: randInt(120, 4500),
        cacheHit: Math.random() < 0.18,
      },
    });
  }

  // Insert in chunks
  const chunkSize = 500;
  for (let i = 0; i < eventsBatch.length; i += chunkSize) {
    await prisma.usageEvent.createMany({
      data: eventsBatch.slice(i, i + chunkSize),
    });
  }

  // Update project status based on current month spend vs. budget
  console.log("🚦 Updating project statuses…");
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  for (const p of projects) {
    const agg = await prisma.usageEvent.aggregate({
      where: { projectId: p.id, timestamp: { gte: monthStart } },
      _sum: { estimatedTotalCost: true },
    });
    const spend = Number(agg._sum.estimatedTotalCost ?? 0);
    const budget = Number(p.monthlyBudget);
    let status: ProjectStatus = ProjectStatus.NORMAL;
    if (budget > 0) {
      const pct = spend / budget;
      if (pct >= 1) status = ProjectStatus.EXCEEDED;
      else if (pct >= 0.8) status = ProjectStatus.WARNING;
    }
    await prisma.project.update({ where: { id: p.id }, data: { status } });
  }

  // ----- Wallets, exchange rates, demo entries, invoices -------------------
  console.log("💰 Creating wallets…");
  const walletsByProvider: Record<string, { id: string }> = {};
  const startingBalances: Record<string, bigint> = {
    OpenAI: 60_000_000n,
    Anthropic: 40_000_000n,
    Google: 35_000_000n,
    Mistral: 20_000_000n,
    DeepSeek: 18_000_000n,
    "Self-hosted Llama": 80_000_000n,
    GitHub: 25_000_000n,
  };
  for (const p of providers) {
    const w = await prisma.wallet.create({
      data: {
        organizationId: org.id,
        providerId: p.id,
        balance: startingBalances[p.name] ?? 10_000_000n,
        currency: "USD",
      },
    });
    walletsByProvider[p.name] = w;
    // Partner org gets a smaller starting balance only on hosted providers
    if (p.type !== ProviderType.SELF_HOSTED) {
      await prisma.wallet.create({
        data: {
          organizationId: partnerOrg.id,
          providerId: p.id,
          balance: 5_000_000n,
          currency: "USD",
        },
      });
    }
  }

  console.log("🔁 Creating exchange rates…");
  const rateMatrix: Array<[string, string, number]> = [
    ["OpenAI", "Anthropic", 1.0],
    ["Anthropic", "OpenAI", 1.0],
    ["OpenAI", "Google", 1.5],
    ["Google", "OpenAI", 0.66],
    ["OpenAI", "Mistral", 2.0],
    ["Mistral", "OpenAI", 0.5],
    ["Anthropic", "Google", 1.4],
    ["Google", "Anthropic", 0.71],
  ];
  const providerByName = Object.fromEntries(providers.map((p) => [p.name, p]));
  for (const [from, to, rate] of rateMatrix) {
    if (!providerByName[from] || !providerByName[to]) continue;
    await prisma.exchangeRate.create({
      data: {
        organizationId: org.id,
        fromProviderId: providerByName[from].id,
        toProviderId: providerByName[to].id,
        rate: new Prisma.Decimal(rate.toFixed(8)),
      },
    });
  }

  console.log("🧾 Creating demo wallet entries & invoices…");
  let invoiceCounter = 1;
  const mkInvoiceNumber = () =>
    `INV-${now.getFullYear()}-${String(invoiceCounter++).padStart(5, "0")}`;

  const topups: Array<{ provider: string; tokens: bigint; unitCost: number }> = [
    { provider: "OpenAI", tokens: 10_000_000n, unitCost: 0.000002 },
    { provider: "Anthropic", tokens: 5_000_000n, unitCost: 0.0000015 },
    { provider: "Google", tokens: 8_000_000n, unitCost: 0.0000012 },
  ];
  for (const t of topups) {
    const w = walletsByProvider[t.provider];
    if (!w) continue;
    const fiat = Number(t.tokens) * t.unitCost;
    const entry = await prisma.walletEntry.create({
      data: {
        walletId: w.id,
        type: WalletEntryType.TOPUP,
        tokens: t.tokens,
        unitCost: new Prisma.Decimal(t.unitCost.toFixed(8)),
        fiatAmount: new Prisma.Decimal(fiat.toFixed(2)),
        currency: "USD",
        memo: `Initial top-up — ${t.provider}`,
        createdBy: "seed",
      },
    });
    await prisma.invoice.create({
      data: {
        organizationId: org.id,
        number: mkInvoiceNumber(),
        type: InvoiceType.TOPUP,
        walletEntryId: entry.id,
        total: new Prisma.Decimal(fiat.toFixed(2)),
        currency: "USD",
        issuedTo: org.name,
        issuedFrom: t.provider,
        notes: "Seeded top-up invoice",
        dataJson: {
          provider: t.provider,
          tokens: t.tokens.toString(),
          unitCost: t.unitCost,
          fiat,
        },
      },
    });
  }

  // Demo P2P transfer Acme → Globex on OpenAI tokens
  {
    const fromW = walletsByProvider["OpenAI"];
    const toW = await prisma.wallet.findUnique({
      where: {
        organizationId_providerId: {
          organizationId: partnerOrg.id,
          providerId: providerByName["OpenAI"].id,
        },
      },
    });
    if (fromW && toW) {
      const tokens = 1_000_000n;
      const out = await prisma.walletEntry.create({
        data: {
          walletId: fromW.id,
          type: WalletEntryType.TRANSFER_OUT,
          tokens: -tokens,
          counterpartyOrgId: partnerOrg.id,
          counterpartyWalletId: toW.id,
          memo: "P2P transfer to @globex",
          createdBy: "seed",
        },
      });
      const inE = await prisma.walletEntry.create({
        data: {
          walletId: toW.id,
          type: WalletEntryType.TRANSFER_IN,
          tokens,
          counterpartyOrgId: org.id,
          counterpartyWalletId: fromW.id,
          relatedEntryId: out.id,
          memo: "Received from @acme",
          createdBy: "seed",
        },
      });
      await prisma.walletEntry.update({
        where: { id: out.id },
        data: { relatedEntryId: inE.id },
      });
      await prisma.wallet.update({ where: { id: fromW.id }, data: { balance: { decrement: tokens } } });
      await prisma.wallet.update({ where: { id: toW.id }, data: { balance: { increment: tokens } } });

      await prisma.invoice.create({
        data: {
          organizationId: org.id,
          number: mkInvoiceNumber(),
          type: InvoiceType.TRANSFER_OUT,
          walletEntryId: out.id,
          total: new Prisma.Decimal(0),
          currency: "USD",
          issuedTo: partnerOrg.name,
          issuedFrom: org.name,
          notes: "P2P token transfer",
          dataJson: {
            provider: "OpenAI",
            tokens: tokens.toString(),
            counterparty: partnerOrg.handle,
          },
        },
      });
    }
  }

  // Demo exchange OpenAI → Anthropic
  {
    const fromW = walletsByProvider["OpenAI"];
    const toW = walletsByProvider["Anthropic"];
    if (fromW && toW) {
      const fromTokens = 500_000n;
      const rate = 1.0;
      const toTokens = BigInt(Math.floor(Number(fromTokens) * rate));
      const out = await prisma.walletEntry.create({
        data: {
          walletId: fromW.id,
          type: WalletEntryType.EXCHANGE_OUT,
          tokens: -fromTokens,
          memo: `Exchange OpenAI → Anthropic @ ${rate}`,
          createdBy: "seed",
        },
      });
      const inE = await prisma.walletEntry.create({
        data: {
          walletId: toW.id,
          type: WalletEntryType.EXCHANGE_IN,
          tokens: toTokens,
          relatedEntryId: out.id,
          memo: "Exchange credit",
          createdBy: "seed",
        },
      });
      await prisma.walletEntry.update({ where: { id: out.id }, data: { relatedEntryId: inE.id } });
      await prisma.wallet.update({ where: { id: fromW.id }, data: { balance: { decrement: fromTokens } } });
      await prisma.wallet.update({ where: { id: toW.id }, data: { balance: { increment: toTokens } } });

      await prisma.invoice.create({
        data: {
          organizationId: org.id,
          number: mkInvoiceNumber(),
          type: InvoiceType.EXCHANGE,
          walletEntryId: out.id,
          total: new Prisma.Decimal(0),
          currency: "USD",
          issuedTo: org.name,
          issuedFrom: "Tokenometer Exchange",
          notes: "Cross-provider token swap",
          dataJson: {
            fromProvider: "OpenAI",
            toProvider: "Anthropic",
            fromTokens: fromTokens.toString(),
            toTokens: toTokens.toString(),
            rate,
          },
        },
      });
    }
  }

  console.log(`✅ Seed complete. Inserted ${totalEvents} usage events + wallet demo data.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
