"use client";

import * as React from "react";
import { ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

/**
 * Ported from `.composer` / `.composer-meta` / `.send-btn` in the theme
 * HTML: the gate-gradient top hairline (`::before`), focus-within ring,
 * and the round send button. Presentational only — no submit wiring,
 * abort handling, or token-estimate integration; that's Phase 7/14
 * (`useStreamingChat`, `TokenCounter`) per the master plan. `onSend` is a
 * plain callback so this slots into that hook later without a rewrite.
 */
export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** e.g. "120 / 8,000 tokens" — left empty until token estimation is wired. */
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
  metaLeft,
  metaRight,
  className,
}: ComposerProps) {
  const canSend = value.trim().length > 0 && !disabled;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
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
          "focus-within:border-primary focus-within:shadow-1 focus-within:ring-[3px] focus-within:ring-accent"
        )}
      >
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="min-h-[44px] max-h-[180px] flex-1 resize-none border-0 bg-transparent p-0 text-[15px] leading-[1.6] shadow-none focus-visible:ring-0"
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={onSend}
          aria-label="إرسال"
          className="flex size-[38px] shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-[filter,transform,opacity] hover:not-disabled:brightness-[1.08] active:not-disabled:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
      {(metaLeft || metaRight) && (
        <div className="mt-2 flex justify-between px-1.5 text-[11.5px] text-faint-foreground">
          <span>{metaLeft}</span>
          <span>{metaRight}</span>
        </div>
      )}
    </div>
  );
}
