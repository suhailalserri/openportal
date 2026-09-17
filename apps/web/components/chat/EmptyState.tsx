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
    <div className="flex h-full flex-col items-center justify-center px-4 py-6 text-center animate-fade-in sm:px-8">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-[color:var(--accent-blue)]
                      shadow-[var(--shadow-elevation-2)] sm:mb-6">
        <Sparkles className="h-7 w-7 text-white" />
      </div>
      <h2 className="font-display mb-2 text-[clamp(2rem,9vw,3rem)] leading-tight text-[color:var(--text-primary)]">
        {t("chat.emptyStateTitle")}
      </h2>
      <p className="mb-7 max-w-md text-sm leading-6 text-[color:var(--text-muted)] sm:text-base">
        {t("chat.placeholderEmpty")}
      </p>

      {onSuggestionSelect && Array.isArray(suggestions) && suggestions.length > 0 && (
        <div className="w-full max-w-lg">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-600 mb-3">
            {t("chat.suggestionsHeading")}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5">
            {suggestions.map((s, i) => {
              const Icon = ICONS[i % ICONS.length]!;
              return (
                <button
                  key={s.label}
                  onClick={() => onSuggestionSelect(s.prompt)}
                  className="group flex min-h-16 items-start gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3.5 py-3 text-start shadow-[var(--shadow-elevation-1)] transition-colors hover:border-[color:var(--accent-blue)] hover:bg-[color:var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-blue)] sm:px-4"
                >
                  <Icon className="h-4 w-4 mt-0.5 shrink-0 text-[color:var(--accent-blue)]" />
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
