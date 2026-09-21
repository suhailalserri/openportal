import * as React from "react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageActions } from "@/components/chat/message-actions";

/**
 * Ported from `.msg-row` / `.avatar` / `.bubble-col` / `.bubble` (assistant/
 * user/error) / `.msg-meta` in the theme HTML.
 *
 * Presentational only — built ahead of its real phase (chat data-wiring is
 * Phase 7/14 territory per the plan) at your explicit request, so the
 * `ChatMessage` shape below is a local, minimal type, NOT imported from
 * `packages/types` (no `Message` type exists there yet — `messages` table
 * columns in the master plan are `role/content/createdAt/isPartial/
 * feedback`, which this shape is deliberately kept close to). Whoever wires
 * this up for real should reconcile the two rather than inventing a third
 * shape.
 */
export type ChatMessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  /** ISO timestamp; formatted with lib/format.ts's formatDate at render time, not here. */
  createdAtLabel?: string;
  /** Stream cut off before completion — shows the "interrupted" affordance. */
  isPartial?: boolean;
  /** Upstream/gateway error surfaced as the assistant turn (`.bubble.error`). */
  isError?: boolean;
}

export interface MessageBubbleProps {
  message: ChatMessage;
  userInitial?: string;
  onCopy?: (message: ChatMessage) => void;
  onRegenerate?: (message: ChatMessage) => void;
  className?: string;
}

export function MessageBubble({
  message,
  userInitial = "U",
  onCopy,
  onRegenerate,
  className,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex max-w-full gap-2.5", isUser && "flex-row-reverse", className)}>
      <Avatar
        className={cn(
          "size-[30px] border border-input",
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
        <div
          className={cn(
            "text-[15px] leading-[1.65]",
            isUser &&
              "rounded-[18px] rounded-ee-[6px] border border-primary bg-primary/15 px-4 py-[13px] text-foreground",
            !isUser && !message.isError && "px-0 pt-1 pb-0.5 text-foreground",
            message.isError &&
              "rounded-[4px_10px_10px_4px] border-s-[3px] border-destructive bg-destructive/10 px-4 py-[13px] text-foreground"
          )}
        >
          {message.content}
          {message.isPartial && (
            <span className="ms-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-faint-foreground">
              ⚠️ انقطع الاتصال —{" "}
              <button
                type="button"
                onClick={() => onRegenerate?.(message)}
                className="underline underline-offset-2 hover:text-foreground"
              >
                إعادة المحاولة
              </button>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {message.createdAtLabel && (
            <span className="text-[11.5px] text-faint-foreground">{message.createdAtLabel}</span>
          )}
          {!isUser && (
            <MessageActions
              className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
              onCopy={() => onCopy?.(message)}
              onRegenerate={() => onRegenerate?.(message)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
