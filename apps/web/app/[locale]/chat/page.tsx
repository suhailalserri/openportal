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

export default function ChatPage() {
  const t = useTranslations();
  const { locale } = useParams<{ locale: string }>();
  const [modelId, setModelId] = useState("claude-sonnet-4-6");
  const [balance, setBalance] = useState<number>(1); // optimistic
  const messagesEndRef         = useRef<HTMLDivElement>(null);

  const { messages, input, handleSubmit, isLoading, stop, setInput, error } = useChat({
    api: "/api/chat",
    body: { model: modelId },
    onError: (err) => {
      if (err.message.includes("INSUFFICIENT_BALANCE")) {
        toast.error(t("errors.insufficientBalance"));
        setBalance(0);
      } else if (err.message.includes("CONTEXT_TOO_LONG")) {
        toast.error(t("chat.contextExceeded"));
      } else if (err.message.includes("MODEL_UNAVAILABLE")) {
        toast.error(t("errors.modelUnavailable"));
      } else {
        toast.error(t("errors.streamInterrupted"));
      }
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend(text: string) {
    if (balance <= 0) { toast.error(t("errors.insufficientBalance")); return; }
    setInput(text);
    handleSubmit(new Event("submit") as unknown as React.FormEvent);
  }

  return (
    <ChatLayout locale={locale}>
      <div className="flex flex-col h-full">
        {/* Chat header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-[#1E293B]">
          <h2 className="text-sm font-medium text-slate-300 truncate max-w-[200px]">
            {messages.length > 0
              ? (messages[0]?.content?.slice(0, 40) ?? t("chat.newChat"))
              : t("chat.newChat")}
          </h2>
          <ModelSelector value={modelId} onChange={setModelId} />
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-fade-in">
              <div className="text-6xl mb-6">🧠</div>
              <h2 className="text-2xl font-bold text-white mb-3">
                {locale === "ar" ? "كيف يمكنني مساعدتك اليوم؟" : "How can I help you today?"}
              </h2>
              <p className="text-slate-400 max-w-md">
                {locale === "ar"
                  ? "اختر نموذج الذكاء الاصطناعي واكتب رسالتك للبدء"
                  : "Choose an AI model and type your message to get started"}
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  locale={locale}
                  message={{
                    role:       msg.role as "user" | "assistant",
                    content:    msg.content,
                    creditCost: null,
                    modelId:    modelId,
                    isPartial:  false,
                  }}
                />
              ))}

              {/* Typing indicator */}
              {isLoading && (
                <div className="flex gap-3 animate-fade-in">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-teal-600
                                  flex items-center justify-center text-white text-xs font-bold">
                    AI
                  </div>
                  <div className="bg-[#1E293B] border border-slate-700 rounded-2xl rounded-es-sm px-4 py-3">
                    <div className="flex gap-1.5 items-center h-5">
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

        {/* Input */}
        <InputBar
          onSubmit={handleSend}
          onStop={stop}
          isLoading={isLoading}
          disabled={balance <= 0}
          modelId={modelId}
          locale={locale}
        />
      </div>
    </ChatLayout>
  );
}
