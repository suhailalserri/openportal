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
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
    <div className="border-t border-white/10 bg-white/[0.05] backdrop-blur-md p-4">
      {isOverLimit && (
        <p className="flex items-center justify-center gap-1.5 text-red-400 text-xs mb-2 text-center animate-fade-in">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {t("chat.contextExceeded")}
        </p>
      )}

      {/* Composer — quiet glass surface, accent ring only on focus */}
      <div className="flex items-end gap-3 bg-white/[0.05] rounded-2xl border border-white/10
                      shadow-[var(--shadow-elevation-1)]
                      focus-within:border-[color:var(--accent-blue)] focus-within:shadow-[var(--shadow-glow-blue)]
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
          className="flex-1 bg-transparent resize-none text-slate-50 placeholder-slate-500
                     focus:outline-none text-sm leading-relaxed min-h-[24px] max-h-[200px]
                     disabled:opacity-50 disabled:cursor-not-allowed"
        />

        <TokenCounter text={text} modelId={modelId} locale={locale} onOverLimitChange={handleOverLimitChange} />

        {isLoading ? (
          <button onClick={onStop} aria-label={t("chat.stop")}
            className="p-2.5 bg-red-600/90 hover:bg-red-600 active:scale-95 rounded-xl text-white
                       border border-red-400/20 transition-all flex-shrink-0">
            <Square className="w-4 h-4" fill="currentColor" />
          </button>
        ) : (
          <button onClick={handleSend} aria-label={t("chat.send")}
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
