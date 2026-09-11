"use client";
import { useRef, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { estimateTokens } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

interface InputBarProps {
  onSubmit:  (text: string) => void;
  onStop?:   () => void;
  isLoading: boolean;
  disabled:  boolean;
  modelId:   string;
  locale:    string;
}

export function InputBar({ onSubmit, onStop, isLoading, disabled, modelId, locale }: InputBarProps) {
  const t             = useTranslations();
  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const { data: modelList = [] } = trpc.models.list.useQuery();
  const model         = modelList.find(m => m.id === modelId);
  const estTokens     = estimateTokens(text);
  const isOverLimit   = !!model && estTokens > model.contextWindow * 0.9;
  const isRTL         = locale === "ar";

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
    if (!trimmed || isLoading || disabled || isOverLimit) return;
    onSubmit(trimmed);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  return (
    <div className="border-t border-slate-700 bg-[#1E293B] p-4">
      {/* Context limit warning */}
      {isOverLimit && (
        <p className="text-red-400 text-xs mb-2 text-center animate-fade-in">
          ⚠️ {t("chat.contextExceeded")}
        </p>
      )}

      <div className="flex items-end gap-3 bg-[#0F172A] rounded-2xl border border-slate-600
                      focus-within:border-blue-500 transition-colors p-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? t("balance.zeroMessage") : t("chat.placeholder")}
          disabled={disabled || isLoading}
          rows={1}
          dir={isRTL ? "rtl" : "ltr"}
          className="flex-1 bg-transparent resize-none text-white placeholder-slate-500
                     focus:outline-none text-sm leading-relaxed min-h-[24px] max-h-[200px]
                     disabled:opacity-50 disabled:cursor-not-allowed"
        />

        {/* Token counter */}
        {text && (
          <span className={`text-xs self-center ${isOverLimit ? "text-red-400" : "text-slate-500"}`}>
            {estTokens.toLocaleString()} {t("models.tokens")}
          </span>
        )}

        {/* Send / Stop button */}
        {isLoading ? (
          <button onClick={onStop}
            className="p-2 bg-red-600 hover:bg-red-700 rounded-xl text-white transition-colors flex-shrink-0">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          </button>
        ) : (
          <button onClick={handleSend}
            disabled={!text.trim() || disabled || isOverLimit}
            className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed
                       rounded-xl text-white transition-colors flex-shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: isRTL ? "rotate(180deg)" : "none" }}>
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
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
