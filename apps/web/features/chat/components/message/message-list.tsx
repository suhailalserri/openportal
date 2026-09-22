"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Message } from "./message";
import { ErrorMessage } from "./error-message";
import type { ChatMessage, ChatError } from "../../types";

export interface MessageListProps {
  messages: ChatMessage[];
  error?: ChatError | undefined;
  hasMore?: boolean | undefined;
  isLoadingEarlier?: boolean | undefined;
  onLoadMore?: (() => void) | undefined;
  onCopy?: ((message: ChatMessage) => void) | undefined;
  onRegenerate?: ((message: ChatMessage) => void) | undefined;
  onFeedback?: ((message: ChatMessage, value: "positive" | "negative") => void) | undefined;
  onEdit?: ((message: ChatMessage, newContent: string) => void) | undefined;
  editDisabled?: boolean | undefined;
  onRetryError?: (() => void) | undefined;
  className?: string | undefined;
}

/**
 * apps/web/features/chat/components/message/message-list.tsx
 *
 * The conversation scroller. Props-only — 4a's scope is message
 * RENDERING, not data fetching: real pagination/IndexedDB/tRPC wiring is
 * 4d, real streaming append is 4b. "Load earlier" here is a static
 * affordance (call `onLoadMore`, optionally show a skeleton row via
 * `isLoadingEarlier`); the caller owns actually fetching and prepending
 * to `messages`.
 *
 * A plain native scrollable `<div>` rather than components/ui/scroll-area
 * (Radix ScrollArea) — deliberately: Radix's Viewport is an extra DOM
 * node one level below the element you render, so the ref/onScroll this
 * component needs for stick-to-bottom tracking wouldn't land on the
 * actual scrolling element without reaching into Radix's internals.
 * Native `overflow-y-auto` gives direct access to `scrollTop`/
 * `scrollHeight` on the exact element that has them, at the cost of
 * Radix's themed scrollbar (a cosmetic difference, not a correctness one).
 *
 * Sticks to bottom on new messages UNLESS the viewer has scrolled up to
 * read something earlier — tracked via a small distance-from-bottom
 * threshold rather than a library, since this is the only place in the
 * app that needs it.
 */
export function MessageList({
  messages,
  error,
  hasMore = false,
  isLoadingEarlier = false,
  onLoadMore,
  onCopy,
  onRegenerate,
  onFeedback,
  onEdit,
  editDisabled,
  onRetryError,
  className,
}: MessageListProps) {
  const t = useTranslations("chat");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const stickToBottomRef = React.useRef(true);

  const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  }, []);

  React.useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages.length, error]);

  // System messages (the conversation's system prompt) are never a
  // transcript turn — see message.tsx's header comment.
  const visible = messages.filter((m) => m.role !== "system");

  return (
    // `relative`: positions the two fade overlays below (Phase 4d Patch v6).
    // `min-w-0`: this is `ChatSession`'s flex child (`className="min-h-0
    // flex-1"` passed in from chat-view.tsx) — without it, the same
    // flex-item default-min-width issue documented in message.tsx and
    // safe-markdown.tsx applies one level up too: a single overlong
    // message anywhere in `visible` could still stretch THIS container
    // itself, not just the row inside it.
    <div className={cn("relative flex min-h-0 min-w-0 flex-col", className)}>
      {/* Phase 4d Patch v6: replaces the hard-edged gap that used to sit
          between the header and the first message (ChatSession's old
          `p-4`, removed in chat-view.tsx). A thin same-background-to-
          transparent gradient over the top of the scroll area instead —
          content dissolves into the header rather than stopping at a
          visible seam. `pointer-events-none` so it never blocks taps on
          the message underneath; `z-10` keeps it above message content
          but the header itself (a sibling, not a descendant, of this
          component) is unaffected. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-gradient-to-b from-background to-transparent"
      />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        // `overflow-x-hidden` is the belt-and-suspenders backstop — with
        // the min-w-0 chain (this file → message.tsx → safe-markdown.tsx)
        // and break-words at the leaves correctly in place there should
        // never be horizontal overflow to hide, but a third-party
        // markdown/highlight edge case producing an unbreakable node is
        // now clipped here instead of panning the page.
        // `px-4 py-3`: Phase 4d Patch v6 — this is now the ONLY source of
        // inset around the transcript (chat-view.tsx's outer `p-4` is
        // gone), so it owns both the side margins and a small top/bottom
        // breathing room that used to come from the parent.
        className="flex h-full min-w-0 flex-col gap-5 overflow-x-hidden overflow-y-auto px-4 py-3"
      >
        {hasMore && (
          <div className="flex flex-col items-center gap-2 pb-2">
            {isLoadingEarlier ? (
              <div className="flex w-full flex-col gap-2">
                <Skeleton className="h-12 w-3/4" />
                <Skeleton className="h-12 w-1/2 self-end" />
              </div>
            ) : (
              <button
                type="button"
                onClick={onLoadMore}
                className="rounded-full border border-border px-3 py-1 text-[11.5px] text-faint-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {t("loadEarlier")}
              </button>
            )}
          </div>
        )}

        {visible.map((message) => (
          <Message
            key={message.id}
            message={message}
            onCopy={onCopy}
            onRegenerate={onRegenerate}
            onFeedback={onFeedback}
            onEdit={onEdit}
            editDisabled={editDisabled}
          />
        ))}

        {error && <ErrorMessage error={error} onRetry={onRetryError} />}

        <div ref={bottomRef} />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-4 bg-gradient-to-t from-background to-transparent"
      />
    </div>
  );
}
