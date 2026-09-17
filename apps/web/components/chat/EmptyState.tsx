"use client";
import { useTranslations } from "next-intl";
import { PenLine, Lightbulb, Code2, LineChart, Sparkles } from "lucide-react";

interface EmptyStateProps {
  locale: string;
  // Optional: without it (e.g. a future read-only preview) the chips
  // just don't render, rather than sending anywhere silently.
  onSuggestionSelect?: (text: string) => void;
}

interface Suggestion { label: string; prompt: string }

// Icons are assigned by position, not stored — the label/prompt text
// itself comes from messages/{en,ar}.json (chat.suggestions), so this
// stays localized without hardcoding copy into the component.
const ICONS = [PenLine, Lightbulb, Code2, LineChart];

export function EmptyState({ locale, onSuggestionSelect }: EmptyStateProps) {
  void locale;
  const t = useTranslations();
  const suggestions = t.raw("chat.suggestions") as Suggestion[];

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-fade-in">
      <div className="w-14 h-14 mb-6 rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur-md
                      flex items-center justify-center shadow-[var(--shadow-elevation-1)]">
        <Sparkles className="h-7 w-7 text-[color:var(--accent-blue-light)]" />
      </div>
      <h2 className="font-display text-3xl text-slate-50 mb-3">
        {t("chat.emptyStateTitle")}
      </h2>
      <p className="text-slate-400 max-w-md mb-8">
        {t("chat.placeholderEmpty")}
      </p>

      {onSuggestionSelect && Array.isArray(suggestions) && suggestions.length > 0 && (
        <div className="w-full max-w-lg">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-600 mb-3">
            {t("chat.suggestionsHeading")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {suggestions.map((s, i) => {
              const Icon = ICONS[i % ICONS.length]!;
              return (
                <button
                  key={s.label}
                  onClick={() => onSuggestionSelect(s.prompt)}
                  className="flex items-start gap-3 text-start px-4 py-3 rounded-2xl
                             bg-white/[0.05] border border-white/10 backdrop-blur-md
                             hover:border-blue-400/30 hover:bg-white/[0.08]
                             transition-colors shadow-[var(--shadow-elevation-1)]"
                >
                  <Icon className="h-4 w-4 mt-0.5 shrink-0 text-[color:var(--accent-blue-light)]" />
                  <span>
                    <span className="block text-sm font-medium text-slate-200">{s.label}</span>
                    <span className="block text-xs text-slate-500 mt-0.5 line-clamp-2">{s.prompt}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
