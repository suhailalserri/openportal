"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { estimateTokens } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

interface TokenCounterProps {
  text:    string;
  modelId: string;
  locale:  string;
  // Fires whenever the over-limit verdict changes, so the parent (which
  // owns the send button) can gate on it without duplicating the model
  // lookup + token math here and there.
  onOverLimitChange?: (overLimit: boolean) => void;
}

// Pre-send cost estimate. The input side is a real number (we know the
// text); the reply side can't be known until the model actually answers,
// so we assume a typical reply length as a rough midpoint — this is
// clearly labeled "estimated" in the UI, not presented as an exact price.
const TYPICAL_REPLY_TOKENS = 400;

export function TokenCounter({ text, modelId, locale, onOverLimitChange }: TokenCounterProps) {
  const t = useTranslations();
  const { data: modelList = [] } = trpc.models.list.useQuery();
  const model = modelList.find(m => m.id === modelId);
  const isRTL = locale === "ar";

  const estTokens   = estimateTokens(text);
  const isOverLimit = !!model && estTokens > model.contextWindow * 0.9;

  const lastReported = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastReported.current !== isOverLimit) {
      lastReported.current = isOverLimit;
      onOverLimitChange?.(isOverLimit);
    }
  }, [isOverLimit, onOverLimitChange]);

  if (!text) return null;

  const estInputCredits = model ? Math.ceil((estTokens / 1000) * model.creditsPerKInput) : 0;
  const estReplyCredits = model
    ? Math.ceil((Math.min(TYPICAL_REPLY_TOKENS, model.maxOutputTokens) / 1000) * model.creditsPerKOutput)
    : 0;
  const estTotalCredits = model ? Math.max(estInputCredits + estReplyCredits, 1) : 0;

  // Compact pill shown on its own thin row just above the composer
  // toolbar (InputBar) — full width available there on every screen
  // size, so both the token count and the credit estimate stay legible
  // on a phone instead of competing for space next to the model picker
  // and send button.
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0
                  border text-xs leading-none whitespace-nowrap
                  ${isOverLimit
                    ? "border-red-800 bg-red-950/40 text-red-400"
                    : "border-slate-700/70 bg-[color:var(--bg-elevated)]/60 text-slate-400"}`}
      title={t("chat.estCostTooltip")}
    >
      <span>{estTokens.toLocaleString()} {t("models.tokens")}</span>
      {model && (
        <>
          <span aria-hidden className="text-slate-600">·</span>
          <span className={isOverLimit ? "text-red-400" : "text-[color:var(--accent-blue-light)]"}>
            {isRTL ? `≈${estTotalCredits} رصيد تقريباً` : `≈${estTotalCredits} credits (est.)`}
          </span>
        </>
      )}
    </div>
  );
}
