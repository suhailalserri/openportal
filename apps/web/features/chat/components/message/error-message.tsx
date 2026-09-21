"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { ChatError } from "../../types";

export interface ErrorMessageProps {
  error: ChatError;
  onRetry?: (() => void) | undefined;
  className?: string | undefined;
}

/**
 * apps/web/features/chat/components/message/error-message.tsx
 *
 * The assistant turn's slot when the gateway call itself failed — never
 * a `ChatMessage` (see features/chat/types.ts's header comment: B1's
 * `streamChat` never persists a row on error, it just replies with a
 * JSON error). Visual spec: `.bubble.error` in
 * docs/design/design-preview.html (around line 310) — danger-tinted,
 * inline-start accent border, asymmetric corner radius grouped by
 * logical side (`rounded-s-*`/`rounded-e-*`, not by physical
 * left/right — the source file's raw `border-radius: 4px 10px 10px 4px`
 * is LTR-authored per-corner; expressed here as "4px on the whole start
 * side, 10px on the whole end side" so it mirrors correctly in RTL).
 */
export function ErrorMessage({ error, onRetry, className }: ErrorMessageProps) {
  const t = useTranslations("chat");
  return (
    <div className={cn("flex max-w-full gap-2.5", className)}>
      <div className="flex size-[30px] shrink-0 items-center justify-center rounded-full border border-input bg-destructive/10 text-destructive">
        <AlertTriangle className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="rounded-s-[4px] rounded-e-[10px] border-s-[3px] border-destructive bg-destructive/10 px-4 py-[13px] text-[15px] leading-[1.65] text-foreground">
          {error.message}
        </div>
        {error.retryable && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="w-fit text-start text-[11.5px] font-medium text-destructive underline-offset-2 hover:underline"
          >
            {t("regenerate")}
          </button>
        )}
      </div>
    </div>
  );
}
