"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useChat, type Message as AiMessage } from "ai/react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { ChatLayout }        from "@/components/chat/ChatLayout";
import { ChatHeader }        from "@/components/chat/ChatHeader";
import { InputBar }          from "@/components/chat/InputBar";
import { EmptyState }        from "@/components/chat/EmptyState";
import { MessageList, type ChatMessageMeta } from "@/components/chat/MessageList";
import { OfflineBanner, TabConflictBanner, StreamErrorBanner } from "@/components/chat/ErrorStates";
import { Skeleton }          from "@/components/ui/skeleton";
import { useBalance }        from "@/hooks/useBalance";
import { useOnlineStatus }   from "@/hooks/useOnlineStatus";
import { useTabConflict }    from "@/hooks/useTabConflict";

interface DbMessage {
  id:          string;
  role:        "user" | "assistant";
  content:     string;
  creditCost:  number | null;
  isPartial:   boolean | null;
}

export default function ConversationPage() {
  const t = useTranslations();
  const { locale, id: conversationId } = useParams<{ locale: string; id: string }>();
  const [modelId, setModelId] = useState("claude-sonnet-4-6");
  const [title,   setTitle]   = useState<string | null>(null);
  const { isZero, refresh: refreshBalance } = useBalance();
  const isOnline               = useOnlineStatus();
  const { otherTabOpen, otherTabSending, announceSending } = useTabConflict(conversationId);

  // Loaded from the server once per conversation; keyed by message id so
  // history retains its real creditCost/isPartial instead of every past
  // message being flattened to "creditCost: null, isPartial: false".
  const [historyMeta, setHistoryMeta] = useState<Record<string, ChatMessageMeta>>({});
  const [historyLoading, setHistoryLoading] = useState(true);
  const [partialMessageId, setPartialMessageId] = useState<string | null>(null);
  const [streamErrorMsg, setStreamErrorMsg]     = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  const { messages, isLoading, stop, append, reload, setMessages } = useChat({
    api:  "/api/chat",
    id:   conversationId,
    streamProtocol: "text",
    body: { model: modelId, conversationId },
    onFinish: () => { refreshBalance(); setPartialMessageId(null); setStreamErrorMsg(null); },
    onError: (err) => {
      let msg = t("errors.streamInterrupted");
      if (err.message.includes("INSUFFICIENT_BALANCE")) {
        msg = t("errors.insufficientBalance");
        refreshBalance();
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

  // Load conversation title/model AND prior messages exactly once per
  // conversation id. Previously this only pulled title/modelId and threw
  // the `messages` array away, so opening an existing conversation always
  // rendered as if it were brand new.
  useEffect(() => {
    if (loadedFor.current === conversationId) return;
    loadedFor.current = conversationId;
    setHistoryLoading(true);
    fetch(`/api/conversations/${conversationId}`)
      .then(r => r.json())
      .then((d: { title?: string; modelId?: string; messages?: DbMessage[] }) => {
        if (d.title)   setTitle(d.title);
        if (d.modelId) setModelId(d.modelId);
        if (d.messages?.length) {
          const asAiMessages: AiMessage[] = d.messages.map(m => ({
            id: m.id, role: m.role, content: m.content,
          }));
          setMessages(asAiMessages);
          const meta: Record<string, ChatMessageMeta> = {};
          for (const m of d.messages) {
            meta[m.id] = { creditCost: m.creditCost, isPartial: !!m.isPartial };
          }
          setHistoryMeta(meta);
        }
      })
      .catch(() => { toast.error(t("errors.network")); })
      .finally(() => setHistoryLoading(false));
  }, [conversationId, setMessages, t]);

  function handleRetry() {
    setStreamErrorMsg(null);
    setPartialMessageId(null);
    reload({ body: { model: modelId, conversationId } });
  }

  const handleSend = useCallback(async (text: string) => {
    if (isZero) { toast.error(t("errors.insufficientBalance")); return; }
    if (!isOnline) { toast.error(t("chat.offline")); return; }

    setStreamErrorMsg(null);
    announceSending();
    // BUG FIX: see chat/page.tsx — `setInput` + immediate `handleSubmit`
    // sent whatever `input` held from the *previous* render (empty on the
    // first message ever sent in a session), so the first click silently
    // did nothing. `append()` sends the given content immediately.
    await append(
      { role: "user", content: text },
      { body: { model: modelId, conversationId } }
    );
  }, [isZero, isOnline, modelId, conversationId, append, announceSending, t]);

  const meta = { ...historyMeta, ...(partialMessageId ? { [partialMessageId]: { isPartial: true } } : {}) };

  const typingIndicator = (
    <div className="flex gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-[color:var(--accent-blue)]
                      flex items-center justify-center text-white flex-shrink-0
                      shadow-[var(--shadow-elevation-1)]">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="bg-[color:var(--bg-surface)] border border-slate-700/80 rounded-2xl rounded-es-sm px-4 py-3">
        <div className="flex gap-1.5 h-5 items-center">
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
          title={title ?? (messages[0]?.content.slice(0, 40) ?? t("chat.newChat"))}
          modelId={modelId}
          locale={locale}
          onModelChange={setModelId}
        />

        {!isOnline && <OfflineBanner locale={locale} />}
        {isOnline && otherTabOpen && <TabConflictBanner sending={otherTabSending} />}

        <main className="flex-1 min-h-0 overflow-hidden">
          {historyLoading ? (
            <div className="flex items-center justify-center h-full">
              <Skeleton className="w-32 h-32 rounded-full" />
            </div>
          ) : messages.length === 0 ? (
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

        <InputBar onSubmit={handleSend} onStop={stop} isLoading={isLoading}
          disabled={isZero} offline={!isOnline} modelId={modelId} locale={locale} />
      </div>
    </ChatLayout>
  );
}
