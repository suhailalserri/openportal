"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { VariableSizeList, type ListChildComponentProps } from "react-window";
import { MessageBubble } from "./MessageBubble";

export interface ChatMessageMeta {
  creditCost?: number | null;
  isPartial?:  boolean;
}

export interface ChatListMessage {
  id:      string;
  role:    "user" | "assistant";
  content: string;
}

interface MessageListProps {
  messages:  ChatListMessage[];
  // `| undefined` spelled out explicitly: the project builds with
  // exactOptionalPropertyTypes, which treats `meta?: T` and `meta?: T |
  // undefined` differently — the former forbids callers from ever passing
  // `meta={undefined}` (only omitting the prop entirely), which is exactly
  // what both chat pages do while there's no partial-message override.
  meta?:     Record<string, ChatMessageMeta> | undefined;
  locale:    string;
  modelId:   string;
  isLoading: boolean;
  typingIndicator: React.ReactNode;
  onRetryLast?: (() => void) | undefined;
}

// EDGE CASE 5 (Phase 14.1): very long conversations / long responses with
// code shouldn't force the browser to keep every message bubble mounted
// and laid out at once. Short conversations (the overwhelming majority)
// render as plain flow — simpler, no virtualization edge cases to worry
// about for copy/selection/etc. Only conversations that actually get long
// pay the virtualization complexity cost.
const VIRTUALIZE_THRESHOLD = 25;
const DEFAULT_ROW_HEIGHT   = 120;
const BOTTOM_STICK_SLACK   = 2; // rows from the end still counts as "at bottom"

export function MessageList({
  messages, meta, locale, modelId, isLoading, typingIndicator, onRetryLast,
}: MessageListProps) {
  const shouldVirtualize = messages.length > VIRTUALIZE_THRESHOLD;
  const itemCount = messages.length + (isLoading ? 1 : 0);
  const lastAssistantIdx = messages.length - 1;

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef     = useRef<HTMLDivElement>(null);
  const listRef       = useRef<VariableSizeList>(null);
  const rowHeights    = useRef<Map<number, number>>(new Map());
  const stickToBottom = useRef(true);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !shouldVirtualize) return;
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [shouldVirtualize]);

  const setRowHeight = useCallback((index: number, height: number) => {
    const padded = height + 24; // vertical spacing between rows
    if (rowHeights.current.get(index) !== padded) {
      rowHeights.current.set(index, padded);
      listRef.current?.resetAfterIndex(index);
    }
  }, []);

  const getRowHeight = useCallback(
    (index: number) => rowHeights.current.get(index) ?? DEFAULT_ROW_HEIGHT,
    []
  );

  // Auto-scroll to bottom on new content, unless the user scrolled up to
  // read earlier messages — don't yank them back down mid-read.
  useEffect(() => {
    if (!shouldVirtualize) {
      if (stickToBottom.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (stickToBottom.current && listRef.current) {
      listRef.current.scrollToItem(itemCount - 1, "end");
    }
  }, [itemCount, messages, shouldVirtualize]);

  const Row = useCallback(function RowImpl({ index, style }: ListChildComponentProps) {
    const rowRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const el = rowRef.current;
      if (!el) return;
      const ro = new ResizeObserver(() => setRowHeight(index, el.getBoundingClientRect().height));
      ro.observe(el);
      return () => ro.disconnect();
    }, [index]);

    if (index === messages.length) {
      return (
        <div style={style}>
          <div ref={rowRef} className="px-4 pt-2">{typingIndicator}</div>
        </div>
      );
    }

    // noUncheckedIndexedAccess means `messages[index]` is typed
    // `ChatListMessage | undefined` even though index is always in range
    // here (0..messages.length-1) — guard explicitly rather than assert.
    const msg = messages[index];
    if (!msg) return <div style={style} />;
    const msgMeta = meta?.[msg.id];
    return (
      <div style={style}>
        <div ref={rowRef} className="px-4 py-3">
          <MessageBubble
            locale={locale}
            message={{
              role:       msg.role,
              content:    msg.content,
              creditCost: msgMeta?.creditCost ?? null,
              modelId,
              isPartial:  !!msgMeta?.isPartial,
            }}
            onRetry={index === lastAssistantIdx && msgMeta?.isPartial ? onRetryLast : undefined}
          />
        </div>
      </div>
    );
  }, [messages, meta, locale, modelId, typingIndicator, setRowHeight, lastAssistantIdx, onRetryLast]);

  if (!shouldVirtualize) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {messages.map((msg, index) => {
          const msgMeta = meta?.[msg.id];
          return (
            <MessageBubble
              key={msg.id}
              locale={locale}
              message={{
                role:       msg.role,
                content:    msg.content,
                creditCost: msgMeta?.creditCost ?? null,
                modelId,
                isPartial:  !!msgMeta?.isPartial,
              }}
              onRetry={index === lastAssistantIdx && msgMeta?.isPartial ? onRetryLast : undefined}
            />
          );
        })}
        {isLoading && typingIndicator}
        <div ref={bottomRef} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full">
      {size.height > 0 && (
        <VariableSizeList
          ref={listRef}
          height={size.height}
          width={size.width || 1}
          itemCount={itemCount}
          itemSize={getRowHeight}
          onItemsRendered={({ visibleStopIndex }) => {
            stickToBottom.current = visibleStopIndex >= itemCount - 1 - BOTTOM_STICK_SLACK;
          }}
        >
          {Row}
        </VariableSizeList>
      )}
    </div>
  );
}
