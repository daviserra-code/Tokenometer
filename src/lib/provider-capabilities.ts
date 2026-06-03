type MeteringPathKind =
  | "proxy_captured"
  | "shadow_reported"
  | "imported"
  | "estimated"
  | "unknown";

type MeteringConfidence = "high" | "medium" | "low";

export type ProviderCapability = {
  provider: string;
  liveMetering: string;
  historicalSync: string;
  adminKeyRequired: boolean;
  fallback: string;
  recommended: string;
};

const PROVIDER_CAPABILITIES: ProviderCapability[] = [
  {
    provider: "OpenAI",
    liveMetering: "Response usage returned",
    historicalSync: "Admin usage APIs and dashboard export",
    adminKeyRequired: true,
    fallback: "Project or dashboard reconciliation",
    recommended: "Proxy or shadow metering first",
  },
  {
    provider: "Anthropic",
    liveMetering: "Response usage returned",
    historicalSync: "Admin usage report",
    adminKeyRequired: true,
    fallback: "Console reconciliation",
    recommended: "Proxy or shadow metering first",
  },
  {
    provider: "Google",
    liveMetering: "usageMetadata returned",
    historicalSync: "Weaker direct API history",
    adminKeyRequired: false,
    fallback: "Cloud Billing export on GCP or Vertex",
    recommended: "Live metering and billing export",
  },
  {
    provider: "Mistral",
    liveMetering: "Response usage returned",
    historicalSync: "Workspace or admin visibility",
    adminKeyRequired: false,
    fallback: "Dashboard reconciliation",
    recommended: "Live metering and workspace checks",
  },
  {
    provider: "DeepSeek",
    liveMetering: "Response usage returned",
    historicalSync: "Dashboard or API-key export",
    adminKeyRequired: false,
    fallback: "Usage page export",
    recommended: "Live metering and export backfill",
  },
  {
    provider: "GitHub",
    liveMetering: "Mixed and billing-path dependent",
    historicalSync: "GitHub billing reports",
    adminKeyRequired: false,
    fallback: "Underlying provider when BYOK",
    recommended: "Meter where billing actually happens",
  },
];

export function getProviderCapability(providerName: string): ProviderCapability {
  return (
    PROVIDER_CAPABILITIES.find((entry) => entry.provider === providerName) ?? {
      provider: providerName,
      liveMetering: "Unknown",
      historicalSync: "Unknown",
      adminKeyRequired: false,
      fallback: "Provider-specific fallback",
      recommended: "Prefer live metering",
    }
  );
}

export function listProviderCapabilities() {
  return PROVIDER_CAPABILITIES;
}

export type MeteringPath = {
  kind: MeteringPathKind;
  label: string;
  detail: string;
  confidence: MeteringConfidence;
};

export function classifyMeteringPath(
  source: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): MeteringPath {
  if (metadata?.tokenSource === "estimated" || metadata?.estimated === true || metadata?.estimationMethod) {
    return {
      kind: "estimated",
      label: "Estimated",
      detail: "Tokens estimated locally rather than provider-returned.",
      confidence: "low",
    };
  }

  if (source === "csv") {
    return {
      kind: "imported",
      label: "CSV import",
      detail: "Imported from a file or backfill flow.",
      confidence: "medium",
    };
  }

  if (typeof source === "string" && source.startsWith("byok-proxy:")) {
    return {
      kind: "proxy_captured",
      label: "Proxy captured",
      detail: "Metered in-path through the Tokenometer gateway.",
      confidence: "high",
    };
  }

  if (
    typeof source === "string" &&
    source.startsWith("shadow-")
  ) {
    return {
      kind: "shadow_reported",
      label: "Shadow reported",
      detail: "Provider call happened in-app, then usage was signed back to Tokenometer.",
      confidence: "high",
    };
  }

  if (metadata?.importJobId) {
    return {
      kind: "shadow_reported",
      label: "Signed ingest",
      detail: "Usage landed through the ingest API after the app completed its own provider call.",
      confidence: "high",
    };
  }

  return {
    kind: "unknown",
    label: "Unclassified",
    detail: "The event does not clearly expose its metering path yet.",
    confidence: "medium",
  };
}

export function meteringPathToneClasses(path: MeteringPath) {
  if (path.confidence === "high") {
    return "border-status-normal/40 bg-status-normal/10 text-status-normal";
  }
  if (path.confidence === "low") {
    return "border-status-warning/40 bg-status-warning/10 text-status-warning";
  }
  return "border-border-subtle bg-background text-text-muted";
}
