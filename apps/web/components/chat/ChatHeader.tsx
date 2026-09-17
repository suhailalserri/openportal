"use client";
import { useTranslations } from "next-intl";
import { PanelLeft } from "lucide-react";
import { useSidebar } from "./ChatLayout";
import { ThemeToggle } from "../shared/ThemeToggle";

interface ChatHeaderProps {
  title:    string;
  locale:   string;
}

// Single header shared by /chat and /chat/[id]. Sticky + a translucent
// backdrop-blur so it reads as a distinct glass plane floating above the
// thread as it scrolls underneath, rather than a flat bar that happens
// to sit at the top — same visual language as the composer at the
// bottom (see InputBar), so the chat column is framed top and bottom by
// matching "elevated glass" chrome instead of two unrelated bars.
//
// The model picker used to live here; it now lives inline in InputBar
// (next to where the cost estimate and send button already are), so
// picking a model and seeing what it costs are in the same place. This
// header keeps only what's genuinely page-chrome: the sidebar toggle,
// the conversation title, and the theme toggle.
export function ChatHeader({ title, locale }: ChatHeaderProps) {
  const t = useTranslations();
  const { toggle } = useSidebar();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-2 px-3 py-2.5 sm:px-4
                 border-b border-slate-800 bg-[color:var(--bg-surface)]/85 backdrop-blur-md"
    >
      <button
        onClick={toggle}
        className="p-2 -ms-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800
                   rounded-lg transition-colors shrink-0 active:scale-95"
        aria-label={t("nav.chat")}
      >
        <PanelLeft className="h-4 w-4" />
      </button>

      <h2 className="flex-1 min-w-0 text-sm font-medium text-slate-300 truncate font-display">
        {title}
      </h2>

      <div className="flex items-center gap-1.5 shrink-0">
        <ThemeToggle dir={dir} />
      </div>
    </header>
  );
}
