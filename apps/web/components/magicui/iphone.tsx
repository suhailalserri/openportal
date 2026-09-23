import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/iphone.tsx
 *
 * Magic UI "iPhone" — https://magicui.design/docs/components/iphone
 * (MIT, © Magic UI). A presentational frame that wraps arbitrary
 * children in an iPhone silhouette. Used by the landing page's demo
 * section (features/landing/components/demo-section.tsx) to preview the
 * same chat simulation across three devices — the frame is the whole
 * component; the consumer supplies content.
 *
 * STRUCTURE: an outer bezel (rounded rect with a thick border) contains
 * an inner screen (same shape, smaller radius). The dynamic island and
 * home indicator sit INSIDE the screen, on top of content, at `z-20` —
 * matching the physical device where they are cutouts/overlays, not
 * separate chrome.
 *
 * WHY THE ISLAND IS `bg-black`, NOT A THEME TOKEN: on a real iPhone the
 * dynamic island is a hard black cutout regardless of OS theme,
 * wallpaper or user preference. A theme-token version (`bg-foreground`)
 * would flip to near-white on the dark theme and read as wrong to
 * anyone who has held the device. This is the same exception the
 * traffic lights in safari.tsx make — a physical device detail, not a
 * themed surface. The home indicator IS themed (`bg-foreground/40`)
 * because on a real iPhone it adopts the current app's tint.
 *
 * RTL: the notch and home indicator use `left-1/2 -translate-x-1/2`
 * (physical center), so they stay physically centered in both
 * directions. The content inside is NOT forced to a direction — it
 * inherits from the page, so RTL locales get RTL chat bubbles while the
 * device chrome stays put. This is deliberate: the device is a physical
 * object; only its content is localizable.
 *
 * No `"use client"` needed: no hooks, no browser APIs. It becomes a
 * client component only because its consumer is one.
 */

export interface IphoneProps extends ComponentPropsWithoutRef<"div"> {
  children?: ReactNode;
}

export function Iphone({ children, className, ...props }: IphoneProps) {
  return (
    <div className={cn("relative w-[280px] shrink-0", className)} {...props}>
      {/* Outer bezel */}
      <div className="relative rounded-[44px] border-[10px] border-foreground/15 bg-background shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4)]">
        {/* Screen */}
        <div className="relative h-[520px] overflow-hidden rounded-[34px] bg-card">
          {/* Dynamic island — physical cutout, always black. */}
          <div
            aria-hidden="true"
            className="absolute top-2.5 left-1/2 z-20 h-[24px] w-[86px] -translate-x-1/2 rounded-full bg-black"
          />

          {/* Content (consumer-provided). pt/pb keep it clear of the
              island and the home indicator. */}
          <div className="h-full overflow-hidden pt-9 pb-7">{children}</div>
          
          {/* Home indicator — theme-adaptive, like the real thing. */}
          <div
            aria-hidden="true"
            className="absolute bottom-2 left-1/2 z-20 h-[4px] w-[100px] -translate-x-1/2 rounded-full bg-foreground/40"
          />
        </div>
      </div>
    </div>
  );
}