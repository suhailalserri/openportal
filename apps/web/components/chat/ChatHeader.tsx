"use client";
import { useTranslations } from "next-intl";
import { PanelLeft } from "lucide-react";
import { useSidebar } from "./ChatLayout";
import { ModelSelector } from "./ModelSelector";
import { ThemeToggle } from "../shared/ThemeToggle";

interface ChatHeaderProps {
  title:    string;
  modelId:  string;
  locale:   string;
  onModelChange: (modelId: string) => void;
}

// Single header shared by /chat and /chat/[id] — previously each page
// hand-rolled its own copy of this markup (including a `bg-[#1D1815]`
// literal that silently opted this row out of the light theme; both
// copies now go through `var(--bg-surface)` like the rest of the app).
export function ChatHeader({ title, modelId, locale, onModelChange }: ChatHeaderProps) {
  const t = useTranslations();
  const { toggle } = useSidebar();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <header className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b border-[color:var(--border)] bg-[color:var(--bg-surface)]/95 px-3 py-2.5 backdrop-blur-md sm:px-4">
      <button
        onClick={toggle}
        className="-ms-1 shrink-0 rounded-xl p-2 text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--bg-elevated)] hover:text-[color:var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-blue)]"
        aria-label={t("nav.chat")}
      >
        <PanelLeft className="h-4 w-4" />
      </button>

      <h2 className="flex-1 min-w-0 text-sm font-medium text-slate-300 truncate font-display">
        {title}
      </h2>

      <div className="flex items-center gap-1.5 shrink-0">
        <ModelSelector value={modelId} onChange={onModelChange} />
        <ThemeToggle dir={dir} />
      </div>
    </header>
  );
}
