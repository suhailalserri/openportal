"use client";

import { useReducedMotion, motion, type Variants } from "framer-motion";
import * as React from "react";

/**
 * apps/web/components/ui/reveal.tsx
 *
 * Phase 3.3 (docs/FRONTEND_REBUILD_PLAN.md). Fade-and-rise-once scroll
 * reveal, used to wrap each landing page section so content appears in
 * an animated, staged way rather than static on load — per this phase's
 * "when users scroll down the page they appear in an animated styled
 * way, not just static" note.
 *
 * Built on framer-motion's `whileInView` (not a hand-rolled
 * IntersectionObserver): v11.11+ supports React 19, it's already an
 * existing dependency, and this is exactly the primitive Magic UI's own
 * `blur-fade` is built on, so this component intentionally mirrors that
 * pattern rather than reinventing scroll-triggering by hand.
 *
 * `once: true` — plays a single time per mount, per the "once only"
 * requirement (re-triggering on every scroll up/down reads as gimmicky,
 * not polished).
 *
 * REDUCED MOTION: `useReducedMotion()` reads prefers-reduced-motion.
 * When true, the variants collapse to a plain opacity fade with no
 * translate/blur and a near-zero duration — content still "appears" but
 * nothing moves, matching the constellation/shimmer's own reduced-motion
 * behaviour elsewhere in this phase.
 *
 * SSR/no-JS: initial state is `hidden` (opacity 0), which would be a
 * real problem for no-JS visitors — mitigated by `viewport={{ once:
 * true, margin: "-10% 0px" }}` triggering as soon as a section is
 * plausibly visible, and by every section's real content already being
 * in the server HTML underneath (this only wraps, never gates, content).
 */

export type RevealDirection = "up" | "down" | "left" | "right" | "none";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Stagger start — seconds. Use to cascade a list of children. */
  delay?: number;
  direction?: RevealDirection;
  /** Distance the content travels in px, ignored when direction is "none". */
  distance?: number;
  /** Element tag to render as. Defaults to div. */
  as?: "div" | "section" | "li" | "article";
}

const OFFSETS: Record<RevealDirection, { x?: number; y?: number }> = {
  up: { y: 1 },
  down: { y: -1 },
  left: { x: 1 },
  right: { x: -1 },
  none: {},
};

export function Reveal({
  children,
  className,
  delay = 0,
  direction = "up",
  distance = 24,
  as = "div",
}: RevealProps) {
  const prefersReducedMotion = useReducedMotion();
  const offset = OFFSETS[direction];

  const variants: Variants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.15, delay } },
      }
    : {
        hidden: {
          opacity: 0,
          x: offset.x ? offset.x * distance : 0,
          y: offset.y ? offset.y * distance : 0,
        },
        visible: {
          opacity: 1,
          x: 0,
          y: 0,
          transition: { duration: 0.55, delay, ease: [0.21, 0.47, 0.32, 0.98] },
        },
      };

  const MotionTag = motion[as];

  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-10% 0px" }}
      variants={variants}
    >
      {children}
    </MotionTag>
  );
}
