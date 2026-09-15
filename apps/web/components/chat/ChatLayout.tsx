"use client";
import { useState } from "react";
import { Menu } from "lucide-react";
import { ChatSidebar }  from "./ChatSidebar";
import { StatusBanner } from "../shared/StatusBanner";

interface ChatLayoutProps {
  children: React.ReactNode;
  locale:   string;
}

export function ChatLayout({ children, locale }: ChatLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
          className="md:hidden absolute top-4 start-4 z-50 p-2 bg-slate-800 rounded-lg
                     border border-slate-700 text-slate-400 hover:text-slate-100 transition-colors
                     shadow-[var(--shadow-elevation-1)]"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}
