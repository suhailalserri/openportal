"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useChat } from "ai/react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { ChatLayout }        from "@/components/chat/ChatLayout";
import { ChatHeader }        from "@/components/chat/ChatHeader";
import { InputBar }          from "@/components/chat/InputBar";
import { EmptyState }        from "@/components/chat/EmptyState";
import { MessageList }       from "@/components/chat/MessageList";
import { OfflineBanner, TabConflictBanner, StreamErrorBanner } from "@/components/chat/ErrorStates";
import { useBalance }        from "@/hooks/useBalance";
import { useOnlineStatus }   from "@/hooks/useOnlineStatus";
import { useTabConflict }    from "@/hooks/useTabConflict";

export default function ChatPage() {
  const t = useTranslations();
  const { locale } = useParams<{ locale: string }>();
  const [modelId, setModelId] = useState("claude-sonnet-4-6");
  // Was: local `useState<number>(1)` that only ever got set to 0 on an
  // error response — it never reflected the user's real balance, so the
  // send button could stay enabled well past zero credits (and never
  // re-enable itself after a top-up without a full page reload). This is
  // the actual balance from /api/balance, polled + refreshed on demand.
  const balanceState = useBalance();
  const balance       = balanceState.microCredits;
  const [conversationId, setConversationId] = useState<string | null>(null);
  const isOnline       = useOnlineStatus();
  const { otherTabOpen, otherTabSending, announceSending } = useTabConflict(conversationId);

  // EDGE CASE 7: track whether the most recent assistant message was cut
  // short by a dropped stream, so we can label it and offer a real retry
  // instead of a "click to retry" label that does nothing.
  const [partialMessageId, setPartialMessageId] = useState<string | null>(null);
  const [streamErrorMsg, setStreamErrorMsg]     = useState<string | null>(null);

  const { messages, isLoading, stop, append, reload } = useChat({
    api: "/api/chat",
    // The backend streams plain text deltas (no SSE framing, no JSON
    // envelope) — this must match, or useChat's default "data" protocol
    // parser throws on every chunk and every request looks like a
    // dropped connection even when the server completed cleanly.
    streamProtocol: "text",
    body: { model: modelId, conversationId },
    // Credits are deducted server-side only *after* the stream finishes
    // (gateway.service.ts), so the balance shown mid-stream is stale by
    // design — refresh right when we know a debit likely just happened,
    // instead of waiting up to 30s for the next poll.
    onFinish: () => { balanceState.refresh(); setPartialMessageId(null); setStreamErrorMsg(null); },
    onError: (err) => {
      let msg = t("errors.streamInterrupted");
      if (err.message.includes("INSUFFICIENT_BALANCE")) {
        msg = t("errors.insufficientBalance");
        balanceState.refresh();
      } else if (err.message.includes("CONTEXT_TOO_LONG")) {
        msg = t("chat.contextExceeded");
      } else if (err.message.includes("MODEL_UNAVAILABLE")) {
        msg = t("errors.modelUnavailable");
      } else if (!isOnline) {
        msg = t("chat.offline");
      }
      toast.error(msg);
      setStreamErrorMsg(msg);
      setPartialMessageId(prev => {
        const last = messages[messages.length - 1];
        if (last && last.role === "assistant") return last.id;
        return prev;
      });
    },
  });

  function handleRetry() {
    setStreamErrorMsg(null);
    setPartialMessageId(null);
    reload({ body: { model: modelId, conversationId } });
  }

  // BUG FIX: a brand-new chat creates its conversation row with an `await
  // fetch(...)` before `conversationId` state is set. If handleSend fires
  // twice in quick succession (a double-tap on a suggestion chip, or the
  // duplicate-Enter-keydown quirk some Android soft keyboards have) before
  // that fetch resolves, both calls read the same stale `conversationId ===
  // null` and each independently POSTs a new conversation + message — the
  // exact "two identical bubbles, no reply" duplicate. A plain `isLoading`
  // check doesn't close this gap because React state updates are async;
  // this ref is synchronous and set on the very first line, so the second
  // call sees the lock immediately and bails before touching the network.
  const isSendingRef = useRef(false);

  const handleSend = useCallback(async (text: string) => {
    if (isSendingRef.current) return;
    if (balance <= 0) { toast.error(t("errors.insufficientBalance")); return; }
    if (!isOnline) { toast.error(t("chat.offline")); return; }
    isSendingRef.current = true;

    try {
      // A brand-new chat has no conversation row yet. Create one up front
      // (same endpoint the sidebar's "New chat" already relies on existing)
      // instead of letting the backend invent a fresh, never-inserted UUID
      // on every message — that's what was causing the foreign-key error.
      let id = conversationId;
      if (!id) {
        try {
          const res = await fetch("/api/conversations", { method: "POST" });
          if (!res.ok) throw new Error("failed to create conversation");
          const conv = await res.json() as { id: string };
          id = conv.id;
          setConversationId(id);
          // Swap the URL in place so refresh/share links land on /chat/[id]
          // without remounting this component (which would drop the
          // in-flight message + streaming state).
          window.history.replaceState(null, "", `/${locale}/chat/${id}`);
        } catch {
          toast.error(t("errors.streamInterrupted"));
          return;
        }
      }

      setStreamErrorMsg(null);
      announceSending();
      // BUG FIX: the previous implementation called `setInput(text)` then
      // immediately `handleSubmit(...)` in the same tick. `setInput` only
      // schedules a state update — `handleSubmit` read the *old* `input`
      // value (empty string on the very first send), so nothing was sent
      // until the input state caught up a render later. `append()` takes
      // the message content directly and sends it right away, no state
      // race involved.
      await append(
        { role: "user", content: text },
        { body: { model: modelId, conversationId: id } }
      );
    } finally {
      isSendingRef.current = false;
    }
  }, [balance, isOnline, conversationId, locale, modelId, append, announceSending, t]);

  const meta = partialMessageId ? { [partialMessageId]: { isPartial: true } } : undefined;

  const typingIndicator = (
    <div className="flex gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-[color:var(--accent-blue)]
                      flex items-center justify-center text-white flex-shrink-0
                      shadow-[var(--shadow-elevation-1)]">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="bg-[color:var(--bg-surface)] border border-slate-700/80 rounded-2xl rounded-es-sm px-4 py-3">
        <div className="flex gap-1.5 items-center h-5">
          {[0,1,2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <ChatLayout locale={locale}>
      <div className="flex flex-col h-full">
        <ChatHeader
          title={messages.length > 0
            ? (messages[0]?.content?.slice(0, 40) ?? t("chat.newChat"))
            : t("chat.newChat")}
          locale={locale}
          modelId={modelId}
          onModelChange={setModelId}
        />

        {!isOnline && <OfflineBanner locale={locale} />}
        {isOnline && otherTabOpen && <TabConflictBanner sending={otherTabSending} />}

        {/* Messages */}
        {/* MessageList owns its own internal scroll container (for the
            scroll-to-latest pill + scroll position tracking), so this
            wrapper must not also scroll — min-h-0 lets it shrink inside
            the flex column instead of growing to content height. */}
        <main className="flex-1 min-h-0 overflow-hidden">
          {messages.length === 0 ? (
            <EmptyState locale={locale} onSuggestionSelect={handleSend} />
          ) : (
            <MessageList
              messages={messages.map(m => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content }))}
              meta={meta}
              locale={locale}
              modelId={modelId}
              isLoading={isLoading}
              typingIndicator={typingIndicator}
              onRetryLast={handleRetry}
            />
          )}
        </main>

        {streamErrorMsg && !isLoading && (
          <StreamErrorBanner message={streamErrorMsg} onRetry={handleRetry} locale={locale} />
        )}

        {/* Input */}
        <InputBar
          onSubmit={handleSend}
          onStop={stop}
          isLoading={isLoading}
          disabled={balance <= 0}
          offline={!isOnline}
          modelId={modelId}
          onModelChange={setModelId}
          locale={locale}
        />
      </div>
    </ChatLayout>
  );
}
