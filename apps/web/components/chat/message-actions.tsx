"use client";

import * as React from "react";
import { Copy, Check, RotateCcw, ThumbsUp, ThumbsDown } from "lucide-react";

import { cn } from "@/lib/utils";

/** Ported from `.msg-actions` / `.icon-btn` in the theme HTML. */
export interface MessageActionsProps {
  onCopy?: () => void;
  onRegenerate?: () => void;
  onFeedback?: (value: "up" | "down") => void;
  className?: string;
}

export function MessageActions({ onCopy, onRegenerate, onFeedback, className }: MessageActionsProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    onCopy?.();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={cn("flex gap-0.5", className)}>
      <IconButton label="نسخ" onClick={handleCopy}>
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </IconButton>
      <IconButton label="إعادة المحاولة" onClick={() => onRegenerate?.()}>
        <RotateCcw className="size-3.5" />
      </IconButton>
      <IconButton label="إجابة جيدة" onClick={() => onFeedback?.("up")}>
        <ThumbsUp className="size-3.5" />
      </IconButton>
      <IconButton label="إجابة غير جيدة" onClick={() => onFeedback?.("down")}>
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
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded-[9px] text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
    >
      {children}
    </button>
  );
}
