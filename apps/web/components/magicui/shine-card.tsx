import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/shine-card.tsx
 *
 * Replaces `SpotlightCard` (MagicCard pointer-glow + BorderBeam moving
 * ring) as the "this card is the highlight of the page" treatment, per
 * explicit feedback: no beam, no mouse-follow magic-card glow. Instead a
 * single diagonal light band sweeps across the whole card periodically
 * (`animate-card-shine`, styles/index.css) — a plain CSS animation, no
 * Framer Motion, no pointer tracking, no JS at all.
 *
 * The border itself is a static theme-token border (no animated ring);
 * the shine band is the only motion, and it's parked off-canvas for most
 * of each cycle (see the keyframe comment) so it reads as an occasional
 * glint rather than a constant shimmer.
 */
interface ShineCardProps {
  children: ReactNode;
  className?: string;
}

export function ShineCard({ children, className }: ShineCardProps) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-[14px] border border-border bg-card",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="animate-card-shine pointer-events-none absolute inset-y-0 left-0 z-10 w-1/3 bg-linear-to-r from-transparent via-white/30 to-transparent"
      />
      <div className="relative z-20 rounded-[inherit] p-[18px]">{children}</div>
    </div>
  );
}
