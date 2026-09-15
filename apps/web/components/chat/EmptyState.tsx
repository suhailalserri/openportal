"use client";
import { Sparkles } from "lucide-react";

interface EmptyStateProps {
  locale: string;
}

export function EmptyState({ locale }: EmptyStateProps) {
  const isRTL = locale === "ar";
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-fade-in">
      <div className="w-14 h-14 mb-6 rounded-2xl bg-[color:var(--accent-blue)] flex items-center justify-center
                      shadow-[var(--shadow-elevation-2)]">
        <Sparkles className="h-7 w-7 text-white" />
      </div>
      <h2 className="font-display text-3xl text-slate-50 mb-3">
        {isRTL ? "كيف يمكنني مساعدتك اليوم؟" : "How can I help you today?"}
      </h2>
      <p className="text-slate-400 max-w-md">
        {isRTL
          ? "اختر نموذج الذكاء الاصطناعي واكتب رسالتك للبدء"
          : "Choose an AI model and type your message to get started"}
      </p>
    </div>
  );
}
