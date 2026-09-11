"use client";
import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useChat } from "ai/react";
import { toast } from "sonner";
import { ChatLayout }    from "@/components/chat/ChatLayout";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { InputBar }      from "@/components/chat/InputBar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { Skeleton }      from "@/components/ui/skeleton";
import { useBalance }    from "@/hooks/useBalance";

export default function ConversationPage() {
  const t = useTranslations();
  const { locale, id: conversationId } = useParams<{ locale: string; id: string }>();
  const [modelId, setModelId] = useState("claude-sonnet-4-6");
  const [title,   setTitle]   = useState<string | null>(null);
  const { isZero }            = useBalance();
  const messagesEndRef        = useRef<HTMLDivElement>(null);

  const { messages, isLoading, stop, setInput, handleSubmit, error } = useChat({
    api:  "/api/chat",
    id:   conversationId,
    streamProtocol: "text",
    body: { model: modelId, conversationId },
    onError: (err) => {
      if (err.message.includes("INSUFFICIENT_BALANCE")) toast.error(t("errors.insufficientBalance"));
      else if (err.message.includes("CONTEXT_TOO_LONG"))    toast.error(t("chat.contextExceeded"));
      else toast.error(t("errors.streamInterrupted"));
    },
  });

  // Load existing conversation title on mount
  useEffect(() => {
    fetch(`/api/conversations/${conversationId}`)
      .then(r => r.json())
      .then((d: { title?: string; modelId?: string }) => {
        if (d.title)   setTitle(d.title);
        if (d.modelId) setModelId(d.modelId);
      })
      .catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend(text: string) {
    if (isZero) { toast.error(t("errors.insufficientBalance")); return; }
    setInput(text);
    handleSubmit(new Event("submit") as unknown as React.FormEvent);
  }

  return (
    <ChatLayout locale={locale}>
      <div className="flex flex-col h-full">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-[#1E293B]">
          <h2 className="text-sm font-medium text-slate-300 truncate max-w-xs">
            {title ?? (messages[0]?.content.slice(0, 40) ?? t("chat.newChat"))}
          </h2>
          <ModelSelector value={modelId} onChange={setModelId} />
        </header>

        <main className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Skeleton className="w-32 h-32 rounded-full" />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map(msg => (
                <MessageBubble key={msg.id} locale={locale}
                  message={{ role: msg.role as "user" | "assistant", content: msg.content,
                    creditCost: null, modelId, isPartial: false }} />
              ))}
              {isLoading && (
                <div className="flex gap-3 animate-fade-in">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-teal-600
                                  flex items-center justify-center text-white text-xs">AI</div>
                  <div className="bg-[#1E293B] border border-slate-700 rounded-2xl rounded-es-sm px-4 py-3">
                    <div className="flex gap-1.5 h-5 items-center">
                      {[0,1,2].map(i => (
                        <div key={i} className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        <InputBar onSubmit={handleSend} onStop={stop} isLoading={isLoading}
          disabled={isZero} modelId={modelId} locale={locale} />
      </div>
    </ChatLayout>
  );
}
