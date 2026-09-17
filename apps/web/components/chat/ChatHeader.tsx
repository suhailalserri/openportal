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

// Single header shared by /chat and /chat/[id]. A translucent glass
// plane (backdrop-blur + hairline bottom border) floating above the
// thread as it scrolls underneath — same visual language as the
// composer at the bottom (see InputBar), so the chat column is framed
// top and bottom by matching glass chrome. The `.header-glow` class
// (globals.css) is the app's one permitted radial accent glow — used
// here and nowhere else.
export function ChatHeader({ title, modelId, locale, onModelChange }: ChatHeaderProps) {
  const t = useTranslations();
  const { toggle } = useSidebar();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <header
      className="header-glow sticky top-0 z-20 flex items-center gap-2 px-3 py-2.5 sm:px-4
                 border-b border-white/10 bg-white/[0.05] backdrop-blur-md overflow-hidden"
    >
      <button
        onClick={toggle}
        className="p-2 -ms-1 text-slate-400 hover:text-slate-100 hover:bg-white/10
                   rounded-lg transition-colors shrink-0 active:scale-95"
        aria-label={t("nav.chat")}
      >
        <PanelLeft className="h-4 w-4" />
      </button>

      <h2 className="flex-1 min-w-0 text-sm font-medium text-slate-300 truncate font-display">
        {title}
      </h2>

      <div className="flex items-center gap-1.5 shrink-0">
        <ModelSelector value={modelId} onChange={onModelChange} />
        {/* Quiet vertical rule to separate "what model" from "how it looks"
            controls — only shown once there's room for it. */}
        <div className="hidden sm:block w-px h-5 bg-white/10 mx-0.5" aria-hidden="true" />
        <ThemeToggle dir={dir} />
      </div>
    </header>
  );
}
