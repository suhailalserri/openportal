"use client";

import * as React from "react";

import { ComposerBar } from "@/features/chat/components/composer/composer-bar";
import { DEFAULT_CONVERSATION_PARAMS, type ConversationParams } from "@/features/chat/types";
import { resolveSelectedModelId, type ChatModel } from "@/features/chat/lib/model-selection";

/**
 * apps/web/app/[locale]/dev/chat-composer/chat-composer-client.tsx
 *
 * Phase 4c's "done when" preview. STATIC fixtures on purpose — no tRPC, no
 * /api/chat — so every 4c behaviour can be checked without a backend, a
 * seeded database, or a spend:
 *   - type past 95% of the small-context model's window → Send disables
 *     and the localized warning appears (use the "Tiny context" model:
 *     its limit is only ~190 tokens, ≈ 760 characters);
 *   - Shift+Enter inserts a newline, Enter "sends" (appends to the log);
 *   - IME: compose Arabic with a phonetic IME and press Enter to accept a
 *     candidate — nothing may be sent;
 *   - the Parameters panel: out-of-range temperature (e.g. 3) shows an
 *     inline error; Arabic-Indic digits (٠٫٧) are accepted;
 *   - the model with `avgResponseTimeMs: null` renders "—" for latency.
 * What this page CANNOT show: real generation changing with parameters, or
 * the system prompt PATCH round-trip — those need the deployed backend
 * (see "How to verify" in BRANCH_AND_CI_NOTES.md).
 */
const FIXTURE_MODELS: ChatModel[] = [
  {
    id: "fixture-large",
    displayName: "Large model",
    displayNameAr: "نموذج كبير",
    badge: "⚡",
    provider: "openai",
    tier: "premium",
    contextWindow: 128_000,
    maxOutputTokens: 8192,
    supportsVision: true,
    avgResponseTimeMs: 1200,
    creditsPerKInput: 5,
    creditsPerKOutput: 15,
  },
  {
    id: "fixture-tiny",
    displayName: "Tiny context",
    displayNameAr: "سياق صغير",
    badge: "",
    provider: "deepseek",
    tier: "standard",
    contextWindow: 200, // limit = 190 tokens ≈ 760 chars
    maxOutputTokens: 256,
    supportsVision: false,
    avgResponseTimeMs: null, // exercises the "—" latency fallback
    creditsPerKInput: 1,
    creditsPerKOutput: 2,
  },
];

export function ChatComposerClient() {
  const [value, setValue] = React.useState("");
  const [log, setLog] = React.useState<string[]>([]);
  const [picked, setPicked] = React.useState<string | undefined>(undefined);
  const [params, setParams] = React.useState<ConversationParams>(DEFAULT_CONVERSATION_PARAMS);
  const [systemPrompt, setSystemPrompt] = React.useState("");

  const selectedId = resolveSelectedModelId(FIXTURE_MODELS, { sessionPickedModelId: picked });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
      <section>
        <h2 className="t-h3 mb-2">Composer bar — fixtures</h2>
        <p className="t-small mb-4 text-muted-foreground">
          Pick &quot;Tiny context&quot; and paste ~800 characters to see Send block. State below
          shows exactly what would go on the wire.
        </p>
        <ComposerBar
          value={value}
          onChange={setValue}
          onSend={() => {
            setLog((l) => [...l, value]);
            setValue("");
          }}
          models={FIXTURE_MODELS}
          selectedModelId={selectedId}
          onSelectModel={setPicked}
          history={log.map((content) => ({ content }))}
          parametersEnabled
          params={params}
          onParamsChange={setParams}
          systemPrompt={systemPrompt}
          onSystemPromptChange={setSystemPrompt}
        />
      </section>

      <section>
        <h2 className="t-h3 mb-2">Would be sent</h2>
        <pre dir="ltr" className="overflow-x-auto rounded-xl border border-border bg-card p-4 text-xs">
          {JSON.stringify(
            {
              model: selectedId,
              ...(params.temperature !== null ? { temperature: params.temperature } : {}),
              ...(params.topP !== null ? { top_p: params.topP } : {}),
              ...(params.maxTokens !== null ? { max_tokens: params.maxTokens } : {}),
              ...(systemPrompt.trim() ? { systemPrompt: systemPrompt.trim() } : {}),
              sentMessages: log.length,
            },
            null,
            2,
          )}
        </pre>
      </section>
    </div>
  );
}
