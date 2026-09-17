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

  // BUG FIX: `isLoading` is React state, which is async/batched — two Enter
  // keydowns landing in the same tick (a well-documented quirk on Android
  // soft keyboards, which can fire two keydown events for one tap of the
  // send glyph) both read the same stale `isLoading = false` and both call
  // onSubmit, producing the duplicate user bubble. A synchronous ref isn't
  // subject to React's batching, so the second call in the same tick sees
  // the lock the first call just set and bails out immediately.
  const sendingRef = useRef(false);
  useEffect(() => { if (!isLoading) sendingRef.current = false; }, [isLoading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [text]);

  function handleKeyDown(e: React.KeyboardEvent) {
    // Ignore Enter while an IME composition is in progress (e.g. typing
    // Arabic/CJK, or the composition-end event some Android keyboards emit
    // right before the "real" Enter) — otherwise this fires mid-composition
    // on top of the real keydown.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || isLoading || isBlocked || isOverLimit || sendingRef.current) return;
    sendingRef.current = true;
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
    <div className="border-t border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:p-4">
      {isOverLimit && (
        <p className="flex items-center justify-center gap-1.5 text-red-400 text-xs mb-2 text-center animate-fade-in">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {t("chat.contextExceeded")}
        </p>
      )}

      {/* Composer — quiet elevated surface, accent ring only on focus */}
      <div className="flex min-w-0 items-end gap-2 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-base)] p-2.5 shadow-[var(--shadow-elevation-1)] transition-all duration-200 focus-within:border-[color:var(--accent-blue)] focus-within:shadow-[var(--shadow-glow-blue)] sm:gap-3 sm:p-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isBlocked || isLoading}
          rows={1}
          dir={isRTL ? "rtl" : "ltr"}
            className="min-h-6 min-w-0 max-h-[200px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />

        <TokenCounter text={text} modelId={modelId} locale={locale} onOverLimitChange={handleOverLimitChange} />

        {isLoading ? (
          <button type="button" onClick={onStop} aria-label={t("chat.stop")}
            className="p-2.5 bg-red-600 hover:bg-red-700 active:scale-95 rounded-xl text-white
                       transition-all flex-shrink-0">
            <Square className="w-4 h-4" fill="currentColor" />
          </button>
        ) : (
          <button type="button" onClick={handleSend} aria-label={t("chat.send")}
            disabled={!text.trim() || isBlocked || isOverLimit}
            className="p-2.5 bg-[color:var(--accent-blue)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed
                       active:scale-95 disabled:active:scale-100
                       rounded-xl text-white transition-all flex-shrink-0
                       shadow-[var(--shadow-elevation-1)]">
            <SendHorizontal className="w-4 h-4" style={{ transform: isRTL ? "scaleX(-1)" : "none" }} />
          </button>
        )}
      </div>

      <p className="text-xs text-slate-600 text-center mt-2">
        {t("chat.disclaimer")}
      </p>
    </div>
  );
}
