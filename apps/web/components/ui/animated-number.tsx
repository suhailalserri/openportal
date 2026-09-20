"use client";

import * as React from "react";

import { countUpValue } from "@/features/landing/lib/count-up";

/**
 * apps/web/components/ui/animated-number.tsx
 *
 * Phase 3.3. The DOM half of the count-up stats (stats-strip.tsx uses
 * this for "Models available" and the placeholder "Total users"). The
 * math lives in features/landing/lib/count-up.ts (countUpValue,
 * easeOutCubic) and is fully unit-tested without a browser; this
 * component only owns rAF + IntersectionObserver + reduced-motion.
 *
 * SSR / NO-JS FIRST: the real `value` is rendered as plain text on the
 * server (no suspense, no zero-flash) — a search engine or a no-JS
 * visitor sees the true number immediately. `useEffect` then swaps in
 * the animated span only once mounted, in view, and motion is allowed;
 * otherwise the static server-rendered number is simply left alone. The
 * final animation frame is mathematically guaranteed (by countUpValue)
 * to land exactly on `value`, so there is never a mismatch to correct.
 */

interface AnimatedNumberProps {
  /** The real, final number — always rendered as a safe fallback. */
  value: number;
  durationMs?: number;
  className?: string;
  /** e.g. "+" suffix, or a locale-formatted separator wrapper. */
  formatter?: (n: number) => string;
}

const defaultFormatter = (n: number) => n.toLocaleString("en-US");

export function AnimatedNumber({
  value,
  durationMs = 1400,
  className,
  formatter = defaultFormatter,
}: AnimatedNumberProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = React.useState<number>(value);
  const [animate, setAnimate] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setAnimate(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!animate) return;
    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      setDisplay(countUpValue(value, elapsed, durationMs));
      if (elapsed < durationMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {formatter(display)}
    </span>
  );
}
