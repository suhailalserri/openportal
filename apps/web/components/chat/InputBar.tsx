"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert, Square, SendHorizontal, Paperclip, Mic } from "lucide-react";
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
    <div className="border-t border-slate-800 bg-[color:var(--bg-surface)] p-4">
      {isOverLimit && (
        <p className="flex items-center justify-center gap-1.5 text-red-400 text-xs mb-2 text-center animate-fade-in">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {t("chat.contextExceeded")}
        </p>
      )}

      {/* Composer — two rows inside one rounded shell: text field gets its
          own full-width row so the box has real presence at rest instead
          of shrinking to a single-line pill, and controls (attach, mic,
          model badge, send) sit on their own row underneath, Claude-style. */}
      <div className="flex flex-col gap-2 bg-[color:var(--bg-base)] rounded-3xl border border-slate-700
                      shadow-[var(--shadow-elevation-1)]
                      focus-within:border-[color:var(--accent-blue)] focus-within:shadow-[var(--shadow-glow-blue)]
                      transition-all duration-200 p-4">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isBlocked || isLoading}
          rows={1}
          dir={isRTL ? "rtl" : "ltr"}
          className="w-full bg-transparent resize-none text-slate-50 placeholder-slate-500
                     focus:outline-none text-sm leading-relaxed min-h-[52px] max-h-[200px]
                     disabled:opacity-50 disabled:cursor-not-allowed"
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {/* Placeholders — not wired to any handler yet, so they're
                inert (aria-disabled, no onClick) rather than dead-clickable.
                Swap in real handlers once attachments/voice ship. */}
            <button
              type="button"
              aria-disabled="true"
              title={t("chat.attach")}
              className="p-2 text-slate-500 rounded-xl cursor-not-allowed opacity-60
                         hover:bg-slate-800/60 transition-colors"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-disabled="true"
              title={t("chat.record")}
              className="p-2 text-slate-500 rounded-xl cursor-not-allowed opacity-60
                         hover:bg-slate-800/60 transition-colors"
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <TokenCounter text={text} modelId={modelId} locale={locale} onOverLimitChange={handleOverLimitChange} />

            {isLoading ? (
              <button onClick={onStop} aria-label={t("chat.stop")}
                className="p-2.5 bg-red-600 hover:bg-red-700 active:scale-95 rounded-xl text-white
                           transition-all flex-shrink-0">
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
        </div>
      </div>

      <p className="text-xs text-slate-600 text-center mt-2">
        {t("chat.disclaimer")}
      </p>
    </div>
  );
}
