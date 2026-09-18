"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm     from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Copy, Check, User, Sparkles } from "lucide-react";
import { formatCredits } from "@/lib/utils";
import { CodeBlock } from "./CodeBlock";
import type { Message } from "@ai-platform/db";

interface MessageBubbleProps {
  message: Pick<Message, "role" | "content" | "creditCost" | "modelId" | "isPartial">;
  locale:  string;
  onRetry?: (() => void) | undefined;
}

export function MessageBubble({ message, locale, onRetry }: MessageBubbleProps) {
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
      {!isUser && (
        <div className="w-9 h-9 rounded-full bg-[color:var(--accent-blue)]
                        flex items-center justify-center text-white flex-shrink-0 mt-1
                        shadow-[var(--shadow-elevation-1)]">
          <Sparkles className="h-[18px] w-[18px]" />
        </div>
      )}

      <div className={`max-w-[85%] sm:max-w-[75%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1.5`}>
        <div className={`rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed
          ${isUser
            ? "bg-[color:var(--accent-blue)] text-white rounded-ee-sm shadow-[var(--shadow-elevation-1)]"
            : "bg-[color:var(--bg-surface)] text-slate-100 border border-slate-700/80 rounded-es-sm shadow-[var(--shadow-elevation-1)]"
          }`}>
          {isUser ? (
            <p className="whitespace-pre-wrap message-content">{message.content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none message-content
                            prose-headings:font-display
                            prose-pre:p-0 prose-pre:bg-transparent prose-pre:border-none
                            prose-code:text-[color:var(--accent-blue-light)] prose-code:bg-slate-800 prose-code:px-1 prose-code:rounded
                            prose-code:before:content-none prose-code:after:content-none
                            prose-a:text-[color:var(--accent-blue-light)]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  // react-markdown renders fenced code as <pre><code class="language-x hljs">.
                  // Override <pre> (not <code>) so we control the outer wrapper — the copy
                  // button, language label, and forced-LTR direction — while leaving the
                  // <code> children (with their hljs token spans) untouched.
                  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {message.isPartial && !isUser && (
            onRetry ? (
              <button
                onClick={onRetry}
                className="text-xs text-amber-400 mt-2 border-t border-slate-700 pt-2 w-full text-start
                           hover:text-amber-300 transition-colors"
              >
                {t("chat.partialResponse")}
              </button>
            ) : (
              <p className="text-xs text-amber-400 mt-2 border-t border-slate-700 pt-2">
                {t("chat.partialResponse")}
              </p>
            )
          )}
        </div>

        <div className={`flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity
                        ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          <button onClick={handleCopy}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t("chat.copied") : t("chat.copy")}
          </button>

          {message.creditCost && message.creditCost > 0 && (
            <span className="text-xs text-slate-600">
              {formatCredits(message.creditCost, locale)} {t("balance.unit")}
            </span>
          )}
        </div>
      </div>

      {isUser && (
        <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center
                        text-slate-300 flex-shrink-0 mt-1 shadow-[var(--shadow-elevation-1)]">
          <User className="h-[18px] w-[18px]" />
        </div>
      )}
    </div>
  );
}
