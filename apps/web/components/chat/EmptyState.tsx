"use client";

interface EmptyStateProps {
  locale: string;
}

export function EmptyState({ locale }: EmptyStateProps) {
  const isRTL = locale === "ar";
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-fade-in">
      <div className="text-6xl mb-6">🧠</div>
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
