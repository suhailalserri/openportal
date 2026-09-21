"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Composer } from "@/components/chat/composer";
import type { ChatModel } from "../../lib/model-selection";
import { modelDisplayName } from "../../lib/model-selection";
import {
  CONTEXT_WARN_RATIO,
  contextUsageRatio,
  estimateContext,
} from "../../lib/context-estimate";
import type { ConversationParams } from "../../types";
import { ModelPicker } from "./model-picker";
import { ParametersPanel } from "./parameters-panel";

/**
 * apps/web/features/chat/components/composer/composer-bar.tsx
 *
 * Phase 4c. Assembles the composer, model picker, token estimate and
 * (optionally) the parameters panel. Fully controlled and free of
 * tRPC/fetch — the page passes in `models`, params and handlers — so it
 * renders in the /dev fixture with static data.
 *
 * SEND-BLOCKING RULES (in priority order, first match wins as the
 * message shown; ALL of them disable Send):
 *  1. no model available/selected  → cannot send at all
 *  2. estimated request > 95% of the model's context window (the server
 *     would reply CONTEXT_TOO_LONG) → blocked, with the plan's warning
 *  3. `disabled` (e.g. a stream is in flight; useChatStream also
 *     ignores a second send, this just reflects it in the UI)
 * The estimate covers system prompt + history + draft (see
 * lib/context-estimate.ts) — a short draft in a long chat can be over.
 *
 * `parametersEnabled` is how the plan's "shown only once B1 is deployed"
 * gate is expressed: the page passes false to hide the panel and its
 * toggle entirely. In this repo B1 is present (apps/api/src/schemas/
 * chat.schema.ts accepts the fields), so the page passes true.
 */
export interface ComposerBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;

  models: readonly ChatModel[];
  selectedModelId: string | undefined;
  onSelectModel: (id: string) => void;

  /** Prior turns + system prompt, so the estimate covers the whole request. */
  history: readonly { content: string }[];

  parametersEnabled: boolean;
  params: ConversationParams;
  onParamsChange: (next: ConversationParams) => void;
  systemPrompt: string;
  onSystemPromptChange: (next: string) => void;

  className?: string;
}

export function ComposerBar({
  value,
  onChange,
  onSend,
  disabled,
  models,
  selectedModelId,
  onSelectModel,
  history,
  parametersEnabled,
  params,
  onParamsChange,
  systemPrompt,
  onSystemPromptChange,
  className,
}: ComposerBarProps) {
  const t = useTranslations("chat");
  const locale = useLocale() === "ar" ? "ar" : "en";
  const [panelOpen, setPanelOpen] = React.useState(false);
  const panelId = React.useId();

  const selected = models.find((m) => m.id === selectedModelId);

  const estimate = React.useMemo(
    () =>
      selected
        ? estimateContext({ systemPrompt, history, draft: value }, selected.contextWindow)
        : undefined,
    [selected, systemPrompt, history, value],
  );

  const ratio = estimate ? contextUsageRatio(estimate) : 0;
  const overLimit = estimate?.overLimit ?? false;
  const nearLimit = !overLimit && ratio >= CONTEXT_WARN_RATIO;

  const sendBlockedReason = !selected
    ? models.length === 0
      ? undefined // ModelPicker already shows the "no models" status message
      : t("selectModel")
    : overLimit
      ? t("contextExceeded")
      : undefined;

  // No model at all also blocks Send, but has no message of its own
  // (the picker states it). Compose the disable into `disabled`.
  const composerDisabled = (disabled ?? false) || models.length === 0;

  const fmt = (n: number) => n.toLocaleString("en-US");

  const metaLeft = estimate ? (
    <span
      className={cn(
        "tabular-nums",
        overLimit && "text-destructive",
        nearLimit && "text-warning",
      )}
      dir="ltr"
    >
      {t("tokenCount", { count: fmt(estimate.tokens) })} / {fmt(Math.floor(estimate.limit))}
      {nearLimit ? ` — ${t("contextWarning")}` : ""}
    </span>
  ) : null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ModelPicker
          models={models}
          selectedId={selectedModelId}
          onSelect={onSelectModel}
          disabled={disabled ?? false}
        />
        {parametersEnabled ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={panelOpen}
            aria-controls={panelId}
            onClick={() => setPanelOpen((o) => !o)}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            {t("parameters.toggle")}
          </Button>
        ) : null}
      </div>

      {parametersEnabled && panelOpen ? (
        <div id={panelId} className="rounded-xl border border-border bg-card p-4">
          <ParametersPanel
            params={params}
            onParamsChange={onParamsChange}
            systemPrompt={systemPrompt}
            onSystemPromptChange={onSystemPromptChange}
            maxOutputTokens={selected?.maxOutputTokens}
            disabled={disabled ?? false}
          />
        </div>
      ) : null}

      <Composer
        value={value}
        onChange={onChange}
        onSend={onSend}
        placeholder={t("placeholder")}
        disabled={composerDisabled}
        // exactOptionalPropertyTypes: only pass the prop when there IS a
        // reason; passing `sendBlockedReason={undefined}` would be an error
        // against `sendBlockedReason?: string` under that flag.
        {...(sendBlockedReason ? { sendBlockedReason } : {})}
        metaLeft={metaLeft}
        metaRight={selected ? modelDisplayName(selected, locale) : null}
      />
    </div>
  );
}
