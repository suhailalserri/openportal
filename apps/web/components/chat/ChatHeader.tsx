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
    <header className="flex items-center gap-2 px-3 py-3 border-b border-slate-800 bg-[color:var(--bg-surface)]">
      <button
        onClick={toggle}
        className="p-2 -ms-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
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
