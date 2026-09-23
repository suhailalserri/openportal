import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/safari.tsx
 *
 * Magic UI "Safari" — https://magicui.design/docs/components/safari
 * (MIT, © Magic UI). A desktop browser frame: title bar with macOS
 * traffic lights on the left, a centered URL pill, and a content area
 * below. Used by the landing page's demo section as the "desktop"
 * device preview.
 *
 * TRAFFIC LIGHT COLOURS ARE HARDCODED (`#FF5F57` / `#FEBC2E` / `#28C840`)
 * on purpose: they are the macOS system colours, which do not change
 * with light/dark mode and are the visual shorthand every visitor reads
 * as "this is a browser window". Substituting theme tokens here would
 * break the recognition. Everything else — chrome background, borders,
 * text, the URL pill — IS themed so the frame feels native to this app.
 *
 * RTL: the chrome row is `dir="ltr"` because traffic lights sit on the
 * physical left of a real browser window regardless of UI language —
 * they should not mirror. The content area below inherits page
 * direction, so RTL locales still get RTL chat inside the frame.
 *
 * The URL is a hardcoded cosmetic placeholder ("openportal.app/chat"),
 * not a real link — the frame never navigates anywhere.
 *
 * No `"use client"`: no hooks, no browser APIs.
 */

export interface SafariProps extends ComponentPropsWithoutRef<"div"> {
  children?: ReactNode;
  /** Cosmetic URL shown in the pill. Defaults to the landing app path. */
  url?: string;
}

export function Safari({
  children,
  className,
  url = "openportal.app/chat",
  ...props
}: SafariProps) {
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4)]",
        className,
      )}
      {...props}
    >
      {/* Browser chrome. dir="ltr" so the traffic lights stay on the
          physical left in RTL locales (see file header). */}
      <div
        dir="ltr"
        className="flex items-center gap-3 border-b border-border bg-secondary/60 px-4 py-2.5"
      >
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-3 rounded-full bg-[#FF5F57]" />
          <span className="size-3 rounded-full bg-[#FEBC2E]" />
          <span className="size-3 rounded-full bg-[#28C840]" />
        </div>

        <div className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-background/80 px-3 py-1 text-[11px] text-muted-foreground">
          <Lock className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{url}</span>
        </div>

        {/* Right spacer — keeps the URL pill visually centered. */}
        <div className="w-12 shrink-0" aria-hidden="true" />
      </div>

      {/* Content area. Inherits page direction (RTL locales render RTL
          chat inside a physically-LTR browser window). */}
      <div className="h-[420px] overflow-hidden bg-background">{children}</div>
    </div>
  );
}