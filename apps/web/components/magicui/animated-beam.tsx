"use client";

import { useEffect, useId, useState, type RefObject } from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * apps/web/components/magicui/animated-beam.tsx
 *
 * Magic UI "Animated Beam" —
 * https://magicui.design/docs/components/animated-beam (MIT, © Magic UI).
 *
 * Draws a curved SVG path between two elements inside a shared container,
 * with a traveling gradient highlight and a soft-glowing dot riding the
 * path forever. Used by the landing page's gateway diagram.
 *
 * Adapted for this repo (same four notes as magic-card.tsx / border-beam.tsx):
 *  1. `motion/react` -> `framer-motion` (identical APIs).
 *  2. Theme-token defaults. The default gradient is a `--gate` ramp so a
 *     bare `<AnimatedBeam />` matches the Gateway brand instead of Magic
 *     UI's purple.
 *  3. `useReducedMotion()` guard. The traveling dot is a JS-driven loop
 *     (motion's `offsetDistance`), so theme.css's CSS-only reduced-motion
 *     override does not reach it. Under reduced motion the beam still
 *     renders (path + static gradient), just without the moving dot.
 *  4. Positions are measured with `getBoundingClientRect()` against the
 *     container on mount, on resize, and whenever the container resizes
 *     (ResizeObserver). This is what makes it work inside a responsive
 *     grid without hard-coded coordinates.
 *  5. `repeatDelay` prop (absent from vanilla Magic UI, which hardcodes
 *     0). Lets a beam rest between passes instead of re-firing the
 *     instant it finishes, so a group of beams sharing one duration and
 *     repeatDelay stay phase-locked as a single pulse instead of reading
 *     as constant, uncoordinated flicker.
 *
 * The container MUST be `position: relative` (or any positioned value)
 * with a visible `overflow` box; the SVG overlay sits absolutely inside it
 * with `pointer-events: none` so links/buttons under it stay clickable.
 */

export interface AnimatedBeamProps {
  className?: string;
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  /** How far the curve bulges sideways, as a multiple of half the dx. */
  curvature?: number;
  /** Run the traveling highlight from `to` -> `from` instead of `from` -> `to`. */
  reverse?: boolean;
  /** Base line colour (under the gradient). */
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  /** The traveling highlight's two stops. */
  gradientStartColor?: string;
  gradientStopColor?: string;
  /** Seconds before the loop starts. */
  delay?: number;
  /** Seconds per full pass. */
  duration?: number;
  /** Seconds of rest between the end of one pass and the start of the next. */
  repeatDelay?: number;
  /** Fine offsets (px) so a beam can start at a node's edge, not its centre. */
  startXOffset?: number;
  startYOffset?: number;
  endXOffset?: number;
  endYOffset?: number;
}

export function AnimatedBeam({
  className,
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  reverse = false,
  pathColor = "var(--border)",
  pathWidth = 1.5,
  pathOpacity = 0.7,
  gradientStartColor = "var(--gate)",
  gradientStopColor = "var(--gate-bright)",
  delay = 0,
  duration = 4,
  repeatDelay = 0,
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
}: AnimatedBeamProps) {
  const id = useId();
  const [pathD, setPathD] = useState("");
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 });

  // Default: honor reduced motion. The path still draws; only the moving
  // highlight is dropped. Kept in a state so it can react to a live OS
  // change without remounting (matchMedia's own change event).
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Measure + build the curve. Runs on mount, on window resize, and on
  // any size change of the container itself (ResizeObserver) so a
  // responsive layout never leaves the beam pointing at a stale spot.
  useEffect(() => {
    const update = () => {
      const container = containerRef.current;
      const from = fromRef.current;
      const to = toRef.current;
      if (!container || !from || !to) return;

      const cRect = container.getBoundingClientRect();
      const fRect = from.getBoundingClientRect();
      const tRect = to.getBoundingClientRect();
      if (cRect.width === 0 || cRect.height === 0) return;

      setSvgDimensions({ width: cRect.width, height: cRect.height });

      const startX = fRect.left - cRect.left + fRect.width / 2 + startXOffset;
      const startY = fRect.top - cRect.top + fRect.height / 2 + startYOffset;
      const endX = tRect.left - cRect.left + tRect.width / 2 + endXOffset;
      const endY = tRect.top - cRect.top + tRect.height / 2 + endYOffset;

      const controlX = (startX + endX) / 2;
      // curvature 0 = straight-ish S-curve; 1 = strong bulge
      const controlY = (startY + endY) / 2 - curvature * Math.abs(endX - startX) * 0.5;

      setPathD(
        `M ${startX},${startY} Q ${controlX},${controlY} ${endX},${endY}`,
      );
    };

    update();
    window.addEventListener("resize", update);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      if (containerRef.current) ro.observe(containerRef.current);
      if (fromRef.current) ro.observe(fromRef.current);
      if (toRef.current) ro.observe(toRef.current);
    }

    return () => {
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, [
    containerRef,
    fromRef,
    toRef,
    curvature,
    startXOffset,
    startYOffset,
    endXOffset,
    endYOffset,
  ]);

  // Only render once we have a real path (avoids a flash of a dot at 0,0).
  if (!pathD) return null;

  return (
    <svg
      fill="none"
      width={svgDimensions.width}
      height={svgDimensions.height}
      viewBox={`0 0 ${svgDimensions.width} ${svgDimensions.height}`}
      className={cn(
        "pointer-events-none absolute start-0 top-0 transform-gpu stroke-2",
        className,
      )}
      aria-hidden="true"
    >
      <defs>
        {/* Static base line — the "wire" itself. */}
        <path id={`beam-base-${id}`} d={pathD} />
        {/* A gradient that travels along the path via offsetDistance. */}
        <linearGradient
          id={`beam-gradient-${id}`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={gradientStartColor} stopOpacity="0" />
          <stop offset="50%" stopColor={gradientStartColor} stopOpacity="1" />
          <stop offset="100%" stopColor={gradientStopColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Base wire */}
      <path
        d={pathD}
        stroke={pathColor}
        strokeWidth={pathWidth}
        strokeOpacity={pathOpacity}
        strokeLinecap="round"
      />

      {/* Traveling highlight: a short dashed segment that rides the path. */}
      {!reduceMotion && (
        <motion.path
          d={pathD}
          stroke={`url(#beam-gradient-${id})`}
          strokeWidth={pathWidth + 1}
          strokeLinecap="round"
          strokeDasharray="80 2000"
          initial={{ strokeDashoffset: reverse ? -2080 : 80 }}
          animate={{ strokeDashoffset: reverse ? 80 : -2080 }}
          transition={{
            duration,
            delay,
            ease: "linear",
            repeat: Infinity,
            repeatDelay,
          }}
        />
      )}

      {/* Glowing dot riding the same path. */}
      {!reduceMotion && (
        <motion.circle
          r={2.5}
          fill={gradientStopColor}
          // offsetPath is what makes `offsetDistance` meaningful — a
          // straight line from (0,0) is replaced by the real curve.
          // It's not in Framer Motion's style types, but it is a valid
          // CSS prop and Framer Motion passes unknown style props
          // straight through, so we route it through `style` (cast to
          // CSSProperties) instead of a raw ts-ignore'd JSX prop.
          style={
            {
              filter: `drop-shadow(0 0 6px ${gradientStopColor})`,
              offsetPath: `path("${pathD}")`,
              // Framer Motion's `style` prop is typed as `MotionStyle`,
              // which (with `exactOptionalPropertyTypes: true`) rejects a
              // plain `CSSProperties` object outright — every one of its
              // ~20 optional fields would need an explicit `| undefined`.
              // `offsetPath` isn't part of `MotionStyle` at all, so there's
              // no narrower type to reach for; `any` here is the pragmatic
              // escape hatch, scoped to just this object.
            } as any
          }
          initial={{ offsetDistance: reverse ? "100%" : "0%" }}
          animate={{ offsetDistance: reverse ? "0%" : "100%" }}
          transition={{
            duration,
            delay,
            ease: "linear",
            repeat: Infinity,
            repeatDelay,
          }}
        />
      )}
    </svg>
  );
}