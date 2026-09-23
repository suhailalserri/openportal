"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { MagicCard } from "./magic-card";
import { BorderBeam } from "./border-beam";

/**
 * apps/web/components/magicui/spotlight-card.tsx
 *
 * NOT a copy from magicui.design — this is this repo's own composition
 * of two Magic UI primitives already vendored here: `MagicCard`'s
 * pointer-follow glow and `BorderBeam`'s animated ring. Bundled into one
 * "this card is the highlight of the page" drop-in instead of
 * re-assembling the same two imports at every call site.
 *
 * `dashboard/components/top-model-card.tsx` is the first consumer (the
 * explicit ask was to make the top-model card stand out); any future
 * "featured" card — a landing hero stat, an admin KPI callout — can
 * reuse this instead of re-deriving the combo.
 *
 * Follows the same call-site convention as bare `MagicCard` elsewhere
 * (billing/package-picker.tsx, billing/balance-card.tsx): the border
 * radius comes in via `className` on the outer element (tailwind-merge
 * in `cn()` resolves it over MagicCard's own default), inner content
 * gets `rounded-[inherit]` so it never needs to know the radius itself.
 *
 * Reduced-motion: `BorderBeam` carries its OWN `useReducedMotion()`
 * guard internally (see border-beam.tsx, header point 3). This file used
 * to claim no guard was needed on the theory that theme.css's global
 * `animation-duration: 0.01ms` override would reach the beam — that's
 * wrong, the override only touches CSS animations, and BorderBeam is a
 * Framer Motion JS loop. Fixed at the source instead of papering over it
 * here.
 *
 * The radius BorderBeam inherits comes from magic-card.tsx's own
 * `rounded-[inherit]` wrapper (see that file's header, point 4 — same
 * numbering as magic-card.tsx's file header). Without that one-line
 * addition the beam's corners would inherit a square (unset) radius
 * instead of this card's.
 */
interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  beamColorFrom?: string;
  beamColorTo?: string;
  beamSize?: number;
  beamDuration?: number;
}

export function SpotlightCard({
  children,
  className,
  beamColorFrom = "var(--color-chart-1)",
  beamColorTo = "var(--color-primary)",
  beamSize = 140,
  beamDuration = 8,
}: SpotlightCardProps) {
  return (
    <MagicCard className={cn("rounded-[14px]", className)}>
      <BorderBeam size={beamSize} duration={beamDuration} colorFrom={beamColorFrom} colorTo={beamColorTo} />
      <div className="rounded-[inherit] p-[18px]">{children}</div>
    </MagicCard>
  );
}