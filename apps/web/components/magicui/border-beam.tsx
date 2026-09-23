"use client";

import type { CSSProperties } from "react";
import { motion, useReducedMotion, type MotionStyle, type Transition } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/border-beam.tsx
 *
 * Magic UI "Border Beam" — https://magicui.design/docs/components/border-beam
 * (MIT, © Magic UI). Copied from `https://magicui.design/r/border-beam.json`
 * and adapted for this repo:
 *
 *  1. `motion/react` -> `framer-motion` (this repo depends on
 *     framer-motion 11; the `motion` package is not installed, and the
 *     APIs used here are identical).
 *  2. Colour defaults swapped from Magic UI's orange/purple
 *     (`#ffaa40` / `#9c40ff`) to theme tokens (`--chart-1` — amber in
 *     light, gold in dark; `--primary` — gate) so a bare `<BorderBeam />`
 *     matches Gateway instead of clashing with it, and follows light/dark
 *     + the preset switcher automatically. Call sites that want the
 *     original MagicUI look pass the hexes explicitly.
 *  3. `useReducedMotion()` guard added. Framer Motion's `animate` prop is
 *     a JS-driven loop — the `@media (prefers-reduced-motion: reduce)`
 *     block in theme.css only reaches *CSS* animations, so without this
 *     guard the beam spins forever for users who opted out of motion.
 *     When reduced, the beam renders at its `initialOffset` and holds
 *     still — it stays visible as an accent, it just doesn't move.
 *  4. Type-only import of `CSSProperties` (the registry version writes
 *     `React.CSSProperties` without importing React; harmless with a
 *     permissive tsconfig, a type error with a strict one).
 *
 * The parent must be `relative` and `overflow-hidden`, with its own
 * border radius (the beam inherits it via `rounded-[inherit]`).
 *
 * Note for future readers: the offset-path square gives the beam a
 * "moving blob" look with corners that don't follow the radius cleanly.
 * A conic-gradient-behind-a-mask rewrite is possible and would let
 * `borderWidth` (thickness) be tuned independently of `size` (length),
 * but requires a CSS `@property` + `@keyframes` pair in styles/index.css.
 * Deliberately NOT done here — out of scope of this fix.
 */

interface BorderBeamProps {
  /** The size of the border beam. */
  size?: number;
  /** The duration of the border beam. */
  duration?: number;
  /** The delay of the border beam. */
  delay?: number;
  /** The color of the border beam from. */
  colorFrom?: string;
  /** The color of the border beam to. */
  colorTo?: string;
  /** The motion transition of the border beam. */
  transition?: Transition;
  /** The class name of the border beam. */
  className?: string;
  /** The style of the border beam. */
  style?: CSSProperties;
  /** Whether to reverse the animation direction. */
  reverse?: boolean;
  /** The initial offset position (0-100). */
  initialOffset?: number;
  /** The border width of the beam. */
  borderWidth?: number;
}

export const BorderBeam = ({
  className,
  size = 50,
  delay = 0,
  duration = 6,
  colorFrom = "var(--chart-1)",
  colorTo = "var(--primary)",
  transition,
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 1,
}: BorderBeamProps) => {
  const reduced = useReducedMotion();

  const offsets = reverse
    ? [`${100 - initialOffset}%`, `${-initialOffset}%`]
    : [`${initialOffset}%`, `${100 + initialOffset}%`];

  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit] border-(length:--border-beam-width) border-transparent mask-[linear-gradient(transparent,transparent),linear-gradient(#000,#000)] mask-intersect [mask-clip:padding-box,border-box]"
      style={
        {
          "--border-beam-width": `${borderWidth}px`,
        } as CSSProperties
      }
    >
      <motion.div
        className={cn(
          "absolute aspect-square",
          "bg-linear-to-l from-(--color-from) via-(--color-to) to-transparent",
          className,
        )}
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            "--color-from": colorFrom,
            "--color-to": colorTo,
            ...style,
          } as MotionStyle
        }
        initial={{ offsetDistance: `${initialOffset}%` }}
        // exactOptionalPropertyTypes: `animate`/`transition` cannot be
        // passed as `undefined`, so under reduced motion the props are
        // omitted entirely via a conditional spread.
        {...(reduced
          ? {}
          : {
              animate: { offsetDistance: offsets },
              transition: {
                repeat: Infinity,
                ease: "linear",
                duration,
                delay: -delay,
                ...transition,
              },
            })}
      />
    </div>
  );
};