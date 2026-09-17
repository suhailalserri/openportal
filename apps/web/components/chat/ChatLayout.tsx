"use client";
import { createContext, useContext, useState, useEffect } from "react";
import { ChatSidebar }  from "./ChatSidebar";
import { StatusBanner } from "../shared/StatusBanner";

interface SidebarContextValue { isOpen: boolean; toggle: () => void }

// Was: a `<PanelLeft>` button absolutely positioned over the content at
// top-4/start-4 — on narrow screens that floated directly on top of the
// chat header's title text instead of beside it. Exposing the toggle
// through context instead lets each page's header lay the button out
// in normal flow (see ChatHeader) with no overlap and no prop drilling.
const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within ChatLayout");
  return ctx;
}

interface ChatLayoutProps {
  children: React.ReactNode;
  locale:   string;
}

export function ChatLayout({ children, locale }: ChatLayoutProps) {
  // Desktop starts with the sidebar open, mobile starts closed — avoids the
  // drawer flashing open over the chat on first paint on small screens.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(window.matchMedia("(min-width: 768px)").matches);
  }, []);

  return (
    <SidebarContext.Provider value={{ isOpen: sidebarOpen, toggle: () => setSidebarOpen(o => !o) }}>
      {/* Solid navy-gradient base (set on <html> in globals.css) shows
          through everywhere; this shell just arranges the two glass
          columns on top of it. No extra background here — a second
          background would compete with the base gradient underneath. */}
      <div className="flex h-screen overflow-hidden">
        <ChatSidebar
          locale={locale}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* bg-noise: the same faint-grain texture token used on the auth
            and empty-state surfaces (see globals.css) — applied here so
            the whole chat column reads as one continuous surface instead
            of a flat digital black. Purely decorative, zero layout or
            behavior impact. */}
        <div className="flex-1 flex flex-col min-w-0 relative bg-noise">
          <StatusBanner />
          {children}
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
