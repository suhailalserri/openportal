"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { PanelLeft } from "lucide-react";
import { ChatSidebar }  from "./ChatSidebar";
import { StatusBanner } from "../shared/StatusBanner";

interface ChatLayoutProps {
  children: React.ReactNode;
  locale:   string;
}

export function ChatLayout({ children, locale }: ChatLayoutProps) {
  const t = useTranslations();
  // Desktop starts with the sidebar open, mobile starts closed — avoids the
  // drawer flashing open over the chat on first paint on small screens.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(window.matchMedia("(min-width: 768px)").matches);
  }, []);

  return (
    <div className="flex h-screen bg-[color:var(--bg-base)] overflow-hidden">
      <ChatSidebar
        locale={locale}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 relative">
        <StatusBanner />
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="absolute top-4 start-4 z-30 p-2 bg-slate-800 rounded-lg
                     border border-slate-700 text-slate-400 hover:text-slate-100 transition-colors
                     shadow-[var(--shadow-elevation-1)]"
          aria-label={t("nav.chat")}
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}
