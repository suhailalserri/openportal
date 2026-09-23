"use client";

import { motion, useScroll, type MotionProps } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/scroll-progress.tsx
 *
 * Magic UI "Scroll Progress" —
 * https://magicui.design/docs/components/scroll-progress (MIT, © Magic UI).
 * Copied from `https://magicui.design/r/scroll-progress.json` and adapted:
 *
 *  1. `motion/react` -> `framer-motion` (this repo's version).
 *  2. Colour default swapped from MagicUI's purple/pink/orange gradient
 *     to this repo's chart tokens (`--chart-1` -> `--chart-2` -> `--primary`),
 *     so the bar reads as brand and follows light/dark + the preset
 *     switcher automatically. Callers wanting a specific gradient pass
 *     `className="bg-gradient-to-r from-… via-… to-…"` which overrides.
 *  3. `aria-hidden` set — the bar is decorative; screen readers already
 *     have the document's own scroll position.
 *
 * Reduced motion: the bar itself is not an animation, it's a direct
 * scroll-position readout — `useReducedMotion()` intentionally NOT used.
 * Users who opted out of motion still get an accurate progress
 * indicator; the value is data, not decoration.
 *
 * Default position (`fixed inset-x-0 top-0 z-50 h-1`) matches MagicUI's
 * so the drop-in reads the same. Override via `className`.
 */

export interface ScrollProgressProps extends MotionProps {
  className?: string;
}

export function ScrollProgress({ className, ...props }: ScrollProgressProps) {
  const { scrollYProgress } = useScroll();

  return (
    <motion.div
      aria-hidden="true"
      className={cn(
        "fixed inset-x-0 top-0 z-50 h-1 origin-left",
        "bg-linear-to-r from-chart-1 via-chart-2 to-primary",
        className,
      )}
      style={{ scaleX: scrollYProgress }}
      {...props}
    />
  );
}