"use client";
import { Sparkles } from "lucide-react";

interface EmptyStateProps {
  locale: string;
}

export function EmptyState({ locale }: EmptyStateProps) {
  const isRTL = locale === "ar";
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-fade-in">
      <div className="w-16 h-16 mb-6 rounded-2xl gradient-primary flex items-center justify-center
                      shadow-[var(--shadow-elevation-3)]">
        <Sparkles className="h-8 w-8 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-3">
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
