"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm     from "remark-gfm";
import { formatCredits } from "@/lib/utils";
import type { Message } from "@ai-platform/db";

interface MessageBubbleProps {
  message: Pick<Message, "role" | "content" | "creditCost" | "modelId" | "isPartial">;
  locale:  string;
}

export function MessageBubble({ message, locale }: MessageBubbleProps) {
  const t           = useTranslations();
  const [copied, setCopied] = useState(false);
  const isUser      = message.role === "user";

  async function handleCopy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`flex gap-3 group animate-fade-in ${isUser ? "justify-end" : "justify-start"}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-teal-600
                        flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1">
          AI
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {/* Bubble */}
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed
          ${isUser
            ? "bg-blue-600 text-white rounded-ee-sm"
            : "bg-[#1E293B] text-slate-100 border border-slate-700 rounded-es-sm"
          }`}>
          {isUser ? (
            <p className="whitespace-pre-wrap message-content">{message.content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none message-content
                            prose-pre:bg-[#0F172A] prose-pre:border prose-pre:border-slate-700
                            prose-code:text-blue-300 prose-code:bg-slate-800 prose-code:px-1 prose-code:rounded">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Partial response indicator */}
          {message.isPartial && !isUser && (
            <p className="text-xs text-amber-400 mt-2 border-t border-slate-600 pt-2">
              {t("chat.partialResponse")}
            </p>
          )}
        </div>

        {/* Actions row (visible on hover) */}
        <div className={`flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity
                        ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          <button onClick={handleCopy}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
            {copied ? "✓" : "📋"} {copied ? t("chat.copied") : t("chat.copy")}
          </button>

          {/* Credit cost tooltip */}
          {message.creditCost && message.creditCost > 0 && (
            <span className="text-xs text-slate-600">
              {formatCredits(message.creditCost, locale)} {t("balance.unit")}
            </span>
          )}
        </div>
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center
                        text-slate-300 text-xs font-bold flex-shrink-0 mt-1">
          👤
        </div>
      )}
    </div>
  );
}
