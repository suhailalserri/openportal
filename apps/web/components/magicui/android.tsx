import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/android.tsx
 *
 * Magic UI "Android" — https://magicui.design/docs/components/android
 * (MIT, © Magic UI). Same contract as iphone.tsx (see that file's header
 * for the rationale on the physical details below) — kept as a separate
 * component so a consumer can pick either shape without conditional
 * logic, and so the two silhouettes can drift independently if a future
 * design wants them to.
 *
 * DIFFERENCES FROM iphone.tsx:
 *  - Tighter corner radius (32px outer / 22px screen vs 44/34) — Android
 *    devices are notably less rounded than recent iPhones.
 *  - Punch-hole camera (a 12px circle at top center) instead of a
 *    dynamic island pill.
 *  - Gesture bar at the bottom, thinner than the iPhone home indicator.
 *  - Height is 520px to match iphone.tsx exactly, so swapping between
 *    the two does not reflow the surrounding layout.
 */

export interface AndroidProps extends ComponentPropsWithoutRef<"div"> {
  children?: ReactNode;
}

export function Android({ children, className, ...props }: AndroidProps) {
  return (
    <div className={cn("relative w-[280px] shrink-0", className)} {...props}>
      <div className="relative rounded-[32px] border-[10px] border-foreground/15 bg-background shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4)]">
        <div className="relative h-[520px] overflow-hidden rounded-[22px] bg-card">
          {/* Punch-hole camera — same rationale as the iPhone island
              (a physical cutout, always black). */}
          <div
            aria-hidden="true"
            className="absolute top-3 left-1/2 z-20 h-[12px] w-[12px] -translate-x-1/2 rounded-full bg-black"
          />

          <div className="h-full overflow-hidden pt-7 pb-5">{children}</div>
          
          {/* Gesture bar. */}
          <div
            aria-hidden="true"
            className="absolute bottom-2 left-1/2 z-20 h-[3px] w-[70px] -translate-x-1/2 rounded-full bg-foreground/30"
          />
        </div>
      </div>
    </div>
  );
}