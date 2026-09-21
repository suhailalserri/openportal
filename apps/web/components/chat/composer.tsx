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
 * Phase 4c wired this up (it was presentational-only before) and fixed
 * two real bugs found in the earlier version:
 *  1. Enter sent unconditionally — during an Arabic/CJK IME composition,
 *     Enter confirms the candidate word, so the old handler submitted
 *     half-typed text. The decision now lives in
 *     features/chat/lib/composer-keydown.ts (pure, unit-tested) and checks
 *     both `isComposing` and Safari's `keyCode === 229`.
 *  2. `aria-label="إرسال"` was hardcoded Arabic, wrong on the English
 *     locale. It now reads `chat.send` from the message catalogue.
 *
 * Also new: the textarea auto-grows with its content (capped by the
 * existing `max-h-[180px]`, past which it scrolls), and `sendBlockedReason`
 * lets a caller disable Send with an accessible explanation (used for the
 * context-limit warning) without this component knowing anything about
 * tokens or models.
 *
 * Backward compatible: every prop added in 4c is optional, so the
 * kitchen-sink demo (value/onChange/onSend/placeholder/metaLeft/metaRight)
 * is unchanged.
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
  /** e.g. "120 / 8,000 tokens". */
  metaLeft?: React.ReactNode;
  metaRight?: React.ReactNode;
  className?: string;
}

export function Composer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled,
  sendBlockedReason,
  metaLeft,
  metaRight,
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
    <div className={cn("flex flex-col", className)}>
      <div
        className={cn(
          "relative flex items-end gap-2.5 rounded-[26px] rounded-b-[14px] border border-input bg-card p-3.5 ps-[18px] shadow-1 transition-[box-shadow,border-color]",
          "before:absolute before:inset-x-[18px] before:-top-px before:h-0.5 before:rounded-full before:bg-gradient-to-r before:from-transparent before:via-primary before:to-transparent before:opacity-70",
          "focus-within:border-primary focus-within:shadow-1 focus-within:ring-[3px] focus-within:ring-accent",
          blocked && "border-destructive focus-within:border-destructive focus-within:ring-destructive/20"
        )}
      >
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          aria-invalid={blocked || undefined}
          aria-describedby={blocked ? reasonId : undefined}
          className="min-h-[44px] max-h-[180px] flex-1 resize-none border-0 bg-transparent p-0 text-[15px] leading-[1.6] shadow-none focus-visible:ring-0"
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={onSend}
          aria-label={t("send")}
          className="flex size-[38px] shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-[filter,transform,opacity] hover:not-disabled:brightness-[1.08] active:not-disabled:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
      {blocked && (
        <p id={reasonId} role="alert" className="mt-2 px-1.5 text-[12px] text-destructive">
          {sendBlockedReason}
        </p>
      )}
      {(metaLeft || metaRight) && (
        <div className="mt-2 flex justify-between gap-3 px-1.5 text-[11.5px] text-faint-foreground">
          <span>{metaLeft}</span>
          <span>{metaRight}</span>
        </div>
      )}
    </div>
  );
}
