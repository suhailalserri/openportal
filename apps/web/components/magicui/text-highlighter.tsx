"use client";

import { motion, useReducedMotion, type Transition } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/text-highlighter.tsx
 *
 * Magic UI "Text Highlighter" —
 * https://magicui.design/docs/components/text-highlighter (MIT, © Magic UI).
 * Adapted for this repo:
 *
 *  1. `motion/react` -> `framer-motion`.
 *  2. Theme tokens only. The highlight stroke is `--primary` with a
 *     `--warning`-ish tint layered on top via `color-mix`, so it reads as
 *     a marker over the theme's own accent rather than MagicUI's
 *     fixed yellow. MagicUI's version hardcodes `#ffd700`.
 *  3. Reduced motion: the marker path draws in via `pathLength`
 *     animation (JS-driven), so a guard is required. Under reduced
 *     motion the path is rendered at full length and the child text
 *     appears immediately — the highlight is still visible, it just
 *     doesn't draw in.
 *  4. RTL-safe: the SVG uses `direction: ltr` internally because the
 *     hand-drawn path is authored left-to-right, but the wrapping span
 *     inherits the document direction and the marker re-anchors via
 *     `preserveAspectRatio="none"`. The underline is decorative; the
 *     text keeps its own directionality from the parent.
 *
 * The highlight is an SVG path drawn *behind* the text. `pathLength`
 * animates the dash-offset from 1 -> 0, which "draws" the line in.
 *
 * No styles/index.css additions required.
 */

export interface TextHighlighterProps {
  children: React.ReactNode;
  className?: string;
  /** Delay before the marker starts drawing, in seconds. */
  delay?: number;
  /** Duration of the draw-in, in seconds. */
  duration?: number;
  /** Framer Motion transition override for the draw. */
  transition?: Transition;
}

export function TextHighlighter({
  children,
  className,
  delay = 0,
  duration = 1.2,
  transition,
}: TextHighlighterProps) {
  const reduced = useReducedMotion();

  return (
    <span className={cn("relative inline-block", className)}>
      {/* The marker sits behind the text and spans its box. */}
      <span aria-hidden="true" className="absolute inset-0 -z-0">
        <svg
          viewBox="0 0 200 24"
          preserveAspectRatio="none"
          className="h-full w-full"
          style={{ direction: "ltr" }}
        >
          <motion.path
            d="M2 16 Q 60 6, 100 12 T 198 10"
            fill="none"
            stroke="color-mix(in oklab, var(--primary) 70%, transparent)"
            strokeWidth="10"
            strokeLinecap="round"
            initial={{ pathLength: reduced ? 1 : 0, opacity: reduced ? 0.9 : 0 }}
            animate={{ pathLength: 1, opacity: 0.9 }}
            transition={
              reduced
                ? { duration: 0 }
                : {
                    pathLength: { delay, duration, ease: "easeInOut" },
                    opacity: { delay, duration: 0.01 },
                    ...transition,
                  }
            }
          />
        </svg>
      </span>

      {/* The text itself, in front of the marker. */}
      <span className="relative z-10">{children}</span>
    </span>
  );
}