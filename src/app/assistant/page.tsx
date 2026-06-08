import { PageHeader } from "@/components/Card";
import { AssistantChat } from "./AssistantChat";
import { resolveCopilotConfig } from "@/lib/copilot-provider";
import { defaultOrgId } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const orgId = await defaultOrgId();
  const cfg = await resolveCopilotConfig(orgId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tokenometer Copilot"
        description={
          cfg.configured
            ? `Agentic FinOps assistant running on ${cfg.provider} (${cfg.modelId}) via ${
                cfg.source === "vault"
                  ? `vaulted credential${cfg.credentialLabel ? `: ${cfg.credentialLabel}` : ""}`
                  : "server environment"
              }.`
            : "Agentic FinOps assistant with tool-use over your real wallets, usage, and forecasts."
        }
      />

      {!cfg.configured && (
        <div className="rounded-lg border border-status-warning/50 bg-status-warning/10 p-4 text-sm text-status-warning">
          <strong>Setup required:</strong> add a provider credential in <code className="font-mono">Credentials</code> or set one of{" "}
          <code className="font-mono">OPENAI_API_KEY</code>, <code className="font-mono">ANTHROPIC_API_KEY</code>,{" "}
          <code className="font-mono">GOOGLE_GENERATIVE_AI_API_KEY</code>, <code className="font-mono">MISTRAL_API_KEY</code>,{" "}
          <code className="font-mono">DEEPSEEK_API_KEY</code>, <code className="font-mono">MINIMAX_API_KEY</code>, or{" "}
          <code className="font-mono">GITHUB_MODELS_API_KEY</code>/<code className="font-mono">GITHUB_TOKEN</code> in the server
          environment. Optionally pin a provider with{" "}
          <code className="font-mono">AI_PROVIDER=openai|anthropic|google|mistral|deepseek|minimax|github</code>.
        </div>
      )}

      <AssistantChat />
    </div>
  );
}
