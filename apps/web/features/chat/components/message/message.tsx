"use client";

import { useTranslations, useLocale } from "next-intl";

import { cn } from "@/lib/utils";
import { formatCredits, formatRelativeDate } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SafeMarkdown } from "@/components/markdown/safe-markdown";
import { MessageActions } from "./message-actions";
import type { ChatMessage } from "../../types";

export interface MessageProps {
  message: ChatMessage;
  userInitial?: string | undefined;
  onCopy?: ((message: ChatMessage) => void) | undefined;
  onRegenerate?: ((message: ChatMessage) => void) | undefined;
  onFeedback?: ((message: ChatMessage, value: "positive" | "negative") => void) | undefined;
  className?: string | undefined;
}

/**
 * apps/web/features/chat/components/message/message.tsx
 *
 * Real replacement for the deleted components/chat/message-bubble.tsx —
 * same visual language, ported 1:1 from docs/design/design-preview.html's
 * `.bubble` / `.msg-row` / `.msg-meta` / `.msg-actions` rules (around
 * line 300), now wired to next-intl (Rule 6) and the real, persisted
 * `ChatMessage` shape (features/chat/types.ts) instead of a local
 * placeholder type.
 *
 * Only ever called for `user`/`assistant` turns. `system` is a valid
 * `ChatMessage.role` (mirrors the DB enum) but is never a transcript
 * turn a person sees — MessageList filters those out before this
 * component receives one.
 *
 * User content renders as plain text (`whitespace-pre-wrap`), not
 * markdown — it's the person's own literal input, not model output, and
 * treating a stray `*`/`_`/backtick they happened to type as formatting
 * would be surprising. Only the assistant turn goes through
 * `SafeMarkdown` (Rule 7: model output is untrusted, user input isn't
 * subject to the same rule, but also gets no benefit from markdown
 * parsing here).
 */
export function Message({
  message,
  userInitial = "U",
  onCopy,
  onRegenerate,
  onFeedback,
  className,
}: MessageProps) {
  const t = useTranslations("chat");
  const tBalance = useTranslations("balance");
  const rawLocale = useLocale();
  const locale = rawLocale === "ar" ? "ar" : "en";
  const isUser = message.role === "user";

  const metaParts: string[] = [];
  if (!isUser) {
    if (message.modelId) metaParts.push(message.modelId);
    if (typeof message.inputTokens === "number" && typeof message.outputTokens === "number") {
      metaParts.push(t("tokenCount", { count: message.inputTokens + message.outputTokens }));
    }
    if (typeof message.creditCost === "number") {
      metaParts.push(`${formatCredits(message.creditCost, locale)} ${tBalance("unit")}`);
    }
  }

  return (
    <div className={cn("flex max-w-full gap-2.5", isUser && "flex-row-reverse", className)}>
      <Avatar
        className={cn(
          "size-[30px] shrink-0 border border-input",
          isUser ? "bg-card text-muted-foreground" : "bg-accent text-accent-foreground"
        )}
      >
        <AvatarFallback className="bg-transparent text-xs font-semibold">
          {isUser ? userInitial : "AI"}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "group flex min-w-0 flex-col gap-1.5",
          isUser ? "max-w-[86%] items-end" : "max-w-none flex-1"
        )}
      >
        {isUser ? (
          <div className="rounded-[18px] rounded-ee-[6px] border border-primary bg-accent-strong px-4 py-[13px] text-[15px] leading-[1.65] whitespace-pre-wrap text-foreground">
            {message.content}
          </div>
        ) : (
          <SafeMarkdown content={message.content} className="pt-1 pb-0.5" />
        )}

        {message.isPartial && (
          <button
            type="button"
            onClick={() => onRegenerate?.(message)}
            className="w-fit text-start text-[11.5px] font-medium text-faint-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("partialResponse")}
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] text-faint-foreground">
            {formatRelativeDate(message.createdAt, locale)}
          </span>
          {metaParts.length > 0 && (
            <span className="text-[11.5px] text-faint-foreground">· {metaParts.join(" · ")}</span>
          )}
          {!isUser && (
            <MessageActions
              className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
              onCopy={() => onCopy?.(message)}
              onRegenerate={() => onRegenerate?.(message)}
              onFeedback={(value) => onFeedback?.(message, value)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
