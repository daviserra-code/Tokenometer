import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

(async () => {
  const ev = await p.usageEvent.count();
  const cr = await p.providerCredential.count();
  const wal = await p.walletEntry.count();
  const ing = await p.ingestSource.count();
  const wallets = await p.wallet.findMany({ include: { provider: true } });
  const creds = await p.providerCredential.findMany();
  const provs = await p.provider.findMany();
  const provById = new Map(provs.map((x) => [x.id, x.name]));
  const recent = await p.usageEvent.findMany({
    take: 5,
    orderBy: { timestamp: "desc" },
    include: { model: { include: { provider: true } } },
  });
  console.log("Counts:", { UsageEvents: ev, ProviderCredentials: cr, WalletEntries: wal, IngestSources: ing });
  console.log("Wallets:", wallets.map((w) => ({ provider: w.provider.name, balance: w.balance.toString() })));
  console.log("Credentials:", creds.map((c) => ({ provider: provById.get(c.providerId), label: c.label, keyHint: c.keyHint, lastUsedAt: c.lastUsedAt })));
  console.log("Recent UsageEvents:", recent.map((r) => ({
    when: r.timestamp,
    provider: r.model.provider.name,
    model: r.model.name,
    inT: r.inputTokens,
    outT: r.outputTokens,
    cost: r.estimatedTotalCost.toString(),
    source: r.source,
  })));
  await p.$disconnect();
})();
