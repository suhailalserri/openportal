"use client";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

interface EmptyStateProps {
  locale: string;
}

export function EmptyState({ locale }: EmptyStateProps) {
  void locale;
  const t = useTranslations();
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-fade-in">
      <div className="w-14 h-14 mb-6 rounded-2xl bg-[color:var(--accent-blue)] flex items-center justify-center
                      shadow-[var(--shadow-elevation-2)]">
        <Sparkles className="h-7 w-7 text-white" />
      </div>
      <h2 className="font-display text-3xl text-slate-50 mb-3">
        {t("chat.emptyStateTitle")}
      </h2>
      <p className="text-slate-400 max-w-md">
        {t("chat.placeholderEmpty")}
      </p>
    </div>
  );
}
