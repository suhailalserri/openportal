"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert, Square, SendHorizontal } from "lucide-react";
import { TokenCounter } from "./TokenCounter";

interface InputBarProps {
  onSubmit:  (text: string) => void;
  onStop?:   () => void;
  isLoading: boolean;
  disabled:  boolean;
  modelId:   string;
  locale:    string;
  // EDGE CASE 6: block sending while offline instead of letting the
  // request fail silently — the placeholder + disabled state make this
  // visible right at the input, in addition to the top-of-page banner.
  offline?:  boolean;
}

export function InputBar({ onSubmit, onStop, isLoading, disabled, modelId, locale, offline }: InputBarProps) {
  const t             = useTranslations();
  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [isOverLimit, setIsOverLimit] = useState(false);
  const isRTL         = locale === "ar";
  const isBlocked     = disabled || !!offline;

  const handleOverLimitChange = useCallback((v: boolean) => setIsOverLimit(v), []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [text]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || isLoading || isBlocked || isOverLimit) return;
    onSubmit(trimmed);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  const placeholder = offline
    ? t("chat.offline")
    : disabled
      ? t("balance.zeroMessage")
      : t("chat.placeholder");

  return (
    <div className="border-t border-slate-700 bg-[#1E293B] p-4">
      {/* Context limit warning */}
      {isOverLimit && (
        <p className="flex items-center justify-center gap-1.5 text-red-400 text-xs mb-2 text-center animate-fade-in">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {t("chat.contextExceeded")}
        </p>
      )}

      {/* Elevated "composer" feel: soft shadow that intensifies with a
          glow ring on focus, instead of a flat bordered box. */}
      <div className="flex items-end gap-3 bg-[#0F172A] rounded-2xl border border-slate-600
                      shadow-[var(--shadow-elevation-1)]
                      focus-within:border-blue-500 focus-within:shadow-[var(--shadow-glow-blue)]
                      transition-all duration-200 p-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isBlocked || isLoading}
          rows={1}
          dir={isRTL ? "rtl" : "ltr"}
          className="flex-1 bg-transparent resize-none text-white placeholder-slate-500
                     focus:outline-none text-sm leading-relaxed min-h-[24px] max-h-[200px]
                     disabled:opacity-50 disabled:cursor-not-allowed"
        />

        <TokenCounter text={text} modelId={modelId} locale={locale} onOverLimitChange={handleOverLimitChange} />

        {/* Send / Stop button */}
        {isLoading ? (
          <button onClick={onStop}
            className="p-2 bg-red-600 hover:bg-red-700 active:scale-95 rounded-xl text-white
                       transition-all flex-shrink-0">
            <Square className="w-4 h-4" fill="currentColor" />
          </button>
        ) : (
          <button onClick={handleSend}
            disabled={!text.trim() || isBlocked || isOverLimit}
            className="p-2 gradient-primary disabled:opacity-40 disabled:cursor-not-allowed
                       active:scale-95 disabled:active:scale-100
                       rounded-xl text-white transition-all flex-shrink-0
                       shadow-[var(--shadow-elevation-1)]">
            <SendHorizontal className="w-4 h-4" style={{ transform: isRTL ? "scaleX(-1)" : "none" }} />
          </button>
        )}
      </div>

      <p className="text-xs text-slate-600 text-center mt-2">
        {locale === "ar"
          ? "قد تكون استجابات الذكاء الاصطناعي غير دقيقة. تحقق من المعلومات المهمة."
          : "AI responses may be inaccurate. Verify important information."}
      </p>
    </div>
  );
}
