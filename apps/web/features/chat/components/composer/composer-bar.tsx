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
import { MicRecording } from "./mic-recording";
import { availabilityHintKey } from "../../lib/availability";
import { AttachmentSheet } from "./attachment-sheet";
import { AttachmentStrip } from "./attachment-strip";
import type { AttachControls } from "../../hooks/use-attachments";
import { useVoiceInput } from "../../hooks/use-voice-input";
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
 * Attach and mic have three looks (all stay focusable: `aria-disabled`, not
 * `disabled`, so a tap can explain itself): the "coming soon" placeholder
 * while the admin switch is off; live when the switch is on AND the host
 * says the feature is ready; and, in between (P6.3e), a disabled button
 * whose tap says why (and asks the host again), never an empty gap.
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
  /** Phase 4d Patch v7: true while a response is in flight — morphs the
   *  Send button into Stop (see components/chat/composer.tsx). */
  isStreaming?: boolean;
  /** Required alongside `isStreaming`. */
  onStop?: () => void;
  disabled?: boolean;

  models: readonly ChatModel[];
  selectedModelId: string | undefined;
  onSelectModel: (id: string) => void;

  /** Prior turns, so the estimates cover the whole request. */
  history: readonly { content: string }[];

  parametersEnabled: boolean;
  params: ConversationParams;
  onParamsChange: (next: ConversationParams) => void;

  className?: string;
  /** P6.3b. Where a voice transcript goes (the caller appends it to the draft, editable, never sent).
   *  Absent = no voice input and the old placeholder mic. */
  onVoiceText?: ((text: string) => void) | undefined;
  /** P6.3c. Attachment state from `useAttachments` (chat-view owns it, it needs the ready files at send time).
   *  Absent, or its flag off = the old placeholder button, exactly as before. */
  attach?: AttachControls | undefined;
}

const HINT_MS = 2500;

export function ComposerBar({
  value,
  onChange,
  onSend,
  isStreaming,
  onStop,
  disabled,
  models,
  selectedModelId,
  onSelectModel,
  history,
  parametersEnabled,
  params,
  onParamsChange,
  className,
  onVoiceText,
  attach,
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

  // P6.3c attachments: the sheet, and refusals (unsupported type, too big, too many) as the usual hint.
  const [attachSheetOpen, setAttachSheetOpen] = React.useState(false);
  const attachNotice = attach?.notice ?? null;
  React.useEffect(() => {
    if (attachNotice) showHint(t(attachNotice.key));
    // showHint/t are stable enough for a hint; re-fire only when a NEW notice arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachNotice]);

  // P6.3b voice input (shown when an admin turns Voice on; chat-view passes onVoiceText only then).
  const voice = useVoiceInput({
    enabled: onVoiceText !== undefined,
    language: locale,
    onTranscript: (text) => onVoiceText?.(text),
    onError: (key) => showHint(t(key)),
  });
  const voiceBusy = voice.phase === "requesting" || voice.phase === "transcribing";

  // ── send-block: advisory only now (server compacts long histories, see
  // context-estimate.ts header) — near-limit warning still shown, but a
  // long conversation is no longer client-blocked from sending; the
  // server's own CONTEXT_TOO_LONG response is the authoritative reject.
  // P6.3f (session 54): the estimates read a DEFERRED copy of the draft. The text box itself keeps the
  // urgent `value`, so typing never waits for the estimate; React may skip the intermediate estimates
  // on a slow phone and compute only the latest one.
  const deferredValue = React.useDeferredValue(value);
  const contextEstimate = React.useMemo(
    () =>
      selected
        ? estimateContext({ history, draft: deferredValue }, selected.contextWindow)
        : undefined,
    [selected, history, deferredValue],
  );
  const requestTokens = React.useMemo(
    () => (deferredValue.trim().length > 0 ? estimateRequestTokens({ history, draft: deferredValue }) : 0),
    [history, deferredValue],
  );
  const ratio = contextEstimate ? contextUsageRatio(contextEstimate) : 0;
  const nearLimit = ratio >= CONTEXT_WARN_RATIO;

  const sendBlockedReason = !selected
    ? models.length === 0
      ? undefined // the toolbar already shows the "no models" status message
      : t("selectModel")
    : undefined;

  const composerDisabled = busy || models.length === 0;

  // ── cost quote (script-aware; display only) ──────────────────────────
  const hasDraft = value.trim().length > 0;
  let costLine: string | null = null;
  if (selected && hasDraft) {
    const tokens = requestTokens;
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
    voice.phase === "recording" || voice.phase === "transcribing" ? (
      <MicRecording
        phase={voice.phase}
        elapsedMs={voice.elapsedMs}
        onStop={voice.stop}
        onCancel={voice.cancel}
      />
    ) : openPanel === "model" && models.length > 0 ? (
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
          maxOutputTokens={selected?.maxOutputTokens}
          disabled={busy}
        />
      </ComposerPanel>
    ) : null;

  // P6.3c: the attached-files strip rides in the same slot as the panels (above the text box).
  const stripNode =
    attach?.flagOn && attach.items.length > 0 ? <AttachmentStrip items={attach.items} onRemove={attach.remove} /> : null;
  const panelNode = stripNode || panel ? <>{stripNode}{panel}</> : null;

  const paramsCustomised =
    params.temperature !== null ||
    params.topP !== null ||
    params.maxTokens !== null;

  // P6.3e: read once so the tap handler below does not depend on closure narrowing of `attach`.
  const attachAvailability = attach?.availability;
  const attachRecheck = attach?.recheck;

  const toolbarStart = (
    <>
      {!attach || !attach.flagOn ? (
        <ComposerIconButton
          aria-label={t("attach")}
          aria-disabled="true"
          onClick={() => showHint(t("attachComingSoon"))}
        >
          <Plus aria-hidden />
        </ComposerIconButton>
      ) : attach.available ? (
        <ComposerIconButton
          aria-label={t("attach")}
          aria-haspopup="dialog"
          disabled={busy || attach.slots === 0}
          onClick={() => {
            setOpenPanel(null);
            setAttachSheetOpen(true);
          }}
        >
          <Plus aria-hidden />
        </ComposerIconButton>
      ) : (
        // P6.3e: switched on but not (yet) ready. Never an empty gap: a disabled button; a tap says why
        // and asks the host again.
        <ComposerIconButton
          aria-label={t("attach")}
          aria-disabled="true"
          aria-busy={attachAvailability?.phase === "checking"}
          onClick={() => {
            if (attachAvailability?.phase !== "unavailable") return;
            showHint(t(availabilityHintKey("attach", attachAvailability.reason)));
            attachRecheck?.();
          }}
        >
          <Plus aria-hidden />
        </ComposerIconButton>
      )}

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

  const placeholderMic = (
    <ComposerIconButton
      aria-label={t("record")}
      aria-disabled="true"
      onClick={() => showHint(t("recordComingSoon"))}
    >
      <Mic aria-hidden />
    </ComposerIconButton>
  );

  // Flag off (the default): exactly the old placeholder. Flag on: the real mic once the host says speech
  // input is configured; until then (or if it says no) a disabled mic with a reason (P6.3e).
  const toolbarEnd = !voice.flagOn ? (
    placeholderMic
  ) : voice.available ? (
    <ComposerIconButton
      aria-label={voice.phase === "recording" ? t("micStop") : t("record")}
      aria-pressed={voice.phase === "recording"}
      disabled={busy || voiceBusy}
      onClick={() => {
        if (voice.phase === "recording") {
          voice.stop();
          return;
        }
        setOpenPanel(null);
        voice.start();
      }}
      className={cn(voice.phase === "recording" && "bg-destructive text-destructive-foreground hover:not-disabled:bg-destructive")}
    >
      <Mic aria-hidden />
    </ComposerIconButton>
  ) : (
    // P6.3e: switched on but not (yet) ready: a disabled mic that says why when tapped, never an empty gap.
    <ComposerIconButton
      aria-label={t("record")}
      aria-disabled="true"
      aria-busy={voice.availability.phase === "checking"}
      onClick={() => {
        if (voice.availability.phase !== "unavailable") return;
        showHint(t(availabilityHintKey("voice", voice.availability.reason)));
        voice.recheck();
      }}
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
        {...(isStreaming ? { isStreaming, onStop } : {})}
        onInputFocus={() => setOpenPanel(null)}
        placeholder={attach?.flagOn && attach.items.length > 0 ? t("attachPlaceholder") : t("placeholder")}
        disabled={composerDisabled}
        // exactOptionalPropertyTypes: only pass the prop when there IS a
        // reason; passing `sendBlockedReason={undefined}` would be an error
        // against `sendBlockedReason?: string` under that flag.
        {...(attach?.uploading ? { sendBlockedReason: t("attachWaiting") } : sendBlockedReason ? { sendBlockedReason } : {})}
        toolbarStart={toolbarStart}
        toolbarEnd={toolbarEnd}
        panel={panelNode}
        metaLeft={metaLeft}
        metaRight={metaRight}
        {...(costInfoOpen && costLine ? { metaNote: t("estCostTooltip") } : {})}
      />
      {attach?.flagOn && attach.available ? (
        <AttachmentSheet open={attachSheetOpen} onOpenChange={setAttachSheetOpen} onFiles={attach.addFiles} />
      ) : null}
    </div>
  );
}
