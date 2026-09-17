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

  return (
    <div className="flex flex-col items-end gap-0.5 self-center leading-tight px-1">
      <span className={`text-xs tabular-nums ${isOverLimit ? "text-red-400" : "text-slate-500"}`}>
        {estTokens.toLocaleString()} {t("models.tokens")}
      </span>
      {model && (
        <span
          className="text-[11px] text-slate-500 tabular-nums"
          title={isRTL
            ? "تقدير تقريبي: تكلفة الإدخال مؤكدة، تكلفة الرد تُحسب على طول رد افتراضي متوسط وقد تختلف فعلياً."
            : "Rough estimate: input cost is confirmed, reply cost assumes a typical reply length and may differ."}
        >
          {isRTL ? `≈ ${estTotalCredits} رصيد تقريباً` : `≈ ${estTotalCredits} credits (est.)`}
        </span>
      )}
    </div>
  );
}
