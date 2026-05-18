"use client";

import { useChat } from "ai/react";
import { Card, PageHeader } from "@/components/Card";

const SAMPLES = [
  "Which provider is driving cost growth this week?",
  "Show me the top 5 projects by spend in the last 30 days.",
  "What are my current wallet balances?",
  "Forecast next 30 days of spend.",
  "Suggest cheaper model alternatives I could swap to.",
  "Detect any anomalies in the last 24 hours.",
];

export function AssistantChat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setInput } =
    useChat({ api: "/api/assistant" });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
      <Card title="Conversation" description="Tool-grounded answers from your real usage data.">
        <div className="flex h-[60vh] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto pr-2">
            {messages.length === 0 && (
              <div className="rounded-lg border border-dashed border-border-subtle bg-background/40 p-6 text-center text-sm text-text-muted">
                Ask anything about token spend, balances, or optimizations.
              </div>
            )}
            {messages.map((m) => (
              <Bubble key={m.id} role={m.role}>
                {m.content || (
                  <span className="text-text-muted italic">
                    {m.toolInvocations?.length
                      ? `Calling ${m.toolInvocations.map((t) => t.toolName).join(", ")}…`
                      : "…"}
                  </span>
                )}
              </Bubble>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <Bubble role="assistant">
                <span className="text-text-muted italic">Thinking…</span>
              </Bubble>
            )}
            {error && (
              <div className="rounded border border-status-exceeded/50 bg-status-exceeded/10 p-3 text-sm text-status-exceeded">
                {error.message}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-3 flex gap-2 border-t border-border-subtle pt-3">
            <input
              value={input}
              onChange={handleInputChange}
              placeholder="Ask Tokenometer Copilot…"
              className="flex-1 rounded-lg border border-border-subtle bg-background px-3 py-2 text-on-surface placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-primary-container disabled:opacity-60"
            >
              Send
            </button>
          </form>
        </div>
      </Card>

      <Card title="Try asking">
        <ul className="space-y-2">
          {SAMPLES.map((s) => (
            <li key={s}>
              <button
                onClick={() => setInput(s)}
                className="w-full rounded-lg border border-border-subtle bg-background p-3 text-left text-[13px] text-on-surface hover:border-primary"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Bubble({ role, children }: { role: string; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-sm ${
          isUser
            ? "bg-primary text-slate-900"
            : "border border-border-subtle bg-surface-elevated/40 text-on-surface"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
