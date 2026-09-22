"use client";

import * as React from "react";
import { ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { shouldSendOnKeydown } from "@/features/chat/lib/composer-keydown";

/**
 * Ported from `.composer` / `.composer-meta` / `.send-btn` in the theme
 * HTML: the gate-gradient top hairline (`::before`), focus-within ring,
 * and the round send button.
 *
 * Phase 4c wired this up and fixed two real bugs in the earlier version:
 *  1. Enter sent unconditionally — during an Arabic/CJK IME composition,
 *     Enter confirms the candidate word, so the old handler submitted
 *     half-typed text. The decision lives in
 *     features/chat/lib/composer-keydown.ts (pure, unit-tested) and checks
 *     both `isComposing` and Safari's `keyCode === 229`.
 *  2. `aria-label="إرسال"` was hardcoded Arabic. It reads `chat.send`.
 *
 * Phase 4c REWORK — layout. One rounded card: the textarea on top, a
 * bottom toolbar underneath (start slot · spacer · end slot · Send), the
 * way Claude's composer is laid out. This component only provides the
 * slots; it knows nothing about models, tokens or parameters:
 *  - `toolbarStart`  e.g. attach, parameters, model chip (shrinks first,
 *                    `min-w-0`, so a long model name truncates instead of
 *                    pushing Send off a 360px screen);
 *  - `toolbarEnd`    e.g. mic (sits just before Send);
 *  - `panel`         an inline panel that opens UPWARD from the card at the
 *                    card's full width (the caller renders it; this
 *                    component just gives it a positioned parent);
 *  - `metaLeft/Right` + `metaNote` the small line under the card.
 *
 * Backward compatible: every prop added since the kitchen-sink demo is
 * optional, so `dev/kitchen-sink` is unchanged.
 */
export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** When set, Send is disabled and this text is announced to assistive
   *  tech (`aria-describedby`). Distinct from `disabled`, which also
   *  disables typing — a blocked send must still let the user edit their
   *  over-long draft down to size. */
  sendBlockedReason?: string;
  /** Fires when the textarea receives focus (callers use it to dismiss an
   *  open inline panel). */
  onInputFocus?: () => void;
  toolbarStart?: React.ReactNode;
  toolbarEnd?: React.ReactNode;
  panel?: React.ReactNode;
  /** e.g. "≈ 0.4 credits · input". */
  metaLeft?: React.ReactNode;
  metaRight?: React.ReactNode;
  /** Longer explanation revealed under the meta line. */
  metaNote?: React.ReactNode;
  className?: string;
}

export function Composer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled,
  sendBlockedReason,
  onInputFocus,
  toolbarStart,
  toolbarEnd,
  panel,
  metaLeft,
  metaRight,
  metaNote,
  className,
}: ComposerProps) {
  const t = useTranslations("chat");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const reasonId = React.useId();

  const blocked = Boolean(sendBlockedReason);
  const canSend = value.trim().length > 0 && !disabled && !blocked;

  // Auto-resize. Reset to "auto" first so the box can SHRINK when text is
  // deleted (scrollHeight never reports less than the current height
  // otherwise). useLayoutEffect, not useEffect, so the resize lands before
  // paint and the box doesn't visibly jump on every keystroke.
  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      shouldSendOnKeydown({
        key: e.key,
        shiftKey: e.shiftKey,
        isComposing: e.nativeEvent.isComposing,
        keyCode: e.keyCode,
      })
    ) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <div className={cn("relative flex flex-col", className)}>
      {panel}
      <div
        className={cn(
          "relative flex flex-col gap-2 rounded-[26px] border border-input bg-card px-4 pb-3 pt-3.5 shadow-1 transition-[box-shadow,border-color]",
          "before:absolute before:inset-x-[18px] before:-top-px before:h-0.5 before:rounded-full before:bg-gradient-to-r before:from-transparent before:via-primary before:to-transparent before:opacity-70",
          "focus-within:border-primary focus-within:shadow-1 focus-within:ring-[3px] focus-within:ring-accent",
          blocked && "border-destructive focus-within:border-destructive focus-within:ring-destructive/20",
        )}
      >
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={onInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          aria-invalid={blocked || undefined}
          aria-describedby={blocked ? reasonId : undefined}
          className="min-h-[44px] max-h-[180px] w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-[1.6] shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">{toolbarStart}</div>
          <div className="flex shrink-0 items-center gap-2">
            {toolbarEnd}
            <button
              type="button"
              disabled={!canSend}
              onClick={onSend}
              aria-label={t("send")}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none transition-[filter,transform,opacity] hover:not-disabled:brightness-[1.08] active:not-disabled:scale-[0.94] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUp className="size-[18px]" />
            </button>
          </div>
        </div>
      </div>
      {blocked && (
        <p id={reasonId} role="alert" className="mt-2 px-1.5 text-[12px] text-destructive">
          {sendBlockedReason}
        </p>
      )}
      {(metaLeft || metaRight) && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1.5 text-[11.5px] text-faint-foreground">
          <span className="flex items-center gap-1">{metaLeft}</span>
          <span>{metaRight}</span>
        </div>
      )}
      {metaNote ? (
        <p className="mt-1.5 px-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{metaNote}</p>
      ) : null}
    </div>
  );
}
