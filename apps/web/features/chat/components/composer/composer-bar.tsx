"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Info, Mic, Plus, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Composer } from "@/components/chat/composer";
import { ComposerIconButton } from "@/components/chat/composer-icon-button";
import type { ChatModel } from "../../lib/model-selection";
import { CONTEXT_WARN_RATIO, contextUsageRatio, estimateContext } from "../../lib/context-estimate";
import {
  creditsForTokens,
  estimateRequestTokens,
  formatQuote,
  unitPrice,
} from "../../lib/cost-estimate";
import { reconcilePanel, togglePanel, type OpenPanel } from "../../lib/composer-panels";
import { clampMaxTokens } from "../../lib/param-slider";
import type { ConversationParams } from "../../types";
import { ComposerPanel, useDismiss } from "./composer-panel";
import { ModelChip, ModelList } from "./model-picker";
import { ParametersPanel } from "./parameters-panel";

/**
 * apps/web/features/chat/components/composer/composer-bar.tsx
 *
 * Phase 4c (rework). Assembles the composer: ONE card whose bottom toolbar
 * carries everything, Claude-style —
 *
 *   [ + ]  [ ⚙ ]  [ Model ▾ ]  · · ·  [ 🎙 ]  [ ➤ ]
 *   attach params model chip           mic     send
 *
 * Attach and mic are PLACEHOLDERS (not wired; no upload path or speech
 * hook exists yet). They stay focusable (`aria-disabled`, not `disabled`)
 * and a tap shows a short "coming soon" line under the card.
 *
 * The model list and the parameters open as INLINE panels above the card
 * (composer-panel.tsx): one at a time (lib/composer-panels.ts), dismissed
 * by Escape, a tap outside, focusing the textarea, choosing a model, or
 * sending. Escape returns focus to the button that opened the panel.
 *
 * Fully controlled and free of tRPC/fetch — the page passes in `models`,
 * params and handlers — so it renders in the /dev fixture with static data.
 *
 * WHAT THE LINE UNDER THE CARD SHOWS. The old "N / limit tokens" counter is
 * gone. Instead, once there is a draft: "≈ X credits · input" — the
 * estimated cost of the WHOLE request (system prompt + history + draft;
 * see lib/cost-estimate.ts for why the whole request and for the
 * Rule 1 bounds on this estimate), and, only if the user has capped the
 * reply length, "reply up to ≈ Y" (the ceiling that cap implies). An
 * "approaching the context limit" note appears from 80%.
 *
 * SEND-BLOCKING RULES (unchanged from 4c; ALL disable Send):
 *  1. no model available/selected  → cannot send at all
 *  2. estimated request > 95% of the model's context window (the server
 *     would reply CONTEXT_TOO_LONG) → blocked, with the plan's warning
 *  3. `disabled` (e.g. a stream is in flight)
 * The block deliberately still uses the server-mirroring `chars/4`
 * estimate (lib/context-estimate.ts), NOT the script-aware cost estimate,
 * so the client and the server can never disagree about "too long".
 *
 * `parametersEnabled` is the plan's "shown only once B1 is deployed" gate:
 * false hides the parameters button and panel entirely. In this repo B1 is
 * present, so the page passes true.
 */
export interface ComposerBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;

  models: readonly ChatModel[];
  selectedModelId: string | undefined;
  onSelectModel: (id: string) => void;

  /** Prior turns + system prompt, so the estimates cover the whole request. */
  history: readonly { content: string }[];

  parametersEnabled: boolean;
  params: ConversationParams;
  onParamsChange: (next: ConversationParams) => void;
  systemPrompt: string;
  onSystemPromptChange: (next: string) => void;

  className?: string;
}

const HINT_MS = 2500;

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
  const tm = useTranslations("models");
  const locale = useLocale() === "ar" ? "ar" : "en";

  const rootRef = React.useRef<HTMLDivElement>(null);
  const modelBtnRef = React.useRef<HTMLButtonElement>(null);
  const paramsBtnRef = React.useRef<HTMLButtonElement>(null);
  const modelPanelId = React.useId();
  const paramsPanelId = React.useId();

  const [openPanel, setOpenPanel] = React.useState<OpenPanel>(null);
  const [costInfoOpen, setCostInfoOpen] = React.useState(false);
  const [hint, setHint] = React.useState<string | null>(null);
  const hintTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const selected = models.find((m) => m.id === selectedModelId);
  const busy = disabled ?? false;

  // A panel can't stay open once its trigger is unavailable.
  React.useEffect(() => {
    setOpenPanel((cur) =>
      reconcilePanel(cur, { model: models.length > 0 && !busy, params: parametersEnabled }),
    );
  }, [models.length, busy, parametersEnabled]);

  useDismiss(rootRef, openPanel !== null, (reason) => {
    const was = openPanel;
    setOpenPanel(null);
    if (reason === "escape") (was === "model" ? modelBtnRef : paramsBtnRef).current?.focus();
  });

  React.useEffect(() => () => clearTimeout(hintTimer.current), []);

  const showHint = (text: string) => {
    setHint(text);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), HINT_MS);
  };

  // ── send-block: mirrors the SERVER's estimate exactly ────────────────
  const contextEstimate = React.useMemo(
    () =>
      selected
        ? estimateContext({ systemPrompt, history, draft: value }, selected.contextWindow)
        : undefined,
    [selected, systemPrompt, history, value],
  );
  const ratio = contextEstimate ? contextUsageRatio(contextEstimate) : 0;
  const overLimit = contextEstimate?.overLimit ?? false;
  const nearLimit = !overLimit && ratio >= CONTEXT_WARN_RATIO;

  const sendBlockedReason = !selected
    ? models.length === 0
      ? undefined // the toolbar already shows the "no models" status message
      : t("selectModel")
    : overLimit
      ? t("contextExceeded")
      : undefined;

  const composerDisabled = busy || models.length === 0;

  // ── cost quote (script-aware; display only) ──────────────────────────
  const hasDraft = value.trim().length > 0;
  let costLine: string | null = null;
  if (selected && hasDraft) {
    const tokens = estimateRequestTokens({ systemPrompt, history, draft: value });
    const inCredits = creditsForTokens(tokens, unitPrice(selected, "input").perK);
    costLine = t("costInput", { credits: formatQuote(inCredits, locale) });
    const cap = clampMaxTokens(params.maxTokens, selected.maxOutputTokens);
    if (parametersEnabled && cap !== null) {
      const outCredits = creditsForTokens(cap, unitPrice(selected, "output").perK);
      costLine += ` · ${t("costReplyUpTo", { credits: formatQuote(outCredits, locale) })}`;
    }
  }

  const metaLeft = costLine ? (
    <>
      <span className="tabular-nums">{costLine}</span>
      <button
        type="button"
        aria-label={t("costInfo")}
        aria-expanded={costInfoOpen}
        onClick={() => setCostInfoOpen((o) => !o)}
        className={cn(
          "flex size-5 items-center justify-center rounded-full text-faint-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          costInfoOpen && "text-accent-foreground",
        )}
      >
        <Info className="size-3.5" aria-hidden />
      </button>
    </>
  ) : null;

  const metaRight = hint ? (
    <span role="status" className="text-muted-foreground">
      {hint}
    </span>
  ) : nearLimit ? (
    <span className="text-warning">{t("contextWarning")}</span>
  ) : null;

  // ── panels ────────────────────────────────────────────────────────────
  const panel =
    openPanel === "model" && models.length > 0 ? (
      <ComposerPanel id={modelPanelId} label={t("selectModel")}>
        <ModelList
          models={models}
          selectedId={selectedModelId}
          onSelect={(id) => {
            onSelectModel(id);
            setOpenPanel(null);
            modelBtnRef.current?.focus();
          }}
        />
      </ComposerPanel>
    ) : openPanel === "params" && parametersEnabled ? (
      <ComposerPanel id={paramsPanelId} label={t("parameters.toggle")}>
        <ParametersPanel
          params={params}
          onParamsChange={onParamsChange}
          systemPrompt={systemPrompt}
          onSystemPromptChange={onSystemPromptChange}
          maxOutputTokens={selected?.maxOutputTokens}
          disabled={busy}
        />
      </ComposerPanel>
    ) : null;

  const paramsCustomised =
    params.temperature !== null ||
    params.topP !== null ||
    params.maxTokens !== null ||
    systemPrompt.length > 0;

  const toolbarStart = (
    <>
      <ComposerIconButton
        aria-label={t("attach")}
        aria-disabled="true"
        onClick={() => showHint(t("attachComingSoon"))}
      >
        <Plus aria-hidden />
      </ComposerIconButton>

      {parametersEnabled ? (
        <ComposerIconButton
          ref={paramsBtnRef}
          aria-label={t("parameters.toggle")}
          aria-haspopup="true"
          aria-expanded={openPanel === "params"}
          aria-controls={paramsPanelId}
          active={openPanel === "params"}
          onClick={() => setOpenPanel((cur) => togglePanel(cur, "params"))}
        >
          <SlidersHorizontal aria-hidden />
          {paramsCustomised ? (
            <span
              aria-hidden
              className="absolute end-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-card"
            />
          ) : null}
        </ComposerIconButton>
      ) : null}

      {models.length === 0 ? (
        <p role="status" className="truncate text-[12.5px] text-muted-foreground">
          {tm("noneAvailable")}
        </p>
      ) : (
        <ModelChip
          ref={modelBtnRef}
          model={selected}
          open={openPanel === "model"}
          controls={modelPanelId}
          disabled={busy}
          onClick={() => setOpenPanel((cur) => togglePanel(cur, "model"))}
        />
      )}
    </>
  );

  const toolbarEnd = (
    <ComposerIconButton
      aria-label={t("record")}
      aria-disabled="true"
      onClick={() => showHint(t("recordComingSoon"))}
    >
      <Mic aria-hidden />
    </ComposerIconButton>
  );

  return (
    <div ref={rootRef} className={className}>
      <Composer
        value={value}
        onChange={onChange}
        onSend={() => {
          setOpenPanel(null);
          onSend();
        }}
        onInputFocus={() => setOpenPanel(null)}
        placeholder={t("placeholder")}
        disabled={composerDisabled}
        // exactOptionalPropertyTypes: only pass the prop when there IS a
        // reason; passing `sendBlockedReason={undefined}` would be an error
        // against `sendBlockedReason?: string` under that flag.
        {...(sendBlockedReason ? { sendBlockedReason } : {})}
        toolbarStart={toolbarStart}
        toolbarEnd={toolbarEnd}
        panel={panel}
        metaLeft={metaLeft}
        metaRight={metaRight}
        {...(costInfoOpen && costLine ? { metaNote: t("estCostTooltip") } : {})}
      />
    </div>
  );
}
