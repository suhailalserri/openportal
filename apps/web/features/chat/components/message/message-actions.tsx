"use client";

import * as React from "react";
import { Copy, Check, RotateCcw, ThumbsUp, ThumbsDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * apps/web/features/chat/components/message/message-actions.tsx
 *
 * Real replacement for the deleted components/chat/message-actions.tsx,
 * which hardcoded Arabic strings ("نسخ", "أعد المحاولة", ...) directly —
 * a Rule 6 violation (FRONTEND_REBUILD_PLAN.md §3: every string goes
 * through next-intl). Same icon set/hover-reveal behavior, now routed
 * through `messages/{ar,en}.json`'s existing `chat.*` and `chat.feedback.*`
 * keys instead.
 */
export interface MessageActionsProps {
  onCopy?: (() => void) | undefined;
  onRegenerate?: (() => void) | undefined;
  onFeedback?: ((value: "positive" | "negative") => void) | undefined;
  className?: string | undefined;
}

export function MessageActions({ onCopy, onRegenerate, onFeedback, className }: MessageActionsProps) {
  const t = useTranslations("chat");
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(() => {
    onCopy?.();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [onCopy]);

  return (
    <div className={cn("flex gap-0.5", className)}>
      <IconButton label={t("copy")} onClick={handleCopy}>
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </IconButton>
      <IconButton label={t("regenerate")} onClick={() => onRegenerate?.()}>
        <RotateCcw className="size-3.5" />
      </IconButton>
      <IconButton label={t("feedback.positive")} onClick={() => onFeedback?.("positive")}>
        <ThumbsUp className="size-3.5" />
      </IconButton>
      <IconButton label={t("feedback.negative")} onClick={() => onFeedback?.("negative")}>
        <ThumbsDown className="size-3.5" />
      </IconButton>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: (() => void) | undefined;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded-[9px] text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
    >
      {children}
    </button>
  );
}
