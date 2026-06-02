type IntegrationMode = "OBSERVE" | "FALLBACK" | "ENFORCE";

type CredentialLike = {
  id: string;
  label: string;
  keyHint: string;
  active: boolean;
  lastUsedAt: Date | null;
  updatedAt: Date;
};

type IngestLike = {
  id: string;
  name: string;
  active: boolean;
  lastSeenAt: Date | null;
  secret: string | null;
  encryptedSecret: string | null;
  secretHint: string;
  updatedAt: Date;
};

type ProjectLike = {
  id: string;
  name: string;
  teamId?: string | null;
};

type ProviderLike = {
  name: string;
};

export type IntegrationHealthStatus = "healthy" | "attention" | "stale" | "broken" | "paused";

export type IntegrationHealthReport = {
  status: IntegrationHealthStatus;
  label: string;
  summary: string;
  nextAction: string;
  issues: string[];
  resolvedCredentialLabel: string;
  resolvedIngestLabel: string;
  staleThresholdHours: number;
  rotationWindowDays: number;
};

export type IntegrationHealthInput = {
  name: string;
  mode: IntegrationMode;
  active: boolean;
  lastSeenAt: Date | null;
  lastVerifiedAt?: Date | null;
  environment?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  runbookUrl?: string | null;
  teamId?: string | null;
  project?: ProjectLike | null;
  provider: ProviderLike;
  credential?: CredentialLike | null;
  ingestSource?: IngestLike | null;
  fallbackCredential?: CredentialLike | null;
  fallbackIngestSource?: IngestLike | null;
};

export function evaluateIntegrationHealth(
  input: IntegrationHealthInput,
  now = new Date(),
): IntegrationHealthReport {
  const staleThresholdHours = getStaleThresholdHours(input.environment);
  const rotationWindowDays = getRotationWindowDays(input.environment);

  if (!input.active) {
    return {
      status: "paused",
      label: "Paused",
      summary: "This integration is intentionally paused, so Tokenometer is not expecting fresh traffic from it.",
      nextAction: "Re-enable it when you want the app back in active rotation.",
      issues: [],
      resolvedCredentialLabel: resolveCredentialLabel(input),
      resolvedIngestLabel: resolveIngestLabel(input),
      staleThresholdHours,
      rotationWindowDays,
    };
  }

  const issues: string[] = [];
  const warnings: string[] = [];
  const resolvedCredential = input.credential ?? input.fallbackCredential ?? null;
  const resolvedIngest = input.ingestSource ?? input.fallbackIngestSource ?? null;

  if (input.credential && !input.credential.active) {
    issues.push("The fixed provider credential linked to this integration is inactive.");
  }

  if (input.ingestSource && !input.ingestSource.active) {
    issues.push("The fixed ingest source linked to this integration is inactive.");
  }

  if (!resolvedIngest) {
    issues.push("No usable ingest source is available, so the app cannot authenticate to Tokenometer.");
  } else if (input.mode === "OBSERVE" && !hasShadowSecret(resolvedIngest)) {
    issues.push("Observe mode needs an ingest signing secret, but the resolved ingest source does not have one.");
  }

  if (input.mode === "ENFORCE" && !resolvedCredential) {
    issues.push("Enforce mode needs a vaulted provider credential, but none is available.");
  }

  if ((input.mode === "OBSERVE" || input.mode === "FALLBACK") && !resolvedCredential) {
    warnings.push("No vaulted provider credential is available. The app can still work if it keeps the provider key in its own environment.");
  }

  if (!input.ownerName || !input.ownerEmail) {
    warnings.push("Owner metadata is incomplete. Add an owner name and email so operational responsibility is explicit.");
  }

  if (!input.runbookUrl) {
    warnings.push("No runbook URL is attached yet. Add one so rotation and incident steps are easier to follow.");
  }

  if (input.project?.teamId && input.teamId && input.project.teamId !== input.teamId) {
    warnings.push("The fixed team does not match the selected project's team. Spend attribution may look confusing.");
  }

  if (!input.lastSeenAt) {
    warnings.push("This integration has never been seen in live traffic.");
  } else {
    const hoursSinceSeen = Math.floor((now.getTime() - input.lastSeenAt.getTime()) / (60 * 60 * 1000));
    if (hoursSinceSeen >= staleThresholdHours) {
      warnings.push(
        `No live traffic has been seen for ${hoursSinceSeen}h, which is older than the ${staleThresholdHours}h freshness threshold for this environment.`,
      );
    }
  }

  if (resolvedCredential && !resolvedCredential.lastUsedAt && input.mode === "ENFORCE") {
    warnings.push("The resolved vaulted credential has not been used yet through Tokenometer.");
  }

  if (resolvedCredential && ageInDays(now, resolvedCredential.updatedAt) >= rotationWindowDays) {
    warnings.push(
      `The resolved provider credential is ${ageInDays(now, resolvedCredential.updatedAt)} days old. Consider rotating it soon.`,
    );
  }

  if (resolvedIngest && ageInDays(now, resolvedIngest.updatedAt) >= rotationWindowDays) {
    warnings.push(
      `The resolved ingest secret is ${ageInDays(now, resolvedIngest.updatedAt)} days old. Consider rotating it soon.`,
    );
  }

  if (!input.lastVerifiedAt) {
    warnings.push("This integration has not been manually verified yet.");
  } else if (ageInDays(now, input.lastVerifiedAt) >= rotationWindowDays) {
    warnings.push(
      `The last manual verification is ${ageInDays(now, input.lastVerifiedAt)} days old. Re-verify the integration after key or flow changes.`,
    );
  }

  if (issues.length > 0) {
    return {
      status: "broken",
      label: "Needs fixing",
      summary: issues[0],
      nextAction: recommendNextAction(input, issues, warnings),
      issues: [...issues, ...warnings],
      resolvedCredentialLabel: resolveCredentialLabel(input),
      resolvedIngestLabel: resolveIngestLabel(input),
      staleThresholdHours,
      rotationWindowDays,
    };
  }

  if (warnings.some((warning) => warning.includes("freshness threshold"))) {
    return {
      status: "stale",
      label: "Stale",
      summary: warnings[0],
      nextAction: recommendNextAction(input, issues, warnings),
      issues: warnings,
      resolvedCredentialLabel: resolveCredentialLabel(input),
      resolvedIngestLabel: resolveIngestLabel(input),
      staleThresholdHours,
      rotationWindowDays,
    };
  }

  if (warnings.length > 0) {
    return {
      status: "attention",
      label: "Needs attention",
      summary: warnings[0],
      nextAction: recommendNextAction(input, issues, warnings),
      issues: warnings,
      resolvedCredentialLabel: resolveCredentialLabel(input),
      resolvedIngestLabel: resolveIngestLabel(input),
      staleThresholdHours,
      rotationWindowDays,
    };
  }

  return {
    status: "healthy",
    label: "Healthy",
    summary: "The integration has usable secrets, clean mappings, recent activity, and an explicit operational owner.",
    nextAction: "Keep routing real traffic and use request IDs if you want to verify a specific call.",
    issues: [],
    resolvedCredentialLabel: resolveCredentialLabel(input),
    resolvedIngestLabel: resolveIngestLabel(input),
    staleThresholdHours,
    rotationWindowDays,
  };
}

export function healthToneClasses(status: IntegrationHealthStatus) {
  switch (status) {
    case "healthy":
      return "bg-status-normal/10 text-status-normal";
    case "attention":
      return "bg-status-warning/10 text-status-warning";
    case "stale":
      return "bg-status-input/10 text-status-input";
    case "broken":
      return "bg-status-exceeded/10 text-status-exceeded";
    case "paused":
      return "bg-border-subtle text-text-muted";
  }
}

function recommendNextAction(
  input: IntegrationHealthInput,
  issues: string[],
  warnings: string[],
) {
  if (issues.some((issue) => issue.includes("ingest source"))) {
    return "Create or relink an active ingest source first, then rerun the guided provider test.";
  }
  if (issues.some((issue) => issue.includes("vaulted provider credential"))) {
    return "Vault or relink a provider credential before you keep pushing traffic through this integration.";
  }
  if (warnings.some((warning) => warning.includes("Owner metadata"))) {
    return "Add an owner name and email so someone clearly owns this integration operationally.";
  }
  if (warnings.some((warning) => warning.includes("runbook URL"))) {
    return "Attach a runbook URL with setup, rollback, and rotation notes.";
  }
  if (warnings.some((warning) => warning.includes("manual verification"))) {
    return "Mark the integration verified after you confirm one fresh request in Gateway and Ledger.";
  }
  if (warnings.some((warning) => warning.includes("days old"))) {
    return "Rotate the linked secret, then verify one fresh request so the integration stays trusted.";
  }
  if (warnings.some((warning) => warning.includes("never been seen"))) {
    return "Use the generated snippet or the guided provider test so this integration gets its first live request.";
  }
  if (warnings.some((warning) => warning.includes("freshness threshold"))) {
    return input.mode === "OBSERVE"
      ? "Send one real shadow event or run the provider test so the integration becomes fresh again."
      : "Send one real proxied request or open Gateway with this integration selected to verify the path.";
  }
  if (warnings.some((warning) => warning.includes("team"))) {
    return "Align the fixed project/team mapping so later chargeback and budget views stay clean.";
  }
  if (warnings.some((warning) => warning.includes("provider credential"))) {
    return "Consider vaulting a provider key even in observe/fallback mode so Tokenometer can test and proxy the app more confidently.";
  }
  return "Open the integration in Gateway and verify one fresh request end to end.";
}

function resolveCredentialLabel(input: IntegrationHealthInput) {
  const resolvedCredential = input.credential ?? input.fallbackCredential ?? null;
  if (!resolvedCredential) return "Missing";
  if (input.credential) return `${resolvedCredential.label} / ****${resolvedCredential.keyHint}`;
  return `${resolvedCredential.label} / ****${resolvedCredential.keyHint} (org default)`;
}

function resolveIngestLabel(input: IntegrationHealthInput) {
  const resolvedIngest = input.ingestSource ?? input.fallbackIngestSource ?? null;
  if (!resolvedIngest) return "Missing";
  if (input.ingestSource) return resolvedIngest.name;
  return `${resolvedIngest.name} (org default)`;
}

function hasShadowSecret(source: IngestLike) {
  return Boolean(source.secret || source.encryptedSecret || source.secretHint);
}

function getStaleThresholdHours(environment?: string | null) {
  const value = environment?.toLowerCase() ?? "";
  if (value.includes("prod")) return 48;
  if (value.includes("stage")) return 96;
  return 24 * 14;
}

function getRotationWindowDays(environment?: string | null) {
  const value = environment?.toLowerCase() ?? "";
  if (value.includes("prod")) return 90;
  if (value.includes("stage")) return 120;
  return 180;
}

function ageInDays(now: Date, value: Date) {
  return Math.floor((now.getTime() - value.getTime()) / (24 * 60 * 60 * 1000));
}
