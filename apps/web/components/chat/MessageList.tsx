"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { VariableSizeList, type ListChildComponentProps } from "react-window";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowDown } from "lucide-react";
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
const BOTTOM_STICK_SLACK   = 2;   // rows from the end still counts as "at bottom"
const NEAR_BOTTOM_PX       = 120; // px from the end still counts as "at bottom" (non-virtualized)

function JumpToLatestPill({ locale, onClick }: { locale: string; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-4 start-1/2 -translate-x-1/2
                 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium
                 bg-[color:var(--bg-elevated)] border border-slate-600 text-slate-200
                 shadow-[var(--shadow-elevation-2)] hover:bg-slate-700 transition-colors z-10"
    >
      <ArrowDown className="h-3.5 w-3.5" />
      {locale === "ar" ? "أحدث رسالة" : "Latest message"}
    </motion.button>
  );
}

export function MessageList({
  messages, meta, locale, modelId, isLoading, typingIndicator, onRetryLast,
}: MessageListProps) {
  const shouldVirtualize = messages.length > VIRTUALIZE_THRESHOLD;
  const itemCount = messages.length + (isLoading ? 1 : 0);
  const lastAssistantIdx = messages.length - 1;
  const prefersReducedMotion = useReducedMotion();

  const containerRef  = useRef<HTMLDivElement>(null);
  const scrollRef      = useRef<HTMLDivElement>(null);
  const bottomRef      = useRef<HTMLDivElement>(null);
  const listRef        = useRef<VariableSizeList>(null);
  const rowHeights      = useRef<Map<number, number>>(new Map());
  const stickToBottom  = useRef(true);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [showPill, setShowPill] = useState(false);

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

  // Non-virtualized scroll tracking: stick to bottom on new content unless
  // the user scrolled up to read earlier messages mid-stream — in that case
  // stop auto-scrolling and surface the "jump to latest" pill instead of
  // yanking them back down.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < NEAR_BOTTOM_PX;
    stickToBottom.current = atBottom;
    setShowPill(!atBottom && messages.length > 0);
  }, [messages.length]);

  useEffect(() => {
    if (!shouldVirtualize) {
      if (stickToBottom.current) {
        bottomRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
        setShowPill(false);
      }
      return;
    }
    if (stickToBottom.current && listRef.current) {
      listRef.current.scrollToItem(itemCount - 1, "end");
      setShowPill(false);
    }
  }, [itemCount, messages, shouldVirtualize, prefersReducedMotion]);

  function jumpToLatest() {
    stickToBottom.current = true;
    setShowPill(false);
    if (shouldVirtualize) {
      listRef.current?.scrollToItem(itemCount - 1, "end");
    } else {
      bottomRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
    }
  }

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
      <div className="relative h-full">
        <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((msg, index) => {
                const msgMeta = meta?.[msg.id];
                return (
                  <motion.div
                    key={msg.id}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
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
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {isLoading && typingIndicator}
            <div ref={bottomRef} />
          </div>
        </div>

        <AnimatePresence>
          {showPill && <JumpToLatestPill locale={locale} onClick={jumpToLatest} />}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {size.height > 0 && (
        <VariableSizeList
          ref={listRef}
          height={size.height}
          width={size.width || 1}
          itemCount={itemCount}
          itemSize={getRowHeight}
          onItemsRendered={({ visibleStopIndex }) => {
            const atBottom = visibleStopIndex >= itemCount - 1 - BOTTOM_STICK_SLACK;
            stickToBottom.current = atBottom;
            setShowPill(!atBottom);
          }}
        >
          {Row}
        </VariableSizeList>
      )}

      <AnimatePresence>
        {showPill && <JumpToLatestPill locale={locale} onClick={jumpToLatest} />}
      </AnimatePresence>
    </div>
  );
}
